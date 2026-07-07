#pragma once

#include <juce_opengl/juce_opengl.h>
#include "SpeakerProfiles.h"

namespace phonetesto
{

/** OpenGL device preview: a simple extruded-box model (bud+stem for
    earphones) that spins slowly and bobs up and down to read as
    "floating". This is a stylised procedural shape, not a licensed/exact
    reproduction of any real product's geometry. */
class FloatingDeviceView3D : public juce::OpenGLAppComponent
{
public:
    FloatingDeviceView3D();
    ~FloatingDeviceView3D() override;

    void setDevice (DeviceShape shape, juce::Colour accent);

    void initialise() override;
    void shutdown() override;
    void render() override;

    void paint (juce::Graphics&) override {}

private:
    struct Vertex
    {
        float position[3];
        float normal[3];
    };

    void rebuildGeometryIfNeeded();
    void appendBox (std::vector<Vertex>& verts, std::vector<juce::uint32>& idx,
                     juce::Vector3D<float> halfExtent, juce::Vector3D<float> centre) const;

    std::unique_ptr<juce::OpenGLShaderProgram> shader;
    std::unique_ptr<juce::OpenGLShaderProgram::Uniform> projectionUniform, viewUniform, colourUniform;
    std::unique_ptr<juce::OpenGLShaderProgram::Attribute> positionAttribute, normalAttribute;

    GLuint vertexBufferId = 0;
    GLuint indexBufferId = 0;
    int numIndices = 0;

    std::atomic<bool> geometryDirty { true };
    DeviceShape currentShape = DeviceShape::phone;
    juce::Colour currentAccent { 0xffd0d3d9 };

    double startTimeMs = 0.0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (FloatingDeviceView3D)
};

} // namespace phonetesto
