"""Builds the site icons from art/icon-source.png, Dan's own AI-generated image made for the site (see README, Art).
Run: python3 scripts/make-icons.py
Writes icon-192.png and icon-512.png (rounded corners), icon-maskable-512.png (full-bleed for Android's masks),
apple-touch-icon.png (square, iOS rounds it) and favicon-32.png (tighter crop so the house still reads that small).
Bump js/version.js afterwards (see CLAUDE.md)."""
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
import os

here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = Image.open(os.path.join(here, 'art', 'icon-source.png')).convert('RGB')
W, H = src.size

def square(img, cx=0.5, cy=0.5, frac=1.0):
    """A square crop of side frac*min(W,H), centred at (cx, cy) as fractions of the image."""
    w, h = img.size
    s = int(min(w, h) * frac)
    x = min(max(int(cx * w - s / 2), 0), w - s)
    y = min(max(int(cy * h - s / 2), 0), h - s)
    return img.crop((x, y, x + s, y + s))

def rounded(img, radius_frac=0.18):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), int(img.size[0] * radius_frac), fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m)
    return out

def small(img, size):
    """Downscale with a little extra contrast and sharpening, so details survive at tiny sizes."""
    im = img.resize((size, size), Image.LANCZOS)
    im = ImageEnhance.Contrast(im).enhance(1.12)
    return im.filter(ImageFilter.UnsharpMask(radius=1, percent=60, threshold=2))

full = square(src)                                 # the whole scene
tight = square(src, cx=0.505, cy=0.5, frac=0.80)   # closer on the mansion, for small sizes

rounded(full.resize((512, 512), Image.LANCZOS)).save(os.path.join(here, 'icon-512.png'))
rounded(small(tight, 192)).save(os.path.join(here, 'icon-192.png'))
full.resize((512, 512), Image.LANCZOS).save(os.path.join(here, 'icon-maskable-512.png'))
full.resize((180, 180), Image.LANCZOS).save(os.path.join(here, 'apple-touch-icon.png'))
rounded(small(tight, 32), 0.2).save(os.path.join(here, 'favicon-32.png'))
print('icons written from art/icon-source.png (%dx%d)' % (W, H))
