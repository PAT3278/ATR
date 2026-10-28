#include "LiveStreamEncoder.h"

#include <opus.h>
#include <cmath>

namespace phonetesto
{

LiveStreamEncoder::LiveStreamEncoder (StreamFormat f, double inputSampleRate, int opusBitrateKbps)
    : format (f),
      inputRate (inputSampleRate > 0.0 ? inputSampleRate : (double) outputSampleRate),
      speedRatio (inputRate / (double) outputSampleRate)
{
    if (format == StreamFormat::opus)
    {
        int error = 0;
        opusEncoder = opus_encoder_create (outputSampleRate, numChannels, OPUS_APPLICATION_AUDIO, &error);

        if (error != OPUS_OK || opusEncoder == nullptr)
        {
            valid = false;
            opusEncoder = nullptr;
            return;
        }

        opus_encoder_ctl (opusEncoder, OPUS_SET_BITRATE (clampBitrateKbps (opusBitrateKbps) * 1000));
        opus_encoder_ctl (opusEncoder, OPUS_SET_COMPLEXITY (8)); // headroom for many simultaneous phones
        opusScratch.resize (4000);
    }
}

LiveStreamEncoder::~LiveStreamEncoder()
{
    if (opusEncoder != nullptr)
        opus_encoder_destroy (opusEncoder);
}

void LiveStreamEncoder::process (const float* interleaved, int numFrames, std::vector<juce::MemoryBlock>& packetsOut)
{
    if (! valid || numFrames <= 0)
        return;

    for (int ch = 0; ch < numChannels; ++ch)
    {
        auto& staging = inputStaging[ch];
        const auto start = staging.size();
        staging.resize (start + (size_t) numFrames);

        for (int i = 0; i < numFrames; ++i)
            staging[start + (size_t) i] = interleaved[i * numChannels + ch];
    }

    resampleAvailable();
    emitPackets (packetsOut);
}

void LiveStreamEncoder::resampleAvailable()
{
    const auto available = inputStaging[0].size();

    if (std::abs (speedRatio - 1.0) < 1.0e-9)
    {
        // Already 48 kHz: pass straight through rather than interpolating.
        const auto start = output.size();
        output.resize (start + available * numChannels);

        for (size_t i = 0; i < available; ++i)
            for (int ch = 0; ch < numChannels; ++ch)
                output[start + i * numChannels + (size_t) ch] = inputStaging[ch][i];

        for (auto& s : inputStaging)
            s.clear();
        return;
    }

    constexpr int chunkFrames = 480;
    const auto inputNeeded = (size_t) std::ceil (chunkFrames * speedRatio) + 2;
    size_t consumed = 0;

    for (auto& s : resampledScratch)
        s.resize (chunkFrames);

    while (available - consumed >= inputNeeded)
    {
        int used = 0;

        for (int ch = 0; ch < numChannels; ++ch)
            used = interpolators[ch].process (speedRatio, inputStaging[ch].data() + consumed,
                                              resampledScratch[ch].data(), chunkFrames);

        consumed += (size_t) used;

        const auto start = output.size();
        output.resize (start + (size_t) chunkFrames * numChannels);

        for (int i = 0; i < chunkFrames; ++i)
            for (int ch = 0; ch < numChannels; ++ch)
                output[start + (size_t) (i * numChannels + ch)] = resampledScratch[ch][(size_t) i];
    }

    if (consumed > 0)
        for (auto& s : inputStaging)
            s.erase (s.begin(), s.begin() + (std::ptrdiff_t) consumed);
}

void LiveStreamEncoder::emitPackets (std::vector<juce::MemoryBlock>& packetsOut)
{
    const auto framesReady = (int) (output.size() / numChannels);
    int framesUsed = 0;

    if (format == StreamFormat::opus)
    {
        while (framesReady - framesUsed >= opusFrameSize)
        {
            const auto bytes = opus_encode_float (opusEncoder, output.data() + framesUsed * numChannels,
                                                  opusFrameSize, opusScratch.data(), (opus_int32) opusScratch.size());
            framesUsed += opusFrameSize;

            if (bytes > 0)
                packetsOut.emplace_back (opusScratch.data(), (size_t) bytes);
        }
    }
    else if (framesReady >= minPcmPacketFrames)
    {
        const int bytesPerSample = (format == StreamFormat::pcm24) ? 3 : 2;
        const auto numSamples = (size_t) framesReady * numChannels;
        juce::MemoryBlock packet (numSamples * (size_t) bytesPerSample);
        auto* dest = static_cast<juce::uint8*> (packet.getData());

        for (size_t i = 0; i < numSamples; ++i)
        {
            const float s = juce::jlimit (-1.0f, 1.0f, output[i]);

            if (bytesPerSample == 3)
            {
                const auto v = (juce::int32) std::lround (s * 8388607.0f);
                dest[0] = (juce::uint8) (v & 0xff);
                dest[1] = (juce::uint8) ((v >> 8) & 0xff);
                dest[2] = (juce::uint8) ((v >> 16) & 0xff);
                dest += 3;
            }
            else
            {
                const auto v = (juce::int16) std::lround (s * 32767.0f);
                dest[0] = (juce::uint8) (v & 0xff);
                dest[1] = (juce::uint8) ((v >> 8) & 0xff);
                dest += 2;
            }
        }

        packetsOut.push_back (std::move (packet));
        framesUsed = framesReady;
    }

    if (framesUsed > 0)
        output.erase (output.begin(), output.begin() + (std::ptrdiff_t) framesUsed * numChannels);
}

} // namespace phonetesto
