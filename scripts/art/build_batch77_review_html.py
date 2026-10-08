#!/usr/bin/env python3
import os
import base64
import shutil
from PIL import Image

BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805"
OUT_DIR = os.path.join(BRAIN_DIR, "batch77_polished")

# 1. Save cache-busted copies of the grid and strip
shutil.copyfile(f"{BRAIN_DIR}/batch77_grid.png", f"{BRAIN_DIR}/batch77_grid_v3.png")
shutil.copyfile(f"{BRAIN_DIR}/batch77_strip_48.png", f"{BRAIN_DIR}/batch77_strip_48_v3.png")
print("Saved cache-busted grid_v3.png and strip_48_v3.png")

def to_base64(path):
    if not os.path.exists(path):
        return ""
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode("utf-8")

ITEMS = [
    ("once", 100, f"{OUT_DIR}/once.png", "Numeral 1 with circular single-cycle repeat arrow (1x)"),
    ("even", 101, f"{OUT_DIR}/even.png", "Slender vertical scale, strictly level horizontal beam, balanced cubes (v2)"),
    ("engine", 106, f"{OUT_DIR}/engine.png", "Mechanical car engine block with cylinder head, pulley, manifold"),
    ("letter", 107, f"{OUT_DIR}/letter.png", "Postal envelope with postage stamp and address lines"),
    ("mouse", 108, f"{OUT_DIR}/mouse.png", "Field mouse in profile with pink-lined ears and whiskers"),
    ("brush", 110, f"{OUT_DIR}/brush.png", "Classic hairbrush with handle and bristle bed"),
    ("mess", 111, f"{OUT_DIR}/mess.png", "Untidy scattered floor clutter (sock, book, pencil, block)"),
    ("blow", 112, f"{OUT_DIR}/blow.png", "Pip in profile with puffed cheeks and balloon (v3)"),
    ("yum", 114, f"{OUT_DIR}/yum.png", "Pure white circular face with closed happy eyes & centered tongue (v3)"),
    ("star", 116, f"{OUT_DIR}/star.png", "Vibrant golden five-pointed star with bold outline"),
]

COMPARISONS = [
    ("even (#101)", [
        ("v1 (Uneven tilt & wide triangle)", to_base64(f"{BRAIN_DIR}/batch77_muse_even.png")),
        ("v2 (Slender vertical, level beam - Active)", to_base64(f"{OUT_DIR}/even.png")),
    ]),
    ("yum (#114)", [
        ("v1 (Belly silhouette)", to_base64(f"{BRAIN_DIR}/batch77_muse_yum.png")),
        ("v2 (Yellow emoji with corner tongue)", to_base64(f"{BRAIN_DIR}/batch77_muse_yum_v2.png")),
        ("v3 (Clean Pip face with centered tongue - Active)", to_base64(f"{OUT_DIR}/yum.png")),
    ]),
    ("blow (#112)", [
        ("v1 (Abstract wavy air lines)", to_base64(f"{BRAIN_DIR}/batch77_muse_blow.png")),
        ("v2 (Puffed cheeks & balloon with gap)", to_base64(f"{BRAIN_DIR}/batch77_muse_blow_v2.png")),
        ("v3 (Pip blowing toward balloon - Active)", to_base64(f"{OUT_DIR}/blow.png")),
    ]),
]

grid_b64 = to_base64(f"{BRAIN_DIR}/batch77_grid.png")
strip_b64 = to_base64(f"{BRAIN_DIR}/batch77_strip_48.png")

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Batch 77 Review — Pip AAC Clipart</title>
<style>
  body {{
    margin: 0;
    padding: 32px;
    background: #0f172a;
    color: #f1f5f9;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }}
  h1 {{ margin: 0 0 6px 0; font-size: 26px; font-weight: 700; color: #ffffff; }}
  .subtitle {{ margin-bottom: 24px; color: #94a3b8; font-size: 15px; }}
  .section-title {{ font-size: 20px; font-weight: 600; margin: 36px 0 16px 0; color: #38bdf8; border-bottom: 1px solid #334155; padding-bottom: 8px; }}
  
  .sheet-container {{
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 32px;
  }}
  .sheet-img {{
    width: 100%;
    max-width: 1000px;
    height: auto;
    display: block;
    border-radius: 8px;
    background: white;
  }}
  .strip-preview {{
    display: inline-block;
    background: white;
    padding: 8px 12px;
    border-radius: 6px;
    margin-top: 12px;
  }}
  .strip-preview img {{
    height: 48px;
    image-rendering: -webkit-optimize-contrast;
  }}
  
  .grid {{
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 20px;
  }}
  .card {{
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }}
  .card-img {{
    width: 200px;
    height: 200px;
    background: white;
    border-radius: 8px;
    object-fit: contain;
  }}
  .card-info {{ width: 100%; text-align: left; }}
  .card-title {{ font-size: 16px; font-weight: 700; color: #f8fafc; }}
  .card-desc {{ font-size: 13px; color: #94a3b8; margin-top: 4px; }}
  .tile-preview {{
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #334155;
  }}
  .tile-48 {{
    width: 48px;
    height: 48px;
    background: white;
    border-radius: 6px;
    border: 1px solid #cbd5e1;
  }}
  .tile-label {{ font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; }}

  .comp-row {{
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    margin-bottom: 24px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 16px;
  }}
  .comp-card {{
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }}
  .comp-card img {{
    width: 180px;
    height: 180px;
    background: white;
    border-radius: 8px;
  }}
  .comp-label {{ font-size: 13px; color: #cbd5e1; font-weight: 500; text-align: center; max-width: 180px; }}
</style>
</head>
<body>

<h1>Pip AAC — Batch 77 Visual Review</h1>
<div class="subtitle">10 Everyday Child Gaps (#100–#116). Embedded base64 to guarantee zero caching artifacts.</div>

<div class="section-title">1. Full Contact Sheet (Current Active Versions)</div>
<div class="sheet-container">
  <img class="sheet-img" src="{grid_b64}" alt="Batch 77 Contact Sheet" />
  <div class="strip-preview">
    <div style="font-size: 12px; color: #334155; font-weight: 600; margin-bottom: 4px;">48px Tile Scale Strip:</div>
    <img src="{strip_b64}" alt="Batch 77 48px Strip" />
  </div>
</div>

<div class="section-title">2. Side-by-Side Progression Comparisons</div>
"""

for title, versions in COMPARISONS:
    html += f"""
<div style="font-size: 16px; font-weight: 600; color: #f1f5f9; margin-bottom: 8px;">{title}</div>
<div class="comp-row">
"""
    for v_label, b64 in versions:
        html += f"""
  <div class="comp-card">
    <img src="{b64}" alt="{v_label}" />
    <div class="comp-label">{v_label}</div>
  </div>
"""
    html += "</div>"

html += """
<div class="section-title">3. All 10 Mastered Cards & 48px Tile Previews</div>
<div class="grid">
"""

for key, rank, path, desc in ITEMS:
    b64 = to_base64(path)
    html += f"""
  <div class="card">
    <img class="card-img" src="{b64}" alt="{key}" />
    <div class="card-info">
      <div class="card-title">#{rank} {key}</div>
      <div class="card-desc">{desc}</div>
      <div class="tile-preview">
        <img class="tile-48" src="{b64}" alt="{key} 48px" />
        <span class="tile-label">48px Tile Scale</span>
      </div>
    </div>
  </div>
"""

html += """
</div>
</body>
</html>
"""

html_dest = f"{BRAIN_DIR}/batch77_review.html"
with open(html_dest, "w") as f:
    f.write(html)
print(f"Generated standalone review HTML with embedded base64: {html_dest}")
