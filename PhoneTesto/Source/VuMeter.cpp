#include "VuMeter.h"
#include "HardwareStyle.h"

#include <cmath>

namespace phonetesto
{

float VuMeter::positionForVu (float vu)
{
    // Linear in voltage, normalised so +3 VU is full travel.
    return juce::jlimit (0.0f, 1.06f, std::pow (10.0f, vu / 20.0f) / std::pow (10.0f, 3.0f / 20.0f));
}

void VuMeter::update (float linearRms, float dt)
{
    const float vu = (linearRms > 1.0e-6f ? 20.0f * std::log10 (linearRms) : -100.0f) - referenceDbfs;
    const float target = positionForVu (vu);
    const float k = 1.0f - std::exp (-dt / 0.065f); // ~99% in 300 ms
    const float previous = needle;
    needle += (target - needle) * k;

    const float previousLamp = peakLamp;
    peakLamp = vu > 2.0f ? 1.0f : juce::jmax (0.0f, peakLamp - dt * 2.5f);

    if (std::abs (needle - previous) > 1.0e-4f || peakLamp != previousLamp)
        repaint();
}

void VuMeter::paint (juce::Graphics& g)
{
    using namespace juce;

    const auto bounds = getLocalBounds().toFloat();

    // bezel
    g.setColour (Colours::black.withAlpha (0.55f));
    g.fillRoundedRectangle (bounds.translated (0.0f, 2.0f), 9.0f);
    g.setGradientFill (ColourGradient (Colour (0xff3a3b40), bounds.getX(), bounds.getY(),
                                       Colour (0xff0f0f11), bounds.getX(), bounds.getBottom(), false));
    g.fillRoundedRectangle (bounds, 9.0f);
    g.setColour (Colours::white.withAlpha (0.1f));
    g.drawRoundedRectangle (bounds.reduced (0.5f), 9.0f, 1.0f);

    const auto face = bounds.reduced (10.0f);
    Path facePath;
    facePath.addRoundedRectangle (face, 4.0f);

    Graphics::ScopedSaveState state (g);
    g.reduceClipRegion (facePath);

    // warm incandescent backlight, brightest behind the scale
    g.setGradientFill (ColourGradient (Colour (0xfffcf2d6), face.getCentreX(), face.getY() + face.getHeight() * 0.35f,
                                       Colour (0xffd2b77d), face.getX(), face.getBottom(), true));
    g.fillRect (face);

    const auto ink = Colour (0xff1e1b16);
    const auto red = Colour (0xffc22a1c);
    const float h = face.getHeight();
    const auto pivot = Point<float> (face.getCentreX(), face.getBottom() + h * 0.32f);
    const float R = h * 1.02f;
    // span chosen so the outermost numerals (not just the arc) fit the face
    const float halfSpan = std::asin (jmin (0.86f, (face.getWidth() * 0.5f - 22.0f) / (R + h * 0.16f)));
    auto angleFor = [&] (float pos) { return -halfSpan + 2.0f * halfSpan * pos; };
    auto arc = [&] (float from, float to, float radius, float thickness, Colour colour)
    {
        Path p;
        p.addCentredArc (pivot.x, pivot.y, radius, radius, 0.0f, angleFor (from), angleFor (to), true);
        g.setColour (colour);
        g.strokePath (p, PathStrokeType (thickness));
    };

    const float zero = positionForVu (0.0f);
    arc (positionForVu (-20.0f), zero, R, 1.5f, ink);
    arc (zero, 1.0f, R + 2.5f, 5.0f, red);
    arc (zero, 1.0f, R, 1.5f, red);

    // percentage sub-scale inside the arc (100% = 0 VU)
    for (int pct = 0; pct <= 100; pct += 20)
    {
        const float a = angleFor (zero * (float) pct / 100.0f);
        g.setColour (ink.withAlpha (0.7f));
        g.drawLine ({ pivot.getPointOnCircumference (R - 9.0f, a), pivot.getPointOnCircumference (R - 3.0f, a) }, 1.0f);
    }

    struct Mark { float vu; const char* label; bool major; };
    const Mark marks[] = { { -20, "20", true }, { -10, "10", true }, { -7, "7", true }, { -5, "5", true },
                           { -3, "3", true }, { -2, "2", false }, { -1, "1", false }, { 0, "0", true },
                           { 1, "1", false }, { 2, "2", false }, { 3, "3", true } };

    const auto numberFont = hw::font (hw::Type::condensedBold, jmax (10.0f, h * 0.115f));
    g.setFont (numberFont);

    for (auto& m : marks)
    {
        const float a = angleFor (positionForVu (m.vu));
        const auto colour = m.vu > 0.0f ? red : ink;
        g.setColour (colour);
        g.drawLine ({ pivot.getPointOnCircumference (R, a), pivot.getPointOnCircumference (R + (m.major ? 9.0f : 6.0f), a) },
                    m.major ? 1.6f : 1.1f);

        const auto labelCentre = pivot.getPointOnCircumference (R + h * 0.16f, a);
        g.drawText (m.label, Rectangle<float> (24.0f, 14.0f).withCentre (labelCentre), Justification::centred, false);
    }

    g.setColour (ink);
    g.setFont (hw::font (hw::Type::condensedBold, h * 0.24f, 0.06f));
    g.drawText ("VU", Rectangle<float> (face.getWidth(), h * 0.26f).withCentre ({ face.getCentreX(), face.getY() + h * 0.60f }),
                Justification::centred, false);

    // PEAK lamp
    const auto lampCentre = Point<float> (face.getRight() - 16.0f, face.getY() + 15.0f);
    const auto lamp = Rectangle<float> (8.0f, 8.0f).withCentre (lampCentre);
    if (peakLamp > 0.0f)
    {
        g.setColour (Colour (0xffff3a2c).withAlpha (0.35f * peakLamp));
        g.fillEllipse (lamp.expanded (5.0f));
    }
    g.setColour (Colour (0xff4a120c).interpolatedWith (Colour (0xffff4a36), peakLamp));
    g.fillEllipse (lamp);
    g.setColour (Colours::black.withAlpha (0.5f));
    g.drawEllipse (lamp, 0.8f);
    g.setColour (ink.withAlpha (0.8f));
    g.setFont (hw::font (hw::Type::condensedBold, 10.0f, 0.1f));
    g.drawText ("PEAK", Rectangle<float> (40.0f, 10.0f).withCentre (lampCentre.translated (-28.0f, 0.0f)), Justification::centredRight, false);

    // needle (with its shadow on the scale card)
    const float needleAngle = angleFor (needle);
    const auto tip = pivot.getPointOnCircumference (R + 12.0f, needleAngle);
    g.setColour (Colours::black.withAlpha (0.2f));
    g.drawLine ({ pivot.translated (3.0f, 3.0f), tip.translated (3.0f, 3.0f) }, 1.8f);
    g.setColour (Colour (0xff141210));
    g.drawLine ({ pivot, tip }, 1.6f);

    // pivot housing at the bottom edge
    const auto hub = Rectangle<float> (face.getWidth() * 0.30f, h * 0.36f).withCentre ({ face.getCentreX(), face.getBottom() + h * 0.02f });
    g.setGradientFill (ColourGradient (Colour (0xff3b3833), hub.getCentreX(), hub.getY(),
                                       Colour (0xff0d0c0b), hub.getCentreX(), hub.getBottom(), false));
    g.fillEllipse (hub);

    // glass: shadow under the bezel lip, and a soft diagonal reflection
    g.setGradientFill (ColourGradient (Colours::black.withAlpha (0.35f), face.getX(), face.getY(),
                                       Colours::transparentBlack, face.getX(), face.getY() + 14.0f, false));
    g.fillRect (face.withHeight (14.0f));

    Path glare;
    glare.startNewSubPath (face.getX(), face.getY());
    glare.lineTo (face.getX() + face.getWidth() * 0.55f, face.getY());
    glare.lineTo (face.getX() + face.getWidth() * 0.25f, face.getBottom());
    glare.lineTo (face.getX(), face.getBottom());
    glare.closeSubPath();
    g.setGradientFill (ColourGradient (Colours::white.withAlpha (0.10f), face.getX(), face.getY(),
                                       Colours::transparentWhite, face.getX() + face.getWidth() * 0.4f, face.getCentreY(), false));
    g.fillPath (glare);
}

} // namespace phonetesto
