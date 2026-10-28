#include "DisplayWindow.h"
#include "HardwareStyle.h"
#include "SpeakerProfiles.h"

#include <juce_dsp/juce_dsp.h>

namespace phonetesto
{

namespace
{
    constexpr float minHz = 20.0f, maxHz = 20000.0f;
    constexpr float topDb = 6.0f, bottomDb = -42.0f;

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

    password.setColour (juce::TextEditor::textColourId, hw::colours::amber);
    password.setFont (hw::font (hw::Type::condensedBold, 16.0f, 0.06f));
    password.setJustification (juce::Justification::centredLeft);
    password.setIndents (7, 3);
    password.setTextToShowWhenEmpty ("NONE", hw::colours::amberDim);
    password.setInputRestrictions (32);
    addChildComponent (password);

    rebuildCurve();
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

    qr.setText (live ? url : juce::String());
    qr.setVisible (live);
    password.setVisible (live);

    if (layoutChanged)
        resized();

    repaint();
}

juce::Rectangle<float> DisplayWindow::glassArea() const
{
    return getLocalBounds().toFloat().reduced (9.0f);
}

juce::Rectangle<float> DisplayWindow::plotArea() const
{
    return glassArea().reduced (14.0f, 0.0f).withTrimmedTop (36.0f).withTrimmedBottom (34.0f);
}

void DisplayWindow::resized()
{
    const auto inner = glassArea().reduced (12.0f).withTrimmedTop (26.0f);
    const float qrSize = juce::jmin (inner.getHeight(), inner.getWidth() * 0.55f);
    qr.setBounds (inner.withWidth (qrSize).withHeight (qrSize).toNearestInt());

    auto column = inner.withTrimmedLeft (qrSize + 12.0f);
    password.setBounds (juce::Rectangle<float> (column.getX(), column.getY() + 70.0f, column.getWidth(), 26.0f).toNearestInt());

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

    const auto bounds = getLocalBounds().toFloat();
    g.setColour (Colours::black.withAlpha (0.55f));
    g.fillRoundedRectangle (bounds.translated (0.0f, 2.0f), 9.0f);
    g.setGradientFill (ColourGradient (Colour (0xff3a3b40), bounds.getX(), bounds.getY(),
                                       Colour (0xff0f0f11), bounds.getX(), bounds.getBottom(), false));
    g.fillRoundedRectangle (bounds, 9.0f);
    g.setColour (Colours::white.withAlpha (0.1f));
    g.drawRoundedRectangle (bounds.reduced (0.5f), 9.0f, 1.0f);

    const auto glass = glassArea();
    g.setGradientFill (ColourGradient (Colour (0xff1a140c), glass.getCentreX(), glass.getCentreY(),
                                       Colour (0xff060504), glass.getX(), glass.getY(), true));
    g.fillRoundedRectangle (glass, 4.0f);

    const auto title = glass.reduced (14.0f, 0.0f).withHeight (32.0f);
    const auto titleFont = hw::font (hw::Type::condensedBold, 14.0f, 0.1f);
    const auto small = hw::font (hw::Type::condensedSemiBold, 12.0f, 0.06f);

    if (! live)
    {
        g.setFont (titleFont);
        g.setColour (c::amber.withAlpha (0.6f));
        g.drawText ("RESPONSE", title, Justification::centredLeft, false);
        g.setColour (c::amber);
        g.setFont (hw::font (hw::Type::condensedBold, 16.0f, 0.06f));
        const auto& p = getSpeakerProfiles()[(size_t) jlimit (0, (int) getSpeakerProfiles().size() - 1, profile)];
        g.drawText (String (p.name).toUpperCase(), title, Justification::centredRight, false);

        const auto area = plotArea();
        g.setFont (small);

        for (float hz : { 50.0f, 200.0f, 500.0f, 2000.0f, 5000.0f, 20000.0f })
        {
            g.setColour (c::amber.withAlpha (0.06f));
            g.drawVerticalLine ((int) xForHz (area, hz), area.getY(), area.getBottom());
        }

        for (auto [hz, label] : { std::pair<float, const char*> { 100.0f, "100" }, { 1000.0f, "1k" }, { 10000.0f, "10k" } })
        {
            const float x = xForHz (area, hz);
            g.setColour (c::amber.withAlpha (0.16f));
            g.drawVerticalLine ((int) x, area.getY(), area.getBottom());
            g.setColour (c::amber.withAlpha (0.55f));
            g.drawText (label, Rectangle<float> (40.0f, 14.0f).withCentre ({ x, area.getBottom() + 10.0f }), Justification::centred, false);
        }

        for (float db : { 0.0f, -12.0f, -24.0f, -36.0f })
        {
            const float y = yForDb (area, db);
            g.setColour (c::amber.withAlpha (db == 0.0f ? 0.16f : 0.08f));
            g.drawHorizontalLine ((int) y, area.getX(), area.getRight());
            g.setColour (c::amber.withAlpha (0.45f));
            g.drawText (String ((int) db), Rectangle<float> (area.getX() + 2.0f, y - 13.0f, 30.0f, 12.0f), Justification::left, false);
        }

        Path fill (curve);
        fill.lineTo (area.getRight(), area.getBottom());
        fill.lineTo (area.getX(), area.getBottom());
        fill.closeSubPath();
        g.setGradientFill (ColourGradient (c::amber.withAlpha (0.22f), 0.0f, area.getY(),
                                           c::amber.withAlpha (0.0f), 0.0f, area.getBottom(), false));
        g.fillPath (fill);

        g.setColour (c::amber.withAlpha (0.18f));
        g.strokePath (curve, PathStrokeType (5.0f, PathStrokeType::curved, PathStrokeType::rounded));
        g.setColour (c::amber);
        g.strokePath (curve, PathStrokeType (2.0f, PathStrokeType::curved, PathStrokeType::rounded));

        g.setFont (small);
        g.setColour (c::amber.withAlpha (0.45f));
        g.drawText ("PRESS ON AIR TO HEAR IT ON A REAL PHONE",
                    glass.reduced (14.0f, 0.0f).removeFromBottom (18.0f).translated (0.0f, -4.0f),
                    Justification::centredLeft, false);
    }
    else
    {
        g.setFont (titleFont);
        g.setColour (c::amber);
        g.drawText ("SCAN TO LISTEN", title, Justification::centredLeft, false);

        if (failed)
        {
            g.setFont (hw::font (hw::Type::condensedBold, 16.0f, 0.05f));
            g.drawFittedText ("COULDN'T OPEN A NETWORK PORT.\nANOTHER APP MAY BE USING IT.",
                              glass.reduced (16.0f).toNearestInt(), Justification::centred, 3);
        }
        else
        {
            const auto column = password.getBounds().toFloat().withY (qr.getY()).withHeight ((float) qr.getHeight());

            g.setFont (small);
            g.setColour (c::amber.withAlpha (0.55f));
            g.drawText ("ADDRESS", column.withHeight (14.0f), Justification::left, false);

            const auto stripped = url.fromFirstOccurrenceOf ("://", false, false).trimCharactersAtEnd ("/");
            g.setColour (c::amber);
            g.setFont (hw::font (hw::Type::condensedBold, 15.0f, 0.02f));
            g.drawFittedText (stripped.replace (":", "\n:"), column.withTrimmedTop (15.0f).withHeight (32.0f).toNearestInt(),
                              Justification::topLeft, 2, 0.8f);

            g.setFont (small);
            g.setColour (c::amber.withAlpha (0.55f));
            g.drawText ("PASSWORD", Rectangle<float> (column.getX(), (float) password.getY() - 15.0f, column.getWidth(), 14.0f),
                        Justification::left, false);
            g.drawText ("LISTENING", Rectangle<float> (column.getX(), (float) password.getBottom() + 8.0f, column.getWidth(), 14.0f),
                        Justification::left, false);

            g.setColour (listenerCount > 0 ? c::amber : c::amber.withAlpha (0.5f));
            g.setFont (hw::font (hw::Type::condensedBold, 30.0f));
            g.drawText (String (listenerCount), Rectangle<float> (column.getX(), (float) password.getBottom() + 20.0f, column.getWidth(), 30.0f),
                        Justification::left, false);
        }
    }

    // glass reflection
    g.setGradientFill (ColourGradient (Colours::white.withAlpha (0.05f), glass.getX(), glass.getY(),
                                       Colours::transparentWhite, glass.getX(), glass.getCentreY(), false));
    g.fillRoundedRectangle (glass.withHeight (glass.getHeight() * 0.5f), 4.0f);
}

} // namespace phonetesto
