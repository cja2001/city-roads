"""Draws city_roads/icon.png: the web app's blue gradient with a street grid."""
import os
from PIL import Image, ImageDraw

S = 256
img = Image.new('RGBA', (S, S))
top, bottom = (0x3a, 0x7f, 0xe8), (0x5b, 0x6e, 0xf5)
grad = Image.new('RGBA', (S, S))
for y in range(S):
    t = y / (S - 1)
    c = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,)
    ImageDraw.Draw(grad).line([(0, y), (S, y)], fill=c)
mask = Image.new('L', (S, S))
ImageDraw.Draw(mask).rounded_rectangle([8, 8, S - 8, S - 8], radius=48, fill=255)
img.paste(grad, (0, 0), mask)
d = ImageDraw.Draw(img)
white = (255, 255, 255, 255)
for x in (80, 168):
    d.line([(x, 30), (x, S - 30)], fill=white, width=14)
for y in (96, 176):
    d.line([(30, y), (S - 30, y)], fill=white, width=10)
d.line([(40, 220), (220, 40)], fill=(255, 255, 255, 200), width=18)
out = os.path.join(os.path.dirname(__file__), '..', 'city_roads', 'icon.png')
img.resize((64, 64), Image.LANCZOS).save(out)
