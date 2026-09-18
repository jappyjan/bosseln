#!/usr/bin/env python3
"""Renders the PWA icons for the Boßeln app (no external deps, pure stdlib PNG)."""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "icons")
SS = 4  # supersampling factor

BG = (16, 26, 46)
BALL = (245, 158, 11)
BALL_DARK = (180, 83, 9)
CANDLE = (225, 29, 72)
FLAME = (253, 224, 71)
WHITE = (255, 255, 255)


def blend(dst, src, alpha):
    return tuple(int(round(d + (s - d) * alpha)) for d, s in zip(dst, src))


def over(buf, w, h, x, y, color, alpha=1.0):
    if 0 <= x < w and 0 <= y < h and alpha > 0:
        i = (y * w + x) * 3
        buf[i], buf[i + 1], buf[i + 2] = blend((buf[i], buf[i + 1], buf[i + 2]), color, alpha)


def disc(buf, w, h, cx, cy, r, color, feather=1.0):
    x0, x1 = max(0, int(cx - r - 2)), min(w - 1, int(cx + r + 2))
    y0, y1 = max(0, int(cy - r - 2)), min(h - 1, int(cy + r + 2))
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if d <= r - feather:
                over(buf, w, h, x, y, color, 1.0)
            elif d < r + feather:
                over(buf, w, h, x, y, color, max(0.0, (r + feather - d) / (2 * feather)))


def ring(buf, w, h, cx, cy, r, color, width, feather=1.0):
    x0, x1 = max(0, int(cx - r - width - 2)), min(w - 1, int(cx + r + width + 2))
    y0, y1 = max(0, int(cy - r - width - 2)), min(h - 1, int(cy + r + width + 2))
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            d = abs(math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r)
            if d <= width - feather:
                over(buf, w, h, x, y, color, 1.0)
            elif d < width + feather:
                over(buf, w, h, x, y, color, max(0.0, (width + feather - d) / (2 * feather)))


def rect(buf, w, h, x0, y0, x1, y1, color):
    for y in range(max(0, int(y0)), min(h, int(y1))):
        for x in range(max(0, int(x0)), min(w, int(x1))):
            over(buf, w, h, x, y, color, 1.0)


def rounded_mask(w, h, radius):
    """alpha mask for a rounded square (0 = transparent)"""
    mask = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            dx = min(x + 0.5, w - x - 0.5)
            dy = min(y + 0.5, h - y - 0.5)
            if dx >= radius or dy >= radius:
                mask[y * w + x] = 255
                continue
            d = math.hypot(radius - dx, radius - dy)
            a = (radius - d) / 1.5
            mask[y * w + x] = max(0, min(255, int(255 * max(0.0, min(1.0, a)))))
    return mask


def render(size, rounded=True):
    w = h = size * SS
    buf = [0] * (w * h * 3)
    for i in range(0, len(buf), 3):
        buf[i], buf[i + 1], buf[i + 2] = BG

    # ball (the "Boßel")
    disc(buf, w, h, w * 0.5, h * 0.585, w * 0.255, BALL)
    ring(buf, w, h, w * 0.5, h * 0.585, w * 0.255, BALL_DARK, w * 0.022)
    # seam
    ring(buf, w, h, w * 0.5, h * 0.585, w * 0.145, BALL_DARK, w * 0.013)
    # highlight
    disc(buf, w, h, w * 0.415, h * 0.50, w * 0.055, WHITE, feather=w * 0.02)
    # candle + flame (birthday)
    rect(buf, w, h, w * 0.478, h * 0.325, w * 0.522, h * 0.45, CANDLE)
    disc(buf, w, h, w * 0.5, h * 0.285, w * 0.042, FLAME, feather=w * 0.012)

    mask = rounded_mask(w, h, w * 0.24) if rounded else None

    # downsample
    out = bytearray()
    for y in range(size):
        out.append(0)  # PNG filter type 0
        for x in range(size):
            acc = [0, 0, 0]
            alpha_acc = 0
            for dy in range(SS):
                for dx in range(SS):
                    sx, sy = x * SS + dx, y * SS + dy
                    i = (sy * w + sx) * 3
                    a = 255 if mask is None else mask[sy * w + sx]
                    acc[0] += buf[i] * a
                    acc[1] += buf[i + 1] * a
                    acc[2] += buf[i + 2] * a
                    alpha_acc += a
            n = SS * SS
            if alpha_acc == 0:
                out.extend((0, 0, 0, 0))
            else:
                out.extend(
                    (
                        acc[0] // alpha_acc,
                        acc[1] // alpha_acc,
                        acc[2] // alpha_acc,
                        alpha_acc // n,
                    )
                )
    return bytes(out)


def write_png(path, size, rgba_rows):
    raw = zlib.compress(rgba_rows, 9)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", raw)
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(OUT, exist_ok=True)
    targets = [
        ("icon-192.png", 192, True),
        ("icon-512.png", 512, True),
        ("icon-512-maskable.png", 512, False),
        ("apple-touch-icon.png", 180, True),
    ]
    for name, size, rounded in targets:
        write_png(os.path.join(OUT, name), size, render(size, rounded))
        print("wrote", name, size)

    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <rect width="128" height="128" rx="30" fill="#101a2e"/>
  <circle cx="64" cy="75" r="33" fill="#f59e0b" stroke="#b45309" stroke-width="3"/>
  <circle cx="64" cy="75" r="19" fill="none" stroke="#b45309" stroke-width="1.8"/>
  <circle cx="53" cy="64" r="7" fill="#ffffff" opacity="0.55"/>
  <rect x="61" y="42" width="6" height="16" rx="2" fill="#e11d48"/>
  <circle cx="64" cy="37" r="5.5" fill="#fde047"/>
</svg>
"""
    with open(os.path.join(OUT, "icon.svg"), "w", encoding="utf-8") as f:
        f.write(svg)
    print("wrote icon.svg")


if __name__ == "__main__":
    main()
