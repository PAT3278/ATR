#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"
#include "HardwareStyle.h"
#include "LevelMeter.h"
#include "DisplayWindow.h"

namespace phonetesto
{

/** Modern flat hardware panel: a large display (speaker response curve, or
    the Live QR code), a 2x4 grid of MODEL pads, a stereo LED meter, MIX and
    OUTPUT knobs with live readouts, and LED buttons for MONO, BYPASS and
    ON AIR. Laid out on a fixed 980x420 panel that's scaled as a whole when
    the window is resized. */
class PhoneTestoAudioProcessorEditor : public juce::AudioProcessorEditor,
                                        private juce::Timer
{
public:
    explicit PhoneTestoAudioProcessorEditor (PhoneTestoAudioProcessor&);
    ~PhoneTestoAudioProcessorEditor() override;

    void resized() override;

    static constexpr int faceWidth = 980;
    static constexpr int faceHeight = 420;

private:
    /** The scaled child that holds every control; its painting is the
        editor's paintPanel(). */
    struct Panel : public juce::Component
    {
        std::function<void (juce::Graphics&)> onPaint;
        void paint (juce::Graphics& g) override { if (onPaint) onPaint (g); }
    };

    void timerCallback() override;
    void paintPanel (juce::Graphics&);
    void showSelectedModel (int index);
    void toggleLive();
    void updateLiveState();

    PhoneTestoAudioProcessor& processor;
    hw::LookAndFeel lookAndFeel;
    Panel panel;

    LevelMeter meter;
    DisplayWindow display;
    juce::Slider mixKnob, outputKnob;
    std::array<juce::ToggleButton, 8> modelPads;
    juce::ToggleButton monoButton { "MONO" }, bypassButton { "BYPASS" }, onAirButton { "ON AIR" };

    juce::String liveUrl;
    bool liveStartFailed = false;
    int shownListeners = -1;
    bool shownLive = false;
    double lastTimerSeconds = 0.0;

    using SliderAttachment = juce::AudioProcessorValueTreeState::SliderAttachment;
    using ButtonAttachment = juce::AudioProcessorValueTreeState::ButtonAttachment;

    std::unique_ptr<juce::ParameterAttachment> modelAttachment;
    std::unique_ptr<SliderAttachment> mixAttachment, outputAttachment;
    std::unique_ptr<ButtonAttachment> monoAttachment, bypassAttachment;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhoneTestoAudioProcessorEditor)
};

} // namespace phonetesto
