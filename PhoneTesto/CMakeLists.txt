cmake_minimum_required(VERSION 3.22)

# --- Distribution settings (must precede project()) ------------------------
# macOS: one universal binary for Apple Silicon + Intel, loadable on 10.13+.
set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "macOS architectures")
set(CMAKE_OSX_DEPLOYMENT_TARGET "10.13" CACHE STRING "Minimum macOS version")

project(PhoneTesto VERSION 0.2.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Windows: link the C/C++ runtime statically, so the plugin loads on PCs
# without the Visual C++ Redistributable installed.
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

# Copying the built plugin into the system plugin folder needs admin rights
# on Windows (C:\Program Files\Common Files\VST3), which would make a normal
# build fail at the last step -- so it's opt-in there.
if(WIN32)
    option(PHONETESTO_COPY_AFTER_BUILD "Copy the built plugins into the system plugin folders" OFF)
else()
    option(PHONETESTO_COPY_AFTER_BUILD "Copy the built plugins into the system plugin folders" ON)
endif()

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
if(APPLE)
    # Opus's x86 SIMD sources don't build in a combined arm64+x86_64 pass;
    # the generic C code is plenty fast for a handful of streams.
    set(OPUS_DISABLE_INTRINSICS ON CACHE BOOL "" FORCE)
endif()
FetchContent_Declare(
    opus
    GIT_REPOSITORY https://github.com/xiph/opus.git
    GIT_TAG        v1.4
    GIT_SHALLOW    TRUE
)
# libopus 1.4 declares cmake_minimum_required(VERSION 3.1). CMake 4 refuses
# anything below 3.5, and under it opus would ignore CMAKE_MSVC_RUNTIME_LIBRARY
# (policy CMP0091), linking the DLL runtime against our static one on Windows.
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)
set(CMAKE_POLICY_DEFAULT_CMP0091 NEW)
FetchContent_MakeAvailable(opus)
unset(CMAKE_POLICY_VERSION_MINIMUM)
unset(CMAKE_POLICY_DEFAULT_CMP0091)

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

# WebView2 (Windows): the editor is a web page in the system's web view. Its
# SDK comes as a NuGet package; fetch it here so a plain CMake build works
# without installing it by hand. (Edge's WebView2 runtime itself ships with
# Windows 10 and 11.)
if(WIN32 AND NOT JUCE_WEBVIEW2_PACKAGE_LOCATION)
    set(PHONETESTO_WEBVIEW2_VERSION 1.0.2903.40)
    FetchContent_Declare(
        webview2
        URL https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/${PHONETESTO_WEBVIEW2_VERSION}
        DOWNLOAD_NAME webview2.zip
        SOURCE_DIR ${CMAKE_BINARY_DIR}/webview2/Microsoft.Web.WebView2.${PHONETESTO_WEBVIEW2_VERSION}
    )
    FetchContent_MakeAvailable(webview2)
    set(JUCE_WEBVIEW2_PACKAGE_LOCATION ${CMAKE_BINARY_DIR}/webview2)
endif()

# The editor (a 3D room drawn with three.js, MIT, see Resources/thirdparty),
# the phone player page, its playback engine, a WebAssembly Opus decoder for
# phones whose browser withholds WebCodecs (MIT), and the Barlow fonts (SIL
# OFL, see Resources/fonts/OFL.txt) used by both pages.
juce_add_binary_data(PhoneTestoAssets SOURCES
    Resources/room.html
    Resources/thirdparty/three.min.js
    Resources/player.html
    Resources/player-worklet.js
    Resources/thirdparty/opus-decoder.min.js
    Resources/fonts/BarlowCondensed-Bold.ttf
    Resources/fonts/BarlowCondensed-SemiBold.ttf
    Resources/fonts/Barlow-Medium.ttf
    Resources/fonts/Barlow-SemiBold.ttf
    Resources/fonts/Barlow-Bold.ttf
    Resources/fonts/DSEG7Classic-Bold.ttf
)

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
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    NEEDS_WEB_BROWSER TRUE
    NEEDS_WEBVIEW2 TRUE
    VST3_CATEGORIES Fx
    AU_MAIN_TYPE kAudioUnitType_Effect
    COPY_PLUGIN_AFTER_BUILD ${PHONETESTO_COPY_AFTER_BUILD}
    # macOS asks before an app talks to the local network (Live Monitor);
    # this is the explanation shown for the standalone app.
    PLIST_TO_MERGE "<plist><dict><key>NSLocalNetworkUsageDescription</key><string>PhoneTesto streams your mix to phones on your Wi-Fi so you can hear it on their speakers.</string></dict></plist>"
)

target_sources(PhoneTesto
    PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp
        Source/LiveMonitorServer.cpp
        Source/LiveStreamEncoder.cpp
        ${qrcodegen_SOURCE_DIR}/cpp/qrcodegen.cpp
)

target_include_directories(PhoneTesto PRIVATE ${qrcodegen_SOURCE_DIR}/cpp)

target_compile_definitions(PhoneTesto
    PUBLIC
        JUCE_WEB_BROWSER=1
        JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(PhoneTesto
    PRIVATE
        juce::juce_audio_utils
        juce::juce_gui_extra
        juce::juce_dsp
        PhoneTestoAssets
        opus
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)

# The test programs build JUCE's modules too, so they need the web view's
# headers and libraries like the plugin does.
function(phonetesto_link_web_view target)
    if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
        target_link_libraries(${target} PRIVATE juce::pkgconfig_JUCE_BROWSER_LINUX_DEPS)
        juce_link_with_embedded_linux_subprocess(${target})
    elseif(WIN32)
        target_link_libraries(${target} PRIVATE juce::juce_webview2)
    endif()
endfunction()

# `ctest` (and the test presets in CMakePresets.json) runs the two test programs.
enable_testing()

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
phonetesto_link_web_view(PhoneTestoDspTest)

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
phonetesto_link_web_view(PhoneTestoLiveServerTest)

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
phonetesto_link_web_view(PhoneTestoLiveDemo)

add_test(NAME dsp COMMAND PhoneTestoDspTest)
add_test(NAME live-server COMMAND PhoneTestoLiveServerTest)
