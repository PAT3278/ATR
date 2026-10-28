#include "PluginEditor.h"

namespace phonetesto
{

namespace layout
{
    constexpr float margin = 24.0f;
    constexpr float headerHeight = 60.0f;

    const juce::Rectangle<int> display { 24, 80, 532, 222 };
    const juce::Rectangle<int> pads { 24, 314, 532, 80 }; // 2 rows x 4
    constexpr int padGap = 8;
    const juce::Rectangle<int> meter { 580, 80, 84, 314 };

    constexpr juce::Point<float> mixCentre { 754.0f, 162.0f };
    constexpr juce::Point<float> outputCentre { 890.0f, 162.0f };
    constexpr float knobSize = 100.0f;

    const juce::Rectangle<int> mono { 688, 254, 128, 42 };
    const juce::Rectangle<int> bypass { 828, 254, 128, 42 };
    const juce::Rectangle<int> onAir { 688, 314, 268, 46 };

    constexpr float knobStart = juce::MathConstants<float>::pi * 1.25f;
    constexpr float knobEnd = juce::MathConstants<float>::pi * 2.75f;
} // namespace layout

namespace
{
    juce::String outputText (double percent)
    {
        return percent <= 0.0 ? juce::String ("-INF dB")
                              : juce::String (juce::Decibels::gainToDecibels (percent / 100.0), 1) + " dB";
    }
} // namespace

//==============================================================================
PhoneTestoAudioProcessorEditor::PhoneTestoAudioProcessorEditor (PhoneTestoAudioProcessor& p)
    : AudioProcessorEditor (&p), processor (p)
{
    setLookAndFeel (&lookAndFeel);
    addAndMakeVisible (panel);
    panel.onPaint = [this] (juce::Graphics& g) { paintPanel (g); };

    panel.addAndMakeVisible (meter);
    panel.addAndMakeVisible (display);

    for (auto* knob : { &mixKnob, &outputKnob })
    {
        knob->setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
        knob->setTextBoxStyle (juce::Slider::NoTextBox, true, 0, 0);
        knob->setRotaryParameters (layout::knobStart, layout::knobEnd, true);
        knob->onValueChange = [this] { panel.repaint(); };
        panel.addAndMakeVisible (*knob);
    }

    mixAttachment = std::make_unique<SliderAttachment> (processor.apvts, PhoneTestoAudioProcessor::mixParamId, mixKnob);
    outputAttachment = std::make_unique<SliderAttachment> (processor.apvts, PhoneTestoAudioProcessor::outputParamId, outputKnob);
    mixKnob.setDoubleClickReturnValue (true, 100.0);
    outputKnob.setDoubleClickReturnValue (true, 100.0);
    mixKnob.setTitle ("Mix");
    outputKnob.setTitle ("Output");

    // MODEL: eight pads acting as one radio group, bound to the device choice
    for (int i = 0; i < (int) modelPads.size(); ++i)
    {
        auto& pad = modelPads[(size_t) i];
        pad.setButtonText (getSpeakerProfiles()[(size_t) i].shortName);
        pad.setTitle (juce::String ("Model: ") + getSpeakerProfiles()[(size_t) i].name);
        pad.setRadioGroupId (1);
        pad.onClick = [this, i] { modelAttachment->setValueAsCompleteGesture ((float) i); };
        panel.addAndMakeVisible (pad);
    }

    modelAttachment = std::make_unique<juce::ParameterAttachment> (
        *processor.apvts.getParameter (PhoneTestoAudioProcessor::deviceParamId),
        [this] (float value) { showSelectedModel (juce::roundToInt (value)); });
    modelAttachment->sendInitialUpdate();

    onAirButton.getProperties().set (hw::ledColourProperty, (int) hw::colours::live.getARGB());
    onAirButton.getProperties().set (hw::solidWhenOnProperty, true);

    for (auto* b : { &monoButton, &bypassButton, &onAirButton })
        panel.addAndMakeVisible (*b);

    monoAttachment = std::make_unique<ButtonAttachment> (processor.apvts, PhoneTestoAudioProcessor::monoParamId, monoButton);
    bypassAttachment = std::make_unique<ButtonAttachment> (processor.apvts, PhoneTestoAudioProcessor::bypassParamId, bypassButton);
    onAirButton.onClick = [this] { toggleLive(); };

    auto& password = display.getPasswordEditor();
    password.setTitle ("Live password");
    display.setAutoCode (processor.getAutoAccessCode());
    password.setText (processor.getLivePassword(), juce::dontSendNotification);
    password.onTextChange = [this] { processor.setLivePassword (display.getPasswordEditor().getText().trim()); };

    display.setBounds (layout::display);
    meter.setBounds (layout::meter);
    mixKnob.setBounds (juce::Rectangle<float> (layout::knobSize, layout::knobSize).withCentre (layout::mixCentre).toNearestInt());
    outputKnob.setBounds (juce::Rectangle<float> (layout::knobSize, layout::knobSize).withCentre (layout::outputCentre).toNearestInt());
    monoButton.setBounds (layout::mono);
    bypassButton.setBounds (layout::bypass);
    onAirButton.setBounds (layout::onAir);

    const int padW = (layout::pads.getWidth() - 3 * layout::padGap) / 4;
    const int padH = (layout::pads.getHeight() - layout::padGap) / 2;
    for (int i = 0; i < (int) modelPads.size(); ++i)
        modelPads[(size_t) i].setBounds (layout::pads.getX() + (i % 4) * (padW + layout::padGap),
                                         layout::pads.getY() + (i / 4) * (padH + layout::padGap), padW, padH);

    panel.setBounds (0, 0, faceWidth, faceHeight);

    liveUrl = processor.getLiveMonitorUrl();
    onAirButton.setToggleState (processor.isLiveMonitorRunning(), juce::dontSendNotification);
    updateLiveState();

    setResizable (true, true);
    setResizeLimits (faceWidth * 7 / 10, faceHeight * 7 / 10, faceWidth * 8 / 5, faceHeight * 8 / 5);
    getConstrainer()->setFixedAspectRatio ((double) faceWidth / (double) faceHeight);
    const float scale = juce::jlimit (0.7f, 1.6f, processor.getEditorScale());
    setSize (juce::roundToInt (faceWidth * scale), juce::roundToInt (faceHeight * scale));

    lastTimerSeconds = juce::Time::getMillisecondCounterHiRes() * 0.001;
    startTimerHz (30);
}

PhoneTestoAudioProcessorEditor::~PhoneTestoAudioProcessorEditor()
{
    stopTimer();
    setLookAndFeel (nullptr);
}

void PhoneTestoAudioProcessorEditor::resized()
{
    const float scale = (float) getWidth() / (float) faceWidth;
    panel.setTransform (juce::AffineTransform::scale (scale));
    processor.setEditorScale (scale); // reopen at the same size
}

//==============================================================================
void PhoneTestoAudioProcessorEditor::showSelectedModel (int index)
{
    for (int i = 0; i < (int) modelPads.size(); ++i)
        modelPads[(size_t) i].setToggleState (i == index, juce::dontSendNotification);

    display.setProfile (index);
}

void PhoneTestoAudioProcessorEditor::toggleLive()
{
    liveStartFailed = false;

    if (onAirButton.getToggleState())
    {
        liveStartFailed = ! processor.startLiveMonitor();
        onAirButton.setToggleState (! liveStartFailed, juce::dontSendNotification);
    }
    else
    {
        processor.stopLiveMonitor();
    }

    liveUrl = processor.getLiveMonitorUrl();
    updateLiveState();
}

void PhoneTestoAudioProcessorEditor::updateLiveState()
{
    const bool live = processor.isLiveMonitorRunning();
    const int listeners = live ? processor.getLiveListenerCount() : 0;

    // Live may have been started before this editor was opened.
    if (live && liveUrl.isEmpty())
        liveUrl = processor.getLiveMonitorUrl();
    else if (! live)
        liveUrl.clear();

    if (onAirButton.getToggleState() != live && ! liveStartFailed)
        onAirButton.setToggleState (live, juce::dontSendNotification);

    // Reflect a password restored with the project (unless it's being typed).
    auto& password = display.getPasswordEditor();
    const auto stored = processor.getLivePassword();
    if (! password.hasKeyboardFocus (true) && password.getText() != stored)
        password.setText (stored, juce::dontSendNotification);

    display.setLive (live || liveStartFailed, liveUrl, listeners, liveStartFailed);

    if (live != shownLive || listeners != shownListeners)
    {
        shownLive = live;
        shownListeners = listeners;
        panel.repaint (0, 0, faceWidth, (int) layout::headerHeight);
    }

    // With Live on, the real phone does the colouring, so the emulation
    // controls don't apply.
    std::vector<juce::Component*> emulationOnly { &mixKnob, &monoButton, &bypassButton };
    for (auto& pad : modelPads)
        emulationOnly.push_back (&pad);

    for (auto* c : emulationOnly)
    {
        if (c->isEnabled() == live)
        {
            c->setEnabled (! live);
            c->setAlpha (live ? 0.35f : 1.0f);
            panel.repaint();
        }
    }
}

void PhoneTestoAudioProcessorEditor::timerCallback()
{
    const double now = juce::Time::getMillisecondCounterHiRes() * 0.001;
    const auto dt = (float) juce::jlimit (0.001, 0.2, now - lastTimerSeconds);
    lastTimerSeconds = now;

    meter.update (processor.getOutputPeak (0), processor.getOutputPeak (1), dt);
    updateLiveState();
}

//==============================================================================
void PhoneTestoAudioProcessorEditor::paintPanel (juce::Graphics& g)
{
    using namespace juce;
    namespace c = hw::colours;

    g.fillAll (c::panel);

    // header
    const auto logoFont = hw::font (hw::Type::condensedBold, 30.0f, 0.02f);
    const float logoW = GlyphArrangement::getStringWidth (logoFont, "PHONETESTO");
    g.setFont (logoFont);
    g.setColour (c::text);
    g.drawText ("PHONETESTO", Rectangle<float> (layout::margin, 14.0f, logoW + 4.0f, 32.0f), Justification::centredLeft, false);

    const auto badge = Rectangle<float> (layout::margin + logoW + 12.0f, 19.0f, 42.0f, 22.0f);
    g.setColour (c::accent);
    g.fillRoundedRectangle (badge, 4.0f);
    g.setColour (c::panel);
    g.setFont (hw::font (hw::Type::condensedBold, 17.0f, 0.04f));
    g.drawText ("PT-1", badge, Justification::centred, false);

    hw::drawLabel (g, "Speaker reference monitor", { badge.getRight() + 14.0f, 19.0f, 260.0f, 22.0f },
                   Justification::centredLeft, c::textDim, 14.0f);

    // status pill
    {
        const bool live = shownLive;
        const String text = live ? "ON AIR  " + String (CharPointer_UTF8 ("\xc2\xb7")) + "  "
                                       + String (jmax (0, shownListeners)) + " LISTENING"
                                 : String ("EMULATE");
        const auto pillFont = hw::font (hw::Type::condensedBold, 14.0f, 0.12f);
        const float w = GlyphArrangement::getStringWidth (pillFont, text) + 40.0f;
        const auto pill = Rectangle<float> ((float) faceWidth - layout::margin - w, 17.0f, w, 26.0f);

        g.setColour (live ? c::live.withAlpha (0.15f) : c::surface);
        g.fillRoundedRectangle (pill, 13.0f);
        g.setColour (live ? c::live.withAlpha (0.7f) : c::border);
        g.drawRoundedRectangle (pill.reduced (0.5f), 13.0f, 1.0f);
        g.setColour (live ? c::live : c::textFaint);
        g.fillEllipse (Rectangle<float> (7.0f, 7.0f).withCentre ({ pill.getX() + 15.0f, pill.getCentreY() }));
        g.setColour (live ? c::text : c::textDim);
        g.setFont (pillFont);
        g.drawText (text, pill.withTrimmedLeft (26.0f).withTrimmedRight (12.0f), Justification::centredLeft, false);
    }

    g.setColour (c::divider);
    g.fillRect (0.0f, layout::headerHeight, (float) faceWidth, 1.0f);

    // knob labels and readouts
    for (auto [knob, label, centre] : { std::tuple<Slider*, const char*, Point<float>> { &mixKnob, "Mix", layout::mixCentre },
                                         { &outputKnob, "Output", layout::outputCentre } })
    {
        const float alpha = knob->getAlpha();
        hw::drawLabel (g, label, Rectangle<float> (120.0f, 16.0f).withCentre (centre.translated (0.0f, -66.0f)),
                       Justification::centred, c::textDim.withAlpha (alpha));

        const auto value = knob == &mixKnob ? String (roundToInt (knob->getValue())) + "%" : outputText (knob->getValue());
        g.setColour (c::text.withAlpha (alpha));
        g.setFont (hw::font (hw::Type::condensedBold, 20.0f, 0.02f));
        g.drawText (value, Rectangle<float> (130.0f, 24.0f).withCentre (centre.translated (0.0f, 64.0f)), Justification::centred, false);
    }

    g.setColour (c::textFaint);
    g.setFont (hw::font (hw::Type::sansMedium, 13.0f));
    g.drawFittedText ("Streams this output to phones on your Wi-Fi.\nScan the code on the display.",
                      Rectangle<int> (layout::onAir.getX(), layout::onAir.getBottom() + 8, layout::onAir.getWidth(), 34),
                      Justification::centredLeft, 2);
}

} // namespace phonetesto
