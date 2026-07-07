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
    juce::Rectangle<float> bounds ((float) x, (float) y, (float) width, (float) height);
    const float corner = bounds.getHeight() * 0.5f;

    g.setColour (juce::Colours::black.withAlpha (0.30f));
    g.fillRoundedRectangle (bounds, corner);

    const float fillRight = juce::jlimit (bounds.getX(), bounds.getRight(), sliderPos);
    if (fillRight > bounds.getX())
    {
        auto fillBounds = bounds.withRight (fillRight);
        juce::ColourGradient grad (accentColour.brighter (0.3f), fillBounds.getX(), fillBounds.getY(),
                                    accentColour.darker (0.1f), fillBounds.getRight(), fillBounds.getY(), false);
        g.setGradientFill (grad);
        g.fillRoundedRectangle (fillBounds, corner);
    }

    g.setColour (juce::Colours::white.withAlpha (0.10f));
    g.drawRoundedRectangle (bounds.reduced (0.75f), corner, 1.0f);

    const float thumbD = bounds.getHeight() * 0.86f;
    juce::Rectangle<float> thumb (fillRight - thumbD * 0.5f, bounds.getCentreY() - thumbD * 0.5f, thumbD, thumbD);
    thumb = thumb.constrainedWithin (bounds.expanded (thumbD * 0.5f, 0.0f));

    juce::DropShadow thumbShadow (juce::Colours::black.withAlpha (0.35f), 4, {});
    juce::Path thumbPath;
    thumbPath.addEllipse (thumb);
    thumbShadow.drawForPath (g, thumbPath);

    g.setColour (juce::Colours::white);
    g.fillEllipse (thumb);
}

} // namespace phonetesto
