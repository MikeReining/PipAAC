from PIL import Image, ImageDraw
import numpy as np

# Canvas: 1600 x 1600
canvas = Image.new("RGBA", (1600, 1600), (255, 255, 255, 255))

# 1. Right Figure: Canonical Person (Listener)
person = Image.open("assets/symbols/person.png").convert("RGBA")
# Scale person so it fits comfortably on right half
scale = 0.88
pw = int(person.width * scale)
ph = int(person.height * scale)
person_scaled = person.resize((pw, ph), Image.Resampling.LANCZOS)

# In person_scaled, center is at pw // 2 = 704
# Place person on right: center at x = 1180 -> left = 1180 - 704 = 476
# y top around 140
canvas.paste(person_scaled, (476, 140), person_scaled)

# 2. Left Figure: Speaker (from you.png, with clean stick arm)
im_you = Image.open("assets/symbols/you.png").convert("RGBA")
arr_you = np.array(im_you)

# Crop left figure without tube arm
left_fig = arr_you.copy()
# Erase tube arm and right figure
left_fig[580:800, 360:1100] = [255, 255, 255, 255]
left_fig[:, 750:] = [255, 255, 255, 255]

# Mask left figure non-white pixels
mask_left = (left_fig[:, :, 0] < 240) | (left_fig[:, :, 1] < 240) | (left_fig[:, :, 2] < 240)
canvas_arr = np.array(canvas)
canvas_arr[mask_left] = left_fig[mask_left]

# ImageDraw for vector strokes
img = Image.fromarray(canvas_arr)
draw = ImageDraw.Draw(img)

# Complete left figure right neck and shoulder contour
# Neck right stroke: from (312, 595) to (312, 670)
draw.line([(312, 590), (312, 675)], fill=(0, 0, 0, 255), width=28)
# Right shoulder curve: from (312, 675) curving to (430, 710)
draw.line([(312, 675), (420, 705)], fill=(0, 0, 0, 255), width=28)
# Body right side down: from (420, 705) to (420, 1450)
draw.line([(420, 705), (410, 1450)], fill=(0, 0, 0, 255), width=28)

# Pointing arm: Monoline stick arm from shoulder (410, 730) extending towards listener chest (850, 850)
# Let's draw stick arm to the wrist at (740, 780)
draw.line([(410, 720), (740, 770)], fill=(0, 0, 0, 255), width=28)

# Now Single-Finger Mitten Hand:
# We draw the clean vector Single-Finger Mitten pointing right!
# Or paste clean mitten
