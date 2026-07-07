#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"
#include "PhoneUILookAndFeel.h"

namespace phonetesto
{

/** The whole plugin window is drawn as a phone body (so the metaphor reads
    at a glance instead of relying on a small preview widget). The Output
    control is an iOS-volume-HUD-style vertical bar floating over the top
    right of the "screen"; the Mix control is a flat slider embedded
    directly in the "screen" area. */
class PhoneTestoAudioProcessorEditor : public juce::AudioProcessorEditor,
                                        private juce::Timer
{
public:
    explicit PhoneTestoAudioProcessorEditor (PhoneTestoAudioProcessor&);
    ~PhoneTestoAudioProcessorEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    void updateDeviceVisuals();

    PhoneTestoAudioProcessor& processor;

    juce::Label titleLabel;

    juce::ComboBox deviceBox;
    juce::Label mixValueLabel;
    juce::Slider mixSlider;
    juce::Slider outputHudSlider;
    juce::ToggleButton monoButton { "Mono Sum" };
    juce::ToggleButton bypassButton { "Bypass" };

    MixSliderLookAndFeel mixLnf;
    VolumeHudLookAndFeel volumeLnf;

    juce::Rectangle<float> phoneBodyBounds, screenBounds;
    juce::Colour accentColour { 0xff2d3a4a };
    int lastDeviceIndex = -1;

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
