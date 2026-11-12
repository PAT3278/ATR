#include "PaperStyle.h"
#include "DigitalStyle.h" // device icons

namespace phonetesto::hw::paper
{

using namespace juce;

namespace
{
    PathStrokeType roundStroke (float width)
    {
        return PathStrokeType (width, PathStrokeType::curved, PathStrokeType::rounded);
    }

    /** A sliding switch: a tonal track, a white knob; ink when on. */
    void drawSwitch (Graphics& g, Rectangle<float> track, bool on)
    {
        const float radius = track.getHeight() * 0.5f;
        g.setColour (on ? colours::ink : colours::surfaceHi);
        g.fillRoundedRectangle (track, radius);

        const auto knob = Rectangle<float> (track.getHeight() - 4.0f, track.getHeight() - 4.0f)
                              .withCentre ({ on ? track.getRight() - radius : track.getX() + radius, track.getCentreY() });
        g.setColour (Colours::black.withAlpha (0.10f));
        g.fillEllipse (knob.translated (0.0f, 0.8f));
        g.setColour (Colours::white);
        g.fillEllipse (knob);
    }
} // namespace

void drawPage (Graphics& g, Rectangle<float> r)
{
    g.setGradientFill (ColourGradient (colours::paper, 0.0f, r.getY(), colours::paperLow, 0.0f, r.getBottom(), false));
    g.fillRect (r);
}

void drawCard (Graphics& g, Rectangle<float> r, float corner)
{
    // a shadow so soft it reads as lift, not as an edge
    for (auto [grow, dy, alpha] : { std::tuple { 6.0f, 4.0f, 0.025f }, { 2.0f, 1.5f, 0.035f } })
    {
        g.setColour (Colours::black.withAlpha (alpha));
        g.fillRoundedRectangle (r.expanded (grow * 0.5f).translated (0.0f, dy), corner + grow * 0.5f);
    }

    g.setColour (colours::card);
    g.fillRoundedRectangle (r, corner);
}

void drawLabel (Graphics& g, const String& text, Rectangle<float> area, Justification just, Colour colour, float height)
{
    g.setFont (font (Type::sansSemiBold, height, 0.16f));
    g.setColour (colour);
    g.drawText (text.toUpperCase(), area, just, false);
}

void drawKnob (Graphics& g, Rectangle<float> bounds, float pos, float startAngle, float endAngle)
{
    const auto c = bounds.getCentre();
    const float ringR = jmin (bounds.getWidth(), bounds.getHeight()) * 0.5f - 8.0f;
    const float angle = startAngle + pos * (endAngle - startAngle);

    Path track;
    track.addCentredArc (c.x, c.y, ringR, ringR, 0.0f, startAngle, endAngle, true);
    g.setColour (colours::surfaceHi);
    g.strokePath (track, roundStroke (2.0f));

    if (pos > 0.001f)
    {
        Path value;
        value.addCentredArc (c.x, c.y, ringR, ringR, 0.0f, startAngle, angle, true);
        g.setColour (colours::ink);
        g.strokePath (value, roundStroke (2.0f));
    }

    // a plain white disc, lifted by a soft shadow
    const float bodyR = ringR - 10.0f;
    const auto body = Rectangle<float> (bodyR * 2.0f, bodyR * 2.0f).withCentre (c);
    for (auto [grow, dy, alpha] : { std::tuple { 6.0f, 5.0f, 0.04f }, { 2.0f, 2.0f, 0.06f } })
    {
        g.setColour (Colours::black.withAlpha (alpha));
        g.fillEllipse (body.expanded (grow * 0.5f).translated (0.0f, dy));
    }
    g.setGradientFill (ColourGradient (Colours::white, c.x, body.getY(), Colour (0xfff4f1ec), c.x, body.getBottom(), false));
    g.fillEllipse (body);

    Path pointer;
    pointer.startNewSubPath (c.getPointOnCircumference (bodyR * 0.45f, angle));
    pointer.lineTo (c.getPointOnCircumference (bodyR * 0.8f, angle));
    g.setColour (colours::ink);
    g.strokePath (pointer, roundStroke (2.2f));
}

void drawToggleButton (Graphics& g, ToggleButton& b, bool highlighted, bool down)
{
    const bool on = b.getToggleState();
    const auto& props = b.getProperties();
    const bool live = props.getWithDefault (liveProperty, false);
    const bool compact = props.getWithDefault (compactProperty, false);
    const bool isSwitch = props.getWithDefault (switchProperty, false);
    const int icon = props.getWithDefault (iconProperty, -1);
    const auto text = b.getButtonText();

    // header pills: text on a faint tonal capsule
    if (compact)
    {
        const auto r = b.getLocalBounds().toFloat().reduced (1.0f);
        g.setColour (highlighted ? colours::surfaceHi : colours::surface.withAlpha (0.7f));
        g.fillRoundedRectangle (r, r.getHeight() * 0.5f);
        g.setFont (font (Type::sansSemiBold, 11.5f, 0.14f));
        g.setColour (highlighted ? colours::text : colours::textDim);
        g.drawText (text, r, Justification::centred, false);
        return;
    }

    // MONO / BYPASS: a label beside a switch, nothing else
    if (isSwitch)
    {
        const auto r = b.getLocalBounds().toFloat().reduced (3.0f);
        if (highlighted)
        {
            g.setColour (colours::surface.withAlpha (0.6f));
            g.fillRoundedRectangle (r, 10.0f);
        }

        const auto track = Rectangle<float> (34.0f, 20.0f).withCentre ({ r.getRight() - 14.0f - 17.0f, r.getCentreY() });
        drawSwitch (g, track, on);

        g.setFont (font (Type::sansSemiBold, 12.0f, 0.16f));
        g.setColour (on ? colours::text : colours::textDim);
        g.drawText (text, r.withTrimmedLeft (14.0f).withRight (track.getX() - 6.0f), Justification::centredLeft, false);
        return;
    }

    // Keys: a soft tonal shape. Chosen keys turn to ink (vermilion for ON AIR).
    const auto r = b.getLocalBounds().toFloat().reduced (3.0f);
    const float corner = 10.0f;
    const auto fill = on ? (live ? colours::live : colours::ink)
                         : (highlighted ? colours::surfaceHi : colours::surface);

    g.setColour (down ? fill.darker (0.06f) : fill);
    g.fillRoundedRectangle (r, corner);

    const auto ink = on ? Colours::white : colours::text.withAlpha (0.8f);
    auto textArea = r.reduced (12.0f, 0.0f);
    auto just = Justification::centred;

    if (icon >= 0)
    {
        const auto iconBox = r.withWidth (r.getHeight()).reduced (r.getHeight() * 0.22f).translated (6.0f, 0.0f);
        digital::drawDeviceIcon (g, icon, iconBox, ink.withMultipliedAlpha (0.85f));
        textArea = r.withLeft (iconBox.getRight() + 3.0f).withTrimmedRight (10.0f);
        just = Justification::centredLeft;
    }
    else if (live)
    {
        // a small dot: steady when off, solid white when on air
        const auto dot = Point<float> (r.getX() + 22.0f, r.getCentreY());
        g.setColour (on ? Colours::white : colours::live);
        g.fillEllipse (Rectangle<float> (7.0f, 7.0f).withCentre (dot));
    }

    const auto f = font (Type::sansSemiBold, icon >= 0 ? 12.0f : 13.0f, 0.12f);
    const float fits = jmin (1.0f, textArea.getWidth() / jmax (1.0f, GlyphArrangement::getStringWidth (f, text)));
    g.setFont (f.withHorizontalScale (jmax (0.8f, fits)));
    g.setColour (ink);
    g.drawText (text, textArea, just, false);
}

} // namespace phonetesto::hw::paper
