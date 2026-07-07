#include "FloatingDeviceView2D.h"

namespace phonetesto
{

FloatingDeviceView2D::FloatingDeviceView2D()
{
    setOpaque (false);
    startTimerHz (30);
}

FloatingDeviceView2D::~FloatingDeviceView2D()
{
    stopTimer();
}

void FloatingDeviceView2D::setDevice (DeviceShape shape, juce::Colour accent)
{
    currentShape = shape;
    currentAccent = accent;
    repaint();
}

void FloatingDeviceView2D::timerCallback()
{
    phase += 0.06;
    if (phase > juce::MathConstants<double>::twoPi * 100.0)
        phase = 0.0;

    repaint();
}

void FloatingDeviceView2D::paint (juce::Graphics& g)
{
    auto bounds = getLocalBounds().toFloat();

    const float bobAmplitude = juce::jmin (bounds.getHeight() * 0.08f, 14.0f);
    const float bobY = (float) std::sin (phase) * bobAmplitude;
    const float heightFactor = -bobY / juce::jmax (bobAmplitude, 0.001f); // +1 = high, -1 = low
    const float wobbleDeg = (float) std::sin (phase * 0.6 + 1.0) * 4.0f;

    // ground shadow, independent of the device's own transform
    auto shadowBaseWidth = bounds.getWidth() * 0.34f;
    auto shadowScale = 1.0f - 0.22f * heightFactor;
    auto shadowAlpha = juce::jlimit (0.10f, 0.45f, 0.32f - 0.14f * heightFactor);

    auto shadowCentreX = bounds.getCentreX();
    auto shadowCentreY = bounds.getBottom() - bounds.getHeight() * 0.10f;
    auto shadowW = shadowBaseWidth * shadowScale;
    auto shadowH = shadowW * 0.28f;

    g.setColour (juce::Colours::black.withAlpha (shadowAlpha));
    g.fillEllipse (shadowCentreX - shadowW * 0.5f, shadowCentreY - shadowH * 0.5f, shadowW, shadowH);

    auto deviceArea = bounds.reduced (bounds.getWidth() * 0.28f, bounds.getHeight() * 0.16f);

    juce::Graphics::ScopedSaveState save (g);
    g.addTransform (juce::AffineTransform::rotation (juce::degreesToRadians (wobbleDeg), bounds.getCentreX(), bounds.getCentreY())
                         .translated (0.0f, bobY));

    switch (currentShape)
    {
        case DeviceShape::phone:    drawPhone (g, deviceArea); break;
        case DeviceShape::laptop:   drawLaptop (g, deviceArea); break;
        case DeviceShape::earphone: drawEarphone (g, deviceArea); break;
    }
}

void FloatingDeviceView2D::drawPhone (juce::Graphics& g, juce::Rectangle<float> bounds) const
{
    auto body = bounds.withSizeKeepingCentre (bounds.getWidth(), bounds.getHeight());
    const float corner = body.getWidth() * 0.22f;

    juce::DropShadow dropShadow (juce::Colours::black.withAlpha (0.35f), 12, { 0, 4 });
    juce::Path bodyPath;
    bodyPath.addRoundedRectangle (body, corner);
    dropShadow.drawForPath (g, bodyPath);

    juce::ColourGradient grad (currentAccent.brighter (0.25f), body.getX(), body.getY(),
                                currentAccent.darker (0.35f), body.getX(), body.getBottom(), false);
    g.setGradientFill (grad);
    g.fillRoundedRectangle (body, corner);

    g.setColour (juce::Colours::white.withAlpha (0.10f));
    g.drawRoundedRectangle (body.reduced (1.0f), corner, 1.2f);

    auto screen = body.reduced (body.getWidth() * 0.07f);
    g.setColour (juce::Colour (0xff0b0d12).withAlpha (0.85f));
    g.fillRoundedRectangle (screen, corner * 0.6f);

    auto camDiameter = body.getWidth() * 0.05f;
    g.setColour (juce::Colours::black.withAlpha (0.6f));
    g.fillEllipse (body.getCentreX() - camDiameter * 0.5f, body.getY() + body.getHeight() * 0.035f, camDiameter, camDiameter);

    auto barW = body.getWidth() * 0.28f;
    auto barH = body.getHeight() * 0.006f;
    g.setColour (juce::Colours::white.withAlpha (0.55f));
    g.fillRoundedRectangle (body.getCentreX() - barW * 0.5f, body.getBottom() - body.getHeight() * 0.03f, barW, barH * 4.0f, barH * 2.0f);
}

void FloatingDeviceView2D::drawLaptop (juce::Graphics& g, juce::Rectangle<float> bounds) const
{
    auto screen = bounds.removeFromTop (bounds.getHeight() * 0.72f);
    bounds.removeFromTop (bounds.getHeight() * 0.05f);
    auto deck = bounds;

    juce::DropShadow dropShadow (juce::Colours::black.withAlpha (0.3f), 10, { 0, 3 });
    juce::Path screenPath;
    screenPath.addRoundedRectangle (screen, screen.getWidth() * 0.04f);
    dropShadow.drawForPath (g, screenPath);

    juce::ColourGradient grad (currentAccent.brighter (0.2f), screen.getX(), screen.getY(),
                                currentAccent.darker (0.4f), screen.getX(), screen.getBottom(), false);
    g.setGradientFill (grad);
    g.fillRoundedRectangle (screen, screen.getWidth() * 0.04f);

    auto inset = screen.reduced (screen.getWidth() * 0.045f);
    g.setColour (juce::Colour (0xff0b0d12).withAlpha (0.85f));
    g.fillRoundedRectangle (inset, screen.getWidth() * 0.02f);

    auto deckPath = juce::Path();
    auto trapInsetTop = deck.getWidth() * 0.10f;
    deckPath.startNewSubPath (deck.getX() + trapInsetTop, deck.getY());
    deckPath.lineTo (deck.getRight() - trapInsetTop, deck.getY());
    deckPath.lineTo (deck.getRight(), deck.getBottom());
    deckPath.lineTo (deck.getX(), deck.getBottom());
    deckPath.closeSubPath();

    g.setColour (currentAccent.darker (0.15f));
    g.fillPath (deckPath);
    g.setColour (juce::Colours::white.withAlpha (0.08f));
    g.strokePath (deckPath, juce::PathStrokeType (1.0f));
}

void FloatingDeviceView2D::drawEarphone (juce::Graphics& g, juce::Rectangle<float> bounds) const
{
    auto budDiameter = bounds.getWidth() * 0.62f;
    auto bud = juce::Rectangle<float> (budDiameter, budDiameter)
                   .withCentre ({ bounds.getCentreX() - bounds.getWidth() * 0.10f, bounds.getY() + budDiameter * 0.55f });

    juce::Path stem;
    auto stemTop = bud.getCentre().translated (budDiameter * 0.32f, budDiameter * 0.18f);
    auto stemBottom = stemTop.translated (bounds.getWidth() * 0.18f, bounds.getHeight() * 0.55f);
    stem.startNewSubPath (stemTop);
    stem.cubicTo (stemTop.translated (bounds.getWidth() * 0.05f, bounds.getHeight() * 0.15f),
                  stemBottom.translated (-bounds.getWidth() * 0.05f, -bounds.getHeight() * 0.10f),
                  stemBottom);

    juce::DropShadow dropShadow (juce::Colours::black.withAlpha (0.3f), 8, { 0, 3 });
    juce::Path budPath;
    budPath.addEllipse (bud);
    dropShadow.drawForPath (g, budPath);

    g.setColour (juce::Colours::black.withAlpha (0.55f));
    g.strokePath (stem, juce::PathStrokeType (bounds.getWidth() * 0.085f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    g.setColour (currentAccent);
    g.strokePath (stem, juce::PathStrokeType (bounds.getWidth() * 0.065f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));

    juce::ColourGradient grad (currentAccent.brighter (0.3f), bud.getX(), bud.getY(),
                                currentAccent.darker (0.2f), bud.getX(), bud.getBottom(), false);
    g.setGradientFill (grad);
    g.fillEllipse (bud);
    g.setColour (juce::Colours::white.withAlpha (0.18f));
    g.drawEllipse (bud.reduced (1.0f), 1.0f);

    auto mesh = bud.reduced (bud.getWidth() * 0.32f);
    g.setColour (juce::Colour (0xff2a2c30).withAlpha (0.5f));
    g.fillEllipse (mesh);
}

} // namespace phonetesto
