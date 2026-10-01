from PIL import Image, ImageDraw
import numpy as np

im_they = Image.open("assets/symbols/they.png").convert("RGBA")
draw = ImageDraw.Draw(im_they)

# Hand radius: ~45px
r = 45
stroke = 26

def draw_hand(cx, cy):
    # White filled circle with bold black outline
    draw.ellipse([(cx - r, cy - r), (cx + r, cy + r)], fill=(255, 255, 255, 255), outline=(0, 0, 0, 255), width=stroke)

# Figure 1 left hand: at (760, 1310)
draw_hand(760, 1310)
# Figure 1 right hand: at (1095, 1260)
draw_hand(1095, 1260)
# Figure 2 right hand: at (1455, 1260)
draw_hand(1455, 1260)

im_they.save("/tmp/they_hands_test.png")
print("Saved /tmp/they_hands_test.png")
