// Exercises LiveMonitorServer end-to-end without a real phone: starts the
// server, connects a plain TCP client (standing in for Safari), pushes
// synthetic audio from a simulated "audio thread", and checks that the
// client actually receives a valid HTTP+WAV header followed by a growing
// stream of PCM bytes. This proves the streaming mechanism itself works;
// it does NOT prove Safari on a real iPhone will play it smoothly -- see
// the caveat in LiveMonitorServer.h.
#include "../Source/LiveMonitorServer.h"

#include <cstdio>
#include <cstring>
#include <thread>
#include <chrono>

using namespace phonetesto;

namespace
{
// The WAV header is binary and contains embedded zero bytes (e.g. the PCM
// format-tag field), so a juce::String built from it would truncate at the
// first one. Search the raw bytes directly instead.
bool expectContains (const std::vector<char>& haystack, int haystackLen, const char* needle, const char* label)
{
    const size_t needleLen = std::strlen (needle);
    bool ok = false;

    for (int i = 0; i + (int) needleLen <= haystackLen && ! ok; ++i)
        if (std::memcmp (haystack.data() + i, needle, needleLen) == 0)
            ok = true;

    std::printf ("  [%s] contains \"%s\": %s\n", label, needle, ok ? "yes" : "NO");
    return ok;
}
} // namespace

int main()
{
    LiveMonitorServer server;

    constexpr double sampleRate = 48000.0;
    constexpr int numChannels = 2;
    constexpr int blockSize = 512;

    // port 0 asks the OS for a free ephemeral port, so the test can't clash
    // with anything else already listening.
    if (! server.start (0, sampleRate, numChannels))
    {
        std::printf ("FAILED: server.start() returned false\n");
        return 1;
    }

    const int port = server.getPort();
    std::printf ("Server listening on 127.0.0.1:%d\n", port);

    juce::StreamingSocket client;
    if (! client.connect ("127.0.0.1", port, 2000))
    {
        std::printf ("FAILED: test client could not connect\n");
        return 1;
    }

    // Send a minimal HTTP GET, as a browser would.
    const char* request = "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
    client.write (request, (int) std::strlen (request));

    // Give the server a moment to accept() and register the client before
    // we start "playing" audio -- mirrors the real startup order (phone
    // connects, then audio starts flowing).
    std::this_thread::sleep_for (std::chrono::milliseconds (100));

    if (! server.hasClient())
    {
        std::printf ("FAILED: server did not register the client as connected\n");
        return 1;
    }

    // Simulate ~1 second of audio arriving from processBlock.
    juce::AudioBuffer<float> block (numChannels, blockSize);
    const int numBlocks = (int) (sampleRate / blockSize) + 2;
    for (int b = 0; b < numBlocks; ++b)
    {
        for (int ch = 0; ch < numChannels; ++ch)
        {
            auto* data = block.getWritePointer (ch);
            for (int i = 0; i < blockSize; ++i)
                data[i] = 0.5f * std::sin ((float) (b * blockSize + i) * 0.05f);
        }
        server.pushAudio (block);
        std::this_thread::sleep_for (std::chrono::milliseconds (1));
    }

    // Read whatever arrived: header plus some audio bytes.
    std::vector<char> received (64 * 1024);
    int totalRead = 0;
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds (3);
    while (totalRead < 4096 && std::chrono::steady_clock::now() < deadline)
    {
        if (client.waitUntilReady (true, 200) != 1)
            continue;
        const int n = client.read (received.data() + totalRead, (int) received.size() - totalRead, false);
        if (n > 0)
            totalRead += n;
    }

    std::printf ("Read %d bytes from the stream\n", totalRead);

    if (totalRead < 44)
    {
        std::printf ("FAILED: not enough bytes received to even hold a WAV header\n");
        return 1;
    }

    const int headerSearchLen = juce::jmin (totalRead, 512);

    bool ok = true;
    ok &= expectContains (received, headerSearchLen, "HTTP/1.1 200 OK", "http-status");
    ok &= expectContains (received, headerSearchLen, "Content-Type: audio/wav", "content-type");
    ok &= expectContains (received, headerSearchLen, "RIFF", "riff-tag");
    ok &= expectContains (received, headerSearchLen, "WAVE", "wave-tag");
    ok &= expectContains (received, headerSearchLen, "fmt ", "fmt-chunk");
    ok &= expectContains (received, headerSearchLen, "data", "data-chunk");

    // Beyond the header (roughly 44-100 bytes in), we should have real PCM
    // payload -- i.e. more bytes arrived than just the header.
    const bool gotPayload = totalRead > 200;
    std::printf ("  [payload] received more than just the header: %s (%d bytes total)\n",
                 gotPayload ? "yes" : "NO", totalRead);
    ok &= gotPayload;

    const auto clientAddr = server.getClientAddress();
    std::printf ("Server reports client address: \"%s\"\n", clientAddr.toRawUTF8());

    server.stop();

    if (! ok)
    {
        std::printf ("FAILED: one or more checks above did not pass\n");
        return 1;
    }

    std::printf ("Live Monitor server streams a valid HTTP+WAV header and PCM payload end-to-end.\n");
    return 0;
}
