from PIL import Image
import numpy as np

im = Image.open("assets/symbols/you.png").convert("RGBA")
arr = np.array(im)

# Yellow mask
yellow = (arr[:, :, 0] > 200) & (arr[:, :, 1] > 160) & (arr[:, :, 2] < 100)

# Right figure:
# Inside the two hand circles: make white
# Left hand: around (965, 1415), radius ~60
# Right hand: around (1520, 1415), radius ~60
y_coords, x_coords = np.ogrid[:1600, :1600]
dist_lh = np.sqrt((x_coords - 965)**2 + (y_coords - 1415)**2)
dist_rh = np.sqrt((x_coords - 1520)**2 + (y_coords - 1415)**2)

arr[dist_lh < 55] = [255, 255, 255, 255]
arr[dist_rh < 55] = [255, 255, 255, 255]

# Now the space outside the torso lines:
# Left arm gap: between outer arm line and inner torso line (x from 880 to 1040, y from 750 to 1350)
# Right arm gap: between inner torso line and outer arm line (x from 1420 to 1580, y from 750 to 1350)
# Let's inspect where the inner torso lines are:
# Left torso stroke is at x ~ 1040
# Right torso stroke is at x ~ 1420

# If we turn yellow pixels outside x in [1045, 1415] to pure white:
for y in range(700, 1500):
    # Left side: x < 1040
    arr[y, :1040][yellow[y, :1040]] = [255, 255, 255, 255]
    # Right side: x > 1420
    arr[y, 1420:][yellow[y, 1420:]] = [255, 255, 255, 255]

# Redraw black borders if any were clipped
im_fixed = Image.fromarray(arr)
im_fixed.save("/tmp/you_leak_fixed.png")
print("Saved /tmp/you_leak_fixed.png")
