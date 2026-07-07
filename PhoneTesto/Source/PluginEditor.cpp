#include "PluginEditor.h"

namespace phonetesto
{

PhoneTestoAudioProcessorEditor::PhoneTestoAudioProcessorEditor (PhoneTestoAudioProcessor& p)
    : AudioProcessorEditor (&p), processor (p)
{
    titleLabel.setText ("PhoneTesto", juce::dontSendNotification);
    titleLabel.setFont (juce::Font (22.0f, juce::Font::bold));
    titleLabel.setJustificationType (juce::Justification::centred);
    addAndMakeVisible (titleLabel);

    addChildComponent (preview2D);
    addChildComponent (preview3D);

    view2DButton.setClickingTogglesState (true);
    view3DButton.setClickingTogglesState (true);
    view2DButton.setRadioGroupId (1001, juce::dontSendNotification);
    view3DButton.setRadioGroupId (1001, juce::dontSendNotification);
    view2DButton.onClick = [this] { setPreviewMode (false); };
    view3DButton.onClick = [this] { setPreviewMode (true); };
    addAndMakeVisible (view2DButton);
    addAndMakeVisible (view3DButton);
    setPreviewMode (false);

    deviceLabel.setText ("Device", juce::dontSendNotification);
    addAndMakeVisible (deviceLabel);

    deviceBox.addItemList (getSpeakerNames(), 1);
    addAndMakeVisible (deviceBox);
    deviceAttachment = std::make_unique<ComboBoxAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::deviceParamId, deviceBox);
    deviceBox.onChange = [this] { updateDevicePreview(); };

    mixLabel.setText ("Mix", juce::dontSendNotification);
    addAndMakeVisible (mixLabel);
    mixSlider.setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
    mixSlider.setTextBoxStyle (juce::Slider::TextBoxBelow, false, 60, 20);
    addAndMakeVisible (mixSlider);
    mixAttachment = std::make_unique<SliderAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::mixParamId, mixSlider);

    outputLabel.setText ("Output", juce::dontSendNotification);
    addAndMakeVisible (outputLabel);
    outputSlider.setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
    outputSlider.setTextBoxStyle (juce::Slider::TextBoxBelow, false, 60, 20);
    addAndMakeVisible (outputSlider);
    outputAttachment = std::make_unique<SliderAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::outputParamId, outputSlider);

    addAndMakeVisible (monoButton);
    monoAttachment = std::make_unique<ButtonAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::monoParamId, monoButton);

    addAndMakeVisible (bypassButton);
    bypassAttachment = std::make_unique<ButtonAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::bypassParamId, bypassButton);

    updateDevicePreview();
    startTimerHz (10); // catches host-automated device changes that bypass onChange

    setSize (420, 420);
}

PhoneTestoAudioProcessorEditor::~PhoneTestoAudioProcessorEditor()
{
    stopTimer();
}

void PhoneTestoAudioProcessorEditor::timerCallback()
{
    updateDevicePreview();
}

void PhoneTestoAudioProcessorEditor::setPreviewMode (bool use3D)
{
    showing3D = use3D;
    preview2D.setVisible (! use3D);
    preview3D.setVisible (use3D);
    view2DButton.setToggleState (! use3D, juce::dontSendNotification);
    view3DButton.setToggleState (use3D, juce::dontSendNotification);
}

void PhoneTestoAudioProcessorEditor::updateDevicePreview()
{
    const int deviceIndex = (int) processor.apvts.getRawParameterValue (PhoneTestoAudioProcessor::deviceParamId)->load();

    if (deviceIndex == lastPreviewDeviceIndex)
        return;

    lastPreviewDeviceIndex = deviceIndex;

    const auto& profiles = getSpeakerProfiles();
    const auto& profile = profiles[(size_t) juce::jlimit (0, (int) profiles.size() - 1, deviceIndex)];
    const auto accent = juce::Colour (profile.accentColor);

    preview2D.setDevice (profile.shape, accent);
    preview3D.setDevice (profile.shape, accent);
}

void PhoneTestoAudioProcessorEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour (0xff1e1f24));

    g.setColour (juce::Colours::white.withAlpha (0.08f));
    g.drawRoundedRectangle (getLocalBounds().reduced (8).toFloat(), 10.0f, 1.5f);
}

void PhoneTestoAudioProcessorEditor::resized()
{
    auto area = getLocalBounds().reduced (16);

    titleLabel.setBounds (area.removeFromTop (32));
    area.removeFromTop (8);

    auto previewArea = area.removeFromTop (150);
    auto toggleColumn = previewArea.removeFromRight (44);
    view2DButton.setBounds (toggleColumn.removeFromTop (24));
    toggleColumn.removeFromTop (4);
    view3DButton.setBounds (toggleColumn.removeFromTop (24));
    preview2D.setBounds (previewArea);
    preview3D.setBounds (previewArea);

    area.removeFromTop (12);

    auto deviceRow = area.removeFromTop (28);
    deviceLabel.setBounds (deviceRow.removeFromLeft (70));
    deviceBox.setBounds (deviceRow);

    area.removeFromTop (16);

    auto knobRow = area.removeFromTop (120);
    auto mixArea = knobRow.removeFromLeft (knobRow.getWidth() / 2);
    mixLabel.setBounds (mixArea.removeFromTop (18));
    mixSlider.setBounds (mixArea);

    outputLabel.setBounds (knobRow.removeFromTop (18));
    outputSlider.setBounds (knobRow);

    area.removeFromTop (12);

    auto toggleRow = area.removeFromTop (28);
    monoButton.setBounds (toggleRow.removeFromLeft (toggleRow.getWidth() / 2));
    bypassButton.setBounds (toggleRow);
}

} // namespace phonetesto
