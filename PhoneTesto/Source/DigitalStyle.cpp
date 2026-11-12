#include "DigitalStyle.h"

namespace phonetesto::hw::digital
{

using namespace juce;

namespace
{
    /** Repeatable 0..1 noise, so the sea's glints keep their places between frames. */
    float hash01 (int n)
    {
        auto x = (uint32) n * 2654435761u;
        x ^= x >> 15;
        x *= 2246822519u;
        x ^= x >> 13;
        return (float) (x & 0xffffffu) / (float) 0xffffffu;
    }

    PathStrokeType roundStroke (float width)
    {
        return PathStrokeType (width, PathStrokeType::curved, PathStrokeType::rounded);
    }

    constexpr float sunX = 0.7f; // fraction of the width

    /** Sky, sun, clouds and sea, with no animation. */
    void paintScenery (Graphics& g, Rectangle<float> area)
    {
        const float horizon = Background::horizon (area);

        // dusk sky: plum overhead, warming to gold at the horizon
        ColourGradient sky (Colour (0xff2e2440), 0.0f, area.getY(), Colour (0xffffc983), 0.0f, horizon, false);
        sky.addColour (0.30, Colour (0xff5e3a62));
        sky.addColour (0.58, Colour (0xffa9507a));
        sky.addColour (0.80, Colour (0xffe57b5c));
        g.setGradientFill (sky);
        g.fillRect (area.withBottom (horizon));

        // the sun, just set: a wide warm glow on the horizon
        const auto sun = Point<float> (area.getX() + area.getWidth() * sunX, horizon);
        for (auto [rx, ry, alpha] : { std::tuple { 0.55f, 0.32f, 0.35f }, { 0.22f, 0.12f, 0.45f }, { 0.08f, 0.04f, 0.6f } })
        {
            const float w = area.getWidth() * rx, h = area.getHeight() * ry;
            Graphics::ScopedSaveState state (g);
            g.addTransform (AffineTransform::scale (1.0f, h / w, sun.x, sun.y));
            g.setGradientFill (ColourGradient (Colour (0xffffd9a0).withAlpha (alpha), sun, Colour (0x00ffb070), sun.translated (w, 0.0f), true));
            g.fillEllipse (Rectangle<float> (w * 2.0f, w * 2.0f).withCentre (sun));
        }

        // long soft clouds, lit warmer the lower they hang
        for (int i = 0; i < 9; ++i)
        {
            const float y = area.getY() + area.getHeight() * (0.08f + 0.40f * hash01 (i + 11));
            const float w = area.getWidth() * (0.18f + 0.30f * hash01 (i + 21));
            const float x = area.getX() + area.getWidth() * (hash01 (i + 31) * 1.1f - 0.05f);
            const float h = 5.0f + 9.0f * hash01 (i + 41);
            const float warm = jlimit (0.0f, 1.0f, (y - area.getY()) / (horizon - area.getY()));
            const auto colour = Colour (0xff3b2a4c).interpolatedWith (Colour (0xffffb27a), 0.25f + 0.6f * warm);
            const auto centre = Point<float> (x, y);

            // an ellipse with a radial falloff, squashed flat: no hard edges
            Graphics::ScopedSaveState state (g);
            g.addTransform (AffineTransform::scale (1.0f, h / w, centre.x, centre.y));
            ColourGradient puff (colour.withAlpha (0.30f + 0.15f * warm), centre, colour.withAlpha (0.0f), centre.translated (w * 0.5f, 0.0f), true);
            puff.addColour (0.5, colour.withAlpha (0.16f + 0.1f * warm));
            g.setGradientFill (puff);
            g.fillEllipse (Rectangle<float> (w, w).withCentre (centre));
        }

        // sea: teal, darkening towards the viewer
        ColourGradient sea (Colour (0xff3a5566), 0.0f, horizon, Colour (0xff050d10), 0.0f, area.getBottom(), false);
        sea.addColour (0.18, Colour (0xff1d4452));
        sea.addColour (0.55, Colour (0xff0c2630));
        g.setGradientFill (sea);
        g.fillRect (area.withTop (horizon));

        // the horizon itself: a fine line of light
        ColourGradient line (Colour (0x00ffd9a0), area.getX(), 0.0f, Colour (0x00ffd9a0), area.getRight(), 0.0f, false);
        line.addColour (sunX, Colour (0xffffe2b0).withAlpha (0.7f));
        g.setGradientFill (line);
        g.fillRect (area.getX(), horizon - 0.5f, area.getWidth(), 1.0f);

        // the sky's glow, mirrored softly in the water
        ColourGradient mirror (Colour (0xffff9a6a).withAlpha (0.22f), sun, Colour (0x00ff9a6a), sun.translated (area.getWidth() * 0.3f, 0.0f), true);
        Graphics::ScopedSaveState state (g);
        g.reduceClipRegion (area.withTop (horizon).toNearestInt());
        g.addTransform (AffineTransform::scale (1.0f, 0.5f, sun.x, sun.y));
        g.setGradientFill (mirror);
        g.fillRect (area.withTop (horizon).withHeight (area.getHeight()));
    }

    /** Film grain and a vignette, straight onto the cached pixels. */
    void addGrainAndVignette (Image& image)
    {
        Image::BitmapData px (image, Image::BitmapData::readWrite);
        const float cx = (float) px.width * 0.5f, cy = (float) px.height * 0.45f;
        const float maxD = std::sqrt (cx * cx + cy * cy);
        Random random (1979);

        for (int y = 0; y < px.height; ++y)
            for (int x = 0; x < px.width; ++x)
            {
                const auto c = px.getPixelColour (x, y);
                const float dx = ((float) x - cx) / maxD, dy = ((float) y - cy) / maxD;
                const float vignette = 1.0f - 0.55f * jlimit (0.0f, 1.0f, (dx * dx + dy * dy - 0.12f) * 1.6f);
                const float grain = (random.nextFloat() + random.nextFloat() - 1.0f) * 0.09f; // soft, triangular

                auto channel = [&] (uint8 v)
                {
                    const float f = (float) v / 255.0f * vignette + grain * (0.35f + 0.65f * (float) v / 255.0f);
                    return (uint8) jlimit (0, 255, roundToInt (f * 255.0f));
                };
                px.setPixelColour (x, y, Colour (channel (c.getRed()), channel (c.getGreen()), channel (c.getBlue())));
            }
    }
} // namespace

//==============================================================================
void Background::draw (Graphics& g, Rectangle<float> r, double t)
{
    // The scenery never changes: render it once, at the screen's real pixel
    // size, so each frame it's a plain copy (an image drawn at any other
    // scale would be resampled every frame, which costs more than drawing it).
    const float scale = g.getInternalContext().getPhysicalPixelScaleFactor();
    const int pw = roundToInt (r.getWidth() * scale), ph = roundToInt (r.getHeight() * scale);

    if (base.getWidth() != pw || base.getHeight() != ph)
    {
        base = Image (Image::RGB, jmax (1, pw), jmax (1, ph), false);
        {
            Graphics bg (base);
            bg.addTransform (AffineTransform::scale (scale));
            paintScenery (bg, { r.getWidth(), r.getHeight() });
        }
        addGrainAndVignette (base);
    }

    g.drawImageTransformed (base, AffineTransform::scale (1.0f / scale).translated (r.getX(), r.getY()));

    const float width = r.getWidth();
    const float horizonY = horizon (r), depth = r.getBottom() - horizonY;
    const float centreX = r.getX() + width * sunX;

    // slow swells rolling towards the viewer: faint lines, spreading apart
    // as they come closer
    for (int k = 0; k < 7; ++k)
    {
        const float p = (float) std::fmod (t * 0.035 + (double) k / 7.0, 1.0);
        const float y = horizonY + p * p * depth;
        const float alpha = 0.10f * std::sin (p * MathConstants<float>::pi);

        Path swell;
        swell.startNewSubPath (r.getX(), y);
        for (float x = 0.0f; x <= width + 40.0f; x += 40.0f)
            swell.lineTo (r.getX() + x, y + (1.0f + 4.0f * p) * std::sin (x / 90.0f + (float) k * 1.7f + (float) t * 0.4f));

        g.setColour (Colour (0xffbfe8e6).withAlpha (alpha));
        g.strokePath (swell, roundStroke (0.6f + 1.4f * p));
    }

    // the sun's reflection: glints scattered in a widening column below it,
    // drifting and twinkling
    for (int i = 0; i < 110; ++i)
    {
        const float d = std::pow (hash01 (i * 5 + 1), 1.5f);                 // 0 at the horizon, 1 at the bottom
        const float spread = 20.0f + d * width * 0.32f;
        const float across = hash01 (i * 5 + 2) * 2.0f - 1.0f;
        const float sway = std::sin ((float) t * (0.25f + 0.3f * hash01 (i * 5 + 3)) + (float) i) * (3.0f + 14.0f * d);
        const float x = centreX + across * spread + sway;
        const float y = horizonY + 2.0f + d * (depth - 4.0f);

        const float twinkle = 0.5f + 0.5f * std::sin ((float) t * (1.2f + 2.6f * hash01 (i * 5 + 4)) + (float) i * 2.3f);
        const float alpha = (0.12f + 0.7f * twinkle * twinkle) * (1.0f - 0.55f * d) * (1.0f - 0.7f * std::abs (across));
        const float length = (6.0f + 34.0f * hash01 (i * 5 + 5)) * (0.5f + 1.5f * d);
        const float thick = 0.8f + 1.8f * d;

        const auto colour = Colour (0xffffd59a).interpolatedWith (Colour (0xffff7f86), jmin (1.0f, d * 1.3f));
        g.setColour (colour.withAlpha (jmin (1.0f, alpha)));
        g.fillRoundedRectangle (Rectangle<float> (length, thick).withCentre ({ x, y }), thick * 0.5f);
    }
}

void drawGlass (Graphics& g, Rectangle<float> r, float corner, float lift)
{
    // smoky, warm, translucent: the scenery shows through, tinted
    g.setGradientFill (ColourGradient (Colour (0xff22161f).withAlpha (jmin (1.0f, 0.50f + 0.04f * (lift - 1.0f))), 0.0f, r.getY(),
                                       Colour (0xff120b12).withAlpha (jmin (1.0f, 0.64f)), 0.0f, r.getBottom(), false));
    g.fillRoundedRectangle (r, corner);

    // a soft sheen along the top, no edge
    Graphics::ScopedSaveState state (g);
    Path shape;
    shape.addRoundedRectangle (r, corner);
    g.reduceClipRegion (shape);
    const auto sheen = r.withHeight (jmin (r.getHeight() * 0.4f, 36.0f));
    g.setGradientFill (ColourGradient (Colour (0xffffe6cc).withAlpha (jmin (1.0f, 0.07f * lift)), 0.0f, sheen.getY(),
                                       Colour (0x00ffe6cc), 0.0f, sheen.getBottom(), false));
    g.fillRect (sheen);
}

void strokeGlow (Graphics& g, const Path& p, Colour c, float width, float glow)
{
    for (auto [extra, alpha] : { std::pair { 9.0f, 0.03f }, { 5.0f, 0.06f }, { 2.5f, 0.14f } })
    {
        g.setColour (c.withMultipliedAlpha (alpha * glow));
        g.strokePath (p, roundStroke (width + extra * glow));
    }

    g.setColour (c);
    g.strokePath (p, roundStroke (width));
}

void drawGlowText (Graphics& g, const String& text, Rectangle<float> area, Justification just,
                   const Font& f, Colour c, float glow)
{
    g.setFont (f);

    if (glow > 0.0f)
    {
        g.setColour ((c.getSaturation() < 0.2f ? colours::accent : c).withAlpha (0.04f * glow));

        for (int k = 0; k < 8; ++k)
        {
            const float a = MathConstants<float>::twoPi * (float) k / 8.0f;
            g.drawText (text, area.translated (1.5f * std::cos (a), 1.5f * std::sin (a)), just, false);
        }
    }

    g.setColour (c);
    g.drawText (text, area, just, false);
}

void drawLabel (Graphics& g, const String& text, Rectangle<float> area, Justification just, Colour colour, float height)
{
    g.setFont (font (Type::condensedBold, height + 1.0f, 0.16f));
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
    g.setColour (colours::cream.withAlpha (0.14f));
    g.strokePath (track, roundStroke (3.0f));

    if (pos > 0.001f)
    {
        Path value;
        value.addCentredArc (c.x, c.y, ringR, ringR, 0.0f, startAngle, angle, true);
        strokeGlow (g, value, colours::accent, 3.0f, 0.7f);
    }

    // a cream cap on a dark skirt, like a tape deck's
    const float bodyR = ringR - 9.0f;
    const auto body = Rectangle<float> (bodyR * 2.0f, bodyR * 2.0f).withCentre (c);
    g.setColour (Colours::black.withAlpha (0.4f));
    g.fillEllipse (body.translated (0.0f, 4.0f).expanded (2.0f));
    g.setColour (Colour (0xff4a3e36));
    g.fillEllipse (body);

    const auto cap = body.reduced (bodyR * 0.08f).translated (0.0f, -bodyR * 0.04f);
    g.setGradientFill (ColourGradient (Colour (0xfffbf3e6), c.x - bodyR * 0.35f, c.y - bodyR * 0.5f,
                                       Colour (0xffb3a48e), c.x + bodyR * 0.55f, c.y + bodyR * 0.9f, true));
    g.fillEllipse (cap);

    // the flat top, a touch lighter, so the cap reads as chamfered
    const auto top = cap.reduced (bodyR * 0.16f);
    g.setGradientFill (ColourGradient (Colour (0xfff6ecdd), 0.0f, top.getY(), Colour (0xffd5c7b1), 0.0f, top.getBottom(), false));
    g.fillEllipse (top);

    // coral pointer
    Path pointer;
    pointer.startNewSubPath (c.getPointOnCircumference (bodyR * 0.30f, angle));
    pointer.lineTo (c.getPointOnCircumference (bodyR * 0.78f, angle));
    g.setColour (colours::live);
    g.strokePath (pointer, roundStroke (3.2f));
}

namespace
{
    /** A small on/off switch: a dark track with a sliding cream knob, orange when on. */
    void drawSwitch (Graphics& g, Rectangle<float> track, bool on)
    {
        const float radius = track.getHeight() * 0.5f;
        g.setColour (on ? colours::accent : Colours::black.withAlpha (0.35f));
        g.fillRoundedRectangle (track, radius);

        const auto knob = Rectangle<float> (track.getHeight() - 4.0f, track.getHeight() - 4.0f)
                              .withCentre ({ on ? track.getRight() - radius : track.getX() + radius, track.getCentreY() });
        g.setColour (Colours::black.withAlpha (0.25f));
        g.fillEllipse (knob.translated (0.0f, 1.0f));
        g.setColour (on ? Colour (0xfffff6ea) : colours::cream.withMultipliedBrightness (0.85f));
        g.fillEllipse (knob);
    }

    /** "On air": a dot with radiating arcs either side; `pulse` (0..1) brightens the arcs. */
    void drawBroadcastIcon (Graphics& g, Point<float> c, float size, Colour colour, float pulse)
    {
        g.setColour (colour);
        g.fillEllipse (Rectangle<float> (size * 0.22f, size * 0.22f).withCentre (c));

        for (int ring = 1; ring <= 2; ++ring)
        {
            const float radius = size * (0.2f + 0.16f * (float) ring);
            const float alpha = jlimit (0.15f, 1.0f, 0.5f + 0.5f * pulse - 0.25f * (float) (ring - 1));

            for (float side : { -1.0f, 1.0f })
            {
                const float mid = side * MathConstants<float>::halfPi;
                Path arc;
                arc.addCentredArc (c.x, c.y, radius, radius, 0.0f, mid - 0.6f, mid + 0.6f, true);
                g.setColour (colour.withAlpha (alpha));
                g.strokePath (arc, roundStroke (jmax (1.2f, size * 0.07f)));
            }
        }
    }
} // namespace

void drawToggleButton (Graphics& g, ToggleButton& b, bool highlighted, bool down)
{
    const bool on = b.getToggleState();
    const auto& props = b.getProperties();
    const bool live = props.getWithDefault (liveProperty, false);
    const bool compact = props.getWithDefault (compactProperty, false);
    const bool isSwitch = props.getWithDefault (switchProperty, false);
    const int icon = props.getWithDefault (iconProperty, -1);
    const auto text = b.getButtonText();

    // header pills: smoky capsules
    if (compact)
    {
        const auto r = b.getLocalBounds().toFloat().reduced (1.0f);
        g.setColour (Colour (0xff140a12).withAlpha (highlighted ? 0.5f : 0.36f));
        g.fillRoundedRectangle (r, r.getHeight() * 0.5f);
        g.setFont (font (Type::condensedBold, 13.0f, 0.14f));
        g.setColour (highlighted ? colours::text : colours::textDim);
        g.drawText (text, r, Justification::centred, false);
        return;
    }

    // MONO / BYPASS: a label beside a sliding switch, on a faint plate
    if (isSwitch)
    {
        const auto r = b.getLocalBounds().toFloat().reduced (3.0f);
        g.setColour (Colours::white.withAlpha (highlighted ? 0.09f : 0.06f));
        g.fillRoundedRectangle (r, 10.0f);

        const auto track = Rectangle<float> (32.0f, 18.0f).withCentre ({ r.getRight() - 14.0f - 16.0f, r.getCentreY() });
        drawSwitch (g, track, on);

        g.setFont (font (Type::condensedBold, 14.0f, 0.14f));
        g.setColour (on ? colours::text : colours::textDim);
        g.drawText (text, r.withTrimmedLeft (16.0f).withRight (track.getX() - 6.0f), Justification::centredLeft, false);
        return;
    }

    // Everything else is a tape-deck key: a cream cap on a darker base, no
    // outline. Chosen keys sit pressed in and light up from within.
    const auto r = b.getLocalBounds().toFloat().reduced (3.0f, 2.0f);
    const float corner = 9.0f, travel = 3.0f;
    const bool pressed = on || down;
    const auto lit = live ? colours::live : colours::accent;

    if (on)
    {
        g.setColour (lit.withAlpha (0.18f));
        g.fillRoundedRectangle (r.expanded (3.0f), corner + 3.0f);
    }

    // shadow and the key's side
    g.setColour (Colours::black.withAlpha (pressed ? 0.25f : 0.35f));
    g.fillRoundedRectangle (r.translated (0.0f, 2.0f), corner);
    g.setColour (on ? lit.darker (0.9f) : Colour (0xff6e6253));
    g.fillRoundedRectangle (r.withTrimmedTop (travel), corner);

    auto cap = r.withTrimmedBottom (travel);
    if (on)        cap = cap.translated (0.0f, 2.0f);
    else if (down) cap = cap.translated (0.0f, 1.5f);

    const auto capTop = on ? lit.brighter (0.25f) : colours::cream.brighter (highlighted ? 0.12f : 0.05f);
    const auto capBottom = on ? lit : colours::cream.darker (0.18f);
    g.setGradientFill (ColourGradient (capTop, 0.0f, cap.getY(), capBottom, 0.0f, cap.getBottom(), false));
    g.fillRoundedRectangle (cap, corner);

    // a little lamp slot along the top edge
    const auto slot = Rectangle<float> (20.0f, 3.0f).withCentre ({ cap.getCentreX(), cap.getY() + 6.0f });
    if (on)
    {
        g.setColour (Colours::white.withAlpha (0.35f));
        g.fillRoundedRectangle (slot.expanded (3.0f, 2.0f), 3.0f);
        g.setColour (Colour (0xfffff6e8));
    }
    else
    {
        g.setColour (colours::ink.withAlpha (0.22f));
    }
    g.fillRoundedRectangle (slot, 1.5f);

    const auto ink = on ? Colour (0xff2a120a) : colours::ink;
    auto textArea = cap.withTrimmedTop (4.0f).reduced (12.0f, 0.0f);
    auto just = Justification::centred;

    if (icon >= 0)
    {
        const auto iconBox = cap.withTrimmedTop (4.0f).withWidth (cap.getHeight()).reduced (cap.getHeight() * 0.2f).translated (6.0f, 0.0f);
        drawDeviceIcon (g, icon, iconBox, ink.withAlpha (0.85f));
        textArea = cap.withTrimmedTop (4.0f).withLeft (iconBox.getRight() + 3.0f).withTrimmedRight (10.0f);
        just = Justification::centredLeft;
    }
    else if (live)
    {
        // breathes while on air (the editor repaints this button for it)
        const float pulse = on ? 0.5f + 0.5f * std::sin ((float) Time::getMillisecondCounter() * 0.001f * MathConstants<float>::twoPi * 0.7f)
                               : 0.0f;
        drawBroadcastIcon (g, { cap.getX() + cap.getHeight() * 0.8f, cap.getCentreY() + 2.0f }, cap.getHeight() * 0.6f, ink, pulse);
    }

    const auto f = font (Type::condensedBold, icon >= 0 ? 14.5f : jmin (17.0f, cap.getHeight() * 0.42f), 0.08f);

    // squeeze long names rather than cut them
    const float fits = jmin (1.0f, textArea.getWidth() / jmax (1.0f, GlyphArrangement::getStringWidth (f, text)));
    g.setFont (f.withHorizontalScale (jmax (0.8f, fits)));
    g.setColour (ink);
    g.drawText (text, textArea, just, false);
}

} // namespace phonetesto::hw::digital
