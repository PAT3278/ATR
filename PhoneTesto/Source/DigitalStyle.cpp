#include "DigitalStyle.h"

namespace phonetesto::hw::digital
{

using namespace juce;

namespace
{
    /** Repeatable 0..1 noise, so particles keep their places between frames. */
    float hash01 (int n)
    {
        auto x = (uint32) n * 2654435761u;
        x ^= x >> 15;
        x *= 2246822519u;
        x ^= x >> 13;
        return (float) (x & 0xffffffu) / (float) 0xffffffu;
    }

    /** One light ribbon: two summed sines, drifting at their own speeds. */
    struct Wave
    {
        float centre;               // fraction of the height
        float amp1, len1, speed1;   // px, px, rad/s
        float amp2, len2, speed2;
        float thickness;            // px
        float alpha;
    };

    constexpr Wave ribbons[] = {
        { 0.62f, 34.0f,  900.0f,  0.12f, 14.0f, 380.0f, -0.21f, 46.0f, 0.10f },
        { 0.68f, 26.0f,  700.0f, -0.09f, 18.0f, 520.0f,  0.17f, 30.0f, 0.08f },
        { 0.72f, 40.0f, 1200.0f,  0.07f, 10.0f, 300.0f,  0.25f, 64.0f, 0.06f },
        { 0.57f, 20.0f,  600.0f,  0.15f,  8.0f, 260.0f, -0.30f, 18.0f, 0.07f },
    };

    float waveY (const Wave& w, float x, float height, double t, float offset)
    {
        constexpr float twoPi = MathConstants<float>::twoPi;
        return w.centre * height
             + w.amp1 * std::sin (twoPi * x / w.len1 + (float) (t * w.speed1) + offset)
             + w.amp2 * std::sin (twoPi * x / w.len2 + (float) (t * w.speed2) + offset * 1.7f);
    }

    PathStrokeType roundStroke (float width)
    {
        return PathStrokeType (width, PathStrokeType::curved, PathStrokeType::rounded);
    }
} // namespace

//==============================================================================
void Background::draw (Graphics& g, Rectangle<float> r, double t)
{
    // The gradient and backlight never change: render them once, at the
    // screen's real pixel size, so each frame they're a plain copy (an image
    // drawn at any other scale would be resampled every frame, which costs
    // more than drawing it).
    const float scale = g.getInternalContext().getPhysicalPixelScaleFactor();
    const int pw = roundToInt (r.getWidth() * scale), ph = roundToInt (r.getHeight() * scale);

    if (base.getWidth() != pw || base.getHeight() != ph)
    {
        base = Image (Image::RGB, jmax (1, pw), jmax (1, ph), false);
        Graphics bg (base);
        bg.addTransform (AffineTransform::scale (scale));
        const auto area = Rectangle<float> (r.getWidth(), r.getHeight());

        ColourGradient fill (colours::bgTop, 0.0f, 0.0f, colours::bgBottom, 0.0f, area.getBottom(), false);
        fill.addColour (0.5, colours::bgMid);
        bg.setGradientFill (fill);
        bg.fillRect (area);

        // soft backlight from the upper left
        const auto glowCentre = Point<float> (area.getWidth() * 0.2f, area.getHeight() * 0.08f);
        const float glowRadius = area.getWidth() * 0.6f;
        bg.setGradientFill (ColourGradient (Colour (0x403f8dff), glowCentre, Colour (0x003f8dff),
                                            glowCentre.translated (glowRadius, 0.0f), true));
        bg.fillRect (Rectangle<float> (glowRadius * 2.0f, glowRadius * 2.0f).withCentre (glowCentre).getIntersection (area));
    }

    g.drawImageTransformed (base, AffineTransform::scale (1.0f / scale).translated (r.getX(), r.getY()));

    constexpr float step = 12.0f;
    const float width = r.getWidth(), height = r.getHeight();

    for (size_t i = 0; i < std::size (ribbons); ++i)
    {
        const auto& wave = ribbons[i];
        const float offset = (float) i * 1.3f;
        auto& top = edges[i];
        auto& ribbon = shapes[i];
        top.clear();
        ribbon.clear();

        top.startNewSubPath (r.getX(), r.getY() + waveY (wave, 0.0f, height, t, offset));
        for (float x = step; x <= width + step; x += step)
            top.lineTo (r.getX() + x, r.getY() + waveY (wave, x, height, t, offset));

        ribbon = top;
        for (float x = std::ceil (width / step) * step; x >= 0.0f; x -= step)
        {
            const float thick = wave.thickness * (0.55f + 0.45f * std::sin (x / 210.0f + (float) (t * 0.11) + (float) i * 2.1f));
            ribbon.lineTo (r.getX() + x, r.getY() + waveY (wave, x, height, t, offset + 0.35f) + thick);
        }
        ribbon.closeSubPath();

        const float yc = r.getY() + wave.centre * height, reach = wave.amp1 + wave.amp2;
        g.setGradientFill (ColourGradient (Colours::white.withAlpha (wave.alpha), 0.0f, yc - reach,
                                           Colour (0x0060b0ff), 0.0f, yc + reach + wave.thickness, false));
        g.fillPath (ribbon);

        g.setColour (Colours::white.withAlpha (wave.alpha * 0.45f));
        g.strokePath (top, roundStroke (4.0f));
        g.setColour (Colours::white.withAlpha (jmin (1.0f, wave.alpha * 2.4f)));
        g.strokePath (top, roundStroke (1.0f));
    }

    // particles drifting up through the band, fading out towards its top
    const float bandTop = animatedTop (r) + 8.0f, band = r.getBottom() - bandTop;

    for (int i = 0; i < 28; ++i)
    {
        const float sp = hash01 (i * 3 + 3);
        float y = std::fmod (hash01 (i * 3 + 2) * band - (float) t * (4.0f + sp * 10.0f), band);
        if (y < 0.0f) y += band;

        const auto c = Point<float> (r.getX() + hash01 (i * 3 + 1) * width + 6.0f * std::sin ((float) t * 0.3f + (float) i),
                                     bandTop + y);
        const float fade = jmin (1.0f, y / 40.0f);
        const float twinkle = 0.5f + 0.5f * std::sin ((float) t * (0.6f + sp) + (float) i * 1.3f);
        const float size = 1.0f + 1.6f * hash01 (i * 7 + 5);

        g.setColour (colours::accent.withAlpha (0.10f * twinkle * fade));
        g.fillEllipse (Rectangle<float> (size * 5.0f, size * 5.0f).withCentre (c));
        g.setColour (Colours::white.withAlpha ((0.25f + 0.45f * twinkle) * fade));
        g.fillEllipse (Rectangle<float> (size, size).withCentre (c));
    }
}

void drawGlass (Graphics& g, Rectangle<float> r, float corner, float lift)
{
    g.setGradientFill (ColourGradient (Colour (0xff5a8fe6).withAlpha (jmin (1.0f, 0.15f * lift)), 0.0f, r.getY(),
                                       Colour (0xff163370).withAlpha (jmin (1.0f, 0.24f * lift)), 0.0f, r.getBottom(), false));
    g.fillRoundedRectangle (r, corner);

    // gloss over the upper part
    {
        Graphics::ScopedSaveState state (g);
        Path shape;
        shape.addRoundedRectangle (r, corner);
        g.reduceClipRegion (shape);

        const auto gloss = r.withHeight (jmin (r.getHeight() * 0.5f, 56.0f));
        g.setGradientFill (ColourGradient (Colours::white.withAlpha (jmin (1.0f, 0.09f * lift)), 0.0f, gloss.getY(),
                                           Colours::white.withAlpha (0.0f), 0.0f, gloss.getBottom(), false));
        g.fillRect (gloss);
    }

    // hairline edge, brightest along the top
    g.setGradientFill (ColourGradient (Colour (0xffc4e6ff).withAlpha (jmin (1.0f, 0.55f * lift)), 0.0f, r.getY(),
                                       colours::glassEdge.withAlpha (jmin (1.0f, 0.2f * lift)), 0.0f, r.getBottom(), false));
    g.drawRoundedRectangle (r.reduced (0.5f), corner, 1.0f);
}

void strokeGlow (Graphics& g, const Path& p, Colour c, float width, float glow)
{
    for (auto [extra, alpha] : { std::pair { 12.0f, 0.05f }, { 7.0f, 0.10f }, { 3.5f, 0.22f } })
    {
        g.setColour (c.withMultipliedAlpha (alpha * glow));
        g.strokePath (p, roundStroke (width + extra * glow));
    }

    g.setColour (c);
    g.strokePath (p, roundStroke (width));
    g.setColour (Colours::white.withAlpha (0.5f * c.getFloatAlpha()));
    g.strokePath (p, roundStroke (jmax (0.6f, width * 0.35f)));
}

void drawGlowText (Graphics& g, const String& text, Rectangle<float> area, Justification just,
                   const Font& f, Colour c, float glow)
{
    g.setFont (f);

    if (glow > 0.0f)
    {
        // white text gets the cyan halo; coloured text glows in its own colour
        g.setColour ((c.getSaturation() < 0.2f ? colours::accent : c).withAlpha (0.09f * glow));

        for (float radius : { 2.6f, 1.3f })
            for (int k = 0; k < 8; ++k)
            {
                const float a = MathConstants<float>::twoPi * (float) k / 8.0f;
                g.drawText (text, area.translated (radius * std::cos (a), radius * std::sin (a)), just, false);
            }
    }

    g.setColour (c);
    g.drawText (text, area, just, false);
}

void drawLabel (Graphics& g, const String& text, Rectangle<float> area, Justification just, Colour colour, float height)
{
    g.setFont (font (Type::sansBold, height, 0.16f));
    g.setColour (colour);
    g.drawText (text.toUpperCase(), area, just, false);
}

void drawDeviceIcon (Graphics& g, int index, Rectangle<float> area, Colour c)
{
    // drawn on a 24x24 grid
    const float s = jmin (area.getWidth(), area.getHeight()) / 24.0f;
    const auto o = area.getCentre() - Point<float> (12.0f * s, 12.0f * s);
    auto at = [&] (float x, float y) { return Point<float> (o.x + x * s, o.y + y * s); };
    auto box = [&] (float x, float y, float w, float h) { return Rectangle<float> (o.x + x * s, o.y + y * s, w * s, h * s); };
    const float line = 1.6f * s;

    g.setColour (c);

    if (index == 6) // laptop
    {
        g.drawRoundedRectangle (box (4.0f, 5.0f, 16.0f, 11.0f), 1.5f * s, line);
        Path base;
        base.startNewSubPath (at (2.0f, 19.0f));
        base.lineTo (at (22.0f, 19.0f));
        g.strokePath (base, roundStroke (line));
        return;
    }

    if (index == 7) // wired earbuds
    {
        g.drawEllipse (box (4.5f, 3.0f, 6.0f, 6.0f), line);
        g.drawEllipse (box (13.5f, 3.0f, 6.0f, 6.0f), line);
        Path wire;
        wire.startNewSubPath (at (7.5f, 9.0f));
        wire.lineTo (at (7.5f, 13.5f));
        wire.quadraticTo (at (7.5f, 19.0f), at (12.0f, 19.5f));
        wire.startNewSubPath (at (16.5f, 9.0f));
        wire.lineTo (at (16.5f, 13.5f));
        wire.quadraticTo (at (16.5f, 19.0f), at (12.0f, 19.5f));
        wire.startNewSubPath (at (12.0f, 19.5f));
        wire.lineTo (at (12.0f, 23.0f));
        g.strokePath (wire, roundStroke (line * 0.8f));
        return;
    }

    // phones
    g.drawRoundedRectangle (box (7.0f, 2.0f, 10.0f, 20.0f), 2.6f * s, line);

    switch (index)
    {
        case 0: // home button and earpiece
            g.drawEllipse (box (10.8f, 17.4f, 2.4f, 2.4f), 1.0f * s);
            g.fillRoundedRectangle (box (10.5f, 4.3f, 3.0f, 0.9f), 0.45f * s);
            break;
        case 1: // notch
            g.fillRoundedRectangle (box (9.6f, 2.6f, 4.8f, 1.9f), 0.9f * s);
            break;
        case 2: // smaller notch
            g.fillRoundedRectangle (box (10.2f, 2.6f, 3.6f, 1.7f), 0.8f * s);
            break;
        case 3: // island
            g.fillRoundedRectangle (box (10.3f, 4.0f, 3.4f, 1.4f), 0.7f * s);
            break;
        case 4: // budget: thick bezels
            g.fillRect (box (8.6f, 5.2f, 6.8f, 0.9f));
            g.fillRect (box (8.6f, 18.0f, 6.8f, 0.9f));
            break;
        case 5: // punch-hole camera
            g.fillEllipse (box (11.2f, 3.7f, 1.6f, 1.6f));
            break;
        default:
            break;
    }
}

void drawKnob (Graphics& g, Rectangle<float> bounds, float pos, float startAngle, float endAngle)
{
    const auto c = bounds.getCentre();
    const float ringR = jmin (bounds.getWidth(), bounds.getHeight()) * 0.5f - 10.0f; // room for the glow
    const float angle = startAngle + pos * (endAngle - startAngle);

    Path track;
    track.addCentredArc (c.x, c.y, ringR, ringR, 0.0f, startAngle, endAngle, true);
    g.setColour (colours::accent.withAlpha (0.13f));
    g.strokePath (track, roundStroke (3.0f));

    if (pos > 0.001f)
    {
        Path value;
        value.addCentredArc (c.x, c.y, ringR, ringR, 0.0f, startAngle, angle, true);
        strokeGlow (g, value, colours::accent, 2.6f);
    }

    // glossy orb
    const float bodyR = ringR - 9.0f;
    const auto body = Rectangle<float> (bodyR * 2.0f, bodyR * 2.0f).withCentre (c);
    g.setColour (Colours::black.withAlpha (0.45f));
    g.fillEllipse (body.translated (0.0f, 3.0f).expanded (1.0f));
    g.setGradientFill (ColourGradient (Colour (0xff2c5899), c.x - bodyR * 0.35f, c.y - bodyR * 0.45f,
                                       Colour (0xff071430), c.x + bodyR * 0.6f, c.y + bodyR, true));
    g.fillEllipse (body);

    const auto gloss = body.reduced (bodyR * 0.2f, 0.0f).withHeight (bodyR * 0.8f).translated (0.0f, bodyR * 0.06f);
    g.setGradientFill (ColourGradient (Colours::white.withAlpha (0.26f), 0.0f, gloss.getY(),
                                       Colours::white.withAlpha (0.0f), 0.0f, gloss.getBottom(), false));
    g.fillEllipse (gloss);
    g.setColour (colours::glassEdge);
    g.drawEllipse (body.reduced (0.5f), 1.0f);

    // glowing indicator dot
    const auto dot = c.getPointOnCircumference (bodyR * 0.68f, angle);
    g.setColour (colours::accent.withAlpha (0.25f));
    g.fillEllipse (Rectangle<float> (13.0f, 13.0f).withCentre (dot));
    g.setColour (colours::accent);
    g.fillEllipse (Rectangle<float> (6.5f, 6.5f).withCentre (dot));
    g.setColour (Colours::white);
    g.fillEllipse (Rectangle<float> (2.8f, 2.8f).withCentre (dot));
}

void drawToggleButton (Graphics& g, ToggleButton& b, bool highlighted, bool down)
{
    const bool on = b.getToggleState();
    const auto& props = b.getProperties();
    const bool live = props.getWithDefault (liveProperty, false);
    const bool compact = props.getWithDefault (compactProperty, false);
    const int icon = props.getWithDefault (iconProperty, -1);

    const auto glow = live ? colours::live : colours::accent;
    const auto r = b.getLocalBounds().toFloat().reduced (compact ? 1.0f : 3.0f); // room for the glow
    const float corner = (compact || live) ? r.getHeight() * 0.5f : 7.0f;

    drawGlass (g, r, corner, highlighted ? 1.6f : 1.0f);

    if (on)
    {
        g.setColour (glow.withAlpha (live ? 0.55f : 0.20f));
        g.fillRoundedRectangle (r, corner);
        Path edge;
        edge.addRoundedRectangle (r.reduced (0.5f), corner);
        strokeGlow (g, edge, glow.withAlpha (0.9f), 1.0f, 0.6f);
    }

    if (down)
    {
        g.setColour (Colours::black.withAlpha (0.18f));
        g.fillRoundedRectangle (r, corner);
    }

    auto textArea = r.reduced (10.0f, 0.0f);
    auto just = Justification::centred;

    if (icon >= 0)
    {
        const auto iconBox = r.withWidth (r.getHeight()).reduced (r.getHeight() * 0.17f).translated (3.0f, 0.0f);
        drawDeviceIcon (g, icon, iconBox, on ? colours::text : colours::textDim);
        textArea = r.withLeft (iconBox.getRight() + 3.0f).withTrimmedRight (6.0f);
        just = Justification::centredLeft;
    }
    else if (! compact)
    {
        // status ring, lit when on
        const auto centre = Point<float> (r.getX() + 17.0f, r.getCentreY());
        if (on)
        {
            g.setColour (Colours::white.withAlpha (0.3f));
            g.fillEllipse (Rectangle<float> (13.0f, 13.0f).withCentre (centre));
            g.setColour (Colours::white);
            g.fillEllipse (Rectangle<float> (6.0f, 6.0f).withCentre (centre));
        }
        else
        {
            g.setColour (colours::textFaint);
            g.drawEllipse (Rectangle<float> (7.0f, 7.0f).withCentre (centre), 1.3f);
        }
        textArea = r.withTrimmedLeft (28.0f).withTrimmedRight (12.0f);
    }

    const float height = compact ? 11.5f : (icon >= 0 ? 12.5f : jmin (14.0f, r.getHeight() * 0.40f));
    const auto f = font (Type::sansBold, height, 0.10f);
    const auto text = b.getButtonText();

    // squeeze long names rather than cut them
    const float fits = jmin (1.0f, textArea.getWidth() / jmax (1.0f, GlyphArrangement::getStringWidth (f, text)));
    const auto fitted = f.withHorizontalScale (jmax (0.8f, fits));

    if (on && ! compact)
        drawGlowText (g, text, textArea, just, fitted, colours::text, 0.8f);
    else
    {
        g.setFont (fitted);
        g.setColour (on ? colours::text : colours::textDim);
        g.drawText (text, textArea, just, false);
    }
}

} // namespace phonetesto::hw::digital
