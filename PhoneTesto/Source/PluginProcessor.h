#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>

#include "SpeakerProfiles.h"
#include "LiveMonitorServer.h"

namespace phonetesto
{

/** PhoneTesto emulates the frequency response and drive character of small
    phone/laptop speakers so a mix can be monitored on studio speakers or
    headphones without bouncing audio to a physical device each time -- or
    streams the mix to real phones (Live Monitor).

    Every model is loudness-matched (K-weighted) to the input, so switching
    models or A/B-ing against bypass compares tone, not level. All changes
    -- model, bypass, mono, mix, output, Live -- are crossfaded or smoothed,
    so they can be switched or automated mid-playback without clicks. */
class PhoneTestoAudioProcessor : public juce::AudioProcessor
{
public:
    PhoneTestoAudioProcessor();
    ~PhoneTestoAudioProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;

    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock; // the double-precision one stays JUCE's default

    /** Our BYPASS is a latency-compensated, crossfaded, fully transparent
        bypass, so hosts use it instead of hard-switching the plugin out. */
    juce::AudioProcessorParameter* getBypassParameter() const override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return JucePlugin_Name; }

    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return "Default"; } // VST3 validator requires a name
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    juce::AudioProcessorValueTreeState apvts;

    static constexpr const char* deviceParamId  = "device";
    static constexpr const char* mixParamId     = "mix";
    static constexpr const char* outputParamId  = "output";
    static constexpr const char* monoParamId    = "monoSum";
    static constexpr const char* bypassParamId  = "bypass";

    static constexpr int defaultLiveMonitorPort = 51813;

    // --- What the plugin is for --------------------------------------------
    // Live (the main use): the mix plays on the user's own phones over the
    // network (see LiveMonitorServer) -- phones get it as it is and the host
    // hears it untouched; no emulation. Emulate (a bonus): a speaker's sound
    // is emulated on the host's output. Not a host parameter (switching
    // network listening isn't something to automate); saved with the project.
    // A new instance starts in Live; a project saved before modes existed
    // opens in emulation, as it was.
    void setLiveMode (bool shouldBeLive) noexcept { liveMode = shouldBeLive; }
    bool isLiveMode() const noexcept { return liveMode.load(); }

    // The server runs once the editor has started it (it does on opening in
    // Live); starting it puts the plugin in Live. It isn't started with the
    // project, so loading one never opens a network port by itself. The
    // optional password is saved with the project.
    bool startLiveMonitor (int port = defaultLiveMonitorPort);
    void stopLiveMonitor();
    bool isLiveMonitorRunning() const noexcept { return liveMonitorActive.load(); }
    int getLiveMonitorPort() const noexcept { return liveServer.getPort(); }
    int getLiveListenerCount() const { return liveServer.getNumListeners(); }
    juce::StringArray getLiveListenerAddresses() const { return liveServer.getListenerAddresses(); }

    /** The URL a phone should open (this machine's most likely Wi-Fi
        address, with the access code), as encoded in the QR code. Empty
        when Live Monitor is off. */
    juce::String getLiveMonitorUrl() const;

    /** The user's own password; empty if none. Thread-safe: the editor sets
        it on the message thread while hosts may save state from any thread. */
    void setLivePassword (const juce::String&);
    juce::String getLivePassword() const;

    /** What phones must present: the user's password if set, otherwise a
        random code made when the plugin loads. Live is never open to
        everyone on the network -- on shared Wi-Fi that would mean anyone
        could listen to an unreleased mix. */
    juce::String getLiveAccessCode() const;
    juce::String getAutoAccessCode() const { return autoAccessCode; }

    /** Editor window scale, remembered with the project. */
    void setEditorScale (float scale) noexcept { editorScale = scale; }
    float getEditorScale() const noexcept { return editorScale.load(); }

    /** Most recent output block's RMS / peak per side (0 = L, 1 = R), for the meter. */
    float getOutputRms (int side) const noexcept  { return meterRms[side & 1].load (std::memory_order_relaxed); }
    float getOutputPeak (int side) const noexcept { return meterPeak[side & 1].load (std::memory_order_relaxed); }

    /** The room in the editor: while the user moves between speakers, the two
        either side of `position` (0 = first model .. numModels - 1) are blended
        by where it is, so the sound follows the camera. Lock-free; call from any
        thread. endMorph() glides to the Model parameter and carries on with that
        model alone; a model change from the host is ignored until then. */
    void setMorphPosition (float position) noexcept { morphRequest.store (juce::jmax (0.0f, position), std::memory_order_relaxed); }
    void endMorph() noexcept { morphRequest.store (-1.0f, std::memory_order_relaxed); }
    bool isMorphing() const noexcept { return morphActive.load (std::memory_order_relaxed); }

    /** Most recent input block's peak (both sides), for the studio monitors in the editor. */
    float getInputPeak() const noexcept { return inputPeak.load (std::memory_order_relaxed); }

    /** The last numSamples of the output, summed to mono, for the editor's spectrum.
        Lock-free and approximate: a block being written may tear, which a picture can afford. */
    static constexpr int scopeSize = 4096;
    void copyScope (float* dest, int numSamples) const noexcept;

private:
    static constexpr const char* livePasswordProperty = "livePassword";
    static constexpr const char* editorScaleProperty = "editorScale";
    static constexpr const char* oldEditorSkinProperty = "editorSkin"; // from versions with several skins
    static constexpr const char* modeProperty = "mode";

    juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
    void processSubBlock (juce::AudioBuffer<float>& buffer, int start, int numSamples);
    void startModelCrossfade (int profileIndex);
    void processModel (int numSamples);
    void beginMorph();
    void processMorph (int numSamples, float request, int wanted);
    void processMorphSegment (int start, int length, float fromPosition, float toPosition);
    void holdModels (int lo, int hi);

    using Coefficients = juce::dsp::IIR::Coefficients<float>;
    using FilterDuplicator = juce::dsp::ProcessorDuplicator<juce::dsp::IIR::Filter<float>, Coefficients>;

    /** Precomputed per sample rate, so switching models on the audio thread
        is a plain copy of coefficient values (no allocation). */
    struct ProfileSettings
    {
        Coefficients::Ptr highpass, peak, lowpass;
        float drive = 1.0f;   // linear pre-gain into the saturator
        float makeup = 1.0f;  // linear post-gain (loudness match)
    };

    /** One complete speaker emulation. Two exist so a model change can
        crossfade from the old to the new instead of switching abruptly. */
    struct SpeakerChain
    {
        FilterDuplicator highpass1, highpass2, peak, lowpass;
        std::unique_ptr<juce::dsp::Oversampling<float>> oversampling;
        float drive = 1.0f, makeup = 1.0f;
        int profile = -1;

        void prepare (const juce::dsp::ProcessSpec&);
        void reset();
        void load (const ProfileSettings&, int profileIndex);
        void process (juce::dsp::AudioBlock<float>);
    };

    std::vector<ProfileSettings> profileSettings;
    SpeakerChain chains[2];
    int activeChain = 0;
    bool crossfading = false;
    int warmupRemaining = 0;
    float crossfadePosition = 0.0f, crossfadeStep = 0.0f;

    std::atomic<float> morphRequest { -1.0f }; // a position while the user moves, -1 when they've let go
    std::atomic<bool> morphActive { false };
    bool morphing = false;
    float morphPosition = 0.0f;
    int morphWarmupRemaining = 0;

    juce::SmoothedValue<float> mixAmount, outputGain, monoAmount, liveAmount, engageAmount;
    juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::None> dryDelay { 1024 };
    juce::AudioBuffer<float> dryScratch, wetScratch, fadeScratch;
    int maxBlockSize = 512;

    LiveMonitorServer liveServer;
    std::atomic<bool> liveMonitorActive { false };
    std::atomic<bool> liveMode { true };
    std::atomic<float> meterRms[2] { 0.0f, 0.0f }, meterPeak[2] { 0.0f, 0.0f }, inputPeak { 0.0f };
    std::array<float, scopeSize> scope {};
    std::atomic<int> scopeWrite { 0 };
    double currentSampleRate = 44100.0;

    mutable juce::CriticalSection passwordLock;
    juce::String livePassword;
    const juce::String autoAccessCode;
    std::atomic<float> editorScale { 1.0f };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhoneTestoAudioProcessor)
};

} // namespace phonetesto
