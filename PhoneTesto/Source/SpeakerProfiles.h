#pragma once

#include <array>
#include <juce_core/juce_core.h>
#include <juce_graphics/juce_graphics.h>

namespace phonetesto
{

/** Which top-of-screen chrome the plugin's phone-body editor draws for a
    given profile, modelled on the real hardware:
    - homeButton: iPhone SE -- thick uniform bezels, physical Touch ID button,
      no notch.
    - notchWide/notchNarrow: iPhone 11 / 13-14 -- edge-to-edge screen with a
      notch touching the top bezel (11's is visibly wider than 13/14's).
    - dynamicIsland: iPhone 15/16 Pro -- a pill that floats just below the
      top edge rather than touching it.
    - plain: non-iPhone profiles -- a plain centred camera dot. */
enum class PhoneChromeStyle
{
    homeButton = 0,
    notchWide,
    notchNarrow,
    dynamicIsland,
    plain
};

/** Static description of how a given device's small driver colours sound.
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

    PhoneChromeStyle chrome;
    juce::uint32 accentColor; // 0xAARRGGBB, tints the phone-body editor
};

enum class SpeakerId
{
    iphoneSE = 0,
    iphone11,
    iphone13,
    iphone15,
    androidBudget,
    laptop,
    earPodsWired,

    count
};

inline const std::array<SpeakerProfile, (size_t) SpeakerId::count>& getSpeakerProfiles()
{
    static const std::array<SpeakerProfile, (size_t) SpeakerId::count> profiles { {
        // name                  HP      peakHz   Q     peakDb  LP        drive  makeup  chrome                          accent
        { "iPhone SE",            700.0f, 3500.0f, 1.8f,  4.5f,  9000.0f, 0.65f, 9.0f,  PhoneChromeStyle::homeButton,     0xffd0d3d9 },
        { "iPhone 11",             500.0f, 3000.0f, 1.6f,  3.5f, 11000.0f, 0.45f, 7.0f,  PhoneChromeStyle::notchWide,      0xff2d3a4a },
        { "iPhone 13/14",          400.0f, 2800.0f, 1.5f,  2.5f, 12000.0f, 0.30f, 5.5f,  PhoneChromeStyle::notchNarrow,    0xff394a3d },
        { "iPhone 15/16 Pro",      300.0f, 2500.0f, 1.4f,  2.0f, 13000.0f, 0.20f, 4.0f,  PhoneChromeStyle::dynamicIsland,  0xff4a4034 },
        { "Android Budget",        850.0f, 3800.0f, 2.0f,  5.5f,  8000.0f, 0.80f, 10.5f, PhoneChromeStyle::plain,          0xff23262b },
        { "Laptop Speakers",       200.0f, 2000.0f, 1.2f,  1.5f, 14000.0f, 0.15f, 3.0f,  PhoneChromeStyle::plain,          0xff8a8f98 },
        { "Apple EarPods (Wired)", 150.0f, 4500.0f, 1.3f,  3.0f, 16500.0f, 0.10f, 2.0f,  PhoneChromeStyle::plain,          0xffe8e9ec },
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
