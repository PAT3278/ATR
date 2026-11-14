#include "DisplayWindow.h"
#include "HardwareStyle.h"
#include "GearStyle.h"
#include "SpeakerProfiles.h"

#include <juce_dsp/juce_dsp.h>

namespace phonetesto
{

namespace
{
    constexpr float minHz = 20.0f, maxHz = 20000.0f;
    constexpr float topDb = 6.0f, bottomDb = -42.0f;
    constexpr float padding = 16.0f, titleHeight = 32.0f;

    float xForHz (juce::Rectangle<float> area, float hz)
    {
        return area.getX() + area.getWidth() * std::log (hz / minHz) / std::log (maxHz / minHz);
    }

    float yForDb (juce::Rectangle<float> area, float db)
    {
        return juce::jmap (juce::jlimit (bottomDb, topDb, db), topDb, bottomDb, area.getY(), area.getBottom());
    }
} // namespace

DisplayWindow::DisplayWindow()
{
    addChildComponent (qr);

    password.setFont (hw::font (hw::Type::condensedSemiBold, 17.0f, 0.08f));
    password.setJustification (juce::Justification::centredLeft);
    password.setIndents (10, 4);
    password.setTextToShowWhenEmpty ("AUTO", juce::Colours::grey);
    password.setInputRestrictions (32);
    addChildComponent (password);

    rebuildCurve();
}

void DisplayWindow::setAutoCode (const juce::String& code)
{
    // With no password typed, phones use this code (it's inside the QR code).
    autoCode = code;
    lookAndFeelChanged();
}

void DisplayWindow::lookAndFeelChanged()
{
    const auto trace = hw::gear::look (hw::skinOf (*this)).trace;

    password.setColour (juce::TextEditor::textColourId, trace);
    password.setFont (hw::font (hw::Type::condensedSemiBold, 17.0f, 0.08f));
    password.applyFontToAllText (password.getFont());
    password.applyColourToAllText (trace);
    password.setTextToShowWhenEmpty (autoCode.isNotEmpty() ? autoCode : juce::String ("AUTO"), trace.withAlpha (0.45f));
    repaint();
}

void DisplayWindow::setProfile (int index)
{
    if (index == profile)
        return;

    profile = index;
    rebuildCurve();
    repaint();
}

void DisplayWindow::setLive (bool isLive, const juce::String& newUrl, int listeners, bool startFailed)
{
    if (isLive == live && newUrl == url && listeners == listenerCount && startFailed == failed)
        return;

    const bool layoutChanged = (isLive != live);
    live = isLive;
    url = newUrl;
    listenerCount = listeners;
    failed = startFailed;

    qr.setText (live && ! failed ? url : juce::String());
    qr.setVisible (live && ! failed);
    password.setVisible (live && ! failed);

    if (layoutChanged)
        resized();

    repaint();
}

juce::Rectangle<float> DisplayWindow::contentArea() const
{
    return getLocalBounds().toFloat().reduced (padding).withTrimmedTop (titleHeight);
}

juce::Rectangle<float> DisplayWindow::plotArea() const
{
    return contentArea().withTrimmedBottom (18.0f);
}

void DisplayWindow::resized()
{
    const auto inner = contentArea();
    const float qrSize = juce::jmin (inner.getHeight(), inner.getWidth() * 0.45f);
    qr.setBounds (inner.withWidth (qrSize).withHeight (qrSize).toNearestInt());

    const auto column = inner.withTrimmedLeft (qrSize + 24.0f);
    password.setBounds (juce::Rectangle<float> (column.getX(), column.getY() + 70.0f,
                                                juce::jmin (200.0f, column.getWidth()), 30.0f).toNearestInt());

    rebuildCurve();
}

void DisplayWindow::rebuildCurve()
{
    curve.clear();
    const auto area = plotArea();
    if (area.getWidth() < 4.0f)
        return;

    const auto& p = getSpeakerProfiles()[(size_t) juce::jlimit (0, (int) getSpeakerProfiles().size() - 1, profile)];
    constexpr double sr = 48000.0;
    using Coeffs = juce::dsp::IIR::Coefficients<double>;
    const auto hp = Coeffs::makeHighPass (sr, p.highpassHz, 0.7071);
    const auto pk = Coeffs::makePeakFilter (sr, p.peakHz, p.peakQ, juce::Decibels::decibelsToGain ((double) p.peakGainDb));
    const auto lp = Coeffs::makeLowPass (sr, p.lowpassHz, 0.7071);

    const int n = juce::jmax (2, (int) area.getWidth());
    std::vector<float> db ((size_t) n);
    float peak = -1000.0f;

    for (int i = 0; i < n; ++i)
    {
        const double hz = minHz * std::pow ((double) (maxHz / minHz), (double) i / (double) (n - 1));
        const double hpMag = hp->getMagnitudeForFrequency (hz, sr);
        const double mag = hpMag * hpMag * pk->getMagnitudeForFrequency (hz, sr) * lp->getMagnitudeForFrequency (hz, sr);
        db[(size_t) i] = (float) juce::Decibels::gainToDecibels (mag, -200.0);
        peak = juce::jmax (peak, db[(size_t) i]);
    }

    // Shape, not level: normalise so the loudest point sits at 0 dB.
    for (int i = 0; i < n; ++i)
    {
        const float x = area.getX() + area.getWidth() * (float) i / (float) (n - 1);
        const float y = yForDb (area, db[(size_t) i] - peak);
        if (i == 0) curve.startNewSubPath (x, y);
        else        curve.lineTo (x, y);
    }
}

void DisplayWindow::paintGraticule (juce::Graphics& g, juce::Rectangle<float> area)
{
    using namespace juce;
    const auto skin = hw::skinOf (*this);
    const auto trace = hw::gear::look (skin).trace;
    const auto small = hw::font (hw::Type::condensedSemiBold, 10.0f, 0.04f);
    g.setFont (small);

    if (skin == hw::Skin::lab)
    {
        // a CRT graticule: 10 x 6 divisions, minor ticks on the centre lines
        g.setColour (trace.withAlpha (0.16f));
        for (int i = 0; i <= 10; ++i)
            g.drawVerticalLine ((int) (area.getX() + area.getWidth() * (float) i / 10.0f), area.getY(), area.getBottom());
        for (int j = 0; j <= 6; ++j)
            g.drawHorizontalLine ((int) (area.getY() + area.getHeight() * (float) j / 6.0f), area.getX(), area.getRight());

        g.setColour (trace.withAlpha (0.28f));
        const float cx = area.getCentreX(), cy = area.getCentreY();
        for (int i = 0; i <= 50; ++i)
        {
            const float x = area.getX() + area.getWidth() * (float) i / 50.0f;
            g.drawVerticalLine ((int) x, cy - 2.0f, cy + 2.0f);
        }
        for (int j = 0; j <= 30; ++j)
        {
            const float y = area.getY() + area.getHeight() * (float) j / 30.0f;
            g.drawHorizontalLine ((int) y, cx - 2.0f, cx + 2.0f);
        }
        return;
    }

    if (skin == hw::Skin::receiver)
    {
        // a tuning-dial scale along the bottom: long and short ticks, and frequencies
        const float base = area.getBottom() + 4.0f;
        g.setColour (trace.withAlpha (0.55f));
        g.drawHorizontalLine ((int) base, area.getX(), area.getRight());
        for (float decade : { 10.0f, 100.0f, 1000.0f, 10000.0f })
            for (int m = 1; m <= 9; ++m)
            {
                const float hz = decade * (float) m;
                if (hz < minHz || hz > maxHz) continue;
                const float x = xForHz (area, hz);
                g.drawVerticalLine ((int) x, base - (m == 1 ? 7.0f : m == 5 ? 5.0f : 3.0f), base);
            }
        for (auto [hz, label] : { std::pair<float, const char*> { 20.0f, "20" }, { 50.0f, "50" }, { 100.0f, "100" }, { 200.0f, "200" },
                                  { 500.0f, "500" }, { 1000.0f, "1k" }, { 2000.0f, "2k" }, { 5000.0f, "5k" }, { 10000.0f, "10k" }, { 20000.0f, "20k" } })
            g.drawText (label, Rectangle<float> (30.0f, 12.0f).withCentre ({ xForHz (area, hz), base + 9.0f }), Justification::centred, false);
        return;
    }

    // DECK: a VFD's faint dot grid, and its printed frequency legends
    g.setColour (trace.withAlpha (0.07f));
    for (float y = area.getY(); y <= area.getBottom(); y += 6.0f)
        for (float x = area.getX(); x <= area.getRight(); x += 6.0f)
            g.fillRect (x, y, 1.2f, 1.2f);
    g.setColour (trace.withAlpha (0.5f));
    for (auto [hz, label] : { std::pair<float, const char*> { 100.0f, "100" }, { 1000.0f, "1k" }, { 10000.0f, "10k" } })
        g.drawText (label, Rectangle<float> (40.0f, 12.0f).withCentre ({ xForHz (area, hz), area.getBottom() + 10.0f }), Justification::centred, false);
    for (float db : { 0.0f, -12.0f, -24.0f, -36.0f })
        g.drawText (String ((int) db), Rectangle<float> (area.getX() + 2.0f, yForDb (area, db) - 12.0f, 30.0f, 11.0f), Justification::left, false);
}

void DisplayWindow::paint (juce::Graphics& g)
{
    using namespace juce;
    const auto skin = hw::skinOf (*this);
    const auto& look = hw::gear::look (skin);
    const auto trace = look.trace;

    const auto bounds = getLocalBounds().toFloat().reduced (2.0f);
    hw::gear::drawWindow (g, bounds, skin, skin == hw::Skin::lab ? 12.0f : 3.0f);

    if (skin == hw::Skin::lab)
    {
        // the CRT's face: slightly lit in the middle, darker toward its curved edges
        const auto tube = bounds.reduced (6.0f);
        g.setGradientFill (ColourGradient (Colour (0xff0b1a10), tube.getCentreX(), tube.getCentreY(),
                                           Colour (0xff020503), tube.getX(), tube.getY(), true));
        g.fillRoundedRectangle (tube, 14.0f);
    }

    const auto title = bounds.reduced (padding, 0.0f).withTrimmedTop (padding - 4.0f).withHeight (24.0f);
    const auto titleFont = hw::font (hw::Type::condensedSemiBold, 13.0f, 0.10f);

    auto glowText = [&] (const String& text, Rectangle<float> area, Justification just, const Font& f, Colour c)
    {
        g.setFont (f);
        g.setColour (c.withAlpha (0.25f));
        for (auto [dx, dy] : { std::pair { -0.8f, 0.0f }, { 0.8f, 0.0f }, { 0.0f, -0.8f }, { 0.0f, 0.8f } })
            g.drawText (text, area.translated (dx, dy), just, false);
        g.setColour (c);
        g.drawText (text, area, just, false);
    };

    if (! live)
    {
        glowText ("RESPONSE", title, Justification::centredLeft, titleFont, trace.withAlpha (0.7f));
        const auto& p = getSpeakerProfiles()[(size_t) jlimit (0, (int) getSpeakerProfiles().size() - 1, profile)];
        glowText (String (p.name).toUpperCase(), title, Justification::centredRight, hw::font (hw::Type::condensedSemiBold, 16.0f, 0.08f), trace);

        const auto area = plotArea();
        paintGraticule (g, area);

        Path fill (curve);
        fill.lineTo (area.getRight(), area.getBottom());
        fill.lineTo (area.getX(), area.getBottom());
        fill.closeSubPath();
        g.setGradientFill (ColourGradient (trace.withAlpha (skin == hw::Skin::receiver ? 0.18f : 0.10f), 0.0f, area.getY(),
                                           trace.withAlpha (0.0f), 0.0f, area.getBottom(), false));
        g.fillPath (fill);

        // the trace, with the glow a VFD, a lamp or phosphor gives it
        for (auto [width, alpha] : { std::pair { 9.0f, 0.06f }, { 5.0f, 0.12f }, { 2.6f, 0.3f } })
        {
            g.setColour (trace.withAlpha (alpha));
            g.strokePath (curve, PathStrokeType (width, PathStrokeType::curved, PathStrokeType::rounded));
        }
        g.setColour (trace.interpolatedWith (Colours::white, 0.35f));
        g.strokePath (curve, PathStrokeType (1.4f, PathStrokeType::curved, PathStrokeType::rounded));
        return;
    }

    glowText ("SCAN TO LISTEN", title, Justification::centredLeft, titleFont, trace);

    if (failed)
    {
        glowText ("COULDN'T OPEN A NETWORK PORT. ANOTHER APP MAY BE USING IT.", contentArea(), Justification::centred,
                  hw::font (hw::Type::condensedSemiBold, 15.0f, 0.06f), trace);
        return;
    }

    // the QR code stays black on white so it scans: a white card behind it
    g.setColour (Colours::white);
    g.fillRoundedRectangle (qr.getBounds().toFloat().expanded (3.0f), 2.0f);

    const auto column = contentArea().withTrimmedLeft ((float) qr.getWidth() + 24.0f);
    const auto labelFont = hw::font (hw::Type::condensedSemiBold, 11.0f, 0.10f);

    glowText ("ADDRESS", column.withHeight (14.0f), Justification::centredLeft, labelFont, trace.withAlpha (0.6f));
    glowText (url.fromFirstOccurrenceOf ("://", false, false).upToFirstOccurrenceOf ("/", false, false),
              column.withTrimmedTop (16.0f).withHeight (28.0f), Justification::centredLeft,
              hw::font (hw::Type::condensedSemiBold, 22.0f, 0.04f), trace);

    glowText ("PASSWORD", { column.getX(), (float) password.getY() - 16.0f, column.getWidth(), 14.0f },
              Justification::centredLeft, labelFont, trace.withAlpha (0.6f));

    const auto listening = Rectangle<float> (column.getX(), (float) password.getBottom() + 10.0f, column.getWidth(), 14.0f);
    glowText ("LISTENING", listening, Justification::centredLeft, labelFont, trace.withAlpha (0.6f));
    hw::gear::drawSevenSegment (g, String (listenerCount).paddedLeft (' ', 2), listening.translated (0.0f, 17.0f).withHeight (30.0f).withWidth (60.0f),
                                Justification::centredLeft, trace, 22.0f);
}

} // namespace phonetesto
