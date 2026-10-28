#pragma once

#include <array>
#include <juce_core/juce_core.h>

namespace phonetesto
{

/** Static description of how a given device's small driver colours sound.
    Values are hand-tuned approximations of measured small-driver behaviour
    (aggressive bass roll-off, a mid/high resonance bump from the enclosure,
    a high-frequency roll-off, and a drive amount standing in for the
    audible breakup/compression of a tiny driver at typical listening
    levels) -- not calibrated impulse responses. */
struct SpeakerProfile
{
    const char* name;
    const char* shortName; // legend printed around the MODEL selector switch

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
    phoneSE = 0,
    phone11,
    phone13,
    phone15,
    androidBudget,
    android,
    laptop,
    wiredBuds,

    count
};

inline const std::array<SpeakerProfile, (size_t) SpeakerId::count>& getSpeakerProfiles()
{
    static const std::array<SpeakerProfile, (size_t) SpeakerId::count> profiles { {
        // name                 short       HP      peakHz   Q     peakDb  LP        drive  makeup
        { "Phone SE",           "SE",       700.0f, 3500.0f, 1.8f,  4.5f,  9000.0f, 0.65f, 9.0f  },
        { "Phone 11",           "11",       500.0f, 3000.0f, 1.6f,  3.5f, 11000.0f, 0.45f, 7.0f  },
        { "Phone 13/14",        "13/14",    400.0f, 2800.0f, 1.5f,  2.5f, 12000.0f, 0.30f, 5.5f  },
        { "Phone 15/16 Pro",    "15 PRO",   300.0f, 2500.0f, 1.4f,  2.0f, 13000.0f, 0.20f, 4.0f  },
        { "Android Budget",     "AND LO",   850.0f, 3800.0f, 2.0f,  5.5f,  8000.0f, 0.80f, 10.5f },
        { "Android",            "ANDROID",  450.0f, 3300.0f, 1.6f,  3.2f, 11500.0f, 0.38f, 6.5f  },
        { "Laptop Speakers",    "LAPTOP",   200.0f, 2000.0f, 1.2f,  1.5f, 14000.0f, 0.15f, 3.0f  },
        { "Apple Buds Wired",   "BUDS",     150.0f, 4500.0f, 1.3f,  3.0f, 16500.0f, 0.10f, 2.0f  },
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
