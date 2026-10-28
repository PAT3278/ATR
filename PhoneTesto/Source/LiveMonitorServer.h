#pragma once

#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <atomic>
#include <memory>

namespace phonetesto
{

/** Single-producer / multi-consumer ring of interleaved stereo float frames.
    The audio thread writes; each listener thread reads from its own cursor.
    The writer never waits: a listener that falls too far behind skips ahead
    (an audible drop on that one phone, never a glitch in the DAW). Samples
    are relaxed atomics so concurrent reads of slots being overwritten are
    well-defined; torn frames are detected and discarded by re-checking the
    write position after copying. */
class BroadcastRing
{
public:
    static constexpr int numChannels = 2;

    void prepare (int capacityFramesPowerOfTwo);

    /** Audio thread only. Mono input is duplicated to both channels; extra
        input channels beyond two are ignored. */
    void write (const juce::AudioBuffer<float>& buffer) noexcept;

    juce::uint64 getWritePosition() const noexcept { return writePos.load (std::memory_order_acquire); }

    /** Copies up to `maxFrames` frames starting at `readPosition` into
        `dest` (interleaved) and advances it. Returns the number of frames
        copied; 0 if nothing new (or if the reader had fallen behind and was
        moved up to near the live edge). */
    int read (juce::uint64& readPosition, float* dest, int maxFrames) const noexcept;

private:
    std::unique_ptr<std::atomic<float>[]> data;
    juce::uint64 capacity = 0, mask = 0;
    std::atomic<juce::uint64> writePos { 0 };
};

/** Streams the plugin's audio to real phones over the local network so the
    mix can be heard on their actual speakers.

    An embedded HTTP server; the phone needs nothing but a browser:
      GET /           the player page (Resources/player.html)
      GET /player-worklet.js
                      the page's AudioWorklet (continuous playback + jitter buffer)
      GET /fonts/*    the Barlow fonts the page shares with the plugin
      GET /info       JSON: stream format + whether a password is required
      GET /auth?key=  204 if the password is right, 401 if not
      GET /stream?fmt=opus|pcm16|pcm24&br=<kbps>&key=
                      low-latency framed stream for the page's Web Audio player
      GET /live.wav?key=
                      an endless 16-bit WAV for the page's background mode
                      (a plain <audio> element, which phones keep playing with
                      the screen off), or for players like VLC

    Up to `maxListeners` phones can listen at once, each choosing its own
    format. Everything is sent at 48 kHz regardless of the host's rate. */
class LiveMonitorServer : private juce::Thread
{
public:
    static constexpr int maxListeners = 32;
    static constexpr int ringCapacityFrames = 1 << 19; // ~2.7 s even at 192 kHz

    LiveMonitorServer();
    ~LiveMonitorServer() override;

    /** Starts listening on `preferredPort`, or the next free port within
        `portSearchRange` if that one is taken. Returns false if none could
        be opened. Port 0 lets the OS pick (used by tests). */
    bool start (int preferredPort, double inputSampleRate, int portSearchRange = 10);
    void stop();

    bool isRunning() const noexcept { return running.load(); }
    int getPort() const noexcept { return boundPort.load(); }

    /** May be called at any time (e.g. from prepareToPlay): listeners keep
        playing, their encoders just pick up the new input rate. */
    void setInputSampleRate (double newRate) noexcept { if (newRate > 0.0) inputSampleRate.store (newRate); }
    double getInputSampleRate() const noexcept { return inputSampleRate.load(); }

    /** Empty = no password. Takes effect for new requests. */
    void setPassword (const juce::String&);
    bool hasPassword() const;
    bool checkPassword (const juce::String& candidate) const;

    int getNumListeners() const;
    juce::StringArray getListenerAddresses() const;

    /** Non-loopback IPv4 addresses, most likely home-Wi-Fi address first. */
    static juce::StringArray getLocalAddresses();

    /** Audio thread. Realtime-safe: no allocation, no locks, never blocks. */
    void pushAudio (const juce::AudioBuffer<float>& buffer) noexcept;

private:
    class Connection;
    friend class Connection;

    void run() override;
    void reapFinishedConnections();

    std::unique_ptr<juce::StreamingSocket> listener;
    std::atomic<bool> running { false };
    std::atomic<int> boundPort { 0 };
    std::atomic<double> inputSampleRate { 48000.0 };
    std::atomic<int> numStreaming { 0 };

    BroadcastRing ring;

    mutable juce::CriticalSection passwordLock;
    juce::String password;

    mutable juce::CriticalSection connectionsLock;
    juce::OwnedArray<Connection> connections;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (LiveMonitorServer)
};

} // namespace phonetesto
