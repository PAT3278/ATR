#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace phonetesto
{

/** Vertical slider styled like the iOS volume HUD, refined towards a
    boutique-plugin "instrument panel" finish: a tall metallic pill, dark
    recessed track, glowing fill rising from the bottom, small speaker
    glyph near the base. Used for the Output control. */
class VolumeHudLookAndFeel : public juce::LookAndFeel_V4
{
public:
    void setAccentColour (juce::Colour newColour) { accentColour = newColour; }

    void drawLinearSlider (juce::Graphics&, int x, int y, int width, int height,
                            float sliderPos, float minSliderPos, float maxSliderPos,
                            const juce::Slider::SliderStyle, juce::Slider&) override;

private:
    juce::Colour accentColour { 0xff4fa3ff };
};

/** Rotary knob embedded in the phone's "screen" for the Mix control,
    modelled on the clean dark dial style of plugins like Soundly's "Place
    It": a thin background track ring, a glowing accent-coloured value arc,
    a dark recessed dial face with a faint dotted grip texture, and a
    pointer line -- rather than a fader. */
class MixSliderLookAndFeel : public juce::LookAndFeel_V4
{
public:
    void setAccentColour (juce::Colour newColour) { accentColour = newColour; }

    void drawRotarySlider (juce::Graphics&, int x, int y, int width, int height,
                            float sliderPosProportional, float rotaryStartAngle,
                            float rotaryEndAngle, juce::Slider&) override;

private:
    juce::Colour accentColour { 0xff4fa3ff };
};

/** Compact circular "power toggle" with a glowing ring when active and an
    uppercase monospace caption underneath -- used for Mono Sum / Bypass
    instead of a default checkbox, echoing the round power buttons seen in
    plugins like Soundly's "Place It". */
class LabToggleLookAndFeel : public juce::LookAndFeel_V4
{
public:
    void setAccentColour (juce::Colour newColour) { accentColour = newColour; }

    void drawToggleButton (juce::Graphics&, juce::ToggleButton&,
                            bool shouldDrawButtonAsHighlighted, bool shouldDrawButtonAsDown) override;

private:
    juce::Colour accentColour { 0xff4fa3ff };
};

/** Preset picker styled to match the rest of the instrument panel: a
    recessed metal well, glowing accent-tinted outline, monospace label, and
    a small triangular caret instead of the default OS-styled combo box. */
class PresetBoxLookAndFeel : public juce::LookAndFeel_V4
{
public:
    void setAccentColour (juce::Colour newColour) { accentColour = newColour; }

    void drawComboBox (juce::Graphics&, int width, int height, bool isButtonDown,
                        int buttonX, int buttonY, int buttonW, int buttonH, juce::ComboBox&) override;

    juce::Font getComboBoxFont (juce::ComboBox&) override;

private:
    juce::Colour accentColour { 0xff4fa3ff };
};

} // namespace phonetesto
