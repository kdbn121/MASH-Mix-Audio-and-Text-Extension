#!/usr/bin/env python3
# SPDX-License-Identifier: MIT | Copyright (c) 2026 MASH (Khaled Bhuiyan)
"""Crop a browser screenshot down to the panel column.

The panel is a narrow column inside a wider browser window, so the picture
that the browser takes carries empty space on both sides. This trims that
space away and leaves the panel itself.

Usage:
    python tools/make-screenshot.py <source.png> <target.png>
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    source = Path(argv[1])
    target = Path(argv[2])
    if not source.is_file():
        print(f"the source {source} is not there")
        return 1
    image = Image.open(source).convert("RGB")
    width, height = image.size
    pixels = image.load()

    # The colour of the page background, taken from the top left corner.
    background = pixels[0, 0]

    def off_background(x: int, y: int) -> bool:
        r, g, b = pixels[x, y]
        return (
            abs(r - background[0]) > 4
            or abs(g - background[1]) > 4
            or abs(b - background[2]) > 4
        )

    # A column holds the panel when any pixel of it is off the background.
    busy = []
    for x in range(width):
        busy.append(any(off_background(x, y) for y in range(0, height, 3)))

    # The columns of the panel sit together. The scrollbar of the window is
    # a band of its own, so the widest run is the one wanted.
    runs: list[tuple[int, int]] = []
    start = None
    for x in range(width):
        if busy[x] and start is None:
            start = x
        elif not busy[x] and start is not None:
            runs.append((start, x - 1))
            start = None
    if start is not None:
        runs.append((start, width - 1))
    if not runs:
        print("the picture holds no panel")
        return 1
    left, right = max(runs, key=lambda run: run[1] - run[0])

    pad = 10
    box = (max(0, left - pad), 0, min(width, right + pad), height)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.crop(box).save(target, optimize=True)
    print(f"{source.name} {width}x{height} -> {target.name} {box[2] - box[0]}x{height}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
