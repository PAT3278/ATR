#include "GearStyle.h"

namespace phonetesto::hw::gear
{

using namespace juce;

namespace
{
    const Look deckLook {
        Colour (0xffd7d9da), Colour (0xffb2b5b7), // brushed aluminium
        Colour (0xff17181a), Colour (0xff4b4e52),
        Colour (0xff040a09),
        Colour (0xff5ef2cf),                      // VFD cyan
        Colour (0xff46f56e), Colour (0xffff3324),
        Colour (0xff5ef2cf),
    };

    const Look receiverLook {
        Colour (0xffdcd2bb), Colour (0xffb6aa8f), // champagne aluminium
        Colour (0xff2a2018), Colour (0xff5f5243),
        Colour (0xff0b0806),
        Colour (0xffffb547),                      // dial lamp amber
        Colour (0xffffb547), Colour (0xffff4a2e),
        Colour (0xffffb547),
    };

    const Look labLook {
        Colour (0xffc5c7c0), Colour (0xffaaada5), // grey hammertone
        Colour (0xff141513), Colour (0xff474a44),
        Colour (0xff030805),
        Colour (0xff6dff8f),                      // P31 phosphor green
        Colour (0xff4fff6c), Colour (0xffff3a22),
        Colour (0xffff3b22),                      // red LED readouts
    };

    PathStrokeType roundStroke (float width)
    {
        return PathStrokeType (width, PathStrokeType::curved, PathStrokeType::rounded);
    }

    Font legendFont (Skin skin, float height)
    {
        switch (skin)
        {
            case Skin::receiver: return font (Type::sansMedium, height, 0.10f);
            case Skin::lab:      return font (Type::condensedBold, height * 1.12f, 0.03f);
            case Skin::deck:     break;
        }
        return font (Type::sansSemiBold, height, 0.05f);
    }

    //==========================================================================
    // Textures, applied straight to the cached pixels.

    /** Brushed metal: long horizontal streaks of slightly lighter and darker metal. */
    void brush (Image& image, float strength, int seed)
    {
        Image::BitmapData px (image, Image::BitmapData::readWrite);
        Random random (seed);

        for (int y = 0; y < px.height; ++y)
        {
            const float row = (random.nextFloat() - 0.5f) * strength * 0.8f;
            float streak = 0.0f;

            for (int x = 0; x < px.width; ++x)
            {
                streak += ((random.nextFloat() - 0.5f) * 2.0f - streak) * 0.015f; // long, soft streaks
                const float d = row + streak * strength * 3.0f + (random.nextFloat() - 0.5f) * strength * 0.35f;
                const auto c = px.getPixelColour (x, y);
                auto ch = [d] (uint8 v) { return (uint8) jlimit (0, 255, roundToInt ((float) v + d * 255.0f)); };
                px.setPixelColour (x, y, Colour (ch (c.getRed()), ch (c.getGreen()), ch (c.getBlue())));
            }
        }
    }

    /** Hammertone paint: soft mottling at two sizes, plus a fine grain. */
    void hammertone (Image& image, float cell)
    {
        Image::BitmapData px (image, Image::BitmapData::readWrite);
        Random random (1971);

        auto makeGrid = [&] (float size)
        {
            const int gw = (int) std::ceil ((float) px.width / size) + 2, gh = (int) std::ceil ((float) px.height / size) + 2;
            std::vector<float> grid ((size_t) (gw * gh));
            for (auto& v : grid) v = random.nextFloat() - 0.5f;
            return std::make_tuple (grid, gw, size);
        };
        const auto fine = makeGrid (cell), coarse = makeGrid (cell * 3.2f);

        auto sample = [] (const std::tuple<std::vector<float>, int, float>& g, int x, int y)
        {
            const auto& [grid, gw, size] = g;
            const float fx = (float) x / size, fy = (float) y / size;
            const int ix = (int) fx, iy = (int) fy;
            float tx = fx - (float) ix, ty = fy - (float) iy;
            tx = tx * tx * (3.0f - 2.0f * tx);
            ty = ty * ty * (3.0f - 2.0f * ty);
            auto at = [&] (int i, int j) { return grid[(size_t) (j * gw + i)]; };
            return jmap (ty, jmap (tx, at (ix, iy), at (ix + 1, iy)), jmap (tx, at (ix, iy + 1), at (ix + 1, iy + 1)));
        };

        for (int y = 0; y < px.height; ++y)
            for (int x = 0; x < px.width; ++x)
            {
                const float d = sample (fine, x, y) * 0.07f + sample (coarse, x, y) * 0.05f + (random.nextFloat() - 0.5f) * 0.035f;
                const auto c = px.getPixelColour (x, y);
                auto ch = [d] (uint8 v) { return (uint8) jlimit (0, 255, roundToInt ((float) v * (1.0f + d))); };
                px.setPixelColour (x, y, Colour (ch (c.getRed()), ch (c.getGreen()), ch (c.getBlue())));
            }
    }

    //==========================================================================
    void drawScrew (Graphics& g, Point<float> c, float r, float angle, bool phillips)
    {
        // countersunk head in its hole
        g.setColour (Colours::black.withAlpha (0.35f));
        g.fillEllipse (Rectangle<float> (r * 2.0f + 2.0f, r * 2.0f + 2.0f).withCentre (c.translated (0.0f, 0.6f)));
        g.setGradientFill (ColourGradient (Colour (0xffe9eaea), c.x - r * 0.6f, c.y - r * 0.7f,
                                           Colour (0xff6d7073), c.x + r * 0.7f, c.y + r * 0.8f, true));
        g.fillEllipse (Rectangle<float> (r * 2.0f, r * 2.0f).withCentre (c));

        Path slot;
        const float len = r * 0.78f;
        for (int k = 0; k < (phillips ? 2 : 1); ++k)
        {
            const float a = angle + (float) k * MathConstants<float>::halfPi;
            slot.startNewSubPath (c.getPointOnCircumference (len, a));
            slot.lineTo (c.getPointOnCircumference (len, a + MathConstants<float>::pi));
        }
        g.setColour (Colour (0xff2b2d2f));
        g.strokePath (slot, PathStrokeType (r * 0.32f));
        g.setColour (Colours::white.withAlpha (0.35f));
        g.strokePath (slot, PathStrokeType (r * 0.1f), AffineTransform::translation (0.0f, r * 0.18f));
    }

    /** Walnut cheek: warm brown with wavy grain. */
    void drawWalnut (Graphics& g, Rectangle<float> r, int seed)
    {
        g.setGradientFill (ColourGradient (Colour (0xff5a341d), r.getX(), 0.0f, Colour (0xff3a2112), r.getRight(), 0.0f, false));
        g.fillRect (r);

        Random random (seed);
        for (int i = 0; i < 26; ++i)
        {
            const float x = r.getX() + random.nextFloat() * r.getWidth();
            const float phase = random.nextFloat() * 6.0f, wave = 0.6f + random.nextFloat() * 1.6f;
            Path grain;
            grain.startNewSubPath (x, r.getY());
            for (float y = r.getY(); y <= r.getBottom(); y += 6.0f)
                grain.lineTo (x + wave * std::sin (y / (18.0f + 10.0f * (float) (i % 3)) + phase), y);
            g.setColour ((i % 3 == 0 ? Colour (0xff2a160b) : Colour (0xff7a4b2a)).withAlpha (0.35f + 0.3f * random.nextFloat()));
            g.strokePath (grain, PathStrokeType (0.6f + random.nextFloat()));
        }

        // a lacquer sheen down the middle
        ColourGradient sheen (Colours::white.withAlpha (0.0f), r.getX(), 0.0f, Colours::white.withAlpha (0.0f), r.getRight(), 0.0f, false);
        sheen.addColour (0.45, Colours::white.withAlpha (0.10f));
        g.setGradientFill (sheen);
        g.fillRect (r);
    }
} // namespace

const Look& look (Skin skin)
{
    return skin == Skin::receiver ? receiverLook : skin == Skin::lab ? labLook : deckLook;
}

//==============================================================================
void Faceplate::draw (Graphics& g, Rectangle<float> r, Skin skin)
{
    const float scale = g.getInternalContext().getPhysicalPixelScaleFactor();
    const int pw = roundToInt (r.getWidth() * scale), ph = roundToInt (r.getHeight() * scale);

    if (cache.getWidth() != pw || cache.getHeight() != ph || cachedSkin != skin)
    {
        cachedSkin = skin;
        const auto& L = look (skin);
        const auto area = Rectangle<float> (r.getWidth(), r.getHeight());
        cache = Image (Image::RGB, jmax (1, pw), jmax (1, ph), false);

        {
            Graphics bg (cache);
            bg.addTransform (AffineTransform::scale (scale));
            bg.setGradientFill (ColourGradient (L.plateTop, 0.0f, 0.0f, L.plateBottom, 0.0f, area.getBottom(), false));
            bg.fillRect (area);
        }

        if (skin == Skin::lab) hammertone (cache, 5.0f * scale);
        else                   brush (cache, skin == Skin::receiver ? 0.022f : 0.03f, skin == Skin::receiver ? 77 : 23);

        Graphics fg (cache);
        fg.addTransform (AffineTransform::scale (scale));

        // the plate's own edges: lit along the top, shaded along the bottom
        fg.setColour (Colours::white.withAlpha (0.55f));
        fg.fillRect (0.0f, 0.0f, area.getWidth(), 1.0f);
        fg.setColour (Colours::black.withAlpha (0.35f));
        fg.fillRect (0.0f, area.getBottom() - 1.0f, area.getWidth(), 1.0f);

        float inset = 11.0f;
        if (skin == Skin::receiver)
        {
            constexpr float cheek = 13.0f;
            drawWalnut (fg, area.withWidth (cheek), 5);
            drawWalnut (fg, area.withLeft (area.getRight() - cheek), 9);
            for (float x : { cheek, area.getRight() - cheek - 1.0f })
            {
                fg.setColour (Colours::black.withAlpha (0.5f));
                fg.fillRect (x, 0.0f, 1.0f, area.getHeight());
            }
            inset = cheek + 8.0f;
        }

        const bool phillips = skin == Skin::deck;
        int k = 0;
        for (auto c : { Point<float> (inset, 10.0f), Point<float> (area.getRight() - inset, 10.0f),
                        Point<float> (inset, area.getBottom() - 10.0f), Point<float> (area.getRight() - inset, area.getBottom() - 10.0f) })
            drawScrew (fg, c, skin == Skin::lab ? 5.0f : 4.2f, 0.4f + 0.9f * (float) k++, phillips);
    }

    g.drawImageTransformed (cache, AffineTransform::scale (1.0f / scale).translated (r.getX(), r.getY()));
}

void drawWindow (Graphics& g, Rectangle<float> r, Skin skin, float corner)
{
    const auto& L = look (skin);

    // the cut in the plate: shadow along the top edge, a lit lip along the bottom
    g.setGradientFill (ColourGradient (Colours::black.withAlpha (0.55f), 0.0f, r.getY() - 1.5f,
                                       Colours::white.withAlpha (0.55f), 0.0f, r.getBottom() + 1.5f, false));
    g.fillRoundedRectangle (r.expanded (1.5f), corner + 1.5f);

    g.setColour (L.window);
    g.fillRoundedRectangle (r, corner);

    // glass: a faint reflection across the upper part
    Graphics::ScopedSaveState state (g);
    Path glass;
    glass.addRoundedRectangle (r, corner);
    g.reduceClipRegion (glass);
    g.setGradientFill (ColourGradient (Colours::white.withAlpha (0.07f), r.getX(), r.getY(),
                                       Colours::white.withAlpha (0.0f), r.getX() + r.getWidth() * 0.35f, r.getY() + r.getHeight() * 0.6f, false));
    g.fillRect (r);
    g.setColour (Colours::black.withAlpha (0.5f));
    g.fillRect (r.withHeight (2.0f));
}

void drawLegend (Graphics& g, const String& text, Rectangle<float> area, Justification just, Skin skin, float height, bool dim)
{
    const auto& L = look (skin);
    g.setFont (legendFont (skin, height));
    g.setColour (dim ? L.legendDim : L.legend);
    g.drawText (text.toUpperCase(), area, just, false);
}

void drawSevenSegment (Graphics& g, const String& text, Rectangle<float> area, Justification just, Colour lit, float height)
{
    const auto f = font (Type::sevenSegment, height);
    g.setFont (f);

    // every position shows its unlit segments, as real displays do
    String ghost, shown;
    for (auto ch : text)
    {
        if (ch == '.') { ghost << '.'; shown << '.'; continue; }
        ghost << '8';
        shown << (ch == ' ' ? juce_wchar ('!') : ch); // '!' is DSEG's blank digit
    }

    g.setColour (lit.withAlpha (0.08f));
    g.drawText (ghost, area, just, false);

    g.setColour (lit.withAlpha (0.22f));
    for (auto [dx, dy] : { std::pair { -0.8f, 0.0f }, { 0.8f, 0.0f }, { 0.0f, -0.8f }, { 0.0f, 0.8f } })
        g.drawText (shown, area.translated (dx, dy), just, false);

    g.setColour (lit);
    g.drawText (shown, area, just, false);
}

void drawLamp (Graphics& g, Point<float> c, float r, Colour colour, bool on, Skin skin)
{
    const auto lens = Rectangle<float> (r * 2.0f, r * 2.0f).withCentre (c);

    if (skin != Skin::deck)
    {
        // chrome bezel round the lens
        g.setGradientFill (ColourGradient (Colour (0xfff2f2f0), c.x, c.y - r * 1.5f, Colour (0xff5d5f62), c.x, c.y + r * 1.5f, false));
        g.fillEllipse (lens.expanded (r * 0.45f));
    }

    if (on)
    {
        for (auto [grow, alpha] : { std::pair { 3.2f, 0.10f }, { 1.9f, 0.22f } })
        {
            g.setColour (colour.withAlpha (alpha));
            g.fillEllipse (lens.expanded (r * (grow - 1.0f)));
        }
    }

    g.setGradientFill (ColourGradient (on ? colour.brighter (0.6f) : colour.withMultipliedBrightness (0.28f), c.x - r * 0.3f, c.y - r * 0.4f,
                                       on ? colour : colour.withMultipliedBrightness (0.14f), c.x + r, c.y + r, true));
    g.fillEllipse (lens);

    if (skin == Skin::lab)
    {
        // a jewel's facets
        Path facets;
        for (int k = 0; k < 6; ++k)
        {
            const float a = (float) k * MathConstants<float>::twoPi / 6.0f;
            facets.startNewSubPath (c);
            facets.lineTo (c.getPointOnCircumference (r, a));
        }
        g.setColour (Colours::white.withAlpha (on ? 0.25f : 0.08f));
        g.strokePath (facets, PathStrokeType (0.6f));
    }

    g.setColour (Colours::white.withAlpha (on ? 0.85f : 0.3f));
    g.fillEllipse (Rectangle<float> (r * 0.55f, r * 0.4f).withCentre (c.translated (-r * 0.3f, -r * 0.38f)));
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

//==============================================================================
namespace
{
    /** The printed scale round a knob: ticks and 0-10. */
    void drawScale (Graphics& g, Point<float> c, float r, float start, float end, Skin skin)
    {
        const auto& L = look (skin);
        Path major, minor;
        for (int i = 0; i <= 20; ++i)
        {
            const float a = start + (end - start) * (float) i / 20.0f;
            auto& p = (i % 2 == 0) ? major : minor;
            const float len = (i % 2 == 0) ? 6.0f : 3.5f;
            p.startNewSubPath (c.getPointOnCircumference (r, a));
            p.lineTo (c.getPointOnCircumference (r + len, a));
        }
        g.setColour (L.legend);
        g.strokePath (major, PathStrokeType (1.3f));
        g.setColour (L.legendDim);
        g.strokePath (minor, PathStrokeType (0.9f));

        g.setFont (legendFont (skin, 8.5f));
        g.setColour (L.legend);
        for (int n = 0; n <= 10; n += (skin == Skin::deck ? 1 : 2))
        {
            const float a = start + (end - start) * (float) n / 10.0f;
            g.drawText (String (n), Rectangle<float> (16.0f, 10.0f).withCentre (c.getPointOnCircumference (r + 13.0f, a)),
                        Justification::centred, false);
        }
    }

    void drawShadow (Graphics& g, Rectangle<float> body, float drop)
    {
        for (auto [grow, alpha] : { std::pair { 4.0f, 0.10f }, { 1.5f, 0.22f } })
        {
            g.setColour (Colours::black.withAlpha (alpha));
            g.fillEllipse (body.expanded (grow).translated (0.0f, drop));
        }
    }

    /** DECK: black anodised knob with a knurled skirt and a spun cap. */
    void drawDeckKnob (Graphics& g, Point<float> c, float R, float angle)
    {
        const auto body = Rectangle<float> (R * 2.0f, R * 2.0f).withCentre (c);
        drawShadow (g, body, 3.0f);
        g.setColour (Colour (0xff141414));
        g.fillEllipse (body);

        // knurling round the skirt
        Path knurl;
        for (int i = 0; i < 60; ++i)
        {
            const float a = (float) i * MathConstants<float>::twoPi / 60.0f;
            knurl.startNewSubPath (c.getPointOnCircumference (R * 0.84f, a));
            knurl.lineTo (c.getPointOnCircumference (R - 0.6f, a));
        }
        g.setColour (Colour (0xff3a3a3a));
        g.strokePath (knurl, PathStrokeType (1.1f));

        const auto cap = body.reduced (R * 0.18f);
        g.setGradientFill (ColourGradient (Colour (0xff3d3e40), c.x, cap.getY(), Colour (0xff101011), c.x, cap.getBottom(), false));
        g.fillEllipse (cap);

        // spun-metal rings and a broad highlight
        for (float k = 0.25f; k < 1.0f; k += 0.12f)
        {
            g.setColour (Colours::white.withAlpha (0.035f));
            g.drawEllipse (cap.reduced (cap.getWidth() * 0.5f * (1.0f - k)), 0.7f);
        }
        Path sheen;
        sheen.addCentredArc (c.x, c.y, R * 0.6f, R * 0.6f, 0.0f, -2.2f, -0.9f, true);
        g.setColour (Colours::white.withAlpha (0.12f));
        g.strokePath (sheen, roundStroke (R * 0.18f));

        Path line;
        line.startNewSubPath (c.getPointOnCircumference (R * 0.30f, angle));
        line.lineTo (c.getPointOnCircumference (R * 0.78f, angle));
        g.setColour (Colour (0xfff2f2ee));
        g.strokePath (line, roundStroke (2.4f));
    }

    /** RECEIVER: solid aluminium with a fluted rim and a spun face. */
    void drawReceiverKnob (Graphics& g, Point<float> c, float R, float angle)
    {
        const auto body = Rectangle<float> (R * 2.0f, R * 2.0f).withCentre (c);
        drawShadow (g, body, 3.5f);

        g.setGradientFill (ColourGradient (Colour (0xffe6e1d6), c.x, body.getY(), Colour (0xff8b8577), c.x, body.getBottom(), false));
        g.fillEllipse (body);

        Path flutes;
        for (int i = 0; i < 48; ++i)
        {
            const float a = (float) i * MathConstants<float>::twoPi / 48.0f;
            flutes.startNewSubPath (c.getPointOnCircumference (R * 0.88f, a));
            flutes.lineTo (c.getPointOnCircumference (R - 0.5f, a));
        }
        g.setColour (Colour (0xff5d584e).withAlpha (0.55f));
        g.strokePath (flutes, PathStrokeType (1.0f));

        // the face: spun aluminium, light catching on opposite sides
        const auto face = body.reduced (R * 0.14f);
        const float fr = face.getWidth() * 0.5f;
        for (int i = 0; i < 72; ++i)
        {
            const float a0 = (float) i * MathConstants<float>::twoPi / 72.0f, a1 = a0 + MathConstants<float>::twoPi / 72.0f + 0.01f;
            const float light = 0.5f + 0.5f * std::cos (2.0f * (a0 + 0.6f));
            Path wedge;
            wedge.startNewSubPath (c);
            wedge.addCentredArc (c.x, c.y, fr, fr, 0.0f, a0, a1);
            wedge.closeSubPath();
            g.setColour (Colour (0xff9c968a).interpolatedWith (Colour (0xfff4f1ea), light));
            g.fillPath (wedge);
        }
        for (float k = 0.2f; k < 1.0f; k += 0.08f)
        {
            g.setColour (Colours::black.withAlpha (0.025f));
            g.drawEllipse (face.reduced (fr * (1.0f - k)), 0.6f);
        }

        // a drilled dimple as the pointer
        const auto dot = c.getPointOnCircumference (fr * 0.72f, angle);
        g.setColour (Colour (0xff2a2520));
        g.fillEllipse (Rectangle<float> (5.0f, 5.0f).withCentre (dot));
        g.setColour (Colours::white.withAlpha (0.6f));
        g.drawEllipse (Rectangle<float> (5.0f, 5.0f).withCentre (dot.translated (0.0f, 0.5f)), 0.5f);
    }

    /** LAB: bakelite chicken-head pointer knob. */
    void drawLabKnob (Graphics& g, Point<float> c, float R, float angle)
    {
        Path knob;
        const float boss = R * 0.62f;
        knob.addEllipse (Rectangle<float> (boss * 2.0f, boss * 2.0f).withCentre (c));

        // the pointer wing, tapering to a rounded tip, and a short tail
        Path wing;
        const auto tip = c.getPointOnCircumference (R * 1.0f, angle);
        const auto tail = c.getPointOnCircumference (R * 0.72f, angle + MathConstants<float>::pi);
        const float side = MathConstants<float>::halfPi;
        wing.startNewSubPath (c.getPointOnCircumference (R * 0.42f, angle - side));
        wing.quadraticTo (c.getPointOnCircumference (R * 0.5f, angle - 0.25f), tip.getPointOnCircumference (R * 0.12f, angle - side));
        wing.quadraticTo (tip.getPointOnCircumference (R * 0.16f, angle), tip.getPointOnCircumference (R * 0.12f, angle + side));
        wing.quadraticTo (c.getPointOnCircumference (R * 0.5f, angle + 0.25f), c.getPointOnCircumference (R * 0.42f, angle + side));
        wing.quadraticTo (tail.getPointOnCircumference (R * 0.3f, angle + side), tail);
        wing.quadraticTo (tail.getPointOnCircumference (R * 0.3f, angle - side), c.getPointOnCircumference (R * 0.42f, angle - side));
        wing.closeSubPath();
        knob.addPath (wing);

        g.setColour (Colours::black.withAlpha (0.28f));
        g.fillPath (knob, AffineTransform::translation (0.0f, 3.0f));
        g.setGradientFill (ColourGradient (Colour (0xff3b3330), c.x - R * 0.4f, c.y - R * 0.6f, Colour (0xff0f0c0b), c.x + R * 0.6f, c.y + R * 0.7f, true));
        g.fillPath (knob);

        // gloss on the boss
        g.setGradientFill (ColourGradient (Colours::white.withAlpha (0.18f), c.x, c.y - boss, Colours::white.withAlpha (0.0f), c.x, c.y, false));
        g.fillEllipse (Rectangle<float> (boss * 1.4f, boss).withCentre (c.translated (0.0f, -boss * 0.35f)));

        // the engraved white line along the pointer
        Path line;
        line.startNewSubPath (c.getPointOnCircumference (R * 0.15f, angle));
        line.lineTo (c.getPointOnCircumference (R * 0.92f, angle));
        g.setColour (Colour (0xffeeeae0));
        g.strokePath (line, roundStroke (1.8f));
    }
} // namespace

void drawKnob (Graphics& g, Rectangle<float> bounds, float pos, float startAngle, float endAngle, Skin skin)
{
    const auto c = bounds.getCentre();
    const float R = jmin (bounds.getWidth(), bounds.getHeight()) * 0.30f;
    const float angle = startAngle + pos * (endAngle - startAngle);

    drawScale (g, c, R + 4.0f, startAngle, endAngle, skin);

    switch (skin)
    {
        case Skin::receiver: drawReceiverKnob (g, c, R, angle); break;
        case Skin::lab:      drawLabKnob (g, c, R, angle); break;
        case Skin::deck:     drawDeckKnob (g, c, R, angle); break;
    }
}

//==============================================================================
namespace
{
    /** A key: a cap sitting in a hole in the plate. Returns the cap. */
    struct KeyMaterial { Colour faceTop, faceBottom, wallTop, wallBottom; float sheen; };

    /** Fine grain for key faces (matte plastic, bead-blasted aluminium):
        a small tile of noise, made once and shared. */
    struct Grain
    {
        Grain() : speckle (Image::ARGB, 128, 128, true), brushed (Image::ARGB, 256, 128, true)
        {
            Random random (311);
            {
                Image::BitmapData px (speckle, Image::BitmapData::writeOnly);
                for (int y = 0; y < speckle.getHeight(); ++y)
                    for (int x = 0; x < speckle.getWidth(); ++x)
                    {
                        const float v = random.nextFloat() - 0.5f;
                        px.setPixelColour (x, y, (v > 0.0f ? Colours::white : Colours::black).withAlpha (std::abs (v) * 0.35f));
                    }
            }
            {
                // long horizontal strokes, as from a satin finish
                Image::BitmapData px (brushed, Image::BitmapData::writeOnly);
                for (int y = 0; y < brushed.getHeight(); ++y)
                {
                    float stroke = random.nextFloat() - 0.5f;
                    for (int x = 0; x < brushed.getWidth(); ++x)
                    {
                        stroke += ((random.nextFloat() - 0.5f) - stroke) * 0.04f;
                        const float v = stroke * 1.6f + (random.nextFloat() - 0.5f) * 0.25f;
                        px.setPixelColour (x, y, (v > 0.0f ? Colours::white : Colours::black).withAlpha (jmin (1.0f, std::abs (v)) * 0.5f));
                    }
                }
            }
        }
        Image speckle, brushed;
    };

    KeyMaterial keyMaterial (Skin skin, bool live)
    {
        switch (skin)
        {
            case Skin::receiver: // brushed aluminium cap on a darker anodised wall
                return { Colour (0xfff6f2e8), Colour (0xffcec5b1), Colour (0xffa69d89), Colour (0xff6f6858), 0.55f };
            case Skin::lab:
                if (live) return { Colour (0xffcf5244), Colour (0xff9a2a1f), Colour (0xff76201a), Colour (0xff4c120d), 0.30f };
                return { Colour (0xfff0efe9), Colour (0xffd3d2ca), Colour (0xffacaba3), Colour (0xff7f7e77), 0.55f };
            case Skin::deck: break; // satin black plastic
        }
        return { Colour (0xff4a4c50), Colour (0xff26272a), Colour (0xff17181a), Colour (0xff0a0a0b), 0.20f };
    }

    /** A key: a cap with real side walls, standing in a hole in the plate.
        Returns the cap's face (where its legend and lamp go). */
    Rectangle<float> drawKey (Graphics& g, Rectangle<float> r, Skin skin, bool latched, bool highlighted, bool down, bool live)
    {
        const float corner = skin == Skin::lab ? 2.5f : 3.5f;
        const auto m = keyMaterial (skin, live);

        // how far the cap stands proud of the plate: a latched key stays down
        const float height = latched ? 1.5f : (down ? 2.0f : 4.0f);

        // the hole: shaded at the top, catching light on its lower lip
        g.setGradientFill (ColourGradient (Colours::black.withAlpha (0.32f), 0.0f, r.getY(), Colours::black.withAlpha (0.12f), 0.0f, r.getBottom(), false));
        g.fillRoundedRectangle (r, corner + 1.0f);
        g.setColour (Colours::white.withAlpha (0.35f));
        g.fillRoundedRectangle (r.withTop (r.getBottom() - 1.0f).reduced (corner, 0.0f), 0.5f);
        const auto body = r.reduced (1.5f);
        for (int k = 3; k >= 1; --k)
        {
            g.setColour (Colours::black.withAlpha (latched ? 0.10f : 0.14f));
            g.fillRoundedRectangle (body.translated (0.0f, (float) k * 0.8f).expanded ((float) k * 0.5f), corner + (float) k * 0.5f);
        }

        // side walls: visible below the face, darker toward the plate
        g.setGradientFill (ColourGradient (m.wallTop, 0.0f, body.getBottom() - height - 2.0f, m.wallBottom, 0.0f, body.getBottom(), false));
        g.fillRoundedRectangle (body, corner);

        // the face
        auto face = body.withTrimmedBottom (height).withTrimmedTop (latched ? 1.0f : 0.0f);
        auto top = m.faceTop, bottom = m.faceBottom;
        if (latched)                   { top = top.darker (0.12f); bottom = bottom.darker (0.10f); }
        else if (highlighted && ! down) { top = top.brighter (0.06f); bottom = bottom.brighter (0.04f); }
        g.setGradientFill (ColourGradient (top, 0.0f, face.getY(), bottom, 0.0f, face.getBottom(), false));
        g.fillRoundedRectangle (face, corner);

        {
            Graphics::ScopedSaveState state (g);
            Path facePath;
            facePath.addRoundedRectangle (face, corner);
            g.reduceClipRegion (facePath);

            // the surface's grain
            {
                Graphics::ScopedSaveState grainState (g);
                SharedResourcePointer<Grain> grain;
                if (skin == Skin::receiver) g.setTiledImageFill (grain->brushed, 0, 0, 0.35f);
                else                        g.setTiledImageFill (grain->speckle, 0, 0, skin == Skin::deck ? 0.30f : 0.22f);
                g.addTransform (AffineTransform::scale (0.5f).translated (face.getX(), face.getY())); // finer than a logical pixel
                g.fillRect (face.withPosition (0.0f, 0.0f) * 2.0f);
                g.fillRect (face);
            }

            // a slight dome: light pooling on the upper middle of the cap
            const auto c = Point<float> (face.getCentreX(), face.getY() + face.getHeight() * 0.15f);
            ColourGradient dome (Colours::white.withAlpha (m.sheen * 0.35f), c, Colours::white.withAlpha (0.0f),
                                 c.translated (face.getWidth() * 0.55f, 0.0f), true);
            g.setGradientFill (dome);
            g.fillEllipse (Rectangle<float> (face.getWidth() * 1.1f, face.getHeight() * 1.3f).withCentre (c));

            // a latched key sits inside the hole: its rim shades the face's top edge
            if (latched)
            {
                g.setGradientFill (ColourGradient (Colours::black.withAlpha (0.30f), 0.0f, face.getY(),
                                                   Colours::black.withAlpha (0.0f), 0.0f, face.getY() + 5.0f, false));
                g.fillRect (face.withHeight (5.0f));
            }

            // the face's own rounded edge: a bright rim on top, a soft shade along the bottom
            g.setGradientFill (ColourGradient (Colours::black.withAlpha (0.0f), 0.0f, face.getBottom() - 5.0f,
                                               Colours::black.withAlpha (skin == Skin::deck ? 0.35f : 0.16f), 0.0f, face.getBottom(), false));
            g.fillRect (face.withTop (face.getBottom() - 5.0f));
        }

        g.setColour (Colours::white.withAlpha (m.sheen));
        g.fillRoundedRectangle (face.reduced (corner * 0.8f, 0.0f).withHeight (1.0f).translated (0.0f, 0.5f), 0.5f);
        g.setColour (Colours::white.withAlpha (m.sheen * 0.35f));
        g.fillRect (face.reduced (0.0f, corner).withWidth (1.0f).translated (0.5f, 0.0f));
        return face;
    }

    /** Legend printed on a key: a hairline of light under dark ink, or of
        shadow over light ink, so it reads as printed into the surface. */
    void drawKeyLegend (Graphics& g, const String& text, Rectangle<float> area, Justification just, const Font& f, Colour ink)
    {
        g.setFont (f);
        const bool lightInk = ink.getPerceivedBrightness() > 0.5f;
        g.setColour (lightInk ? Colours::black.withAlpha (0.55f) : Colours::white.withAlpha (0.45f));
        g.drawText (text, area.translated (0.0f, lightInk ? -0.8f : 0.8f), just, false);
        g.setColour (ink);
        g.drawText (text, area, just, false);
    }

    /** A bat-handle toggle: chrome nut, lever up for on. */
    void drawToggleSwitch (Graphics& g, Point<float> c, bool on)
    {
        const float nut = 8.0f;
        g.setColour (Colours::black.withAlpha (0.3f));
        g.fillEllipse (Rectangle<float> (nut * 2.0f + 2.0f, nut * 2.0f + 2.0f).withCentre (c.translated (0.0f, 1.0f)));

        Path hex;
        hex.addPolygon (c, 6, nut, 0.0f);
        g.setGradientFill (ColourGradient (Colour (0xfff1f1ef), c.x, c.y - nut, Colour (0xff6f7174), c.x, c.y + nut, false));
        g.fillPath (hex);
        g.setColour (Colour (0xff2c2d2f));
        g.fillEllipse (Rectangle<float> (nut * 0.9f, nut * 0.9f).withCentre (c));

        // the lever, foreshortened toward its tip
        const float dir = on ? -1.0f : 1.0f, len = 15.0f;
        const auto tip = c.translated (0.0f, dir * len);
        Path lever;
        lever.startNewSubPath (c.translated (-2.2f, 0.0f));
        lever.lineTo (tip.translated (-3.2f, 0.0f));
        lever.lineTo (tip.translated (3.2f, 0.0f));
        lever.lineTo (c.translated (2.2f, 0.0f));
        lever.closeSubPath();
        g.setColour (Colours::black.withAlpha (0.25f));
        g.fillPath (lever, AffineTransform::translation (1.5f, 2.0f));
        g.setGradientFill (ColourGradient (Colour (0xff8d9093), c.x - 3.0f, 0.0f, Colour (0xfff7f7f5), c.x + 1.0f, 0.0f, false));
        g.fillPath (lever);
        g.setGradientFill (ColourGradient (Colour (0xffffffff), tip.x - 2.0f, tip.y - 2.0f, Colour (0xff7d8083), tip.x + 3.0f, tip.y + 3.0f, true));
        g.fillEllipse (Rectangle<float> (8.0f, 6.0f).withCentre (tip));
    }
} // namespace

void drawToggleButton (Graphics& g, ToggleButton& b, bool highlighted, bool down, Skin skin)
{
    const auto& L = look (skin);
    const bool on = b.getToggleState();
    const auto& props = b.getProperties();
    const bool live = props.getWithDefault (liveProperty, false);
    const bool compact = props.getWithDefault (compactProperty, false);
    const bool isSwitch = props.getWithDefault (switchProperty, false);
    const int icon = props.getWithDefault (iconProperty, -1);
    const auto text = b.getButtonText();
    const auto r = b.getLocalBounds().toFloat().reduced (2.0f);

    const auto capLegend = skin == Skin::deck ? Colour (0xffe8e8e4) : (skin == Skin::lab && live ? Colour (0xfffff2ec) : L.legend);

    // MONO / BYPASS: a toggle on the plate (RECEIVER, LAB) or a latching key with an amber LED (DECK)
    if (isSwitch && skin != Skin::deck)
    {
        const auto sw = Point<float> (r.getRight() - 22.0f, r.getCentreY());
        drawToggleSwitch (g, sw, on);
        drawLegend (g, text, r.withTrimmedLeft (8.0f).withRight (sw.x - 16.0f), Justification::centredLeft, skin, 12.0f);
        g.setFont (legendFont (skin, 7.5f));
        g.setColour (L.legendDim);
        g.drawText ("ON", Rectangle<float> (20.0f, 9.0f).withCentre (sw.translated (-15.0f, -9.0f)), Justification::centred, false);
        return;
    }

    if (compact)
    {
        const auto cap = drawKey (g, r, skin, false, highlighted, down, false);
        drawKeyLegend (g, text, cap, Justification::centred, legendFont (skin, 10.0f), capLegend);
        return;
    }

    const auto lit = live ? L.live : (isSwitch ? Colour (0xffffb000) : L.lamp);
    const auto cap = drawKey (g, r, skin, on, highlighted, down, live && skin == Skin::lab);
    auto textArea = cap.reduced (10.0f, 0.0f);
    auto just = Justification::centred;

    switch (skin)
    {
        case Skin::deck:
        {
            // a bar LED behind a small lens, set into the key's top-right, clear of the icon and legend
            const auto led = Rectangle<float> (13.0f, 3.5f).withPosition (cap.getRight() - 21.0f, cap.getY() + 5.0f);
            g.setColour (Colours::black.withAlpha (0.7f));
            g.fillRoundedRectangle (led.expanded (1.0f), 1.5f);
            if (on)
                for (auto [grow, alpha] : { std::pair { 4.0f, 0.10f }, { 2.0f, 0.22f } })
                {
                    g.setColour (lit.withAlpha (alpha));
                    g.fillRoundedRectangle (led.expanded (grow), 1.0f + grow);
                }
            g.setGradientFill (ColourGradient (on ? lit.brighter (0.5f) : lit.withMultipliedBrightness (0.26f), 0.0f, led.getY(),
                                               on ? lit : lit.withMultipliedBrightness (0.14f), 0.0f, led.getBottom(), false));
            g.fillRoundedRectangle (led, 1.0f);
            g.setColour (Colours::white.withAlpha (on ? 0.7f : 0.18f));
            g.fillRect (led.reduced (1.5f, 0.0f).withHeight (0.8f).translated (0.0f, 0.5f));
            textArea = textArea.withTrimmedRight (14.0f);
            break;
        }
        case Skin::receiver:
        {
            const auto lamp = Point<float> (cap.getX() + 11.0f, cap.getCentreY());
            drawLamp (g, lamp, 3.0f, lit, on, skin);
            textArea = cap.withTrimmedLeft (20.0f).withTrimmedRight (8.0f);
            break;
        }
        case Skin::lab:
        {
            if (! live)
            {
                const auto jewel = Point<float> (cap.getRight() - 11.0f, cap.getCentreY());
                drawLamp (g, jewel, 3.6f, lit, on, skin);
                textArea = cap.withTrimmedLeft (8.0f).withTrimmedRight (20.0f);
            }
            break;
        }
    }

    if (icon >= 0)
    {
        const auto iconBox = Rectangle<float> (cap.getHeight() * 0.62f, cap.getHeight() * 0.62f)
                                 .withCentre ({ textArea.getX() + cap.getHeight() * 0.32f, textArea.getCentreY() });
        drawDeviceIcon (g, icon, iconBox, capLegend.withMultipliedAlpha (0.8f));
        textArea = textArea.withLeft (iconBox.getRight() + 5.0f);
        just = Justification::centredLeft;
    }
    else if (live && skin == Skin::lab)
    {
        // ON AIR on LAB: a red key with a big jewel beside its legend
        drawLamp (g, { cap.getX() + 22.0f, cap.getCentreY() }, 5.0f, Colour (0xffffd2c8), on, skin);
    }

    const auto f = legendFont (skin, icon >= 0 ? 11.0f : 12.5f);
    const float fits = jmin (1.0f, textArea.getWidth() / jmax (1.0f, GlyphArrangement::getStringWidth (f, text.toUpperCase())));
    drawKeyLegend (g, text.toUpperCase(), textArea, just, f.withHorizontalScale (jmax (0.8f, fits)), capLegend);
}


} // namespace phonetesto::hw::gear
