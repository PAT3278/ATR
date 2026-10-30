#include "LevelMeter.h"
#include "HardwareStyle.h"
#include "DigitalStyle.h"

#include <juce_audio_basics/juce_audio_basics.h>

namespace phonetesto
{

void LevelMeter::update (float peakLeft, float peakRight, float dt)
{
    bool changed = false;
    const float peaks[2] = { peakLeft, peakRight };

    for (int i = 0; i < 2; ++i)
    {
        auto& s = sides[i];
        const float db = juce::Decibels::gainToDecibels (peaks[i], floorDb);
        const float previousLevel = s.level, previousHold = s.hold;

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

        changed |= std::abs (s.level - previousLevel) > 0.05f || std::abs (s.hold - previousHold) > 0.05f;
    }

    if (changed)
        repaint();
}

void LevelMeter::paint (juce::Graphics& g)
{
    using namespace juce;
    namespace c = hw::colours;

    if (hw::skinOf (*this) == hw::Skin::digital)
    {
        paintDigital (g);
        return;
    }

    const auto bounds = getLocalBounds().toFloat();
    g.setColour (c::screen);
    g.fillRoundedRectangle (bounds, 8.0f);
    g.setColour (c::divider);
    g.drawRoundedRectangle (bounds.reduced (0.5f), 8.0f, 1.0f);

    const float top = bounds.getY() + 36.0f, bottom = bounds.getBottom() - 28.0f;
    auto yFor = [&] (float db) { return jmap (jlimit (floorDb, 0.0f, db), floorDb, 0.0f, bottom, top); };
    auto zoneColour = [] (float db) { return db >= -1.0f ? c::meterHigh : db >= -9.0f ? c::meterMid : c::meterLow; };

    // dB scale
    g.setFont (hw::font (hw::Type::condensedSemiBold, 11.0f));
    for (float db : { 0.0f, -6.0f, -12.0f, -24.0f, -36.0f, -48.0f, -60.0f })
    {
        g.setColour (c::textFaint);
        g.drawText (String ((int) db), Rectangle<float> (bounds.getX() + 4.0f, yFor (db) - 6.0f, 24.0f, 12.0f),
                    Justification::centredRight, false);
    }

    const float barsX = bounds.getX() + 34.0f;
    const float barW = (bounds.getRight() - 8.0f - barsX - 6.0f) * 0.5f;
    constexpr float segment = 3.0f, pitch = 4.0f;

    for (int i = 0; i < 2; ++i)
    {
        const auto& s = sides[i];
        const float x = barsX + (float) i * (barW + 6.0f);

        for (float y = bottom - segment; y >= top - 0.5f; y -= pitch)
        {
            const float segDb = jmap (y + segment * 0.5f, bottom, top, floorDb, 0.0f);
            const auto colour = zoneColour (segDb);
            g.setColour (segDb <= s.level ? colour : colour.withAlpha (0.09f));
            g.fillRect (x, y, barW, segment);
        }

        if (s.hold > floorDb + 0.5f)
        {
            g.setColour (zoneColour (s.hold));
            g.fillRect (x, yFor (s.hold) - 1.0f, barW, 2.0f);
        }

        // held-peak readout above, channel letter below
        const auto readout = Rectangle<float> (x - 6.0f, bounds.getY() + 10.0f, barW + 12.0f, 16.0f);
        g.setFont (hw::font (hw::Type::condensedBold, 13.0f));
        g.setColour (s.hold >= -1.0f ? c::meterHigh : c::text);
        g.drawText (s.hold <= floorDb + 0.5f ? String (CharPointer_UTF8 ("\xe2\x80\x93")) : String (s.hold, 1),
                    readout, Justification::centred, false);

        hw::drawLabel (g, i == 0 ? "L" : "R", { x, bottom + 8.0f, barW, 14.0f }, Justification::centred, c::textDim, 12.0f);
    }
}

void LevelMeter::paintDigital (juce::Graphics& g)
{
    using namespace juce;
    namespace d = hw::digital;
    namespace c = hw::digital::colours;

    const auto bounds = getLocalBounds().toFloat().reduced (1.0f);
    d::drawGlass (g, bounds, 10.0f);
    g.setColour (Colour (0x66020816));
    g.fillRoundedRectangle (bounds.reduced (5.0f), 7.0f);

    const float top = bounds.getY() + 36.0f, bottom = bounds.getBottom() - 28.0f;
    auto yFor = [&] (float db) { return jmap (jlimit (floorDb, 0.0f, db), floorDb, 0.0f, bottom, top); };
    auto zoneColour = [] (float db) { return db >= -1.0f ? c::meterHigh : db >= -9.0f ? c::meterMid : c::meterLow; };

    g.setFont (hw::font (hw::Type::sansSemiBold, 10.0f, 0.04f));
    for (float db : { 0.0f, -6.0f, -12.0f, -24.0f, -36.0f, -48.0f, -60.0f })
    {
        g.setColour (c::textFaint);
        g.drawText (String ((int) db), Rectangle<float> (bounds.getX() + 3.0f, yFor (db) - 6.0f, 24.0f, 12.0f),
                    Justification::centredRight, false);
    }

    const float barsX = bounds.getX() + 33.0f;
    const float barW = (bounds.getRight() - 9.0f - barsX - 6.0f) * 0.5f;
    constexpr float segment = 2.0f, pitch = 3.0f;

    for (int i = 0; i < 2; ++i)
    {
        const auto& s = sides[i];
        const float x = barsX + (float) i * (barW + 6.0f);

        // glow behind the lit part of the bar
        if (s.level > floorDb + 0.5f)
        {
            const auto lit = Rectangle<float> (x, yFor (s.level), barW, bottom - yFor (s.level));
            g.setColour (zoneColour (s.level).withAlpha (0.10f));
            g.fillRoundedRectangle (lit.expanded (4.0f, 3.0f), 4.0f);
            g.setColour (zoneColour (s.level).withAlpha (0.16f));
            g.fillRoundedRectangle (lit.expanded (1.5f, 1.0f), 2.0f);
        }

        for (float y = bottom - segment; y >= top - 0.5f; y -= pitch)
        {
            const float segDb = jmap (y + segment * 0.5f, bottom, top, floorDb, 0.0f);
            g.setColour (segDb <= s.level ? zoneColour (segDb) : Colours::white.withAlpha (0.05f));
            g.fillRect (x, y, barW, segment);
        }

        if (s.hold > floorDb + 0.5f)
        {
            const auto colour = zoneColour (s.hold);
            g.setColour (colour.withAlpha (0.3f));
            g.fillRect (x - 2.0f, yFor (s.hold) - 3.0f, barW + 4.0f, 6.0f);
            g.setColour (Colours::white);
            g.fillRect (x, yFor (s.hold) - 1.0f, barW, 2.0f);
        }

        const auto readout = Rectangle<float> (x - 8.0f, bounds.getY() + 10.0f, barW + 16.0f, 16.0f);
        d::drawGlowText (g, s.hold <= floorDb + 0.5f ? String (CharPointer_UTF8 ("\xe2\x80\x93")) : String (s.hold, 1),
                         readout, Justification::centred, hw::font (hw::Type::condensedBold, 13.0f),
                         s.hold >= -1.0f ? c::meterHigh : c::text, 0.5f);

        d::drawLabel (g, i == 0 ? "L" : "R", { x, bottom + 8.0f, barW, 14.0f }, Justification::centred, c::textDim, 11.0f);
    }
}

} // namespace phonetesto
