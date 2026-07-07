// Offline sanity check for the PhoneTesto DSP chain: for every speaker
// profile, feed white noise and an impulse through processBlock and verify
// the output is finite and reasonably leveled. This runs headless (no
// audio device, no GUI) so it works in CI / containers.
#include "../Source/PluginProcessor.h"

#include <cmath>
#include <cstdio>
#include <random>

using namespace phonetesto;

namespace
{
bool isFinite (const juce::AudioBuffer<float>& buffer)
{
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        auto* data = buffer.getReadPointer (ch);
        for (int i = 0; i < buffer.getNumSamples(); ++i)
            if (! std::isfinite (data[i]))
                return false;
    }
    return true;
}

float peak (const juce::AudioBuffer<float>& buffer)
{
    float p = 0.0f;
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
        p = std::max (p, buffer.getMagnitude (ch, 0, buffer.getNumSamples()));
    return p;
}
} // namespace

int main()
{
    constexpr double sampleRate = 48000.0;
    constexpr int blockSize = 512;
    constexpr int numBlocks = 20;

    int failures = 0;

    for (int deviceIndex = 0; deviceIndex < (int) getSpeakerProfiles().size(); ++deviceIndex)
    {
        PhoneTestoAudioProcessor processor;
        processor.setPlayConfigDetails (2, 2, sampleRate, blockSize);
        processor.prepareToPlay (sampleRate, blockSize);

        if (auto* deviceParam = processor.apvts.getParameter (PhoneTestoAudioProcessor::deviceParamId))
            deviceParam->setValueNotifyingHost (deviceParam->convertTo0to1 ((float) deviceIndex));

        std::mt19937 rng (42);
        std::uniform_real_distribution<float> dist (-0.5f, 0.5f);

        juce::MidiBuffer midi;
        bool blockOk = true;
        float maxPeak = 0.0f;

        for (int b = 0; b < numBlocks; ++b)
        {
            juce::AudioBuffer<float> buffer (2, blockSize);
            for (int ch = 0; ch < 2; ++ch)
            {
                auto* data = buffer.getWritePointer (ch);
                for (int i = 0; i < blockSize; ++i)
                    data[i] = (b == 0 && i == 0) ? 1.0f : dist (rng); // impulse in first sample, then noise
            }

            processor.processBlock (buffer, midi);

            if (! isFinite (buffer))
                blockOk = false;

            maxPeak = std::max (maxPeak, peak (buffer));
        }

        const auto& profile = getSpeakerProfiles()[(size_t) deviceIndex];
        std::printf ("[%-18s] finite=%s  peak=%.3f\n", profile.name, blockOk ? "yes" : "NO", (double) maxPeak);

        if (! blockOk || maxPeak > 4.0f || maxPeak <= 0.0f)
            ++failures;
    }

    if (failures > 0)
    {
        std::printf ("FAILED: %d profile(s) produced invalid output\n", failures);
        return 1;
    }

    std::printf ("All speaker profiles produced finite, sane-level output.\n");
    return 0;
}
