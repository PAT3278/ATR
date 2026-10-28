#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <vector>

namespace phonetesto
{

/** Draws a scannable QR code for a short text (the Live Monitor URL), on a
    white card with a quiet zone, snapped to whole pixels so phone cameras
    read it reliably. */
class QrCodeComponent : public juce::Component
{
public:
    void setText (const juce::String& text);
    const juce::String& getText() const noexcept { return currentText; }

    void paint (juce::Graphics&) override;

private:
    juce::String currentText;
    std::vector<bool> modules;
    int size = 0;
};

} // namespace phonetesto
