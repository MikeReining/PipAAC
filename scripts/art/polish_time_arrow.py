#!/usr/bin/env python3
import os
import numpy as np
from PIL import Image, ImageDraw

BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805"
SRC_PATH = os.path.join(BRAIN_DIR, "batch69_muse_time_arrow.png")
OUT_PATH = os.path.join(BRAIN_DIR, "batch69_norm_time.png")

def main():
    img = Image.open(SRC_PATH).convert("RGB")
    arr = np.array(img, dtype=np.float32)
    h, w, _ = arr.shape

    base = np.full((h, w, 3), 255, dtype=np.uint8)

    for y in range(h):
        for x in range(w):
            r, g, b = arr[y, x]
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if r < 75 and g < 75 and b < 75:
                base[y, x] = [17, 17, 17]
            elif g > 130 and r < 85 and b < 85:
                base[y, x] = [16, 185, 129]  # Emerald green #10B981
            elif r > 90 and r < 210 and g > 40 and g < 135 and b < 85 and (r - b) > 35:
                base[y, x] = [160, 106, 56]  # Warm leather brown #A06A38
            elif g > 100 and r < 90 and b < 90:
                base[y, x] = [16, 185, 129]
            elif (r - b) > 30 and r < 180 and g < 140:
                base[y, x] = [160, 106, 56]
            else:
                if lum < 140:
                    l = int(lum)
                    base[y, x] = [l, l, l]
                else:
                    base[y, x] = [255, 255, 255]

    # Erase sleeve cuff region to the left of x=420 to pure white
    for y in range(h):
        for x in range(420):
            base[y, x] = [255, 255, 255]

    # Supersample 3x for anti-aliased line rendering
    im = Image.fromarray(base)
    im_large = im.resize((w * 3, h * 3), Image.Resampling.BICUBIC)
    draw_large = ImageDraw.Draw(im_large)

    top_m, top_c = 0.08907, 591.67
    bot_m, bot_c = -0.11688, 1094.71

    x0, x1 = 0, 460
    y0_top = top_m * x0 + top_c
    y1_top = top_m * x1 + top_c
    y0_bot = bot_m * x0 + bot_c
    y1_bot = bot_m * x1 + bot_c

    # Draw continuous arm strokes seamlessly connecting to the wrist
    draw_large.line([(x0 * 3, int(y0_top * 3)), (x1 * 3, int(y1_top * 3))], fill=(17, 17, 17), width=int(20 * 3))
    draw_large.line([(x0 * 3, int(y0_bot * 3)), (x1 * 3, int(y1_bot * 3))], fill=(17, 17, 17), width=int(20 * 3))

    im_clean = im_large.resize((w, h), Image.Resampling.LANCZOS)

    # Position into 1600x1600 canvas with arm entering from left border
    arr_clean = np.array(im_clean)
    gray = np.mean(arr_clean, axis=2)
    non_white = np.where(gray < 250)
    ymin, ymax = non_white[0].min(), non_white[0].max()
    xmax = non_white[1].max()

    v_scale = 1260.0 / (ymax - ymin)
    new_w = int(w * v_scale)
    new_h = int(h * v_scale)
    im_scaled = im_clean.resize((new_w, new_h), Image.Resampling.LANCZOS)

    hand_x_scaled = int(xmax * v_scale)
    x_offset = 1460 - hand_x_scaled
    y_offset = (1600 - new_h) // 2 + int((h / 2 - (ymin + ymax) / 2) * v_scale)

    canvas = Image.new("RGB", (1600, 1600), (255, 255, 255))
    canvas.paste(im_scaled, (x_offset, y_offset))

    # Extend arm lines to x=0 if x_offset > 0
    if x_offset > 0:
        draw_canvas = ImageDraw.Draw(canvas)
        top_y_canvas = int(y0_top * v_scale) + y_offset
        bot_y_canvas = int(y0_bot * v_scale) + y_offset
        line_w = int(20 * v_scale)
        draw_canvas.line([(0, top_y_canvas), (x_offset + 5, top_y_canvas)], fill=(17, 17, 17), width=line_w)
        draw_canvas.line([(0, bot_y_canvas), (x_offset + 5, bot_y_canvas)], fill=(17, 17, 17), width=line_w)

    canvas.save(OUT_PATH)
    print(f"Polished time saved to {OUT_PATH}")

if __name__ == "__main__":
    main()
