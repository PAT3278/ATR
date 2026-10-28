// Exercises LiveMonitorServer end-to-end without a phone: plain TCP clients
// stand in for browsers, a background thread stands in for the DAW's audio
// thread (pushing a 440 Hz tone at 44.1 kHz, so the 48 kHz resampling is
// exercised too), and every format's decoded audio is checked for the right
// pitch and level -- not just "some bytes arrived". Also covers concurrent
// listeners, the listener cap, password protection, a host sample-rate
// change mid-stream, abrupt disconnects, and a fast stop().
//
// What it can't prove: that iPhone Safari plays the page. See
// Tests/browser/player_test.mjs for the in-browser check (Chromium).
#include "../Source/LiveMonitorServer.h"

#include <opus.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

using namespace phonetesto;
using Clock = std::chrono::steady_clock;

namespace
{
int failures = 0;

void check (bool ok, const std::string& what)
{
    std::printf ("  [%s] %s\n", ok ? " ok " : "FAIL", what.c_str());
    if (! ok)
        ++failures;
}

//==============================================================================
/** Pushes a stereo sine into the server in real time, like processBlock. */
class TonePusher
{
public:
    TonePusher (LiveMonitorServer& s, double rate) : server (s), sampleRate (rate)
    {
        server.setInputSampleRate (rate); // as prepareToPlay does in the plugin
        thread = std::thread ([this] { run(); });
    }

    ~TonePusher()
    {
        running = false;
        thread.join();
    }

    void setSampleRate (double newRate) { pendingRate = newRate; }

private:
    void run()
    {
        constexpr int blockSize = 512;
        juce::AudioBuffer<float> block (2, blockSize);
        double phase = 0.0;
        auto next = Clock::now();

        while (running)
        {
            if (pendingRate > 0.0)
            {
                sampleRate = pendingRate.exchange (0.0);
                server.setInputSampleRate (sampleRate);
            }

            const double inc = 2.0 * juce::MathConstants<double>::pi * 440.0 / sampleRate;
            for (int i = 0; i < blockSize; ++i)
            {
                const auto v = (float) (0.5 * std::sin (phase));
                block.setSample (0, i, v);
                block.setSample (1, i, v);
                phase += inc;
            }

            server.pushAudio (block);
            next += std::chrono::microseconds ((long long) (1.0e6 * blockSize / sampleRate));
            std::this_thread::sleep_until (next);
        }
    }

    LiveMonitorServer& server;
    double sampleRate;
    std::atomic<double> pendingRate { 0.0 };
    std::atomic<bool> running { true };
    std::thread thread;
};

//==============================================================================
struct Client
{
    std::unique_ptr<juce::StreamingSocket> socket = std::make_unique<juce::StreamingSocket>();
    std::vector<juce::uint8> received;

    bool open (int port, const std::string& target)
    {
        if (! socket->connect ("127.0.0.1", port, 2000))
            return false;

        const auto request = "GET " + target + " HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        return socket->write (request.data(), (int) request.size()) == (int) request.size();
    }

    /** Reads whatever arrives within `ms`; returns false once the server has closed. */
    bool pump (int ms)
    {
        const auto until = Clock::now() + std::chrono::milliseconds (ms);
        juce::uint8 buf[16384];

        while (Clock::now() < until)
        {
            const int ready = socket->waitUntilReady (true, 20);
            if (ready < 0)
                return false;
            if (ready == 0)
                continue;

            const int n = socket->read (buf, sizeof (buf), false);
            if (n <= 0)
                return false;

            received.insert (received.end(), buf, buf + n);
        }

        return true;
    }

    int status() const
    {
        const std::string head (received.begin(), received.begin() + (long) std::min<size_t> (received.size(), 32));
        if (head.rfind ("HTTP/1.1 ", 0) != 0)
            return -1;
        return std::atoi (head.c_str() + 9);
    }

    std::vector<juce::uint8> body() const
    {
        const char* sep = "\r\n\r\n";
        auto it = std::search (received.begin(), received.end(), sep, sep + 4);
        return it == received.end() ? std::vector<juce::uint8>() : std::vector<juce::uint8> (it + 4, received.end());
    }

    std::string bodyText() const
    {
        const auto b = body();
        return std::string (b.begin(), b.end());
    }
};

Client get (int port, const std::string& target, int ms = 400)
{
    Client c;
    if (c.open (port, target))
        c.pump (ms);
    return c;
}

//==============================================================================
juce::uint32 le32 (const juce::uint8* p) { return (juce::uint32) p[0] | ((juce::uint32) p[1] << 8) | ((juce::uint32) p[2] << 16) | ((juce::uint32) p[3] << 24); }

/** Decodes a framed /stream body into the left channel at 48 kHz. */
std::vector<float> decodeFramed (const std::vector<juce::uint8>& body, int& formatOut, int& rateOut)
{
    std::vector<float> left;
    formatOut = -1;
    rateOut = 0;

    if (body.size() < 16 || std::memcmp (body.data(), "PTS1", 4) != 0)
        return left;

    formatOut = body[4];
    rateOut = (int) le32 (body.data() + 8);

    OpusDecoder* decoder = nullptr;
    if (formatOut == 2)
    {
        int err = 0;
        decoder = opus_decoder_create (48000, 2, &err);
    }

    size_t off = 16;
    std::vector<float> pcm (5760 * 2);

    while (body.size() - off >= 4)
    {
        const auto len = le32 (body.data() + off);
        if (body.size() - off - 4 < len)
            break;

        const auto* p = body.data() + off + 4;
        off += 4 + len;

        if (len == 0)
            continue;

        if (formatOut == 0)
            for (size_t i = 0; i + 3 < len; i += 4)
                left.push_back ((float) (juce::int16) (p[i] | (p[i + 1] << 8)) / 32768.0f);
        else if (formatOut == 1)
            for (size_t i = 0; i + 5 < len; i += 6)
            {
                int v = p[i] | (p[i + 1] << 8) | (p[i + 2] << 16);
                if (v & 0x800000) v -= 0x1000000;
                left.push_back ((float) v / 8388608.0f);
            }
        else if (decoder != nullptr)
        {
            const int frames = opus_decode_float (decoder, p, (opus_int32) len, pcm.data(), 5760, 0);
            for (int i = 0; i < frames; ++i)
                left.push_back (pcm[(size_t) i * 2]);
        }
    }

    if (decoder != nullptr)
        opus_decoder_destroy (decoder);

    return left;
}

/** Pitch by counting rising zero crossings; peak level; and the biggest
    sample-to-sample step, which exposes clicks (a clean 0.5-amplitude
    440 Hz sine at 48 kHz never moves more than ~0.029 per sample). Skips
    the first 100 ms (codec/resampler warm-up). */
void analyse (const std::vector<float>& x, double rate, double& freq, float& peak, float& maxStep)
{
    const size_t skip = (size_t) (rate * 0.1);
    freq = 0.0;
    peak = maxStep = 0.0f;

    if (x.size() <= skip + 2)
        return;

    int crossings = 0;
    for (size_t i = skip + 1; i < x.size(); ++i)
    {
        if (x[i - 1] < 0.0f && x[i] >= 0.0f)
            ++crossings;
        peak = std::max (peak, std::abs (x[i]));
        maxStep = std::max (maxStep, std::abs (x[i] - x[i - 1]));
    }

    freq = crossings * rate / (double) (x.size() - skip);
}

void checkTone (const std::vector<float>& left, const std::string& label, float peakTolerance, float stepLimit = 0.035f)
{
    double freq;
    float peak, maxStep;
    analyse (left, 48000.0, freq, peak, maxStep);

    char buf[256];
    std::snprintf (buf, sizeof (buf), "%s: %.2f s of audio, %.1f Hz (want 440), peak %.3f (want 0.5), biggest step %.4f (clean 0.0288)",
                   label.c_str(), left.size() / 48000.0, freq, peak, maxStep);

    check (left.size() > 48000 / 2 && std::abs (freq - 440.0) < 4.0 && std::abs (peak - 0.5f) < peakTolerance
               && maxStep < stepLimit,
           buf);
}
} // namespace

//==============================================================================
int main()
{
    LiveMonitorServer server;

    std::printf ("Starting server (input 44.1 kHz)\n");
    check (server.start (0, 44100.0), "server starts on an OS-chosen port");
    const int port = server.getPort();
    std::printf ("  listening on 127.0.0.1:%d\n", port);

    std::printf ("Plain routes\n");
    {
        auto page = get (port, "/");
        check (page.status() == 200 && page.bodyText().find ("<title>PhoneTesto Live</title>") != std::string::npos,
               "GET / serves the player page");

        auto info = get (port, "/info");
        check (info.status() == 200 && info.bodyText().find ("\"auth\":false") != std::string::npos
                   && info.bodyText().find ("\"sampleRate\":48000") != std::string::npos,
               "GET /info reports 48 kHz, no password: " + info.bodyText());

        check (get (port, "/nope").status() == 404, "unknown path -> 404");
        check (get (port, "/auth").status() == 204, "/auth with no password set -> 204");
    }

    std::printf ("Three listeners at once, one per format\n");
    {
        TonePusher tone (server, 44100.0);
        Client pcm16, pcm24, opus;
        check (pcm16.open (port, "/stream?fmt=pcm16") && pcm24.open (port, "/stream?fmt=pcm24")
                   && opus.open (port, "/stream?fmt=opus&br=128"),
               "three clients connect");

        for (int i = 0; i < 75; ++i) // ~1.5 s
        {
            pcm16.pump (7); pcm24.pump (7); opus.pump (6);
        }

        check (server.getNumListeners() == 3, "server counts 3 listeners (got " + std::to_string (server.getNumListeners()) + ")");
        check (server.getListenerAddresses().size() == 3, "server lists 3 listener addresses");

        int fmt, rate;
        auto a = decodeFramed (pcm16.body(), fmt, rate);
        check (pcm16.status() == 200 && fmt == 0 && rate == 48000, "pcm16 stream header");
        checkTone (a, "pcm16", 0.02f);

        auto b = decodeFramed (pcm24.body(), fmt, rate);
        check (pcm24.status() == 200 && fmt == 1 && rate == 48000, "pcm24 stream header");
        checkTone (b, "pcm24", 0.02f);

        auto c = decodeFramed (opus.body(), fmt, rate);
        check (opus.status() == 200 && fmt == 2 && rate == 48000, "opus stream header");
        checkTone (c, "opus 128 kbps", 0.08f, 0.06f);

        // Hang up abruptly while audio is still being pushed: if a send on a
        // dead socket raised SIGPIPE this test process would die right here.
        pcm16.socket->close(); pcm24.socket->close(); opus.socket->close();
        std::this_thread::sleep_for (std::chrono::milliseconds (1200));
        check (server.getNumListeners() == 0, "listeners released after clients hang up (got "
                                                   + std::to_string (server.getNumListeners()) + ")");
    }

    std::printf ("Host sample-rate change mid-stream (44.1 -> 96 kHz)\n");
    {
        TonePusher tone (server, 44100.0);
        Client client;
        client.open (port, "/stream?fmt=pcm16");
        client.pump (600);
        tone.setSampleRate (96000.0);
        client.pump (300);
        const auto before = client.received.size();
        client.pump (1200);

        int fmt, rate;
        auto all = decodeFramed (client.body(), fmt, rate);
        // analyse only the part received after the switch had settled
        const size_t settledSamples = (before > 0 ? (client.received.size() - before) / 4 : 0);
        std::vector<float> tail (all.end() - (long) std::min (settledSamples, all.size()), all.end());
        checkTone (tail, "after switch to 96 kHz input", 0.02f);
        check (server.getNumListeners() == 1, "listener stayed connected through the rate change");
    }
    std::this_thread::sleep_for (std::chrono::milliseconds (300));

    std::printf ("Background-mode WAV stream\n");
    {
        TonePusher tone (server, 44100.0);
        Client wav;
        wav.open (port, "/live.wav");
        wav.pump (1200);
        const auto body = wav.body();
        const bool header = body.size() > 44 && std::memcmp (body.data(), "RIFF", 4) == 0
                            && std::memcmp (body.data() + 8, "WAVE", 4) == 0 && le32 (body.data() + 24) == 48000;
        check (wav.status() == 200 && header, "/live.wav: 200 + RIFF/WAVE header at 48 kHz");

        std::vector<float> left;
        for (size_t i = 44; i + 3 < body.size(); i += 4)
            left.push_back ((float) (juce::int16) (body[i] | (body[i + 1] << 8)) / 32768.0f);
        checkTone (left, "wav", 0.02f);
    }
    std::this_thread::sleep_for (std::chrono::milliseconds (300));

    std::printf ("Password protection\n");
    {
        const juce::String password = juce::String::fromUTF8 ("s3cret+\xe6\x97\xa5\xe6\x9c\xac"); // "s3cret+日本"
        server.setPassword (password);
        const auto encoded = juce::URL::addEscapeChars (password, true).toStdString();

        check (get (port, "/info").bodyText().find ("\"auth\":true") != std::string::npos, "/info reports a password");
        check (get (port, "/stream?fmt=pcm16").status() == 401, "stream without key -> 401");
        check (get (port, "/live.wav?key=wrong").status() == 401, "wav with wrong key -> 401");
        check (get (port, "/auth?key=s3cret").status() == 401, "/auth with a prefix of the password -> 401");
        check (get (port, "/auth?key=" + encoded).status() == 204, "/auth with the right (URL-encoded, non-ASCII) key -> 204");
        check (get (port, "/").status() == 200, "player page itself stays reachable (it asks for the password)");

        TonePusher tone (server, 44100.0);
        auto ok = get (port, "/stream?fmt=pcm16&key=" + encoded, 800);
        int fmt, rate;
        check (ok.status() == 200 && ! decodeFramed (ok.body(), fmt, rate).empty(), "stream with the right key plays");
        server.setPassword ({});
    }
    std::this_thread::sleep_for (std::chrono::milliseconds (300));

    std::printf ("Listener cap (%d)\n", LiveMonitorServer::maxListeners);
    {
        TonePusher tone (server, 44100.0);
        std::vector<std::unique_ptr<Client>> clients;
        for (int i = 0; i < LiveMonitorServer::maxListeners; ++i)
        {
            clients.push_back (std::make_unique<Client>());
            clients.back()->open (port, "/stream?fmt=opus&br=64");
        }

        for (int i = 0; i < 20; ++i)
            for (auto& c : clients)
                c->pump (2);

        check (server.getNumListeners() == LiveMonitorServer::maxListeners,
               "all " + std::to_string (LiveMonitorServer::maxListeners) + " listeners accepted (got "
                   + std::to_string (server.getNumListeners()) + ")");
        check (get (port, "/stream?fmt=pcm16").status() == 503, "one more -> 503");

        const auto t0 = Clock::now();
        server.stop();
        const auto ms = std::chrono::duration_cast<std::chrono::milliseconds> (Clock::now() - t0).count();
        check (ms < 1500, "stop() with 32 live listeners returns promptly (" + std::to_string (ms) + " ms)");
        check (! server.isRunning() && server.getNumListeners() == 0, "server fully stopped");
    }

    std::printf ("Restart on the same port after stop\n");
    check (server.start (port, 48000.0, 1) && server.getPort() == port, "port is reusable immediately");
    server.stop();

    if (failures > 0)
    {
        std::printf ("\nFAILED: %d check(s)\n", failures);
        return 1;
    }

    std::printf ("\nAll Live Monitor server checks passed.\n");
    return 0;
}
