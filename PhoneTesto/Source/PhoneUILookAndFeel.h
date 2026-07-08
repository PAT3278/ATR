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

/** Vertical mixer-fader-style slider embedded in the phone's "screen":
    recessed metal track, glowing accent-coloured fill, a wide metallic cap
    with a centre groove line standing in for a real fader handle. Used for
    the Mix control. */
class MixSliderLookAndFeel : public juce::LookAndFeel_V4
{
public:
    void setAccentColour (juce::Colour newColour) { accentColour = newColour; }

    void drawLinearSlider (juce::Graphics&, int x, int y, int width, int height,
                            float sliderPos, float minSliderPos, float maxSliderPos,
                            const juce::Slider::SliderStyle, juce::Slider&) override;

private:
    juce::Colour accentColour { 0xff4fa3ff };
};

/** Compact "lab equipment" toggle switch: a small glowing LED dot plus an
    uppercase monospace caption, with a faint capsule outline -- used for
    Mono Sum / Bypass instead of a default checkbox, to match the
    instrument-panel look of the rest of the phone's screen. */
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
