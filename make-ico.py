import struct
from PIL import Image, ImageDraw
from io import BytesIO

INK = (0, 47, 167, 255)      # Klein blue
WHITE = (255, 255, 255, 255)
WHITE_DIM = (255, 255, 255, 90)
WHITE_BARE = (255, 255, 255, 35)
WHITE_SMILE = (255, 255, 255, 160)

def draw(sz):
    img = Image.new('RGBA', (sz, sz), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = max(1, int(sz * 0.125))
    x0, y0 = m, int(m * 1.5)
    x1, y1 = sz - m, int(sz - m * 0.5)
    w, h = x1 - x0, y1 - y0
    r = max(1, int(sz * 0.17))

    # body
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=INK)

    # shelf lines: white, dimmed
    if sz >= 32:
        sw = int(w * 0.85)
        sx = int(x0 + (w - sw) / 2)
        sy1 = int(y0 + h * 0.525)
        sh = max(1, int(sz * 0.04))
        d.rounded_rectangle([sx, sy1, sx + sw, sy1 + sh], radius=sh//2, fill=WHITE_DIM)
        sy2 = int(y0 + h * 0.8)
        d.rounded_rectangle([sx, sy2, sx + sw, sy2 + sh], radius=sh//2, fill=WHITE_BARE)

    # white tool silhouettes (64px+)
    if sz >= 64:
        sw = int(w * 0.85)
        sx = int(x0 + (w - sw) / 2)
        sy1 = int(y0 + h * 0.525)
        tool_top = int(sy1 - sz * 0.12)
        tool_h = int(sz * 0.11)
        # hammer (simple rectangle)
        tx = int(sx + sw * 0.12)
        tw = int(sz * 0.09)
        d.rounded_rectangle([tx, tool_top, tx + tw, tool_top + tool_h],
                          radius=int(sz * 0.02), fill=WHITE_DIM)
        # gear (circle)
        cx = int(sx + sw * 0.45)
        cr = int(sz * 0.055)
        d.ellipse([cx - cr, int(sy1 - sz * 0.02 - cr), cx + cr, int(sy1 - sz * 0.02 + cr)], fill=WHITE_DIM)
        # brush (vertical line + horizontal cap)
        bx = int(sx + sw * 0.78)
        bw = max(1, int(sz * 0.025))
        d.rounded_rectangle([bx, tool_top, bx + bw, tool_top + tool_h], radius=bw, fill=WHITE_DIM)

    # eyes: white sclera
    eye_y = int(y0 + h * 0.22)
    eye_rx = max(2, int(sz * 0.07))
    eye_ry = max(2, int(sz * 0.078))
    pupil_r = max(1, int(sz * 0.035))
    lx = int(x0 + w * 0.3)
    rx = int(x0 + w * 0.7)

    d.ellipse([lx - eye_rx, eye_y - eye_ry, lx + eye_rx, eye_y + eye_ry], fill=WHITE)
    d.ellipse([rx - eye_rx, eye_y - eye_ry, rx + eye_rx, eye_y + eye_ry], fill=WHITE)

    # pupils: blue (cutout of eyes)
    d.ellipse([lx - pupil_r + int(sz * 0.015), eye_y - pupil_r + int(sz * 0.01),
               lx + pupil_r + int(sz * 0.015), eye_y + pupil_r + int(sz * 0.01)], fill=INK)
    d.ellipse([rx - pupil_r + int(sz * 0.015), eye_y - pupil_r + int(sz * 0.01),
               rx + pupil_r + int(sz * 0.015), eye_y + pupil_r + int(sz * 0.01)], fill=INK)

    # eye shine: white dots
    if sz >= 32:
        sr = max(1, int(sz * 0.015))
        d.ellipse([lx + int(pupil_r * 0.8), int(eye_y - pupil_r * 0.6),
                   lx + int(pupil_r * 0.8) + sr * 2, int(eye_y - pupil_r * 0.6) + sr * 2], fill=WHITE)
        d.ellipse([rx + int(pupil_r * 0.8), int(eye_y - pupil_r * 0.6),
                   rx + int(pupil_r * 0.8) + sr * 2, int(eye_y - pupil_r * 0.6) + sr * 2], fill=WHITE)

    # blush: subtle white
    if sz >= 32:
        brx, bry = int(sz * 0.05), int(sz * 0.03)
        by = int(y0 + h * 0.33)
        a = 40 if sz >= 48 else 25
        d.ellipse([lx - eye_rx - brx, by - bry, lx - eye_rx + brx, by + bry], fill=(255, 255, 255, a))
        d.ellipse([rx + eye_rx - brx, by - bry, rx + eye_rx + brx, by + bry], fill=(255, 255, 255, a))

    # smile: white arc
    if sz >= 32:
        smile_y = int(y0 + h * 0.45)
        sw_px = max(1, sz // 50)
        d.arc([lx + eye_rx, smile_y, rx - eye_rx, smile_y + int(sz * 0.08)],
              start=0, end=180, fill=WHITE_SMILE, width=sw_px)

    return img


def build_ico(images_with_sizes):
    png_datas = []
    for sz, img in images_with_sizes:
        buf = BytesIO()
        img.save(buf, format='PNG')
        png_datas.append(buf.getvalue())

    count = len(png_datas)
    header = struct.pack('<HHH', 0, 1, count)
    dir_entries = b''
    image_data = b''
    offset = 6 + 16 * count

    for sz, png_data in zip([s for s, _ in images_with_sizes], png_datas):
        w = sz if sz < 256 else 0
        h = sz if sz < 256 else 0
        entry = struct.pack('<BBBBHHII', w, h, 0, 0, 1, 32, len(png_data), offset)
        dir_entries += entry
        image_data += png_data
        offset += len(png_data)

    return header + dir_entries + image_data


sizes = [16, 32, 48, 64, 128, 256]
images = [(s, draw(s)) for s in sizes]
ico_data = build_ico(images)

out = r'C:\Users\Administrator\.claude\dashboard\logo.ico'
with open(out, 'wb') as f:
    f.write(ico_data)

import os
print(f'Saved: {out} ({os.path.getsize(out)} bytes) - {len(sizes)} sizes')
