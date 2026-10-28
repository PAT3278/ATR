#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"
#include "HardwareStyle.h"
#include "VuMeter.h"
#include "DisplayWindow.h"

namespace phonetesto
{

/** A 1U-style rack unit: VU meter, stepped MODEL selector, MIX/OUTPUT
    knobs, an amber display (speaker response curve, or the Live QR code),
    and lamp push buttons. Everything is laid out on a fixed 980x420
    faceplate that's scaled as a whole when the window is resized. */
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
        editor's paintFaceplate(). */
    struct Faceplate : public juce::Component
    {
        std::function<void (juce::Graphics&)> onPaint;
        std::function<void (const juce::MouseEvent&)> onMouseDown;
        void paint (juce::Graphics& g) override { if (onPaint) onPaint (g); }
        void mouseDown (const juce::MouseEvent& e) override { if (onMouseDown) onMouseDown (e); }
    };

    void timerCallback() override;
    void paintFaceplate (juce::Graphics&);
    void selectModelAt (juce::Point<float>);
    void toggleLive();
    void updateLiveState();

    juce::Point<float> modelLegendCentre (int index) const;
    float modelAngle (int index) const;

    PhoneTestoAudioProcessor& processor;
    hw::LookAndFeel lookAndFeel;
    Faceplate faceplate;

    VuMeter vuMeter;
    DisplayWindow display;
    juce::Slider modelSelector, mixKnob, outputKnob;
    juce::ToggleButton monoButton, bypassButton, onAirButton;

    juce::String liveUrl;
    bool liveStartFailed = false;
    double lastTimerSeconds = 0.0;

    using SliderAttachment = juce::AudioProcessorValueTreeState::SliderAttachment;
    using ButtonAttachment = juce::AudioProcessorValueTreeState::ButtonAttachment;

    std::unique_ptr<SliderAttachment> modelAttachment, mixAttachment, outputAttachment;
    std::unique_ptr<ButtonAttachment> monoAttachment, bypassAttachment;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhoneTestoAudioProcessorEditor)
};

} // namespace phonetesto
