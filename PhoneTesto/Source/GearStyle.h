#pragma once

#include "HardwareStyle.h"

/** The three skins, each drawn from a kind of real vintage gear rather
    than from app UI:

    - DECK: an 80s silver cassette deck. Brushed aluminium, black knurled
      knobs over printed 0-10 scales, dark push keys with small LEDs, a
      cyan vacuum-fluorescent display, an LED ladder meter, seven-segment
      readouts.
    - RECEIVER: a 70s hi-fi receiver. Champagne aluminium between walnut
      cheeks, an amber-lit black-glass dial for the response curve, two
      backlit needle VU meters, spun-aluminium knobs, bat-handle toggles.
    - LAB: test equipment. Grey hammertone paint, slotted screws, printed
      section boxes, chicken-head pointer knobs, toggles and jewel lamps, a
      green phosphor CRT with a graticule, red LED readouts.

    Nothing animates: the faceplate is rendered once and cached. */
namespace phonetesto::hw::gear
{

struct Look
{
    juce::Colour plateTop, plateBottom; // faceplate paint / metal
    juce::Colour legend, legendDim;     // printed panel text
    juce::Colour window;                // display / meter glass
    juce::Colour trace;                 // what the display draws with (VFD, dial lamp, phosphor)
    juce::Colour lamp;                  // indicator lamps and LEDs when lit
    juce::Colour live;                  // ON AIR
    juce::Colour segment;               // seven-segment readouts
};

const Look& look (Skin);

/** The faceplate: material, texture, screws. Rendered once per size and skin. */
class Faceplate
{
public:
    void draw (juce::Graphics&, juce::Rectangle<float>, Skin);

private:
    juce::Image cache;
    Skin cachedSkin = Skin::deck;
};

/** A window set into the faceplate: dark glass with a recessed edge. */
void drawWindow (juce::Graphics&, juce::Rectangle<float>, Skin, float corner = 3.0f);

/** Printed panel text in the skin's legend type. */
void drawLegend (juce::Graphics&, const juce::String&, juce::Rectangle<float>, juce::Justification,
                 Skin, float height = 11.0f, bool dim = false);

/** Seven-segment digits with the unlit segments faintly visible behind. */
void drawSevenSegment (juce::Graphics&, const juce::String& text, juce::Rectangle<float>, juce::Justification,
                       juce::Colour lit, float height);

/** A round indicator: an LED (DECK), a pilot lamp (RECEIVER) or a jewel (LAB). */
void drawLamp (juce::Graphics&, juce::Point<float> centre, float radius, juce::Colour, bool on, Skin);

/** Line icon for a speaker profile: phones, laptop, wired earbuds. */
void drawDeviceIcon (juce::Graphics&, int profileIndex, juce::Rectangle<float>, juce::Colour);

void drawKnob (juce::Graphics&, juce::Rectangle<float>, float pos, float startAngle, float endAngle, Skin);
void drawToggleButton (juce::Graphics&, juce::ToggleButton&, bool highlighted, bool down, Skin);

} // namespace phonetesto::hw::gear
