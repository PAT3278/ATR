#pragma once

#include "HardwareStyle.h"

/** The DIGITAL skin: a 2000s games-console interface. Deep navy behind
    slowly moving light waves and drifting particles; controls are glass
    panels with glowing cyan edges; PT Digital (from Orbitron) for the logo
    and numbers, Barlow for labels. Static parts are cached by the editor,
    so only the background is redrawn while it animates. */
namespace phonetesto::hw::digital
{

namespace colours
{
    const juce::Colour bgTop      { 0xff0d2249 };
    const juce::Colour bgMid      { 0xff07142e };
    const juce::Colour bgBottom   { 0xff02060f };
    const juce::Colour glassEdge  { 0x66a9d6ff };
    const juce::Colour text       { 0xffeef6ff };
    const juce::Colour textDim    { 0xff9db8de };
    const juce::Colour textFaint  { 0xff5b7ba7 };
    const juce::Colour accent     { 0xff4cc9ff };
    const juce::Colour live       { 0xffff3d6e };
    const juce::Colour meterLow   { 0xff35c4ff };
    const juce::Colour meterMid   { 0xffc8ecff };
    const juce::Colour meterHigh  { 0xffff3d6e };
}

/** Navy gradient, light waves and particles; `seconds` animates them. Only
    the band below animatedTop() ever changes, so that's all that needs
    redrawing per frame. */
class Background
{
public:
    void draw (juce::Graphics&, juce::Rectangle<float>, double seconds);

    static float animatedTop (juce::Rectangle<float> area) { return area.getY() + area.getHeight() * 0.43f; }

private:
    juce::Image base;               // gradient + backlight, at the screen's pixel size
    juce::Path edges[4], shapes[4]; // reused each frame
};

/** A glass panel: translucent blue fill, top gloss and a glowing hairline
    edge. `lift` > 1 brightens it (hover). */
void drawGlass (juce::Graphics&, juce::Rectangle<float>, float corner, float lift = 1.0f);

/** Strokes a path with a soft glow around it. */
void strokeGlow (juce::Graphics&, const juce::Path&, juce::Colour, float width, float glow = 1.0f);

/** Text with a soft glow. */
void drawGlowText (juce::Graphics&, const juce::String&, juce::Rectangle<float>, juce::Justification,
                   const juce::Font&, juce::Colour, float glow = 1.0f);

/** Small, widely spaced uppercase label. */
void drawLabel (juce::Graphics&, const juce::String&, juce::Rectangle<float>, juce::Justification,
                juce::Colour = colours::textDim, float height = 12.0f);

/** Line icon for a speaker profile: phones (home button, notch, island,
    punch hole), laptop, wired earbuds. */
void drawDeviceIcon (juce::Graphics&, int profileIndex, juce::Rectangle<float>, juce::Colour);

void drawKnob (juce::Graphics&, juce::Rectangle<float>, float pos, float startAngle, float endAngle);
void drawToggleButton (juce::Graphics&, juce::ToggleButton&, bool highlighted, bool down);

} // namespace phonetesto::hw::digital
