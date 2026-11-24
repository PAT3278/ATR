#include "PluginEditor.h"
#include "BinaryData.h"

#include <qrcodegen.hpp>

#if JUCE_WINDOWS
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
 #endif
 #include <windows.h>
#endif

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
        if (file.endsWithIgnoreCase (".glb"))  return "model/gltf-binary";
        if (file.endsWithIgnoreCase (".jpg"))  return "image/jpeg";
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
    if (const auto dir = juce::SystemStats::getEnvironmentVariable ("PHONETESTO_EDITOR_SELFTEST", {}); dir.isNotEmpty())
    {
        selfTestDir = juce::File::getCurrentWorkingDirectory().getChildFile (dir);
        selfTestDir.createDirectory();
        selfTestDir.getChildFile ("editor-selftest.txt").replaceWithText ({});
        selfTestStarted = juce::Time::getMillisecondCounter();
        selfTestLog ("editor opened on " + juce::SystemStats::getOperatingSystemName());
    }

    const bool webViewAvailable = juce::WebBrowserComponent::areOptionsSupported (browserOptions (*this, {}));
    if (selfTestDir != juce::File())
        selfTestLog (juce::String ("web view ") + (webViewAvailable ? "available" : "UNAVAILABLE"));

    if (webViewAvailable)
    {
        addAndMakeVisible (browser);
        browser.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
    }
    else
    {
        // Without a web view the room can't be drawn; say what's missing instead of showing nothing.
        unavailable.setText (unavailableText(), juce::dontSendNotification);
        unavailable.setJustificationType (juce::Justification::centred);
        unavailable.setColour (juce::Label::textColourId, juce::Colour (0xffeee7dc));
        unavailable.setFont (juce::FontOptions (16.0f));
        addAndMakeVisible (unavailable);

        if (selfTestDir != juce::File())
            finishSelfTest ("no web view");
    }

    // Keys the room doesn't use (the space bar's play/stop above all) belong
    // to the host. The page hands keyboard focus back to this window after
    // mouse use, and JUCE passes on any key the editor doesn't take.
    setWantsKeyboardFocus (true);

    // Playing on the user's own phone is what the plugin is for: opening it in
    // Live starts sending straight away, and the first thing on screen is the
    // code to scan.
    if (processor.isLiveMode())
        goLive();

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
    processor.endMorph(); // never leave the sound half way between two speakers
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

    // The room's camera position, about 60 times a second while the user moves:
    // no reply needed.
    if (type == "morph")
    {
        if (v.hasProperty ("end"))
            processor.endMorph();
        else
            processor.setMorphPosition ((float) (double) v["pos"]);

        morphOpen = ! v.hasProperty ("end");
        lastMorphMessage = juce::Time::getMillisecondCounter();
        return;
    }

    if (type == "diag" || type == "snapshot")
    {
        if (selfTestDir == juce::File())
            return;

        if (type == "snapshot")
        {
            // a PNG as a data: URL
            juce::MemoryOutputStream png;
            const auto base64 = v["png"].toString().fromFirstOccurrenceOf (",", false, false);
            if (juce::Base64::convertFromBase64 (png, base64) && png.getDataSize() > 0)
            {
                selfTestDir.getChildFile ("editor-snapshot.png").replaceWithData (png.getData(), png.getDataSize());
                selfTestLog ("snapshot saved (" + juce::String ((int) png.getDataSize()) + " bytes)");
                selfTestSnapshot = true;
            }
        }
        else
        {
            selfTestLog (juce::JSON::toString (v, true));
            selfTestRendered |= v["kind"].toString() == "rendered";
        }

        if (selfTestRendered && selfTestSnapshot)
            finishSelfTest ("done");
        return;
    }

    if (type == "releaseFocus")
    {
        releaseKeyboardToPlugin();
        return;
    }

    if (type == "key")
    {
        forwardKeyToHost (v);
        return;
    }

    if (type == "ready")
        qrSentVersion = -1; // a fresh page: send everything
    else if (type == "param")
        setParameter (v["id"].toString(), (double) v["value"]);
    else if (type == "gesture")
        gesture (v["id"].toString(), (bool) v["on"]);
    else if (type == "mode")
    {
        // Live (phones) or the speaker emulation: one at a time
        if ((bool) v["live"])
            goLive();
        else
            leaveLive();
    }
    else if (type == "password")
        processor.setLivePassword (v["value"].toString().trim().substring (0, 32));

    // Answer at once, so a control never waits a frame to show what it did.
    browser.emitEventIfBrowserIsVisible ("state", makeState());
}

void PhoneTestoAudioProcessorEditor::selfTestLog (const juce::String& line)
{
    const auto seconds = (juce::Time::getMillisecondCounter() - selfTestStarted) / 1000.0;
    selfTestDir.getChildFile ("editor-selftest.txt").appendText (juce::String (seconds, 1) + "s " + line + "\n");
}

void PhoneTestoAudioProcessorEditor::finishSelfTest (const juce::String& why)
{
    if (selfTestDone)
        return;

    selfTestDone = true;
    selfTestLog ("self-test " + why);

    if (juce::JUCEApplicationBase::isStandaloneApp())
        juce::MessageManager::callAsync ([] { juce::JUCEApplicationBase::quit(); });
}

void PhoneTestoAudioProcessorEditor::releaseKeyboardToPlugin()
{
    // The web view keeps keyboard focus after a click; take it back so keys go
    // to the editor, which uses the arrows and lets the host have the rest.
    // (JUCE may still believe the editor is focused, so ask the window itself.)
    if (auto* peer = getPeer())
        peer->grabFocus();

    grabKeyboardFocus();
}

void PhoneTestoAudioProcessorEditor::forwardKeyToHost (const juce::var& v)
{
    // While the page has focus (someone tabbed into it), keys it doesn't use
    // still reach the host. macOS and Linux web views pass them up by
    // themselves; on Windows they're posted to the host's window, as JUCE does
    // for its own windows.
   #if JUCE_WINDOWS
    if (auto* peer = getPeer())
    {
        const auto keyCode = (int) v["keyCode"];
        if (keyCode <= 0 || keyCode > 0xfe)
            return;

        if (auto parent = GetParent ((HWND) peer->getNativeHandle()))
        {
            const bool down = (bool) v["down"];
            const auto scanCode = (LPARAM) MapVirtualKeyW ((UINT) keyCode, MAPVK_VK_TO_VSC);
            LPARAM lParam = 1 | (scanCode << 16);
            if (! down)
                lParam |= (LPARAM) ((1u << 30) | (1u << 31));

            PostMessageW (parent, down ? WM_KEYDOWN : WM_KEYUP, (WPARAM) keyCode, lParam);
        }
    }
   #else
    juce::ignoreUnused (v);
   #endif
}

void PhoneTestoAudioProcessorEditor::goLive()
{
    liveStartFailed = false;
    if (! processor.isLiveMonitorRunning())
        liveStartFailed = ! processor.startLiveMonitor();

    processor.setLiveMode (true); // even if the network refused: no emulation on air

    if (selfTestDir != juce::File())
        selfTestLog (liveStartFailed ? "Live: the server didn't start" : "Live: sending on port " + juce::String (processor.getLiveMonitorPort()));
}

void PhoneTestoAudioProcessorEditor::leaveLive()
{
    processor.endMorph();
    processor.setLiveMode (false);
    processor.stopLiveMonitor(); // phones wait, and reconnect when it's back
    liveStartFailed = false;
}

bool PhoneTestoAudioProcessorEditor::keyPressed (const juce::KeyPress& key)
{
    // The room's own keys: arrows move along the desk and pull focus (mix).
    // Listening on the phone is the first place on the desk, left of the
    // first speaker: on the air the right arrow goes on to that speaker.
    if (processor.isLiveMode())
    {
        if (key == juce::KeyPress::rightKey)
        {
            leaveLive();
            gesture (PhoneTestoAudioProcessor::deviceParamId, true);
            setParameter (PhoneTestoAudioProcessor::deviceParamId, 0.0);
            gesture (PhoneTestoAudioProcessor::deviceParamId, false);
            return true;
        }
        return key == juce::KeyPress::leftKey; // nothing further left; the rest is the host's (no mix on air)
    }

    if (key == juce::KeyPress::leftKey && (int) processor.apvts.getRawParameterValue (PhoneTestoAudioProcessor::deviceParamId)->load() <= 0)
    {
        processor.endMorph();
        goLive();
        return true;
    }

    if (key == juce::KeyPress::leftKey)  { stepParameter (PhoneTestoAudioProcessor::deviceParamId, -1.0); return true; }
    if (key == juce::KeyPress::rightKey) { stepParameter (PhoneTestoAudioProcessor::deviceParamId, 1.0);  return true; }
    if (key == juce::KeyPress::upKey)    { stepParameter (PhoneTestoAudioProcessor::mixParamId, 5.0);     return true; } // as dragging up: nearer the phone
    if (key == juce::KeyPress::downKey)  { stepParameter (PhoneTestoAudioProcessor::mixParamId, -5.0);    return true; }

    return false; // everything else is the host's
}

void PhoneTestoAudioProcessorEditor::stepParameter (const juce::String& id, double delta)
{
    if (auto* param = dynamic_cast<juce::RangedAudioParameter*> (processor.apvts.getParameter (id)))
    {
        const auto& range = param->getNormalisableRange();
        const double now = range.convertFrom0to1 (param->getValue());
        const double next = juce::jlimit ((double) range.start, (double) range.end, now + delta);

        param->beginChangeGesture();
        param->setValueNotifyingHost (param->convertTo0to1 ((float) next));
        param->endChangeGesture();
    }
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
    state->setProperty ("mode", processor.isLiveMode() ? "live" : "emulate");
    if (selfTestDir != juce::File())
        state->setProperty ("selfTest", true);

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

juce::String PhoneTestoAudioProcessorEditor::unavailableText() const
{
    juce::String text ("PhoneTesto draws its window with the system's web view, which isn't available here.\n"
                       "On Windows, install the Microsoft Edge WebView2 Runtime (free, from microsoft.com) and reopen the plugin.");

    // the main thing still works: say where phones can listen
    const auto url = processor.getLiveMonitorUrl();
    if (url.isNotEmpty())
        text << "\n\nPhones on the same Wi-Fi can listen at:\n" << url
             << "\n" << processor.getLiveListenerCount() << " listening";
    return text;
}

void PhoneTestoAudioProcessorEditor::timerCallback()
{
    if (unavailable.isVisible())
        unavailable.setText (unavailableText(), juce::dontSendNotification);

    // If the page stops sending positions mid-move (it was hidden, or reloaded),
    // let the sound settle on the chosen model rather than stay between two.
    if (morphOpen && juce::Time::getMillisecondCounter() - lastMorphMessage > 1000)
    {
        processor.endMorph();
        morphOpen = false;
    }

    if (selfTestDir != juce::File() && ! selfTestDone && juce::Time::getMillisecondCounter() - selfTestStarted > 60000)
        finishSelfTest ("TIMED OUT: the page never reported a drawn frame");

    browser.emitEventIfBrowserIsVisible ("state", makeState());
}

} // namespace phonetesto
