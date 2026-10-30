// Product-level checks on the audio path, run headless on the real
// processor (no DAW, audio device or GUI needed):
//
//  * level match  -- pink noise at -18 dBFS RMS comes out at the same
//                    K-weighted loudness (+-1 dB) through every model, at
//                    44.1/48/96 kHz, and never clips; so A/B against bypass
//                    compares tone, not level
//  * no clicks    -- switching model, toggling bypass/mono, and jumping the
//                    mix/output knobs mid-tone stay smooth (second-difference
//                    spikes vs. the steady state before/after)
//  * bypass       -- transparent: output == input (latency-aligned)
//  * robustness   -- odd/oversized host block sizes, silence stays silent,
//                    output decays after loud input
//  * state        -- parameters and the Live password survive save/restore
//  * Live access  -- Live always needs a code (auto or the user's password);
//                    offline exports aren't streamed
//  * CPU          -- worst case (mid model-crossfade, both chains running)
//                    stays a small fraction of real time
#include "../Source/PluginProcessor.h"

#include <cmath>
#include <cstdio>
#include <functional>
#include <random>
#include <string>
#include <vector>

using namespace phonetesto;

namespace
{
int failures = 0;

void check (bool ok, const std::string& what)
{
    std::printf ("  [%s] %s\n", ok ? " ok " : "FAIL", what.c_str());
    if (! ok)
        ++failures;
}

void setParam (PhoneTestoAudioProcessor& p, const char* id, float value)
{
    auto* param = p.apvts.getParameter (id);
    param->setValueNotifyingHost (param->convertTo0to1 (value));
}

std::unique_ptr<PhoneTestoAudioProcessor> makeProcessor (double rate, int block)
{
    auto p = std::make_unique<PhoneTestoAudioProcessor>();
    p->setPlayConfigDetails (2, 2, rate, block);
    p->prepareToPlay (rate, block);
    setParam (*p, PhoneTestoAudioProcessor::outputParamId, 100.0f); // unity, so levels are comparable
    return p;
}

/** Pink noise (Paul Kellet's filter), independent per channel, scaled to
    a given RMS (measured, not assumed). */
struct Pink
{
    explicit Pink (double targetRmsDb = -18.0)
    {
        Pink probe (0);
        double sum = 0.0;
        for (int i = 0; i < 200000; ++i) { const double v = probe.raw (0); sum += v * v; }
        scale = (float) (std::pow (10.0, targetRmsDb / 20.0) / std::sqrt (sum / 200000.0));
    }

    float next (int ch) { return raw (ch) * scale; }

private:
    explicit Pink (int) {}

    float raw (int ch)
    {
        auto& s = b[ch];
        const float w = white (rng[ch]);
        s[0] = 0.99886f * s[0] + w * 0.0555179f;
        s[1] = 0.99332f * s[1] + w * 0.0750759f;
        s[2] = 0.96900f * s[2] + w * 0.1538520f;
        s[3] = 0.86650f * s[3] + w * 0.3104856f;
        s[4] = 0.55000f * s[4] + w * 0.5329522f;
        s[5] = -0.7616f * s[5] - w * 0.0168980f;
        const float out = s[0] + s[1] + s[2] + s[3] + s[4] + s[5] + s[6] + w * 0.5362f;
        s[6] = w * 0.115926f;
        return out;
    }

    std::mt19937 rng[2] { std::mt19937 (7), std::mt19937 (11) };
    std::normal_distribution<float> white { 0.0f, 1.0f };
    float b[2][7] {};
    float scale = 1.0f;
};

/** Loudness as BS.1770 measures it (K-weighting: a +4 dB high shelf and a
    38 Hz high-pass, then mean square), so the level match reflects what
    the ear compares rather than raw RMS, which bass dominates. */
double kWeightedDb (const std::vector<float>& x, size_t from, double rate)
{
    using C = juce::dsp::IIR::Coefficients<double>;
    const auto shelf = C::makeHighShelf (rate, 1681.97, 0.7072, std::pow (10.0, 4.0 / 20.0));
    const auto hp = C::makeHighPass (rate, 38.13, 0.5003);
    juce::dsp::IIR::Filter<double> f1 (shelf), f2 (hp);
    double sum = 0.0;
    for (size_t i = 0; i < x.size(); ++i)
    {
        const double y = f2.processSample (f1.processSample ((double) x[i]));
        if (i >= from)
            sum += y * y;
    }
    return 10.0 * std::log10 (sum / (double) (x.size() - from) + 1e-30);
}

/** Runs `seconds` of a generated signal through the processor in blocks,
    calling `event` once at `eventAt` seconds; returns the output (L,R). */
std::vector<float> run (PhoneTestoAudioProcessor& p, double rate, int block, double seconds,
                        const std::function<float (int ch, int n)>& gen,
                        double eventAt = -1.0, const std::function<void()>& event = {},
                        std::vector<float>* rightOut = nullptr)
{
    const int total = (int) (seconds * rate);
    std::vector<float> left;
    left.reserve ((size_t) total);
    juce::AudioBuffer<float> buf (2, block);
    juce::MidiBuffer midi;
    bool fired = false;

    for (int start = 0; start < total; start += block)
    {
        const int n = std::min (block, total - start);
        buf.setSize (2, n, false, false, true);

        if (! fired && eventAt >= 0.0 && start >= (int) (eventAt * rate))
        {
            event();
            fired = true;
        }

        for (int ch = 0; ch < 2; ++ch)
            for (int i = 0; i < n; ++i)
                buf.setSample (ch, i, gen (ch, start + i));

        p.processBlock (buf, midi);

        for (int i = 0; i < n; ++i)
        {
            left.push_back (buf.getSample (0, i));
            if (rightOut != nullptr)
                rightOut->push_back (buf.getSample (1, i));
        }
    }

    return left;
}

double rmsDb (const std::vector<float>& x, size_t from, size_t to)
{
    double sum = 0.0;
    for (size_t i = from; i < to; ++i)
        sum += (double) x[i] * x[i];
    return 10.0 * std::log10 (sum / (double) (to - from) + 1e-30);
}

float peakOf (const std::vector<float>& x, size_t from = 0, size_t to = SIZE_MAX)
{
    float pk = 0.0f;
    for (size_t i = from; i < std::min (to, x.size()); ++i)
        pk = std::max (pk, std::abs (x[i]));
    return pk;
}

/** Largest |second difference|: a smooth signal's is small and steady; a
    click or step shows up as a spike. */
float maxCurvature (const std::vector<float>& x, size_t from, size_t to)
{
    float m = 0.0f;
    for (size_t i = std::max<size_t> (from, 2); i < std::min (to, x.size()); ++i)
        m = std::max (m, std::abs (x[i] - 2.0f * x[i - 1] + x[i - 2]));
    return m;
}

void checkSmooth (const std::string& what, double rate, int block,
                  const std::function<void (PhoneTestoAudioProcessor&)>& before,
                  const std::function<void (PhoneTestoAudioProcessor&)>& change,
                  bool stereoTones = false)
{
    auto p = makeProcessor (rate, block);
    before (*p);
    auto tone = [&] (int ch, int n)
    {
        const double hz = (stereoTones && ch == 1) ? 660.0 : 440.0;
        return (float) (0.25 * std::sin (2.0 * juce::MathConstants<double>::pi * hz * n / rate));
    };
    const auto out = run (*p, rate, block, 1.2, tone, 0.6, [&] { change (*p); });
    const auto at = [&] (double s) { return (size_t) (s * rate); };

    const float steady = std::max (maxCurvature (out, at (0.3), at (0.6)), maxCurvature (out, at (0.9), at (1.2)));
    const float during = maxCurvature (out, at (0.6), at (0.75));

    char buf[200];
    std::snprintf (buf, sizeof (buf), "%s: no click (spike %.4f vs steady %.4f)", what.c_str(), during, steady);
    check (during <= steady * 1.35f + 1.0e-4f, buf);
}
} // namespace

int main()
{
    const auto& profiles = getSpeakerProfiles();

    std::printf ("Level match: pink noise at -18 dBFS RMS, output knob at 100%%\n");
    for (double rate : { 44100.0, 48000.0, 96000.0 })
    {
        for (int m = 0; m < (int) profiles.size(); ++m)
        {
            auto p = makeProcessor (rate, 512);
            setParam (*p, PhoneTestoAudioProcessor::deviceParamId, (float) m);

            Pink pink;
            std::vector<float> in;
            auto gen = [&] (int ch, int) { const float v = pink.next (ch); if (ch == 0) in.push_back (v); return v; };
            const auto out = run (*p, rate, 512, 3.0, gen);

            const size_t from = (size_t) (0.5 * rate);
            const double inLk = kWeightedDb (in, from, rate), outLk = kWeightedDb (out, from, rate);
            const float outPeak = peakOf (out, from), inPeak = peakOf (in, from);

            char buf[220];
            std::snprintf (buf, sizeof (buf), "%5.1f kHz %-17s loudness %+.2f dB (K-wtd), RMS %+.1f dB, peak %.1f dBFS (in %.1f)",
                           rate / 1000.0, profiles[(size_t) m].name, outLk - inLk, rmsDb (out, from, out.size()) - rmsDb (in, from, in.size()),
                           20.0 * std::log10 (outPeak + 1e-9), 20.0 * std::log10 (inPeak + 1e-9));
            check (std::abs (outLk - inLk) <= 1.0 && outPeak < 1.0f, buf);
        }
    }

    std::printf ("No clicks on changes (440 Hz tone at -12 dBFS)\n");
    for (double rate : { 44100.0, 96000.0 })
    {
        const auto r = juce::String (rate / 1000.0, 1).toStdString() + " kHz ";
        checkSmooth (r + "model SE -> Android Budget", rate, 512,
                     [] (auto&) {}, [] (auto& p) { setParam (p, PhoneTestoAudioProcessor::deviceParamId, 4.0f); });
        checkSmooth (r + "model Laptop -> Phone SE", rate, 512,
                     [] (auto& p) { setParam (p, PhoneTestoAudioProcessor::deviceParamId, 6.0f); },
                     [] (auto& p) { setParam (p, PhoneTestoAudioProcessor::deviceParamId, 0.0f); });
        checkSmooth (r + "bypass on", rate, 512, [] (auto&) {}, [] (auto& p) { setParam (p, PhoneTestoAudioProcessor::bypassParamId, 1.0f); });
        checkSmooth (r + "bypass off", rate, 512, [] (auto& p) { setParam (p, PhoneTestoAudioProcessor::bypassParamId, 1.0f); },
                     [] (auto& p) { setParam (p, PhoneTestoAudioProcessor::bypassParamId, 0.0f); });
        checkSmooth (r + "output 100% -> 20%", rate, 512, [] (auto&) {}, [] (auto& p) { setParam (p, PhoneTestoAudioProcessor::outputParamId, 20.0f); });
        checkSmooth (r + "mix 100% -> 0%", rate, 512, [] (auto&) {}, [] (auto& p) { setParam (p, PhoneTestoAudioProcessor::mixParamId, 0.0f); });
        checkSmooth (r + "mono sum on (L 440 / R 660 Hz)", rate, 512, [] (auto&) {},
                     [] (auto& p) { setParam (p, PhoneTestoAudioProcessor::monoParamId, 1.0f); }, true);
    }

    std::printf ("Latency\n");
    {
        PhoneTestoAudioProcessor fresh;
        const int atLoad = fresh.getLatencySamples();
        fresh.setPlayConfigDetails (2, 2, 96000.0, 64);
        fresh.prepareToPlay (96000.0, 64);
        check (atLoad > 0 && atLoad == fresh.getLatencySamples(),
               "latency reported at load (" + std::to_string (atLoad) + ") equals latency after prepare ("
                   + std::to_string (fresh.getLatencySamples()) + "), so hosts never see it change");
    }

    std::printf ("Bypass is transparent\n");
    {
        auto p = makeProcessor (48000.0, 256);
        setParam (*p, PhoneTestoAudioProcessor::bypassParamId, 1.0f);
        setParam (*p, PhoneTestoAudioProcessor::outputParamId, 37.0f); // must not matter when bypassed
        Pink pink;
        std::vector<float> in;
        auto gen = [&] (int ch, int) { const float v = pink.next (ch); if (ch == 0) in.push_back (v); return v; };
        const auto out = run (*p, 48000.0, 256, 1.0, gen);
        const int latency = p->getLatencySamples();

        float maxErr = 0.0f;
        for (size_t i = 24000; i < out.size(); ++i)
            maxErr = std::max (maxErr, std::abs (out[i] - in[i - (size_t) latency]));

        char buf[160];
        std::snprintf (buf, sizeof (buf), "bypassed output == input delayed by reported latency (%d samples); max error %.2e", latency, maxErr);
        check (maxErr < 1.0e-6f, buf);
    }

    std::printf ("Robustness\n");
    {
        bool finite = true;
        auto p = makeProcessor (48000.0, 512);
        setParam (*p, PhoneTestoAudioProcessor::deviceParamId, 4.0f);
        Pink pink;
        int n = 0;
        // odd sizes, a 1-sample block, and blocks bigger than prepareToPlay promised
        for (int block : { 1, 13, 64, 511, 512, 2048, 8192, 7, 1000 })
        {
            juce::AudioBuffer<float> buf (2, block);
            juce::MidiBuffer midi;
            for (int ch = 0; ch < 2; ++ch)
                for (int i = 0; i < block; ++i)
                    buf.setSample (ch, i, pink.next (ch));
            p->processBlock (buf, midi);
            for (int ch = 0; ch < 2; ++ch)
                for (int i = 0; i < block; ++i)
                    finite &= std::isfinite (buf.getSample (ch, i));
            n += block;
        }
        check (finite, "odd and oversized host block sizes: output finite (" + std::to_string (n) + " samples)");

        auto q = makeProcessor (48000.0, 512);
        const auto silent = run (*q, 48000.0, 512, 0.5, [] (int, int) { return 0.0f; });
        check (juce::exactlyEqual (peakOf (silent), 0.0f), "silence in -> exact silence out");

        auto r = makeProcessor (48000.0, 512);
        setParam (*r, PhoneTestoAudioProcessor::deviceParamId, 4.0f);
        const auto decay = run (*r, 48000.0, 512, 1.5, [&] (int ch, int i) { return i < 24000 ? pink.next (ch) * 4.0f : 0.0f; });
        check (peakOf (decay, 48000) < 1.0e-5f, "output dies away after loud input stops (no ringing / stuck state)");
    }

    std::printf ("CPU\n");
    {
        auto p = makeProcessor (48000.0, 256);
        Pink pink;
        juce::AudioBuffer<float> buf (2, 256);
        juce::MidiBuffer midi;
        const int blocks = 48000 * 10 / 256;
        double busy = 0.0;

        for (int b = 0; b < blocks; ++b)
        {
            if (b % 8 == 0) // keep a model crossfade running nearly all the time
                setParam (*p, PhoneTestoAudioProcessor::deviceParamId, (float) ((b / 8) % 8));
            for (int ch = 0; ch < 2; ++ch)
                for (int i = 0; i < 256; ++i)
                    buf.setSample (ch, i, pink.next (ch));
            const auto t0 = juce::Time::getHighResolutionTicks();
            p->processBlock (buf, midi);
            busy += juce::Time::highResolutionTicksToSeconds (juce::Time::getHighResolutionTicks() - t0);
        }

        char line[120];
        std::snprintf (line, sizeof (line), "48 kHz stereo, constant model switching: %.2f%% of one core in real time", 100.0 * busy / 10.0);
        check (busy / 10.0 < 0.05, line);
    }

    std::printf ("State save / restore\n");
    {
        auto a = makeProcessor (48000.0, 512);
        setParam (*a, PhoneTestoAudioProcessor::deviceParamId, 5.0f);
        setParam (*a, PhoneTestoAudioProcessor::mixParamId, 42.0f);
        setParam (*a, PhoneTestoAudioProcessor::outputParamId, 61.0f);
        setParam (*a, PhoneTestoAudioProcessor::monoParamId, 1.0f);
        a->setLivePassword ("pass word 123");
        a->setEditorScale (1.25f);
        a->setEditorSkin (0);
        juce::MemoryBlock state;
        a->getStateInformation (state);

        auto b = makeProcessor (48000.0, 512);
        check (b->getEditorSkin() == 1, "new instances open in the DIGITAL skin");
        b->setStateInformation (state.getData(), (int) state.getSize());
        check (std::abs (b->getEditorScale() - 1.25f) < 0.001f && b->getEditorSkin() == 0,
               "editor size and skin restored");
        check (! b->apvts.copyState().hasProperty ("editorSkin") && ! b->apvts.copyState().hasProperty ("editorScale"),
               "editor settings aren't left in the parameter tree");
        auto value = [&] (const char* id) { return b->apvts.getParameter (id)->convertFrom0to1 (b->apvts.getParameter (id)->getValue()); };
        check (juce::roundToInt (value (PhoneTestoAudioProcessor::deviceParamId)) == 5
                   && std::abs (value (PhoneTestoAudioProcessor::mixParamId) - 42.0f) < 0.01f
                   && std::abs (value (PhoneTestoAudioProcessor::outputParamId) - 61.0f) < 0.01f
                   && value (PhoneTestoAudioProcessor::monoParamId) > 0.5f,
               "parameters restored");
        check (b->getLivePassword() == "pass word 123", "Live password restored");

        b->setStateInformation ("garbage", 7);
        check (b->getLivePassword() == "pass word 123", "corrupt state blob is ignored, not applied");
    }

    std::printf ("Live access code\n");
    {
        auto a = makeProcessor (48000.0, 512);
        auto b = makeProcessor (48000.0, 512);
        const auto code = a->getAutoAccessCode();
        check (code.length() == 8 && code != b->getAutoAccessCode(), "each plugin instance gets its own random 8-character code");
        check (a->getLiveAccessCode() == code, "with no password set, phones use the auto code");

        check (a->startLiveMonitor (0), "Live starts");
        const auto url = a->getLiveMonitorUrl();
        check (url.endsWith ("/?k=" + code), "QR URL carries the code: " + url.toStdString());

        auto status = [&] (const juce::String& target)
        {
            juce::StreamingSocket sock;
            if (! sock.connect ("127.0.0.1", a->getLiveMonitorPort(), 2000))
                return -1;
            const auto req = "GET " + target + " HTTP/1.1\r\nHost: x\r\n\r\n";
            sock.write (req.toRawUTF8(), (int) req.getNumBytesAsUTF8());
            char head[16] = {};
            int got = 0;
            while (got < 12 && sock.waitUntilReady (true, 2000) == 1)
            {
                const int r = sock.read (head + got, 12 - got, false);
                if (r <= 0) break;
                got += r;
            }
            return juce::String (head + 9, 3).getIntValue();
        };

        check (status ("/stream?fmt=pcm16") == 401, "stream without the code is refused, even with no password set");
        check (status ("/auth?key=" + code) == 204, "the code from the QR URL is accepted");

        a->setLivePassword ("hunter2");
        check (a->getLiveMonitorUrl().endsWith ("/?k=hunter2") && status ("/auth?key=" + code) == 401
                   && status ("/auth?key=hunter2") == 204,
               "a user password replaces the auto code (URL and server)");

        // An export renders faster than real time; that must not be streamed.
        {
            juce::StreamingSocket sock;
            sock.connect ("127.0.0.1", a->getLiveMonitorPort(), 2000);
            const juce::String req ("GET /stream?fmt=pcm16&key=hunter2 HTTP/1.1\r\nHost: x\r\n\r\n");
            sock.write (req.toRawUTF8(), (int) req.getNumBytesAsUTF8());

            auto drain = [&]
            {
                std::vector<char> scratch (65536);
                int total = 0;
                while (sock.waitUntilReady (true, 300) == 1)
                {
                    const int r = sock.read (scratch.data(), (int) scratch.size(), false);
                    if (r <= 0) break;
                    total += r;
                }
                return total;
            };

            auto render = [&] (bool offline)
            {
                a->setNonRealtime (offline);
                juce::AudioBuffer<float> block (2, 512);
                juce::MidiBuffer midi;
                for (int i = 0; i < 94; ++i) // ~1 s
                {
                    for (int ch = 0; ch < 2; ++ch)
                        for (int s = 0; s < 512; ++s)
                            block.setSample (ch, s, 0.25f * (float) std::sin (0.06 * s));
                    a->processBlock (block, midi);
                }
                return drain();
            };

            drain(); // response header
            const int offlineBytes = render (true);
            const int realtimeBytes = render (false);
            check (offlineBytes < 4096 && realtimeBytes > 150000,
                   "offline export isn't streamed (" + std::to_string (offlineBytes) + " bytes offline, "
                       + std::to_string (realtimeBytes) + " for 1 s in real time)");
        }
        a->stopLiveMonitor();
    }

    if (failures > 0)
    {
        std::printf ("\nFAILED: %d check(s)\n", failures);
        return 1;
    }

    std::printf ("\nAll DSP checks passed.\n");
    return 0;
}
