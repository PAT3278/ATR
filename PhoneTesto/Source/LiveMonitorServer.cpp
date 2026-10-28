#include "LiveMonitorServer.h"
#include "LiveStreamEncoder.h"
#include "BinaryData.h"

#include <algorithm>
#include <cstring>

#if ! JUCE_WINDOWS
 #include <sys/types.h>
 #include <sys/socket.h>
 #include <fcntl.h>
 #include <cerrno>
#endif

namespace phonetesto
{

//==============================================================================
void BroadcastRing::prepare (int capacityFramesPowerOfTwo)
{
    jassert (juce::isPowerOfTwo (capacityFramesPowerOfTwo));
    capacity = (juce::uint64) capacityFramesPowerOfTwo;
    mask = capacity - 1;
    data = std::make_unique<std::atomic<float>[]> ((size_t) capacity * numChannels);

    for (size_t i = 0; i < (size_t) capacity * numChannels; ++i)
        data[i].store (0.0f, std::memory_order_relaxed);
}

void BroadcastRing::write (const juce::AudioBuffer<float>& buffer) noexcept
{
    const int numFrames = buffer.getNumSamples();
    const int inChannels = buffer.getNumChannels();

    if (data == nullptr || inChannels == 0 || numFrames <= 0 || (juce::uint64) numFrames > capacity / 4)
        return;

    const auto* left = buffer.getReadPointer (0);
    const auto* right = buffer.getReadPointer (inChannels > 1 ? 1 : 0);
    const auto start = writePos.load (std::memory_order_relaxed);

    for (int i = 0; i < numFrames; ++i)
    {
        const auto slot = (size_t) (((start + (juce::uint64) i) & mask) * numChannels);
        data[slot].store (left[i], std::memory_order_relaxed);
        data[slot + 1].store (right[i], std::memory_order_relaxed);
    }

    writePos.store (start + (juce::uint64) numFrames, std::memory_order_release);
}

int BroadcastRing::read (juce::uint64& readPosition, float* dest, int maxFrames) const noexcept
{
    if (data == nullptr)
        return 0;

    const auto liveEdgeSlack = (juce::uint64) 2048;
    auto w = writePos.load (std::memory_order_acquire);

    if (readPosition > w)
        readPosition = w;

    // Fell too far behind (phone stalled): jump to just behind the live edge.
    if (w - readPosition > capacity / 2)
    {
        readPosition = w - juce::jmin (w, liveEdgeSlack);
        return 0;
    }

    const auto n = (int) juce::jmin ((juce::uint64) maxFrames, w - readPosition);

    for (int i = 0; i < n; ++i)
    {
        const auto slot = (size_t) (((readPosition + (juce::uint64) i) & mask) * numChannels);
        dest[i * numChannels]     = data[slot].load (std::memory_order_relaxed);
        dest[i * numChannels + 1] = data[slot + 1].load (std::memory_order_relaxed);
    }

    // If the writer lapped us while copying, what we copied may be torn.
    const auto w2 = writePos.load (std::memory_order_acquire);
    if (w2 - readPosition > capacity / 2)
    {
        readPosition = w2 - juce::jmin (w2, liveEdgeSlack);
        return 0;
    }

    readPosition += (juce::uint64) n;
    return n;
}

//==============================================================================
namespace
{
    struct HttpRequest
    {
        juce::String method, path;
        juce::StringPairArray query;
    };

    juce::String statusLine (int code)
    {
        switch (code)
        {
            case 200: return "200 OK";
            case 204: return "204 No Content";
            case 401: return "401 Unauthorized";
            case 404: return "404 Not Found";
            case 405: return "405 Method Not Allowed";
            case 503: return "503 Service Unavailable";
            default:  return juce::String (code);
        }
    }

    void writeLiveWavHeader (juce::OutputStream& out)
    {
        // A live stream's real length is unknowable, so declare an
        // effectively unbounded size -- the Icecast/Shoutcast trick that
        // makes players keep consuming audio as it arrives.
        constexpr int placeholderSize = 0x7FFFFFFF;
        constexpr int channels = LiveStreamEncoder::numChannels;
        constexpr int rate = LiveStreamEncoder::outputSampleRate;
        constexpr int blockAlign = channels * 2;

        out.write ("RIFF", 4);
        out.writeInt (placeholderSize);
        out.write ("WAVE", 4);
        out.write ("fmt ", 4);
        out.writeInt (16);
        out.writeShort (1); // PCM
        out.writeShort ((short) channels);
        out.writeInt (rate);
        out.writeInt (rate * blockAlign);
        out.writeShort ((short) blockAlign);
        out.writeShort (16);
        out.write ("data", 4);
        out.writeInt (placeholderSize);
    }
} // namespace

//==============================================================================
class LiveMonitorServer::Connection : public juce::Thread
{
public:
    Connection (LiveMonitorServer& s, juce::StreamingSocket* sock)
        : juce::Thread ("PhoneTesto Listener"), server (s), socket (sock), address (sock->getHostName())
    {
    }

    ~Connection() override
    {
        stopThread (2000);
    }

    bool isStreaming() const noexcept { return streaming.load(); }
    bool isFinished() const noexcept { return finished.load(); }
    const juce::String& getAddress() const noexcept { return address; }

    /** Used by stop() for a connection whose thread is stuck in a blocking
        send (Windows): closing the socket makes that send fail at once. */
    void forceClose()
    {
        const juce::ScopedLock sl (closeLock);
        socket->close();
    }

private:
    void run() override
    {
        handleRequest();

        if (streaming.exchange (false))
            --server.numStreaming;

        forceClose();
        finished = true;
    }

    //==========================================================================
    bool readRequest (HttpRequest& request)
    {
        std::string raw;
        const auto deadline = juce::Time::getMillisecondCounter() + 5000;

        // One byte at a time keeps JUCE's socket in blocking mode (see
        // makeSendSafe) and a request line + headers is only a few hundred
        // bytes.
        while (raw.size() < 8192)
        {
            if (threadShouldExit() || juce::Time::getMillisecondCounter() > deadline)
                return false;

            const int ready = socket->waitUntilReady (true, 100);
            if (ready < 0)
                return false;
            if (ready == 0)
                continue;

            char c = 0;
            if (socket->read (&c, 1, true) != 1)
                return false;

            raw.push_back (c);

            if (raw.size() >= 4 && raw.compare (raw.size() - 4, 4, "\r\n\r\n") == 0)
                break;
        }

        const auto text = juce::String::fromUTF8 (raw.data(), (int) raw.size());
        const auto firstLine = text.upToFirstOccurrenceOf ("\r\n", false, false);
        auto parts = juce::StringArray::fromTokens (firstLine, " ", {});

        if (parts.size() < 2)
            return false;

        request.method = parts[0].toUpperCase();
        const auto target = parts[1];
        request.path = target.upToFirstOccurrenceOf ("?", false, false);

        const auto queryString = target.fromFirstOccurrenceOf ("?", false, false);
        for (auto& pair : juce::StringArray::fromTokens (queryString, "&", {}))
        {
            if (pair.isEmpty())
                continue;

            const auto key = juce::URL::removeEscapeChars (pair.upToFirstOccurrenceOf ("=", false, false));
            const auto value = juce::URL::removeEscapeChars (pair.fromFirstOccurrenceOf ("=", false, false));
            request.query.set (key, value);
        }

        return true;
    }

    /** Writing to a socket whose peer has gone away raises SIGPIPE on
        macOS/Linux, which would kill the whole DAW. Suppress it, and switch
        to non-blocking sends so a phone that stops reading can't wedge this
        thread. (Windows has no SIGPIPE; there JUCE's blocking write is used
        and stop() closes the socket to unblock it.) */
    void makeSendSafe()
    {
       #if ! JUCE_WINDOWS
        const int fd = socket->getRawSocketHandle();
        if (fd < 0)
            return;

        #ifdef SO_NOSIGPIPE
        int one = 1;
        setsockopt (fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof (one));
        #endif

        const int flags = fcntl (fd, F_GETFL, 0);
        if (flags >= 0)
            fcntl (fd, F_SETFL, flags | O_NONBLOCK);
       #endif
    }

    bool sendAll (const void* bytes, size_t numBytes)
    {
        auto* p = static_cast<const char*> (bytes);
        int stalledMs = 0;

        while (numBytes > 0)
        {
            if (threadShouldExit())
                return false;

            const auto chunk = juce::jmin (numBytes, (size_t) 65536);

           #if JUCE_WINDOWS
            const int sent = socket->write (p, (int) chunk);
            if (sent <= 0)
                return false;
           #else
            const int fd = socket->getRawSocketHandle();
            if (fd < 0)
                return false;

            #ifdef MSG_NOSIGNAL
            constexpr int sendFlags = MSG_NOSIGNAL;
            #else
            constexpr int sendFlags = 0;
            #endif

            const auto sent = (int) ::send (fd, p, chunk, sendFlags);

            if (sent < 0)
            {
                if (errno == EINTR)
                    continue;

                if (errno == EAGAIN || errno == EWOULDBLOCK)
                {
                    const int ready = socket->waitUntilReady (false, 100);
                    if (ready < 0)
                        return false;

                    // A phone that hasn't read anything for 10 s is gone.
                    if (ready == 0 && (stalledMs += 100) > 10000)
                        return false;

                    continue;
                }

                return false;
            }
           #endif

            stalledMs = 0;
            p += sent;
            numBytes -= (size_t) sent;
        }

        return true;
    }

    bool sendResponse (int code, const juce::String& contentType, const void* body, size_t bodySize,
                       bool headOnly = false, const char* cacheControl = "no-store")
    {
        juce::String header;
        header << "HTTP/1.1 " << statusLine (code) << "\r\n"
               << "Content-Type: " << contentType << "\r\n"
               << "Content-Length: " << (juce::int64) bodySize << "\r\n"
               << "Cache-Control: " << cacheControl << "\r\n"
               << "Connection: close\r\n\r\n";

        if (! sendAll (header.toRawUTF8(), header.getNumBytesAsUTF8()))
            return false;

        return headOnly || bodySize == 0 || sendAll (body, bodySize);
    }

    bool sendText (int code, const juce::String& text)
    {
        return sendResponse (code, "text/plain; charset=utf-8", text.toRawUTF8(), text.getNumBytesAsUTF8());
    }

    bool sendStreamHeaders (const juce::String& contentType)
    {
        juce::String header;
        header << "HTTP/1.1 200 OK\r\n"
               << "Content-Type: " << contentType << "\r\n"
               << "Cache-Control: no-store\r\n"
               << "X-Content-Type-Options: nosniff\r\n"
               << "Connection: close\r\n\r\n";

        return sendAll (header.toRawUTF8(), header.getNumBytesAsUTF8());
    }

    bool acquireListenerSlot()
    {
        int n = server.numStreaming.load();

        while (n < maxListeners)
        {
            if (server.numStreaming.compare_exchange_weak (n, n + 1))
            {
                streaming = true;
                return true;
            }
        }

        return false;
    }

    //==========================================================================
    void handleRequest()
    {
        HttpRequest request;
        if (! readRequest (request))
            return;

        makeSendSafe();

        const bool head = request.method == "HEAD";

        if (request.method != "GET" && ! head)
        {
            sendText (405, "Method not allowed");
            return;
        }

        const auto& path = request.path;

        if (path == "/" || path == "/index.html")
        {
            sendResponse (200, "text/html; charset=utf-8", BinaryData::player_html,
                          (size_t) BinaryData::player_htmlSize, head);
            return;
        }

        if (path == "/player-worklet.js")
        {
            sendResponse (200, "text/javascript; charset=utf-8", BinaryData::playerworklet_js,
                          (size_t) BinaryData::playerworklet_jsSize, head);
            return;
        }

        // The same Barlow fonts the plugin panel uses, for the page.
        struct FontFile { const char* path; const char* data; int size; };
        const FontFile fonts[] = {
            { "/fonts/BarlowCondensed-Bold.ttf",     BinaryData::BarlowCondensedBold_ttf,     BinaryData::BarlowCondensedBold_ttfSize },
            { "/fonts/BarlowCondensed-SemiBold.ttf", BinaryData::BarlowCondensedSemiBold_ttf, BinaryData::BarlowCondensedSemiBold_ttfSize },
            { "/fonts/Barlow-Medium.ttf",            BinaryData::BarlowMedium_ttf,            BinaryData::BarlowMedium_ttfSize },
            { "/fonts/Barlow-SemiBold.ttf",          BinaryData::BarlowSemiBold_ttf,          BinaryData::BarlowSemiBold_ttfSize },
        };

        for (auto& f : fonts)
        {
            if (path == f.path)
            {
                sendResponse (200, "font/ttf", f.data, (size_t) f.size, head, "public, max-age=86400");
                return;
            }
        }

        if (path == "/info")
        {
            juce::String json;
            json << "{\"name\":\"PhoneTesto\""
                 << ",\"sampleRate\":" << LiveStreamEncoder::outputSampleRate
                 << ",\"channels\":" << LiveStreamEncoder::numChannels
                 << ",\"auth\":" << (server.hasPassword() ? "true" : "false")
                 << ",\"listeners\":" << server.numStreaming.load()
                 << ",\"maxListeners\":" << maxListeners << "}";
            sendResponse (200, "application/json", json.toRawUTF8(), json.getNumBytesAsUTF8(), head);
            return;
        }

        const bool authorised = server.checkPassword (request.query["key"]);

        if (path == "/auth")
        {
            sendResponse (authorised ? 204 : 401, "text/plain", nullptr, 0);
            return;
        }

        if (path != "/stream" && path != "/live.wav")
        {
            sendText (404, "Not found");
            return;
        }

        if (! authorised)
        {
            sendText (401, "Password required");
            return;
        }

        if (head)
        {
            sendStreamHeaders (path == "/live.wav" ? "audio/wav" : "application/octet-stream");
            return;
        }

        if (! acquireListenerSlot())
        {
            sendText (503, "Too many listeners");
            return;
        }

        if (path == "/live.wav")
            streamWav();
        else
            streamFramed (request);
    }

    /** Low-latency stream for the player page: a 16-byte header, then
        packets of [uint32 little-endian length][payload]. A zero-length
        packet is a keep-alive sent while the host isn't processing audio. */
    void streamFramed (const HttpRequest& request)
    {
        const auto fmtParam = request.query["fmt"];
        const auto format = fmtParam == "pcm16" ? StreamFormat::pcm16
                          : fmtParam == "pcm24" ? StreamFormat::pcm24
                                                : StreamFormat::opus;
        const int bitrate = LiveStreamEncoder::clampBitrateKbps (request.query["br"].isEmpty() ? 192
                                                                  : request.query["br"].getIntValue());

        if (! sendStreamHeaders ("application/octet-stream"))
            return;

        juce::MemoryOutputStream header;
        header.write ("PTS1", 4);
        header.writeByte ((char) format);
        header.writeByte ((char) LiveStreamEncoder::numChannels);
        header.writeShort (0);
        header.writeInt (LiveStreamEncoder::outputSampleRate);
        header.writeInt (bitrate);

        if (! sendAll (header.getData(), header.getDataSize()))
            return;

        streamLoop (format, bitrate, true);
    }

    void streamWav()
    {
        if (! sendStreamHeaders ("audio/wav"))
            return;

        juce::MemoryOutputStream header;
        writeLiveWavHeader (header);

        if (! sendAll (header.getData(), header.getDataSize()))
            return;

        streamLoop (StreamFormat::pcm16, 0, false);
    }

    void streamLoop (StreamFormat format, int bitrate, bool framed)
    {
        std::unique_ptr<LiveStreamEncoder> encoder;
        auto ensureEncoder = [&]
        {
            const auto rate = server.getInputSampleRate();
            if (encoder == nullptr || encoder->getInputSampleRate() != rate)
                encoder = std::make_unique<LiveStreamEncoder> (format, rate, bitrate);
            return encoder->isValid();
        };

        if (! ensureEncoder())
            return;

        constexpr int maxChunkFrames = 4096;
        std::vector<float> chunk ((size_t) maxChunkFrames * BroadcastRing::numChannels);
        std::vector<juce::MemoryBlock> packets;
        juce::MemoryOutputStream outgoing;
        auto readPos = server.ring.getWritePosition();
        auto lastSend = juce::Time::getMillisecondCounter();

        auto flush = [&]
        {
            outgoing.reset();

            for (auto& p : packets)
            {
                if (framed)
                    outgoing.writeInt ((int) p.getSize());

                outgoing.write (p.getData(), p.getSize());
            }

            packets.clear();
            return outgoing.getDataSize() == 0 || sendAll (outgoing.getData(), outgoing.getDataSize());
        };

        while (! threadShouldExit() && server.isRunning())
        {
            if (! ensureEncoder())
                return;

            const int n = server.ring.read (readPos, chunk.data(), maxChunkFrames);

            if (n > 0)
            {
                encoder->process (chunk.data(), n, packets);

                if (! packets.empty())
                {
                    if (! flush())
                        return;

                    lastSend = juce::Time::getMillisecondCounter();
                }

                continue;
            }

            // The host isn't calling processBlock (transport stopped in some
            // DAWs, offline, etc.): keep the connection alive so the phone
            // doesn't give up, and so a vanished phone is noticed.
            if (juce::Time::getMillisecondCounter() - lastSend > 500)
            {
                if (framed)
                {
                    const juce::uint8 keepAlive[4] = { 0, 0, 0, 0 };
                    if (! sendAll (keepAlive, sizeof (keepAlive)))
                        return;
                }
                else
                {
                    // A native <audio> element stalls without data, so feed
                    // it real-time silence instead.
                    const int silentFrames = (int) (encoder->getInputSampleRate() * 0.25);
                    std::vector<float> silence ((size_t) silentFrames * BroadcastRing::numChannels, 0.0f);
                    encoder->process (silence.data(), silentFrames, packets);

                    if (! flush())
                        return;
                }

                lastSend = juce::Time::getMillisecondCounter();
            }

            wait (4);
        }
    }

    LiveMonitorServer& server;
    std::unique_ptr<juce::StreamingSocket> socket;
    const juce::String address;
    juce::CriticalSection closeLock;
    std::atomic<bool> streaming { false }, finished { false };
};

//==============================================================================
LiveMonitorServer::LiveMonitorServer() : juce::Thread ("PhoneTesto Live Monitor")
{
    // Allocated once and never reallocated, so the audio thread can never
    // write into a buffer that's being replaced.
    ring.prepare (ringCapacityFrames);
}

LiveMonitorServer::~LiveMonitorServer()
{
    stop();
}

bool LiveMonitorServer::start (int preferredPort, double newInputSampleRate, int portSearchRange)
{
    stop();

    inputSampleRate = newInputSampleRate > 0.0 ? newInputSampleRate : 48000.0;

    const int attempts = preferredPort == 0 ? 1 : juce::jmax (1, portSearchRange);

    for (int i = 0; i < attempts; ++i)
    {
        auto candidate = std::make_unique<juce::StreamingSocket>();

        if (candidate->createListener (preferredPort + i))
        {
            listener = std::move (candidate);
            const int actual = listener->getBoundPort();
            boundPort = actual > 0 ? actual : preferredPort + i;
            break;
        }
    }

    if (listener == nullptr)
        return false;

    running = true;
    startThread();
    return true;
}

void LiveMonitorServer::stop()
{
    running = false;
    signalThreadShouldExit();

    if (listener != nullptr)
        listener->close(); // interrupts the blocking accept()

    stopThread (3000);
    listener.reset();

    juce::OwnedArray<Connection> toStop;
    {
        const juce::ScopedLock sl (connectionsLock);
        toStop.swapWith (connections);
    }

    for (auto* c : toStop)
        c->signalThreadShouldExit();

    // They notice within ~100 ms; anything still running after that is
    // stuck in a blocking send, which closing the socket breaks out of.
    const auto deadline = juce::Time::getMillisecondCounter() + 500;
    for (auto* c : toStop)
        while (c->isThreadRunning() && juce::Time::getMillisecondCounter() < deadline)
            juce::Thread::sleep (5);

    for (auto* c : toStop)
        if (c->isThreadRunning())
            c->forceClose();

    toStop.clear();
    numStreaming = 0;
    boundPort = 0;
}

void LiveMonitorServer::run()
{
    while (! threadShouldExit() && running.load())
    {
        std::unique_ptr<juce::StreamingSocket> accepted (listener->waitForNextConnection());

        if (threadShouldExit() || ! running.load())
            break;

        if (accepted == nullptr)
        {
            wait (50);
            continue;
        }

        reapFinishedConnections();

        const juce::ScopedLock sl (connectionsLock);

        // Bound the number of threads a flood of requests can create.
        if (connections.size() >= maxListeners + 16)
            continue;

        auto* connection = connections.add (new Connection (*this, accepted.release()));
        connection->startThread();
    }
}

void LiveMonitorServer::reapFinishedConnections()
{
    juce::OwnedArray<Connection> finished;
    {
        const juce::ScopedLock sl (connectionsLock);

        for (int i = connections.size(); --i >= 0;)
            if (connections[i]->isFinished())
                finished.add (connections.removeAndReturn (i));
    }
    // destroyed here, outside the lock
}

void LiveMonitorServer::setPassword (const juce::String& newPassword)
{
    const juce::ScopedLock sl (passwordLock);
    password = newPassword;
}

bool LiveMonitorServer::hasPassword() const
{
    const juce::ScopedLock sl (passwordLock);
    return password.isNotEmpty();
}

bool LiveMonitorServer::checkPassword (const juce::String& candidate) const
{
    juce::String expected;
    {
        const juce::ScopedLock sl (passwordLock);
        expected = password;
    }

    if (expected.isEmpty())
        return true;

    // Constant-time comparison, so response timing doesn't leak how much of
    // a guess was right.
    const auto* a = expected.toRawUTF8();
    const auto* b = candidate.toRawUTF8();
    const auto lenA = expected.getNumBytesAsUTF8();
    const auto lenB = candidate.getNumBytesAsUTF8();

    unsigned int diff = (unsigned int) (lenA ^ lenB);
    for (size_t i = 0; i < lenA; ++i)
        diff |= (unsigned int) ((juce::uint8) a[i] ^ (juce::uint8) (i < lenB ? b[i] : 0));

    return diff == 0;
}

int LiveMonitorServer::getNumListeners() const
{
    return numStreaming.load();
}

juce::StringArray LiveMonitorServer::getListenerAddresses() const
{
    juce::StringArray result;
    const juce::ScopedLock sl (connectionsLock);

    for (auto* c : connections)
        if (c->isStreaming())
            result.add (c->getAddress());

    return result;
}

juce::StringArray LiveMonitorServer::getLocalAddresses()
{
    // Rank so the address a phone on home/studio Wi-Fi can actually reach
    // comes first, ahead of VPN / virtual-machine adapters.
    auto rank = [] (const juce::String& s)
    {
        if (s.startsWith ("192.168.")) return 0;
        if (s.startsWith ("10."))      return 1;

        if (s.startsWith ("172."))
        {
            const int second = s.fromFirstOccurrenceOf (".", false, false).getIntValue();
            if (second >= 16 && second <= 31)
                return 2;
        }

        return 3;
    };

    juce::StringArray candidates;

    for (auto& addr : juce::IPAddress::getAllAddresses (false))
    {
        const auto s = addr.toString();

        if (s.startsWith ("127.") || s.startsWith ("169.254.") || s == "0.0.0.0")
            continue;

        candidates.addIfNotAlreadyThere (s);
    }

    std::stable_sort (candidates.begin(), candidates.end(),
                      [&] (const juce::String& a, const juce::String& b) { return rank (a) < rank (b); });

    return candidates;
}

void LiveMonitorServer::pushAudio (const juce::AudioBuffer<float>& buffer) noexcept
{
    if (running.load (std::memory_order_relaxed) && numStreaming.load (std::memory_order_relaxed) > 0)
        ring.write (buffer);
}

} // namespace phonetesto
