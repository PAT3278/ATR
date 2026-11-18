#include "PluginEditor.h"
#include "BinaryData.h"

#include <qrcodegen.hpp>

namespace phonetesto
{

namespace
{
    juce::WebBrowserComponent::Options browserOptions (PhoneTestoAudioProcessorEditor& editor,
                                                       std::function<void (const juce::var&)> onUi)
    {
        using Options = juce::WebBrowserComponent::Options;
        juce::ignoreUnused (editor);

        return Options {}
           #if JUCE_WINDOWS
            .withBackend (Options::Backend::webview2) // WebView2 exists only on Windows; elsewhere the default is WebKit
           #endif
            .withWinWebView2Options (Options::WinWebView2 {}
                                         // a plugin can't rely on writing next to the host's executable
                                         .withUserDataFolder (juce::File::getSpecialLocation (juce::File::tempDirectory)
                                                                  .getChildFile ("PhoneTesto-WebView"))
                                         .withStatusBarDisabled()
                                         .withBackgroundColour (juce::Colour (0xff0d0c0b)))
            .withNativeIntegrationEnabled()
            .withKeepPageLoadedWhenBrowserIsHidden()
            .withResourceProvider ([] (const juce::String& url) { return PhoneTestoAudioProcessorEditor::getResource (url); })
            .withEventListener ("ui", std::move (onUi));
    }

    juce::String mimeTypeFor (const juce::String& file)
    {
        if (file.endsWithIgnoreCase (".html")) return "text/html; charset=utf-8";
        if (file.endsWithIgnoreCase (".js"))   return "text/javascript; charset=utf-8";
        if (file.endsWithIgnoreCase (".ttf"))  return "font/ttf";
        if (file.endsWithIgnoreCase (".css"))  return "text/css";
        return "application/octet-stream";
    }
}

std::optional<juce::WebBrowserComponent::Resource> PhoneTestoAudioProcessorEditor::getResource (const juce::String& url)
{
    // The page and everything it loads is built into the plugin: it works offline.
    auto path = url.upToFirstOccurrenceOf ("?", false, false).fromLastOccurrenceOf ("/", false, false);
    if (path.isEmpty())
        path = "room.html";

    for (int i = 0; i < BinaryData::namedResourceListSize; ++i)
    {
        if (path != BinaryData::originalFilenames[i])
            continue;

        int size = 0;
        if (const auto* data = BinaryData::getNamedResource (BinaryData::namedResourceList[i], size))
        {
            const auto* bytes = reinterpret_cast<const std::byte*> (data);
            return juce::WebBrowserComponent::Resource { std::vector<std::byte> (bytes, bytes + size), mimeTypeFor (path) };
        }
    }

    return std::nullopt;
}

//==============================================================================
PhoneTestoAudioProcessorEditor::PhoneTestoAudioProcessorEditor (PhoneTestoAudioProcessor& p)
    : AudioProcessorEditor (&p),
      processor (p),
      browser (browserOptions (*this, [this] (const juce::var& v) { handleUi (v); }))
{
    if (juce::WebBrowserComponent::areOptionsSupported (browserOptions (*this, {})))
    {
        addAndMakeVisible (browser);
        browser.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
    }
    else
    {
        // Without a web view the room can't be drawn; say what's missing instead of showing nothing.
        unavailable.setText ("PhoneTesto draws its window with the system's web view, which isn't available here.\n\n"
                             "On Windows, install the Microsoft Edge WebView2 Runtime (free, from microsoft.com), "
                             "then reopen the plugin. The sound works without it.",
                             juce::dontSendNotification);
        unavailable.setJustificationType (juce::Justification::centred);
        unavailable.setColour (juce::Label::textColourId, juce::Colour (0xffeee7dc));
        unavailable.setFont (juce::FontOptions (16.0f));
        addAndMakeVisible (unavailable);
    }

    setResizable (true, true);
    setResizeLimits (720, 480, 1920, 1280);
    const float scale = juce::jlimit (0.72f, 1.9f, processor.getEditorScale());
    setSize (juce::roundToInt (defaultWidth * scale), juce::roundToInt (defaultHeight * scale));
    sizeRestored = true;

    startTimerHz (30);
}

PhoneTestoAudioProcessorEditor::~PhoneTestoAudioProcessorEditor()
{
    stopTimer();
}

void PhoneTestoAudioProcessorEditor::resized()
{
    browser.setBounds (getLocalBounds());
    unavailable.setBounds (getLocalBounds().reduced (60));

    // Remember the size the user picks, to reopen at it.
    if (sizeRestored)
        processor.setEditorScale ((float) getWidth() / (float) defaultWidth);
}

//==============================================================================
void PhoneTestoAudioProcessorEditor::handleUi (const juce::var& v)
{
    const auto type = v["type"].toString();

    if (type == "ready")
        qrSentVersion = -1; // a fresh page: send everything
    else if (type == "param")
        setParameter (v["id"].toString(), (double) v["value"]);
    else if (type == "gesture")
        gesture (v["id"].toString(), (bool) v["on"]);
    else if (type == "onAir")
    {
        liveStartFailed = false;

        if ((bool) v["on"])
            liveStartFailed = ! processor.startLiveMonitor();
        else
            processor.stopLiveMonitor();
    }
    else if (type == "password")
        processor.setLivePassword (v["value"].toString().trim().substring (0, 32));

    // Answer at once, so a control never waits a frame to show what it did.
    browser.emitEventIfBrowserIsVisible ("state", makeState());
}

void PhoneTestoAudioProcessorEditor::setParameter (const juce::String& id, double value)
{
    if (auto* param = processor.apvts.getParameter (id))
        param->setValueNotifyingHost (param->convertTo0to1 ((float) value));
}

void PhoneTestoAudioProcessorEditor::gesture (const juce::String& id, bool begin)
{
    if (auto* param = processor.apvts.getParameter (id))
    {
        if (begin)
            param->beginChangeGesture();
        else
            param->endChangeGesture();
    }
}

//==============================================================================
juce::Array<juce::var> PhoneTestoAudioProcessorEditor::spectrumBands()
{
    std::fill (fftData.begin(), fftData.end(), 0.0f);
    processor.copyScope (fftData.data(), fftSize);
    window.multiplyWithWindowingTable (fftData.data(), (size_t) fftSize);
    fft.performFrequencyOnlyForwardTransform (fftData.data());

    const double rate = processor.getSampleRate() > 0.0 ? processor.getSampleRate() : 44100.0;
    const double lo = std::log (60.0), hi = std::log (18000.0);
    const float norm = 4.0f / (float) fftSize; // a full-scale sine reads about 0 dB after the Hann window

    juce::Array<juce::var> out;
    for (int k = 0; k < numBands; ++k)
    {
        const double f0 = std::exp (lo + (hi - lo) * k / numBands), f1 = std::exp (lo + (hi - lo) * (k + 1) / numBands);
        const int b0 = juce::jlimit (1, fftSize / 2 - 1, (int) std::floor (f0 / rate * fftSize));
        const int b1 = juce::jlimit (b0, fftSize / 2 - 1, (int) std::ceil (f1 / rate * fftSize));
        float mag = 0.0f;
        for (int b = b0; b <= b1; ++b)
            mag = juce::jmax (mag, fftData[(size_t) b]);

        const float db = juce::Decibels::gainToDecibels (mag * norm, -90.0f);
        const float v = juce::jlimit (0.0f, 1.0f, juce::jmap (db, -72.0f, -6.0f, 0.0f, 1.0f));
        bands[(size_t) k] = juce::jmax (v, bands[(size_t) k] * 0.86f); // quick rise, gentle fall
        out.add (std::round (bands[(size_t) k] * 1000.0f) / 1000.0f);
    }
    return out;
}

juce::var PhoneTestoAudioProcessorEditor::makeState()
{
    auto& apvts = processor.apvts;
    auto* state = new juce::DynamicObject();

    state->setProperty ("device", (int) apvts.getRawParameterValue (PhoneTestoAudioProcessor::deviceParamId)->load());
    state->setProperty ("mix", apvts.getRawParameterValue (PhoneTestoAudioProcessor::mixParamId)->load());
    state->setProperty ("output", apvts.getRawParameterValue (PhoneTestoAudioProcessor::outputParamId)->load());
    state->setProperty ("mono", apvts.getRawParameterValue (PhoneTestoAudioProcessor::monoParamId)->load() > 0.5f);
    state->setProperty ("bypass", apvts.getRawParameterValue (PhoneTestoAudioProcessor::bypassParamId)->load() > 0.5f);
    state->setProperty ("peak", juce::Array<juce::var> { processor.getOutputPeak (0), processor.getOutputPeak (1) });
    state->setProperty ("dry", processor.getInputPeak());
    state->setProperty ("bands", spectrumBands());

    const bool live = processor.isLiveMonitorRunning();
    const auto url = live ? processor.getLiveMonitorUrl() : juce::String();

    if (url != liveUrl)
    {
        liveUrl = url;
        qrText.clear();
        qrSize = 0;

        ++qrVersion;

        if (url.isNotEmpty())
        {
            const auto qr = qrcodegen::QrCode::encodeText (url.toRawUTF8(), qrcodegen::QrCode::Ecc::MEDIUM);
            qrSize = qr.getSize();
            juce::String bits;
            bits.preallocateBytes ((size_t) (qrSize * qrSize));
            for (int y = 0; y < qrSize; ++y)
                for (int x = 0; x < qrSize; ++x)
                    bits << (qr.getModule (x, y) ? "1" : "0");
            qrText = bits;
        }
    }

    auto* liveState = new juce::DynamicObject();
    liveState->setProperty ("on", live);
    liveState->setProperty ("failed", liveStartFailed);
    liveState->setProperty ("url", liveUrl);
    liveState->setProperty ("listeners", live ? processor.getLiveListenerCount() : 0);
    liveState->setProperty ("password", processor.getLivePassword());
    liveState->setProperty ("code", processor.getAutoAccessCode());
    // The code only changes with the address: send it then, and once a second
    // in case the page missed it (it ignores events while hidden).
    liveState->setProperty ("qrVersion", qrVersion);
    if (qrVersion != qrSentVersion || ++framesSinceQr >= 30)
    {
        liveState->setProperty ("qr", qrText);
        liveState->setProperty ("qrSize", qrSize);
        qrSentVersion = qrVersion;
        framesSinceQr = 0;
    }
    state->setProperty ("live", juce::var (liveState));

    return juce::var (state);
}

void PhoneTestoAudioProcessorEditor::timerCallback()
{
    browser.emitEventIfBrowserIsVisible ("state", makeState());
}

} // namespace phonetesto
