#pragma once

#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <atomic>
#include <vector>

namespace phonetesto
{

/** Streams the plugin's audio to a real phone over the local network so it
    can be monitored on the device's actual speaker, instead of emulating
    one with DSP.

    Mechanism: a tiny embedded HTTP server. When a browser (e.g. Safari on
    an iPhone, on the same Wi-Fi network) requests the server's URL, it
    replies with a WAV header declaring an open-ended ("unknown-length")
    data size and then keeps writing raw PCM as it arrives -- the same
    trick classic Icecast/Shoutcast live-radio streams use, so no app or
    codec license is needed on either end. Native browser support for an
    indefinite-length WAV stream varies, so this is best-effort: it has
    been verified in this repo by connecting a plain socket client and
    checking the bytes (see Tests/LiveServerTest.cpp), not against a real
    phone's browser -- if Safari doesn't play it smoothly, try VLC (free,
    App Store) pointed at the same URL instead.

    Only one phone is expected to connect at a time (that's the use case:
    "listen on my own phone"); a new connection replaces the previous one. */
class LiveMonitorServer : private juce::Thread
{
public:
    LiveMonitorServer();
    ~LiveMonitorServer() override;

    /** Starts listening on `port`. `sampleRate`/`numChannels` describe the
        audio that will be passed to pushAudio() and are baked into the WAV
        header sent to each connecting client. Returns false if the port
        could not be bound (e.g. already in use). */
    bool start (int port, double sampleRate, int numChannels);

    /** Stops the server and disconnects any client. Safe to call even if
        not running. */
    void stop();

    bool isRunning() const noexcept { return listening.load(); }
    bool hasClient() const noexcept { return clientConnected.load(); }
    int getPort() const noexcept { return boundPort.load(); }

    /** The connecting client's address, or an empty string if none is
        connected. */
    juce::String getClientAddress() const;

    /** Non-loopback IPv4 addresses this machine is reachable on, for
        display as "type this into Safari" candidates. */
    static juce::StringArray getLocalAddresses();

    /** Called from the audio thread once per block. Realtime-safe: never
        allocates or blocks: converts to 16-bit PCM into a preallocated
        scratch buffer and pushes it into a lock-free ring buffer that the
        network thread drains. If the network thread can't keep up, or the
        block is larger than the (generous) preallocated scratch size, the
        block is dropped rather than risking a glitch on the audio thread. */
    void pushAudio (const juce::AudioBuffer<float>& buffer);

private:
    void run() override;
    static void writeLiveWavHeader (juce::OutputStream&, double sampleRate, int numChannels);

    std::unique_ptr<juce::StreamingSocket> listener;
    std::unique_ptr<juce::StreamingSocket> client;
    mutable juce::CriticalSection clientLock;

    std::atomic<bool> listening { false };
    std::atomic<bool> clientConnected { false };
    std::atomic<int> boundPort { 0 };

    double streamSampleRate = 44100.0;
    int streamNumChannels = 2;

    static constexpr int fifoCapacitySamples = 1 << 20; // interleaved int16 samples, several seconds of slack
    static constexpr int maxScratchSamples = 16384 * 8;  // generous headroom for large blocks/channel counts

    juce::AbstractFifo fifo { fifoCapacitySamples };
    std::vector<juce::int16> fifoBuffer;
    std::vector<juce::int16> scratch;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (LiveMonitorServer)
};

} // namespace phonetesto
