#include "FloatingDeviceView3D.h"

namespace phonetesto
{

FloatingDeviceView3D::FloatingDeviceView3D()
{
    startTimeMs = juce::Time::getMillisecondCounterHiRes();
}

FloatingDeviceView3D::~FloatingDeviceView3D()
{
    shutdownOpenGL();
}

void FloatingDeviceView3D::setDevice (DeviceShape shape, juce::Colour accent)
{
    if (shape == currentShape && accent == currentAccent)
        return;

    currentShape = shape;
    currentAccent = accent;
    geometryDirty = true;
}

void FloatingDeviceView3D::initialise()
{
    using namespace ::juce::gl;

    shader = std::make_unique<juce::OpenGLShaderProgram> (openGLContext);

    const char* vertexShaderSrc =
        "attribute vec4 position;\n"
        "attribute vec3 normal;\n"
        "uniform mat4 projectionMatrix;\n"
        "uniform mat4 viewMatrix;\n"
        "varying vec3 viewNormal;\n"
        "void main()\n"
        "{\n"
        "    viewNormal = mat3 (viewMatrix) * normal;\n"
        "    gl_Position = projectionMatrix * viewMatrix * position;\n"
        "}\n";

    const char* fragmentShaderSrc =
       #if JUCE_OPENGL_ES
        "precision mediump float;\n"
       #endif
        "uniform vec4 baseColour;\n"
        "varying vec3 viewNormal;\n"
        "void main()\n"
        "{\n"
        "    vec3 n = normalize (viewNormal);\n"
        "    vec3 lightDir = normalize (vec3 (0.4, 0.7, 0.6));\n"
        "    float diffuse = max (dot (n, lightDir), 0.0);\n"
        "    float ambient = 0.45;\n"
        "    vec3 colour = baseColour.rgb * (ambient + (1.0 - ambient) * diffuse);\n"
        "    gl_FragColor = vec4 (colour, baseColour.a);\n"
        "}\n";

    if (shader->addVertexShader (vertexShaderSrc)
          && shader->addFragmentShader (fragmentShaderSrc)
          && shader->link())
    {
        shader->use();

        projectionUniform = std::make_unique<juce::OpenGLShaderProgram::Uniform> (*shader, "projectionMatrix");
        viewUniform       = std::make_unique<juce::OpenGLShaderProgram::Uniform> (*shader, "viewMatrix");
        colourUniform     = std::make_unique<juce::OpenGLShaderProgram::Uniform> (*shader, "baseColour");
        positionAttribute = std::make_unique<juce::OpenGLShaderProgram::Attribute> (*shader, "position");
        normalAttribute   = std::make_unique<juce::OpenGLShaderProgram::Attribute> (*shader, "normal");
    }
    else
    {
        jassertfalse;
        shader.reset();
    }

    glGenBuffers (1, &vertexBufferId);
    glGenBuffers (1, &indexBufferId);

    geometryDirty = true;
}

void FloatingDeviceView3D::shutdown()
{
    using namespace ::juce::gl;

    shader.reset();
    projectionUniform.reset();
    viewUniform.reset();
    colourUniform.reset();
    positionAttribute.reset();
    normalAttribute.reset();

    if (vertexBufferId != 0) { glDeleteBuffers (1, &vertexBufferId); vertexBufferId = 0; }
    if (indexBufferId != 0)  { glDeleteBuffers (1, &indexBufferId);  indexBufferId = 0; }

    numIndices = 0;
}

void FloatingDeviceView3D::appendBox (std::vector<Vertex>& verts, std::vector<juce::uint32>& idx,
                                       juce::Vector3D<float> h, juce::Vector3D<float> c) const
{
    juce::Vector3D<float> p[8] = {
        { c.x - h.x, c.y - h.y, c.z - h.z },
        { c.x + h.x, c.y - h.y, c.z - h.z },
        { c.x + h.x, c.y + h.y, c.z - h.z },
        { c.x - h.x, c.y + h.y, c.z - h.z },
        { c.x - h.x, c.y - h.y, c.z + h.z },
        { c.x + h.x, c.y - h.y, c.z + h.z },
        { c.x + h.x, c.y + h.y, c.z + h.z },
        { c.x - h.x, c.y + h.y, c.z + h.z },
    };

    auto addFace = [&] (juce::Vector3D<float> n, int i0, int i1, int i2, int i3)
    {
        auto base = (juce::uint32) verts.size();

        for (int i : { i0, i1, i2, i3 })
            verts.push_back ({ { p[i].x, p[i].y, p[i].z }, { n.x, n.y, n.z } });

        idx.push_back (base + 0); idx.push_back (base + 1); idx.push_back (base + 2);
        idx.push_back (base + 0); idx.push_back (base + 2); idx.push_back (base + 3);
    };

    addFace (juce::Vector3D<float> ( 0,  0,  1), 4, 5, 6, 7); // front
    addFace (juce::Vector3D<float> ( 0,  0, -1), 1, 0, 3, 2); // back
    addFace (juce::Vector3D<float> ( 1,  0,  0), 1, 5, 6, 2); // right
    addFace (juce::Vector3D<float> (-1,  0,  0), 0, 4, 7, 3); // left
    addFace (juce::Vector3D<float> ( 0,  1,  0), 3, 2, 6, 7); // top
    addFace (juce::Vector3D<float> ( 0, -1,  0), 0, 1, 5, 4); // bottom
}

void FloatingDeviceView3D::rebuildGeometryIfNeeded()
{
    using namespace ::juce::gl;

    if (! geometryDirty.exchange (false))
        return;

    std::vector<Vertex> verts;
    std::vector<juce::uint32> idx;

    switch (currentShape)
    {
        case DeviceShape::phone:
            appendBox (verts, idx, { 0.28f, 0.55f, 0.05f }, { 0.0f, 0.0f, 0.0f });
            break;

        case DeviceShape::laptop:
            appendBox (verts, idx, { 0.50f, 0.32f, 0.04f }, { 0.0f,  0.30f, -0.16f });
            appendBox (verts, idx, { 0.50f, 0.04f, 0.32f }, { 0.0f, -0.02f,  0.05f });
            break;

        case DeviceShape::earphone:
            appendBox (verts, idx, { 0.170f, 0.170f, 0.170f }, { 0.00f,  0.14f, 0.00f });
            appendBox (verts, idx, { 0.045f, 0.240f, 0.045f }, { 0.11f, -0.18f, 0.02f });
            break;
    }

    numIndices = (int) idx.size();

    glBindBuffer (GL_ARRAY_BUFFER, vertexBufferId);
    glBufferData (GL_ARRAY_BUFFER, (GLsizeiptr) (verts.size() * sizeof (Vertex)), verts.data(), GL_STATIC_DRAW);

    glBindBuffer (GL_ELEMENT_ARRAY_BUFFER, indexBufferId);
    glBufferData (GL_ELEMENT_ARRAY_BUFFER, (GLsizeiptr) (idx.size() * sizeof (juce::uint32)), idx.data(), GL_STATIC_DRAW);
}

void FloatingDeviceView3D::render()
{
    using namespace ::juce::gl;

    jassert (juce::OpenGLHelpers::isContextActive());

    auto desktopScale = (float) openGLContext.getRenderingScale();
    juce::OpenGLHelpers::clear (juce::Colour (0xff15161b));

    if (shader == nullptr)
        return;

    rebuildGeometryIfNeeded();

    if (numIndices == 0)
        return;

    glEnable (GL_DEPTH_TEST);
    glDepthFunc (GL_LESS);
    glDisable (GL_CULL_FACE);

    glViewport (0, 0,
                juce::roundToInt (desktopScale * (float) getWidth()),
                juce::roundToInt (desktopScale * (float) getHeight()));

    shader->use();

    auto elapsedSeconds = (float) ((juce::Time::getMillisecondCounterHiRes() - startTimeMs) / 1000.0);

    auto aspect = (getWidth() > 0 && getHeight() > 0) ? (float) getWidth() / (float) getHeight() : 1.0f;
    auto w = 0.9f;
    auto h = aspect > 0.0f ? w / aspect : w;
    auto projection = juce::Matrix3D<float>::fromFrustum (-w, w, -h, h, 1.0f, 10.0f);

    auto bobY = std::sin (elapsedSeconds * 1.1f) * 0.12f;
    auto spin = elapsedSeconds * 0.6f;
    auto tilt = 0.35f + std::sin (elapsedSeconds * 0.5f) * 0.08f;

    auto view = juce::Matrix3D<float>::fromTranslation ({ 0.0f, bobY, -3.0f })
                    * juce::Matrix3D<float>::rotation ({ tilt, spin, 0.0f });

    if (projectionUniform != nullptr) projectionUniform->setMatrix4 (projection.mat, 1, false);
    if (viewUniform != nullptr)       viewUniform->setMatrix4 (view.mat, 1, false);

    if (colourUniform != nullptr)
        colourUniform->set (currentAccent.getFloatRed(), currentAccent.getFloatGreen(),
                             currentAccent.getFloatBlue(), 1.0f);

    glBindBuffer (GL_ARRAY_BUFFER, vertexBufferId);
    glBindBuffer (GL_ELEMENT_ARRAY_BUFFER, indexBufferId);

    if (positionAttribute != nullptr)
    {
        glVertexAttribPointer (positionAttribute->attributeID, 3, GL_FLOAT, GL_FALSE, sizeof (Vertex), nullptr);
        glEnableVertexAttribArray (positionAttribute->attributeID);
    }

    if (normalAttribute != nullptr)
    {
        glVertexAttribPointer (normalAttribute->attributeID, 3, GL_FLOAT, GL_FALSE, sizeof (Vertex),
                                (GLvoid*) (sizeof (float) * 3));
        glEnableVertexAttribArray (normalAttribute->attributeID);
    }

    glDrawElements (GL_TRIANGLES, numIndices, GL_UNSIGNED_INT, nullptr);

    if (positionAttribute != nullptr) glDisableVertexAttribArray (positionAttribute->attributeID);
    if (normalAttribute != nullptr)   glDisableVertexAttribArray (normalAttribute->attributeID);

    glBindBuffer (GL_ARRAY_BUFFER, 0);
    glBindBuffer (GL_ELEMENT_ARRAY_BUFFER, 0);
}

} // namespace phonetesto
