#include "LevelMeter.h"
#include "HardwareStyle.h"
#include "GearStyle.h"

#include <juce_audio_basics/juce_audio_basics.h>

namespace phonetesto
{

namespace
{
    constexpr float vuSweep = 0.78f; // RECEIVER's VU needle: radians either side of centre
}

void LevelMeter::update (float peakLeft, float peakRight, float dt)
{
    bool changed = false;
    const float peaks[2] = { peakLeft, peakRight };

    for (int i = 0; i < 2; ++i)
    {
        auto& s = sides[i];
        const float db = juce::Decibels::gainToDecibels (peaks[i], floorDb);
        const float previousLevel = s.level, previousHold = s.hold, previousVu = s.vu;

        s.level = db > s.level ? db : juce::jmax (db, s.level - 24.0f * dt); // instant attack, 24 dB/s release

        if (db >= s.hold)
        {
            s.hold = db;
            s.holdAge = 0.0f;
        }
        else if ((s.holdAge += dt) > 1.5f)
        {
            s.hold = juce::jmax (floorDb, s.hold - 30.0f * dt);
        }

        // VU needle: -18 dBFS reads 0 VU; ~300 ms to settle, like a real movement
        const float target = juce::jlimit (-22.0f, 4.0f, s.level + 18.0f);
        s.vu += (target - s.vu) * juce::jmin (1.0f, dt / 0.09f);

        changed |= std::abs (s.level - previousLevel) > 0.05f || std::abs (s.hold - previousHold) > 0.05f
                    || std::abs (s.vu - previousVu) > 0.03f;
    }

    if (changed)
        repaint();
}

void LevelMeter::paint (juce::Graphics& g)
{
    switch (hw::skinOf (*this))
    {
        case hw::Skin::receiver: paintNeedles (g); break;
        case hw::Skin::lab:      paintLadder (g, true); break;
        case hw::Skin::deck:     paintLadder (g, false); break;
    }
}

void LevelMeter::paintLadder (juce::Graphics& g, bool lab)
{
    using namespace juce;
    const auto skin = lab ? hw::Skin::lab : hw::Skin::deck;
    const auto& look = hw::gear::look (skin);

    const auto bounds = getLocalBounds().toFloat().reduced (2.0f);
    hw::gear::drawWindow (g, bounds, skin);

    const float top = bounds.getY() + 34.0f, bottom = bounds.getBottom() - 24.0f;
    auto yFor = [&] (float db) { return jmap (jlimit (floorDb, 0.0f, db), floorDb, 0.0f, bottom, top); };

    // DECK: green, amber, red LEDs. LAB: all red, like an instrument's bar display.
    auto zoneColour = [lab] (float db)
    {
        if (lab) return Colour (0xffff3b22);
        return db >= -1.0f ? Colour (0xffff3324) : db >= -9.0f ? Colour (0xffffb000) : Colour (0xff46f56e);
    };

    g.setFont (hw::font (hw::Type::condensedSemiBold, 9.5f));
    for (float db : { 0.0f, -6.0f, -12.0f, -24.0f, -36.0f, -48.0f, -60.0f })
    {
        g.setColour (Colours::white.withAlpha (0.45f));
        g.drawText (String ((int) -db), Rectangle<float> (bounds.getX() + 2.0f, yFor (db) - 6.0f, 20.0f, 12.0f),
                    Justification::centredRight, false);
    }

    const float barsX = bounds.getX() + 27.0f;
    const float barW = (bounds.getRight() - 8.0f - barsX - 6.0f) * 0.5f;
    constexpr float segment = 2.0f, pitch = 3.0f;

    for (int i = 0; i < 2; ++i)
    {
        const auto& s = sides[i];
        const float x = barsX + (float) i * (barW + 6.0f);

        for (float y = bottom - segment; y >= top - 0.5f; y -= pitch)
        {
            const float segDb = jmap (y + segment * 0.5f, bottom, top, floorDb, 0.0f);
            const auto colour = zoneColour (segDb);
            const bool on = segDb <= s.level || std::abs (segDb - s.hold) < 0.9f;
            g.setColour (on ? colour : colour.withMultipliedBrightness (0.16f));
            g.fillRect (x, y, barW, segment);
        }

        // held peak, in seven segments over each bar
        const auto readout = Rectangle<float> (x - 6.0f, bounds.getY() + 9.0f, barW + 12.0f, 14.0f);
        hw::gear::drawSevenSegment (g, s.hold <= floorDb + 0.5f ? String ("--") : String (roundToInt (-s.hold)),
                                    readout, Justification::centred, lab ? look.segment : zoneColour (s.hold), 9.0f);

        g.setFont (hw::font (hw::Type::condensedBold, 10.0f));
        g.setColour (Colours::white.withAlpha (0.55f));
        g.drawText (i == 0 ? "L" : "R", Rectangle<float> (x, bottom + 6.0f, barW, 12.0f), Justification::centred, false);
    }
}

void LevelMeter::paintNeedles (juce::Graphics& g)
{
    using namespace juce;
    const auto skin = hw::Skin::receiver;

    const auto bounds = getLocalBounds().toFloat().reduced (2.0f);
    const float gap = 10.0f;
    const float h = (bounds.getHeight() - gap) * 0.5f;

    for (int i = 0; i < 2; ++i)
    {
        const auto& s = sides[i];
        const auto box = bounds.withHeight (h).translated (0.0f, (float) i * (h + gap));
        hw::gear::drawWindow (g, box, skin, 4.0f);

        // the lamp-lit face: warm paper, brightest in the middle
        const auto face = box.reduced (4.0f);
        {
            Graphics::ScopedSaveState state (g);
            g.reduceClipRegion (face.toNearestInt());
            g.setGradientFill (ColourGradient (Colour (0xffffd98e), face.getCentreX(), face.getY() + face.getHeight() * 0.55f,
                                               Colour (0xffb5661e), face.getX() - 10.0f, face.getBottom(), true));
            g.fillRect (face);

            // scale arc from -20 to +3 VU round a pivot low on the face
            const float radius = (face.getWidth() - 16.0f) / (2.0f * std::sin (vuSweep));
            const auto pivot = Point<float> (face.getCentreX(), face.getY() + face.getHeight() * 0.88f);
            auto angleFor = [] (float vu) -> float
            {
                // deflection follows voltage, as on a real VU movement
                const float p = std::pow (10.0f, jlimit (-22.0f, 4.0f, vu) / 20.0f) / std::pow (10.0f, 3.0f / 20.0f);
                return -vuSweep + 2.0f * vuSweep * jlimit (0.0f, 1.04f, p);
            };
            auto at = [&] (float vu, float r) -> Point<float> { const float a = angleFor (vu); return pivot.getPointOnCircumference (r, a); };

            Path arc, red;
            arc.startNewSubPath (at (-20.0f, radius));
            for (int k = 1; k <= 80; ++k)
                arc.lineTo (at (-20.0f + 0.25f * (float) k, radius));
            red.startNewSubPath (at (0.0f, radius));
            for (int k = 1; k <= 12; ++k)
                red.lineTo (at (0.25f * (float) k, radius));
            g.setColour (Colour (0xff2a1a0e));
            g.strokePath (arc, PathStrokeType (1.2f));
            g.setColour (Colour (0xffc2271b));
            g.strokePath (red, PathStrokeType (3.0f));

            g.setFont (hw::font (hw::Type::condensedSemiBold, 7.5f));
            for (int v : { -20, -10, -7, -5, -3, -1, 0, 1, 2, 3 })
            {
                const float vu = (float) v;
                Path tick;
                tick.startNewSubPath (at (vu, radius));
                tick.lineTo (at (vu, radius + 4.0f));
                g.setColour (vu > 0.0f ? Colour (0xffc2271b) : Colour (0xff2a1a0e));
                g.strokePath (tick, PathStrokeType (1.0f));
                if (v == -20 || v == -10 || v == -5 || v == 0 || v == 3)
                    g.drawText (v > 0 ? "+" + String (v) : String (v),
                                Rectangle<float> (16.0f, 8.0f).withCentre (at (vu, radius + 9.5f)), Justification::centred, false);
            }

            g.setColour (Colour (0xff2a1a0e));
            g.setFont (hw::font (hw::Type::sansSemiBold, 10.0f, 0.06f));
            g.drawText ("VU", Rectangle<float> (face.getX(), pivot.y - radius * 0.62f, face.getWidth(), 12.0f), Justification::centred, false);
            g.setFont (hw::font (hw::Type::sansSemiBold, 15.0f, 0.04f));
            g.drawText (i == 0 ? "L" : "R", Rectangle<float> (face.getX(), face.getY() + 8.0f, face.getWidth(), 18.0f), Justification::centred, false);

            // peak lamp
            const bool peak = s.hold >= -1.0f;
            g.setFont (hw::font (hw::Type::sansSemiBold, 7.0f, 0.08f));
            g.drawText ("PEAK", Rectangle<float> (face.getX(), face.getY() + 36.0f, face.getWidth(), 9.0f), Justification::centred, false);
            hw::gear::drawLamp (g, { face.getCentreX(), face.getY() + 51.0f }, 2.6f, Colour (0xffff3a22), peak, hw::Skin::deck);

            // the needle and its shadow
            Path needle;
            needle.startNewSubPath (pivot);
            const float needleAngle = angleFor (s.vu);
            needle.lineTo (pivot.getPointOnCircumference (radius + 6.0f, needleAngle));
            g.setColour (Colours::black.withAlpha (0.18f));
            g.strokePath (needle, PathStrokeType (1.4f), AffineTransform::translation (2.0f, 1.5f));
            g.setColour (Colour (0xff1a120b));
            g.strokePath (needle, PathStrokeType (1.2f));

            // the movement's cover over the pivot
            g.setColour (Colour (0xff1c140d));
            g.fillEllipse (Rectangle<float> (16.0f, 16.0f).withCentre (pivot));
            g.fillRect (face.withTop (pivot.y));
        }
    }
}

} // namespace phonetesto
