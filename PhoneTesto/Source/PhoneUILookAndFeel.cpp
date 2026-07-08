#include "PhoneUILookAndFeel.h"

namespace phonetesto
{

void VolumeHudLookAndFeel::drawLinearSlider (juce::Graphics& g, int x, int y, int width, int height,
                                              float sliderPos, float /*minSliderPos*/, float /*maxSliderPos*/,
                                              const juce::Slider::SliderStyle, juce::Slider&)
{
    juce::Rectangle<float> bounds ((float) x, (float) y, (float) width, (float) height);
    const float corner = bounds.getWidth() * 0.5f;

    // recessed metal track, not just a flat dark pill
    juce::ColourGradient trackGrad (juce::Colours::black.withAlpha (0.55f), bounds.getX(), bounds.getY(),
                                     juce::Colour (0xff1a1c22).withAlpha (0.55f), bounds.getX(), bounds.getBottom(), false);
    g.setGradientFill (trackGrad);
    g.fillRoundedRectangle (bounds, corner);

    const float fillTop = juce::jlimit (bounds.getY(), bounds.getBottom(), sliderPos);
    if (fillTop < bounds.getBottom())
    {
        auto fillBounds = bounds.withTop (fillTop);
        juce::ColourGradient fillGrad (accentColour.brighter (0.9f), fillBounds.getX(), fillBounds.getY(),
                                        accentColour.brighter (0.15f), fillBounds.getX(), fillBounds.getBottom(), false);
        g.setGradientFill (fillGrad);
        g.fillRoundedRectangle (fillBounds, corner);

        // lit edge at the top of the fill, like an illuminated level meter
        auto glowLine = juce::Rectangle<float> (bounds.getWidth(), 3.0f).withCentre ({ bounds.getCentreX(), fillTop });
        g.setColour (juce::Colours::white.withAlpha (0.8f));
        g.fillRoundedRectangle (glowLine, 1.5f);
    }

    g.setColour (juce::Colours::white.withAlpha (0.14f));
    g.drawRoundedRectangle (bounds.reduced (0.75f), corner, 1.0f);

    // small speaker glyph near the base
    const float iconD = juce::jmin (bounds.getWidth() * 0.6f, 12.0f);
    juce::Rectangle<float> iconArea (bounds.getCentreX() - iconD * 0.5f,
                                      bounds.getBottom() - iconD * 1.7f,
                                      iconD, iconD);

    const float bodyW = iconArea.getWidth() * 0.38f;
    const float bodyH = iconArea.getHeight() * 0.46f;
    juce::Rectangle<float> iconBody (iconArea.getX(), iconArea.getCentreY() - bodyH * 0.5f, bodyW, bodyH);

    juce::Path speaker;
    speaker.addRectangle (iconBody);
    speaker.startNewSubPath (iconBody.getRight(), iconBody.getY());
    speaker.lineTo (iconArea.getRight(), iconArea.getY());
    speaker.lineTo (iconArea.getRight(), iconArea.getBottom());
    speaker.lineTo (iconBody.getRight(), iconBody.getBottom());
    speaker.closeSubPath();

    const bool aboveGlyph = fillTop < iconArea.getBottom();
    g.setColour ((aboveGlyph ? juce::Colours::black : juce::Colours::white).withAlpha (0.7f));
    g.fillPath (speaker);
}

void MixSliderLookAndFeel::drawRotarySlider (juce::Graphics& g, int x, int y, int width, int height,
                                              float sliderPosProportional, float rotaryStartAngle,
                                              float rotaryEndAngle, juce::Slider&)
{
    // Clean dark dial: thin background track ring, glowing value arc,
    // recessed disc face with a faint dotted grip texture and a pointer --
    // modelled on plugins like Soundly's "Place It" rather than a fader.
    auto bounds = juce::Rectangle<float> ((float) x, (float) y, (float) width, (float) height).reduced (4.0f);
    const float radius = juce::jmin (bounds.getWidth(), bounds.getHeight()) * 0.5f;
    const auto centre = bounds.getCentre();
    const float angle = rotaryStartAngle + sliderPosProportional * (rotaryEndAngle - rotaryStartAngle);
    const float ringThickness = juce::jmax (3.0f, radius * 0.09f);
    const float ringRadius = radius - ringThickness * 0.5f;

    juce::Path track;
    track.addCentredArc (centre.x, centre.y, ringRadius, ringRadius, 0.0f, rotaryStartAngle, rotaryEndAngle, true);
    g.setColour (juce::Colours::white.withAlpha (0.10f));
    g.strokePath (track, juce::PathStrokeType (ringThickness, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));

    juce::Path valueArc;
    valueArc.addCentredArc (centre.x, centre.y, ringRadius, ringRadius, 0.0f, rotaryStartAngle, angle, true);
    g.setColour (accentColour.brighter (0.3f));
    g.strokePath (valueArc, juce::PathStrokeType (ringThickness, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));

    // recessed dial face
    const float faceRadius = radius * 0.72f;
    auto faceBounds = juce::Rectangle<float> (faceRadius * 2.0f, faceRadius * 2.0f).withCentre (centre);

    juce::Path facePath;
    facePath.addEllipse (faceBounds);
    juce::DropShadow faceShadow (juce::Colours::black.withAlpha (0.5f), 8, { 0, 3 });
    faceShadow.drawForPath (g, facePath);

    juce::ColourGradient faceGrad (juce::Colour (0xff3a3d45), faceBounds.getX(), faceBounds.getY(),
                                    juce::Colour (0xff15161a), faceBounds.getX(), faceBounds.getBottom(), false);
    g.setGradientFill (faceGrad);
    g.fillEllipse (faceBounds);

    // faint dotted grip ring
    {
        juce::Graphics::ScopedSaveState clip (g);
        g.reduceClipRegion (facePath);
        constexpr int numDots = 26;
        const float dotRadius = faceRadius * 0.84f;
        for (int i = 0; i < numDots; ++i)
        {
            const float a = (float) i / (float) numDots * juce::MathConstants<float>::twoPi;
            const auto p = centre.getPointOnCircumference (dotRadius, a);
            g.setColour (juce::Colours::white.withAlpha (0.05f));
            g.fillEllipse (juce::Rectangle<float> (2.2f, 2.2f).withCentre (p));
        }
    }

    g.setColour (juce::Colours::white.withAlpha (0.10f));
    g.drawEllipse (faceBounds.reduced (0.5f), 1.0f);

    // pointer
    const auto tip = centre.getPointOnCircumference (faceRadius * 0.72f, angle);
    g.setColour (juce::Colours::white.withAlpha (0.85f));
    g.drawLine (centre.x, centre.y, tip.x, tip.y, 2.4f);

    g.setColour (accentColour.brighter (0.6f));
    g.fillEllipse (juce::Rectangle<float> (5.5f, 5.5f).withCentre (centre));
}

void LabToggleLookAndFeel::drawToggleButton (juce::Graphics& g, juce::ToggleButton& button,
                                              bool /*shouldDrawButtonAsHighlighted*/, bool /*shouldDrawButtonAsDown*/)
{
    // Circular power-style toggle with a glowing ring when active, and an
    // uppercase caption underneath -- echoes the round power buttons in
    // plugins like Soundly's "Place It".
    auto bounds = button.getLocalBounds().toFloat();
    const bool on = button.getToggleState();

    const float d = juce::jmin (bounds.getWidth(), bounds.getHeight() * 0.62f, 32.0f);
    auto circle = juce::Rectangle<float> (d, d).withCentre ({ bounds.getCentreX(), bounds.getY() + d * 0.5f + 2.0f });

    if (on)
    {
        juce::Path glowPath;
        glowPath.addEllipse (circle);
        juce::DropShadow glow (accentColour.withAlpha (0.6f), (int) (d * 0.55f), {});
        glow.drawForPath (g, glowPath);
    }

    g.setColour (juce::Colours::black.withAlpha (0.35f));
    g.fillEllipse (circle);

    g.setColour (on ? accentColour.brighter (0.5f) : juce::Colours::white.withAlpha (0.16f));
    g.drawEllipse (circle.reduced (1.0f), 2.0f);

    // simple power glyph: an open arc with a short vertical tick through the top
    const float iconR = d * 0.26f;
    const auto iconCentre = circle.getCentre();
    juce::Path power;
    power.addArc (iconCentre.x - iconR, iconCentre.y - iconR, iconR * 2.0f, iconR * 2.0f,
                  juce::MathConstants<float>::pi * 0.28f, juce::MathConstants<float>::pi * 1.72f, true);
    g.setColour (on ? juce::Colours::white.withAlpha (0.95f) : juce::Colours::white.withAlpha (0.4f));
    g.strokePath (power, juce::PathStrokeType (1.6f));
    g.drawLine (iconCentre.x, iconCentre.y - iconR * 1.2f, iconCentre.x, iconCentre.y - iconR * 0.1f, 1.6f);

    auto textArea = bounds.withTrimmedTop (circle.getBottom() - bounds.getY() + 4.0f).toNearestInt();
    g.setColour (juce::Colours::white.withAlpha (on ? 0.85f : 0.45f));
    g.setFont (juce::Font (juce::Font::getDefaultMonospacedFontName(), 10.5f, juce::Font::plain));
    g.drawFittedText (button.getButtonText().toUpperCase(), textArea, juce::Justification::centredTop, 1);
}

void PresetBoxLookAndFeel::drawComboBox (juce::Graphics& g, int width, int height, bool /*isButtonDown*/,
                                          int /*buttonX*/, int /*buttonY*/, int /*buttonW*/, int /*buttonH*/,
                                          juce::ComboBox&)
{
    juce::Rectangle<float> bounds (0.0f, 0.0f, (float) width, (float) height);
    const float corner = bounds.getHeight() * 0.26f;

    // recessed metal well, matching the sliders' track treatment
    juce::ColourGradient bgGrad (juce::Colours::black.withAlpha (0.5f), bounds.getX(), bounds.getY(),
                                  juce::Colour (0xff1c1e24).withAlpha (0.5f), bounds.getX(), bounds.getBottom(), false);
    g.setGradientFill (bgGrad);
    g.fillRoundedRectangle (bounds, corner);

    g.setColour (accentColour.brighter (0.6f).withAlpha (0.5f));
    g.drawRoundedRectangle (bounds.reduced (0.75f), corner, 1.1f);

    // small triangular caret on the right, in place of the OS arrow glyph
    auto arrowArea = bounds.removeFromRight (bounds.getHeight());
    const auto ac = arrowArea.getCentre();
    const float aw = arrowArea.getHeight() * 0.16f;

    juce::Path arrow;
    arrow.addTriangle (ac.x - aw, ac.y - aw * 0.55f, ac.x + aw, ac.y - aw * 0.55f, ac.x, ac.y + aw * 0.8f);
    g.setColour (accentColour.brighter (0.75f));
    g.fillPath (arrow);

    g.setColour (juce::Colours::white.withAlpha (0.08f));
    g.drawLine (arrowArea.getX(), bounds.getY() + 4.0f, arrowArea.getX(), bounds.getBottom() - 4.0f, 1.0f);
}

juce::Font PresetBoxLookAndFeel::getComboBoxFont (juce::ComboBox&)
{
    return juce::Font (juce::Font::getDefaultMonospacedFontName(), 13.0f, juce::Font::plain);
}

} // namespace phonetesto
