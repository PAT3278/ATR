#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>

#include "SpeakerProfiles.h"

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

private:
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

    juce::AudioBuffer<float> dryBuffer;
    double currentSampleRate = 44100.0;

    int cachedDeviceIndex = -1;
    float cachedDrive = -1.0f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhoneTestoAudioProcessor)
};

} // namespace phonetesto
