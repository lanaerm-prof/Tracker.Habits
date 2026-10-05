# -*- coding: utf-8 -*-
"""Генерация PNG-иконок «Ритма» (192, 512, maskable).

Повторяет icons/icon.svg: бирюзовый градиент #8FB8B2 → #668F89,
кольцо-прогресс с разрывом и точка в цвет светлой темы #F7F5F1.
"""
import math
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "icons")
os.makedirs(OUT, exist_ok=True)

TEAL_A = (143, 184, 178)   # #8FB8B2 — бирюзовый
TEAL_B = (102, 143, 137)   # #668F89 — тёмный бирюзовый
MARK = (247, 245, 241, 255)  # #F7F5F1 — светлый знак


def gradient_bg(size):
    """Диагональный бирюзовый градиент (слева-сверху → справа-снизу)."""
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / max(1, 2 * (size - 1))
            px[x, y] = (
                int(TEAL_A[0] + (TEAL_B[0] - TEAL_A[0]) * t),
                int(TEAL_A[1] + (TEAL_B[1] - TEAL_A[1]) * t),
                int(TEAL_A[2] + (TEAL_B[2] - TEAL_A[2]) * t),
                255,
            )
    return img


def make_icon(size, rounded=True, scale=1.0):
    """rounded — скруглённый «плитка»; иначе — маскируемая иконка во весь кадр."""
    img = gradient_bg(size)

    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    if rounded:
        md.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.226), fill=255)

    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # кольцо-прогресс: радиус 130/512, толщина 34/512, разрыв на севере
    r = size * (130 / 512) * scale
    w = max(4, int(size * (34 / 512) * scale))
    cx = cy = size / 2
    bbox = [cx - r - w / 2, cy - r - w / 2, cx + r + w / 2, cy + r + w / 2]
    d.arc(bbox, start=270, end=225, fill=MARK, width=w)

    # скруглённые концы дуги
    for ang in (270, 225):
        a = math.radians(ang)
        px = cx + math.cos(a) * r
        py = cy + math.sin(a) * r
        rr = w / 2
        d.ellipse([px - rr, py - rr, px + rr, py + rr], fill=MARK)

    # центральная точка
    dot = size * (42 / 512) * scale
    d.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=MARK)

    img.alpha_composite(layer)

    if rounded:
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img


make_icon(192, rounded=True).save(os.path.join(OUT, "icon-192.png"))
make_icon(512, rounded=True).save(os.path.join(OUT, "icon-512.png"))
make_icon(512, rounded=False, scale=0.70).save(os.path.join(OUT, "icon-maskable-512.png"))
print("icons ok:", sorted(os.listdir(OUT)))
