from PIL import Image, ImageDraw
import numpy as np

# Load they_hands_test.png
im_they = Image.open("/tmp/they_hands_test.png").convert("RGBA")
arr_they = np.array(im_they)

# Erase the floating hand (x < 700)
they_clean = arr_they.copy()
they_clean[:, :700] = [255, 255, 255, 255]

# Scale they figures slightly down so there is plenty of room for speaker
# Current they figures are in x in [720, 1550], y in [180, 1400]
crop_they = Image.fromarray(they_clean).crop((700, 150, 1580, 1450))
# Scale by 0.88
tw = int(crop_they.width * 0.88)
th = int(crop_they.height * 0.88)
crop_they_scaled = crop_they.resize((tw, th), Image.Resampling.LANCZOS)

# Canvas 1600x1600
canvas = Image.new("RGBA", (1600, 1600), (255, 255, 255, 255))
# Paste they figures on right
canvas.paste(crop_they_scaled, (1600 - tw - 40, 150), crop_they_scaled)

# Now load speaker from /tmp/left_fig.png
left_fig = Image.open("/tmp/left_fig.png").convert("RGBA")
# Scale speaker by 0.88 to match scale of they figures
sw = int(left_fig.width * 0.88)
sh = int(left_fig.height * 0.88)
left_fig_scaled = left_fig.resize((sw, sh), Image.Resampling.LANCZOS)

# Paste speaker on left
arr_left = np.array(left_fig_scaled)
mask_left = (arr_left[:, :, 0] < 240) | (arr_left[:, :, 1] < 240) | (arr_left[:, :, 2] < 240)
canvas_arr = np.array(canvas)
canvas_arr[:sh, :sw][mask_left] = arr_left[mask_left]

img = Image.fromarray(canvas_arr)
draw = ImageDraw.Draw(img)

# Connect neck & shoulder of speaker
# Neck & shoulder scaled by 0.88:
# (312 * 0.88 = 274, 590 * 0.88 = 519)
draw.line([(274, 519), (274, 594)], fill=(0, 0, 0, 255), width=26)
draw.line([(274, 594), (370, 625)], fill=(0, 0, 0, 255), width=26)
draw.line([(370, 625), (360, 1300)], fill=(0, 0, 0, 255), width=26)

# Stick arm from shoulder (370, 635) pointing towards (780, 635)
draw.line([(370, 635), (760, 635)], fill=(0, 0, 0, 255), width=26)

# Pointing mitten hand
mitten = Image.open("/tmp/mitten_clean.png").convert("RGBA")
mw = int(mitten.width * 0.85)
mh = int(mitten.height * 0.85)
mitten_scaled = mitten.resize((mw, mh), Image.Resampling.LANCZOS)
img.paste(mitten_scaled, (750, 560), mitten_scaled)

img.save("/tmp/they_with_speaker.png")
print("Saved /tmp/they_with_speaker.png")
