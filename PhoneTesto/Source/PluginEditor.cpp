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

    constexpr float pillY = 17.0f, pillHeight = 26.0f;
    constexpr int skinButtonWidth = 118, skinButtonGap = 10;

} // namespace layout

namespace
{
    juce::Font pillFont (hw::Skin skin)
    {
        return skin == hw::Skin::lab      ? hw::font (hw::Type::condensedBold, 13.0f, 0.03f)
             : skin == hw::Skin::receiver ? hw::font (hw::Type::sansMedium, 11.5f, 0.10f)
                                          : hw::font (hw::Type::sansSemiBold, 11.5f, 0.05f);
    }

    /** The output knob's value as the readout shows it: dB, or dashes when off. */
    juce::String outputDigits (double percent)
    {
        return percent <= 0.0 ? juce::String ("---") : juce::String (juce::Decibels::gainToDecibels (percent / 100.0), 1);
    }
} // namespace

//==============================================================================
PhoneTestoAudioProcessorEditor::PhoneTestoAudioProcessorEditor (PhoneTestoAudioProcessor& p)
    : AudioProcessorEditor (&p), processor (p),
      // read before anything below resizes the window (and so overwrites it)
      savedScale (juce::jlimit (0.7f, 1.6f, p.getEditorScale()))
{
    setLookAndFeel (&lookAndFeel);
    addAndMakeVisible (panel);
    panel.onPaint = [this] (juce::Graphics& g) { paintBackground (g); };

    // first child, so it sits behind the controls
    panel.addAndMakeVisible (overlay);
    overlay.onPaint = [this] (juce::Graphics& g) { paintOverlay (g); };
    overlay.setInterceptsMouseClicks (false, false);

    panel.addAndMakeVisible (meter);
    panel.addAndMakeVisible (display);

    for (auto* knob : { &mixKnob, &outputKnob })
    {
        knob->setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
        knob->setTextBoxStyle (juce::Slider::NoTextBox, true, 0, 0);
        knob->setRotaryParameters (layout::knobStart, layout::knobEnd, true);
        knob->onValueChange = [this] { overlay.repaint(); };
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
        pad.getProperties().set (hw::iconProperty, i);
        pad.setRadioGroupId (1);
        pad.onClick = [this, i] { modelAttachment->setValueAsCompleteGesture ((float) i); };
        panel.addAndMakeVisible (pad);
    }

    modelAttachment = std::make_unique<juce::ParameterAttachment> (
        *processor.apvts.getParameter (PhoneTestoAudioProcessor::deviceParamId),
        [this] (float value) { showSelectedModel (juce::roundToInt (value)); });
    modelAttachment->sendInitialUpdate();

    onAirButton.getProperties().set (hw::liveProperty, true);

    monoButton.getProperties().set (hw::switchProperty, true);
    bypassButton.getProperties().set (hw::switchProperty, true);

    for (auto* b : { &monoButton, &bypassButton, &onAirButton })
        panel.addAndMakeVisible (*b);

    monoAttachment = std::make_unique<ButtonAttachment> (processor.apvts, PhoneTestoAudioProcessor::monoParamId, monoButton);
    bypassAttachment = std::make_unique<ButtonAttachment> (processor.apvts, PhoneTestoAudioProcessor::bypassParamId, bypassButton);
    onAirButton.onClick = [this] { toggleLive(); };

    skinButton.getProperties().set (hw::compactProperty, true);
    skinButton.setTitle ("Skin");
    skinButton.setClickingTogglesState (false);
    skinButton.onClick = [this] { applySkin (hw::skinFromIndex ((hw::skinIndex (skin) + 1) % 3)); }; // DECK -> RECEIVER -> LAB
    panel.addAndMakeVisible (skinButton);

    auto& password = display.getPasswordEditor();
    password.setTitle ("Live password");
    display.setAutoCode (processor.getAutoAccessCode());
    password.setText (processor.getLivePassword(), juce::dontSendNotification);
    password.onTextChange = [this] { processor.setLivePassword (display.getPasswordEditor().getText().trim()); };

    overlay.setBounds (0, 0, faceWidth, faceHeight);
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

    // Everything but the background is drawn from cached images.
    for (auto* c : panel.getChildren())
        c->setBufferedToImage (true);

    liveUrl = processor.getLiveMonitorUrl();
    onAirButton.setToggleState (processor.isLiveMonitorRunning(), juce::dontSendNotification);
    applySkin (hw::skinFromIndex (processor.getEditorSkin()));
    updateLiveState();

    setResizable (true, true);
    setResizeLimits (faceWidth * 7 / 10, faceHeight * 7 / 10, faceWidth * 8 / 5, faceHeight * 8 / 5);
    getConstrainer()->setFixedAspectRatio ((double) faceWidth / (double) faceHeight);
    setSize (juce::roundToInt (faceWidth * savedScale), juce::roundToInt (faceHeight * savedScale));
    sizeRestored = true;

    lastTimerSeconds = juce::Time::getMillisecondCounterHiRes() * 0.001;
    startTimerHz (30); // meter and Live state
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

    // Remember the size the user picks, to reopen at it -- but not the sizes
    // the window passes through while the constructor sets it up.
    if (sizeRestored)
        processor.setEditorScale (scale);
}

//==============================================================================
void PhoneTestoAudioProcessorEditor::applySkin (hw::Skin newSkin)
{
    skin = newSkin;
    lookAndFeel.setSkin (skin);
    processor.setEditorSkin (hw::skinIndex (skin));

    skinButton.setButtonText (hw::skinLabel (skin));

    sendLookAndFeelChange(); // children pick up the skin's colours and repaint
    shownListeners = -1;      // re-lay the header
    updateLiveState();
    panel.repaint();
}

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

        const auto pill = statusPillBounds();
        skinButton.setBounds (juce::roundToInt (pill.getX()) - layout::skinButtonGap - layout::skinButtonWidth,
                              (int) layout::pillY, layout::skinButtonWidth, (int) layout::pillHeight);
        overlay.repaint (0, 0, faceWidth, (int) layout::headerHeight + 8);
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
            overlay.repaint();
        }
    }
}

void PhoneTestoAudioProcessorEditor::timerCallback()
{
    const double now = juce::Time::getMillisecondCounterHiRes() * 0.001;
    const auto dt = juce::jlimit (0.001, 0.2, now - lastTimerSeconds);
    lastTimerSeconds = now;

    meter.update (processor.getOutputPeak (0), processor.getOutputPeak (1), (float) dt);
    updateLiveState();
}

//==============================================================================
juce::String PhoneTestoAudioProcessorEditor::statusText() const
{
    return shownLive ? "ON AIR  " + juce::String (juce::CharPointer_UTF8 ("\xc2\xb7")) + "  "
                           + juce::String (juce::jmax (0, shownListeners)) + " LISTENING"
                     : juce::String ("EMULATE");
}

juce::Rectangle<float> PhoneTestoAudioProcessorEditor::statusPillBounds() const
{
    const float w = juce::GlyphArrangement::getStringWidth (pillFont (skin), statusText()) + 26.0f;
    return { (float) faceWidth - layout::margin - w - 8.0f, layout::pillY, w, layout::pillHeight };
}

void PhoneTestoAudioProcessorEditor::paintBackground (juce::Graphics& g)
{
    faceplate.draw (g, panel.getLocalBounds().toFloat(), skin);
}

void PhoneTestoAudioProcessorEditor::paintOverlay (juce::Graphics& g)
{
    using namespace juce;
    namespace gear = hw::gear;
    const auto& look = gear::look (skin);
    const float left = layout::margin + (skin == hw::Skin::receiver ? 8.0f : 0.0f);

    // --- header: the maker's wordmark, the model, what it is
    switch (skin)
    {
        case hw::Skin::deck:
        {
            const auto logo = hw::font (hw::Type::sansBold, 25.0f, -0.01f);
            const float w = GlyphArrangement::getStringWidth (logo, "PhoneTesto");
            g.setFont (logo);
            g.setColour (look.legend);
            g.drawText ("PhoneTesto", Rectangle<float> (left, 14.0f, w + 4.0f, 32.0f), Justification::centredLeft, false);

            // the model number on a black screened block
            const auto badge = Rectangle<float> (left + w + 12.0f, 20.0f, 44.0f, 19.0f);
            g.setColour (look.legend);
            g.fillRect (badge);
            g.setColour (look.plateTop);
            g.setFont (hw::font (hw::Type::condensedBold, 14.0f, 0.06f));
            g.drawText ("PT-1", badge, Justification::centred, false);
            gear::drawLegend (g, "Stereo speaker reference monitor", { badge.getRight() + 12.0f, 20.0f, 300.0f, 19.0f },
                              Justification::centredLeft, skin, 10.5f, true);

            g.setColour (look.legend);
            g.fillRect (layout::margin, layout::headerHeight, (float) faceWidth - 2.0f * layout::margin, 1.5f);
            break;
        }
        case hw::Skin::receiver:
        {
            const auto logo = hw::font (hw::Type::sansMedium, 20.0f, 0.34f);
            const float w = GlyphArrangement::getStringWidth (logo, "PHONETESTO");
            g.setFont (logo);
            g.setColour (look.legend);
            g.drawText ("PHONETESTO", Rectangle<float> (left, 14.0f, w + 4.0f, 32.0f), Justification::centredLeft, false);
            gear::drawLegend (g, "Stereo monitor receiver   Model PT-1", { left + w + 18.0f, 20.0f, 320.0f, 19.0f },
                              Justification::centredLeft, skin, 10.0f, true);

            // an engraved line: a cut, lit on its lower lip
            const float x0 = left, x1 = (float) faceWidth - left;
            g.setColour (Colours::black.withAlpha (0.35f));
            g.fillRect (x0, layout::headerHeight, x1 - x0, 1.0f);
            g.setColour (Colours::white.withAlpha (0.6f));
            g.fillRect (x0, layout::headerHeight + 1.0f, x1 - x0, 1.0f);
            break;
        }
        case hw::Skin::lab:
        {
            const auto logo = hw::font (hw::Type::condensedBold, 28.0f, 0.0f);
            const float w = GlyphArrangement::getStringWidth (logo, "PHONETESTO");
            g.setFont (logo);
            g.setColour (look.legend);
            g.drawText ("PHONETESTO", Rectangle<float> (left, 13.0f, w + 4.0f, 34.0f), Justification::centredLeft, false);

            const auto model = Rectangle<float> (left + w + 12.0f, 19.0f, 64.0f, 21.0f);
            g.drawRect (model, 1.2f);
            gear::drawLegend (g, "PT-1", model, Justification::centred, skin, 12.0f);
            gear::drawLegend (g, "Speaker reference monitor", { model.getRight() + 12.0f, 19.0f, 300.0f, 21.0f },
                              Justification::centredLeft, skin, 11.0f, true);

            g.setColour (look.legend);
            g.fillRect (layout::margin, layout::headerHeight, (float) faceWidth - 2.0f * layout::margin, 1.2f);
            break;
        }
    }

    // --- status: a lamp and its legend, as a panel would show power / on air
    {
        const auto status = statusPillBounds();
        const bool live = shownLive;
        gear::drawLamp (g, { status.getX() + 8.0f, status.getCentreY() }, 3.6f, live ? look.live : look.lamp, true, skin);
        g.setFont (pillFont (skin));
        g.setColour (live ? look.live.darker (0.35f) : look.legend);
        g.drawText (statusText(), status.withTrimmedLeft (22.0f), Justification::centredLeft, false);
    }

    // --- knobs: their legends, and seven-segment readouts beneath
    for (auto [knob, label, centre] : { std::tuple<Slider*, const char*, Point<float>> { &mixKnob, "Mix", layout::mixCentre },
                                         { &outputKnob, "Output", layout::outputCentre } })
    {
        const float alpha = knob->getAlpha();
        if (alpha < 1.0f)
            g.beginTransparencyLayer (alpha);
        gear::drawLegend (g, label, Rectangle<float> (120.0f, 14.0f).withCentre (centre.translated (0.0f, -64.0f)),
                          Justification::centred, skin, 11.5f);

        const bool isMix = knob == &mixKnob;
        const auto window = Rectangle<float> (70.0f, 26.0f).withCentre (centre.translated (-10.0f, 68.0f));
        gear::drawWindow (g, window, skin, 2.0f);
        gear::drawSevenSegment (g, isMix ? String (roundToInt (knob->getValue())).paddedLeft (' ', 3) : outputDigits (knob->getValue()).paddedLeft (' ', 5),
                                window.reduced (6.0f, 0.0f), Justification::centredRight, look.segment, 15.0f);
        g.setFont (pillFont (skin));
        g.setColour (look.legend);
        g.drawText (isMix ? "%" : "dB", Rectangle<float> (26.0f, 26.0f).withPosition (window.getRight() + 4.0f, window.getY()),
                    Justification::centredLeft, false);
        if (alpha < 1.0f)
            g.endTransparencyLayer();
    }

    // --- the speaker-model keys' legend, in the gap above them
    gear::drawLegend (g, "Speaker model", Rectangle<float> ((float) layout::pads.getX(), (float) layout::display.getBottom() + 1.0f, 200.0f, 11.0f),
                      Justification::centredLeft, skin, 9.0f, true);

    // LAB: section boxes printed round groups of controls
    if (skin == hw::Skin::lab)
    {
        auto box = [&] (Rectangle<float> r, const String& title)
        {
            const auto f = hw::font (hw::Type::condensedBold, 10.0f, 0.04f);
            const float tw = GlyphArrangement::getStringWidth (f, title) + 10.0f;
            g.setColour (look.legend);
            Path p;
            p.startNewSubPath (r.getX() + 10.0f, r.getY());
            p.lineTo (r.getX(), r.getY());
            p.lineTo (r.getX(), r.getBottom());
            p.lineTo (r.getRight(), r.getBottom());
            p.lineTo (r.getRight(), r.getY());
            p.lineTo (r.getX() + 10.0f + tw, r.getY());
            g.strokePath (p, PathStrokeType (1.0f));
            g.setFont (f);
            g.drawText (title, Rectangle<float> (r.getX() + 10.0f, r.getY() - 6.0f, tw, 12.0f), Justification::centred, false);
        };
        box ({ 676.0f, 72.0f, 292.0f, 228.0f }, "MONITOR");
        box ({ 676.0f, 309.0f, 292.0f, 99.0f }, "LIVE TO PHONES");
    }

    // --- what ON AIR does
    gear::drawLegend (g, "Streams this output to phones on your Wi-Fi.", Rectangle<float> ((float) layout::onAir.getX(), (float) layout::onAir.getBottom() + 8.0f,
                      (float) layout::onAir.getWidth(), 14.0f), Justification::centredLeft, skin, 9.5f, true);
    gear::drawLegend (g, "Scan the code on the display.", Rectangle<float> ((float) layout::onAir.getX(), (float) layout::onAir.getBottom() + 22.0f,
                      (float) layout::onAir.getWidth(), 14.0f), Justification::centredLeft, skin, 9.5f, true);
}

} // namespace phonetesto
