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
        Source/FloatingDeviceView2D.cpp
        Source/FloatingDeviceView3D.cpp
)

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
        juce::juce_opengl
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

