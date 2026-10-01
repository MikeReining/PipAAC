from PIL import Image, ImageDraw
import numpy as np

im = Image.open("assets/symbols/you.png").convert("RGBA")
arr = np.array(im)

# 1. Right Figure:
# Find exact torso fill region:
# The right figure has neck from (1180, 630) to (1340, 630)
# Shoulders curve down to (1040, 800) on left, and (1420, 800) on right
# Vertical torso lines run from (1040, 800) down to (1040, 1480) on left,
# and (1420, 800) down to (1420, 1480) on right.

# Let us fill the torso with clean yellow (#fcc51d)
YELLOW = (252, 197, 29, 255)
WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)

# First, erase all yellow on the right figure (x > 800)
yellow_mask = (arr[:, :, 0] > 200) & (arr[:, :, 1] > 160) & (arr[:, :, 2] < 100)
arr[:, 800:][yellow_mask[:, 800:]] = WHITE

# Now re-fill strictly the torso region:
# We can use ImageDraw on a mask or polygon:
torso_mask = Image.new("L", (1600, 1600), 0)
draw_mask = ImageDraw.Draw(torso_mask)

# Torso outline points:
# Neck top: (1180, 630) -> (1340, 630)
# Left shoulder curve: (1180, 630) -> (1100, 680) -> (1045, 800) -> (1045, 1480)
# Right shoulder curve: (1340, 630) -> (1400, 680) -> (1415, 800) -> (1415, 1480)
# Bottom hem: from (1045, 1480) to (1415, 1480)
torso_poly = [
    (1185, 630),
    (1260, 630),
    (1340, 630),
    (1390, 660),
    (1415, 750),
    (1415, 1480),
    (1045, 1480),
    (1045, 750),
    (1070, 660),
]
draw_mask.polygon(torso_poly, fill=255)

# Apply yellow only where torso_mask is 255 and pixel is not black outline (< 50)
mask_arr = np.array(torso_mask) == 255
not_black = np.mean(arr[:, :, :3], axis=2) > 50
arr[mask_arr & not_black] = YELLOW

# 2. Left Figure: Replace tube arm with monoline stick arm
# Erase old tube arm: x from 430 to 880, y from 600 to 790
arr[600:790, 435:880] = WHITE

# Recreate PIL Image to draw stick arm
img = Image.fromarray(arr)
draw = ImageDraw.Draw(img)

# Monoline stick arm from left shoulder (430, 680) to wrist (880, 680)
draw.line([(430, 680), (885, 680)], fill=BLACK, width=28)

# Close the back/wrist of the pointing mitten hand at x=885
draw.arc([(860, 635), (910, 725)], start=90, end=270, fill=BLACK, width=28)

img.save("/tmp/you_surgical_perfect.png")
print("Saved /tmp/you_surgical_perfect.png")
