#include "PluginEditor.h"

namespace phonetesto
{

namespace layout
{
    constexpr float earWidth = 42.0f;
    constexpr float contentLeft = 66.0f, contentRight = 914.0f;

    const juce::Rectangle<int> vuMeter { 66, 100, 240, 172 };
    const juce::Rectangle<int> display { 648, 100, 268, 236 };

    constexpr juce::Point<float> modelCentre { 432.0f, 222.0f };
    constexpr float modelKnobSize = 132.0f;
    constexpr float modelLegendRadius = 93.0f;
    constexpr float modelDotRadius = 71.0f;

    constexpr juce::Point<float> mixCentre { 584.0f, 168.0f };
    constexpr juce::Point<float> outputCentre { 584.0f, 300.0f };
    constexpr float knobSize = 92.0f;

    constexpr juce::Point<float> monoCentre { 128.0f, 352.0f };
    constexpr juce::Point<float> bypassCentre { 244.0f, 352.0f };
    constexpr juce::Point<float> onAirCentre { 782.0f, 364.0f };

    constexpr float knobStart = juce::MathConstants<float>::pi * 1.25f;
    constexpr float knobEnd = juce::MathConstants<float>::pi * 2.75f;
} // namespace layout

namespace
{
    juce::Rectangle<int> centredBox (juce::Point<float> centre, float w, float h)
    {
        return juce::Rectangle<float> (w, h).withCentre (centre).toNearestInt();
    }

    juce::Rectangle<float> legendBelow (juce::Point<float> centre, float offset, float width = 120.0f)
    {
        return juce::Rectangle<float> (width, 16.0f).withCentre (centre.translated (0.0f, offset));
    }
} // namespace

//==============================================================================
PhoneTestoAudioProcessorEditor::PhoneTestoAudioProcessorEditor (PhoneTestoAudioProcessor& p)
    : AudioProcessorEditor (&p), processor (p)
{
    setLookAndFeel (&lookAndFeel);
    addAndMakeVisible (faceplate);
    faceplate.onPaint = [this] (juce::Graphics& g) { paintFaceplate (g); };
    faceplate.onMouseDown = [this] (const juce::MouseEvent& e) { selectModelAt (e.position); };

    faceplate.addAndMakeVisible (vuMeter);
    faceplate.addAndMakeVisible (display);

    // MODEL: an 8-position stepped switch with a chicken-head knob
    modelSelector.getProperties().set (hw::selectorKnobProperty, true);
    modelSelector.setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
    modelSelector.setTextBoxStyle (juce::Slider::NoTextBox, true, 0, 0);
    modelSelector.setRotaryParameters (layout::knobStart, layout::knobEnd, true);
    modelSelector.setMouseDragSensitivity (160);
    faceplate.addAndMakeVisible (modelSelector);
    modelAttachment = std::make_unique<SliderAttachment> (processor.apvts, PhoneTestoAudioProcessor::deviceParamId, modelSelector);
    modelSelector.onValueChange = [this] { faceplate.repaint(); };

    for (auto* knob : { &mixKnob, &outputKnob })
    {
        knob->setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
        knob->setTextBoxStyle (juce::Slider::NoTextBox, true, 0, 0);
        knob->setRotaryParameters (layout::knobStart, layout::knobEnd, true);
        knob->setPopupDisplayEnabled (true, true, &faceplate, 900);
        faceplate.addAndMakeVisible (*knob);
    }

    mixAttachment = std::make_unique<SliderAttachment> (processor.apvts, PhoneTestoAudioProcessor::mixParamId, mixKnob);
    outputAttachment = std::make_unique<SliderAttachment> (processor.apvts, PhoneTestoAudioProcessor::outputParamId, outputKnob);
    mixKnob.setDoubleClickReturnValue (true, 100.0);
    outputKnob.setDoubleClickReturnValue (true, 70.0);
    mixKnob.textFromValueFunction = [] (double v) { return "MIX  " + juce::String (juce::roundToInt (v)) + "%"; };
    outputKnob.textFromValueFunction = [] (double v)
    {
        return v <= 0.0 ? juce::String ("OUTPUT  -INF dB")
                        : "OUTPUT  " + juce::String (juce::Decibels::gainToDecibels (v / 100.0), 1) + " dB";
    };

    monoButton.getProperties().set (hw::lampColourProperty, (int) hw::colours::lampAmber.getARGB());
    bypassButton.getProperties().set (hw::lampColourProperty, (int) hw::colours::lampAmber.getARGB());
    onAirButton.getProperties().set (hw::lampColourProperty, (int) hw::colours::lampRed.getARGB());
    onAirButton.getProperties().set (hw::lensTextProperty, "ON AIR");

    for (auto* b : { &monoButton, &bypassButton, &onAirButton })
        faceplate.addAndMakeVisible (*b);

    monoAttachment = std::make_unique<ButtonAttachment> (processor.apvts, PhoneTestoAudioProcessor::monoParamId, monoButton);
    bypassAttachment = std::make_unique<ButtonAttachment> (processor.apvts, PhoneTestoAudioProcessor::bypassParamId, bypassButton);
    onAirButton.onClick = [this] { toggleLive(); };

    auto& password = display.getPasswordEditor();
    password.setText (processor.getLivePassword(), juce::dontSendNotification);
    password.onTextChange = [this] { processor.setLivePassword (display.getPasswordEditor().getText().trim()); };

    vuMeter.setBounds (layout::vuMeter);
    display.setBounds (layout::display);
    modelSelector.setBounds (centredBox (layout::modelCentre, layout::modelKnobSize, layout::modelKnobSize));
    mixKnob.setBounds (centredBox (layout::mixCentre, layout::knobSize, layout::knobSize));
    outputKnob.setBounds (centredBox (layout::outputCentre, layout::knobSize, layout::knobSize));
    monoButton.setBounds (centredBox (layout::monoCentre, 88.0f, 56.0f));
    bypassButton.setBounds (centredBox (layout::bypassCentre, 88.0f, 56.0f));
    onAirButton.setBounds (centredBox (layout::onAirCentre, 150.0f, 60.0f));
    faceplate.setBounds (0, 0, faceWidth, faceHeight);

    liveUrl = processor.getLiveMonitorUrl();
    onAirButton.setToggleState (processor.isLiveMonitorRunning(), juce::dontSendNotification);
    updateLiveState();

    setResizable (true, true);
    setResizeLimits (faceWidth * 7 / 10, faceHeight * 7 / 10, faceWidth * 8 / 5, faceHeight * 8 / 5);
    getConstrainer()->setFixedAspectRatio ((double) faceWidth / (double) faceHeight);
    setSize (faceWidth, faceHeight);

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
    faceplate.setTransform (juce::AffineTransform::scale ((float) getWidth() / (float) faceWidth));
}

//==============================================================================
float PhoneTestoAudioProcessorEditor::modelAngle (int index) const
{
    const int last = (int) getSpeakerProfiles().size() - 1;
    return layout::knobStart + (layout::knobEnd - layout::knobStart) * (float) index / (float) last;
}

juce::Point<float> PhoneTestoAudioProcessorEditor::modelLegendCentre (int index) const
{
    return layout::modelCentre.getPointOnCircumference (layout::modelLegendRadius, modelAngle (index));
}

void PhoneTestoAudioProcessorEditor::selectModelAt (juce::Point<float> pos)
{
    if (! modelSelector.isEnabled())
        return;

    for (int i = 0; i < (int) getSpeakerProfiles().size(); ++i)
    {
        if (juce::Rectangle<float> (70.0f, 22.0f).withCentre (modelLegendCentre (i)).contains (pos))
        {
            if (auto* param = processor.apvts.getParameter (PhoneTestoAudioProcessor::deviceParamId))
            {
                param->beginChangeGesture();
                param->setValueNotifyingHost (param->convertTo0to1 ((float) i));
                param->endChangeGesture();
            }
            return;
        }
    }
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

    display.setLive (live || liveStartFailed, liveUrl, live ? processor.getLiveListenerCount() : 0, liveStartFailed);

    // With Live on, the real phone does the colouring, so the emulation
    // controls don't apply: grey them out the way a hardware unit would
    // simply ignore them.
    for (auto* c : { (juce::Component*) &modelSelector, (juce::Component*) &mixKnob,
                     (juce::Component*) &monoButton, (juce::Component*) &bypassButton })
    {
        if (c->isEnabled() == live)
        {
            c->setEnabled (! live);
            c->setAlpha (live ? 0.45f : 1.0f);
            faceplate.repaint();
        }
    }
}

void PhoneTestoAudioProcessorEditor::timerCallback()
{
    const double now = juce::Time::getMillisecondCounterHiRes() * 0.001;
    const auto dt = (float) juce::jlimit (0.001, 0.2, now - lastTimerSeconds);
    lastTimerSeconds = now;

    vuMeter.update (processor.getOutputRms(), dt);
    display.setProfile (juce::roundToInt (modelSelector.getValue()));
    updateLiveState();
}

//==============================================================================
void PhoneTestoAudioProcessorEditor::paintFaceplate (juce::Graphics& g)
{
    using namespace juce;
    namespace c = hw::colours;

    const auto full = Rectangle<float> (0.0f, 0.0f, (float) faceWidth, (float) faceHeight);
    hw::fillPowderCoat (g, full, c::panelTop, c::panelBottom);

    // rack ears with slotted mounting holes
    int screwIndex = 0;
    for (auto ear : { full.withWidth (layout::earWidth), full.withLeft (full.getRight() - layout::earWidth) })
    {
        hw::fillPowderCoat (g, ear, c::earTop, c::earBottom);

        for (float y : { 50.0f, full.getBottom() - 50.0f })
        {
            const auto slot = Rectangle<float> (15.0f, 26.0f).withCentre ({ ear.getCentreX(), y });
            g.setColour (Colours::black.withAlpha (0.75f));
            g.fillRoundedRectangle (slot, 7.5f);
            g.setColour (Colours::white.withAlpha (0.07f));
            g.drawRoundedRectangle (slot.translated (0.0f, 1.0f), 7.5f, 1.0f);
            hw::drawScrew (g, slot.getCentre().translated (0.0f, y < 100.0f ? -3.0f : 3.0f), 6.5f,
                           0.35f + 0.9f * (float) screwIndex++);
        }
    }

    for (float x : { layout::earWidth, full.getRight() - layout::earWidth })
    {
        g.setColour (Colours::black.withAlpha (0.6f));
        g.drawVerticalLine ((int) x, 0.0f, full.getBottom());
        g.setColour (Colours::white.withAlpha (0.06f));
        g.drawVerticalLine ((int) x + 1, 0.0f, full.getBottom());
    }

    g.setColour (Colours::white.withAlpha (0.10f));
    g.drawHorizontalLine (0, 0.0f, full.getRight());
    g.setColour (Colours::black.withAlpha (0.5f));
    g.drawHorizontalLine (faceHeight - 1, 0.0f, full.getRight());

    // header: maker's mark, model badge, description
    const auto logoFont = hw::font (hw::Type::condensedBold, 42.0f, 0.03f);
    const float logoWidth = GlyphArrangement::getStringWidth (logoFont, "PHONETESTO");
    hw::drawLegend (g, "PHONETESTO", { layout::contentLeft, 22.0f, logoWidth + 4.0f, 44.0f }, Justification::centredLeft, logoFont);

    const auto badge = Rectangle<float> (layout::contentLeft + logoWidth + 14.0f, 31.0f, 46.0f, 24.0f);
    g.setColour (c::legend);
    g.fillRoundedRectangle (badge, 3.0f);
    g.setColour (c::panelBottom);
    g.setFont (hw::font (hw::Type::condensedBold, 19.0f, 0.04f));
    g.drawText ("PT-1", badge, Justification::centred, false);

    hw::drawLegend (g, "SPEAKER REFERENCE MONITOR", { badge.getRight() + 14.0f, 31.0f, 300.0f, 24.0f },
                    Justification::centredLeft, hw::font (hw::Type::condensedSemiBold, 16.0f, 0.16f), c::legendDim);

    hw::drawLegend (g, "EMULATE  /  LIVE TO PHONES", { layout::contentRight - 300.0f, 31.0f, 300.0f, 24.0f },
                    Justification::centredRight, hw::font (hw::Type::condensedSemiBold, 14.0f, 0.16f), c::legendDim);

    hw::drawRule (g, layout::contentLeft, layout::contentRight, 80.0f);

    const auto sectionFont = hw::font (hw::Type::condensedBold, 16.0f, 0.14f);

    hw::drawLegend (g, "OUTPUT LEVEL", legendBelow (layout::vuMeter.toFloat().getCentre(), 106.0f, 200.0f),
                    Justification::centred, sectionFont);

    // MODEL selector: printed positions and dots
    hw::drawLegend (g, "MODEL", legendBelow (layout::modelCentre, -122.0f), Justification::centred, sectionFont);

    const int selected = roundToInt (modelSelector.getValue());
    const auto positionFont = hw::font (hw::Type::condensedBold, 14.0f, 0.06f);

    for (int i = 0; i < (int) getSpeakerProfiles().size(); ++i)
    {
        const auto dot = layout::modelCentre.getPointOnCircumference (layout::modelDotRadius, modelAngle (i));
        g.setColour (c::legend.withAlpha (i == selected ? 1.0f : 0.55f));
        g.fillEllipse (Rectangle<float> (4.0f, 4.0f).withCentre (dot));

        hw::drawLegend (g, getSpeakerProfiles()[(size_t) i].shortName,
                        Rectangle<float> (70.0f, 18.0f).withCentre (modelLegendCentre (i)),
                        Justification::centred, positionFont,
                        i == selected ? c::legend : c::legendDim.withAlpha (0.85f));
    }

    // knob scales
    for (auto [centre, label] : { std::pair<Point<float>, const char*> { layout::mixCentre, "MIX" },
                                   { layout::outputCentre, "OUTPUT" } })
    {
        hw::drawKnobScale (g, centre, 44.0f, 50.0f, 11, layout::knobStart, layout::knobEnd, "0", "10");
        hw::drawLegend (g, label, legendBelow (centre, 60.0f), Justification::centred, sectionFont);
    }

    hw::drawLegend (g, "MONO", legendBelow (layout::monoCentre, 36.0f), Justification::centred, sectionFont);
    hw::drawLegend (g, "BYPASS", legendBelow (layout::bypassCentre, 36.0f), Justification::centred, sectionFont);
    hw::drawLegend (g, "LIVE TO PHONES", legendBelow (layout::onAirCentre, 37.0f, 200.0f), Justification::centred, sectionFont);
}

} // namespace phonetesto
