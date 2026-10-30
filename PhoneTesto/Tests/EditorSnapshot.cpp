// Renders the plugin editor to PNGs -- in each skin (FLAT, DIGITAL), once
// in Emulate mode and once with Live Monitor on (QR code with the auto
// access code, listener count) -- while a background thread feeds the
// processor a tone so the meter is actually moving. Also prints how long a
// DIGITAL animation frame takes to draw. Lets the layout be checked without
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
#include "../Source/DigitalStyle.h"

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

    /** For each skin: Emulate, then Live, then the next skin. */
    void shootSkin (int skin)
    {
        if (skin > 1)
        {
            finish (allOk ? 0 : 1);
            return;
        }

        const juce::String name = skin == 1 ? "digital" : "flat";
        processor->setEditorSkin (skin);

        // The editor must reopen at the size saved with the project.
        const float savedScale = skin == 1 ? 1.25f : 1.0f;
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

            // what a frame costs to draw: the whole editor (controls come
            // from cached images), and for DIGITAL its animated background alone
            {
                juce::Image frame (juce::Image::RGB, editor->getWidth(), editor->getHeight(), false);
                const auto ms = timeMs ([&] { juce::Graphics g (frame); editor->paintEntireComponent (g, true); });
                std::printf ("%s: whole editor %.2f ms\n", name.toRawUTF8(), ms);

                if (skin == 1)
                {
                    // what the animation actually redraws each frame: the band the waves move in
                    const auto panelBounds = juce::Rectangle<float> (0.0f, 0.0f, (float) phonetesto::PhoneTestoAudioProcessorEditor::faceWidth,
                                                                     (float) phonetesto::PhoneTestoAudioProcessorEditor::faceHeight);
                    const float top = phonetesto::hw::digital::Background::animatedTop (panelBounds) * savedScale;
                    const auto band = juce::Rectangle<int> (0, (int) top, editor->getWidth(), editor->getHeight() - (int) top);
                    const auto bandMs = timeMs ([&] { juce::Graphics g (frame); g.reduceClipRegion (band); editor->paintEntireComponent (g, true); });
                    std::printf ("%s: animation frame (wave band) %.2f ms -> %.1f%% of one core at 15 fps\n",
                                 name.toRawUTF8(), bandMs, bandMs * 15.0 / 10.0);
                }

                if (std::getenv ("PT_PROFILE_CHILDREN") != nullptr)
                    if (auto* panel = editor->getChildComponent (0))
                        for (auto* child : panel->getChildren())
                        {
                            const auto childMs = timeMs ([&] { juce::Graphics g (frame); child->paintEntireComponent (g, true); });
                            std::printf ("  %-24s %6.3f ms  (%d x %d)\n", child->getTitle().isNotEmpty() ? child->getTitle().toRawUTF8()
                                                                                                      : typeid (*child).name(),
                                         childMs, child->getWidth(), child->getHeight());
                        }

                if (skin == 1 && std::getenv ("PT_PROFILE_BG") != nullptr)
                {
                    for (float s : { 1.0f, 1.25f, 1.5f })
                    {
                        const int w = juce::roundToInt (980 * s), h = juce::roundToInt (420 * s);
                        juce::Image target (juce::Image::RGB, w, h, false), half (juce::Image::RGB, w / 2, h / 2, true);
                        const auto up = timeMs ([&] { juce::Graphics g (target); g.setImageResamplingQuality (juce::Graphics::mediumResamplingQuality); g.drawImage (half, target.getBounds().toFloat()); });
                        const auto upLow = timeMs ([&] { juce::Graphics g (target); g.setImageResamplingQuality (juce::Graphics::lowResamplingQuality); g.drawImage (half, target.getBounds().toFloat()); });
                        const auto blit = timeMs ([&] { juce::Graphics g (target); g.drawImageAt (half, 0, 0); });
                        phonetesto::hw::digital::Background bg;
                        double t = 0.0;
                        const auto all = timeMs ([&] { juce::Graphics g (target); bg.draw (g, target.getBounds().toFloat(), t += 0.04); });
                        std::printf ("  %.2fx: background %.2f ms | (for comparison: image upscale medium %.2f, low %.2f, blit %.2f)\n", s, all, up, upLow, blit);
                        const auto rf = target.getBounds().toFloat();
                        const auto lin = timeMs ([&] { juce::Graphics g (target); juce::ColourGradient cg (juce::Colours::navy, 0, 0, juce::Colours::black, 0, rf.getBottom(), false); cg.addColour (0.5, juce::Colours::darkblue); g.setGradientFill (cg); g.fillRect (rf); });
                        const auto c0 = juce::Point<float> (rf.getWidth() * 0.2f, rf.getHeight() * 0.08f);
                        const float rad = rf.getWidth() * 0.6f;
                        const auto radial = timeMs ([&] { juce::Graphics g (target); g.setGradientFill (juce::ColourGradient (juce::Colour (0x403f8dff), c0, juce::Colour (0x003f8dff), c0.translated (rad, 0), true)); g.fillRect (juce::Rectangle<float> (rad * 2, rad * 2).withCentre (c0).getIntersection (rf)); });
                        const auto solid = timeMs ([&] { juce::Graphics g (target); g.fillAll (juce::Colours::navy); });
                        std::printf ("         linear gradient %.2f, radial bloom %.2f, solid fill %.2f\n", lin, radial, solid);
                    }
                }

                if (skin == 1)
                {
                    phonetesto::hw::digital::Background background;
                    double t = 0.0;
                    const auto bgMs = timeMs ([&] { juce::Graphics g (frame); background.draw (g, frame.getBounds().toFloat(), t += 0.04); });
                    std::printf ("%s: background alone %.2f ms per frame\n", name.toRawUTF8(), bgMs);
                }
            }

            // PT_ANIM_FRAMES=n: also save n frames of the DIGITAL animation, 1/15 s apart
            if (skin == 1)
                if (const int frames = juce::String (std::getenv ("PT_ANIM_FRAMES")).getIntValue(); frames > 0)
                {
                    captureFrames (0, frames, [this, skin] { goLive (skin); });
                    return;
                }

            goLive (skin);
        });
    }

    void captureFrames (int index, int total, std::function<void()> then)
    {
        if (index >= total)
        {
            then();
            return;
        }

        allOk &= snapshot (*editor, dir.getChildFile ("anim-" + juce::String (index).paddedLeft ('0', 3) + ".png"), 1.0f);
        juce::Timer::callAfterDelay (1000 / 15, [this, index, total, then] { captureFrames (index + 1, total, then); });
    }

    void goLive (int skin)
    {
        const juce::String name = skin == 1 ? "digital" : "flat";
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
