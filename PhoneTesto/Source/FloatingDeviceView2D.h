#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "SpeakerProfiles.h"

namespace phonetesto
{

/** Lightweight always-available device preview: a flat illustrated
    silhouette that bobs up and down with a shrinking/growing drop shadow
    to read as "floating", plus a slow rotational wobble. No OpenGL. */
class FloatingDeviceView2D : public juce::Component,
                              private juce::Timer
{
public:
    FloatingDeviceView2D();
    ~FloatingDeviceView2D() override;

    void setDevice (DeviceShape shape, juce::Colour accent);

    void paint (juce::Graphics&) override;

private:
    void timerCallback() override;

    void drawPhone (juce::Graphics&, juce::Rectangle<float> bounds) const;
    void drawLaptop (juce::Graphics&, juce::Rectangle<float> bounds) const;
    void drawEarphone (juce::Graphics&, juce::Rectangle<float> bounds) const;

    DeviceShape currentShape = DeviceShape::phone;
    juce::Colour currentAccent { 0xffd0d3d9 };

    double phase = 0.0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (FloatingDeviceView2D)
};

} // namespace phonetesto
