#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"
#include "PhoneUILookAndFeel.h"
#include "QrCodeComponent.h"

namespace phonetesto
{

/** The whole plugin window is drawn as a phone body (so the metaphor reads
    at a glance instead of relying on a small preview widget), styled like a
    boutique studio-plugin instrument panel: dark glass/metal body, glowing
    accent-tinted edges, recessed metal controls. The Output control is an
    iOS-volume-HUD-style vertical bar on the left of the screen (matching
    the real hardware buttons' side); Mix is a mixer-style vertical fader
    embedded in the screen. */
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
    void updateLiveStatusText();
    void updateLiveModeVisibility();

    PhoneTestoAudioProcessor& processor;

    juce::Label titleLabel;

    juce::ComboBox deviceBox;
    juce::Label presetCaptionLabel;
    juce::Label mixValueLabel;
    juce::Slider mixSlider;
    juce::Slider outputHudSlider;
    juce::Label outputCaptionLabel;
    juce::ToggleButton monoButton { "Mono Sum" };
    juce::ToggleButton bypassButton { "Bypass" };

    // Live Monitor: streams audio to a real phone over Wi-Fi instead of
    // emulating one with DSP. Not an apvts parameter/attachment -- starting
    // a network listener is a deliberate user action, not something a host
    // should automate -- so this talks to the processor directly.
    juce::ToggleButton liveButton { "Live" };
    juce::Label liveStatusLabel;
    QrCodeComponent qrCode;
    juce::TextEditor passwordEditor;
    juce::Label passwordCaptionLabel;
    juce::String cachedLiveUrl; // local IP/port only re-queried when Live is toggled, not every timer tick
    bool liveStartFailed = false;

    MixSliderLookAndFeel mixLnf;
    VolumeHudLookAndFeel volumeLnf;
    LabToggleLookAndFeel toggleLnf;
    PresetBoxLookAndFeel presetLnf;

    juce::Rectangle<float> phoneBodyBounds, screenBounds;
    juce::Colour accentColour { 0xff2d3a4a };
    PhoneChromeStyle currentChrome = PhoneChromeStyle::notchNarrow;
    int lastDeviceIndex = -1;
    double glowPhase = 0.0; // drives the slow pulsing neon glow

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
