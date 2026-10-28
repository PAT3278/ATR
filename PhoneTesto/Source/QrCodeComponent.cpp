#include "QrCodeComponent.h"

#include <qrcodegen.hpp>

namespace phonetesto
{

namespace
{
    constexpr int quietZone = 4; // modules, per the QR spec
}

void QrCodeComponent::setText (const juce::String& text)
{
    if (text == currentText)
        return;

    currentText = text;
    codeImage = {};

    if (text.isNotEmpty())
    {
        try
        {
            const auto qr = qrcodegen::QrCode::encodeText (text.toRawUTF8(), qrcodegen::QrCode::Ecc::MEDIUM);
            const int size = qr.getSize();

            // One pixel per module, quiet zone included; scaled up with
            // nearest-neighbour sampling when drawn so module edges stay hard
            // at any window size or display scaling (anti-aliased grey edges
            // at e.g. 125%/150% make codes much harder to scan).
            codeImage = juce::Image (juce::Image::RGB, size + 2 * quietZone, size + 2 * quietZone, false);
            codeImage.clear (codeImage.getBounds(), juce::Colours::white);

            for (int y = 0; y < size; ++y)
                for (int x = 0; x < size; ++x)
                    if (qr.getModule (x, y))
                        codeImage.setPixelAt (x + quietZone, y + quietZone, juce::Colours::black);
        }
        catch (const std::exception&)
        {
            codeImage = {};
        }
    }

    repaint();
}

void QrCodeComponent::paint (juce::Graphics& g)
{
    if (! codeImage.isValid())
        return;

    const int modules = codeImage.getWidth();
    const int modulePx = juce::jmin (getWidth(), getHeight()) / modules;

    if (modulePx < 1)
        return;

    const int cardPx = modulePx * modules;
    const auto card = juce::Rectangle<int> (cardPx, cardPx).withCentre (getLocalBounds().getCentre());

    g.setColour (juce::Colours::white);
    g.fillRoundedRectangle (card.toFloat(), (float) modulePx * 1.5f);

    g.setImageResamplingQuality (juce::Graphics::lowResamplingQuality);
    g.drawImage (codeImage, card.toFloat(), juce::RectanglePlacement::stretchToFit);
}

} // namespace phonetesto
