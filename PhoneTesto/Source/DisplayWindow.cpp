#include "DisplayWindow.h"
#include "HardwareStyle.h"
#include "DigitalStyle.h"
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

    password.setColour (juce::TextEditor::textColourId, hw::colours::text);
    password.setFont (hw::font (hw::Type::condensedBold, 17.0f, 0.06f));
    password.setJustification (juce::Justification::centredLeft);
    password.setIndents (10, 4);
    password.setTextToShowWhenEmpty ("AUTO", hw::colours::textFaint);
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
    const bool digitalSkin = hw::skinOf (*this) == hw::Skin::digital;
    const auto text = digitalSkin ? hw::digital::colours::text : hw::colours::text;
    const auto dim = digitalSkin ? hw::digital::colours::textDim : hw::colours::textDim;

    password.setColour (juce::TextEditor::textColourId, text);
    password.setFont (digitalSkin ? hw::font (hw::Type::digitalSemiBold, 14.0f, 0.06f)
                                  : hw::font (hw::Type::condensedBold, 17.0f, 0.06f));
    password.applyFontToAllText (password.getFont());
    password.applyColourToAllText (text);
    password.setTextToShowWhenEmpty (autoCode.isNotEmpty() ? autoCode : juce::String ("AUTO"), dim);
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

void DisplayWindow::paint (juce::Graphics& g)
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

    const auto title = bounds.reduced (padding, 0.0f).withTrimmedTop (padding - 4.0f).withHeight (24.0f);
    const auto small = hw::font (hw::Type::condensedSemiBold, 12.0f, 0.04f);

    if (! live)
    {
        hw::drawLabel (g, "Response", title, Justification::centredLeft);

        const auto& p = getSpeakerProfiles()[(size_t) jlimit (0, (int) getSpeakerProfiles().size() - 1, profile)];
        g.setColour (c::text);
        g.setFont (hw::font (hw::Type::condensedBold, 19.0f, 0.04f));
        g.drawText (String (p.name).toUpperCase(), title, Justification::centredRight, false);

        const auto area = plotArea();
        g.setFont (small);

        for (float hz : { 50.0f, 200.0f, 500.0f, 2000.0f, 5000.0f, 20000.0f })
        {
            g.setColour (Colours::white.withAlpha (0.04f));
            g.drawVerticalLine ((int) xForHz (area, hz), area.getY(), area.getBottom());
        }

        for (auto [hz, label] : { std::pair<float, const char*> { 100.0f, "100" }, { 1000.0f, "1k" }, { 10000.0f, "10k" } })
        {
            const float x = xForHz (area, hz);
            g.setColour (Colours::white.withAlpha (0.08f));
            g.drawVerticalLine ((int) x, area.getY(), area.getBottom());
            g.setColour (c::textFaint);
            g.drawText (label, Rectangle<float> (40.0f, 14.0f).withCentre ({ x, area.getBottom() + 10.0f }), Justification::centred, false);
        }

        for (float db : { 0.0f, -12.0f, -24.0f, -36.0f })
        {
            const float y = yForDb (area, db);
            g.setColour (Colours::white.withAlpha (juce::exactlyEqual (db, 0.0f) ? 0.08f : 0.04f));
            g.drawHorizontalLine ((int) y, area.getX(), area.getRight());
            g.setColour (c::textFaint);
            g.drawText (String ((int) db), Rectangle<float> (area.getX() + 2.0f, y - 13.0f, 30.0f, 12.0f), Justification::left, false);
        }

        Path fill (curve);
        fill.lineTo (area.getRight(), area.getBottom());
        fill.lineTo (area.getX(), area.getBottom());
        fill.closeSubPath();
        g.setGradientFill (ColourGradient (c::accent.withAlpha (0.20f), 0.0f, area.getY(),
                                           c::accent.withAlpha (0.0f), 0.0f, area.getBottom(), false));
        g.fillPath (fill);

        g.setColour (c::accent);
        g.strokePath (curve, PathStrokeType (2.2f, PathStrokeType::curved, PathStrokeType::rounded));
        return;
    }

    hw::drawLabel (g, "Scan to listen", title, Justification::centredLeft, c::accent);

    if (failed)
    {
        g.setColour (c::text);
        g.setFont (hw::font (hw::Type::condensedBold, 18.0f, 0.04f));
        g.drawFittedText ("COULDN'T OPEN A NETWORK PORT.\nANOTHER APP MAY BE USING IT.",
                          contentArea().toNearestInt(), Justification::centred, 3);
        return;
    }

    const auto column = contentArea().withTrimmedLeft ((float) qr.getWidth() + 24.0f);

    hw::drawLabel (g, "Address", column.withHeight (14.0f), Justification::centredLeft, c::textDim, 12.0f);
    g.setColour (c::text);
    g.setFont (hw::font (hw::Type::condensedBold, 24.0f, 0.02f));
    g.drawFittedText (url.fromFirstOccurrenceOf ("://", false, false).upToFirstOccurrenceOf ("/", false, false),
                      column.withTrimmedTop (16.0f).withHeight (28.0f).toNearestInt(), Justification::centredLeft, 1, 0.8f);

    hw::drawLabel (g, "Password", { column.getX(), (float) password.getY() - 16.0f, column.getWidth(), 14.0f },
                   Justification::centredLeft, c::textDim, 12.0f);

    const auto listening = Rectangle<float> (column.getX(), (float) password.getBottom() + 10.0f, column.getWidth(), 14.0f);
    hw::drawLabel (g, "Listening", listening, Justification::centredLeft, c::textDim, 12.0f);
    g.setColour (listenerCount > 0 ? c::accent : c::textFaint);
    g.setFont (hw::font (hw::Type::condensedBold, 32.0f));
    g.drawText (String (listenerCount), listening.translated (0.0f, 14.0f).withHeight (32.0f), Justification::centredLeft, false);
}

void DisplayWindow::paintDigital (juce::Graphics& g)
{
    using namespace juce;
    namespace d = hw::digital;
    namespace c = hw::digital::colours;

    const auto bounds = getLocalBounds().toFloat().reduced (1.0f);
    d::drawGlass (g, bounds, 10.0f);

    // a darker screen inside the glass, so the plot reads clearly
    g.setColour (Colour (0x66020816));
    g.fillRoundedRectangle (bounds.reduced (5.0f), 7.0f);

    const auto title = bounds.reduced (padding, 0.0f).withTrimmedTop (padding - 4.0f).withHeight (24.0f);
    const auto small = hw::font (hw::Type::sansSemiBold, 11.0f, 0.06f);

    if (! live)
    {
        d::drawLabel (g, "Response", title, Justification::centredLeft);

        const auto& p = getSpeakerProfiles()[(size_t) jlimit (0, (int) getSpeakerProfiles().size() - 1, profile)];
        d::drawGlowText (g, String (p.name).toUpperCase(), title, Justification::centredRight,
                         hw::font (hw::Type::digitalSemiBold, 14.0f, 0.06f), c::text);

        const auto area = plotArea();
        g.setFont (small);

        for (float hz : { 50.0f, 200.0f, 500.0f, 2000.0f, 5000.0f, 20000.0f })
        {
            g.setColour (c::accent.withAlpha (0.05f));
            g.drawVerticalLine ((int) xForHz (area, hz), area.getY(), area.getBottom());
        }

        for (auto [hz, label] : { std::pair<float, const char*> { 100.0f, "100" }, { 1000.0f, "1k" }, { 10000.0f, "10k" } })
        {
            const float x = xForHz (area, hz);
            g.setColour (c::accent.withAlpha (0.12f));
            g.drawVerticalLine ((int) x, area.getY(), area.getBottom());
            g.setColour (c::textFaint);
            g.drawText (label, Rectangle<float> (40.0f, 14.0f).withCentre ({ x, area.getBottom() + 10.0f }), Justification::centred, false);
        }

        for (float db : { 0.0f, -12.0f, -24.0f, -36.0f })
        {
            const float y = yForDb (area, db);
            g.setColour (c::accent.withAlpha (juce::exactlyEqual (db, 0.0f) ? 0.14f : 0.06f));
            g.drawHorizontalLine ((int) y, area.getX(), area.getRight());
            g.setColour (c::textFaint);
            g.drawText (String ((int) db), Rectangle<float> (area.getX() + 2.0f, y - 13.0f, 30.0f, 12.0f), Justification::left, false);
        }

        Path fill (curve);
        fill.lineTo (area.getRight(), area.getBottom());
        fill.lineTo (area.getX(), area.getBottom());
        fill.closeSubPath();
        g.setGradientFill (ColourGradient (c::accent.withAlpha (0.28f), 0.0f, area.getY(),
                                           c::accent.withAlpha (0.0f), 0.0f, area.getBottom(), false));
        g.fillPath (fill);

        d::strokeGlow (g, curve, c::accent, 2.0f);
        return;
    }

    d::drawLabel (g, "Scan to listen", title, Justification::centredLeft, c::accent);

    if (failed)
    {
        g.setColour (c::text);
        g.setFont (hw::font (hw::Type::sansBold, 15.0f, 0.06f));
        g.drawFittedText ("COULDN'T OPEN A NETWORK PORT.\nANOTHER APP MAY BE USING IT.",
                          contentArea().toNearestInt(), Justification::centred, 3);
        return;
    }

    // halo behind the QR code (the code itself stays black on white so it scans)
    const auto qrArea = qr.getBounds().toFloat();
    for (auto [grow, alpha] : { std::pair { 10.0f, 0.06f }, { 5.0f, 0.12f } })
    {
        g.setColour (c::accent.withAlpha (alpha));
        g.fillRoundedRectangle (qrArea.expanded (grow), 6.0f + grow);
    }

    const auto column = contentArea().withTrimmedLeft ((float) qr.getWidth() + 24.0f);

    d::drawLabel (g, "Address", column.withHeight (14.0f), Justification::centredLeft, c::textDim, 11.0f);
    d::drawGlowText (g, url.fromFirstOccurrenceOf ("://", false, false).upToFirstOccurrenceOf ("/", false, false),
                     column.withTrimmedTop (16.0f).withHeight (28.0f), Justification::centredLeft,
                     hw::font (hw::Type::digitalSemiBold, 17.0f, 0.04f), c::text);

    d::drawLabel (g, "Password", { column.getX(), (float) password.getY() - 16.0f, column.getWidth(), 14.0f },
                  Justification::centredLeft, c::textDim, 11.0f);

    const auto listening = Rectangle<float> (column.getX(), (float) password.getBottom() + 10.0f, column.getWidth(), 14.0f);
    d::drawLabel (g, "Listening", listening, Justification::centredLeft, c::textDim, 11.0f);
    d::drawGlowText (g, String (listenerCount), listening.translated (0.0f, 16.0f).withHeight (32.0f), Justification::centredLeft,
                     hw::font (hw::Type::digitalBold, 26.0f), listenerCount > 0 ? c::accent : c::textDim,
                     listenerCount > 0 ? 1.0f : 0.0f);
}

} // namespace phonetesto
