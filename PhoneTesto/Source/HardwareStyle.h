#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

/** The rack-hardware look: powder-coated charcoal faceplate, cream
    silk-screened legends set in Barlow, machined aluminium knobs, a bakelite
    chicken-head selector, and illuminated push buttons. Shared by the editor
    and its custom components. */
namespace phonetesto::hw
{

namespace colours
{
    const juce::Colour panelTop    { 0xff36373c };
    const juce::Colour panelBottom { 0xff26272b };
    const juce::Colour earTop      { 0xff2e2f33 };
    const juce::Colour earBottom   { 0xff202124 };
    const juce::Colour legend      { 0xffebe3ce }; // silk-screen cream
    const juce::Colour legendDim   { 0xffa39c8a };
    const juce::Colour amber       { 0xffffb53d }; // display / VU backlight
    const juce::Colour amberDim    { 0xff6e4c16 };
    const juce::Colour glass       { 0xff0e0c09 };
    const juce::Colour lampAmber   { 0xffffa632 };
    const juce::Colour lampRed     { 0xffff3a2c };
}

enum class Type
{
    condensedBold,
    condensedSemiBold,
    sansMedium,
    sansSemiBold,
    sansBold
};

juce::Font font (Type, float height, float kerning = 0.0f);

/** Charcoal powder coat: vertical gradient plus a fine static speckle. */
void fillPowderCoat (juce::Graphics&, juce::Rectangle<float>, juce::Colour top, juce::Colour bottom);

void drawScrew (juce::Graphics&, juce::Point<float> centre, float radius, float slotAngle);

/** Silk-screened legend: flat ink with a faint shadow so it sits on the
    texture rather than floating above it. */
void drawLegend (juce::Graphics&, const juce::String&, juce::Rectangle<float>, juce::Justification,
                 const juce::Font&, juce::Colour = colours::legend);

/** Printed tick scale around a knob. */
void drawKnobScale (juce::Graphics&, juce::Point<float> centre, float innerRadius, float outerRadius,
                    int numTicks, float startAngle, float endAngle,
                    const juce::String& minLabel, const juce::String& maxLabel);

/** Engraved horizontal rule. */
void drawRule (juce::Graphics&, float x1, float x2, float y);

// Component properties read by the LookAndFeel.
constexpr const char* selectorKnobProperty = "hwSelector"; // Slider: draw as a chicken-head selector
constexpr const char* lampColourProperty   = "hwLamp";     // ToggleButton: lamp colour (ARGB int)
constexpr const char* lensTextProperty     = "hwLens";     // ToggleButton: text printed on the lens

class LookAndFeel : public juce::LookAndFeel_V4
{
public:
    LookAndFeel();

    void drawRotarySlider (juce::Graphics&, int x, int y, int width, int height, float sliderPos,
                           float rotaryStartAngle, float rotaryEndAngle, juce::Slider&) override;

    void drawToggleButton (juce::Graphics&, juce::ToggleButton&, bool highlighted, bool down) override;

    juce::Typeface::Ptr getTypefaceForFont (const juce::Font&) override;

    juce::Font getSliderPopupFont (juce::Slider&) override;
    int getSliderPopupPlacement (juce::Slider&) override;
    void drawBubble (juce::Graphics&, juce::BubbleComponent&, const juce::Point<float>& tip,
                     const juce::Rectangle<float>& body) override;

    void fillTextEditorBackground (juce::Graphics&, int width, int height, juce::TextEditor&) override;
    void drawTextEditorOutline (juce::Graphics&, int width, int height, juce::TextEditor&) override;

private:
    void drawAluminiumKnob (juce::Graphics&, juce::Point<float> centre, float radius, float angle);
    void drawSelectorKnob (juce::Graphics&, juce::Point<float> centre, float radius, float angle);

    // Keeps the fonts/texture loaded for as long as this LookAndFeel lives,
    // instead of reloading them on every font() call.
    std::shared_ptr<void> keepResourcesLoaded;
};

} // namespace phonetesto::hw
