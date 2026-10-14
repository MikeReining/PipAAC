#!/usr/bin/env python3
import os

BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805"
HTML_OUT = os.path.join(BRAIN_DIR, "batch78_review.html")

WORDS = [
    ("already", 115, "Checklist clipboard with green checkmarks (already done)"),
    ("twenty", 119, "Pip Blue #20 card with double 2x5 ten-frames (20 blocks)"),
    ("monster", 121, "Friendly, cute, goofy non-scary child monster"),
    ("place", 124, "Red teardrop location pin on foldout paper map grid"),
    ("bridge", 125, "Stone arch bridge over calm blue river water"),
    ("tail", 127, "Fluffy bushy red fox tail with white tip and wag motion"),
    ("coffee", 128, "Ceramic coffee mug with gentle rising steam swirls"),
    ("bump", 129, "Pip holding ice pack to small comical bump on head"),
    ("part", 130, "Threaded metal bolt and matching hexagonal nut"),
    ("rock", 131, "Solid natural gray boulder/stone with facets"),
    ("party", 133, "Colorful cone party hat, confetti swirls, and blower"),
]

def build_html():
    cards = []
    for key, rank, desc in WORDS:
        polished = f"batch78_polished/{key}.png"
        raw = f"batch78_twenty.png" if key == "twenty" else f"batch78_muse_{key}.png"
        cards.append(f"""
        <div class="card">
          <div class="card-header">
            <span class="badge">#{rank}</span>
            <span class="word">{key}</span>
          </div>
          <div class="images">
            <div class="img-box">
              <div class="label">Polished (1600px / 48px tile)</div>
              <img src="{polished}" alt="{key}" class="main-img" />
              <div class="mini-row">
                <img src="{polished}" alt="{key}" class="tile-48" />
                <span class="mini-label">48px UI scale</span>
              </div>
            </div>
            <div class="img-box raw-box">
              <div class="label">Raw Render</div>
              <img src="{raw}" alt="{key} raw" class="raw-img" />
            </div>
          </div>
          <div class="desc">{desc}</div>
        </div>
        """)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Batch 78 Review (#115–#133)</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 32px 24px;
    }}
    h1 {{
      font-size: 28px;
      font-weight: 800;
      margin-bottom: 8px;
    }}
    .subtitle {{
      color: #64748b;
      margin-bottom: 24px;
      font-size: 15px;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 20px;
    }}
    .card {{
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }}
    .card-header {{
      display: flex;
      align-items: center;
      gap: 10px;
    }}
    .badge {{
      background: #e0f2fe;
      color: #0284c7;
      font-size: 13px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
    }}
    .word {{
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
    }}
    .images {{
      display: flex;
      gap: 12px;
    }}
    .img-box {{
      flex: 1;
      background: #f1f5f9;
      border-radius: 8px;
      padding: 8px;
      text-align: center;
    }}
    .raw-box {{
      flex: 0.8;
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
    }}
    .label {{
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}
    .main-img {{
      width: 100%;
      aspect-ratio: 1;
      object-fit: contain;
      background: #ffffff;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }}
    .raw-img {{
      width: 100%;
      aspect-ratio: 1;
      object-fit: contain;
      background: #ffffff;
      border-radius: 6px;
    }}
    .mini-row {{
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 8px;
    }}
    .tile-48 {{
      width: 48px;
      height: 48px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }}
    .mini-label {{
      font-size: 11px;
      color: #64748b;
    }}
    .desc {{
      font-size: 13px;
      color: #475569;
      line-height: 1.4;
      background: #f8fafc;
      padding: 8px 10px;
      border-radius: 6px;
    }}
  </style>
</head>
<body>
  <h1>Batch 78 Review (#115–#133)</h1>
  <div class="subtitle">Everyday Child Gaps &bull; 10 Muse rolls + 1 vector number card &bull; Monoline Vector Clipart</div>
  <div class="grid">
    {''.join(cards)}
  </div>
</body>
</html>
"""
    with open(HTML_OUT, "w") as f:
        f.write(html)
    print(f"Generated review page: {HTML_OUT}")

if __name__ == "__main__":
    build_html()
