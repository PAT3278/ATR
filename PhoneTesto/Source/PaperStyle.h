#pragma once

#include "HardwareStyle.h"

/** The PAPER skin: simple and quiet. Warm off-white paper, ink-black type,
    controls as soft tonal shapes with no outlines; a chosen key turns to
    ink, and the only colour is a small vermilion for ON AIR and overload.
    Nothing moves, so it costs nothing while idle. */
namespace phonetesto::hw::paper
{

namespace colours
{
    const juce::Colour paper     { 0xfff2efe9 };
    const juce::Colour paperLow  { 0xffe9e5dd }; // bottom of the page
    const juce::Colour surface   { 0xffe4e0d8 }; // keys, switch tracks
    const juce::Colour surfaceHi { 0xffdcd7ce }; // under the mouse
    const juce::Colour card      { 0xfff8f6f2 }; // panels, a shade lighter than the page
    const juce::Colour ink       { 0xff1d1d1f };
    const juce::Colour text      { 0xff1d1d1f };
    const juce::Colour textDim   { 0xff6e6c68 };
    const juce::Colour textFaint { 0xffa5a29c };
    const juce::Colour hairline  { 0x141d1d1f };
    const juce::Colour live      { 0xffd9472b }; // vermilion
}

/** The page: a near-flat paper tone. */
void drawPage (juce::Graphics&, juce::Rectangle<float>);

/** A panel: a lighter card with a very soft shadow, no outline. */
void drawCard (juce::Graphics&, juce::Rectangle<float>, float corner);

/** Small, spaced uppercase label. */
void drawLabel (juce::Graphics&, const juce::String&, juce::Rectangle<float>, juce::Justification,
                juce::Colour = colours::textDim, float height = 11.0f);

void drawKnob (juce::Graphics&, juce::Rectangle<float>, float pos, float startAngle, float endAngle);
void drawToggleButton (juce::Graphics&, juce::ToggleButton&, bool highlighted, bool down);

} // namespace phonetesto::hw::paper
