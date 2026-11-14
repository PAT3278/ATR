#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "QrCodeComponent.h"

namespace phonetesto
{

/** The panel's main display (a VFD, a lit dial or a CRT, by skin). In Emulate mode it plots the
    selected speaker profile's frequency response; with Live on it shows the
    QR code, URL, password field and listener count. */
class DisplayWindow : public juce::Component
{
public:
    DisplayWindow();

    void setProfile (int profileIndex);
    void setAutoCode (const juce::String& code);
    void setLive (bool isLive, const juce::String& url, int listeners, bool startFailed);

    juce::TextEditor& getPasswordEditor() noexcept { return password; }
    const QrCodeComponent& getQrCode() const noexcept { return qr; }

    void paint (juce::Graphics&) override;
    void resized() override;
    void lookAndFeelChanged() override;

private:
    juce::Rectangle<float> contentArea() const;
    juce::Rectangle<float> plotArea() const;
    void rebuildCurve();
    void paintGraticule (juce::Graphics&, juce::Rectangle<float> plot);

    QrCodeComponent qr;
    juce::TextEditor password;

    int profile = 0;
    bool live = false, failed = false;
    juce::String url;
    int listenerCount = 0;
    juce::String autoCode;
    juce::Path curve;
};

} // namespace phonetesto
