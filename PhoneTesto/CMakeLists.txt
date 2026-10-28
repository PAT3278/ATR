cmake_minimum_required(VERSION 3.22)

project(PhoneTesto VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --- JUCE ---------------------------------------------------------------
# Pulled in via FetchContent so the project builds from a clean checkout
# without requiring a JUCE submodule or system install.
include(FetchContent)
FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        8.0.4
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(JUCE)

# --- Live Monitor dependencies -------------------------------------------
# libopus (BSD-3-Clause): compressed streaming to the phone's browser.
# Built static + PIC so it can be linked into the plugin's shared module.
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(OPUS_BUILD_PROGRAMS OFF CACHE BOOL "" FORCE)
set(OPUS_BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(OPUS_INSTALL_PKG_CONFIG_MODULE OFF CACHE BOOL "" FORCE)
set(OPUS_INSTALL_CMAKE_CONFIG_MODULE OFF CACHE BOOL "" FORCE)
FetchContent_Declare(
    opus
    GIT_REPOSITORY https://github.com/xiph/opus.git
    GIT_TAG        v1.4
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(opus)

# Nayuki QR Code generator (MIT): draws the "scan to listen" code in the
# editor. The repo has no CMake project, so its single C++ source is
# compiled directly into the plugin below.
FetchContent_Declare(
    qrcodegen
    GIT_REPOSITORY https://github.com/nayuki/QR-Code-generator.git
    GIT_TAG        v1.8.0
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(qrcodegen)

# The browser player page served to the phone, embedded as BinaryData.
juce_add_binary_data(PhoneTestoAssets SOURCES Resources/player.html)

# --- AAX ------------------------------------------------------------------
# AAX requires Avid's proprietary SDK, which cannot be redistributed here.
# If you obtain the AAX SDK from https://developer.avid.com, point
# JUCE_AAX_SDK_PATH at it and re-run CMake to enable the AAX target.
set(JUCE_AAX_SDK_PATH "" CACHE PATH "Path to the Avid AAX SDK (optional)")

set(PHONETESTO_FORMATS VST3 AU Standalone)
if(JUCE_AAX_SDK_PATH)
    list(APPEND PHONETESTO_FORMATS AAX)
    juce_set_aax_sdk_path(${JUCE_AAX_SDK_PATH})
endif()

juce_add_plugin(PhoneTesto
    COMPANY_NAME "ATR Audio"
    BUNDLE_ID "com.atraudio.phonetesto"
    PLUGIN_MANUFACTURER_CODE Atra
    PLUGIN_CODE Pht1
    FORMATS ${PHONETESTO_FORMATS}
    PRODUCT_NAME "PhoneTesto"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    VST3_CATEGORIES Fx
    AU_MAIN_TYPE kAudioUnitType_Effect
    COPY_PLUGIN_AFTER_BUILD TRUE
)

target_sources(PhoneTesto
    PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp
        Source/PhoneUILookAndFeel.cpp
        Source/LiveMonitorServer.cpp
        Source/LiveStreamEncoder.cpp
        Source/QrCodeComponent.cpp
        ${qrcodegen_SOURCE_DIR}/cpp/qrcodegen.cpp
)

target_include_directories(PhoneTesto PRIVATE ${qrcodegen_SOURCE_DIR}/cpp)

target_compile_definitions(PhoneTesto
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(PhoneTesto
    PRIVATE
        juce::juce_audio_utils
        juce::juce_dsp
        PhoneTestoAssets
        opus
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)

# --- Offline DSP sanity test ---------------------------------------------
# Headless check that every speaker profile produces finite, sane-level
# audio; runs without an audio device or GUI (see Tests/DspTest.cpp).
add_executable(PhoneTestoDspTest Tests/DspTest.cpp)
target_link_libraries(PhoneTestoDspTest
    PRIVATE
        PhoneTesto
        juce::juce_audio_processors
        juce::juce_dsp
)

# --- Offline Live Monitor sanity test ------------------------------------
# Headless check that the embedded HTTP/WAV streaming server actually
# accepts a connection and streams a valid header + PCM payload, using a
# plain socket client standing in for Safari (see Tests/LiveServerTest.cpp).
add_executable(PhoneTestoLiveServerTest Tests/LiveServerTest.cpp)
target_link_libraries(PhoneTestoLiveServerTest
    PRIVATE
        PhoneTesto
        juce::juce_audio_basics
        juce::juce_core
        opus
)

# --- Live Monitor demo server --------------------------------------------
# Runs the streaming server on its own with a test tone, so the browser
# player can be exercised without a DAW (used by Tests/browser/player_test.mjs).
add_executable(PhoneTestoLiveDemo Tests/LiveDemo.cpp)
target_link_libraries(PhoneTestoLiveDemo
    PRIVATE
        PhoneTesto
        juce::juce_audio_basics
        juce::juce_core
)

# --- Editor snapshot ------------------------------------------------------
# Renders the plugin editor (Emulate and Live states) to PNGs for layout
# checks without a DAW. Needs a display (use xvfb-run on headless Linux).
add_executable(PhoneTestoEditorSnapshot Tests/EditorSnapshot.cpp)
target_link_libraries(PhoneTestoEditorSnapshot
    PRIVATE
        PhoneTesto
        juce::juce_audio_processors
        juce::juce_dsp
)

