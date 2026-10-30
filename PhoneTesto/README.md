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
- **Mix** and **Output** — blend wet/dry and trim the output (100 % = unity,
  the default).

Built for A/B-ing during a mix:

- **Loudness-matched.** Every model is trimmed to the same perceived level
  as the input (K-weighted, as in loudness meters), so switching models or
  toggling bypass compares *tone*, not level, and nothing clips at 0 dBFS.
- **Click-free.** Model changes crossfade between two complete speaker
  chains; bypass, mono, mix, output and Live are smoothed. All of them can
  be switched or automated during playback.
- **Transparent bypass.** BYPASS is the host's bypass too (FL Studio,
  Ableton, Logic… use it instead of hard-switching the plugin out). It is
  bit-exact to the input, delayed by the plugin's latency, so there's no
  timing jump either.
- **Latency: 4 samples** (from the 2× oversampled saturator), reported to the
  host for delay compensation.
- Real-time safe: no allocation or locking on the audio thread; about 1 % of
  one core.

> **Before exporting your final mix**, bypass PhoneTesto (or remove it) if
> it's on the master bus — like any monitoring plugin there, Emulate would
> otherwise be printed into the export. In Live mode the plugin passes audio
> through unchanged, and it doesn't stream to phones while the DAW renders
> an export.

This is **not** a calibrated impulse-response model — the filter/drive
values in `Source/SpeakerProfiles.h` are hand-tuned approximations. If real
measured impulse responses become available (device + mic + calibrated
level), adding a convolution stage per profile is the natural next step.

## The panel

A modern, flat hardware-style panel (graphite, one orange accent, LED
indicators):

- **Display** — plots the selected model's frequency response; with Live on
  it shows the QR code, address, password and how many phones are listening.
- **MODEL** — eight pads under the display; the lit one is active.
- **Meter** — stereo LED meter on the output (−60…0 dBFS) with peak hold and
  a numeric peak readout per side.
- **MIX** / **OUTPUT** knobs with their values shown underneath;
  double-click to reset.
- **MONO**, **BYPASS** and **ON AIR** (Live) buttons; the header shows
  EMULATE or ON AIR with the number of phones listening.

Drag the window's corner to resize; the whole panel scales, and the size is
saved with the project. Fonts are Barlow / Barlow Condensed, embedded in the
plugin.

### Skins

The **SKIN** button in the header switches between two looks (saved with
the project):

- **DIGITAL** (default for now, while it's being tried out) — a 2000s
  games-console interface: deep navy with slowly moving light waves and
  drifting particles, glass panels with glowing cyan edges, device icons on
  the MODEL pads, PT Digital type for the logo and numbers.
- **FLAT** — the modern flat hardware panel described above.

The waves animate at 15 fps and only their band of the window is redrawn
(everything over it comes from cached images): about 4 ms per frame at
125 % size in JUCE's software renderer, i.e. ~6 % of one CPU core while
the window is open — less on Windows and macOS, which draw faster. FLAT
redraws nothing while idle. `PhoneTestoEditorSnapshot` prints these
timings.

## Live Monitor mode

Insert PhoneTesto as the **last plugin on your master bus**, press **ON AIR**
(bottom-right of the panel), and the display shows a QR code:

1. A small server starts inside the plugin (port `51813`, or the next free
   one).
2. **Scan the QR code** with the phone's camera (or type the URL shown under
   it). The phone must be on the **same Wi-Fi** as the computer.
3. The player page opens in the phone's browser — no app to install. Tap
   **LISTEN**. The page has the same look as the plugin, including a level
   meter showing what the phone is receiving.

What you get:

- **Up to 32 phones at once**, each picking its own settings.
- **Quality (per phone)**: PCM 24-bit or PCM 16-bit (lossless, default), or
  Opus 96–320 kbps if the Wi-Fi is weak. Everything is sent at 48 kHz; a
  host sample-rate change doesn't disconnect anyone.
- **Two playback modes on the phone**:
  - *Low latency* (default): about 0.2 s behind the DAW, with a "keep
    screen on" option. Needs the page open and the screen on. If a slow
    phone's browser can't keep up (a dropout), the page notices and
    switches to a bigger buffer (about 0.35 s) for the rest of the visit,
    instead of continuing to click.
  - *Screen-off*: hands the stream to the phone's own media player so it
    keeps playing with the screen locked. About 1–3 s behind; 16-bit only.
- **Access code.** Live is never open to everyone on the network (on shared
  or office Wi-Fi that would let anyone listen to an unreleased mix). By
  default a random 8-character code is made each time the plugin loads; it
  is built into the QR code, so scanning just works, and it's shown in the
  password field for typing the address by hand. Type your own password
  there to replace it (saved with the project). After 10 wrong attempts
  from one address, that address is locked out for a minute.
- **Listener count** in the plugin, and automatic reconnect on the phone if
  the plugin restarts.
- While Live is on, the Emulate DSP is skipped (the real phone does the
  speaker colouring itself), so your monitors and the phones hear the same
  clean signal. MODEL, MIX, MONO and BYPASS are dimmed because they don't
  apply.
- **Works over plain HTTP.** The plugin can't have an HTTPS certificate for
  a LAN address, and browsers withhold some audio features from plain-HTTP
  pages. The page detects this and uses fallbacks that work there: a
  ScriptProcessor instead of an AudioWorklet for low latency, a bundled
  WebAssembly Opus decoder instead of WebCodecs, and a silent looping video
  instead of the Wake Lock API to keep the screen on. Nothing is loaded from
  the internet; everything is served by the plugin.

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

Requires CMake ≥ 3.22 (CMake 4 works too) and a C++17 compiler. JUCE is fetched automatically
via `FetchContent` — no manual JUCE install or submodule needed.

```sh
cmake -B build
cmake --build build --config Release -j
```

Produces (in `build/PhoneTesto_artefacts/Release/`):
- `VST3/PhoneTesto.vst3`
- `Standalone/PhoneTesto` (or `.app` on macOS)
- `AU/` (macOS only — built automatically when `FORMATS` includes `AU`)

Distribution settings are baked in:

- **Windows**: the MSVC runtime is linked statically, so the plugin runs on
  machines without the Visual C++ Redistributable.
- **macOS**: universal binary (Apple Silicon + Intel), macOS 10.13+, and the
  Local Network usage description that macOS needs before it lets the plugin
  accept connections from phones.

### Installing the built plugin

The build doesn't copy the plugin into the system plugin folder by default
(on Windows that folder needs administrator rights, and a failed copy would
fail the whole build). Copy it yourself:

- **Windows**: `PhoneTesto.vst3` → `C:\Program Files\Common Files\VST3\`
  (then rescan plugins in FL Studio: Options → Manage plugins → Find
  plugins).
- **macOS**: `PhoneTesto.vst3` → `~/Library/Audio/Plug-Ins/VST3/`,
  `PhoneTesto.component` → `~/Library/Audio/Plug-Ins/Components/`.

Or configure with `-DPHONETESTO_COPY_AFTER_BUILD=ON` to have every build
install it (on Windows, run VS Code / the terminal as administrator).

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

- **PhoneTestoDspTest** — the processor as a host would drive it, at
  44.1/48/96 kHz: every model within ±1 dB (K-weighted) of the input on
  −18 dBFS pink noise and never clipping; no clicks when switching models,
  bypass, mono, mix or output mid-tone; bypass bit-exact to the delayed
  input; latency the same before and after prepare; odd and oversized block
  sizes, silence and decay; CPU use; project save/restore (including the
  password and a corrupt state blob); and the Live access code (random per
  load, in the QR URL, required by the server, replaced by a password).
- **PhoneTestoLiveServerTest** — the streaming server with plain socket
  clients standing in for phones, fed a 440 Hz tone at 44.1 kHz. Decodes
  PCM16, PCM24, Opus and the WAV stream and checks pitch (440 Hz, so the
  48 kHz resampling is right) and level; three formats at once; a host
  sample-rate change mid-stream; the 32-listener cap; passwords (including
  non-ASCII) and the brute-force lockout; abrupt hang-ups (which must not
  crash the host, and must free the phone's slot at once even while no
  audio is flowing); and a fast stop() with 32 phones connected. Every
  decoded format is also checked for clicks (no sample-to-sample jump
  beyond what a clean sine can make).
- **player_test.mjs** — the real player page in Playwright Chromium on a
  phone-sized screen against `PhoneTestoLiveDemo`'s test tone, opened twice:
  over the LAN address (plain HTTP, as a phone sees it — must pick the
  ScriptProcessor / WASM Opus / video keep-awake fallbacks) and over
  localhost (secure — AudioWorklet / WebCodecs / Wake Lock). Presses Play
  for every quality and checks the decoded level, that the phone's actual
  output is click-free (with the browser running at 44.1 kHz so resampling
  is exercised), the screen-off mode, the password flow including the QR
  code's `?k=` link, and auto-reconnect when the plugin goes away and comes
  back. Chromium isn't iPhone Safari — see the Live Monitor caveats.
- **PhoneTestoEditorSnapshot** — renders the editor in both skins (Emulate
  and Live) to PNGs for checking the layout, checks it reopens at its saved
  size, and prints what a DIGITAL animation frame costs to draw
  (`PT_ANIM_FRAMES=45` also saves 3 s of animation frames).
- **PhoneTestoLiveDemo** — runs the server on its own with a test tone, so
  you can try the phone page without a DAW
  (`build/PhoneTestoLiveDemo --port 51813`, then open the printed URL on
  your phone).

The VST3 build also passes Steinberg's VST3 validator (all 47 tests) and
[pluginval](https://github.com/Tracktion/pluginval) at strictness 10.

### Automatic builds (GitHub Actions)

Every push that touches `PhoneTesto/` builds the plugin on **Windows,
macOS and Linux** (`.github/workflows/phonetesto.yml`) and runs on each:
the DSP and Live Monitor tests, pluginval at strictness 10, and editor
snapshots. macOS also runs Apple's `auval` on the Audio Unit. Linux also
runs the phone-page browser tests and checks that the QR code decodes.

**Downloading a build** without compiling: repository → **Actions** →
**PhoneTesto** → the latest run with a green tick → **Artifacts** at the
bottom:

- `PhoneTesto-Windows` — `PhoneTesto.vst3` (copy to
  `C:\Program Files\Common Files\VST3\`) and the standalone `PhoneTesto.exe`.
- `PhoneTesto-macOS` — VST3, AU and standalone app as zips. They aren't
  code-signed yet, so macOS quarantines them after download; clear that with
  `xattr -dr com.apple.quarantine <path to the .vst3/.component/.app>`.
- `PhoneTesto-Linux` — VST3 and standalone.
- `snapshots-*` — the editor (and, on Linux, the phone page) as PNGs.

Artifacts are kept for 30 days.

## Project layout

```
CMakeLists.txt             JUCE plugin target (VST3/AU/Standalone, optional AAX) + deps
Resources/
  player.html              The phone-side player page (embedded into the plugin)
  player-worklet.js        Its playback core (AudioWorklet or ScriptProcessor): gapless
                           playback, jitter buffer, drift control
  thirdparty/              opus-decoder (WASM Opus for plain-HTTP pages) + its licence
  fonts/                   Barlow and PT Digital fonts + their licences (OFL)
Source/
  PluginProcessor.h/.cpp   Parameters, speaker DSP chain, Live Monitor wiring
  PluginEditor.h/.cpp      The rack-unit faceplate: layout, legends, scaling
  HardwareStyle.h/.cpp     Fonts, skins, FLAT palette, flat knobs and LED buttons
  DigitalStyle.h/.cpp      DIGITAL skin: animated background, glass, glow, device icons
  LevelMeter.h/.cpp        Stereo LED output meter
  DisplayWindow.h/.cpp     Display: response curve / Live QR, address, password
  SpeakerProfiles.h        Per-device filter/drive tables
  LiveMonitorServer.h/.cpp Embedded HTTP server, listener threads, lock-free broadcast ring
  LiveStreamEncoder.h/.cpp Per-listener 48 kHz resampling + PCM16/PCM24/Opus packetising
  QrCodeComponent.h/.cpp   Draws the "scan to listen" QR code
Tests/
  DspTest.cpp              Processor tests: level match, clicks, bypass, latency, state
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
- [Barlow](https://github.com/jpt/barlow) fonts — SIL Open Font License 1.1
  (`Resources/fonts/OFL.txt`); these are included in the repo and embedded in
  the plugin.
- PT Digital — SIL Open Font License 1.1 (`Resources/fonts/PTDigital-OFL.txt`).
  A Modified Version of [Orbitron](https://github.com/theleagueof/orbitron)
  (static SemiBold/Bold instances cut from its variable font, renamed as its
  Reserved Font Name requires); embedded in the plugin.
- [opus-decoder](https://github.com/eshaz/wasm-audio-decoders) 0.7.12 by
  Ethan Halsall — MIT, wrapping libopus (BSD)
  (`Resources/thirdparty/opus-decoder-LICENSE.txt`); included in the repo
  and served to phones by the plugin.

JUCE, libopus and the QR library are fetched at configure time rather than
vendored.

## Roadmap

- [ ] Real measured impulse responses per device, layered in as an optional
      convolution stage alongside the current EQ/saturation model.
- [ ] More device profiles (additional Android flagships, tablets, TVs).
- [ ] Preset save/recall in the host.
- [ ] Try Live Monitor on a real iPhone (Safari) and Android (Chrome),
      especially screen-off mode, and adjust for anything iOS-specific.
- [ ] Streaming over the internet (not just local Wi-Fi), e.g. to send a
      mix-in-progress to someone elsewhere.
