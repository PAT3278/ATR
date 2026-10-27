# PhoneTesto (working title)

An audio effect plugin for monitoring a mix the way it would sound on a
phone, without bouncing audio and transferring it to a physical device
every time. It does this two ways:

1. **Emulate** — DSP that approximates a given phone/laptop speaker's
   frequency response and drive character, so you can hear an approximation
   through your studio monitors or headphones.
2. **Live Monitor** — streams the actual audio to a real phone over your
   local Wi-Fi network, so you hear it through that phone's real speaker
   instead of a simulation of one.

Insert it on your master bus (or any track) and pick whichever mode fits.

## Emulate mode

Pick a device, and the plugin applies that device's approximate speaker
coloration in real time:

- **Bass roll-off** — a steep highpass (two cascaded 2nd-order stages, ~24 dB/oct)
  standing in for the bass a tiny driver physically can't reproduce.
- **Resonance bump** — a peaking filter around the enclosure's characteristic
  resonance frequency.
- **Top-end roll-off** — a lowpass for the driver's high-frequency limit.
- **Drive/saturation** — a `tanh` waveshaper standing in for the audible
  breakup/compression small drivers exhibit at normal listening levels.
- **Mono sum** (optional) — many phone speakers are effectively narrow/mono;
  toggle this to sum L/R before the speaker chain.
- **Mix** and **Output** — blend wet/dry and compensate output level.

This is **not** a calibrated impulse-response model — the filter/drive
values in `Source/SpeakerProfiles.h` are hand-tuned approximations. If real
measured impulse responses become available (device + mic + calibrated
level), adding a convolution stage per profile is the natural next step.

The editor is drawn as a phone body (device-specific notch/Dynamic
Island/home-button chrome, accent colour per profile) with an iOS-style
volume HUD on the left and the Mix control as a knob set into the "screen".

## Live Monitor mode

Toggle **Live** (bottom-right of the panel) and the plugin:

1. Opens a small embedded HTTP server on your computer (default port
   `51813`).
2. Shows the URL to open, e.g. `http://192.168.1.23:51813`, and whether a
   phone is currently connected.
3. On your phone, **on the same Wi-Fi network**, open that URL in Safari.
   It streams live as an (effectively) endless WAV file — the same trick
   classic internet-radio (Icecast/Shoutcast) streams use, so no app or
   extra codec license is needed on either end.
4. While Live Monitor is on, the Emulate DSP is skipped (the real phone
   does the speaker colouring itself) and a clean signal is sent both to
   your DAW's output and to the stream, so what you hear in the room
   matches what's being sent to the phone.

**Caveats**, since this hasn't been tested against a real iPhone/Safari in
this environment (verified instead with an automated test that connects a
plain socket client and checks the bytes — see Testing below):
- Native support for an *indefinite-length* WAV stream varies by player.
  If Safari doesn't play it smoothly, try the free **VLC** app from the
  App Store pointed at the same URL instead — it's built for exactly this
  kind of live stream.
- Expect on the order of hundreds of ms to a couple of seconds of latency
  (network + buffering), so this is for checking the overall sound, not
  for playing/performing in time against it.
- Only one phone is expected to connect at a time; a new connection
  replaces the previous one.
- Your computer and phone must be on the same local network, and nothing
  (firewall, VPN, guest Wi-Fi client isolation) may block the connection.

## Building

Requires CMake ≥ 3.22 and a C++17 compiler. JUCE is fetched automatically
via `FetchContent` — no manual JUCE install or submodule needed.

```sh
cmake -B build
cmake --build build --config Release -j
```

Produces (in `build/PhoneTesto_artefacts/Release/`):
- `VST3/PhoneTesto.vst3`
- `Standalone/PhoneTesto` (or `.app` on macOS)
- `AU/` (macOS only — built automatically when `FORMATS` includes `AU`)

### AAX

AAX requires Avid's proprietary SDK, which cannot be bundled here. If you
have access to it (via the [Avid Developer
Program](https://developer.avid.com)), point CMake at it and re-run
configure — the AAX target is added automatically:

```sh
cmake -B build -DJUCE_AAX_SDK_PATH=/path/to/AAX_SDK
```

## Testing

Two headless sanity checks (no audio device or GUI required):

```sh
cmake --build build --target PhoneTestoDspTest -j
./build/PhoneTestoDspTest
```
Runs white noise and an impulse through every speaker profile (Emulate
mode) and verifies the output stays finite and at a sane level.

```sh
cmake --build build --target PhoneTestoLiveServerTest -j
./build/PhoneTestoLiveServerTest
```
Starts the Live Monitor server, connects a plain socket client standing in
for a phone's browser, pushes synthetic audio, and checks that a valid
HTTP+WAV header and a growing stream of PCM bytes actually arrive.

For real-world verification: load the built VST3/AU in a DAW; for Emulate
mode, A/B the device profiles against a real phone speaker if one is
available; for Live Monitor, connect an actual phone and confirm Safari (or
VLC) plays the stream.

## Project layout

```
CMakeLists.txt          JUCE plugin target (VST3/AU/Standalone, optional AAX)
Source/
  PluginProcessor.h/.cpp   Audio processing: parameters, speaker DSP chain, Live Monitor wiring
  PluginEditor.h/.cpp      GUI: phone-body panel, device picker, mix, output, mono/bypass/live toggles
  PhoneUILookAndFeel.h/.cpp  Custom-styled controls (volume HUD, mix knob, toggles, preset box)
  SpeakerProfiles.h        Per-device filter/drive parameter tables + editor chrome style
  LiveMonitorServer.h/.cpp HTTP/WAV streaming server for Live Monitor mode
Tests/
  DspTest.cpp              Headless DSP sanity test (Emulate mode)
  LiveServerTest.cpp       Headless streaming sanity test (Live Monitor mode)
```

## Roadmap

- [ ] Real measured impulse responses per device, layered in as an optional
      convolution stage alongside the current EQ/saturation model.
- [ ] More device profiles (additional Android flagships, tablets, TVs).
- [ ] A/B bypass shortcut and preset save/recall in the host.
- [ ] Verify Live Monitor against a real iPhone's Safari; if it doesn't
      play the indefinite-length WAV smoothly, consider an MP3 encode (via
      an externally-supplied LAME, for licensing reasons) as a fallback
      stream format.
