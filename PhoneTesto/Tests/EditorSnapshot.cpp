// Renders the plugin editor to PNGs -- in each skin (DECK, RECEIVER, LAB), once
// in Emulate mode and once with Live Monitor on (QR code with the auto
// access code, listener count) -- while a background thread feeds the
// processor a tone so the meter is actually moving. Also prints how long the
// whole editor takes to draw. Lets the layout be checked without
// a DAW. Needs a display; on headless Linux run it under xvfb-run. Exits
// non-zero unless every image was written.
//
//   PhoneTestoEditorSnapshot <output-dir> [scale]
//
// Runs as a JUCEApplication rather than a bare main() with a message loop:
// on macOS only JUCE's app entry point creates the NSApplication, without
// which the dispatch loop returns at once and nothing is rendered.
#include "../Source/PluginProcessor.h"
#include "../Source/PluginEditor.h"

#include <atomic>
#include <cstdio>
#include <thread>

namespace
{
bool snapshot (juce::Component& editor, const juce::File& file, float scale)
{
    const auto image = editor.createComponentSnapshot (editor.getLocalBounds(), true, scale);
    file.deleteFile();
    bool ok = false;
    {
        juce::FileOutputStream out (file);
        ok = out.openedOk() && juce::PNGImageFormat().writeImageToStream (image, out);
    }
    ok = ok && file.getSize() > 0;
    std::printf ("%s %s\n", ok ? "wrote" : "FAILED", file.getFullPathName().toRawUTF8());
    std::fflush (stdout);
    return ok;
}

/** Average milliseconds per call, after a warm-up call. */
template <typename Fn>
double timeMs (Fn&& fn, int runs = 30)
{
    fn();
    const auto t0 = juce::Time::getMillisecondCounterHiRes();
    for (int i = 0; i < runs; ++i)
        fn();
    return (juce::Time::getMillisecondCounterHiRes() - t0) / runs;
}

class SnapshotApp final : public juce::JUCEApplication
{
public:
    const juce::String getApplicationName() override       { return "PhoneTestoEditorSnapshot"; }
    const juce::String getApplicationVersion() override    { return "1.0"; }
    bool moreThanOneInstanceAllowed() override             { return true; }

    void initialise (const juce::String&) override
    {
        const auto args = getCommandLineParameterArray();
        if (args.isEmpty())
        {
            std::fprintf (stderr, "usage: PhoneTestoEditorSnapshot <output-dir> [scale]\n");
            finish (2);
            return;
        }

        dir = juce::File::getCurrentWorkingDirectory().getChildFile (args[0]);
        scale = args.size() > 1 ? (float) args[1].getDoubleValue() : 1.5f;
        dir.createDirectory();

        processor = std::make_unique<phonetesto::PhoneTestoAudioProcessor>();
        processor->setPlayConfigDetails (2, 2, 48000.0, 512);
        processor->prepareToPlay (48000.0, 512);

        if (auto* device = processor->apvts.getParameter (phonetesto::PhoneTestoAudioProcessor::deviceParamId))
            device->setValueNotifyingHost (device->convertTo0to1 (3.0f));

        feeder = std::thread ([this]
        {
            juce::AudioBuffer<float> block (2, 512);
            juce::MidiBuffer midi;
            double phase = 0.0;

            while (feeding)
            {
                for (int i = 0; i < 512; ++i)
                {
                    const auto v = (float) (0.12 * std::sin (phase));
                    block.setSample (0, i, v);
                    block.setSample (1, i, v);
                    phase += 2.0 * juce::MathConstants<double>::pi * 1000.0 / 48000.0;
                }
                processor->processBlock (block, midi);
                std::this_thread::sleep_for (std::chrono::milliseconds (10));
            }
        });

        shootSkin (0);
    }

    static juce::String skinName (int skin) { return phonetesto::hw::skinName (phonetesto::hw::skinFromIndex (skin)); }

    /** For each skin: Emulate, then Live, then the next skin. */
    void shootSkin (int skin)
    {
        if (skin > 2)
        {
            finish (allOk ? 0 : 1);
            return;
        }

        const juce::String name = skinName (skin);
        processor->setEditorSkin (skin);

        // The editor must reopen at the size saved with the project.
        const float savedScale = skin == 1 ? 1.25f : skin == 2 ? 1.1f : 1.0f;
        processor->setEditorScale (savedScale);
        editor.reset (processor->createEditor());

        const int expectedWidth = juce::roundToInt (phonetesto::PhoneTestoAudioProcessorEditor::faceWidth * savedScale);
        const bool sizeOk = editor->getWidth() == expectedWidth && std::abs (processor->getEditorScale() - savedScale) < 0.001f;
        std::printf ("%s %s: editor opens at its saved size (%d px wide, want %d)\n",
                     sizeOk ? "ok" : "FAILED", name.toRawUTF8(), editor->getWidth(), expectedWidth);
        allOk &= sizeOk;

        juce::Timer::callAfterDelay (900, [this, skin, name, savedScale]
        {
            allOk &= snapshot (*editor, dir.getChildFile ("editor-" + name + "-emulate.png"), scale);

            // what a full redraw costs (the faceplate and controls come from cached images)
            {
                juce::Image frame (juce::Image::RGB, editor->getWidth(), editor->getHeight(), false);
                const auto ms = timeMs ([&] { juce::Graphics g (frame); editor->paintEntireComponent (g, true); });
                std::printf ("%s: whole editor %.2f ms\n", name.toRawUTF8(), ms);

                if (std::getenv ("PT_PROFILE_CHILDREN") != nullptr)
                    if (auto* panel = editor->getChildComponent (0))
                        for (auto* child : panel->getChildren())
                        {
                            const auto childMs = timeMs ([&] { juce::Graphics g (frame); child->paintEntireComponent (g, true); });
                            std::printf ("  %-24s %6.3f ms  (%d x %d)\n", child->getTitle().isNotEmpty() ? child->getTitle().toRawUTF8()
                                                                                                      : typeid (*child).name(),
                                         childMs, child->getWidth(), child->getHeight());
                        }

            }

            goLive (skin);
        });
    }

    void goLive (int skin)
    {
        const juce::String name = skinName (skin);
        allOk &= processor->startLiveMonitor (0);

        juce::Timer::callAfterDelay (400, [this, skin, name]
        {
            allOk &= snapshot (*editor, dir.getChildFile ("editor-" + name + "-live.png"), scale);
            processor->stopLiveMonitor();
            editor.reset();
            shootSkin (skin + 1);
        });
    }

    void shutdown() override
    {
        feeding = false;
        if (feeder.joinable())
            feeder.join();

        editor.reset();
        if (processor != nullptr)
            processor->stopLiveMonitor();
        processor.reset();
    }

private:
    void finish (int exitCode)
    {
        setApplicationReturnValue (exitCode);
        quit();
    }

    juce::File dir;
    float scale = 1.5f;
    bool allOk = true;
    std::unique_ptr<phonetesto::PhoneTestoAudioProcessor> processor;
    std::unique_ptr<juce::AudioProcessorEditor> editor;
    std::atomic<bool> feeding { true };
    std::thread feeder;
};
} // namespace

int main (int argc, char** argv)
{
    // Starts with a failing exit code, so a run that never gets as far as
    // writing both images can't pass.
    juce::JUCEApplicationBase::createInstance = []() -> juce::JUCEApplicationBase*
    {
        auto* app = new SnapshotApp();
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
