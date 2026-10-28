#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace phonetesto
{

/** Backlit analogue VU meter. The scale is linear in voltage like a real VU
    movement (0 VU sits at ~71% of the travel), 0 VU is calibrated to
    -18 dBFS RMS, and the needle follows standard ~300 ms VU ballistics. */
class VuMeter : public juce::Component
{
public:
    /** Call at a steady rate (the editor's timer) with the latest block RMS. */
    void update (float linearRms, float secondsSinceLastUpdate);

    void paint (juce::Graphics&) override;

    static constexpr float referenceDbfs = -18.0f;

private:
    static float positionForVu (float vu);

    float needle = 0.0f;   // 0..~1.05 of the scale travel
    float peakLamp = 0.0f; // 0..1 brightness of the PEAK lamp
};

} // namespace phonetesto
