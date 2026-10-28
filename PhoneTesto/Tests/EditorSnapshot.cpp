// Renders the plugin editor to PNGs -- once in Emulate mode, once with Live
// Monitor on (QR code, password, listener count) -- while a background
// thread feeds the processor a tone so the VU meter is actually moving.
// Lets the layout be checked without a DAW. Needs a display; on headless
// Linux run it under xvfb-run.
//
//   PhoneTestoEditorSnapshot <output-dir> [scale]
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
    juce::FileOutputStream out (file);
    const bool ok = out.openedOk() && juce::PNGImageFormat().writeImageToStream (image, out);
    std::printf ("%s %s\n", ok ? "wrote" : "FAILED", file.getFullPathName().toRawUTF8());
    return ok;
}
} // namespace

int main (int argc, char** argv)
{
    if (argc < 2)
    {
        std::fprintf (stderr, "usage: %s <output-dir> [scale]\n", argv[0]);
        return 2;
    }

    juce::ScopedJuceInitialiser_GUI gui;
    const juce::File dir (juce::File::getCurrentWorkingDirectory().getChildFile (argv[1]));
    const float scale = argc > 2 ? (float) juce::String (argv[2]).getDoubleValue() : 1.5f;
    dir.createDirectory();

    phonetesto::PhoneTestoAudioProcessor processor;
    processor.setPlayConfigDetails (2, 2, 48000.0, 512);
    processor.prepareToPlay (48000.0, 512);

    if (auto* device = processor.apvts.getParameter (phonetesto::PhoneTestoAudioProcessor::deviceParamId))
        device->setValueNotifyingHost (device->convertTo0to1 (3.0f));

    std::atomic<bool> feeding { true };
    std::thread feeder ([&]
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
            processor.processBlock (block, midi);
            std::this_thread::sleep_for (std::chrono::milliseconds (10));
        }
    });

    std::unique_ptr<juce::AudioProcessorEditor> editor (processor.createEditor());
    bool ok = true;

    juce::Timer::callAfterDelay (900, [&]
    {
        ok &= snapshot (*editor, dir.getChildFile ("editor-emulate.png"), scale);

        processor.setLivePassword ("1234");
        ok &= processor.startLiveMonitor (0);

        juce::Timer::callAfterDelay (400, [&]
        {
            ok &= snapshot (*editor, dir.getChildFile ("editor-live.png"), scale);
            juce::MessageManager::getInstance()->stopDispatchLoop();
        });
    });

    juce::MessageManager::getInstance()->runDispatchLoop();

    feeding = false;
    feeder.join();
    editor.reset();
    processor.stopLiveMonitor();
    return ok ? 0 : 1;
}
