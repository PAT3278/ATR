#pragma once

#include <array>
#include <juce_core/juce_core.h>

namespace phonetesto
{

/** Static description of how a given device's small speaker colours sound.
    Values are hand-tuned approximations of measured small-driver behaviour
    (aggressive bass roll-off, a mid/high resonance bump from the enclosure,
    a high-frequency roll-off, and a drive amount standing in for the
    audible breakup/compression of a tiny driver at typical listening
    levels) -- not calibrated impulse responses. */
struct SpeakerProfile
{
    const char* name;

    float highpassHz;   // fundamental bass cutoff, 2nd order stage x2 (24 dB/oct)
    float peakHz;       // resonance bump frequency
    float peakQ;
    float peakGainDb;
    float lowpassHz;     // top-end roll-off, 2nd order

    float driveAmount;   // 0 = clean, 1 = heavy saturation
    float makeupGainDb;  // compensates for level lost to filtering
};

enum class SpeakerId
{
    iphoneSE = 0,
    iphone11,
    iphone13,
    iphone15,
    androidBudget,
    laptop,

    count
};

inline const std::array<SpeakerProfile, (size_t) SpeakerId::count>& getSpeakerProfiles()
{
    static const std::array<SpeakerProfile, (size_t) SpeakerId::count> profiles { {
        // name                  HP      peakHz  Q     peakDb  LP       drive  makeup
        { "iPhone SE",            700.0f, 3500.0f, 1.8f,  4.5f,  9000.0f, 0.65f, 9.0f },
        { "iPhone 11",             500.0f, 3000.0f, 1.6f,  3.5f, 11000.0f, 0.45f, 7.0f },
        { "iPhone 13/14",          400.0f, 2800.0f, 1.5f,  2.5f, 12000.0f, 0.30f, 5.5f },
        { "iPhone 15/16 Pro",      300.0f, 2500.0f, 1.4f,  2.0f, 13000.0f, 0.20f, 4.0f },
        { "Android Budget",        850.0f, 3800.0f, 2.0f,  5.5f,  8000.0f, 0.80f, 10.5f },
        { "Laptop Speakers",       200.0f, 2000.0f, 1.2f,  1.5f, 14000.0f, 0.15f, 3.0f },
    } };
    return profiles;
}

inline juce::StringArray getSpeakerNames()
{
    juce::StringArray names;
    for (auto& p : getSpeakerProfiles())
        names.add (p.name);
    return names;
}

} // namespace phonetesto
