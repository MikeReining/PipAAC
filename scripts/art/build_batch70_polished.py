#!/usr/bin/env python3
import os
import numpy as np
from PIL import Image, ImageDraw, ImageOps

BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805"
SYMBOLS_DIR = "assets/symbols"
EXTENDED_DIR = "out/extended_art"

def normalize_white(img, threshold=240):
    """Convert any pixel with R,G,B all >= threshold to pure (255, 255, 255)."""
    img_rgba = img.convert("RGBA")
    arr = np.array(img_rgba)
    white_mask = (arr[:, :, 0] >= threshold) & (arr[:, :, 1] >= threshold) & (arr[:, :, 2] >= threshold)
    arr[white_mask, 0] = 255
    arr[white_mask, 1] = 255
    arr[white_mask, 2] = 255
    arr[white_mask, 3] = 255
    return Image.fromarray(arr)

def build_all():
    print("Building polished Batch 70 images...")

    # 1. ROUND (#21)
    raw_round = Image.open(f"{BRAIN_DIR}/batch70_muse_round.png")
    norm_round = normalize_white(raw_round)
    norm_round.save(f"{BRAIN_DIR}/batch70_norm_round.png")
    print("1. Polished round")

    # 2. ANY (#22)
    raw_any = Image.open(f"{BRAIN_DIR}/batch70_muse_any.png")
    # Crop horizontal 3 circles and center on 1600x1600
    crop_any = raw_any.crop((70, 300, 1850, 1000))
    target_w = 1420
    target_h = int(crop_any.height * (target_w / crop_any.width))
    resized_any = crop_any.resize((target_w, target_h), Image.Resampling.LANCZOS)
    sq_any = Image.new("RGBA", (1600, 1600), (255, 255, 255, 255))
    sq_any.paste(resized_any, ((1600 - target_w) // 2, (1600 - target_h) // 2))
    norm_any = normalize_white(sq_any)
    norm_any.save(f"{BRAIN_DIR}/batch70_norm_any.png")
    print("2. Polished any")

    # 3. BETTER (#23)
    good = Image.open(f"{SYMBOLS_DIR}/good.png").convert("RGBA")
    better = good.copy()
    d_better = ImageDraw.Draw(better)
    cx, cy, r = 1320, 270, 150
    # White badge circle
    d_better.ellipse([(cx - r, cy - r), (cx + r, cy + r)], fill=(255, 255, 255), outline=(17, 17, 17), width=24)
    # Green Upward Arrow
    arrow_poly = [
        (cx, cy - 90),
        (cx + 75, cy),
        (cx + 32, cy),
        (cx + 32, cy + 85),
        (cx - 32, cy + 85),
        (cx - 32, cy),
        (cx - 75, cy),
    ]
    d_better.polygon(arrow_poly, fill=(16, 185, 129), outline=(17, 17, 17), width=12)
    better.save(f"{BRAIN_DIR}/batch70_norm_better.png")
    print("3. Polished better")

    # 4. FIRE (#24)
    raw_fire = Image.open(f"{EXTENDED_DIR}/fire.png")
    norm_fire = normalize_white(raw_fire)
    norm_fire.save(f"{BRAIN_DIR}/batch70_norm_fire.png")
    print("4. Polished fire")

    # 5. ALRIGHT (#25)
    okay = Image.open(f"{SYMBOLS_DIR}/okay.png")
    okay.save(f"{BRAIN_DIR}/batch70_norm_alright.png")
    print("5. Polished alright (reusing okay.png)")

    # 6. CALLED (#26) + CALL (base)
    raw_call = Image.open(f"{BRAIN_DIR}/batch70_muse_call.png")
    norm_call = normalize_white(raw_call)
    norm_call.save(f"{BRAIN_DIR}/batch70_norm_call.png")

    called = norm_call.copy()
    d_called = ImageDraw.Draw(called)
    # Standard past badge [ ◀◀ ]
    x0, y0, x1, y1 = 1163, 82, 1163 + 354, 82 + 174
    rx = 87
    d_called.rounded_rectangle([(x0, y0), (x1, y1)], radius=rx, fill=(255, 255, 255), outline=(17, 17, 17), width=26)
    d_called.polygon([(1328, 122), (1238, 169), (1328, 216)], fill=(17, 17, 17))
    d_called.polygon([(1425, 122), (1335, 169), (1425, 216)], fill=(17, 17, 17))
    called.save(f"{BRAIN_DIR}/batch70_norm_called.png")
    print("6. Polished called (+ call)")

    # 7. DAY (#27)
    raw_day = Image.open(f"{BRAIN_DIR}/batch70_muse_day.png")
    # Crop to 1600x1600 matching morning/night
    crop_day = raw_day.crop((0, 0, 1350, 1280)).resize((1600, 1600), Image.Resampling.LANCZOS)
    norm_day = normalize_white(crop_day)
    norm_day.save(f"{BRAIN_DIR}/batch70_norm_day.png")
    print("7. Polished day")

    # 8. SHALL (#28)
    raw_shall = Image.open(f"{BRAIN_DIR}/batch70_muse_shall.png")
    crop_shall = raw_shall.crop((100, 260, 1500, 1340))
    new_w = int(crop_shall.width * 1.12)
    new_h = int(crop_shall.height * 1.12)
    resized_shall = crop_shall.resize((new_w, new_h), Image.Resampling.LANCZOS)
    grounded_shall = Image.new("RGBA", (1600, 1600), (255, 255, 255, 255))
    grounded_shall.paste(resized_shall, ((1600 - new_w) // 2, 1600 - new_h))
    norm_shall = normalize_white(grounded_shall)
    norm_shall.save(f"{BRAIN_DIR}/batch70_norm_shall.png")
    print("8. Polished shall")

    # 9. WHICH (#29)
    # Pip presenting choices with question mark
    which_perfect = Image.open(f"{BRAIN_DIR}/test_which_perfect.png")
    crop_which = which_perfect.crop((100, 0, 1500, 1340))
    w_scale = 1.12
    nw = int(crop_which.width * w_scale)
    nh = int(crop_which.height * w_scale)
    resized_which = crop_which.resize((nw, nh), Image.Resampling.LANCZOS)
    grounded_which = Image.new("RGBA", (1600, 1600), (255, 255, 255, 255))
    grounded_which.paste(resized_which, ((1600 - nw) // 2, 1600 - nh))
    norm_which = normalize_white(grounded_which)
    norm_which.save(f"{BRAIN_DIR}/batch70_norm_which.png")
    print("9. Polished which")

    # 10. STAY (#30)
    # Canonical Pip standing firmly planted on circular yellow floor spot marker
    stand = Image.open(f"{SYMBOLS_DIR}/stand.png").convert("RGBA")
    spot_bg = Image.new("RGBA", (1600, 1600), (255, 255, 255, 255))
    d_spot = ImageDraw.Draw(spot_bg)
    # Ellipse spot centered under Pip's feet (feet at x: 610-990, y: 1350-1430)
    d_spot.ellipse([(450, 1330), (1150, 1490)], fill=(251, 191, 36), outline=(17, 17, 17), width=24)
    arr_stand = np.array(stand)
    arr_spot = np.array(spot_bg)
    pip_mask = (arr_stand[:, :, 0] < 240) | (arr_stand[:, :, 1] < 240) | (arr_stand[:, :, 2] < 240)
    arr_spot[pip_mask] = arr_stand[pip_mask]
    norm_stay = Image.fromarray(arr_spot)
    norm_stay.save(f"{BRAIN_DIR}/batch70_norm_stay.png")
    print("10. Polished stay (canonical stand on floor spot)")

    # Generate 10-Item Contact Sheet Grid (2 rows x 5 cols)
    print("Generating review contact sheet grid...")
    items = [
        ("round", "#21 round"),
        ("any", "#22 any"),
        ("better", "#23 better"),
        ("fire", "#24 fire"),
        ("alright", "#25 alright"),
        ("called", "#26 called"),
        ("day", "#27 day"),
        ("shall", "#28 shall"),
        ("which", "#29 which"),
        ("stay", "#30 stay"),
    ]

    tile_size = 400
    pad = 40
    header = 60
    grid_w = 5 * tile_size + 6 * pad
    grid_h = 2 * (tile_size + header) + 3 * pad

    grid = Image.new("RGBA", (grid_w, grid_h), (248, 249, 250, 255))
    d_grid = ImageDraw.Draw(grid)

    for idx, (key, label) in enumerate(items):
        r = idx // 5
        c = idx % 5
        x = pad + c * (tile_size + pad)
        y = pad + r * (tile_size + header + pad)

        img = Image.open(f"{BRAIN_DIR}/batch70_norm_{key}.png").resize((tile_size, tile_size), Image.Resampling.LANCZOS)
        grid.paste(img, (x, y))
        d_grid.rectangle([(x, y), (x + tile_size, y + tile_size)], outline=(209, 213, 219), width=2)
        d_grid.text((x + 10, y + tile_size + 15), label, fill=(17, 24, 39))

    grid.save(f"{BRAIN_DIR}/batch70_grid.png")
    print("Saved batch70_grid.png")

    # Generate 48px tile test strip
    strip_w = 10 * 48 + 11 * 16
    strip_h = 48 + 32
    strip = Image.new("RGBA", (strip_w, strip_h), (240, 240, 240, 255))

    for idx, (key, _) in enumerate(items):
        img_48 = Image.open(f"{BRAIN_DIR}/batch70_norm_{key}.png").resize((48, 48), Image.Resampling.LANCZOS)
        x = 16 + idx * (48 + 16)
        y = 16
        strip.paste(img_48, (x, y))

    strip.save(f"{BRAIN_DIR}/batch70_strip_48.png")
    print("Saved batch70_strip_48.png")

if __name__ == "__main__":
    build_all()
