#include "HardwareStyle.h"
#include "BinaryData.h"

namespace phonetesto::hw
{

namespace
{
    /** Fonts and the speckle texture, loaded once and shared while any
        LookAndFeel is alive (a SharedResourcePointer rather than statics, so
        nothing outlives JUCE's shutdown when the host unloads the plugin). */
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

            speckle = juce::Image (juce::Image::ARGB, 160, 160, true);
            juce::Random rnd (1234);

            for (int y = 0; y < speckle.getHeight(); ++y)
                for (int x = 0; x < speckle.getWidth(); ++x)
                    speckle.setPixelAt (x, y, rnd.nextBool() ? juce::Colours::black.withAlpha (rnd.nextFloat() * 0.11f)
                                                             : juce::Colours::white.withAlpha (rnd.nextFloat() * 0.05f));
        }

        juce::Typeface::Ptr faces[5];
        juce::Image speckle;
    };
} // namespace

juce::Font font (Type type, float height, float kerning)
{
    juce::SharedResourcePointer<Resources> res;
    return juce::Font (juce::FontOptions (res->faces[(int) type]).withHeight (height).withKerningFactor (kerning));
}

void fillPowderCoat (juce::Graphics& g, juce::Rectangle<float> area, juce::Colour top, juce::Colour bottom)
{
    g.setGradientFill (juce::ColourGradient (top, area.getX(), area.getY(), bottom, area.getX(), area.getBottom(), false));
    g.fillRect (area);

    juce::SharedResourcePointer<Resources> res;
    g.setTiledImageFill (res->speckle, 0, 0, 1.0f);
    g.fillRect (area);
}

void drawScrew (juce::Graphics& g, juce::Point<float> c, float r, float slotAngle)
{
    const auto head = juce::Rectangle<float> (r * 2.0f, r * 2.0f).withCentre (c);

    // countersink shadow
    g.setColour (juce::Colours::black.withAlpha (0.55f));
    g.fillEllipse (head.expanded (1.2f).translated (0.0f, 0.8f));

    g.setGradientFill (juce::ColourGradient (juce::Colour (0xffd9dadc), c.x - r * 0.4f, c.y - r * 0.6f,
                                             juce::Colour (0xff6c6e72), c.x + r * 0.5f, c.y + r * 0.8f, false));
    g.fillEllipse (head);

    g.setColour (juce::Colours::black.withAlpha (0.35f));
    g.drawEllipse (head, 0.8f);

    // Phillips cross
    for (float a : { slotAngle, slotAngle + juce::MathConstants<float>::halfPi })
    {
        const auto d = juce::Point<float> (std::cos (a), std::sin (a)) * (r * 0.62f);
        g.setColour (juce::Colour (0xff2a2b2e));
        g.drawLine ({ c - d, c + d }, r * 0.28f);
        g.setColour (juce::Colours::white.withAlpha (0.35f));
        g.drawLine ({ c - d + juce::Point<float> (0.0f, r * 0.16f), c + d + juce::Point<float> (0.0f, r * 0.16f) }, 0.6f);
    }
}

void drawLegend (juce::Graphics& g, const juce::String& text, juce::Rectangle<float> area,
                 juce::Justification just, const juce::Font& f, juce::Colour colour)
{
    g.setFont (f);
    g.setColour (juce::Colours::black.withAlpha (0.45f));
    g.drawText (text, area.translated (0.0f, 1.0f), just, false);
    g.setColour (colour);
    g.drawText (text, area, just, false);
}

void drawKnobScale (juce::Graphics& g, juce::Point<float> c, float inner, float outer, int numTicks,
                    float startAngle, float endAngle, const juce::String& minLabel, const juce::String& maxLabel)
{
    for (int i = 0; i < numTicks; ++i)
    {
        const float a = startAngle + (endAngle - startAngle) * (float) i / (float) (numTicks - 1);
        const bool major = (i == 0 || i == numTicks - 1 || i == numTicks / 2);
        const auto p1 = c.getPointOnCircumference (inner, a);
        const auto p2 = c.getPointOnCircumference (major ? outer : inner + (outer - inner) * 0.6f, a);
        g.setColour (colours::legend.withAlpha (major ? 0.95f : 0.6f));
        g.drawLine ({ p1, p2 }, major ? 1.6f : 1.1f);
    }

    const auto labelFont = font (Type::condensedSemiBold, 12.0f);
    const float labelR = outer + 9.0f;
    auto labelAt = [&] (const juce::String& s, float a)
    {
        const auto p = c.getPointOnCircumference (labelR, a);
        drawLegend (g, s, juce::Rectangle<float> (30.0f, 14.0f).withCentre (p), juce::Justification::centred,
                    labelFont, colours::legendDim);
    };

    labelAt (minLabel, startAngle);
    labelAt (maxLabel, endAngle);
}

void drawRule (juce::Graphics& g, float x1, float x2, float y)
{
    g.setColour (juce::Colours::black.withAlpha (0.55f));
    g.drawLine (x1, y, x2, y, 1.0f);
    g.setColour (juce::Colours::white.withAlpha (0.07f));
    g.drawLine (x1, y + 1.0f, x2, y + 1.0f, 1.0f);
}

//==============================================================================
LookAndFeel::LookAndFeel()
    : keepResourcesLoaded (std::make_shared<juce::SharedResourcePointer<Resources>>())
{
    setColour (juce::TooltipWindow::textColourId, colours::amber);
    setColour (juce::BubbleComponent::backgroundColourId, colours::glass);
    setColour (juce::BubbleComponent::outlineColourId, colours::amberDim);
    setColour (juce::TextEditor::textColourId, colours::amber);
    setColour (juce::TextEditor::highlightColourId, colours::amber.withAlpha (0.3f));
    setColour (juce::TextEditor::highlightedTextColourId, colours::amber.brighter (0.4f));
    setColour (juce::CaretComponent::caretColourId, colours::amber);
}

juce::Typeface::Ptr LookAndFeel::getTypefaceForFont (const juce::Font& f)
{
    if (f.getTypefaceName() == juce::Font::getDefaultSansSerifFontName())
        return font (f.isBold() ? Type::sansBold : Type::sansSemiBold, f.getHeight()).getTypefacePtr();

    return juce::LookAndFeel_V4::getTypefaceForFont (f);
}

void LookAndFeel::drawRotarySlider (juce::Graphics& g, int x, int y, int width, int height, float pos,
                                    float startAngle, float endAngle, juce::Slider& slider)
{
    const auto bounds = juce::Rectangle<float> ((float) x, (float) y, (float) width, (float) height);
    const float radius = juce::jmin (bounds.getWidth(), bounds.getHeight()) * 0.5f - 6.0f;
    const float angle = startAngle + pos * (endAngle - startAngle);

    if (slider.getProperties().getWithDefault (selectorKnobProperty, false))
        drawSelectorKnob (g, bounds.getCentre(), radius, angle);
    else
        drawAluminiumKnob (g, bounds.getCentre(), radius, angle);
}

void LookAndFeel::drawAluminiumKnob (juce::Graphics& g, juce::Point<float> c, float r, float angle)
{
    using namespace juce;
    const auto outer = Rectangle<float> (r * 2.0f, r * 2.0f).withCentre (c);

    {
        Path p;
        p.addEllipse (outer);
        DropShadow (Colours::black.withAlpha (0.7f), (int) (r * 0.5f), { 0, (int) (r * 0.22f) }).drawForPath (g, p);
    }

    // knurled black skirt
    g.setGradientFill (ColourGradient (Colour (0xff4b4c51), c.x, c.y - r, Colour (0xff151618), c.x, c.y + r, false));
    g.fillEllipse (outer);

    constexpr int teeth = 56;
    for (int i = 0; i < teeth; ++i)
    {
        const float a = (float) i / (float) teeth * MathConstants<float>::twoPi;
        g.setColour (Colours::black.withAlpha (0.5f));
        g.drawLine ({ c.getPointOnCircumference (r * 0.84f, a), c.getPointOnCircumference (r * 0.995f, a) }, jmax (0.8f, r * 0.04f));
        const float a2 = a + MathConstants<float>::pi / (float) teeth;
        g.setColour (Colours::white.withAlpha (0.09f));
        g.drawLine ({ c.getPointOnCircumference (r * 0.84f, a2), c.getPointOnCircumference (r * 0.995f, a2) }, 0.7f);
    }

    // machined aluminium cap: anisotropic "brushed" shading done as a
    // conic gradient out of thin wedges (JUCE has no conic gradient)
    const float capR = r * 0.78f;
    const auto cap = Rectangle<float> (capR * 2.0f, capR * 2.0f).withCentre (c);
    constexpr int segments = 96;

    for (int i = 0; i < segments; ++i)
    {
        const float a0 = (float) i / (float) segments * MathConstants<float>::twoPi;
        const float a1 = (float) (i + 1) / (float) segments * MathConstants<float>::twoPi;
        const float mid = 0.5f * (a0 + a1);
        const float shade = 0.66f + 0.17f * std::cos (2.0f * (mid - 0.8f)) + 0.05f * std::cos (mid - 5.6f);

        Path wedge;
        wedge.addPieSegment (cap, a0, a1 + 0.02f, 0.0f);
        g.setColour (Colour::fromFloatRGBA (shade, shade, shade * 1.015f, 1.0f));
        g.fillPath (wedge);
    }

    g.setGradientFill (ColourGradient (Colours::white.withAlpha (0.22f), c.x - capR * 0.35f, c.y - capR * 0.45f,
                                       Colours::transparentWhite, c.x, c.y + capR * 0.3f, true));
    g.fillEllipse (cap);

    // bevelled edge: lit from above
    g.setGradientFill (ColourGradient (Colours::white.withAlpha (0.55f), c.x, c.y - capR,
                                       Colours::black.withAlpha (0.55f), c.x, c.y + capR, false));
    g.drawEllipse (cap.reduced (0.6f), jmax (1.0f, r * 0.035f));

    // engraved pointer, with light catching one wall of the groove
    const auto p1 = c.getPointOnCircumference (capR * 0.22f, angle);
    const auto p2 = c.getPointOnCircumference (capR * 0.93f, angle);
    const auto across = Point<float> (std::cos (angle), std::sin (angle)) * jmax (0.8f, r * 0.045f);
    g.setColour (Colour (0xff1c1c1e));
    g.drawLine ({ p1, p2 }, jmax (2.0f, r * 0.08f));
    g.setColour (Colours::white.withAlpha (0.4f));
    g.drawLine ({ p1 + across, p2 + across }, 0.9f);
}

void LookAndFeel::drawSelectorKnob (juce::Graphics& g, juce::Point<float> c, float r, float angle)
{
    using namespace juce;

    // Classic bakelite "chicken-head" seen from above: a round body with a
    // long grip ridge on top whose pointed end overhangs the body, and a
    // cream line inlaid along the pointer.
    const float bodyR = r * 0.6f;
    const auto body = Rectangle<float> (bodyR * 2.0f, bodyR * 2.0f).withCentre (c);

    Path ridge;
    ridge.startNewSubPath (0.0f, -r * 0.99f);
    ridge.quadraticTo (r * 0.27f, -r * 0.34f, r * 0.23f, r * 0.42f);
    ridge.quadraticTo (0.0f, r * 0.66f, -r * 0.23f, r * 0.42f);
    ridge.quadraticTo (-r * 0.27f, -r * 0.34f, 0.0f, -r * 0.99f);
    ridge.closeSubPath();
    ridge.applyTransform (AffineTransform::rotation (angle).translated (c));

    Path silhouette;
    silhouette.addEllipse (body);
    silhouette.addPath (ridge);
    silhouette.setUsingNonZeroWinding (true);
    DropShadow (Colours::black.withAlpha (0.75f), (int) (r * 0.35f), { 0, (int) (r * 0.18f) }).drawForPath (g, silhouette);

    g.setGradientFill (ColourGradient (Colour (0xff2e2a27), c.x - bodyR, c.y - bodyR,
                                       Colour (0xff0a0908), c.x + bodyR, c.y + bodyR, false));
    g.fillEllipse (body);
    g.setGradientFill (ColourGradient (Colours::white.withAlpha (0.22f), c.x, c.y - bodyR,
                                       Colours::black.withAlpha (0.4f), c.x, c.y + bodyR, false));
    g.drawEllipse (body.reduced (0.6f), 1.2f);

    // the ridge stands proud of the body: its own shadow, then lit top-left
    DropShadow (Colours::black.withAlpha (0.6f), (int) (r * 0.14f), { 0, (int) (r * 0.06f) }).drawForPath (g, ridge);
    g.setGradientFill (ColourGradient (Colour (0xff4a4440), c.x - r * 0.5f, c.y - r * 0.6f,
                                       Colour (0xff100e0d), c.x + r * 0.5f, c.y + r * 0.6f, false));
    g.fillPath (ridge);
    g.setColour (Colours::white.withAlpha (0.16f));
    g.strokePath (ridge, PathStrokeType (1.0f));

    const auto l1 = c.getPointOnCircumference (r * 0.22f, angle);
    const auto l2 = c.getPointOnCircumference (r * 0.88f, angle);
    g.setColour (colours::legend);
    g.drawLine ({ l1, l2 }, jmax (1.8f, r * 0.06f));
}

void LookAndFeel::drawToggleButton (juce::Graphics& g, juce::ToggleButton& b, bool highlighted, bool down)
{
    using namespace juce;

    const bool on = b.getToggleState();
    const auto lamp = Colour ((uint32) (int) b.getProperties().getWithDefault (lampColourProperty, (int) colours::lampAmber.getARGB()));

    // leave a margin so the lamp's light spill isn't clipped by the bounds
    auto bezel = b.getLocalBounds().toFloat().reduced (8.0f);
    if (down)
        bezel.translate (0.0f, 1.0f);

    g.setColour (Colours::black.withAlpha (0.6f));
    g.fillRoundedRectangle (bezel.translated (0.0f, 2.0f), 5.0f);

    g.setGradientFill (ColourGradient (Colour (0xff45464b), bezel.getX(), bezel.getY(),
                                       Colour (0xff121214), bezel.getX(), bezel.getBottom(), false));
    g.fillRoundedRectangle (bezel, 5.0f);
    g.setColour (Colours::white.withAlpha (0.12f));
    g.drawRoundedRectangle (bezel.reduced (0.5f), 5.0f, 0.8f);

    const auto lens = bezel.reduced (4.5f);
    Path lensPath;
    lensPath.addRoundedRectangle (lens, 3.0f);

    if (on)
    {
        DropShadow (lamp.withAlpha (0.55f), 14, {}).drawForPath (g, lensPath);
        g.setGradientFill (ColourGradient (lamp.brighter (0.8f), lens.getCentreX(), lens.getCentreY(),
                                           lamp.darker (0.25f), lens.getX(), lens.getY(), true));
    }
    else
    {
        // unlit: a dark, slightly tinted frosted lens
        g.setGradientFill (ColourGradient (lamp.withMultipliedSaturation (0.55f).withMultipliedBrightness (0.24f),
                                           lens.getCentreX(), lens.getCentreY(),
                                           lamp.withMultipliedSaturation (0.4f).withMultipliedBrightness (0.11f),
                                           lens.getX(), lens.getY(), true));
    }
    g.fillPath (lensPath);

    if (highlighted && ! on)
    {
        g.setColour (lamp.withAlpha (0.08f));
        g.fillPath (lensPath);
    }

    // frosted-lens specular band
    g.setGradientFill (ColourGradient (Colours::white.withAlpha (on ? 0.38f : 0.16f), lens.getX(), lens.getY(),
                                       Colours::transparentWhite, lens.getX(), lens.getCentreY(), false));
    g.fillRoundedRectangle (lens.withHeight (lens.getHeight() * 0.55f), 3.0f);

    g.setColour (Colours::black.withAlpha (0.65f));
    g.strokePath (lensPath, PathStrokeType (1.0f));

    const auto text = b.getProperties()[lensTextProperty].toString();
    if (text.isNotEmpty())
    {
        g.setFont (font (Type::condensedBold, lens.getHeight() * 0.56f, 0.1f));
        g.setColour (on ? Colours::white.withAlpha (0.96f) : lamp.withMultipliedBrightness (0.7f).withAlpha (0.75f));
        g.drawText (text, lens, Justification::centred, false);
    }
}

juce::Font LookAndFeel::getSliderPopupFont (juce::Slider&)
{
    return font (Type::condensedBold, 15.0f, 0.04f);
}

int LookAndFeel::getSliderPopupPlacement (juce::Slider&)
{
    return juce::BubbleComponent::above;
}

void LookAndFeel::drawBubble (juce::Graphics& g, juce::BubbleComponent&, const juce::Point<float>&,
                              const juce::Rectangle<float>& body)
{
    g.setColour (colours::glass.withAlpha (0.95f));
    g.fillRoundedRectangle (body, 4.0f);
    g.setColour (colours::amberDim);
    g.drawRoundedRectangle (body.reduced (0.5f), 4.0f, 1.0f);
}

void LookAndFeel::fillTextEditorBackground (juce::Graphics& g, int width, int height, juce::TextEditor&)
{
    g.setColour (juce::Colours::black.withAlpha (0.55f));
    g.fillRoundedRectangle (0.0f, 0.0f, (float) width, (float) height, 3.0f);
}

void LookAndFeel::drawTextEditorOutline (juce::Graphics& g, int width, int height, juce::TextEditor& editor)
{
    g.setColour (editor.hasKeyboardFocus (true) ? colours::amber.withAlpha (0.8f) : colours::amberDim);
    g.drawRoundedRectangle (0.5f, 0.5f, (float) width - 1.0f, (float) height - 1.0f, 3.0f, 1.0f);
}

} // namespace phonetesto::hw
