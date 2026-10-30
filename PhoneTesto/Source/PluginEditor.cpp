#include "PluginEditor.h"
#include "DigitalStyle.h"

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

    constexpr double frameSeconds = 1.0 / 15.0; // DIGITAL background animation: slow waves, so 15 fps is smooth
} // namespace layout

namespace
{
    juce::String outputText (double percent)
    {
        return percent <= 0.0 ? juce::String ("-INF dB")
                              : juce::String (juce::Decibels::gainToDecibels (percent / 100.0), 1) + " dB";
    }

    juce::Font pillFont (hw::Skin skin)
    {
        return skin == hw::Skin::digital ? hw::font (hw::Type::sansBold, 12.0f, 0.14f)
                                         : hw::font (hw::Type::condensedBold, 14.0f, 0.12f);
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

    onAirButton.getProperties().set (hw::ledColourProperty, (int) hw::colours::live.getARGB());
    onAirButton.getProperties().set (hw::solidWhenOnProperty, true);
    onAirButton.getProperties().set (hw::liveProperty, true);

    for (auto* b : { &monoButton, &bypassButton, &onAirButton })
        panel.addAndMakeVisible (*b);

    monoAttachment = std::make_unique<ButtonAttachment> (processor.apvts, PhoneTestoAudioProcessor::monoParamId, monoButton);
    bypassAttachment = std::make_unique<ButtonAttachment> (processor.apvts, PhoneTestoAudioProcessor::bypassParamId, bypassButton);
    onAirButton.onClick = [this] { toggleLive(); };

    skinButton.getProperties().set (hw::compactProperty, true);
    skinButton.setTitle ("Skin");
    skinButton.onClick = [this] { applySkin (skinButton.getToggleState() ? hw::Skin::digital : hw::Skin::flat); };
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
    applySkin (processor.getEditorSkin() == 1 ? hw::Skin::digital : hw::Skin::flat);
    updateLiveState();

    setResizable (true, true);
    setResizeLimits (faceWidth * 7 / 10, faceHeight * 7 / 10, faceWidth * 8 / 5, faceHeight * 8 / 5);
    getConstrainer()->setFixedAspectRatio ((double) faceWidth / (double) faceHeight);
    setSize (juce::roundToInt (faceWidth * savedScale), juce::roundToInt (faceHeight * savedScale));
    sizeRestored = true;

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
    processor.setEditorSkin (skin == hw::Skin::digital ? 1 : 0);

    skinButton.setToggleState (skin == hw::Skin::digital, juce::dontSendNotification);
    skinButton.setButtonText (skin == hw::Skin::digital ? "SKIN: DIGITAL" : "SKIN: FLAT");

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

    if (skin == hw::Skin::digital)
    {
        animationSeconds += dt;
        if ((sinceLastFrame += dt) >= layout::frameSeconds)
        {
            // only the band where the waves move; the controls over it come from cached images
            sinceLastFrame = 0.0;
            const auto top = (int) hw::digital::Background::animatedTop (panel.getLocalBounds().toFloat());
            panel.repaint (0, top, faceWidth, faceHeight - top);
        }
    }
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
    const float w = juce::GlyphArrangement::getStringWidth (pillFont (skin), statusText()) + 40.0f;
    return { (float) faceWidth - layout::margin - w, layout::pillY, w, layout::pillHeight };
}

void PhoneTestoAudioProcessorEditor::paintBackground (juce::Graphics& g)
{
    if (skin == hw::Skin::digital)
        digitalBackground.draw (g, panel.getLocalBounds().toFloat(), animationSeconds);
    else
        g.fillAll (hw::colours::panel);
}

void PhoneTestoAudioProcessorEditor::paintOverlay (juce::Graphics& g)
{
    if (skin == hw::Skin::digital)
        paintDigitalOverlay (g);
    else
        paintFlatOverlay (g);
}

void PhoneTestoAudioProcessorEditor::paintFlatOverlay (juce::Graphics& g)
{
    using namespace juce;
    namespace c = hw::colours;

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
        const auto pill = statusPillBounds();

        g.setColour (live ? c::live.withAlpha (0.15f) : c::surface);
        g.fillRoundedRectangle (pill, 13.0f);
        g.setColour (live ? c::live.withAlpha (0.7f) : c::border);
        g.drawRoundedRectangle (pill.reduced (0.5f), 13.0f, 1.0f);
        g.setColour (live ? c::live : c::textFaint);
        g.fillEllipse (Rectangle<float> (7.0f, 7.0f).withCentre ({ pill.getX() + 15.0f, pill.getCentreY() }));
        g.setColour (live ? c::text : c::textDim);
        g.setFont (pillFont (skin));
        g.drawText (statusText(), pill.withTrimmedLeft (26.0f).withTrimmedRight (12.0f), Justification::centredLeft, false);
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

void PhoneTestoAudioProcessorEditor::paintDigitalOverlay (juce::Graphics& g)
{
    using namespace juce;
    namespace d = hw::digital;
    namespace c = hw::digital::colours;

    // header: glowing logo, glass badge, spaced subtitle
    const auto logoFont = hw::font (hw::Type::digitalBold, 24.0f, 0.06f);
    const float logoW = GlyphArrangement::getStringWidth (logoFont, "PHONETESTO") + 6.0f;
    d::drawGlowText (g, "PHONETESTO", { layout::margin, 15.0f, logoW, 30.0f }, Justification::centredLeft, logoFont, c::text);

    const auto badge = Rectangle<float> (layout::margin + logoW + 12.0f, 18.0f, 50.0f, 24.0f);
    d::drawGlass (g, badge, 12.0f);
    Path badgeEdge;
    badgeEdge.addRoundedRectangle (badge.reduced (0.5f), 12.0f);
    d::strokeGlow (g, badgeEdge, c::accent.withAlpha (0.8f), 1.0f, 0.5f);
    d::drawGlowText (g, "PT-1", badge, Justification::centred, hw::font (hw::Type::digitalBold, 12.0f, 0.06f), c::accent, 0.6f);

    d::drawLabel (g, "Speaker reference monitor", { badge.getRight() + 14.0f, 18.0f, 280.0f, 24.0f },
                  Justification::centredLeft, c::textDim, 11.5f);

    // status pill
    {
        const bool live = shownLive;
        const auto pill = statusPillBounds();
        const float corner = pill.getHeight() * 0.5f;

        d::drawGlass (g, pill, corner);
        if (live)
        {
            g.setColour (c::live.withAlpha (0.22f));
            g.fillRoundedRectangle (pill, corner);
            Path edge;
            edge.addRoundedRectangle (pill.reduced (0.5f), corner);
            d::strokeGlow (g, edge, c::live.withAlpha (0.85f), 1.0f, 0.6f);
        }

        const auto dot = Point<float> (pill.getX() + 15.0f, pill.getCentreY());
        const auto dotColour = live ? c::live : c::accent;
        g.setColour (dotColour.withAlpha (0.3f));
        g.fillEllipse (Rectangle<float> (13.0f, 13.0f).withCentre (dot));
        g.setColour (dotColour);
        g.fillEllipse (Rectangle<float> (6.0f, 6.0f).withCentre (dot));

        g.setColour (live ? c::text : c::textDim);
        g.setFont (pillFont (skin));
        g.drawText (statusText(), pill.withTrimmedLeft (26.0f).withTrimmedRight (12.0f), Justification::centredLeft, false);
    }

    // header rule: a line of light fading out at both ends
    {
        ColourGradient rule (c::accent.withAlpha (0.0f), 0.0f, 0.0f, c::accent.withAlpha (0.0f), (float) faceWidth, 0.0f, false);
        rule.addColour (0.3, c::accent.withAlpha (0.55f));
        rule.addColour (0.7, c::accent.withAlpha (0.55f));
        g.setGradientFill (rule);
        g.fillRect (0.0f, layout::headerHeight, (float) faceWidth, 1.0f);

        ColourGradient haze (rule);
        haze.multiplyOpacity (0.12f);
        g.setGradientFill (haze);
        g.fillRect (0.0f, layout::headerHeight - 3.0f, (float) faceWidth, 7.0f);
    }

    // knob labels and readouts
    for (auto [knob, label, centre] : { std::tuple<Slider*, const char*, Point<float>> { &mixKnob, "Mix", layout::mixCentre },
                                         { &outputKnob, "Output", layout::outputCentre } })
    {
        const float alpha = knob->getAlpha();
        d::drawLabel (g, label, Rectangle<float> (120.0f, 16.0f).withCentre (centre.translated (0.0f, -64.0f)),
                      Justification::centred, c::textDim.withAlpha (alpha));

        const auto value = knob == &mixKnob ? String (roundToInt (knob->getValue())) + "%" : outputText (knob->getValue());
        d::drawGlowText (g, value, Rectangle<float> (140.0f, 24.0f).withCentre (centre.translated (0.0f, 63.0f)),
                         Justification::centred, hw::font (hw::Type::digitalSemiBold, 16.0f, 0.04f),
                         c::text.withAlpha (alpha), 0.8f * alpha);
    }

    g.setColour (c::textFaint.brighter (0.2f));
    g.setFont (hw::font (hw::Type::sansMedium, 13.0f));
    g.drawFittedText ("Streams this output to phones on your Wi-Fi.\nScan the code on the display.",
                      Rectangle<int> (layout::onAir.getX(), layout::onAir.getBottom() + 8, layout::onAir.getWidth(), 34),
                      Justification::centredLeft, 2);
}

} // namespace phonetesto
