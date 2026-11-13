"""Generate PWA icons for the Nidaa voice caller app."""
from PIL import Image, ImageDraw, ImageFont

BG = (13, 115, 88)          # deep emerald
BG_LIGHT = (16, 150, 113)
FG = (255, 255, 255)

def rounded_bg(size, radius_ratio):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    # subtle vertical gradient
    for y in range(size):
        t = y / size
        c = tuple(int(BG[i] + (BG_LIGHT[i] - BG[i]) * t) for i in range(3))
        d.line([(0, y), (size, y)], fill=c + (255,))
    mask = Image.new('L', (size, size), 0)
    dm = ImageDraw.Draw(mask)
    dm.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    img.putalpha(mask)
    return img

def draw_phone(img, size):
    d = ImageDraw.Draw(img)
    s = size
    cx, cy = s * 0.5, s * 0.52
    w = s * 0.16          # handset bar thickness
    angle = 45
    # classic "phone receiver": rounded bar + two caps, rotated
    bar = Image.new('RGBA', (int(s * 0.62), int(w)), (0, 0, 0, 0))
    db = ImageDraw.Draw(bar)
    bw, bh = bar.size
    db.rounded_rectangle([0, 0, bw - 1, bh - 1], radius=bh // 2, fill=FG + (255,))
    cap = int(w * 1.25)
    db.rounded_rectangle([0, -cap // 3, cap, bh - 1], radius=int(w * 0.45), fill=FG + (255,))
    db.rounded_rectangle([bw - 1 - cap, -cap // 3, bw - 1, bh - 1], radius=int(w * 0.45), fill=FG + (255,))
    bar = bar.rotate(angle, expand=True, resample=Image.BICUBIC)
    bx, by = cx - bar.width / 2, cy - bar.height / 2
    img.alpha_composite(bar, (int(bx), int(by)))
    # ringing waves
    lw = max(3, int(s * 0.035))
    for i, rr in enumerate([s * 0.40, s * 0.50]):
        d.arc([cx - rr, cy - rr, cx + rr, cy + rr], start=-35, end=25, fill=FG + (230 - i * 60,), width=lw)
    return img

def make_icon(size, out, radius_ratio=0.22):
    img = rounded_bg(size, radius_ratio)
    img = draw_phone(img, size)
    img.save(out)
    print(f"saved {out} ({size}x{size})")

base = '/home/z/my-project/public'
make_icon(192, f'{base}/icon-192.png')
make_icon(512, f'{base}/icon-512.png')
make_icon(512, f'{base}/icon-maskable-512.png', radius_ratio=0.0)  # full-bleed for maskable
print('done')
