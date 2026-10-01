from PIL import Image, ImageDraw
import numpy as np

def build_perfect_you():
    # 1. Base Canvas
    canvas = Image.new("RGBA", (1600, 1600), (255, 255, 255, 255))

    # 2. Right Figure (Listener from person.png)
    person = Image.open("assets/symbols/person.png").convert("RGBA")
    # In you.png, listener has a neutral mouth (flat line). Let's give it the neutral mouth or smile:
    # Actually, Pip AAC person is friendly, smile is great! Or keep neutral line if desired.
    scale = 0.86
    pw = int(person.width * scale)
    ph = int(person.height * scale)
    person_scaled = person.resize((pw, ph), Image.Resampling.LANCZOS)
    
    # Position listener: center at x = 1180, top at y = 140
    # pw = 1376 -> left = 1180 - (1376 // 2) = 492
    canvas.paste(person_scaled, (492, 140), person_scaled)

    # 3. Left Figure (Speaker)
    # Head, left arm, torso from you.png
    im_you = Image.open("assets/symbols/you.png").convert("RGBA")
    arr_you = np.array(im_you)

    left_fig = arr_you.copy()
    # Erase old tube arm and right figure
    left_fig[:, 720:] = [255, 255, 255, 255]
    left_fig[560:820, 310:720] = [255, 255, 255, 255]

    mask_left = (left_fig[:, :, 0] < 240) | (left_fig[:, :, 1] < 240) | (left_fig[:, :, 2] < 240)
    canvas_arr = np.array(canvas)
    canvas_arr[mask_left] = left_fig[mask_left]

    img = Image.fromarray(canvas_arr)
    draw = ImageDraw.Draw(img)

    # Repair speaker head circle arc (close bottom-right gap)
    # Head center in you.png is around (348, 360), radius ~250
    draw.arc([(98, 110), (598, 610)], start=30, end=90, fill=(0, 0, 0, 255), width=28)

    # Clean neck & shoulder lines
    # Left neck line is at x ~ 214, right neck line at x ~ 430
    # Let's cleanly draw neck-to-shoulder
    draw.line([(420, 595), (420, 680)], fill=(0, 0, 0, 255), width=28)
    draw.line([(420, 680), (420, 1450)], fill=(0, 0, 0, 255), width=28)

    # Pointing Stick Arm: from right shoulder (420, 750) down-angled towards listener chest (800, 850)
    draw.line([(420, 750), (810, 830)], fill=(0, 0, 0, 255), width=28)

    # Single-Finger Mitten Hand:
    # Rotate mitten slightly to match arm angle (~12 degrees down)
    mitten = Image.open("/tmp/mitten_clean.png").convert("RGBA")
    mw = int(mitten.width * 0.90)
    mh = int(mitten.height * 0.90)
    mitten_scaled = mitten.resize((mw, mh), Image.Resampling.LANCZOS)
    mitten_rot = mitten_scaled.rotate(-11, expand=True, resample=Image.Resampling.BICUBIC)

    # Make outer white transparent
    m_arr = np.array(mitten_rot)
    # Mask non-white
    m_mask = (m_arr[:, :, 0] < 240) | (m_arr[:, :, 1] < 240) | (m_arr[:, :, 2] < 240)
    
    # Paste mitten so wrist is at (810, 830)
    img.paste(mitten_rot, (790, 740), mitten_rot)

    # Clean any tiny stray pixels
    img.save("/tmp/perfect_you.png")
    print("Saved /tmp/perfect_you.png")

def build_perfect_they():
    canvas = Image.new("RGBA", (1600, 1600), (255, 255, 255, 255))

    # 1. Right Figures: Two people from they_hands_test.png
    im_they = Image.open("/tmp/they_hands_test.png").convert("RGBA")
    arr_they = np.array(im_they)

    # Erase old floating hand
    they_clean = arr_they.copy()
    they_clean[:, :700] = [255, 255, 255, 255]
    # Also clean the little yellow collar speck on Figure 1 shoulder (x in [850, 920], y in [650, 720])
    for y in range(640, 730):
        for x in range(850, 920):
            if (they_clean[y, x, 0] > 200) and (they_clean[y, x, 1] > 160) and (they_clean[y, x, 2] < 100):
                they_clean[y, x] = [255, 255, 255, 255]

    crop_they = Image.fromarray(they_clean).crop((700, 150, 1580, 1450))
    scale = 0.86
    tw = int(crop_they.width * scale)
    th = int(crop_they.height * scale)
    crop_they_scaled = crop_they.resize((tw, th), Image.Resampling.LANCZOS)

    # Paste they figures on right
    canvas.paste(crop_they_scaled, (1600 - tw - 20, 180), crop_they_scaled)

    # 2. Speaker (scaled by 0.86)
    im_you = Image.open("/tmp/perfect_you.png").convert("RGBA")
    # Crop just the speaker + arm + hand from perfect_you
    speaker = im_you.crop((0, 0, 980, 1600))
    sw = int(speaker.width * 0.92)
    sh = int(speaker.height * 0.92)
    speaker_scaled = speaker.resize((sw, sh), Image.Resampling.LANCZOS)

    arr_spk = np.array(speaker_scaled)
    mask_spk = (arr_spk[:, :, 0] < 240) | (arr_spk[:, :, 1] < 240) | (arr_spk[:, :, 2] < 240)
    canvas_arr = np.array(canvas)
    canvas_arr[:sh, :sw][mask_spk] = arr_spk[mask_spk]

    img = Image.fromarray(canvas_arr)
    img.save("/tmp/perfect_they.png")
    print("Saved /tmp/perfect_they.png")

build_perfect_you()
build_perfect_they()
