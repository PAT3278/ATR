#include "HardwareStyle.h"
#include "GearStyle.h"
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
            faces[(int) Type::sevenSegment]      = load (BinaryData::DSEG7ClassicBold_ttf, BinaryData::DSEG7ClassicBold_ttfSize);
        }

        juce::Typeface::Ptr faces[6];
    };
} // namespace

juce::Font font (Type type, float height, float kerning)
{
    juce::SharedResourcePointer<Resources> res;
    return juce::Font (juce::FontOptions (res->faces[(int) type]).withHeight (height).withKerningFactor (kerning));
}

//==============================================================================
LookAndFeel::LookAndFeel()
    : keepResourcesLoaded (std::make_shared<juce::SharedResourcePointer<Resources>>())
{
    setSkin (skin);
}

void LookAndFeel::setSkin (Skin newSkin)
{
    skin = newSkin;
    const auto& look = gear::look (skin);
    // the access-code field sits in the display window, so it uses the display's colour
    setColour (juce::TextEditor::textColourId, look.trace);
    setColour (juce::TextEditor::highlightColourId, look.trace.withAlpha (0.3f));
    setColour (juce::TextEditor::highlightedTextColourId, look.trace);
    setColour (juce::CaretComponent::caretColourId, look.trace);
}

Skin skinOf (juce::Component& c)
{
    if (auto* lf = dynamic_cast<LookAndFeel*> (&c.getLookAndFeel()))
        return lf->getSkin();

    return Skin::receiver;
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
    gear::drawKnob (g, { (float) x, (float) y, (float) width, (float) height }, pos, startAngle, endAngle, skin);
}

void LookAndFeel::drawToggleButton (juce::Graphics& g, juce::ToggleButton& b, bool highlighted, bool down)
{
    gear::drawToggleButton (g, b, highlighted, down, skin);
}

void LookAndFeel::fillTextEditorBackground (juce::Graphics& g, int width, int height, juce::TextEditor&)
{
    // a darker strip within the display window
    g.setColour (juce::Colours::white.withAlpha (0.06f));
    g.fillRoundedRectangle (0.0f, 0.0f, (float) width, (float) height, 2.0f);
}

void LookAndFeel::drawTextEditorOutline (juce::Graphics& g, int width, int height, juce::TextEditor& editor)
{
    if (! editor.hasKeyboardFocus (true))
        return;

    g.setColour (gear::look (skin).trace.withAlpha (0.5f));
    g.drawRoundedRectangle (0.5f, 0.5f, (float) width - 1.0f, (float) height - 1.0f, 2.0f, 1.0f);
}

void LookAndFeel::drawCornerResizer (juce::Graphics& g, int w, int h, bool isMouseOver, bool isMouseDragging)
{
    // ventilation slots in the plate's corner
    g.setColour (gear::look (skin).legend.withAlpha (isMouseOver || isMouseDragging ? 0.7f : 0.35f));

    for (int i = 0; i < 3; ++i)
    {
        juce::Path slot;
        const float o = 4.0f + (float) i * 4.5f;
        slot.startNewSubPath ((float) w - o, (float) h - 3.0f);
        slot.lineTo ((float) w - 3.0f, (float) h - o);
        g.strokePath (slot, juce::PathStrokeType (1.4f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    }
}

} // namespace phonetesto::hw
