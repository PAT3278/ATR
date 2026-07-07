#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace phonetesto
{

/** Vertical slider styled like the iOS volume HUD: a tall rounded pill,
    dark translucent track, white fill rising from the bottom, small
    speaker glyph near the base. Used for the Output control. */
class VolumeHudLookAndFeel : public juce::LookAndFeel_V4
{
public:
    void drawLinearSlider (juce::Graphics&, int x, int y, int width, int height,
                            float sliderPos, float minSliderPos, float maxSliderPos,
                            const juce::Slider::SliderStyle, juce::Slider&) override;
};

/** Horizontal slider styled as a flat "app" control living on the phone's
    on-screen area: rounded track, accent-coloured fill from the left, no
    JUCE-default thumb. Used for the Mix control. */
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

} // namespace phonetesto
