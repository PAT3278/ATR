#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"
#include "HardwareStyle.h"
#include "DigitalStyle.h"
#include "LevelMeter.h"
#include "DisplayWindow.h"

namespace phonetesto
{

/** The panel: a large display (speaker response curve, or the Live QR
    code), a 2x4 grid of MODEL pads, a stereo meter, MIX and OUTPUT knobs
    with live readouts, and buttons for MONO, BYPASS and ON AIR. Laid out on
    a fixed 980x420 panel that's scaled as a whole when the window is
    resized. Two skins (see HardwareStyle.h), switched from the header and
    remembered with the project. */
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
    /** A child whose painting is a function of the editor's. */
    struct Painted : public juce::Component
    {
        std::function<void (juce::Graphics&)> onPaint;
        void paint (juce::Graphics& g) override { if (onPaint) onPaint (g); }
    };

    void timerCallback() override;
    void paintBackground (juce::Graphics&);
    void paintOverlay (juce::Graphics&);
    void paintFlatOverlay (juce::Graphics&);
    void paintDigitalOverlay (juce::Graphics&);
    juce::Rectangle<float> statusPillBounds() const;
    juce::String statusText() const;
    void showSelectedModel (int index);
    void toggleLive();
    void updateLiveState();
    void applySkin (hw::Skin);

    PhoneTestoAudioProcessor& processor;
    const float savedScale;
    bool sizeRestored = false;
    hw::LookAndFeel lookAndFeel;
    hw::Skin skin = hw::Skin::flat;
    hw::digital::Background digitalBackground;

    // `panel` holds every control and paints the background; `overlay` sits
    // behind the controls and paints the static text (header, labels,
    // readouts). The overlay and controls are cached as images, so the
    // DIGITAL skin's moving background is the only thing redrawn per frame.
    Painted panel, overlay;

    LevelMeter meter;
    DisplayWindow display;
    juce::Slider mixKnob, outputKnob;
    std::array<juce::ToggleButton, 8> modelPads;
    juce::ToggleButton monoButton { "MONO" }, bypassButton { "BYPASS" }, onAirButton { "ON AIR" };
    juce::ToggleButton skinButton;

    juce::String liveUrl;
    bool liveStartFailed = false;
    int shownListeners = -1;
    bool shownLive = false;
    double lastTimerSeconds = 0.0;
    double animationSeconds = 0.0, sinceLastFrame = 0.0;

    using SliderAttachment = juce::AudioProcessorValueTreeState::SliderAttachment;
    using ButtonAttachment = juce::AudioProcessorValueTreeState::ButtonAttachment;

    std::unique_ptr<juce::ParameterAttachment> modelAttachment;
    std::unique_ptr<SliderAttachment> mixAttachment, outputAttachment;
    std::unique_ptr<ButtonAttachment> monoAttachment, bypassAttachment;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhoneTestoAudioProcessorEditor)
};

} // namespace phonetesto
