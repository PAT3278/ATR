# PhoneTesto (working title)

An audio effect plugin for hearing your mix on **your own phone** while you
work on it — no bouncing, no transferring files. Open the plugin and it is on
the air: scan the code it shows with the phone, and the mix plays on the
phone's own speaker, live, over your Wi-Fi.

1. **Live** (what opening it starts) — the actual audio goes to real phones
   on the same network, so you hear the phone's real speaker instead of a
   simulation of one. The DAW hears the mix untouched meanwhile.
2. **Speaker emulation** (a bonus) — DSP that approximates a phone's, a
   laptop's or wired earbuds' speaker on your studio monitors or headphones,
   for when no phone is at hand.

One at a time: on the air there is no emulation, and phones get the mix as
it is. Insert it as the last plugin on your master bus.

## Live: the mix on your own phone

Insert PhoneTesto as the **last plugin on your master bus** and open it: it's
on the air, and the window shows a code to scan. (If you've switched to the
speaker emulation, **LISTEN ON PHONE** brings you back.)

1. A small server starts inside the plugin (port `51813`, or the next free
   one) when the window opens. Loading a project doesn't open a network port
   by itself.
2. **Scan the code** with the phone's camera (or type the address shown next
   to it). The phone must be on the **same Wi-Fi** as the computer.
3. The player page opens in the phone's browser — no app to install. Tap
   **LISTEN**. The page has the same look as the plugin, including a level
   meter showing what the phone is receiving.

What you get:

- **Up to 32 phones at once**, each picking its own settings.
- **Quality (per phone)**: PCM 24-bit or PCM 16-bit (lossless, default), or
  Opus 96–320 kbps if the Wi-Fi is weak. Everything is sent at 48 kHz; a
  host sample-rate change doesn't disconnect anyone.
- **Two playback modes on the phone**:
  - *Screen-off* (default): hands the stream to the phone's own media
    player so it keeps playing in the background, with the screen locked
    or another app open. About 1–3 s behind; 16-bit only.
  - *Low latency*: about 0.2 s behind the DAW, with a "keep screen on"
    option. Needs the page open and the screen on. If a slow
    phone's browser can't keep up (a dropout), the page notices and
    switches to a bigger buffer (about 0.35 s) for the rest of the visit,
    instead of continuing to click.
    The phone remembers whichever mode was picked last.
- **Access code.** Live is never open to everyone on the network (on shared
  or office Wi-Fi that would let anyone listen to an unreleased mix). By
  default a random 8-character code is made each time the plugin loads; it
  is built into the QR code, so scanning just works, and it's shown (dimmed)
  in the password field for typing the address by hand. Type your own password
  there to replace it (saved with the project). After 10 wrong attempts
  from one address, that address is locked out for a minute.
- **Listener count** in the plugin, and automatic reconnect on the phone if
  the plugin restarts.
- **No emulation on the air**: the real phone does the speaker colouring
  itself, so the phones and your monitors get the same mix, untouched. The
  emulation's controls aren't shown then; OUTPUT still sets the level.
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
  Firewall for *private* networks when prompted the first time the plugin
  opens. If the network refused, the window says so with **Try again**.
- **macOS**: allow the DAW under System Settings → Privacy & Security →
  Local Network, and in the firewall if it's enabled.
- iPhone: turn the volume up and check the silent switch.

Latency means this is for checking how the mix sounds, not for playing in
time against it.

## The window

It opens on the air: the code to scan, large and sharp, with the number of
phones listening (and a bar showing the sound going out), the address to type
instead, and an optional password. Behind it, out of focus, is the room the
speaker emulation lives in. A new plugin starts here; what you last used is
saved with the project (a project saved by an earlier version, which had no
modes, opens in the emulation it was using).

**SPEAKER EMULATION** switches to the room — phones stop until you come back,
and reconnect by themselves when you do. The room is a desk at night: the
speakers stand in a row on walnut under a lamp, drawn in 3D, with a pair of
studio monitors on the far side. The picture is the control surface.

- **Speaker model** — drag sideways along the desk (or press a model key
  under the room, or ← →). The camera slides to the next speaker and the
  sound goes with it: while you move, the two speakers either side of the
  camera are blended by where it is, so you hear one turn into the next;
  when it settles you hear that model alone (exactly as if picked from the
  host's Model parameter, which follows too). Each one is modelled from the
  real thing: frame and edge with its antenna lines, glass with the lamp in
  it, buttons, speaker holes, each model's own cameras on the back and its
  front camera in the notch, island or punch-hole; the laptop's backlit
  keyboard, grilles, trackpad, ports and webcam; today's open-fit earbuds
  (contoured head, short stem, speaker mesh, vent, sensor and steel tip,
  each head and stem one smooth piece) with their case open beside them.
  Its screen shows the band it can play, lit by the output's spectrum.
- **Mix** — drag up or down (or the Focus slider, or ↑ ↓): the focus pulls from the
  speaker to the studio monitors behind it, and the lamp follows. All the way
  to the monitors is the dry signal; their woofers move with it.
- **Output**, **MONO** (the sound rings from the speaker's two ends draw
  together into one) and **BYPASS** (focus and light move to the monitors).
- **LISTEN ON PHONE** — back on the air (the phone on the desk shows the code
  too).

Drag the window's corner to resize; the size is saved with the project.
Everything the page needs (three.js, the Barlow fonts) is built into the
plugin, so it works offline. It is drawn by the system's web view: WebView2
on Windows (part of Windows 10 and 11), WebKit on macOS and Linux. Without a
web view (an old Windows without the WebView2 Runtime) the window says what
to install; the sound works either way.

- **Keys belong to the host.** After you use the mouse in the room, keyboard
  focus goes back to the plugin window, so the space bar starts and stops
  your DAW as usual; only the arrow keys are the room's, and on the air not
  even those. Typing in the password field keeps the keys there.
- **It costs nothing while idle.** The room is drawn only while something
  moves, sound plays or a setting changes. On a slow graphics card it draws
  at a lower resolution (and smaller shadows) to stay fluid, and goes back up
  when it can.
- **Keyboard and screen readers:** the room takes focus with Tab and answers
  the arrows; the model name is announced when it changes; with *reduce
  motion* set, the camera moves quickly and the sound rings are off.

### Trying the room in a browser

The same page runs outside the plugin, playing a song through a Web Audio
sketch of the emulation (the sound is approximate — the plugin's DSP is the
reference):

```sh
node Tools/room-demo.mjs path/to/song.mp3
```

then open the printed address on this computer, or on a phone on the same
Wi-Fi. It opens on the room; LISTEN ON PHONE there only shows what the code
screen looks like, marked as an example.


## Speaker emulation

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
> it's on the master bus — like any monitoring plugin there, the emulation would
> otherwise be printed into the export. In Live mode the plugin passes audio
> through unchanged, and it doesn't stream to phones while the DAW renders
> an export.

This is **not** a calibrated impulse-response model — the filter/drive
values in `Source/SpeakerProfiles.h` are hand-tuned approximations. If real
measured impulse responses become available (device + mic + calibrated
level), adding a convolution stage per profile is the natural next step.

## Building

Requires CMake ≥ 3.22 (CMake 4 works too) and a C++17 compiler. JUCE is fetched automatically
via `FetchContent` — no manual JUCE install or submodule needed. On Windows the
WebView2 SDK is fetched the same way; on Linux install WebKitGTK's headers
(`libwebkit2gtk-4.1-dev`, plus JUCE's usual GTK/X11/ALSA ones).

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

### Working in VS Code

The repository is set up for VS Code (`.vscode/` at its root,
`PhoneTesto/CMakePresets.json`).

1. **Get the code**: `git clone -b claude/iphone-speaker-plugin-nlbmfo
   https://github.com/PAT3278/ATR.git`, then *File → Open Folder… →* `ATR`.
   (Cloned already? `git pull` on that branch.)
2. **Install what it asks for**: VS Code offers the recommended extensions
   (CMake Tools, C/C++, Claude Code). On Windows you also need **Visual
   Studio 2022 or its Build Tools, with "Desktop development with C++"**,
   and Git; Node.js only for the browser demo and tests.
3. **Build**: pick the *Release* preset when asked (status bar), then
   **Ctrl+Shift+B**. The first configure downloads JUCE, libopus and the
   WebView2 SDK, which takes a few minutes.
4. **Try it**: *Terminal → Run Task…*
   - *open the stand-alone app*: the plugin as an app (it opens on the code
     to scan).
   - *tests (DSP + Live server)* (also `ctest --preset release`), *editor
     self-test*, and, after *install the browser tests' Playwright (once)*,
     *browser tests*.
   - *room demo in a browser*: the window's page with your song, on this
     computer or a phone on the same Wi-Fi.
5. **In FL Studio**: add `PhoneTesto\build\PhoneTesto_artefacts\Release\VST3`
   (and `PhoneTesto\build-debug\PhoneTesto_artefacts\Debug\VST3` for
   debugging) to FL Studio's plugin search paths (*Options → Manage plugins*),
   then *Find plugins*: each build is picked up there, with no copying into
   Program Files. Close FL Studio before rebuilding; Windows locks a loaded
   plugin.
6. **Debug**: *Run and Debug → Stand-alone app (Debug, Windows)* or *FL Studio
   with the plugin (Debug, Windows)* builds Debug, starts it under the
   debugger and stops at breakpoints in the plugin's code.

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
node Tests/browser/room_test.mjs
```

- **PhoneTestoDspTest** — the processor as a host would drive it, at
  44.1/48/96 kHz: every model within ±1 dB (K-weighted) of the input on
  −18 dBFS pink noise and never clipping; no clicks when switching models,
  bypass, mono, mix or output mid-tone; the room's morph across all eight
  speakers and back (faster than it may move), settling exactly on the chosen
  model and leaving the Model parameter working; bypass bit-exact to the delayed
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
- **room_test.mjs** — the editor's page in Playwright Chromium. As the
  browser demo: it loads with the bundled three.js and fonts, draws the
  room, plays a test song, a drag moves through the speakers and settles.
  As the plugin's editor, against a stand-in for JUCE's bridge: it opens on
  the air with the code and no emulation controls, switches to the emulation
  and back, offers Try again when the network refused, sends the
  camera position while the user moves and ends the blend when it settles,
  hands keyboard focus back after mouse use, passes unused keys on to the
  host (space included) but keeps them while the password is typed. And the
  layout at 720×480, 1000×660 and 1600×1000 with the Live card up.
- **Editor self-test** — the stand-alone app with
  `PHONETESTO_EDITOR_SELFTEST=<folder>` opens its editor (on the air, with
  the code to scan), and the page reports what it shows (WebGL renderer, how much of the room the speaker
  covers, picture statistics, fonts, any script error) and saves a snapshot;
  then the app quits. `node Tests/check_editor_selftest.mjs <folder>` checks
  the report. CI runs it on Windows, macOS and Linux, so the room is seen
  drawn by each system's own web view.
- **PhoneTestoLiveDemo** — runs the server on its own with a test tone, so
  you can try the phone page without a DAW
  (`build/PhoneTestoLiveDemo --port 51813`, then open the printed URL on
  your phone).

The VST3 build also passes Steinberg's VST3 validator (all 47 tests) and
[pluginval](https://github.com/Tracktion/pluginval) at strictness 10.

### Automatic builds (GitHub Actions)

Every push that touches `PhoneTesto/` builds the plugin on **Windows,
macOS and Linux** (`.github/workflows/phonetesto.yml`) and runs on each:
the DSP and Live Monitor tests, pluginval at strictness 10, and the editor
self-test in the system's web view. macOS also runs Apple's `auval` on the
Audio Unit. Linux also runs the phone-page and room-page browser tests.

**Downloading a build** without compiling: repository → **Actions** →
**PhoneTesto** → the latest run with a green tick → **Artifacts** at the
bottom:

- `PhoneTesto-Windows` — `PhoneTesto.vst3` (copy to
  `C:\Program Files\Common Files\VST3\`) and the standalone `PhoneTesto.exe`.
- `PhoneTesto-macOS` — VST3, AU and standalone app as zips. They aren't
  code-signed yet, so macOS quarantines them after download; clear that with
  `xattr -dr com.apple.quarantine <path to the .vst3/.component/.app>`.
- `PhoneTesto-Linux` — VST3 and standalone.
- `snapshots-*` — the editor as each system drew it, with its self-test
  report (and, on Linux, the phone and room pages) as PNGs.

Artifacts are kept for 30 days.

## Project layout

```
CMakeLists.txt             JUCE plugin target (VST3/AU/Standalone, optional AAX) + deps, tests for ctest
CMakePresets.json          Release / Debug presets (VS Code's CMake Tools uses them)
Resources/
  room.html                The editor: the 3D room (three.js) and its control strip
  player.html              The phone-side player page (embedded into the plugin)
  player-worklet.js        Its playback core (AudioWorklet or ScriptProcessor): gapless
                           playback, jitter buffer, drift control
  thirdparty/              three.js; opus-decoder (WASM Opus for plain-HTTP pages); licences
  fonts/                   Barlow and DSEG7 fonts + their licences (OFL)
Source/
  PluginProcessor.h/.cpp   Parameters, speaker DSP chain, Live Monitor wiring
  PluginEditor.h/.cpp      Hosts room.html in a web view; parameters, levels, spectrum,
                           Live state and QR code to the page, the page's controls back
  SpeakerProfiles.h        Per-device filter/drive tables
  LiveMonitorServer.h/.cpp Embedded HTTP server, listener threads, lock-free broadcast ring
  LiveStreamEncoder.h/.cpp Per-listener 48 kHz resampling + PCM16/PCM24/Opus packetising
Tests/
  DspTest.cpp              Processor tests: level match, clicks, bypass, latency, state
  LiveServerTest.cpp       Streaming server protocol/audio test
  LiveDemo.cpp             Stand-alone server with a test tone
  browser/player_test.mjs  In-browser player test (Playwright)
  browser/room_test.mjs    The editor's page in a browser (Playwright)
  check_editor_selftest.mjs Checks the stand-alone app's editor self-test report
Tools/room-demo.mjs        Serves the editor's page as a browser demo (Web Audio, your song)
```

## Third-party code

- [JUCE](https://juce.com) — AGPLv3 / commercial licence.
- [libopus](https://opus-codec.org) — BSD 3-Clause.
- [QR Code generator](https://www.nayuki.io/page/qr-code-generator-library)
  by Project Nayuki — MIT.
- [Barlow](https://github.com/jpt/barlow) fonts — SIL Open Font License 1.1
  (`Resources/fonts/OFL.txt`); these are included in the repo and embedded in
  the plugin.
- [DSEG7 Classic](https://github.com/keshikan/DSEG) by keshikan — SIL Open
  Font License 1.1 (`Resources/fonts/DSEG-OFL.txt`); unmodified, embedded in
  the plugin and served to the phone page.
- [three.js](https://threejs.org) r128 — MIT
  (`Resources/thirdparty/three-LICENSE.txt`); included in the repo and
  embedded in the plugin.
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
