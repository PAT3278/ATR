#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace phonetesto
{

/** Stereo LED-ladder output meter: -60..0 dBFS, fast attack / smooth
    release on the block peak, a 1.5 s peak-hold marker, and a numeric
    readout of the held peak per side. */
class LevelMeter : public juce::Component
{
public:
    /** Call at a steady rate (the editor's timer) with the latest block levels. */
    void update (float peakLeft, float peakRight, float secondsSinceLastUpdate);

    void paint (juce::Graphics&) override;

    static constexpr float floorDb = -60.0f;

private:
    struct Side
    {
        float level = floorDb; // displayed bar, dB
        float hold = floorDb;  // peak-hold marker, dB
        float holdAge = 0.0f;
    };

    Side sides[2];
};

} // namespace phonetesto
