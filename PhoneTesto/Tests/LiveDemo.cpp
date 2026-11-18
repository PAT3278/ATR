// Runs the Live Monitor server on its own, fed with a test tone instead of a
// DAW, so the phone player page can be tried (or tested in a browser)
// without a plugin host:
//
//   PhoneTestoLiveDemo [--port N] [--password P] [--rate HZ] [--seconds S]
//
// Prints "READY port=<n>" once listening. Runs until --seconds elapse or
// stdin closes.
#include "../Source/LiveMonitorServer.h"

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <thread>

int main (int argc, char** argv)
{
    int port = 51813;
    double rate = 44100.0;
    double seconds = 0.0;
    juce::String password;

    for (int i = 1; i + 1 < argc; i += 2)
    {
        const juce::String flag (argv[i]), value (argv[i + 1]);
        if (flag == "--port")          port = value.getIntValue();
        else if (flag == "--password") password = value;
        else if (flag == "--rate")     rate = value.getDoubleValue();
        else if (flag == "--seconds")  seconds = value.getDoubleValue();
    }

    phonetesto::LiveMonitorServer server;
    server.setPassword (password);

    if (! server.start (port, rate))
    {
        std::fprintf (stderr, "could not open port %d\n", port);
        return 1;
    }

    std::printf ("READY port=%d\n", server.getPort());
    for (auto& a : phonetesto::LiveMonitorServer::getLocalAddresses())
        std::printf ("  http://%s:%d/\n", a.toRawUTF8(), server.getPort());
    std::fflush (stdout);

    std::atomic<bool> running { true };
    std::thread stdinWatcher ([&] { std::string line; while (std::getline (std::cin, line)) {} running = false; });
    stdinWatcher.detach();

    constexpr int blockSize = 512;
    juce::AudioBuffer<float> block (2, blockSize);
    double phase = 0.0;
    const auto start = std::chrono::steady_clock::now();
    auto next = start;

    while (running)
    {
        if (seconds > 0.0 && std::chrono::steady_clock::now() - start > std::chrono::duration<double> (seconds))
            break;

        for (int i = 0; i < blockSize; ++i)
        {
            const auto v = (float) (0.5 * std::sin (phase));
            block.setSample (0, i, v);
            block.setSample (1, i, v);
            phase += 2.0 * juce::MathConstants<double>::pi * 440.0 / rate;
        }

        server.pushAudio (block);
        next += std::chrono::microseconds ((long long) (1.0e6 * blockSize / rate));
        std::this_thread::sleep_until (next);
    }

    server.stop();
    return 0;
}
