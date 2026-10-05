#!/usr/bin/env python3
import os
import shutil
import numpy as np
from PIL import Image, ImageDraw

BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805"
REPO_DIR = "/Users/mike/dev/PipAAC"
OUT_DIR = os.path.join(BRAIN_DIR, "batch73_polished")

WORDS = [
    ("else", 52, f"{BRAIN_DIR}/batch73_muse_else.png"),
    ("drive", 54, f"{BRAIN_DIR}/batch73_muse_drive.png"),
    ("fly", 55, f"{BRAIN_DIR}/batch73_muse_fly.png"),
    ("bang", 56, f"{BRAIN_DIR}/batch73_muse_bang.png"),
    ("stick", 57, f"{BRAIN_DIR}/batch73_muse_stick.png"),
    ("money", 58, f"{BRAIN_DIR}/batch73_muse_money_v2.png"),
    ("bring", 59, f"{BRAIN_DIR}/batch73_muse_bring.png"),
    ("game", 60, f"{BRAIN_DIR}/batch73_muse_game_v2.png"),
    ("lot", 61, f"{BRAIN_DIR}/batch73_muse_lot.png"),
    ("much", 62, f"{BRAIN_DIR}/batch73_muse_much_v2.png"),
]

def normalize_white(img, threshold=240):
    """Convert any pixel with R,G,B all >= threshold to pure (255, 255, 255)."""
    img_rgb = img.convert("RGB")
    arr = np.array(img_rgb)
    white_mask = (arr[:, :, 0] >= threshold) & (arr[:, :, 1] >= threshold) & (arr[:, :, 2] >= threshold)
    arr[white_mask] = [255, 255, 255]
    return Image.fromarray(arr)

def square_fit(img, target_size=1600):
    """Ensure the image is square and centered on pure white."""
    w, h = img.size
    if w == h:
        return img.resize((target_size, target_size), Image.Resampling.LANCZOS)
    max_dim = max(w, h)
    sq = Image.new("RGB", (max_dim, max_dim), (255, 255, 255))
    sq.paste(img, ((max_dim - w) // 2, (max_dim - h) // 2))
    return sq.resize((target_size, target_size), Image.Resampling.LANCZOS)

def build_all():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Building polished Batch 73 images...")

    for key, rank, src_path in WORDS:
        if not os.path.exists(src_path):
            print(f"Warning: {src_path} does not exist yet.")
            continue
        im = Image.open(src_path)
        norm = normalize_white(im)
        sq = square_fit(norm, 1600)
        dest = f"{OUT_DIR}/{key}.png"
        sq.save(dest)
        print(f"Polished #{rank} {key} -> {dest}")

    # Build 2x5 contact sheet (400px cells)
    print("Generating batch73_grid.png (400px contact sheet)...")
    cols = 5
    rows = 2
    cell_size = 400
    label_h = 36
    grid_w = cols * cell_size
    grid_h = rows * (cell_size + label_h)
    grid_img = Image.new("RGB", (grid_w, grid_h), (245, 245, 247))
    draw = ImageDraw.Draw(grid_img)

    for idx, (key, rank, _) in enumerate(WORDS):
        c = idx % cols
        r = idx // cols
        x = c * cell_size
        y = r * (cell_size + label_h)

        polished_path = f"{OUT_DIR}/{key}.png"
        if os.path.exists(polished_path):
            tile = Image.open(polished_path).resize((cell_size, cell_size), Image.Resampling.LANCZOS)
            grid_img.paste(tile, (x, y))

        draw.rectangle([x, y + cell_size, x + cell_size, y + cell_size + label_h], fill=(230, 230, 235))
        draw.text((x + 12, y + cell_size + 8), f"#{rank} {key}", fill=(20, 20, 20))

    grid_dest = f"{BRAIN_DIR}/batch73_grid.png"
    grid_img.save(grid_dest)
    print(f"Saved contact sheet to {grid_dest}")

    # Build 48px preview strip (1x10 horizontal strip)
    print("Generating batch73_strip_48.png...")
    strip_w = 10 * 48
    strip_h = 48
    strip_img = Image.new("RGB", (strip_w, strip_h), (255, 255, 255))
    for idx, (key, _, _) in enumerate(WORDS):
        polished_path = f"{OUT_DIR}/{key}.png"
        if os.path.exists(polished_path):
            tile_48 = Image.open(polished_path).resize((48, 48), Image.Resampling.LANCZOS)
            strip_img.paste(tile_48, (idx * 48, 0))

    strip_dest = f"{BRAIN_DIR}/batch73_strip_48.png"
    strip_img.save(strip_dest)
    print(f"Saved 48px strip to {strip_dest}")

if __name__ == "__main__":
    build_all()
