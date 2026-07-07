#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace phonetesto
{

PhoneTestoAudioProcessor::PhoneTestoAudioProcessor()
    : AudioProcessor (BusesProperties()
                           .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                           .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "PARAMETERS", createParameterLayout())
{
}

PhoneTestoAudioProcessor::~PhoneTestoAudioProcessor() = default;

juce::AudioProcessorValueTreeState::ParameterLayout PhoneTestoAudioProcessor::createParameterLayout()
{
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

    params.push_back (std::make_unique<juce::AudioParameterChoice> (
        juce::ParameterID { deviceParamId, 1 }, "Device", getSpeakerNames(), 0));

    params.push_back (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { mixParamId, 1 }, "Mix",
        juce::NormalisableRange<float> (0.0f, 100.0f), 100.0f, "%"));

    params.push_back (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { outputParamId, 1 }, "Output",
        juce::NormalisableRange<float> (-24.0f, 24.0f), 0.0f, "dB"));

    params.push_back (std::make_unique<juce::AudioParameterBool> (
        juce::ParameterID { monoParamId, 1 }, "Mono Sum", false));

    params.push_back (std::make_unique<juce::AudioParameterBool> (
        juce::ParameterID { bypassParamId, 1 }, "Bypass", false));

    return { params.begin(), params.end() };
}

void PhoneTestoAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;

    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = (juce::uint32) samplesPerBlock;
    spec.numChannels = (juce::uint32) getTotalNumOutputChannels();

    chain.highpass1.prepare (spec);
    chain.highpass2.prepare (spec);
    chain.peak.prepare (spec);
    chain.lowpass.prepare (spec);
    chain.driveGain.prepare (spec);
    chain.waveshaper.prepare (spec);
    chain.makeupGain.prepare (spec);

    dryBuffer.setSize (getTotalNumOutputChannels(), samplesPerBlock);

    cachedDeviceIndex = -1;
    cachedDrive = -1.0f;
    updateFilters();
}

void PhoneTestoAudioProcessor::releaseResources()
{
}

bool PhoneTestoAudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto& mainIn = layouts.getMainInputChannelSet();
    const auto& mainOut = layouts.getMainOutputChannelSet();

    if (mainOut != juce::AudioChannelSet::mono() && mainOut != juce::AudioChannelSet::stereo())
        return false;

    return mainIn == mainOut;
}

void PhoneTestoAudioProcessor::updateFilters()
{
    const int deviceIndex = (int) apvts.getRawParameterValue (deviceParamId)->load();
    const auto& profiles = getSpeakerProfiles();
    const auto& profile = profiles[(size_t) juce::jlimit (0, (int) profiles.size() - 1, deviceIndex)];

    if (deviceIndex == cachedDeviceIndex)
        return;

    cachedDeviceIndex = deviceIndex;

    const auto sr = currentSampleRate;

    *chain.highpass1.state = *juce::dsp::IIR::Coefficients<float>::makeHighPass (sr, profile.highpassHz, 0.7071f);
    *chain.highpass2.state = *juce::dsp::IIR::Coefficients<float>::makeHighPass (sr, profile.highpassHz, 0.7071f);
    *chain.peak.state = *juce::dsp::IIR::Coefficients<float>::makePeakFilter (
        sr, profile.peakHz, profile.peakQ, juce::Decibels::decibelsToGain (profile.peakGainDb));
    *chain.lowpass.state = *juce::dsp::IIR::Coefficients<float>::makeLowPass (sr, profile.lowpassHz, 0.7071f);

    const float driveGainDb = juce::jmap (profile.driveAmount, 0.0f, 1.0f, 0.0f, 18.0f);
    chain.driveGain.setGainDecibels (driveGainDb);
    chain.makeupGain.setGainDecibels (profile.makeupGainDb);

    cachedDrive = profile.driveAmount;
}

void PhoneTestoAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;

    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    for (auto i = getTotalNumInputChannels(); i < numChannels; ++i)
        buffer.clear (i, 0, numSamples);

    const bool bypassed = apvts.getRawParameterValue (bypassParamId)->load() > 0.5f;

    updateFilters();

    dryBuffer.makeCopyOf (buffer, true);

    if (! bypassed)
    {
        if (apvts.getRawParameterValue (monoParamId)->load() > 0.5f && numChannels > 1)
        {
            for (int s = 0; s < numSamples; ++s)
            {
                float sum = 0.0f;
                for (int ch = 0; ch < numChannels; ++ch)
                    sum += buffer.getSample (ch, s);
                sum /= (float) numChannels;

                for (int ch = 0; ch < numChannels; ++ch)
                    buffer.setSample (ch, s, sum);
            }
        }

        juce::dsp::AudioBlock<float> block (buffer);
        juce::dsp::ProcessContextReplacing<float> context (block);

        chain.highpass1.process (context);
        chain.highpass2.process (context);
        chain.peak.process (context);
        chain.lowpass.process (context);
        chain.driveGain.process (context);
        chain.waveshaper.process (context);
        chain.makeupGain.process (context);
    }

    const float mix = apvts.getRawParameterValue (mixParamId)->load() / 100.0f;
    const float outputGainDb = apvts.getRawParameterValue (outputParamId)->load();
    const float outputGain = juce::Decibels::decibelsToGain (outputGainDb);

    if (! bypassed && mix < 1.0f)
    {
        for (int ch = 0; ch < numChannels; ++ch)
        {
            auto* wet = buffer.getWritePointer (ch);
            auto* dry = dryBuffer.getReadPointer (ch);

            for (int s = 0; s < numSamples; ++s)
                wet[s] = wet[s] * mix + dry[s] * (1.0f - mix);
        }
    }

    buffer.applyGain (outputGain);
}

juce::AudioProcessorEditor* PhoneTestoAudioProcessor::createEditor()
{
    return new PhoneTestoAudioProcessorEditor (*this);
}

void PhoneTestoAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    if (auto state = apvts.copyState(); true)
    {
        std::unique_ptr<juce::XmlElement> xml (state.createXml());
        copyXmlToBinary (*xml, destData);
    }
}

void PhoneTestoAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xml (getXmlFromBinary (data, sizeInBytes));

    if (xml != nullptr && xml->hasTagName (apvts.state.getType()))
        apvts.replaceState (juce::ValueTree::fromXml (*xml));
}

} // namespace phonetesto

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new phonetesto::PhoneTestoAudioProcessor();
}
