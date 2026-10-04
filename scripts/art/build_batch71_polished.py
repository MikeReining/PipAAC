#!/usr/bin/env python3
import os
import shutil
import numpy as np
from PIL import Image, ImageDraw

BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805"
SYMBOLS_DIR = "assets/symbols"
OUT_DIR = os.path.join(BRAIN_DIR, "batch71_polished")

def normalize_white(img, threshold=240):
    """Convert any pixel with R,G,B all >= threshold to pure (255, 255, 255)."""
    img_rgb = img.convert("RGB")
    arr = np.array(img_rgb)
    white_mask = (arr[:, :, 0] >= threshold) & (arr[:, :, 1] >= threshold) & (arr[:, :, 2] >= threshold)
    arr[white_mask] = [255, 255, 255]
    return Image.fromarray(arr)

def build_all():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Building polished Batch 71 images...")

    # 1. HEAR (#31)
    raw_hear = Image.open(f"{BRAIN_DIR}/batch71_muse_hear.png")
    norm_hear = normalize_white(raw_hear)
    norm_hear.save(f"{OUT_DIR}/hear.png")
    print("1. Polished hear")

    # 2. INTO (#32)
    raw_into = Image.open(f"{BRAIN_DIR}/batch71_muse_into.png")
    w, h = raw_into.size
    cx = w // 2
    crop_into = raw_into.crop((cx - h // 2, 0, cx + h // 2, h))
    norm_into = normalize_white(crop_into).resize((1600, 1600), Image.Resampling.LANCZOS)
    norm_into.save(f"{OUT_DIR}/into.png")
    print("2. Polished into")

    # 3. TOP (#33 - 2D block stack matching more/some)
    norm_top = Image.open(f"{BRAIN_DIR}/top_varA_1600.png")
    norm_top.save(f"{OUT_DIR}/top.png")
    print("3. Polished top (2D stack + indicator arrow)")

    # 4. AROUND (#34)
    raw_around = Image.open(f"{BRAIN_DIR}/batch71_muse_around.png")
    norm_around = normalize_white(raw_around)
    norm_around.save(f"{OUT_DIR}/around.png")
    print("4. Polished around")

    # 5. BIRTHDAY (#35)
    raw_bday = Image.open(f"{BRAIN_DIR}/batch71_muse_birthday.png")
    bw, bh = raw_bday.size
    sq_bday = Image.new("RGB", (bw, bw), (255, 255, 255))
    sq_bday.paste(raw_bday, (0, (bw - bh) // 2))
    norm_bday = normalize_white(sq_bday).resize((1600, 1600), Image.Resampling.LANCZOS)
    norm_bday.save(f"{OUT_DIR}/birthday.png")
    print("5. Polished birthday")

    # 6. PICK (#36)
    raw_pick = Image.open(f"{BRAIN_DIR}/batch71_muse_pick.png")
    norm_pick = normalize_white(raw_pick)
    norm_pick.save(f"{OUT_DIR}/pick.png")
    print("6. Polished pick")

    # 7. HIDE (#37)
    im_hide = Image.open(f"{BRAIN_DIR}/batch71_muse_hide.png").convert("RGB")
    ImageDraw.floodfill(im_hide, (10, 10), (238, 233, 222), thresh=50)
    crop_hide = im_hide.crop((350, 0, 350 + 1280, 1280))
    norm_hide = normalize_white(crop_hide).resize((1600, 1600), Image.Resampling.LANCZOS)
    norm_hide.save(f"{OUT_DIR}/hide.png")
    print("7. Polished hide")

    # 8. NOISE (#38)
    raw_noise = Image.open(f"{BRAIN_DIR}/batch71_muse_noise.png")
    norm_noise = normalize_white(raw_noise)
    norm_noise.save(f"{OUT_DIR}/noise.png")
    print("8. Polished noise")

    # 9. FIT (#39 - Tetris T-piece)
    raw_fit = Image.open(f"{BRAIN_DIR}/test_tetris_fit_halfway.png")
    norm_fit = normalize_white(raw_fit)
    norm_fit.save(f"{OUT_DIR}/fit.png")
    print("9. Polished fit (Tetris)")

    # 10. BY (#40 - Hand-crafted glyph)
    shutil.copyfile(f"{BRAIN_DIR}/by_cand1.svg", f"{OUT_DIR}/by.svg")
    im_by = Image.open(f"{BRAIN_DIR}/by_cand1_1600.png")
    im_by.save(f"{OUT_DIR}/by.png")
    print("10. Polished by (SVG glyph)")

if __name__ == "__main__":
    build_all()
