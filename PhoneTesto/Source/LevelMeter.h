#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace phonetesto
{

/** Stereo output meter: -60..0 dBFS, fast attack / smooth release on the
    block peak and a 1.5 s peak hold. Drawn per skin: an LED ladder with
    seven-segment peak readouts (DECK), two backlit needle VU meters
    (RECEIVER), or red LED bars (LAB). */
class LevelMeter : public juce::Component
{
public:
    /** Call at a steady rate (the editor's timer) with the latest block levels. */
    void update (float peakLeft, float peakRight, float secondsSinceLastUpdate);

    void paint (juce::Graphics&) override;

    static constexpr float floorDb = -60.0f;

private:
    void paintLadder (juce::Graphics&, bool lab);
    void paintNeedles (juce::Graphics&);

    struct Side
    {
        float level = floorDb; // displayed bar, dB
        float hold = floorDb;  // peak-hold marker, dB
        float holdAge = 0.0f;
        float vu = -20.0f;     // the needle, in VU (RECEIVER), with its own slower ballistics
    };

    Side sides[2];
};

} // namespace phonetesto
