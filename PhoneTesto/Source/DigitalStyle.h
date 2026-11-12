#pragma once

#include "HardwareStyle.h"

/** The SUNSET skin (Skin::digital in code): a warm, analog look. A grainy
    dusk sky over a teal sea whose sun reflection shimmers; smoky
    translucent panels with no outlines; cream tape-deck keys that light up
    orange when chosen; cream knobs with a coral pointer; Barlow Condensed
    for labels and PhoneTesto Mono (DM Mono) for numbers. Static parts are cached by the
    editor, so only the sea is redrawn while it animates. */
namespace phonetesto::hw::digital
{

namespace colours
{
    const juce::Colour text       { 0xfff7ecdd };
    const juce::Colour textDim    { 0xffc4b2a6 };
    const juce::Colour textFaint  { 0xff8c7a78 };
    const juce::Colour accent     { 0xffff9a4d }; // the sun
    const juce::Colour live       { 0xffff5e62 }; // coral
    const juce::Colour teal       { 0xff5cc8c4 }; // the sea
    const juce::Colour cream      { 0xffe4d8c5 }; // keys and knobs
    const juce::Colour ink        { 0xff3a2a22 }; // text on cream
    const juce::Colour meterLow   { 0xff5cc8c4 };
    const juce::Colour meterMid   { 0xffffb347 };
    const juce::Colour meterHigh  { 0xffff5e62 };
}

/** Dusk sky, sea and film grain; `seconds` animates the sun's reflection
    on the water. Only the band below animatedTop() ever changes, so that's
    all that needs redrawing per frame. */
class Background
{
public:
    void draw (juce::Graphics&, juce::Rectangle<float>, double seconds);

    static float animatedTop (juce::Rectangle<float> area) { return area.getY() + area.getHeight() * 0.43f; }
    static float horizon (juce::Rectangle<float> area)     { return area.getY() + area.getHeight() * 0.56f; }

private:
    juce::Image base; // sky, sea, grain and vignette, at the screen's pixel size
};

/** A smoky translucent panel, no outline. `lift` > 1 brightens it (hover). */
void drawGlass (juce::Graphics&, juce::Rectangle<float>, float corner, float lift = 1.0f);

/** Strokes a path with a soft glow around it. */
void strokeGlow (juce::Graphics&, const juce::Path&, juce::Colour, float width, float glow = 1.0f);

/** Text with a soft glow. */
void drawGlowText (juce::Graphics&, const juce::String&, juce::Rectangle<float>, juce::Justification,
                   const juce::Font&, juce::Colour, float glow = 1.0f);

/** Small, spaced uppercase label. */
void drawLabel (juce::Graphics&, const juce::String&, juce::Rectangle<float>, juce::Justification,
                juce::Colour = colours::textDim, float height = 12.0f);

/** Line icon for a speaker profile: phones (home button, notch, island,
    punch hole), laptop, wired earbuds. */
void drawDeviceIcon (juce::Graphics&, int profileIndex, juce::Rectangle<float>, juce::Colour);

void drawKnob (juce::Graphics&, juce::Rectangle<float>, float pos, float startAngle, float endAngle);
void drawToggleButton (juce::Graphics&, juce::ToggleButton&, bool highlighted, bool down);

} // namespace phonetesto::hw::digital
