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

Insert PhoneTesto as the **last plugin on your master bus**, toggle **Live**
(bottom-right of the panel), and the plugin's screen turns into a QR code:

1. A small server starts inside the plugin (port `51813`, or the next free
   one).
2. **Scan the QR code** with the phone's camera (or type the URL shown under
   it). The phone must be on the **same Wi-Fi** as the computer.
3. The player page opens in the phone's browser — no app to install. Tap
   ▶ to listen.

What you get:

- **Up to 32 phones at once**, each picking its own settings.
- **Quality (per phone)**: PCM 24-bit or PCM 16-bit (lossless, default), or
  Opus 96–320 kbps if the Wi-Fi is weak. Everything is sent at 48 kHz; a
  host sample-rate change doesn't disconnect anyone.
- **Two playback modes on the phone**:
  - *Low latency* (default): about 0.1–0.3 s behind the DAW, with a "keep
    screen on" option. Needs the page open and the screen on.
  - *Screen-off*: hands the stream to the phone's own media player so it
    keeps playing with the screen locked. About 1–3 s behind; 16-bit only.
- **Optional password** (field above the QR code, saved with the project).
  Phones are asked for it before they can listen. Leave it empty for no
  password.
- **Listener count** in the plugin, and automatic reconnect on the phone if
  the plugin restarts.
- While Live is on, the Emulate DSP is skipped (the real phone does the
  speaker colouring itself), so your monitors and the phones hear the same
  clean signal. Mix/preset/mono/bypass are dimmed because they don't apply.

**Status of testing.** The streaming server is tested with plain socket
clients that decode every format and check pitch and level, and the player
page is tested in a real browser (Chromium on a phone-sized screen,
including the screen-off mode and password flow) — see Testing. It has
**not** been tried on a real iPhone/Safari yet, which has its own audio
rules, so treat iOS behaviour (especially screen-off mode) as unconfirmed
until you try it.

**If the phone can't connect / hears nothing:**
- Same Wi-Fi network for both; turn off VPN; guest or "client isolation"
  Wi-Fi networks block device-to-device traffic.
- **Windows**: allow your DAW (e.g. FL Studio) through Windows Defender
  Firewall for *private* networks when prompted the first time Live is
  switched on.
- **macOS**: allow the DAW under System Settings → Privacy & Security →
  Local Network, and in the firewall if it's enabled.
- iPhone: turn the volume up and check the silent switch.

Latency means this is for checking how the mix sounds, not for playing in
time against it.

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

```sh
cmake --build build -j
./build/PhoneTestoDspTest
./build/PhoneTestoLiveServerTest
node Tests/browser/player_test.mjs build/PhoneTestoLiveDemo
xvfb-run -a build/PhoneTestoEditorSnapshot shots   # or run directly with a display
```

- **PhoneTestoDspTest** — white noise and an impulse through every speaker
  profile (Emulate mode); output must stay finite and at a sane level.
- **PhoneTestoLiveServerTest** — the streaming server with plain socket
  clients standing in for phones, fed a 440 Hz tone at 44.1 kHz. Decodes
  PCM16, PCM24, Opus and the WAV stream and checks pitch (440 Hz, so the
  48 kHz resampling is right) and level; three formats at once; a host
  sample-rate change mid-stream; the 32-listener cap; passwords (including
  non-ASCII); abrupt hang-ups (which must not crash the host); and a fast
  stop() with 32 phones connected.
- **player_test.mjs** — the real player page in Playwright Chromium on a
  phone-sized screen against `PhoneTestoLiveDemo`'s test tone: presses
  Play for every quality and checks the decoded level, the screen-off mode,
  the password flow, and auto-reconnect when the plugin goes away and comes
  back. Chromium isn't iPhone Safari — see the Live Monitor caveats.
- **PhoneTestoEditorSnapshot** — renders the editor (Emulate and Live) to
  PNGs for checking the layout.
- **PhoneTestoLiveDemo** — runs the server on its own with a test tone, so
  you can try the phone page without a DAW
  (`build/PhoneTestoLiveDemo --port 51813`, then open the printed URL on
  your phone).

## Project layout

```
CMakeLists.txt             JUCE plugin target (VST3/AU/Standalone, optional AAX) + deps
Resources/
  player.html              The phone-side player page (embedded into the plugin)
Source/
  PluginProcessor.h/.cpp   Parameters, speaker DSP chain, Live Monitor wiring
  PluginEditor.h/.cpp      Phone-body panel: presets, mix, volume, toggles, Live QR screen
  PhoneUILookAndFeel.h/.cpp  Custom-styled controls (volume HUD, mix knob, toggles, preset box)
  SpeakerProfiles.h        Per-device filter/drive tables + editor chrome style
  LiveMonitorServer.h/.cpp Embedded HTTP server, listener threads, lock-free broadcast ring
  LiveStreamEncoder.h/.cpp Per-listener 48 kHz resampling + PCM16/PCM24/Opus packetising
  QrCodeComponent.h/.cpp   Draws the "scan to listen" QR code
Tests/
  DspTest.cpp              Emulate-mode DSP sanity test
  LiveServerTest.cpp       Streaming server protocol/audio test
  LiveDemo.cpp             Stand-alone server with a test tone
  EditorSnapshot.cpp       Renders the editor to PNG
  browser/player_test.mjs  In-browser player test (Playwright)
```

## Third-party code

- [JUCE](https://juce.com) — AGPLv3 / commercial licence.
- [libopus](https://opus-codec.org) — BSD 3-Clause.
- [QR Code generator](https://www.nayuki.io/page/qr-code-generator-library)
  by Project Nayuki — MIT.

All are fetched at configure time; nothing is vendored in this repo.

## Roadmap

- [ ] Real measured impulse responses per device, layered in as an optional
      convolution stage alongside the current EQ/saturation model.
- [ ] More device profiles (additional Android flagships, tablets, TVs).
- [ ] A/B bypass shortcut and preset save/recall in the host.
- [ ] Try Live Monitor on a real iPhone (Safari) and Android (Chrome),
      especially screen-off mode, and adjust for anything iOS-specific.
- [ ] Streaming over the internet (not just local Wi-Fi), e.g. to send a
      mix-in-progress to someone elsewhere.
