#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include <juce_dsp/juce_dsp.h>
#include "PluginProcessor.h"

namespace phonetesto
{

/** The editor is a room: the speakers stand on a lamp-lit desk, drawn in 3D
    by a web page (Resources/room.html, with three.js) in the system's web
    view. Moving along the desk changes the model; pulling focus between the
    speaker and the studio monitors behind it sets the mix; ON AIR puts the
    code to scan on the phone in the scene.

    The page sends what the user does as "ui" events; this class turns them
    into parameter changes (with gestures, so hosts record automation) and
    Live Monitor actions, and sends the page the plugin's state 30 times a
    second as a "state" event: parameters, levels, a spectrum of the output,
    and Live (address, QR code, listeners, password). */
class PhoneTestoAudioProcessorEditor : public juce::AudioProcessorEditor,
                                        private juce::Timer
{
public:
    explicit PhoneTestoAudioProcessorEditor (PhoneTestoAudioProcessor&);
    ~PhoneTestoAudioProcessorEditor() override;

    void resized() override;

    static constexpr int defaultWidth = 1000;
    static constexpr int defaultHeight = 660;

    /** A file the page asks for (room.html, three.js, fonts), from the plugin's binary data. */
    static std::optional<juce::WebBrowserComponent::Resource> getResource (const juce::String& url);

private:
    void timerCallback() override;
    void handleUi (const juce::var&);
    void setParameter (const juce::String& id, double value);
    void gesture (const juce::String& id, bool begin);
    juce::var makeState();
    juce::Array<juce::var> spectrumBands();

    PhoneTestoAudioProcessor& processor;
    juce::WebBrowserComponent browser;

    static constexpr int fftOrder = 11, fftSize = 1 << fftOrder, numBands = 30;
    juce::dsp::FFT fft { fftOrder };
    juce::dsp::WindowingFunction<float> window { (size_t) fftSize, juce::dsp::WindowingFunction<float>::hann };
    std::vector<float> fftData = std::vector<float> ((size_t) fftSize * 2, 0.0f);
    std::array<float, numBands> bands {};

    juce::String liveUrl, qrText;
    int qrSize = 0;
    bool liveStartFailed = false;
    bool sizeRestored = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhoneTestoAudioProcessorEditor)
};

} // namespace phonetesto
