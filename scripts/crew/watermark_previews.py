#!/usr/bin/env python3
"""Add the required SI-assisted render label to the crew preview images.

The Blender build regenerates the previews without the label. Run this script
after `build_crew.py` to restore the visible SI marking required by the NASA
Space Apps SI policy.

Usage:
    python3 scripts/crew/watermark_previews.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PREV_DIR = Path(__file__).resolve().parent / "previews"
LABEL = "SI-ASSISTED RENDER"
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FALLBACK_FONT_SIZE = 22


def main() -> None:
    try:
        font = ImageFont.truetype(FONT_PATH, FALLBACK_FONT_SIZE)
    except OSError:
        font = ImageFont.load_default()

    for path in sorted(PREV_DIR.glob("*.png")):
        image = Image.open(path).convert("RGB")
        draw = ImageDraw.Draw(image, "RGBA")
        box = draw.textbbox((0, 0), LABEL, font=font)
        text_w = box[2] - box[0]
        text_h = box[3] - box[1]
        x = image.width - text_w - 24
        y = image.height - text_h - 24
        draw.rectangle(
            [x - 8, y - 5, x + text_w + 8, y + text_h + 7],
            fill=(0, 0, 0, 135),
        )
        draw.text((x, y), LABEL, font=font, fill=(255, 255, 255, 220))
        image.save(path)
        print(f"marked {path}")


if __name__ == "__main__":
    main()
