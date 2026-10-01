from PIL import Image, ImageDraw
import numpy as np

# 1600x1600 canvas
canvas = Image.new("RGBA", (1600, 1600), (255, 255, 255, 255))

# 1. Right Figure: Listener (Canonical Person from person.png)
person = Image.open("assets/symbols/person.png").convert("RGBA")
scale = 0.88
pw = int(person.width * scale)
ph = int(person.height * scale)
person_scaled = person.resize((pw, ph), Image.Resampling.LANCZOS)

# Position person on right half
canvas.paste(person_scaled, (456, 120), person_scaled)

# 2. Left Figure: Speaker (from you.png)
im_you = Image.open("assets/symbols/you.png").convert("RGBA")
arr_you = np.array(im_you)

# Crop left figure head and body
left_fig = arr_you.copy()
left_fig[:, 750:] = [255, 255, 255, 255]
left_fig[580:800, 350:750] = [255, 255, 255, 255]

# Mask non-white
mask_left = (left_fig[:, :, 0] < 240) | (left_fig[:, :, 1] < 240) | (left_fig[:, :, 2] < 240)
canvas_arr = np.array(canvas)
canvas_arr[mask_left] = left_fig[mask_left]

img = Image.fromarray(canvas_arr)
draw = ImageDraw.Draw(img)

# Complete left figure neck & shoulder
draw.line([(312, 590), (312, 675)], fill=(0, 0, 0, 255), width=28)
draw.line([(312, 675), (420, 710)], fill=(0, 0, 0, 255), width=28)
draw.line([(420, 710), (410, 1450)], fill=(0, 0, 0, 255), width=28)

# Stick arm from shoulder (410, 720) to hand wrist (840, 720)
draw.line([(410, 720), (840, 720)], fill=(0, 0, 0, 255), width=28)

# Pointing mitten hand at (830, 630)
mitten = Image.open("/tmp/mitten_clean.png").convert("RGBA")
mw = int(mitten.width * 0.95)
mh = int(mitten.height * 0.95)
mitten_scaled = mitten.resize((mw, mh), Image.Resampling.LANCZOS)

img.paste(mitten_scaled, (830, 630), mitten_scaled)

img.save("/tmp/fixed_you.png")
print("Saved /tmp/fixed_you.png")
