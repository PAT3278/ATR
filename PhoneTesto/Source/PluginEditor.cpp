#include "PluginEditor.h"

namespace phonetesto
{

PhoneTestoAudioProcessorEditor::PhoneTestoAudioProcessorEditor (PhoneTestoAudioProcessor& p)
    : AudioProcessorEditor (&p), processor (p)
{
    const juce::String hudFontName = juce::Font::getDefaultMonospacedFontName();

    titleLabel.setText ("PhoneTesto", juce::dontSendNotification);
    titleLabel.setFont (juce::Font (hudFontName, 14.0f, juce::Font::bold));
    titleLabel.setJustificationType (juce::Justification::centred);
    titleLabel.setColour (juce::Label::textColourId, juce::Colours::white.withAlpha (0.55f));
    addAndMakeVisible (titleLabel);

    presetCaptionLabel.setText ("PRESET", juce::dontSendNotification);
    presetCaptionLabel.setJustificationType (juce::Justification::centredLeft);
    presetCaptionLabel.setFont (juce::Font (hudFontName, 9.5f, juce::Font::plain));
    presetCaptionLabel.setColour (juce::Label::textColourId, juce::Colours::white.withAlpha (0.35f));
    addAndMakeVisible (presetCaptionLabel);

    deviceBox.addItemList (getSpeakerNames(), 1);
    deviceBox.setJustificationType (juce::Justification::centred);
    deviceBox.setColour (juce::ComboBox::textColourId, juce::Colours::white.withAlpha (0.92f));
    deviceBox.setLookAndFeel (&presetLnf);
    addAndMakeVisible (deviceBox);
    deviceAttachment = std::make_unique<ComboBoxAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::deviceParamId, deviceBox);
    deviceBox.onChange = [this] { updateDeviceVisuals(); };

    mixValueLabel.setJustificationType (juce::Justification::centred);
    mixValueLabel.setFont (juce::Font (hudFontName, 14.0f, juce::Font::bold));
    mixValueLabel.setColour (juce::Label::textColourId, juce::Colours::white.withAlpha (0.85f));
    addAndMakeVisible (mixValueLabel);

    mixSlider.setSliderStyle (juce::Slider::LinearVertical);
    mixSlider.setTextBoxStyle (juce::Slider::NoTextBox, true, 0, 0);
    mixSlider.setLookAndFeel (&mixLnf);
    addAndMakeVisible (mixSlider);
    mixAttachment = std::make_unique<SliderAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::mixParamId, mixSlider);
    mixSlider.onValueChange = [this]
    {
        mixValueLabel.setText ("MIX  " + juce::String ((int) std::round (mixSlider.getValue())) + "%",
                                juce::dontSendNotification);
    };

    // Output's HUD sits on the left of the screen, matching where the real
    // hardware volume buttons live on an iPhone.
    outputHudSlider.setSliderStyle (juce::Slider::LinearVertical);
    outputHudSlider.setTextBoxStyle (juce::Slider::NoTextBox, true, 0, 0);
    outputHudSlider.setLookAndFeel (&volumeLnf);
    addAndMakeVisible (outputHudSlider);
    outputAttachment = std::make_unique<SliderAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::outputParamId, outputHudSlider);

    outputCaptionLabel.setText ("VOL", juce::dontSendNotification);
    outputCaptionLabel.setJustificationType (juce::Justification::centred);
    outputCaptionLabel.setFont (juce::Font (hudFontName, 9.5f, juce::Font::plain));
    outputCaptionLabel.setColour (juce::Label::textColourId, juce::Colours::white.withAlpha (0.35f));
    addAndMakeVisible (outputCaptionLabel);

    monoButton.setLookAndFeel (&toggleLnf);
    addAndMakeVisible (monoButton);
    monoAttachment = std::make_unique<ButtonAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::monoParamId, monoButton);

    bypassButton.setLookAndFeel (&toggleLnf);
    addAndMakeVisible (bypassButton);
    bypassAttachment = std::make_unique<ButtonAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::bypassParamId, bypassButton);

    mixValueLabel.setText ("MIX  " + juce::String ((int) std::round (mixSlider.getValue())) + "%",
                            juce::dontSendNotification);
    updateDeviceVisuals();
    startTimerHz (24); // drives the pulsing glow and catches host-automated device changes

    setSize (340, 680);
}

PhoneTestoAudioProcessorEditor::~PhoneTestoAudioProcessorEditor()
{
    stopTimer();
    mixSlider.setLookAndFeel (nullptr);
    outputHudSlider.setLookAndFeel (nullptr);
    monoButton.setLookAndFeel (nullptr);
    bypassButton.setLookAndFeel (nullptr);
    deviceBox.setLookAndFeel (nullptr);
}

void PhoneTestoAudioProcessorEditor::timerCallback()
{
    glowPhase += 0.045;
    if (glowPhase > juce::MathConstants<double>::twoPi * 1000.0)
        glowPhase = 0.0;

    updateDeviceVisuals();
    repaint();
}

void PhoneTestoAudioProcessorEditor::updateDeviceVisuals()
{
    const int deviceIndex = (int) processor.apvts.getRawParameterValue (PhoneTestoAudioProcessor::deviceParamId)->load();

    if (deviceIndex == lastDeviceIndex)
        return;

    lastDeviceIndex = deviceIndex;

    const auto& profiles = getSpeakerProfiles();
    const auto& profile = profiles[(size_t) juce::jlimit (0, (int) profiles.size() - 1, deviceIndex)];

    accentColour = juce::Colour (profile.accentColor);
    currentChrome = profile.chrome;
    mixLnf.setAccentColour (accentColour);
    volumeLnf.setAccentColour (accentColour);
    toggleLnf.setAccentColour (accentColour);
    presetLnf.setAccentColour (accentColour);
    deviceBox.repaint();

    resized(); // bezel proportions differ by chrome style (e.g. SE's thicker bezels)
    repaint();
}

void PhoneTestoAudioProcessorEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour (0xff101116));

    // faint vignette behind the phone, like a test-bench backdrop
    const auto centre = getLocalBounds().getCentre().toFloat();
    const float radius = centre.getDistanceFrom (getLocalBounds().getBottomRight().toFloat()) * 1.15f;
    juce::ColourGradient vignette (juce::Colour (0xff1a1c22), centre.x, centre.y,
                                    juce::Colour (0xff0a0b0e), centre.x, centre.y + radius, true);
    g.setGradientFill (vignette);
    g.fillRect (getLocalBounds());

    const auto& body = phoneBodyBounds;
    const float corner = body.getWidth() * 0.14f;
    const float pulse = 0.5f + 0.5f * (float) std::sin (glowPhase);

    // ground shadow
    const float shadowW = body.getWidth() * 0.72f;
    g.setColour (juce::Colours::black.withAlpha (0.4f));
    g.fillEllipse (body.getCentreX() - shadowW * 0.5f, body.getBottom() + 6.0f, shadowW, 12.0f);

    juce::Path bodyPath;
    bodyPath.addRoundedRectangle (body, corner);

    juce::DropShadow bodyShadow (juce::Colours::black.withAlpha (0.55f), 24, { 0, 9 });
    bodyShadow.drawForPath (g, bodyPath);

    // tight, precise backlit edge rather than a soft cartoon blur
    auto glowColour = accentColour.brighter (0.85f).withAlpha (0.28f + 0.16f * pulse);
    juce::DropShadow neonGlow (glowColour, (int) (7.0f + 4.0f * pulse), {});
    neonGlow.drawForPath (g, bodyPath);

    // multi-stop glass/metal panel gradient
    juce::ColourGradient bodyGrad (accentColour.brighter (0.6f), body.getX(), body.getY(),
                                    accentColour.darker (0.65f), body.getX(), body.getBottom(), false);
    bodyGrad.addColour (0.14, accentColour.brighter (0.18f));
    bodyGrad.addColour (0.55, accentColour.darker (0.12f));
    bodyGrad.addColour (0.90, accentColour.darker (0.5f));
    g.setGradientFill (bodyGrad);
    g.fillRoundedRectangle (body, corner);

    // specular sheen band near the top, clipped to the body shape
    {
        juce::Graphics::ScopedSaveState clip (g);
        g.reduceClipRegion (bodyPath);
        juce::ColourGradient sheen (juce::Colours::white.withAlpha (0.16f), body.getX(), body.getY(),
                                     juce::Colours::white.withAlpha (0.0f), body.getX(), body.getY() + body.getHeight() * 0.22f, false);
        g.setGradientFill (sheen);
        g.fillRect (body.withHeight (body.getHeight() * 0.3f));
    }

    g.setColour (juce::Colours::white.withAlpha (0.12f));
    g.drawRoundedRectangle (body.reduced (1.0f), corner, 1.3f);
    g.setColour (accentColour.brighter (0.7f).withAlpha (0.18f + 0.1f * pulse));
    g.drawRoundedRectangle (body.reduced (1.0f), corner, 1.0f);

    // decorative hardware buttons: volume rocker on the LEFT edge, power on
    // the RIGHT -- matches real iPhone placement
    auto drawSideButton = [&] (float bx, float by, float bw, float bh)
    {
        juce::Rectangle<float> btn (bx, by, bw, bh);
        g.setColour (juce::Colours::black.withAlpha (0.4f));
        g.fillRoundedRectangle (btn, 1.5f);
        g.setColour (juce::Colours::white.withAlpha (0.15f));
        g.fillRoundedRectangle (btn.removeFromTop (juce::jmax (1.0f, bh * 0.28f)), 1.0f);
    };

    drawSideButton (body.getX() - 3.0f, body.getY() + body.getHeight() * 0.15f, 3.0f, body.getHeight() * 0.065f);
    drawSideButton (body.getX() - 3.0f, body.getY() + body.getHeight() * 0.24f, 3.0f, body.getHeight() * 0.065f);
    drawSideButton (body.getRight(), body.getY() + body.getHeight() * 0.19f, 3.0f, body.getHeight() * 0.09f);

    // screen -- an abstract blurred-blob "wallpaper" tinted from the
    // selected device's accent colour, echoing a default lock-screen
    // wallpaper rather than a flat panel
    juce::Path screenPath;
    screenPath.addRoundedRectangle (screenBounds, corner * 0.5f);

    {
        juce::Graphics::ScopedSaveState clip (g);
        g.reduceClipRegion (screenPath);

        g.setColour (juce::Colour (0xff05060a));
        g.fillRect (screenBounds);

        auto wallpaperBlob = [&] (juce::Point<float> blobCentre, float radius, juce::Colour colour, float alpha)
        {
            juce::ColourGradient grad (colour.withAlpha (alpha), blobCentre.x, blobCentre.y,
                                        colour.withAlpha (0.0f), blobCentre.x, blobCentre.y + radius, true);
            g.setGradientFill (grad);
            g.fillEllipse (juce::Rectangle<float> (radius * 2.0f, radius * 2.0f).withCentre (blobCentre));
        };

        auto hueA = accentColour.withRotatedHue (0.06f).brighter (0.25f);
        auto hueB = accentColour.withRotatedHue (-0.14f).brighter (0.05f);
        auto hueC = accentColour.withRotatedHue (0.32f).brighter (0.15f);

        wallpaperBlob ({ screenBounds.getX() + screenBounds.getWidth() * 0.22f, screenBounds.getY() + screenBounds.getHeight() * 0.18f },
                       screenBounds.getWidth() * 0.62f, hueA, 0.6f);
        wallpaperBlob ({ screenBounds.getRight() - screenBounds.getWidth() * 0.15f, screenBounds.getY() + screenBounds.getHeight() * 0.5f },
                       screenBounds.getWidth() * 0.55f, hueB, 0.5f);
        wallpaperBlob ({ screenBounds.getCentreX(), screenBounds.getBottom() - screenBounds.getHeight() * 0.1f },
                       screenBounds.getWidth() * 0.68f, hueC, 0.5f);

        // darken towards the edges so the controls drawn on top stay legible
        const float legibilityRadius = juce::Point<float> (screenBounds.getWidth() * 0.5f, screenBounds.getHeight() * 0.5f)
                                            .getDistanceFromOrigin() * 0.85f;
        juce::ColourGradient legibility (juce::Colours::transparentBlack, screenBounds.getCentreX(), screenBounds.getCentreY(),
                                          juce::Colours::black.withAlpha (0.55f),
                                          screenBounds.getCentreX() + legibilityRadius, screenBounds.getCentreY(), true);
        g.setGradientFill (legibility);
        g.fillRect (screenBounds);

        // faint scanlines for a HUD/sci-fi readout feel
        g.setColour (juce::Colours::white.withAlpha (0.02f));
        for (float sy = screenBounds.getY(); sy < screenBounds.getBottom(); sy += 4.0f)
            g.drawHorizontalLine ((int) sy, screenBounds.getX(), screenBounds.getRight());
    }

    // bright accent hairline + corner brackets, like a targeting HUD frame
    auto edgeGlow = accentColour.brighter (0.85f).withAlpha (0.32f + 0.18f * pulse);
    g.setColour (edgeGlow);
    g.drawRoundedRectangle (screenBounds.reduced (0.5f), corner * 0.5f, 1.1f);

    const float cornerLen = 13.0f;
    auto drawCorner = [&] (juce::Point<float> pt, float dx, float dy)
    {
        juce::Path c;
        c.startNewSubPath (pt.x, pt.y + dy);
        c.lineTo (pt.x, pt.y);
        c.lineTo (pt.x + dx, pt.y);
        g.strokePath (c, juce::PathStrokeType (1.3f));
    };

    g.setColour (edgeGlow.withAlpha (0.65f));
    drawCorner (screenBounds.getTopLeft(), cornerLen, cornerLen);
    drawCorner ({ screenBounds.getRight(), screenBounds.getY() }, -cornerLen, cornerLen);
    drawCorner (screenBounds.getBottomLeft(), cornerLen, -cornerLen);
    drawCorner ({ screenBounds.getRight(), screenBounds.getBottom() }, -cornerLen, -cornerLen);

    // top chrome: real iPhones vary here -- the SE has no notch/island at all,
    // 11/13-14 have a notch cut into the top edge (11's noticeably wider),
    // 15/16 Pro have a Dynamic Island that floats clear of the top edge.
    switch (currentChrome)
    {
        case PhoneChromeStyle::notchWide:
        case PhoneChromeStyle::notchNarrow:
        {
            const float widthScale = (currentChrome == PhoneChromeStyle::notchWide) ? 0.34f : 0.22f;
            auto notch = juce::Rectangle<float> (body.getWidth() * widthScale, 9.0f)
                             .withCentre ({ body.getCentreX(), screenBounds.getY() + 1.0f });
            g.setColour (juce::Colours::black);
            g.fillRoundedRectangle (notch, 4.5f);
            break;
        }

        case PhoneChromeStyle::dynamicIsland:
        {
            auto island = juce::Rectangle<float> (body.getWidth() * 0.17f, 8.0f)
                              .withCentre ({ body.getCentreX(), screenBounds.getY() + 14.0f });
            g.setColour (juce::Colours::black);
            g.fillRoundedRectangle (island, island.getHeight() * 0.5f);
            break;
        }

        case PhoneChromeStyle::plain:
        {
            auto dot = juce::Rectangle<float> (6.0f, 6.0f).withCentre ({ body.getCentreX(), body.getY() + 16.0f });
            g.setColour (juce::Colours::black.withAlpha (0.7f));
            g.fillEllipse (dot);
            break;
        }

        case PhoneChromeStyle::homeButton:
        {
            // SE: no notch/island -- just a small camera dot in the thick top bezel
            auto dot = juce::Rectangle<float> (5.0f, 5.0f)
                           .withCentre ({ body.getCentreX(), (body.getY() + screenBounds.getY()) * 0.5f });
            g.setColour (juce::Colours::black.withAlpha (0.6f));
            g.fillEllipse (dot);
            break;
        }
    }

    // bottom chrome: gesture home-indicator bar on Face ID phones, a physical
    // Touch ID button in the SE's thick bottom bezel
    if (currentChrome == PhoneChromeStyle::homeButton)
    {
        const float buttonD = juce::jmin (body.getWidth() * 0.16f, 46.0f);
        auto buttonBounds = juce::Rectangle<float> (buttonD, buttonD)
                                 .withCentre ({ body.getCentreX(), (screenBounds.getBottom() + body.getBottom()) * 0.5f });
        g.setColour (juce::Colours::black.withAlpha (0.3f));
        g.drawEllipse (buttonBounds, 1.5f);
        g.setColour (juce::Colours::white.withAlpha (0.12f));
        g.fillEllipse (buttonBounds.reduced (2.0f));
    }
    else
    {
        const float homeW = body.getWidth() * 0.28f;
        auto home = juce::Rectangle<float> (homeW, 4.0f)
                        .withCentre ({ body.getCentreX(), body.getBottom() - 9.0f });
        g.setColour (juce::Colours::white.withAlpha (0.35f));
        g.fillRoundedRectangle (home, 2.0f);
    }
}

void PhoneTestoAudioProcessorEditor::resized()
{
    auto full = getLocalBounds().toFloat();

    auto titleArea = full.removeFromTop (22.0f);
    titleLabel.setBounds (titleArea.toNearestInt());

    phoneBodyBounds = full.reduced (18.0f, 10.0f);
    phoneBodyBounds.removeFromBottom (18.0f);

    // the SE's Touch ID design has much thicker bezels than the notch/island phones
    const bool hasHomeButton = (currentChrome == PhoneChromeStyle::homeButton);

    screenBounds = phoneBodyBounds.reduced (17.0f);
    screenBounds.removeFromTop (hasHomeButton ? 32.0f : 28.0f);
    screenBounds.removeFromBottom (hasHomeButton ? 48.0f : 22.0f);

    auto content = screenBounds.toNearestInt();

    // Header row: volume HUD pinned to the LEFT (matching the real hardware
    // buttons' side), device picker filling the rest. Keeping the HUD
    // confined to this fixed-height row is what stops it overlapping the
    // mix fader below.
    auto headerRow = content.removeFromTop (140);
    auto hudColumn = headerRow.removeFromLeft (38);
    auto hudCaptionArea = hudColumn.removeFromBottom (14);
    outputHudSlider.setBounds (hudColumn.reduced (3, 6));
    outputCaptionLabel.setBounds (hudCaptionArea);

    headerRow.removeFromLeft (16);

    // preset caption + picker, vertically centred in the remaining header
    // space so it balances against the taller HUD column beside it
    constexpr int presetBlockHeight = 14 + 4 + 32;
    auto presetBlock = headerRow.withSizeKeepingCentre (headerRow.getWidth(), presetBlockHeight);
    presetCaptionLabel.setBounds (presetBlock.removeFromTop (14));
    presetBlock.removeFromTop (4);
    deviceBox.setBounds (presetBlock.reduced (4, 0));

    content.removeFromTop (18);

    // bottom toggle row, with generous room around it so it doesn't crowd the edge
    content.removeFromBottom (18);
    auto bottomRow = content.removeFromBottom (34);
    auto monoArea = bottomRow.removeFromLeft (bottomRow.getWidth() / 2);
    monoButton.setBounds (monoArea.reduced (16, 4));
    bypassButton.setBounds (bottomRow.reduced (16, 4));

    content.removeFromBottom (22);

    // mix label sits just above a vertical fader, which fills the remaining
    // space -- matches the portrait layout better than a cramped horizontal bar
    auto mixLabelRow = content.removeFromTop (26);
    mixValueLabel.setBounds (mixLabelRow);

    content.removeFromTop (18);

    const int faderWidth = 76;
    mixSlider.setBounds (content.withSizeKeepingCentre (faderWidth, content.getHeight()));
}

} // namespace phonetesto
