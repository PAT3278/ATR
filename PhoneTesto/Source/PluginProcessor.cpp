#include "PluginProcessor.h"
#include "PluginEditor.h"

#include <cstring>
#include <random>

namespace phonetesto
{

namespace
{
    constexpr float maxDriveDb = 18.0f;
    constexpr double modelWarmupSeconds = 0.03;    // new chain runs unheard first, so its filters' start-up transient has died away
    constexpr double modelCrossfadeSeconds = 0.04;
    constexpr double switchRampSeconds = 0.03;  // bypass, mono, Live
    constexpr double knobRampSeconds = 0.05;    // mix, output

    /** Copies a precomputed filter's coefficients into a running filter.
        Same-order filters copy values in place (no allocation, safe on the
        audio thread); only the very first load in prepareToPlay, when the
        running filter still holds JUCE's default, reallocates. */
    template <typename Duplicator, typename CoeffPtr>
    void loadCoefficients (Duplicator& filter, const CoeffPtr& source)
    {
        auto& dst = filter.state->coefficients;
        const auto& src = source->coefficients;

        if (dst.size() == src.size())
            std::copy (src.begin(), src.end(), dst.begin());
        else
            *filter.state = *source;
    }

    /** 8 characters from an alphabet without look-alikes (0/o, 1/l/i), from
        the OS's random source: ~40 bits, which with the server's lockout
        after 10 wrong guesses a minute can't practically be guessed. */
    juce::String makeAccessCode()
    {
        static constexpr const char* alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
        std::random_device rd;
        std::uniform_int_distribution<int> pick (0, (int) std::strlen (alphabet) - 1);
        juce::String code;
        for (int i = 0; i < 8; ++i)
            code += alphabet[pick (rd)];
        return code;
    }
} // namespace

PhoneTestoAudioProcessor::PhoneTestoAudioProcessor()
    : AudioProcessor (BusesProperties()
                           .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                           .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "PARAMETERS", createParameterLayout()),
      autoAccessCode (makeAccessCode())
{
    liveServer.setPassword (getLiveAccessCode());

    // Report the oversampler's latency from the start (it doesn't depend on
    // the sample rate): some hosts only read latency when the plugin loads.
    juce::dsp::Oversampling<float> probe (2, 1, juce::dsp::Oversampling<float>::filterHalfBandPolyphaseIIR, true, true);
    probe.initProcessing (64); // integer-latency compensation is only computed here
    setLatencySamples (juce::roundToInt (probe.getLatencyInSamples()));
}

PhoneTestoAudioProcessor::~PhoneTestoAudioProcessor() = default;

juce::AudioProcessorValueTreeState::ParameterLayout PhoneTestoAudioProcessor::createParameterLayout()
{
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

    params.push_back (std::make_unique<juce::AudioParameterChoice> (
        juce::ParameterID { deviceParamId, 1 }, "Model", getSpeakerNames(), 0));

    params.push_back (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { mixParamId, 1 }, "Mix",
        juce::NormalisableRange<float> (0.0f, 100.0f), 100.0f, "%"));

    // 100% = unity. Every model is loudness-matched, so the default leaves
    // the level exactly where it was without the plugin.
    params.push_back (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { outputParamId, 1 }, "Output",
        juce::NormalisableRange<float> (0.0f, 100.0f), 100.0f, "%"));

    params.push_back (std::make_unique<juce::AudioParameterBool> (
        juce::ParameterID { monoParamId, 1 }, "Mono Sum", false));

    params.push_back (std::make_unique<juce::AudioParameterBool> (
        juce::ParameterID { bypassParamId, 1 }, "Bypass", false));

    return { params.begin(), params.end() };
}

juce::AudioProcessorParameter* PhoneTestoAudioProcessor::getBypassParameter() const
{
    return apvts.getParameter (bypassParamId);
}

//==============================================================================
void PhoneTestoAudioProcessor::SpeakerChain::prepare (const juce::dsp::ProcessSpec& spec)
{
    for (auto* f : { &highpass1, &highpass2, &peak, &lowpass })
        f->prepare (spec);

    // 2x oversampling around the saturator keeps its harmonics from folding
    // back as inharmonic aliasing; integer latency so the dry path can be
    // aligned exactly.
    oversampling = std::make_unique<juce::dsp::Oversampling<float>> (
        spec.numChannels, 1, juce::dsp::Oversampling<float>::filterHalfBandPolyphaseIIR, true, true);
    oversampling->initProcessing (spec.maximumBlockSize);
}

void PhoneTestoAudioProcessor::SpeakerChain::reset()
{
    for (auto* f : { &highpass1, &highpass2, &peak, &lowpass })
        f->reset();

    oversampling->reset();
}

void PhoneTestoAudioProcessor::SpeakerChain::load (const ProfileSettings& s, int profileIndex)
{
    loadCoefficients (highpass1, s.highpass);
    loadCoefficients (highpass2, s.highpass);
    loadCoefficients (peak, s.peak);
    loadCoefficients (lowpass, s.lowpass);
    drive = s.drive;
    makeup = s.makeup;
    profile = profileIndex;
}

void PhoneTestoAudioProcessor::SpeakerChain::process (juce::dsp::AudioBlock<float> block)
{
    juce::dsp::ProcessContextReplacing<float> context (block);
    highpass1.process (context);
    highpass2.process (context);
    peak.process (context);
    lowpass.process (context);

    // Saturator normalised to unity gain for small signals, so drive adds
    // compression/breakup on peaks without changing the overall level.
    auto up = oversampling->processSamplesUp (block);
    const float g = drive, inverse = 1.0f / drive;

    for (size_t ch = 0; ch < up.getNumChannels(); ++ch)
    {
        auto* d = up.getChannelPointer (ch);
        for (size_t i = 0; i < up.getNumSamples(); ++i)
            d[i] = std::tanh (g * d[i]) * inverse;
    }

    oversampling->processSamplesDown (block);
    block.multiplyBy (makeup);
}

//==============================================================================
void PhoneTestoAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;
    maxBlockSize = juce::jmax (1, samplesPerBlock);

    // Everything internal runs in stereo; a mono bus is fed to both sides.
    const juce::dsp::ProcessSpec spec { sampleRate, (juce::uint32) maxBlockSize, 2 };

    profileSettings.clear();
    for (const auto& p : getSpeakerProfiles())
    {
        ProfileSettings s;
        s.highpass = Coefficients::makeHighPass (sampleRate, p.highpassHz, 0.7071f);
        s.peak = Coefficients::makePeakFilter (sampleRate, p.peakHz, p.peakQ, juce::Decibels::decibelsToGain (p.peakGainDb));
        s.lowpass = Coefficients::makeLowPass (sampleRate, juce::jmin (p.lowpassHz, (float) sampleRate * 0.45f), 0.7071f);
        s.drive = juce::Decibels::decibelsToGain (juce::jmap (p.driveAmount, 0.0f, 1.0f, 0.0f, maxDriveDb));
        s.makeup = juce::Decibels::decibelsToGain (p.makeupGainDb);
        profileSettings.push_back (s);
    }

    const int current = juce::jlimit (0, (int) profileSettings.size() - 1,
                                      juce::roundToInt (apvts.getRawParameterValue (deviceParamId)->load()));

    for (auto& chain : chains)
    {
        chain.prepare (spec);
        chain.load (profileSettings[(size_t) current], current);
        chain.reset();
    }

    activeChain = 0;
    crossfading = false;

    const int latency = juce::roundToInt (chains[0].oversampling->getLatencyInSamples());
    setLatencySamples (latency);
    dryDelay.prepare (spec);
    dryDelay.setDelay ((float) latency);

    for (auto* b : { &dryScratch, &wetScratch, &fadeScratch })
        b->setSize (2, maxBlockSize, false, true, false);

    auto resetSmoother = [sampleRate] (juce::SmoothedValue<float>& s, double seconds, float value)
    {
        s.reset (sampleRate, seconds);
        s.setCurrentAndTargetValue (value);
    };

    resetSmoother (mixAmount, knobRampSeconds, apvts.getRawParameterValue (mixParamId)->load() / 100.0f);
    resetSmoother (outputGain, knobRampSeconds, apvts.getRawParameterValue (outputParamId)->load() / 100.0f);
    resetSmoother (monoAmount, switchRampSeconds, apvts.getRawParameterValue (monoParamId)->load() > 0.5f ? 1.0f : 0.0f);
    resetSmoother (liveAmount, switchRampSeconds, liveMonitorActive.load() ? 1.0f : 0.0f);
    resetSmoother (engageAmount, switchRampSeconds, apvts.getRawParameterValue (bypassParamId)->load() > 0.5f ? 0.0f : 1.0f);

    // The stream to phones is always 48 kHz, so a host rate change only needs
    // the listeners' resamplers to pick up the new input rate -- nobody gets
    // disconnected.
    liveServer.setInputSampleRate (sampleRate);
}

void PhoneTestoAudioProcessor::releaseResources()
{
    // Deliberately leaves Live Monitor running: some hosts call this on
    // transport/engine changes, and phones shouldn't be dropped for that.
}

bool PhoneTestoAudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto& mainIn = layouts.getMainInputChannelSet();
    const auto& mainOut = layouts.getMainOutputChannelSet();

    if (mainOut != juce::AudioChannelSet::mono() && mainOut != juce::AudioChannelSet::stereo())
        return false;

    return mainIn == mainOut;
}

void PhoneTestoAudioProcessor::startModelCrossfade (int profileIndex)
{
    const int other = 1 - activeChain;
    chains[other].load (profileSettings[(size_t) profileIndex], profileIndex);
    chains[other].reset();
    crossfading = true;
    warmupRemaining = juce::roundToInt (modelWarmupSeconds * currentSampleRate);
    crossfadePosition = 0.0f;
    crossfadeStep = (float) (1.0 / (modelCrossfadeSeconds * currentSampleRate));
}

void PhoneTestoAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;

    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    for (auto i = getTotalNumInputChannels(); i < numChannels; ++i)
        buffer.clear (i, 0, numSamples);

    if (numChannels == 0 || profileSettings.empty())
        return;

    // Hosts may send more samples than prepareToPlay promised; work in
    // prepared-size pieces so nothing ever has to allocate here.
    for (int start = 0; start < numSamples; start += maxBlockSize)
        processSubBlock (buffer, start, juce::jmin (maxBlockSize, numSamples - start));

    for (int side = 0; side < 2; ++side)
    {
        const int ch = juce::jmin (side, numChannels - 1); // mono feeds both sides
        meterRms[side].store (buffer.getRMSLevel (ch, 0, numSamples), std::memory_order_relaxed);
        meterPeak[side].store (buffer.getMagnitude (ch, 0, numSamples), std::memory_order_relaxed);
    }

    // Not while the host renders offline (an export runs faster than real
    // time; phones would get it in garbled bursts).
    if (liveMonitorActive.load() && ! isNonRealtime())
        liveServer.pushAudio (buffer);
}

void PhoneTestoAudioProcessor::processSubBlock (juce::AudioBuffer<float>& buffer, int start, int n)
{
    const int numChannels = buffer.getNumChannels();
    auto* outL = buffer.getWritePointer (0, start);
    auto* outR = numChannels > 1 ? buffer.getWritePointer (1, start) : nullptr;

    mixAmount.setTargetValue (apvts.getRawParameterValue (mixParamId)->load() / 100.0f);
    outputGain.setTargetValue (apvts.getRawParameterValue (outputParamId)->load() / 100.0f);
    monoAmount.setTargetValue (apvts.getRawParameterValue (monoParamId)->load() > 0.5f ? 1.0f : 0.0f);
    liveAmount.setTargetValue (liveMonitorActive.load() ? 1.0f : 0.0f);
    engageAmount.setTargetValue (apvts.getRawParameterValue (bypassParamId)->load() > 0.5f ? 0.0f : 1.0f);

    const int wanted = juce::jlimit (0, (int) profileSettings.size() - 1,
                                     juce::roundToInt (apvts.getRawParameterValue (deviceParamId)->load()));
    if (! crossfading && wanted != chains[activeChain].profile)
        startModelCrossfade (wanted);

    // Latency-aligned dry signal, and the (optionally mono-summed) feed for
    // the speaker emulation.
    auto* dryL = dryScratch.getWritePointer (0);
    auto* dryR = dryScratch.getWritePointer (1);
    auto* wetL = wetScratch.getWritePointer (0);
    auto* wetR = wetScratch.getWritePointer (1);

    for (int i = 0; i < n; ++i)
    {
        const float l = outL[i];
        const float r = outR != nullptr ? outR[i] : l;

        dryDelay.pushSample (0, l);
        dryDelay.pushSample (1, r);
        dryL[i] = dryDelay.popSample (0);
        dryR[i] = dryDelay.popSample (1);

        const float mono = monoAmount.getNextValue();
        const float mid = 0.5f * (l + r);
        wetL[i] = l + mono * (mid - l);
        wetR[i] = r + mono * (mid - r);
    }

    if (crossfading)
        for (int ch = 0; ch < 2; ++ch)
            fadeScratch.copyFrom (ch, 0, wetScratch, ch, 0, n);

    chains[activeChain].process (juce::dsp::AudioBlock<float> (wetScratch).getSubBlock (0, (size_t) n));

    if (crossfading)
    {
        const int other = 1 - activeChain;
        chains[other].process (juce::dsp::AudioBlock<float> (fadeScratch).getSubBlock (0, (size_t) n));

        const auto* newL = fadeScratch.getReadPointer (0);
        const auto* newR = fadeScratch.getReadPointer (1);

        for (int i = 0; i < n; ++i)
        {
            if (warmupRemaining > 0)
            {
                --warmupRemaining;
                continue;
            }

            const float f = juce::jmin (1.0f, crossfadePosition);
            wetL[i] += f * (newL[i] - wetL[i]);
            wetR[i] += f * (newR[i] - wetR[i]);
            crossfadePosition += crossfadeStep;
        }

        if (crossfadePosition >= 1.0f)
        {
            activeChain = other;
            crossfading = false;
        }
    }

    // emulation -> mix with dry -> (Live: dry) -> output level -> bypass
    for (int i = 0; i < n; ++i)
    {
        const float mix = mixAmount.getNextValue();
        const float live = liveAmount.getNextValue();
        const float gain = outputGain.getNextValue();
        const float engage = engageAmount.getNextValue();

        auto stage = [&] (float dry, float wet)
        {
            const float emulated = dry + mix * (wet - dry);
            const float active = (emulated + live * (dry - emulated)) * gain;
            return dry + engage * (active - dry);
        };

        outL[i] = stage (dryL[i], wetL[i]);
        if (outR != nullptr)
            outR[i] = stage (dryR[i], wetR[i]);
    }
}

//==============================================================================
bool PhoneTestoAudioProcessor::startLiveMonitor (int port)
{
    liveServer.setPassword (getLiveAccessCode());
    const bool ok = liveServer.start (port, currentSampleRate);
    liveMonitorActive = ok;
    return ok;
}

void PhoneTestoAudioProcessor::stopLiveMonitor()
{
    liveMonitorActive = false;
    liveServer.stop();
}

juce::String PhoneTestoAudioProcessor::getLiveMonitorUrl() const
{
    if (! isLiveMonitorRunning())
        return {};

    const auto addresses = LiveMonitorServer::getLocalAddresses();
    const auto host = addresses.isEmpty() ? juce::String ("localhost") : addresses[0];
    return "http://" + host + ":" + juce::String (liveServer.getPort()) + "/?k="
           + juce::URL::addEscapeChars (getLiveAccessCode(), true);
}

juce::String PhoneTestoAudioProcessor::getLiveAccessCode() const
{
    const auto password = getLivePassword();
    return password.isNotEmpty() ? password : autoAccessCode;
}

void PhoneTestoAudioProcessor::setLivePassword (const juce::String& newPassword)
{
    {
        const juce::ScopedLock sl (passwordLock);
        livePassword = newPassword;
    }
    liveServer.setPassword (getLiveAccessCode());
}

juce::String PhoneTestoAudioProcessor::getLivePassword() const
{
    const juce::ScopedLock sl (passwordLock);
    return livePassword;
}

juce::AudioProcessorEditor* PhoneTestoAudioProcessor::createEditor()
{
    return new PhoneTestoAudioProcessorEditor (*this);
}

void PhoneTestoAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    state.setProperty (livePasswordProperty, getLivePassword(), nullptr);
    state.setProperty (editorScaleProperty, editorScale.load(), nullptr);

    if (auto xml = state.createXml())
        copyXmlToBinary (*xml, destData);
}

void PhoneTestoAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xml (getXmlFromBinary (data, sizeInBytes));

    if (xml == nullptr || ! xml->hasTagName (apvts.state.getType()))
        return;

    auto tree = juce::ValueTree::fromXml (*xml);
    const auto password = tree.getProperty (livePasswordProperty).toString();
    const auto scale = (float) tree.getProperty (editorScaleProperty, 1.0f);
    tree.removeProperty (livePasswordProperty, nullptr);
    tree.removeProperty (editorScaleProperty, nullptr);

    apvts.replaceState (tree);
    setLivePassword (password);
    editorScale = juce::jlimit (0.5f, 2.0f, scale);
}

} // namespace phonetesto

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new phonetesto::PhoneTestoAudioProcessor();
}
