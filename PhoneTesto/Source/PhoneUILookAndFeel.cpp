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

void MixSliderLookAndFeel::drawLinearSlider (juce::Graphics& g, int x, int y, int width, int height,
                                              float sliderPos, float /*minSliderPos*/, float /*maxSliderPos*/,
                                              const juce::Slider::SliderStyle, juce::Slider&)
{
    // Drawn as a boutique mixer-style fader: a recessed metal track, a
    // glowing accent-coloured fill, and a metallic cap with a centre groove
    // standing in for a real fader handle.
    juce::Rectangle<float> bounds ((float) x, (float) y, (float) width, (float) height);
    const float trackWidth = juce::jmin (bounds.getWidth() * 0.30f, 12.0f);
    auto track = bounds.withSizeKeepingCentre (trackWidth, bounds.getHeight());
    const float corner = trackWidth * 0.5f;

    juce::ColourGradient trackGrad (juce::Colours::black.withAlpha (0.55f), track.getX(), track.getY(),
                                     juce::Colour (0xff1a1c22).withAlpha (0.55f), track.getX(), track.getBottom(), false);
    g.setGradientFill (trackGrad);
    g.fillRoundedRectangle (track, corner);

    const float fillTop = juce::jlimit (track.getY(), track.getBottom(), sliderPos);
    if (fillTop < track.getBottom())
    {
        auto fillBounds = track.withTop (fillTop);
        juce::ColourGradient grad (accentColour.brighter (0.5f), fillBounds.getX(), fillBounds.getY(),
                                    accentColour.darker (0.2f), fillBounds.getX(), fillBounds.getBottom(), false);
        g.setGradientFill (grad);
        g.fillRoundedRectangle (fillBounds, corner);
    }

    g.setColour (juce::Colours::white.withAlpha (0.12f));
    g.drawRoundedRectangle (track.reduced (0.75f), corner, 1.0f);

    // metallic fader cap, wider than the track so it reads as a grabbable handle
    const float capH = 12.0f;
    auto cap = juce::Rectangle<float> (bounds.getWidth(), capH).withCentre ({ bounds.getCentreX(), sliderPos });

    juce::DropShadow capShadow (juce::Colours::black.withAlpha (0.45f), 5, {});
    juce::Path capPath;
    capPath.addRoundedRectangle (cap, capH * 0.35f);
    capShadow.drawForPath (g, capPath);

    juce::ColourGradient capGrad (juce::Colour (0xfff4f5f7), cap.getX(), cap.getY(),
                                   juce::Colour (0xffb9bcc4), cap.getX(), cap.getBottom(), false);
    g.setGradientFill (capGrad);
    g.fillRoundedRectangle (cap, capH * 0.35f);

    g.setColour (juce::Colours::black.withAlpha (0.3f));
    g.drawLine (cap.getX() + 5.0f, cap.getCentreY(), cap.getRight() - 5.0f, cap.getCentreY(), 1.2f);
    g.setColour (accentColour.brighter (0.4f));
    g.fillRoundedRectangle (cap.withSizeKeepingCentre (6.0f, capH * 0.5f), 2.0f);
}

void LabToggleLookAndFeel::drawToggleButton (juce::Graphics& g, juce::ToggleButton& button,
                                              bool shouldDrawButtonAsHighlighted, bool /*shouldDrawButtonAsDown*/)
{
    auto bounds = button.getLocalBounds().toFloat();
    const bool on = button.getToggleState();

    const float ledD = juce::jmin (bounds.getHeight() * 0.46f, 11.0f);
    juce::Rectangle<float> led (ledD, ledD);
    led.setCentre (bounds.getX() + ledD * 0.5f + 3.0f, bounds.getCentreY());

    if (on)
    {
        juce::DropShadow glow (accentColour.withAlpha (0.85f), (int) (ledD * 1.6f), {});
        juce::Path ledPath;
        ledPath.addEllipse (led);
        glow.drawForPath (g, ledPath);

        juce::ColourGradient ledGrad (accentColour.brighter (0.7f), led.getX(), led.getY(),
                                       accentColour.darker (0.1f), led.getX(), led.getBottom(), false);
        g.setGradientFill (ledGrad);
    }
    else
    {
        g.setColour (juce::Colours::white.withAlpha (0.16f));
    }
    g.fillEllipse (led);
    g.setColour (juce::Colours::black.withAlpha (0.4f));
    g.drawEllipse (led, 1.0f);

    auto textArea = bounds.withTrimmedLeft (led.getRight() + 8.0f).toNearestInt();
    g.setColour (juce::Colours::white.withAlpha (on ? 0.92f : 0.5f));
    g.setFont (juce::Font (juce::Font::getDefaultMonospacedFontName(), 11.5f, juce::Font::plain));
    g.drawFittedText (button.getButtonText().toUpperCase(), textArea, juce::Justification::centredLeft, 1);

    g.setColour (juce::Colours::white.withAlpha (shouldDrawButtonAsHighlighted ? 0.16f : 0.08f));
    g.drawRoundedRectangle (bounds.reduced (0.5f), bounds.getHeight() * 0.5f, 1.0f);
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
