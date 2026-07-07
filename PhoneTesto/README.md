# PhoneTesto (working title)

An audio effect plugin that emulates the frequency response and drive
character of small phone/laptop speakers, so a mix can be monitored the way
it would sound on an iPhone (or similar device) without bouncing audio and
transferring it to a physical phone every time.

Insert it on your master bus (or any track), pick a device, and the plugin
applies that device's approximate speaker coloration in real time:

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

`Tests/DspTest.cpp` is a headless sanity check (no audio device or GUI
required) that runs white noise and an impulse through every speaker
profile and verifies the output stays finite and at a sane level:

```sh
cmake --build build --target PhoneTestoDspTest -j
./build/PhoneTestoDspTest
```

For real verification, load the built VST3/AU in a DAW, insert on a mix
bus, and A/B the device profiles against a real phone speaker if one is
available.

## Project layout

```
CMakeLists.txt          JUCE plugin target (VST3/AU/Standalone, optional AAX)
Source/
  PluginProcessor.h/.cpp   Audio processing: parameter layout + speaker DSP chain
  PluginEditor.h/.cpp      GUI: device picker, mix, output, mono sum, bypass
  SpeakerProfiles.h        Per-device filter/drive parameter tables
Tests/
  DspTest.cpp              Headless DSP sanity test
```

## Roadmap

- [ ] Real measured impulse responses per device, layered in as an optional
      convolution stage alongside the current EQ/saturation model.
- [ ] More device profiles (additional Android flagships, tablets, TVs).
- [ ] A/B bypass shortcut and preset save/recall in the host.
