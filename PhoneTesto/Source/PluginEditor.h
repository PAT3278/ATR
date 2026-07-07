#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"

namespace phonetesto
{

class PhoneTestoAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit PhoneTestoAudioProcessorEditor (PhoneTestoAudioProcessor&);
    ~PhoneTestoAudioProcessorEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    PhoneTestoAudioProcessor& processor;

    juce::Label titleLabel;

    juce::Label deviceLabel;
    juce::ComboBox deviceBox;

    juce::Label mixLabel;
    juce::Slider mixSlider;

    juce::Label outputLabel;
    juce::Slider outputSlider;

    juce::ToggleButton monoButton { "Mono Sum" };
    juce::ToggleButton bypassButton { "Bypass" };

    using SliderAttachment = juce::AudioProcessorValueTreeState::SliderAttachment;
    using ComboBoxAttachment = juce::AudioProcessorValueTreeState::ComboBoxAttachment;
    using ButtonAttachment = juce::AudioProcessorValueTreeState::ButtonAttachment;

    std::unique_ptr<ComboBoxAttachment> deviceAttachment;
    std::unique_ptr<SliderAttachment> mixAttachment;
    std::unique_ptr<SliderAttachment> outputAttachment;
    std::unique_ptr<ButtonAttachment> monoAttachment;
    std::unique_ptr<ButtonAttachment> bypassAttachment;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhoneTestoAudioProcessorEditor)
};

} // namespace phonetesto
