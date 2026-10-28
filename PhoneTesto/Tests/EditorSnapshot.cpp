// Renders the plugin editor to PNGs -- once in Emulate mode, once with Live
// Monitor on (QR code, password field, URL) -- so the layout can be checked
// without a DAW. Needs a display; on headless Linux run it under xvfb-run.
//
//   PhoneTestoEditorSnapshot <output-dir>
#include "../Source/PluginProcessor.h"
#include "../Source/PluginEditor.h"

#include <cstdio>

namespace
{
bool snapshot (phonetesto::PhoneTestoAudioProcessor& processor, const juce::File& file)
{
    std::unique_ptr<juce::AudioProcessorEditor> editor (processor.createEditor());
    const auto image = editor->createComponentSnapshot (editor->getLocalBounds(), true, 2.0f);

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
        std::fprintf (stderr, "usage: %s <output-dir>\n", argv[0]);
        return 2;
    }

    juce::ScopedJuceInitialiser_GUI gui;
    const juce::File dir (juce::File::getCurrentWorkingDirectory().getChildFile (argv[1]));
    dir.createDirectory();

    phonetesto::PhoneTestoAudioProcessor processor;
    processor.setPlayConfigDetails (2, 2, 48000.0, 512);
    processor.prepareToPlay (48000.0, 512);

    bool ok = snapshot (processor, dir.getChildFile ("editor-emulate.png"));

    processor.setLivePassword ("1234");
    ok &= processor.startLiveMonitor (0);
    ok &= snapshot (processor, dir.getChildFile ("editor-live.png"));
    processor.stopLiveMonitor();

    return ok ? 0 : 1;
}
