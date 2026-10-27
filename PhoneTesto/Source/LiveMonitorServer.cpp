#include "LiveMonitorServer.h"

#include <cmath>
#include <cstring>

namespace phonetesto
{

LiveMonitorServer::LiveMonitorServer() : juce::Thread ("PhoneTesto Live Monitor")
{
    fifoBuffer.resize ((size_t) fifoCapacitySamples);
    scratch.resize ((size_t) maxScratchSamples);
}

LiveMonitorServer::~LiveMonitorServer()
{
    stop();
}

bool LiveMonitorServer::start (int port, double sampleRate, int numChannels)
{
    stop();

    auto newListener = std::make_unique<juce::StreamingSocket>();
    if (! newListener->createListener (port))
        return false;

    streamSampleRate = sampleRate > 0.0 ? sampleRate : 44100.0;
    streamNumChannels = juce::jmax (1, numChannels);

    listener = std::move (newListener);
    const int actualPort = listener->getBoundPort();
    boundPort = actualPort > 0 ? actualPort : port;

    fifo.reset();
    listening = true;

    startThread();
    return true;
}

void LiveMonitorServer::stop()
{
    listening = false;
    signalThreadShouldExit();

    if (listener != nullptr)
        listener->close();

    {
        const juce::ScopedLock sl (clientLock);
        if (client != nullptr)
            client->close();
    }

    stopThread (2000);

    listener.reset();

    {
        const juce::ScopedLock sl (clientLock);
        client.reset();
    }

    clientConnected = false;
    boundPort = 0;
}

juce::String LiveMonitorServer::getClientAddress() const
{
    const juce::ScopedLock sl (clientLock);
    return client != nullptr ? client->getHostName() : juce::String();
}

juce::StringArray LiveMonitorServer::getLocalAddresses()
{
    juce::StringArray result;

    for (auto& addr : juce::IPAddress::getAllAddresses (false))
    {
        auto s = addr.toString();
        if (! s.startsWith ("127."))
            result.add (s);
    }

    if (result.isEmpty())
        result.add (juce::IPAddress::getLocalAddress().toString());

    return result;
}

void LiveMonitorServer::writeLiveWavHeader (juce::OutputStream& out, double sampleRate, int numChannels)
{
    // Declaring an effectively unbounded data-chunk size (rather than the
    // real, unknowable-in-advance length of a live stream) is the same
    // trick classic Icecast/Shoutcast WAV live streams use so players keep
    // consuming audio as it arrives instead of stopping at a fixed byte
    // count. Support for this varies by player -- see the class comment.
    constexpr juce::uint32 placeholderSize = 0x7FFFFFFF;

    const auto channels = (juce::uint16) numChannels;
    const auto rate = (juce::uint32) std::lround (sampleRate);
    constexpr juce::uint16 bitsPerSample = 16;
    const auto blockAlign = (juce::uint16) (channels * (bitsPerSample / 8));
    const auto byteRate = (juce::uint32) rate * blockAlign;

    out.write ("RIFF", 4);
    out.writeInt ((int) placeholderSize);
    out.write ("WAVE", 4);

    out.write ("fmt ", 4);
    out.writeInt (16);
    out.writeShort (1); // PCM
    out.writeShort ((short) channels);
    out.writeInt ((int) rate);
    out.writeInt ((int) byteRate);
    out.writeShort ((short) blockAlign);
    out.writeShort ((short) bitsPerSample);

    out.write ("data", 4);
    out.writeInt ((int) placeholderSize);
}

void LiveMonitorServer::pushAudio (const juce::AudioBuffer<float>& buffer)
{
    if (! clientConnected.load())
        return;

    const int numChannels = juce::jmin (buffer.getNumChannels(), streamNumChannels);
    const int numSamples = buffer.getNumSamples();
    const int neededCapacity = numSamples * streamNumChannels;

    if (neededCapacity <= 0 || neededCapacity > (int) scratch.size())
        return; // unexpectedly large block for our preallocated scratch -- drop rather than allocate here

    for (int s = 0; s < numSamples; ++s)
    {
        for (int ch = 0; ch < streamNumChannels; ++ch)
        {
            const float sample = (ch < numChannels) ? buffer.getSample (ch, s) : 0.0f;
            const float clamped = juce::jlimit (-1.0f, 1.0f, sample);
            scratch[(size_t) (s * streamNumChannels + ch)] = (juce::int16) std::lround (clamped * 32767.0f);
        }
    }

    int start1, size1, start2, size2;
    fifo.prepareToWrite (neededCapacity, start1, size1, start2, size2);

    if (size1 + size2 < neededCapacity)
    {
        fifo.finishedWrite (0); // network thread can't keep up -- drop this block, don't risk a glitch here
        return;
    }

    if (size1 > 0)
        std::memcpy (fifoBuffer.data() + start1, scratch.data(), (size_t) size1 * sizeof (juce::int16));
    if (size2 > 0)
        std::memcpy (fifoBuffer.data() + start2, scratch.data() + size1, (size_t) size2 * sizeof (juce::int16));

    fifo.finishedWrite (size1 + size2);
}

void LiveMonitorServer::run()
{
    while (! threadShouldExit())
    {
        auto* accepted = listener != nullptr ? listener->waitForNextConnection() : nullptr;

        if (accepted == nullptr)
            break; // listener closed -- shutting down

        {
            const juce::ScopedLock sl (clientLock);
            client.reset (accepted);
        }
        clientConnected = true;

        // Drain whatever request the browser sent; we don't need to parse
        // it, just clear it off the socket before we start writing.
        {
            char requestScratch[1024];
            if (client->waitUntilReady (true, 200) == 1)
                client->read (requestScratch, sizeof (requestScratch), false);
        }

        bool headerOk;
        {
            juce::MemoryOutputStream headerStream;
            headerStream << "HTTP/1.1 200 OK\r\n"
                            "Content-Type: audio/wav\r\n"
                            "Cache-Control: no-cache, no-store\r\n"
                            "Connection: keep-alive\r\n"
                            "Access-Control-Allow-Origin: *\r\n"
                            "\r\n";
            writeLiveWavHeader (headerStream, streamSampleRate, streamNumChannels);

            headerOk = client->write (headerStream.getData(), (int) headerStream.getDataSize()) >= 0;
        }

        fifo.reset();

        while (headerOk && ! threadShouldExit())
        {
            int start1, size1, start2, size2;
            fifo.prepareToRead (4096, start1, size1, start2, size2);

            if (size1 == 0 && size2 == 0)
            {
                if (! client->isConnected())
                    break;
                juce::Thread::sleep (5);
                continue;
            }

            bool writeOk = true;
            if (size1 > 0)
                writeOk = client->write (fifoBuffer.data() + start1, size1 * (int) sizeof (juce::int16)) >= 0;
            if (writeOk && size2 > 0)
                writeOk = client->write (fifoBuffer.data() + start2, size2 * (int) sizeof (juce::int16)) >= 0;

            fifo.finishedRead (size1 + size2);

            if (! writeOk)
                break;
        }

        {
            const juce::ScopedLock sl (clientLock);
            client.reset();
        }
        clientConnected = false;
    }
}

} // namespace phonetesto
