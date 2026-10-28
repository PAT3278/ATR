#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace phonetesto
{

/** Draws a scannable QR code for a short text (the Live Monitor URL) on a
    white card, with hard module edges at any window/display scale. */
class QrCodeComponent : public juce::Component
{
public:
    void setText (const juce::String& text);
    const juce::String& getText() const noexcept { return currentText; }

    void paint (juce::Graphics&) override;

private:
    juce::String currentText;
    juce::Image codeImage;
};

} // namespace phonetesto
