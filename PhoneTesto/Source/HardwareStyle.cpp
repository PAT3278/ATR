#include "HardwareStyle.h"
#include "DigitalStyle.h"
#include "BinaryData.h"

namespace phonetesto::hw
{

namespace
{
    /** Fonts, loaded once and shared while any LookAndFeel is alive (a
        SharedResourcePointer rather than statics, so nothing outlives
        JUCE's shutdown when the host unloads the plugin). */
    struct Resources
    {
        Resources()
        {
            auto load = [] (const char* data, int size) { return juce::Typeface::createSystemTypefaceFor (data, (size_t) size); };
            faces[(int) Type::condensedBold]     = load (BinaryData::BarlowCondensedBold_ttf, BinaryData::BarlowCondensedBold_ttfSize);
            faces[(int) Type::condensedSemiBold] = load (BinaryData::BarlowCondensedSemiBold_ttf, BinaryData::BarlowCondensedSemiBold_ttfSize);
            faces[(int) Type::sansMedium]        = load (BinaryData::BarlowMedium_ttf, BinaryData::BarlowMedium_ttfSize);
            faces[(int) Type::sansSemiBold]      = load (BinaryData::BarlowSemiBold_ttf, BinaryData::BarlowSemiBold_ttfSize);
            faces[(int) Type::sansBold]          = load (BinaryData::BarlowBold_ttf, BinaryData::BarlowBold_ttfSize);
            faces[(int) Type::digitalSemiBold]   = load (BinaryData::PTDigitalSemiBold_ttf, BinaryData::PTDigitalSemiBold_ttfSize);
            faces[(int) Type::digitalBold]       = load (BinaryData::PTDigitalBold_ttf, BinaryData::PTDigitalBold_ttfSize);
        }

        juce::Typeface::Ptr faces[7];
    };
} // namespace

juce::Font font (Type type, float height, float kerning)
{
    juce::SharedResourcePointer<Resources> res;
    return juce::Font (juce::FontOptions (res->faces[(int) type]).withHeight (height).withKerningFactor (kerning));
}

void drawLabel (juce::Graphics& g, const juce::String& text, juce::Rectangle<float> area,
                juce::Justification just, juce::Colour colour, float height)
{
    g.setFont (font (Type::condensedBold, height, 0.14f));
    g.setColour (colour);
    g.drawText (text.toUpperCase(), area, just, false);
}

//==============================================================================
LookAndFeel::LookAndFeel()
    : keepResourcesLoaded (std::make_shared<juce::SharedResourcePointer<Resources>>())
{
    setColour (juce::TextEditor::textColourId, colours::text);
    setColour (juce::TextEditor::highlightColourId, colours::accent.withAlpha (0.35f));
    setColour (juce::TextEditor::highlightedTextColourId, colours::text);
    setColour (juce::CaretComponent::caretColourId, colours::accent);
}

void LookAndFeel::setSkin (Skin newSkin)
{
    skin = newSkin;
    const auto accent = skin == Skin::digital ? digital::colours::accent : colours::accent;
    const auto text = skin == Skin::digital ? digital::colours::text : colours::text;
    setColour (juce::TextEditor::textColourId, text);
    setColour (juce::TextEditor::highlightColourId, accent.withAlpha (0.35f));
    setColour (juce::TextEditor::highlightedTextColourId, text);
    setColour (juce::CaretComponent::caretColourId, accent);
}

Skin skinOf (juce::Component& c)
{
    if (auto* lf = dynamic_cast<LookAndFeel*> (&c.getLookAndFeel()))
        return lf->getSkin();

    return Skin::flat;
}

juce::Typeface::Ptr LookAndFeel::getTypefaceForFont (const juce::Font& f)
{
    if (f.getTypefaceName() == juce::Font::getDefaultSansSerifFontName())
        return font (f.isBold() ? Type::sansBold : Type::sansSemiBold, f.getHeight()).getTypefacePtr();

    return juce::LookAndFeel_V4::getTypefaceForFont (f);
}

void LookAndFeel::drawRotarySlider (juce::Graphics& g, int x, int y, int width, int height, float pos,
                                    float startAngle, float endAngle, juce::Slider&)
{
    using namespace juce;

    const auto bounds = Rectangle<float> ((float) x, (float) y, (float) width, (float) height);

    if (skin == Skin::digital)
    {
        digital::drawKnob (g, bounds, pos, startAngle, endAngle);
        return;
    }

    const auto c = bounds.getCentre();
    const float r = jmin (bounds.getWidth(), bounds.getHeight()) * 0.5f - 3.0f;
    const float angle = startAngle + pos * (endAngle - startAngle);
    const float ringR = r - 2.0f;
    constexpr float ringThickness = 4.0f;

    Path track;
    track.addCentredArc (c.x, c.y, ringR, ringR, 0.0f, startAngle, endAngle, true);
    g.setColour (colours::border);
    g.strokePath (track, PathStrokeType (ringThickness, PathStrokeType::curved, PathStrokeType::rounded));

    if (pos > 0.001f)
    {
        Path value;
        value.addCentredArc (c.x, c.y, ringR, ringR, 0.0f, startAngle, angle, true);
        g.setColour (colours::accent);
        g.strokePath (value, PathStrokeType (ringThickness, PathStrokeType::curved, PathStrokeType::rounded));
    }

    // flat knob body with a hairline edge and just enough top-light to read
    // as a physical cap
    const float bodyR = r * 0.72f;
    const auto body = Rectangle<float> (bodyR * 2.0f, bodyR * 2.0f).withCentre (c);
    g.setColour (Colours::black.withAlpha (0.35f));
    g.fillEllipse (body.translated (0.0f, 2.0f));
    g.setGradientFill (ColourGradient (colours::surfaceHi, c.x, body.getY(), colours::surface.darker (0.15f), c.x, body.getBottom(), false));
    g.fillEllipse (body);
    g.setColour (colours::border.brighter (0.15f));
    g.drawEllipse (body.reduced (0.5f), 1.0f);

    g.setColour (colours::text);
    g.drawLine ({ c.getPointOnCircumference (bodyR * 0.30f, angle), c.getPointOnCircumference (bodyR * 0.82f, angle) }, 2.6f);
}

void LookAndFeel::drawToggleButton (juce::Graphics& g, juce::ToggleButton& b, bool highlighted, bool down)
{
    using namespace juce;

    if (skin == Skin::digital)
    {
        digital::drawToggleButton (g, b, highlighted, down);
        return;
    }

    const bool on = b.getToggleState();
    const bool solid = b.getProperties().getWithDefault (solidWhenOnProperty, false);
    const bool compact = b.getProperties().getWithDefault (compactProperty, false);
    const auto led = Colour ((uint32) (int) b.getProperties().getWithDefault (ledColourProperty, (int) colours::accent.getARGB()));
    const auto bounds = b.getLocalBounds().toFloat().reduced (1.0f);
    const float corner = compact ? bounds.getHeight() * 0.5f : 6.0f;

    if (compact)
    {
        // small header pill: no LED, just a label
        g.setColour (highlighted ? colours::surfaceHi : colours::surface);
        g.fillRoundedRectangle (bounds, corner);
        g.setColour (colours::border);
        g.drawRoundedRectangle (bounds.reduced (0.5f), corner, 1.0f);
        g.setColour (colours::textDim);
        g.setFont (font (Type::condensedBold, 13.0f, 0.12f));
        g.drawText (b.getButtonText(), bounds, Justification::centred, false);
        return;
    }

    Colour fill = colours::surface, edge = colours::border, textColour = colours::text.withAlpha (0.78f);

    if (on && solid)
    {
        fill = led;
        edge = led.brighter (0.2f);
        textColour = Colours::white;
    }
    else if (on)
    {
        fill = colours::surface.interpolatedWith (led, 0.14f);
        edge = led.withAlpha (0.75f);
        textColour = colours::text;
    }
    else if (highlighted)
    {
        fill = colours::surfaceHi;
    }

    if (down)
        fill = fill.darker (0.12f);

    g.setColour (Colours::black.withAlpha (0.3f));
    g.fillRoundedRectangle (bounds.translated (0.0f, 1.5f), corner);
    g.setColour (fill);
    g.fillRoundedRectangle (bounds, corner);
    g.setColour (edge);
    g.drawRoundedRectangle (bounds.reduced (0.5f), corner, 1.0f);

    // LED
    const auto ledCentre = Point<float> (bounds.getX() + 14.0f, bounds.getCentreY());
    if (on)
    {
        g.setColour ((solid ? Colours::white : led).withAlpha (0.3f));
        g.fillEllipse (Rectangle<float> (14.0f, 14.0f).withCentre (ledCentre));
    }
    g.setColour (on ? (solid ? Colours::white : led) : colours::ledOff);
    g.fillEllipse (Rectangle<float> (7.0f, 7.0f).withCentre (ledCentre));

    g.setColour (textColour);
    g.setFont (font (Type::condensedBold, jmin (17.0f, bounds.getHeight() * 0.44f), 0.08f));
    g.drawText (b.getButtonText(), bounds.withTrimmedLeft (24.0f).withTrimmedRight (8.0f), Justification::centred, false);
}

void LookAndFeel::fillTextEditorBackground (juce::Graphics& g, int width, int height, juce::TextEditor&)
{
    g.setColour (skin == Skin::digital ? juce::Colour (0x88061533) : colours::surface);
    g.fillRoundedRectangle (0.0f, 0.0f, (float) width, (float) height, 5.0f);
}

void LookAndFeel::drawTextEditorOutline (juce::Graphics& g, int width, int height, juce::TextEditor& editor)
{
    const bool focused = editor.hasKeyboardFocus (true);

    if (skin == Skin::digital)
        g.setColour (focused ? digital::colours::accent : digital::colours::glassEdge);
    else
        g.setColour (focused ? colours::accent : colours::border);

    g.drawRoundedRectangle (0.5f, 0.5f, (float) width - 1.0f, (float) height - 1.0f, 5.0f, 1.0f);
}

void LookAndFeel::drawCornerResizer (juce::Graphics& g, int w, int h, bool isMouseOver, bool isMouseDragging)
{
    const auto dots = skin == Skin::digital ? digital::colours::textDim : colours::textFaint;
    g.setColour (dots.withAlpha (isMouseOver || isMouseDragging ? 1.0f : 0.6f));

    for (int i = 0; i < 3; ++i)
        for (int j = 0; j <= i; ++j)
            g.fillEllipse ((float) w - 5.0f - (float) j * 5.0f, (float) h - 5.0f - (float) (i - j) * 5.0f, 2.2f, 2.2f);
}

} // namespace phonetesto::hw
