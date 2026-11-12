#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

/** The editor's three looks, switched in turn from its header:

    - FLAT: modern flat hardware -- a graphite panel, flat controls with
      hairline borders, LED indicators, one orange accent, Barlow type (the
      phone page mirrors it in Resources/player.html).
    - SUNSET (Skin::digital in code, "digital" in saved state): a warm,
      analog look -- a grainy dusk sky over a shimmering sea, smoky panels,
      cream tape-deck keys and knobs, DM Mono numbers (see DigitalStyle.h).
    - PAPER: simple and quiet -- warm off-white, ink type, tonal controls
      with no outlines, one small vermilion (see PaperStyle.h).

    Components ask skinOf (*this) which one to draw. */
namespace phonetesto::hw
{

enum class Skin
{
    flat,
    digital, // SUNSET
    paper
};

/** Saved-state / protocol names and indices: 0 flat, 1 digital, 2 paper. */
inline const char* skinName (Skin s) { return s == Skin::digital ? "digital" : s == Skin::paper ? "paper" : "flat"; }
inline Skin skinFromIndex (int i)    { return i == 1 ? Skin::digital : i == 2 ? Skin::paper : Skin::flat; }
inline int skinIndex (Skin s)        { return s == Skin::digital ? 1 : s == Skin::paper ? 2 : 0; }

/** Flat skin colours. */
namespace colours
{
    const juce::Colour panel      { 0xff1c1d21 };
    const juce::Colour surface    { 0xff27292f }; // buttons, knob bodies
    const juce::Colour surfaceHi  { 0xff2f3239 };
    const juce::Colour border     { 0xff383b43 };
    const juce::Colour divider    { 0xff2a2c32 };
    const juce::Colour screen     { 0xff131418 }; // display / meter wells
    const juce::Colour text       { 0xfff1f0ec };
    const juce::Colour textDim    { 0xff9497a0 };
    const juce::Colour textFaint  { 0xff5d6069 };
    const juce::Colour accent     { 0xffff8a2b };
    const juce::Colour live       { 0xffff453a };
    const juce::Colour ledOff     { 0xff45484f };
    const juce::Colour meterLow   { 0xff35d07f };
    const juce::Colour meterMid   { 0xffffcc3d };
    const juce::Colour meterHigh  { 0xffff453a };
}

enum class Type
{
    condensedBold,
    condensedSemiBold,
    sansMedium,
    sansSemiBold,
    sansBold,
    monoRegular,     // PhoneTesto Mono (DM Mono, plain zero): the SUNSET skin's numbers
    monoMedium
};

juce::Font font (Type, float height, float kerning = 0.0f);

/** Small uppercase section label. */
void drawLabel (juce::Graphics&, const juce::String&, juce::Rectangle<float>, juce::Justification,
                juce::Colour = colours::textDim, float height = 13.0f);

// Component properties read by the LookAndFeel.
constexpr const char* ledColourProperty   = "hwLed";        // ToggleButton: LED colour (ARGB int)
constexpr const char* solidWhenOnProperty = "hwSolidWhenOn"; // ToggleButton: fill with the LED colour when on
constexpr const char* liveProperty        = "hwLive";        // ToggleButton: the ON AIR button
constexpr const char* iconProperty        = "hwIcon";        // ToggleButton: device icon (speaker profile index)
constexpr const char* compactProperty     = "hwCompact";     // ToggleButton: small header button, no LED
constexpr const char* switchProperty      = "hwSwitch";      // ToggleButton: on/off setting, drawn with a switch (SUNSET)

class LookAndFeel : public juce::LookAndFeel_V4
{
public:
    LookAndFeel();

    void setSkin (Skin);
    Skin getSkin() const noexcept { return skin; }

    void drawRotarySlider (juce::Graphics&, int x, int y, int width, int height, float sliderPos,
                           float rotaryStartAngle, float rotaryEndAngle, juce::Slider&) override;

    void drawToggleButton (juce::Graphics&, juce::ToggleButton&, bool highlighted, bool down) override;

    juce::Typeface::Ptr getTypefaceForFont (const juce::Font&) override;

    void fillTextEditorBackground (juce::Graphics&, int width, int height, juce::TextEditor&) override;
    void drawTextEditorOutline (juce::Graphics&, int width, int height, juce::TextEditor&) override;

    void drawCornerResizer (juce::Graphics&, int w, int h, bool isMouseOver, bool isMouseDragging) override;

private:
    Skin skin = Skin::flat;

    // Keeps the fonts loaded for as long as this LookAndFeel lives,
    // instead of reloading them on every font() call.
    std::shared_ptr<void> keepResourcesLoaded;
};

/** The skin of the LookAndFeel a component is drawn with. */
Skin skinOf (juce::Component&);

} // namespace phonetesto::hw
