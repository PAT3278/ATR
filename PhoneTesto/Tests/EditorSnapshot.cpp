// Renders the plugin editor to PNGs -- once in Emulate mode, once with Live
// Monitor on (QR code with the auto access code, listener count) -- while a background
// thread feeds the processor a tone so the VU meter is actually moving.
// Lets the layout be checked without a DAW. Needs a display; on headless
// Linux run it under xvfb-run. Exits non-zero unless both images were written.
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

        editor.reset (processor->createEditor());

        juce::Timer::callAfterDelay (900, [this]
        {
            bool ok = snapshot (*editor, dir.getChildFile ("editor-emulate.png"), scale);
            ok &= processor->startLiveMonitor (0);

            juce::Timer::callAfterDelay (400, [this, ok]
            {
                const bool live = snapshot (*editor, dir.getChildFile ("editor-live.png"), scale);
                finish (ok && live ? 0 : 1);
            });
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
