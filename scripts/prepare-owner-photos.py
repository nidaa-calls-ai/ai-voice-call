#!/usr/bin/env python3
"""Prepare owner photos for the Nidaa landing page.

1. upload/2.png (suit, baked-in checkerboard "fake transparency") ->
   public/hussein.png        full-body cutout with real alpha
   public/hussein-avatar.png square face crop (transparent)
2. upload/326ab482-...-(1).png (casual half-body, real background) ->
   public/hussein-casual.jpg optimized JPEG
"""
from PIL import Image, ImageFilter
import os

ROOT = '/home/z/my-project'

# ---------------------------------------------------------------- suit cutout
img = Image.open(f'{ROOT}/upload/2.png').convert('RGB')
W, H = img.size
px = img.load()

def clamp3(c):
    return (max(0, min(255, int(c[0]))), max(0, min(255, int(c[1]))), max(0, min(255, int(c[2]))))

# strong person pixels: dark (suit/hair) or colorful (skin)
strong = Image.new('L', (W, H), 0)
sp = strong.load()
for y in range(H):
    for x in range(W):
        c = px[x, y]
        mx, mn = max(c), min(c)
        if mx < 210 or (mx - mn) > 14:
            sp[x, y] = 255

# morphological close only (bridge thin white slivers at the collar)
k = 13
strong2 = strong.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))

# largest connected component (8-conn)
s2 = strong2.load()
seen = bytearray(W * H)
best, best_n = None, 0
for i in range(W * H):
    if s2[i % W, i // W] and not seen[i]:
        comp = []
        stack = [i]
        seen[i] = 1
        while stack:
            j = stack.pop()
            comp.append(j)
            x, y = j % W, j // W
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                nx, ny = x + dx, y + dy
                kk = ny * W + nx
                if 0 <= nx < W and 0 <= ny < H and s2[nx, ny] and not seen[kk]:
                    seen[kk] = 1
                    stack.append(kk)
        if len(comp) > best_n:
            best_n, best = len(comp), comp
person = set(best)
print('largest comp:', best_n, f'{best_n / (W * H):.0%}')

# fill holes: background = anything reachable from the border without crossing person
bg = bytearray(W * H)
q = []
for x in range(W):
    for y in (0, H - 1):
        i = y * W + x
        if i not in person:
            bg[i] = 1
            q.append(i)
for y in range(H):
    for x in (0, W - 1):
        i = y * W + x
        if i not in person:
            bg[i] = 1
            q.append(i)
while q:
    i = q.pop()
    x, y = i % W, i // W
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H:
            j = ny * W + nx
            if not bg[j] and j not in person:
                bg[j] = 1
                q.append(j)
holes = sum(1 for i in range(W * H) if not bg[i] and i not in person)
print('holes filled:', holes)

# inpaint: bright checker artifacts inside dark suit zones -> suit color field
lum = lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
field = Image.new('RGB', (W, H), (30, 30, 32))
fp = field.load()
for y in range(H):
    for x in range(W):
        if not bg[y * W + x] and lum(px[x, y]) < 150:
            fp[x, y] = px[x, y]
field = field.filter(ImageFilter.GaussianBlur(8))
flp = field.load()

out = img.convert('RGBA')
op = out.load()
replaced = 0
for y in range(2, H - 2):
    for x in range(2, W - 2):
        i = y * W + x
        if bg[i]:
            continue
        if lum(px[x, y]) >= 180:
            dk = tot = 0
            for dy in range(-5, 6):
                for dx in range(-5, 6):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H:
                        tot += 1
                        if lum(px[nx, ny]) < 150:
                            dk += 1
            if tot and dk / tot > 0.55:
                op[x, y] = (*clamp3(flp[x, y]), 255)
                replaced += 1
print('inpainted px:', replaced)

# alpha mask with soft feather
mask = Image.new('L', (W, H), 0)
mp = mask.load()
for y in range(H):
    for x in range(W):
        if not bg[y * W + x]:
            mp[x, y] = 255
mask = mask.filter(ImageFilter.GaussianBlur(1.0))
ap = mask.load()
for y in range(H):
    for x in range(W):
        a = ap[x, y]
        if a < 255:
            r, g, b = clamp3(op[x, y][:3])
            op[x, y] = (r, g, b, a)

bbox = mask.getbbox()
print('bbox:', bbox)
out_c = out.crop(bbox)
out_c.save(f'{ROOT}/public/hussein.png')
print('cutout:', out_c.size)

# face avatar square crop (transparent)
bx0, by0, bx1, by1 = bbox
side = 360
cx = (bx0 + bx1) // 2 - 20
x0 = max(0, min(cx - side // 2, W - side))
y0 = max(0, by0 - 36)
av = out.crop((x0, y0, min(W, x0 + side), min(H, y0 + side)))
av.save(f'{ROOT}/public/hussein-avatar.png')
print('avatar:', av.size)

# ------------------------------------------------------------- casual photo
src = f'{ROOT}/upload/326ab482-5c41-4c22-a395-f1201de2a89a (1).png'
cas = Image.open(src).convert('RGB')
cas.save(f'{ROOT}/public/hussein-casual.jpg', quality=82, optimize=True, progressive=True)
print('casual:', cas.size, os.path.getsize(f'{ROOT}/public/hussein-casual.jpg') // 1024, 'KB')

# ---------------------------------------------------------------- previews
for bgc, name in (((16, 185, 129), 'emerald'), ((255, 255, 255), 'white')):
    bgim = Image.new('RGB', out_c.size, bgc)
    bgim.paste(out_c, (0, 0), out_c)
    bgim.thumbnail((360, 540))
    bgim.save(f'/tmp/final-{name}.png')
chest = Image.new('RGB', out_c.size, (16, 185, 129))
chest.paste(out_c, (0, 0), out_c)
chest.crop((0, 0, 462, 560)).save('/tmp/final-chest.png')
avp = Image.new('RGB', (380, 380), (16, 185, 129))
avp.paste(av, (10, 10), av)
avp.save('/tmp/final-avatar.png')
print('previews saved')
