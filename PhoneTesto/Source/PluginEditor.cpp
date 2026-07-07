#include "PluginEditor.h"

namespace phonetesto
{

PhoneTestoAudioProcessorEditor::PhoneTestoAudioProcessorEditor (PhoneTestoAudioProcessor& p)
    : AudioProcessorEditor (&p), processor (p)
{
    titleLabel.setText ("PhoneTesto", juce::dontSendNotification);
    titleLabel.setFont (juce::Font (15.0f, juce::Font::bold));
    titleLabel.setJustificationType (juce::Justification::centred);
    titleLabel.setColour (juce::Label::textColourId, juce::Colours::white.withAlpha (0.55f));
    addAndMakeVisible (titleLabel);

    deviceBox.addItemList (getSpeakerNames(), 1);
    deviceBox.setJustificationType (juce::Justification::centred);
    addAndMakeVisible (deviceBox);
    deviceAttachment = std::make_unique<ComboBoxAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::deviceParamId, deviceBox);
    deviceBox.onChange = [this] { updateDeviceVisuals(); };

    mixValueLabel.setJustificationType (juce::Justification::centred);
    mixValueLabel.setFont (juce::Font (14.0f, juce::Font::bold));
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

    outputHudSlider.setSliderStyle (juce::Slider::LinearVertical);
    outputHudSlider.setTextBoxStyle (juce::Slider::NoTextBox, true, 0, 0);
    outputHudSlider.setLookAndFeel (&volumeLnf);
    addAndMakeVisible (outputHudSlider);
    outputAttachment = std::make_unique<SliderAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::outputParamId, outputHudSlider);

    monoButton.setColour (juce::ToggleButton::textColourId, juce::Colours::white.withAlpha (0.85f));
    addAndMakeVisible (monoButton);
    monoAttachment = std::make_unique<ButtonAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::monoParamId, monoButton);

    bypassButton.setColour (juce::ToggleButton::textColourId, juce::Colours::white.withAlpha (0.85f));
    addAndMakeVisible (bypassButton);
    bypassAttachment = std::make_unique<ButtonAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::bypassParamId, bypassButton);

    mixValueLabel.setText ("MIX  " + juce::String ((int) std::round (mixSlider.getValue())) + "%",
                            juce::dontSendNotification);
    updateDeviceVisuals();
    startTimerHz (8); // catches host-automated device changes that bypass onChange

    setSize (320, 640);
}

PhoneTestoAudioProcessorEditor::~PhoneTestoAudioProcessorEditor()
{
    stopTimer();
    mixSlider.setLookAndFeel (nullptr);
    outputHudSlider.setLookAndFeel (nullptr);
}

void PhoneTestoAudioProcessorEditor::timerCallback()
{
    updateDeviceVisuals();
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

    resized(); // bezel proportions differ by chrome style (e.g. SE's thicker bezels)
    repaint();
}

void PhoneTestoAudioProcessorEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour (0xff121317));

    const auto& body = phoneBodyBounds;
    const float corner = body.getWidth() * 0.14f;

    // ground shadow
    const float shadowW = body.getWidth() * 0.72f;
    g.setColour (juce::Colours::black.withAlpha (0.35f));
    g.fillEllipse (body.getCentreX() - shadowW * 0.5f, body.getBottom() + 6.0f, shadowW, 12.0f);

    // phone body
    juce::DropShadow bodyShadow (juce::Colours::black.withAlpha (0.5f), 22, { 0, 8 });
    juce::Path bodyPath;
    bodyPath.addRoundedRectangle (body, corner);
    bodyShadow.drawForPath (g, bodyPath);

    juce::ColourGradient bodyGrad (accentColour.brighter (0.15f), body.getX(), body.getY(),
                                    accentColour.darker (0.55f), body.getX(), body.getBottom(), false);
    g.setGradientFill (bodyGrad);
    g.fillRoundedRectangle (body, corner);

    g.setColour (juce::Colours::white.withAlpha (0.10f));
    g.drawRoundedRectangle (body.reduced (1.0f), corner, 1.5f);

    // decorative side buttons
    g.setColour (juce::Colours::black.withAlpha (0.35f));
    g.fillRoundedRectangle (body.getX() - 3.0f, body.getY() + body.getHeight() * 0.16f, 3.0f, body.getHeight() * 0.07f, 1.5f);
    g.fillRoundedRectangle (body.getX() - 3.0f, body.getY() + body.getHeight() * 0.26f, 3.0f, body.getHeight() * 0.07f, 1.5f);
    g.fillRoundedRectangle (body.getRight(), body.getY() + body.getHeight() * 0.20f, 3.0f, body.getHeight() * 0.10f, 1.5f);

    // screen
    g.setColour (juce::Colour (0xff05060a));
    g.fillRoundedRectangle (screenBounds, corner * 0.5f);
    g.setColour (juce::Colours::white.withAlpha (0.06f));
    g.drawRoundedRectangle (screenBounds, corner * 0.5f, 1.0f);

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

    phoneBodyBounds = full.reduced (14.0f, 6.0f);
    phoneBodyBounds.removeFromBottom (14.0f);

    // the SE's Touch ID design has much thicker bezels than the notch/island phones
    const bool hasHomeButton = (currentChrome == PhoneChromeStyle::homeButton);

    screenBounds = phoneBodyBounds.reduced (14.0f);
    screenBounds.removeFromTop (hasHomeButton ? 30.0f : 26.0f);
    screenBounds.removeFromBottom (hasHomeButton ? 46.0f : 20.0f);

    auto content = screenBounds.toNearestInt();

    // Header row: device picker on the left, volume HUD pinned to the right.
    // Keeping the HUD confined to this fixed-height row (rather than free-
    // floating over the whole screen) is what stops it overlapping the mix
    // fader below.
    auto headerRow = content.removeFromTop (134);
    auto hudColumn = headerRow.removeFromRight (34);
    outputHudSlider.setBounds (hudColumn.reduced (2, 8));

    headerRow.removeFromRight (14);
    auto deviceRow = headerRow.removeFromTop (32);
    deviceBox.setBounds (deviceRow.reduced (4, 4));

    content.removeFromTop (14);

    // bottom toggle row, with room around it so it doesn't crowd the edge
    content.removeFromBottom (16);
    auto bottomRow = content.removeFromBottom (40);
    auto monoArea = bottomRow.removeFromLeft (bottomRow.getWidth() / 2);
    monoButton.setBounds (monoArea.reduced (12, 6));
    bypassButton.setBounds (bottomRow.reduced (12, 6));

    content.removeFromBottom (20);

    // mix label sits just above a vertical fader, which fills the remaining
    // space -- matches the portrait layout better than a cramped horizontal bar
    auto mixLabelRow = content.removeFromTop (26);
    mixValueLabel.setBounds (mixLabelRow);

    content.removeFromTop (16);

    const int faderWidth = 70;
    mixSlider.setBounds (content.withSizeKeepingCentre (faderWidth, content.getHeight()));
}

} // namespace phonetesto
