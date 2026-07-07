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

    deviceLabel.setText ("Device", juce::dontSendNotification);
    addAndMakeVisible (deviceLabel);

    deviceBox.addItemList (getSpeakerNames(), 1);
    addAndMakeVisible (deviceBox);
    deviceAttachment = std::make_unique<ComboBoxAttachment> (
        processor.apvts, PhoneTestoAudioProcessor::deviceParamId, deviceBox);

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

    setSize (420, 260);
}

PhoneTestoAudioProcessorEditor::~PhoneTestoAudioProcessorEditor() = default;

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
