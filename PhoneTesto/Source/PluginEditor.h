#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"
#include "FloatingDeviceView2D.h"
#include "FloatingDeviceView3D.h"

namespace phonetesto
{

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
    void updateDevicePreview();
    void setPreviewMode (bool use3D);

    PhoneTestoAudioProcessor& processor;

    juce::Label titleLabel;

    FloatingDeviceView2D preview2D;
    FloatingDeviceView3D preview3D;
    juce::TextButton view2DButton { "2D" };
    juce::TextButton view3DButton { "3D" };
    bool showing3D = false;
    int lastPreviewDeviceIndex = -1;

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
