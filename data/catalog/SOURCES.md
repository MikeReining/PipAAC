# Common names — sources

What `common_names.en.json` is built from, and under what terms. The
build is `scripts/catalog/build_common_names.mjs`; the raw inputs stay
in the gitignored `cache/names/` directory. The file itself is only a
flat list of lowercased given names — no counts, years, or identifiers.

| Source | License / permission | Use |
| --- | --- | --- |
| US SSA national baby names 1880–2017, via `babynames.rda` from the R `babynames` package ([hadley/babynames](https://github.com/hadley/babynames)) | US government work, public domain (SSA data) | Top 2000 all-time + top 1000 of 2003–2017 |
| UK baby names via `ukbabynames.rda` from the R `ukbabynames` package ([mine-cetinkaya-rundel/ukbabynames](https://github.com/mine-cetinkaya-rundel/ukbabynames)) — ONS England & Wales 1996–2020, NISRA Northern Ireland 1997–2020, NRS Scotland 1974–2020 | CC0 | Top 1000 per nation + pooled top 1000 of the last 15 years |
| E&W top-100 name snapshots 1904–1994, via `rankings.rda` from the same package (ONS historical) | CC0 | Every listed name — grandparents' names |

Fetched 2026-10-06. Regenerate the cache CSVs:

```bash
mkdir -p cache/names
cd cache/names
curl -sLO https://github.com/hadley/babynames/raw/master/data/babynames.rda
curl -sL -o ukbabynames.rda https://raw.githubusercontent.com/mine-cetinkaya-rundel/ukbabynames/main/data/ukbabynames.rda
curl -sL -o uk_rankings.rda https://raw.githubusercontent.com/mine-cetinkaya-rundel/ukbabynames/main/data/rankings.rda
cd ../.. && python3 -m venv cache/names-venv && cache/names-venv/bin/pip install rdata
cache/names-venv/bin/python - <<'EOF'
import rdata
us = list(rdata.read_rda("cache/names/babynames.rda").values())[0]
us.groupby(["name","year"], observed=True)["n"].sum().reset_index().to_csv("cache/names/us_name_year.csv", index=False)
uk = list(rdata.read_rda("cache/names/ukbabynames.rda").values())[0]
uk.groupby(["name","nation","year"], observed=True)["n"].sum().reset_index().to_csv("cache/names/uk_name_year.csv", index=False)
list(rdata.read_rda("cache/names/uk_rankings.rda").values())[0].to_csv("cache/names/uk_rankings.csv", index=False)
EOF
```

Then `node scripts/catalog/build_common_names.mjs` and
`node scripts/catalog/build_voice_words.mjs`. Note ssa.gov blocks
scripted `names.zip` downloads (403); the rda mirror is the same data.
