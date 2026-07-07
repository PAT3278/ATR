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

    mixSlider.setSliderStyle (juce::Slider::LinearHorizontal);
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
    mixLnf.setAccentColour (accentColour);
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
    g.fillRoundedRectangle (screenBounds, corner * 0.55f);
    g.setColour (juce::Colours::white.withAlpha (0.06f));
    g.drawRoundedRectangle (screenBounds, corner * 0.55f, 1.0f);

    // camera notch
    const float notchW = body.getWidth() * 0.24f;
    auto notch = juce::Rectangle<float> (notchW, 7.0f)
                     .withCentre ({ body.getCentreX(), body.getY() + 16.0f });
    g.setColour (juce::Colours::black);
    g.fillRoundedRectangle (notch, 3.5f);

    // home indicator
    const float homeW = body.getWidth() * 0.28f;
    auto home = juce::Rectangle<float> (homeW, 4.0f)
                    .withCentre ({ body.getCentreX(), body.getBottom() - 9.0f });
    g.setColour (juce::Colours::white.withAlpha (0.35f));
    g.fillRoundedRectangle (home, 2.0f);
}

void PhoneTestoAudioProcessorEditor::resized()
{
    auto full = getLocalBounds().toFloat();

    auto titleArea = full.removeFromTop (22.0f);
    titleLabel.setBounds (titleArea.toNearestInt());

    phoneBodyBounds = full.reduced (14.0f, 6.0f);
    phoneBodyBounds.removeFromBottom (14.0f);

    screenBounds = phoneBodyBounds.reduced (14.0f);
    screenBounds.removeFromTop (28.0f);
    screenBounds.removeFromBottom (20.0f);

    auto content = screenBounds.toNearestInt();

    auto deviceRow = content.removeFromTop (30);
    deviceBox.setBounds (deviceRow.reduced (10, 3));

    content.removeFromTop (14);

    auto bottomRow = content.removeFromBottom (36);
    monoButton.setBounds (bottomRow.removeFromLeft (bottomRow.getWidth() / 2).reduced (8, 4));
    bypassButton.setBounds (bottomRow.reduced (8, 4));

    content.removeFromBottom (12);

    auto mixLabelRow = content.removeFromTop (24);
    mixValueLabel.setBounds (mixLabelRow);

    content.removeFromTop (10);
    auto mixSliderRow = content.removeFromTop (34);
    mixSlider.setBounds (mixSliderRow.reduced (6, 0));

    // volume HUD floats over the top-right of the screen, like the real iOS overlay
    juce::Rectangle<int> hud (0, 0, 30, 118);
    hud.setPosition (screenBounds.toNearestInt().getRight() - 30 - 10,
                      screenBounds.toNearestInt().getY() + 10);
    outputHudSlider.setBounds (hud);
}

} // namespace phonetesto
