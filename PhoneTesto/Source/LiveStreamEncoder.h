#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <vector>

struct OpusEncoder;

namespace phonetesto
{

enum class StreamFormat
{
    pcm16 = 0,
    pcm24 = 1,
    opus  = 2
};

/** Turns one listener's share of the plugin audio (interleaved stereo float
    at the host's sample rate) into 48 kHz packets in that listener's chosen
    format. Every format is sent at 48 kHz: Opus only accepts a few fixed
    rates, and every browser's Web Audio handles 48 kHz, so a host sample-rate
    change never has to disturb the phone. */
class LiveStreamEncoder
{
public:
    static constexpr int outputSampleRate = 48000;
    static constexpr int numChannels = 2;
    static constexpr int opusFrameSize = 960;   // 20 ms at 48 kHz
    static constexpr int minPcmPacketFrames = 480; // 10 ms

    LiveStreamEncoder (StreamFormat, double inputSampleRate, int opusBitrateKbps);
    ~LiveStreamEncoder();

    bool isValid() const noexcept { return valid; }
    StreamFormat getFormat() const noexcept { return format; }
    double getInputSampleRate() const noexcept { return inputRate; }

    /** Feeds interleaved stereo frames; each completed packet's payload is
        appended to `packetsOut`. */
    void process (const float* interleaved, int numFrames, std::vector<juce::MemoryBlock>& packetsOut);

    static int clampBitrateKbps (int kbps) noexcept { return juce::jlimit (32, 320, kbps); }

private:
    void resampleAvailable();
    void emitPackets (std::vector<juce::MemoryBlock>& packetsOut);

    StreamFormat format;
    double inputRate;
    double speedRatio;
    bool valid = true;

    juce::LagrangeInterpolator interpolators[numChannels];
    std::vector<float> inputStaging[numChannels];
    std::vector<float> resampledScratch[numChannels];
    std::vector<float> output; // interleaved 48 kHz frames not yet packetised

    OpusEncoder* opusEncoder = nullptr;
    std::vector<unsigned char> opusScratch;

    JUCE_DECLARE_NON_COPYABLE (LiveStreamEncoder)
};

} // namespace phonetesto
