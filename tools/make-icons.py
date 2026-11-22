# SPDX-License-Identifier: MIT | Copyright (c) 2026 MASH (Khaled Bhuiyan)
"""Draw the icons of the extension.

A pink rounded square with the waveform of the project in the dark colour of
the panel. It has to read at sixteen pixels, so the bars are few, thick and
evenly spaced.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "icons"

PINK = (243, 169, 180, 255)
DARK = (22, 27, 38, 255)

#: The height of each bar, as a share of the icon.
BARS = (0.34, 0.62, 1.0, 0.62, 0.34)


def draw(size: int) -> Image.Image:
    """Draw one icon at the given size."""
    scale = 8
    box = size * scale
    image = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    draw_on = ImageDraw.Draw(image)

    radius = int(box * 0.22)
    draw_on.rounded_rectangle((0, 0, box - 1, box - 1), radius=radius, fill=PINK)

    count = len(BARS)
    margin = box * 0.22
    usable = box - 2 * margin
    slot = usable / count
    bar_width = slot * 0.46
    centre = box / 2
    for index, share in enumerate(BARS):
        x = margin + slot * (index + 0.5)
        height = usable * share
        top = centre - height / 2
        bottom = centre + height / 2
        draw_on.rounded_rectangle(
            (x - bar_width / 2, top, x + bar_width / 2, bottom),
            radius=bar_width / 2,
            fill=DARK,
        )

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    """Write every icon of the extension."""
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        target = OUT / f"icon{size}.png"
        draw(size).save(target, format="PNG")
        print(f"wrote {target}")


if __name__ == "__main__":
    main()
