#include "QrCodeComponent.h"

#include <qrcodegen.hpp>

namespace phonetesto
{

void QrCodeComponent::setText (const juce::String& text)
{
    if (text == currentText)
        return;

    currentText = text;
    modules.clear();
    size = 0;

    if (text.isNotEmpty())
    {
        try
        {
            const auto qr = qrcodegen::QrCode::encodeText (text.toRawUTF8(), qrcodegen::QrCode::Ecc::MEDIUM);
            size = qr.getSize();
            modules.resize ((size_t) (size * size));

            for (int y = 0; y < size; ++y)
                for (int x = 0; x < size; ++x)
                    modules[(size_t) (y * size + x)] = qr.getModule (x, y);
        }
        catch (const std::exception&)
        {
            size = 0;
            modules.clear();
        }
    }

    repaint();
}

void QrCodeComponent::paint (juce::Graphics& g)
{
    if (size == 0)
        return;

    constexpr int quietZone = 3;
    const int available = juce::jmin (getWidth(), getHeight());
    const int modulePx = available / (size + 2 * quietZone);

    if (modulePx < 1)
        return;

    const int cardPx = modulePx * (size + 2 * quietZone);
    const auto card = juce::Rectangle<int> (cardPx, cardPx).withCentre (getLocalBounds().getCentre());

    g.setColour (juce::Colours::white);
    g.fillRoundedRectangle (card.toFloat(), (float) modulePx * 1.5f);

    g.setColour (juce::Colour (0xff0a0b10));
    const int originX = card.getX() + quietZone * modulePx;
    const int originY = card.getY() + quietZone * modulePx;

    for (int y = 0; y < size; ++y)
        for (int x = 0; x < size; ++x)
            if (modules[(size_t) (y * size + x)])
                g.fillRect (originX + x * modulePx, originY + y * modulePx, modulePx, modulePx);
}

} // namespace phonetesto
