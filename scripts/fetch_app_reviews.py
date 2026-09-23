#!/usr/bin/env python3
"""
Fetch customer reviews for iOS apps from all App Store storefronts worldwide
and store them in a local SQLite database.

Target competitor apps:
  - Proloquo2Go AAC (308368164)
  - Proloquo (1521978238)
  - Proloquo Coach (1488458662)
  - TouchChat HD w/ WordPower (412351574)
  - TouchChat HD - AAC (398860728)
  - LAMP Words For Life (551215116)
  - TD Snap (1072799231)
  - TD Snap Legacy (1257753762)
"""

import argparse
import concurrent.futures
import json
import os
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

DEFAULT_APPS = [
    {
        "id": "308368164",
        "name": "Proloquo2Go AAC",
        "url": "https://apps.apple.com/app/proloquo2go-aac/id308368164",
        "supports_xml": True,
    },
    {
        "id": "1521978238",
        "name": "Proloquo",
        "url": "https://apps.apple.com/app/proloquo/id1521978238",
        "supports_xml": False,
    },
    {
        "id": "1488458662",
        "name": "Proloquo Coach",
        "url": "https://apps.apple.com/app/proloquo-coach/id1488458662",
        "supports_xml": False,
    },
    {
        "id": "412351574",
        "name": "TouchChat HD w/ WordPower",
        "url": "https://apps.apple.com/app/touchchat-hd-aac-w-wordpower/id412351574",
        "supports_xml": True,
    },
    {
        "id": "398860728",
        "name": "TouchChat HD - AAC",
        "url": "https://apps.apple.com/app/touchchat-hd-aac/id398860728",
        "supports_xml": True,
    },
    {
        "id": "551215116",
        "name": "LAMP Words For Life",
        "url": "https://apps.apple.com/app/lamp-words-for-life/id551215116",
        "supports_xml": True,
    },
    {
        "id": "1072799231",
        "name": "TD Snap",
        "url": "https://apps.apple.com/app/td-snap/id1072799231",
        "supports_xml": True,
    },
    {
        "id": "1257753762",
        "name": "TD Snap Legacy",
        "url": "https://apps.apple.com/app/td-snap-legacy/id1257753762",
        "supports_xml": True,
    },
    {
        "id": "1021384570",
        "name": "CoughDrop",
        "url": "https://apps.apple.com/app/coughdrop/id1021384570",
        "supports_xml": True,
    },
]

# Prioritized storefronts: primary English & European markets first, then global sweep
PRIMARY_COUNTRIES = [
    "us", "gb", "ca", "au", "nz", "ie", "za", "de", "fr", "es", "it",
    "nl", "se", "no", "dk", "fi", "be", "at", "ch", "pt", "gr", "pl",
    "jp", "kr", "cn", "tw", "hk", "sg", "in", "br", "mx", "ar", "cl",
    "co", "pe", "ph", "my", "id", "th", "vn", "ae", "sa", "il", "tr"
]

ALL_ISO_COUNTRIES = [
    "ad", "ae", "af", "ag", "ai", "al", "am", "ao", "aq", "ar", "as", "at", "au", "aw", "ax", "az",
    "ba", "bb", "bd", "be", "bf", "bg", "bh", "bi", "bj", "bl", "bm", "bn", "bo", "bq", "br", "bs",
    "bt", "bv", "bw", "by", "bz", "ca", "cc", "cd", "cf", "cg", "ch", "ci", "ck", "cl", "cm", "cn",
    "co", "cr", "cu", "cv", "cw", "cx", "cy", "cz", "de", "dj", "dk", "dm", "do", "dz", "ec", "ee",
    "eg", "eh", "er", "es", "et", "fi", "fj", "fk", "fm", "fo", "fr", "ga", "gb", "gd", "ge", "gf",
    "gg", "gh", "gi", "gl", "gm", "gn", "gp", "gq", "gr", "gs", "gt", "gu", "gw", "gy", "hk", "hm",
    "hn", "hr", "ht", "hu", "id", "ie", "il", "im", "in", "io", "iq", "ir", "is", "it", "je", "jm",
    "jo", "jp", "ke", "kg", "kh", "ki", "km", "kn", "kp", "kr", "kw", "ky", "kz", "la", "lb", "lc",
    "li", "lk", "lr", "ls", "lt", "lu", "lv", "ly", "ma", "mc", "md", "me", "mf", "mg", "mh", "mk",
    "ml", "mm", "mn", "mo", "mp", "mq", "mr", "ms", "mt", "mu", "mv", "mw", "mx", "my", "mz", "na",
    "nc", "ne", "nf", "ng", "ni", "nl", "no", "np", "nr", "nu", "nz", "om", "pa", "pe", "pf", "pg",
    "ph", "pk", "pl", "pm", "pn", "pr", "ps", "pt", "pw", "py", "qa", "re", "ro", "rs", "ru", "rw",
    "sa", "sb", "sc", "sd", "se", "sg", "sh", "si", "sj", "sk", "sl", "sm", "sn", "so", "sr", "ss",
    "st", "sv", "sx", "sy", "sz", "tc", "td", "tf", "tg", "th", "tj", "tk", "tl", "tm", "tn", "to",
    "tr", "tt", "tv", "tw", "tz", "ua", "ug", "um", "us", "uy", "uz", "va", "vc", "ve", "vg", "vi",
    "vn", "vu", "wf", "ws", "ye", "yt", "za", "zm", "zw"
]

COUNTRIES = PRIMARY_COUNTRIES + [c for c in ALL_ISO_COUNTRIES if c not in PRIMARY_COUNTRIES]

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def init_db(db_path: str):
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS apps (
        app_id TEXT PRIMARY KEY,
        app_name TEXT,
        app_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS reviews (
        review_id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        app_name TEXT NOT NULL,
        country TEXT NOT NULL,
        rating INTEGER NOT NULL,
        title TEXT,
        content TEXT,
        date TEXT,
        version TEXT,
        author_name TEXT,
        author_url TEXT,
        vote_count INTEGER DEFAULT 0,
        vote_sum INTEGER DEFAULT 0,
        fetch_source TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(app_id) REFERENCES apps(app_id)
    )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_reviews_app_id ON reviews(app_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_reviews_country ON reviews(country)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(date)")
    conn.commit()
    return conn


def parse_xml_entry(e, country: str, app_id: str, app_name: str, source: str):
    def get_tag(tag, ns="http://www.w3.org/2005/Atom"):
        el = e.find(f"{{{ns}}}{tag}")
        return el.text.strip() if el is not None and el.text else ""

    rev_id = get_tag("id")
    if not rev_id:
        return None

    title = get_tag("title")
    updated = get_tag("updated")
    rating_str = get_tag("rating", "http://itunes.apple.com/rss")
    rating = int(rating_str) if rating_str.isdigit() else 0
    version = get_tag("version", "http://itunes.apple.com/rss")
    vote_sum_str = get_tag("voteSum", "http://itunes.apple.com/rss")
    vote_sum = int(vote_sum_str) if vote_sum_str.isdigit() else 0
    vote_count_str = get_tag("voteCount", "http://itunes.apple.com/rss")
    vote_count = int(vote_count_str) if vote_count_str.isdigit() else 0

    author_el = e.find("{http://www.w3.org/2005/Atom}author")
    author_name, author_url = "", ""
    if author_el is not None:
        name_el = author_el.find("{http://www.w3.org/2005/Atom}name")
        uri_el = author_el.find("{http://www.w3.org/2005/Atom}uri")
        author_name = name_el.text.strip() if name_el is not None and name_el.text else ""
        author_url = uri_el.text.strip() if uri_el is not None and uri_el.text else ""

    content = ""
    for c in e.findall("{http://www.w3.org/2005/Atom}content"):
        if c.attrib.get("type") == "text" and c.text:
            content = c.text.strip()
            break
    if not content:
        c_any = e.find("{http://www.w3.org/2005/Atom}content")
        if c_any is not None and c_any.text:
            content = c_any.text.strip()

    return {
        "review_id": rev_id,
        "app_id": app_id,
        "app_name": app_name,
        "country": country.upper(),
        "rating": rating,
        "title": title,
        "content": content,
        "date": updated,
        "version": version,
        "author_name": author_name,
        "author_url": author_url,
        "vote_count": vote_count,
        "vote_sum": vote_sum,
        "fetch_source": source,
    }


def parse_json_entry(e, country: str, app_id: str, app_name: str, source: str):
    if "im:rating" not in e:
        return None

    rev_id = e.get("id", {}).get("label", "")
    if not rev_id:
        return None

    title = e.get("title", {}).get("label", "")
    date = e.get("updated", {}).get("label", "")
    rating_str = e.get("im:rating", {}).get("label", "0")
    rating = int(rating_str) if rating_str.isdigit() else 0
    version = e.get("im:version", {}).get("label", "")
    vote_count_str = e.get("im:voteCount", {}).get("label", "0")
    vote_count = int(vote_count_str) if vote_count_str.isdigit() else 0
    vote_sum_str = e.get("im:voteSum", {}).get("label", "0")
    vote_sum = int(vote_sum_str) if vote_sum_str.isdigit() else 0

    author = e.get("author", {})
    author_name = author.get("name", {}).get("label", "")
    author_url = author.get("uri", {}).get("label", "")

    content = e.get("content", {}).get("label", "")

    return {
        "review_id": rev_id,
        "app_id": app_id,
        "app_name": app_name,
        "country": country.upper(),
        "rating": rating,
        "title": title,
        "content": content,
        "date": date,
        "version": version,
        "author_name": author_name,
        "author_url": author_url,
        "vote_count": vote_count,
        "vote_sum": vote_sum,
        "fetch_source": source,
    }


def fetch_url(url: str, timeout: float = 8.0):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                return resp.read()
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        pass
    except Exception:
        pass
    return None


def fetch_country_reviews_for_app(app_info: dict, country: str, delay: float = 0.3):
    app_id = app_info["id"]
    app_name = app_info["name"]
    supports_xml = app_info.get("supports_xml", False)
    reviews_found = []
    seen_ids = set()

    # 1. XML format for apps supporting it
    if supports_xml:
        for sort_type in ["mostRecent", "mostHelpful"]:
            for page in range(1, 11):
                url = f"https://itunes.apple.com/{country}/rss/customerreviews/page={page}/id={app_id}/sortBy={sort_type}/xml"
                time.sleep(delay)
                raw = fetch_url(url)
                if not raw:
                    break
                try:
                    root = ET.fromstring(raw)
                    entries = root.findall("{http://www.w3.org/2005/Atom}entry")
                    if not entries:
                        break
                    new_on_page = 0
                    for e in entries:
                        rev = parse_xml_entry(e, country, app_id, app_name, f"xml-{sort_type}-p{page}")
                        if rev and rev["review_id"] not in seen_ids:
                            seen_ids.add(rev["review_id"])
                            reviews_found.append(rev)
                            new_on_page += 1
                    if new_on_page == 0 or len(entries) < 50:
                        break
                except Exception:
                    break

    # 2. Unpaginated JSON endpoints
    unpaginated_urls = [
        (f"https://itunes.apple.com/{country}/rss/customerreviews/id={app_id}/sortBy=mostRecent/json", "json-unpaginated-recent"),
        (f"https://itunes.apple.com/{country}/rss/customerreviews/id={app_id}/json", "json-unpaginated-default"),
        (f"https://itunes.apple.com/{country}/rss/customerreviews/id={app_id}/sortBy=mostHelpful/json", "json-unpaginated-helpful"),
    ]

    for url, sort_label in unpaginated_urls:
        time.sleep(delay)
        raw = fetch_url(url)
        if not raw:
            continue
        try:
            data = json.loads(raw.decode("utf-8"))
            raw_entries = data.get("feed", {}).get("entry", [])
            if isinstance(raw_entries, dict):
                raw_entries = [raw_entries]
            for e in raw_entries:
                rev = parse_json_entry(e, country, app_id, app_name, sort_label)
                if rev and rev["review_id"] not in seen_ids:
                    seen_ids.add(rev["review_id"])
                    reviews_found.append(rev)
        except Exception:
            pass

    # 3. Paginated JSON (if more reviews exist)
    if len(reviews_found) >= 40:
        json_paged_variants = [
            (lambda p: f"https://itunes.apple.com/{country}/rss/customerreviews/page={p}/id={app_id}/json", "json-default"),
            (lambda p: f"https://itunes.apple.com/{country}/rss/customerreviews/page={p}/id={app_id}/sortBy=mostRecent/json", "json-recent"),
            (lambda p: f"https://itunes.apple.com/{country}/rss/customerreviews/page={p}/id={app_id}/sortBy=mostHelpful/json", "json-helpful"),
        ]

        for url_fn, sort_label in json_paged_variants:
            for page in range(2, 11):
                url = url_fn(page)
                time.sleep(delay)
                raw = fetch_url(url)
                if not raw:
                    break
                try:
                    data = json.loads(raw.decode("utf-8"))
                    raw_entries = data.get("feed", {}).get("entry", [])
                    if isinstance(raw_entries, dict):
                        raw_entries = [raw_entries]
                    if not raw_entries:
                        break
                    new_on_page = 0
                    for e in raw_entries:
                        rev = parse_json_entry(e, country, app_id, app_name, f"{sort_label}-p{page}")
                        if rev and rev["review_id"] not in seen_ids:
                            seen_ids.add(rev["review_id"])
                            reviews_found.append(rev)
                            new_on_page += 1
                    if new_on_page == 0 or len(raw_entries) < 50:
                        break
                except Exception:
                    break

    return country, reviews_found


def run_pipeline(db_path: str, apps: list, countries: list, max_workers: int = 3, delay: float = 0.35):
    conn = init_db(db_path)
    cur = conn.cursor()

    for app in apps:
        cur.execute(
            "INSERT OR REPLACE INTO apps (app_id, app_name, app_url) VALUES (?, ?, ?)",
            (app["id"], app["name"], app["url"]),
        )
    conn.commit()

    total_inserted = 0
    db_lock = threading.Lock()

    print("=" * 70)
    print("Starting Gradual Apple Store Reviews Ingestion")
    print(f"Database: {db_path}")
    print(f"Target apps ({len(apps)}): {', '.join(a['name'] for a in apps)}")
    print(f"Countries to scan: {len(countries)}")
    print(f"Worker concurrency: {max_workers} (Pacing delay: {delay}s per request)")
    print("=" * 70)

    for app in apps:
        app_id = app["id"]
        app_name = app["name"]
        print(f"\n>>> Crawling reviews for: {app_name} (ID: {app_id})")
        app_start_time = time.time()
        app_inserted = 0
        countries_with_reviews = 0

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_country = {
                executor.submit(fetch_country_reviews_for_app, app, c, delay): c
                for c in countries
            }

            for future in concurrent.futures.as_completed(future_to_country):
                country, revs = future.result()
                if revs:
                    countries_with_reviews += 1
                    with db_lock:
                        cur.executemany("""
                        INSERT OR IGNORE INTO reviews (
                            review_id, app_id, app_name, country, rating, title,
                            content, date, version, author_name, author_url,
                            vote_count, vote_sum, fetch_source
                        ) VALUES (
                            :review_id, :app_id, :app_name, :country, :rating, :title,
                            :content, :date, :version, :author_name, :author_url,
                            :vote_count, :vote_sum, :fetch_source
                        )
                        """, revs)
                        conn.commit()
                        app_inserted += len(revs)
                    print(f"  [{app_name}] [{country.upper()}] +{len(revs)} reviews (Total for app: {app_inserted})")

        duration = time.time() - app_start_time
        total_inserted += app_inserted
        print(f"\n✓ Completed {app_name}: {app_inserted} reviews found across {countries_with_reviews} countries in {duration:.1f}s")

    conn.close()
    print("\n" + "=" * 70)
    print("ALL DONE! Ingestion complete.")
    print(f"Total reviews saved in DB: {total_inserted}")
    print(f"SQLite DB located at: {db_path}")
    print("=" * 70)


def print_stats(db_path: str):
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    print("\n" + "=" * 70)
    print("DATABASE REVIEW SUMMARY & ANALYSIS")
    print("=" * 70)

    print("\n--- REVIEWS PER APP ---")
    cur.execute("""
    SELECT app_name, app_id, COUNT(*) as cnt,
           ROUND(AVG(rating), 2) as avg_rating,
           MIN(date) as oldest, MAX(date) as newest
    FROM reviews
    GROUP BY app_id
    ORDER BY cnt DESC
    """)
    for row in cur.fetchall():
        print(f"• {row[0]:<30} (ID: {row[1]}): {row[2]:>4} reviews | Avg Rating: {row[3]:>4}★ | Range: {row[4][:10] if row[4] else 'N/A'} → {row[5][:10] if row[5] else 'N/A'}")

    print("\n--- RATING BREAKDOWN PER APP ---")
    cur.execute("""
    SELECT app_name, rating, COUNT(*) as cnt
    FROM reviews
    GROUP BY app_name, rating
    ORDER BY app_name, rating DESC
    """)
    rows = cur.fetchall()
    app_ratings = {}
    for app_name, rating, count in rows:
        app_ratings.setdefault(app_name, {})[rating] = count

    for app_name, ratings in app_ratings.items():
        total = sum(ratings.values())
        r1 = ratings.get(1, 0)
        r5 = ratings.get(5, 0)
        print(f"• {app_name:<30}: Total={total:>4} | 5★={r5:>3} ({r5*100//total if total else 0:>2}%) | 1★={r1:>3} ({r1*100//total if total else 0:>2}%)")

    print("\n--- TOP COUNTRIES OVERALL ---")
    cur.execute("""
    SELECT country, COUNT(*) as cnt,
           ROUND(AVG(rating), 2) as avg_rating
    FROM reviews
    GROUP BY country
    ORDER BY cnt DESC
    LIMIT 10
    """)
    for row in cur.fetchall():
        print(f"  {row[0]}: {row[1]} reviews (Avg: {row[2]}★)")

    cur.execute("SELECT COUNT(DISTINCT country) FROM reviews")
    total_countries = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM reviews")
    total_reviews = cur.fetchone()[0]
    print(f"\nTotal: {total_reviews} reviews across {total_countries} countries.")
    print("=" * 70 + "\n")
    conn.close()


def search_reviews(db_path: str, query: str, limit: int = 10):
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("""
    SELECT app_name, country, rating, date, title, content
    FROM reviews
    WHERE title LIKE ? OR content LIKE ?
    ORDER BY date DESC
    LIMIT ?
    """, (f"%{query}%", f"%{query}%", limit))
    rows = cur.fetchall()

    print(f"\nSearching for '{query}' (Found {len(rows)} matching displayed):\n")
    for r in rows:
        print(f"[{r[0]}] [{r[1]}] {r[2]}★ on {r[3][:10] if r[3] else ''}")
        print(f"Title: {r[4]}")
        print(f"Content: {r[5][:250]}...")
        print("-" * 50)
    conn.close()


def main():
    parser = argparse.ArgumentParser(description="Fetch iOS app reviews from all App Store storefronts into SQLite")
    parser.add_argument("--db", default="data/competitor_reviews.db", help="Path to SQLite database")
    parser.add_argument(
        "--app",
        choices=["all", "new_competitors", "proloquo2go", "proloquo", "coach", "touchchat", "lamp", "tdsnap", "coughdrop"],
        default="new_competitors",
        help="App group to fetch"
    )
    parser.add_argument("--workers", type=int, default=3, help="Number of concurrent worker threads (gentle=3)")
    parser.add_argument("--delay", type=float, default=0.35, help="Polite delay in seconds per request")
    parser.add_argument("--stats", action="store_true", help="Print summary statistics of the database")
    parser.add_argument("--search", type=str, help="Search reviews by keyword in title or content")
    args = parser.parse_args()

    if args.stats:
        print_stats(args.db)
        return

    if args.search:
        search_reviews(args.db, args.search)
        return

    app_map = {
        "proloquo2go": [DEFAULT_APPS[0]],
        "proloquo": [DEFAULT_APPS[1]],
        "coach": [DEFAULT_APPS[2]],
        "touchchat": [DEFAULT_APPS[3], DEFAULT_APPS[4]],
        "lamp": [DEFAULT_APPS[5]],
        "tdsnap": [DEFAULT_APPS[6], DEFAULT_APPS[7]],
        "coughdrop": [DEFAULT_APPS[8]],
        "new_competitors": [
            DEFAULT_APPS[3], # TouchChat HD w/ WordPower
            DEFAULT_APPS[4], # TouchChat HD
            DEFAULT_APPS[5], # LAMP Words For Life
            DEFAULT_APPS[6], # TD Snap
            DEFAULT_APPS[7], # TD Snap Legacy
        ],
        "all": DEFAULT_APPS,
    }

    apps_to_fetch = app_map[args.app]
    run_pipeline(args.db, apps_to_fetch, COUNTRIES, max_workers=args.workers, delay=args.delay)
    print_stats(args.db)


if __name__ == "__main__":
    main()
