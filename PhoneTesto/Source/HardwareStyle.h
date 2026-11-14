#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

/** The editor's three looks, each drawn from a kind of real vintage gear and
    switched in turn from the header (see GearStyle.h):

    - DECK: an 80s silver cassette deck.
    - RECEIVER: a 70s hi-fi receiver (the default).
    - LAB: test equipment.

    Components ask skinOf (*this) which one to draw. */
namespace phonetesto::hw
{

enum class Skin
{
    deck,
    receiver,
    lab
};

/** Saved-state indices (0 deck, 1 receiver, 2 lab) and the names the phone page is told. */
inline const char* skinName (Skin s)  { return s == Skin::receiver ? "receiver" : s == Skin::lab ? "lab" : "deck"; }
inline const char* skinLabel (Skin s) { return s == Skin::receiver ? "RECEIVER" : s == Skin::lab ? "LAB" : "DECK"; }
inline Skin skinFromIndex (int i)     { return i == 1 ? Skin::receiver : i == 2 ? Skin::lab : Skin::deck; }
inline int skinIndex (Skin s)         { return s == Skin::receiver ? 1 : s == Skin::lab ? 2 : 0; }

enum class Type
{
    condensedBold,
    condensedSemiBold,
    sansMedium,
    sansSemiBold,
    sansBold,
    sevenSegment // DSEG7 Classic: the readouts
};

juce::Font font (Type, float height, float kerning = 0.0f);

// Component properties read by the LookAndFeel.
constexpr const char* liveProperty    = "hwLive";    // ToggleButton: the ON AIR button
constexpr const char* iconProperty    = "hwIcon";    // ToggleButton: device icon (speaker profile index)
constexpr const char* compactProperty = "hwCompact"; // ToggleButton: small header key, no lamp
constexpr const char* switchProperty  = "hwSwitch";  // ToggleButton: on/off setting (a toggle switch, or a latching key)

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
    Skin skin = Skin::receiver;

    // Keeps the fonts loaded for as long as this LookAndFeel lives,
    // instead of reloading them on every font() call.
    std::shared_ptr<void> keepResourcesLoaded;
};

/** The skin of the LookAndFeel a component is drawn with. */
Skin skinOf (juce::Component&);

} // namespace phonetesto::hw
