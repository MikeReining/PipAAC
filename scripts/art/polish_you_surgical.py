from PIL import Image, ImageDraw
import numpy as np

im = Image.open("/tmp/you_surgical_perfect.png").convert("RGBA")
arr = np.array(im)

YELLOW = (252, 197, 29, 255)
WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)

# 1. Clean up yellow that spills above the shoulder line of the right figure
# In right figure (x > 800):
# Shoulder line curves from neck (1180, 630) down to (1040, 780)
# Above the shoulder curve, erase any yellow to white:
# Specifically, in the region x in [1030, 1180], y in [600, 750]:
# and in x in [1340, 1450], y in [600, 750]:
for y in range(600, 780):
    for x in range(1000, 1180):
        # Check if this pixel is yellow
        if (arr[y, x, 0] > 200) and (arr[y, x, 1] > 160) and (arr[y, x, 2] < 100):
            # If it is to the left of the shoulder curve, make it white
            # Shoulder curve roughly: y = 630 + (1180 - x) * 1.05
            if y < (630 + (1180 - x) * 1.05):
                arr[y, x] = WHITE

    for x in range(1340, 1480):
        if (arr[y, x, 0] > 200) and (arr[y, x, 1] > 160) and (arr[y, x, 2] < 100):
            if y < (630 + (x - 1340) * 1.05):
                arr[y, x] = WHITE

# 2. Left figure: smooth the right side of the torso from shoulder down
# Shoulder is at (430, 680). The vertical torso stroke should connect smoothly at (430, 680)
# Erase the stray black segment at x in [270, 320], y in [660, 690]
arr[660:695, 260:325] = WHITE

# Recreate PIL Image and draw clean strokes
img = Image.fromarray(arr)
draw = ImageDraw.Draw(img)

# Connect right neck (312, 590) to right shoulder (430, 680)
draw.line([(312, 590), (430, 680)], fill=BLACK, width=28)
# Vertical torso right border down from (430, 680)
draw.line([(430, 680), (410, 1450)], fill=BLACK, width=28)
# Re-assert arm from (430, 680) to (885, 680)
draw.line([(430, 680), (885, 680)], fill=BLACK, width=28)

img.save("/tmp/you_polished_master.png")
print("Saved /tmp/you_polished_master.png")
