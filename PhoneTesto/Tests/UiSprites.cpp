// Renders the real plugin editor into images for a touchable web copy of it
// (Tools/web-panel): per skin, the panel in Emulate and in Live mode, and
// sprite sheets of everything that changes -- each knob at 41 positions
// with its readout, each speaker-model key on and off, the display for each
// model, MONO / BYPASS on and off, and the meter at 31 levels. Writes
// panel.json with where each piece goes and the speaker profiles, so the
// web copy can also approximate the sound with Web Audio.
//
//   PhoneTestoUiSprites <output-dir> [scale]
//
// Needs a display; on headless Linux run it under xvfb-run.

#include "../Source/PluginProcessor.h"
#include "../Source/PluginEditor.h"
#include "../Source/LevelMeter.h"
#include "../Source/DisplayWindow.h"
#include "../Source/SpeakerProfiles.h"

#include <cstdio>

namespace
{
using namespace juce;
using phonetesto::PhoneTestoAudioProcessor;

constexpr int knobFrames = 41;  // 0..100 % in 2.5 % steps
constexpr int meterFrames = 31; // -60..0 dBFS in 2 dB steps

bool writeJpeg (const Image& image, const File& file)
{
    file.deleteFile();
    FileOutputStream out (file);
    JPEGImageFormat jpeg;
    jpeg.setQuality (0.86f);
    const bool ok = out.openedOk() && jpeg.writeImageToStream (image.convertedToFormat (Image::RGB), out);
    std::printf ("%s %s\n", ok ? "wrote" : "FAILED", file.getFullPathName().toRawUTF8());
    return ok;
}

var rectJson (Rectangle<int> r)
{
    Array<var> a { r.getX(), r.getY(), r.getWidth(), r.getHeight() };
    return a;
}

class SpritesApp final : public JUCEApplication
{
public:
    const String getApplicationName() override    { return "PhoneTestoUiSprites"; }
    const String getApplicationVersion() override { return "1.0"; }
    bool moreThanOneInstanceAllowed() override    { return true; }

    void initialise (const String&) override
    {
        const auto args = getCommandLineParameterArray();
        if (args.isEmpty())
        {
            std::fprintf (stderr, "usage: PhoneTestoUiSprites <output-dir> [scale]\n");
            finish (2);
            return;
        }

        dir = File::getCurrentWorkingDirectory().getChildFile (args[0]);
        scale = args.size() > 1 ? (float) args[1].getDoubleValue() : 1.5f;
        dir.createDirectory();

        processor = std::make_unique<PhoneTestoAudioProcessor>();
        processor->setPlayConfigDetails (2, 2, 48000.0, 512);
        processor->prepareToPlay (48000.0, 512);
        processor->setEditorScale (1.0f); // editor coordinates == panel coordinates

        Timer::callAfterDelay (100, [this] { shootSkin (0); });
    }

    void shutdown() override
    {
        editor.reset();
        if (processor != nullptr)
            processor->stopLiveMonitor();
        processor.reset();
    }

    void systemRequestedQuit() override { quit(); }

private:
    void finish (int code)
    {
        setApplicationReturnValue (code);
        quit();
    }

    void setParam (const char* id, float value)
    {
        if (auto* p = processor->apvts.getParameter (id))
            p->setValueNotifyingHost (p->convertTo0to1 (value));
    }

    Image crop (Rectangle<int> area) { return editor->createComponentSnapshot (area, true, scale); }

    /** Stacks frames vertically into one sheet. */
    Image sheet (Rectangle<int> area, int frames, const std::function<void (int)>& setFrame)
    {
        const int w = roundToInt ((float) area.getWidth() * scale), h = roundToInt ((float) area.getHeight() * scale);
        Image out (Image::RGB, w, h * frames, true);
        Graphics g (out);
        for (int i = 0; i < frames; ++i)
        {
            setFrame (i);
            g.drawImageAt (crop (area), 0, i * h);
        }
        return out;
    }

    template <typename T>
    T* find (const std::function<bool (T&)>& match = [] (T&) { return true; })
    {
        std::function<T* (Component&)> walk = [&] (Component& c) -> T*
        {
            for (auto* child : c.getChildren())
            {
                if (auto* t = dynamic_cast<T*> (child); t != nullptr && match (*t))
                    return t;
                if (auto* found = walk (*child))
                    return found;
            }
            return nullptr;
        };
        return walk (*editor);
    }

    void reset()
    {
        setParam (PhoneTestoAudioProcessor::mixParamId, 100.0f);
        setParam (PhoneTestoAudioProcessor::outputParamId, 100.0f);
        setParam (PhoneTestoAudioProcessor::deviceParamId, 3.0f);
        setParam (PhoneTestoAudioProcessor::monoParamId, 0.0f);
        setParam (PhoneTestoAudioProcessor::bypassParamId, 0.0f);
    }

    void shootSkin (int skin)
    {
        if (skin > 2)
        {
            writeJson();
            finish (allOk ? 0 : 1);
            return;
        }

        processor->setEditorSkin (skin);
        editor.reset (processor->createEditor());
        editor->setVisible (true);
        reset();

        // let the editor settle (its timer lays out the header)
        Timer::callAfterDelay (500, [this, skin] { shootEmulate (skin); });
    }

    void shootEmulate (int skin)
    {
        const auto name = String (phonetesto::hw::skinName (phonetesto::hw::skinFromIndex (skin)));
        auto out = dir.getChildFile (name);
        out.createDirectory();

        auto* mix = find<Slider> ([] (Slider& s) { return s.getTitle() == "Mix"; });
        auto* output = find<Slider> ([] (Slider& s) { return s.getTitle() == "Output"; });
        auto* mono = find<ToggleButton> ([] (ToggleButton& b) { return b.getButtonText() == "MONO"; });
        auto* bypass = find<ToggleButton> ([] (ToggleButton& b) { return b.getButtonText() == "BYPASS"; });
        auto* onAir = find<ToggleButton> ([] (ToggleButton& b) { return b.getButtonText() == "ON AIR"; });
        auto* skinKey = find<ToggleButton> ([] (ToggleButton& b) { return b.getTitle() == "Skin"; });
        auto* meter = find<phonetesto::LevelMeter>();
        auto* display = find<phonetesto::DisplayWindow>();
        Array<ToggleButton*> pads;
        for (int i = 0; i < 8; ++i)
            pads.add (find<ToggleButton> ([i] (ToggleButton& b)
                      { return b.getTitle() == String ("Model: ") + phonetesto::getSpeakerProfiles()[(size_t) i].name; }));

        if (mix == nullptr || output == nullptr || mono == nullptr || bypass == nullptr || onAir == nullptr
            || skinKey == nullptr || meter == nullptr || display == nullptr || pads.contains (nullptr))
        {
            std::fprintf (stderr, "couldn't find every control\n");
            finish (1);
            return;
        }

        // a knob's region: its legend above, its readout and unit below
        auto knobArea = [] (Slider& s) { return Rectangle<int> (s.getBounds().getCentreX() - 62, s.getBounds().getCentreY() - 74, 124, 160); };

        reset();
        allOk &= writeJpeg (crop (editor->getLocalBounds()), out.getChildFile ("emulate.jpg"));

        allOk &= writeJpeg (sheet (knobArea (*mix), knobFrames, [&] (int i) { setParam (PhoneTestoAudioProcessor::mixParamId, 2.5f * (float) i); }),
                            out.getChildFile ("mix.jpg"));
        reset();
        allOk &= writeJpeg (sheet (knobArea (*output), knobFrames, [&] (int i) { setParam (PhoneTestoAudioProcessor::outputParamId, 2.5f * (float) i); }),
                            out.getChildFile ("output.jpg"));
        reset();

        // keys: row 0 off, row 1 on; one column per model
        {
            const auto b0 = pads[0]->getBounds();
            const int w = roundToInt ((float) b0.getWidth() * scale), h = roundToInt ((float) b0.getHeight() * scale);
            Image keys (Image::RGB, w * 8, h * 2, true);
            Graphics g (keys);
            for (int i = 0; i < 8; ++i)
            {
                setParam (PhoneTestoAudioProcessor::deviceParamId, (float) ((i + 1) % 8));
                g.drawImageAt (crop (pads[i]->getBounds()), i * w, 0);
                setParam (PhoneTestoAudioProcessor::deviceParamId, (float) i);
                g.drawImageAt (crop (pads[i]->getBounds()), i * w, h);
            }
            allOk &= writeJpeg (keys, out.getChildFile ("keys.jpg"));
        }

        allOk &= writeJpeg (sheet (display->getBounds(), 8, [&] (int i) { setParam (PhoneTestoAudioProcessor::deviceParamId, (float) i); }),
                            out.getChildFile ("display.jpg"));
        reset();

        allOk &= writeJpeg (sheet (mono->getBounds(), 2, [&] (int i) { setParam (PhoneTestoAudioProcessor::monoParamId, (float) i); }),
                            out.getChildFile ("mono.jpg"));
        allOk &= writeJpeg (sheet (bypass->getBounds(), 2, [&] (int i) { setParam (PhoneTestoAudioProcessor::bypassParamId, (float) i); }),
                            out.getChildFile ("bypass.jpg"));
        reset();

        // the meter at rising levels (rising, so each frame's peak hold sits on its level)
        allOk &= writeJpeg (sheet (meter->getBounds(), meterFrames, [&] (int i)
        {
            const float gain = i == 0 ? 0.0f : Decibels::decibelsToGain (-60.0f + 2.0f * (float) i);
            meter->update (gain, gain, 5.0f);
        }), out.getChildFile ("meter.jpg"));

        auto& g = geometry;
        if (skin == 0)
        {
            g.getDynamicObject()->setProperty ("face", rectJson (editor->getLocalBounds()));
            g.getDynamicObject()->setProperty ("scale", scale);
            g.getDynamicObject()->setProperty ("mix", rectJson (knobArea (*mix)));
            g.getDynamicObject()->setProperty ("output", rectJson (knobArea (*output)));
            g.getDynamicObject()->setProperty ("mono", rectJson (mono->getBounds()));
            g.getDynamicObject()->setProperty ("bypass", rectJson (bypass->getBounds()));
            g.getDynamicObject()->setProperty ("onAir", rectJson (onAir->getBounds()));
            g.getDynamicObject()->setProperty ("meter", rectJson (meter->getBounds()));
            g.getDynamicObject()->setProperty ("display", rectJson (display->getBounds()));
            Array<var> keyRects;
            for (auto* p : pads)
                keyRects.add (rectJson (p->getBounds()));
            g.getDynamicObject()->setProperty ("keys", keyRects);
        }
        skinKeys.getDynamicObject()->setProperty (name + "-emulate", rectJson (skinKey->getBounds()));

        // Live: the plugin's own server, so the display shows a real QR code
        processor->startLiveMonitor (0);
        Timer::callAfterDelay (500, [this, skin, out, skinKey]
        {
            allOk &= writeJpeg (crop (editor->getLocalBounds()), out.getChildFile ("live.jpg"));
            skinKeys.getDynamicObject()->setProperty (String (phonetesto::hw::skinName (phonetesto::hw::skinFromIndex (skin))) + "-live",
                                                      rectJson (skinKey->getBounds()));
            processor->stopLiveMonitor();
            editor.reset();
            Timer::callAfterDelay (200, [this, skin] { shootSkin (skin + 1); });
        });
    }

    void writeJson()
    {
        geometry.getDynamicObject()->setProperty ("skinKey", skinKeys);
        geometry.getDynamicObject()->setProperty ("knobFrames", knobFrames);
        geometry.getDynamicObject()->setProperty ("meterFrames", meterFrames);

        Array<var> profiles;
        for (auto& p : phonetesto::getSpeakerProfiles())
        {
            auto* o = new DynamicObject();
            o->setProperty ("name", p.name);
            o->setProperty ("highpassHz", p.highpassHz);
            o->setProperty ("peakHz", p.peakHz);
            o->setProperty ("peakQ", p.peakQ);
            o->setProperty ("peakGainDb", p.peakGainDb);
            o->setProperty ("lowpassHz", p.lowpassHz);
            o->setProperty ("driveDb", p.driveAmount * 18.0f);
            o->setProperty ("makeupDb", p.makeupGainDb);
            profiles.add (var (o));
        }
        geometry.getDynamicObject()->setProperty ("profiles", profiles);

        const auto file = dir.getChildFile ("panel.json");
        allOk &= file.replaceWithText (JSON::toString (geometry));
        std::printf ("wrote %s\n", file.getFullPathName().toRawUTF8());
    }

    File dir;
    float scale = 1.5f;
    bool allOk = true;
    std::unique_ptr<PhoneTestoAudioProcessor> processor;
    std::unique_ptr<AudioProcessorEditor> editor;
    var geometry { new DynamicObject() }, skinKeys { new DynamicObject() };
};

} // namespace

int main (int argc, char** argv)
{
    juce::JUCEApplicationBase::createInstance = []() -> juce::JUCEApplicationBase*
    {
        auto* app = new SpritesApp();
        app->setApplicationReturnValue (1);
        return app;
    };

   #if JUCE_WINDOWS
    juce::ignoreUnused (argc, argv);
    return juce::JUCEApplicationBase::main();
   #else
    return juce::JUCEApplicationBase::main (argc, (const char**) argv);
   #endif
}
