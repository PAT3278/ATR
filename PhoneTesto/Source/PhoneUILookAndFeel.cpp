#include "PhoneUILookAndFeel.h"

namespace phonetesto
{

void VolumeHudLookAndFeel::drawLinearSlider (juce::Graphics& g, int x, int y, int width, int height,
                                              float sliderPos, float /*minSliderPos*/, float /*maxSliderPos*/,
                                              const juce::Slider::SliderStyle, juce::Slider&)
{
    juce::Rectangle<float> bounds ((float) x, (float) y, (float) width, (float) height);
    const float corner = bounds.getWidth() * 0.5f;

    juce::DropShadow shadow (juce::Colours::black.withAlpha (0.4f), 6, {});
    juce::Path pillPath;
    pillPath.addRoundedRectangle (bounds, corner);
    shadow.drawForPath (g, pillPath);

    g.setColour (juce::Colours::black.withAlpha (0.45f));
    g.fillRoundedRectangle (bounds, corner);

    const float fillTop = juce::jlimit (bounds.getY(), bounds.getBottom(), sliderPos);
    if (fillTop < bounds.getBottom())
    {
        auto fillBounds = bounds.withTop (fillTop);
        g.setColour (juce::Colours::white.withAlpha (0.92f));
        g.fillRoundedRectangle (fillBounds, corner);
    }

    g.setColour (juce::Colours::white.withAlpha (0.12f));
    g.drawRoundedRectangle (bounds.reduced (0.75f), corner, 1.0f);

    // small speaker glyph near the base
    const float iconD = juce::jmin (bounds.getWidth() * 0.62f, 13.0f);
    juce::Rectangle<float> iconArea (bounds.getCentreX() - iconD * 0.5f,
                                      bounds.getBottom() - iconD * 1.7f,
                                      iconD, iconD);

    const float bodyW = iconArea.getWidth() * 0.38f;
    const float bodyH = iconArea.getHeight() * 0.46f;
    juce::Rectangle<float> body (iconArea.getX(), iconArea.getCentreY() - bodyH * 0.5f, bodyW, bodyH);

    juce::Path speaker;
    speaker.addRectangle (body);
    speaker.startNewSubPath (body.getRight(), body.getY());
    speaker.lineTo (iconArea.getRight(), iconArea.getY());
    speaker.lineTo (iconArea.getRight(), iconArea.getBottom());
    speaker.lineTo (body.getRight(), body.getBottom());
    speaker.closeSubPath();

    const bool aboveGlyph = fillTop < iconArea.getBottom();
    g.setColour ((aboveGlyph ? juce::Colours::black : juce::Colours::white).withAlpha (0.7f));
    g.fillPath (speaker);
}

void MixSliderLookAndFeel::drawLinearSlider (juce::Graphics& g, int x, int y, int width, int height,
                                              float sliderPos, float /*minSliderPos*/, float /*maxSliderPos*/,
                                              const juce::Slider::SliderStyle, juce::Slider&)
{
    // Drawn as a vertical mixer-style fader: a rounded track filling from
    // the bottom in the device's accent colour, with a wide horizontal cap
    // marking the handle position (rather than a plain round thumb).
    juce::Rectangle<float> bounds ((float) x, (float) y, (float) width, (float) height);
    const float trackWidth = juce::jmin (bounds.getWidth() * 0.34f, 14.0f);
    auto track = bounds.withSizeKeepingCentre (trackWidth, bounds.getHeight());
    const float corner = trackWidth * 0.5f;

    g.setColour (juce::Colours::black.withAlpha (0.30f));
    g.fillRoundedRectangle (track, corner);

    const float fillTop = juce::jlimit (track.getY(), track.getBottom(), sliderPos);
    if (fillTop < track.getBottom())
    {
        auto fillBounds = track.withTop (fillTop);
        juce::ColourGradient grad (accentColour.brighter (0.3f), fillBounds.getX(), fillBounds.getY(),
                                    accentColour.darker (0.15f), fillBounds.getX(), fillBounds.getBottom(), false);
        g.setGradientFill (grad);
        g.fillRoundedRectangle (fillBounds, corner);
    }

    g.setColour (juce::Colours::white.withAlpha (0.10f));
    g.drawRoundedRectangle (track.reduced (0.75f), corner, 1.0f);

    // fader cap, wider than the track so it reads as a grabbable handle
    const float capH = 11.0f;
    auto cap = juce::Rectangle<float> (bounds.getWidth(), capH).withCentre ({ bounds.getCentreX(), sliderPos });

    juce::DropShadow capShadow (juce::Colours::black.withAlpha (0.4f), 5, {});
    juce::Path capPath;
    capPath.addRoundedRectangle (cap, capH * 0.5f);
    capShadow.drawForPath (g, capPath);

    g.setColour (juce::Colours::white);
    g.fillRoundedRectangle (cap, capH * 0.5f);
    g.setColour (accentColour.darker (0.2f));
    g.fillRoundedRectangle (cap.withSizeKeepingCentre (cap.getWidth() * 0.4f, capH * 0.4f), capH * 0.2f);
}

} // namespace phonetesto
