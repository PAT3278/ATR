#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>

#include "SpeakerProfiles.h"
#include "LiveMonitorServer.h"

namespace phonetesto
{

/** PhoneTesto emulates the frequency response and drive character of small
    phone/laptop speakers so a mix can be monitored on studio speakers or
    headphones without bouncing audio to a physical device each time. */
class PhoneTestoAudioProcessor : public juce::AudioProcessor
{
public:
    PhoneTestoAudioProcessor();
    ~PhoneTestoAudioProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;

    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

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
    const juce::String getProgramName (int) override { return {}; }
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

    // --- Live Monitor: stream audio to real phones over the network ----
    // instead of emulating one with DSP (see LiveMonitorServer). Driven
    // directly by the editor's toggle rather than an apvts parameter --
    // opening a network listener isn't something a host should be able to
    // automate -- so its on/off state isn't restored with the project: the
    // server always starts off and the user switches it on deliberately.
    // The optional password *is* saved with the project.
    bool startLiveMonitor (int port = defaultLiveMonitorPort);
    void stopLiveMonitor();
    bool isLiveMonitorRunning() const noexcept { return liveMonitorActive.load(); }
    int getLiveMonitorPort() const noexcept { return liveServer.getPort(); }
    int getLiveListenerCount() const { return liveServer.getNumListeners(); }
    juce::StringArray getLiveListenerAddresses() const { return liveServer.getListenerAddresses(); }

    /** The URL a phone should open, using this machine's most likely Wi-Fi
        address. Empty when Live Monitor is off. */
    juce::String getLiveMonitorUrl() const;

    void setLivePassword (const juce::String&);
    juce::String getLivePassword() const;

    /** Most recent output block's RMS / peak per side (0 = L, 1 = R), for the meter. */
    float getOutputRms (int side) const noexcept  { return meterRms[side & 1].load (std::memory_order_relaxed); }
    float getOutputPeak (int side) const noexcept { return meterPeak[side & 1].load (std::memory_order_relaxed); }

private:
    static constexpr const char* livePasswordProperty = "livePassword";

    juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
    void updateFilters();

    using FilterDuplicator = juce::dsp::ProcessorDuplicator<juce::dsp::IIR::Filter<float>,
                                                             juce::dsp::IIR::Coefficients<float>>;

    struct SpeakerChain
    {
        FilterDuplicator highpass1, highpass2;
        FilterDuplicator peak;
        FilterDuplicator lowpass;
        juce::dsp::Gain<float> driveGain;
        juce::dsp::WaveShaper<float> waveshaper { [] (float x) { return std::tanh (x); } };
        juce::dsp::Gain<float> makeupGain;
    };

    SpeakerChain chain;

    LiveMonitorServer liveServer;
    std::atomic<bool> liveMonitorActive { false };
    std::atomic<float> meterRms[2] { 0.0f, 0.0f }, meterPeak[2] { 0.0f, 0.0f };

    juce::AudioBuffer<float> dryBuffer;
    double currentSampleRate = 44100.0;

    int cachedDeviceIndex = -1;
    float cachedDrive = -1.0f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhoneTestoAudioProcessor)
};

} // namespace phonetesto
