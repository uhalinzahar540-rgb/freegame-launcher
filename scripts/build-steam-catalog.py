#!/usr/bin/env python3
"""Builds public/catalog/steam.json from the public Steam store API.

The list below is curated by hand (newest hits first); order defines popularity.
Run: python3 scripts/build-steam-catalog.py
"""

import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

APP_IDS = [
    3949040,  # RV There Yet?
    3241660,  # R.E.P.O.
    3527290,  # PEAK
    3164500,  # Schedule I
    3405340,  # Megabonk
    3167020,  # Escape From Duckov
    2592160,  # Dispatch
    1030300,  # Hollow Knight: Silksong
    2807960,  # Battlefield 6
    1903340,  # Clair Obscur: Expedition 33
    2622380,  # Elden Ring Nightreign
    2567870,  # Chained Together
    2670630,  # Supermarket Simulator
    1966720,  # Lethal Company
    2881650,  # Content Warning
    2246340,  # Monster Hunter Wilds
    1771300,  # Kingdom Come: Deliverance II
    2001120,  # Split Fiction
    2358720,  # Black Myth: Wukong
    553850,   # Helldivers 2
    1623730,  # Palworld
    1145350,  # Hades II
    2379780,  # Balatro
    1086940,  # Baldur's Gate 3
    1245620,  # Elden Ring
    1091500,  # Cyberpunk 2077
    1174180,  # Red Dead Redemption 2
    271590,   # Grand Theft Auto V
    1326470,  # Sons of the Forest
    739630,   # Phasmophobia
    252490,   # Rust
    892970,   # Valheim
    1627720,  # Lies of P
    990080,   # Hogwarts Legacy
    1426210,  # It Takes Two
    1551360,  # Forza Horizon 5
    1144200,  # Ready or Not
    1172620,  # Sea of Thieves
    381210,   # Dead by Daylight
    108600,   # Project Zomboid
    526870,   # Satisfactory
    427520,   # Factorio
    294100,   # RimWorld
    105600,   # Terraria
    413150,   # Stardew Valley
    367520,   # Hollow Knight
    548430,   # Deep Rock Galactic
    632360,   # Risk of Rain 2
    648800,   # Raft
    264710,   # Subnautica
    814380,   # Sekiro
    292030,   # The Witcher 3
    227300,   # Euro Truck Simulator 2
    945360,   # Among Us
    4000,     # Garry's Mod
    550,      # Left 4 Dead 2
    620,      # Portal 2
]

LANGUAGES = {"en": "english", "ru": "russian", "uk": "ukrainian"}
OUT = Path(__file__).resolve().parent.parent / "public" / "catalog" / "steam.json"


def get_json(url: str):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "FreeGameLauncher-catalog/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except Exception as error:  # noqa: BLE001 - retry on any transient error
            wait = 10 * (attempt + 1)
            print(f"  retry in {wait}s: {error}", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"failed: {url}")


def url_exists(url: str) -> bool:
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "FreeGameLauncher-catalog/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status == 200
    except Exception:  # noqa: BLE001
        return False


def strip_html(text: str) -> str:
    text = re.sub(r"<br\s*/?>|</p>|</li>|</h\d>", "\n", text or "", flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    lines = [re.sub(r"[ \t\u00a0]+", " ", line).strip() for line in text.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(",.;:") + "…"


REQ_FIELDS = {
    "os": ["OS", "OS *"],
    "cpu": ["Processor"],
    "ram": ["Memory"],
    "gpu": ["Graphics"],
    "storage": ["Storage", "Hard Drive", "Hard Disk Space"],
}


def parse_requirements(raw) -> dict | None:
    minimum = raw.get("minimum") if isinstance(raw, dict) else None
    if not minimum:
        return None
    result = {}
    for key, labels in REQ_FIELDS.items():
        for label in labels:
            match = re.search(rf"<strong>\s*{re.escape(label)}:?\s*</strong>\s*(.*?)(?:<br|</li>)", minimum, re.I | re.S)
            if match:
                value = strip_html(match.group(1)).strip(" :")
                if value:
                    result[key] = truncate(value, 160)
                    break
    return result or None


def parse_date(data) -> str | None:
    raw = (data.get("release_date") or {}).get("date") or ""
    for fmt in ("%d %b, %Y", "%b %d, %Y", "%d %B, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def slugify(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")


def main() -> None:
    games = []
    total = len(APP_IDS)
    for rank, app_id in enumerate(APP_IDS):
        localized = {}
        base = None
        for code, steam_lang in LANGUAGES.items():
            query = urllib.parse.urlencode({"appids": app_id, "l": steam_lang, "cc": "us"})
            payload = get_json(f"https://store.steampowered.com/api/appdetails?{query}")[str(app_id)]
            time.sleep(1.2)
            if not payload.get("success"):
                break
            data = payload["data"]
            if code == "en":
                base = data
            localized[code] = {
                "shortDescription": strip_html(data.get("short_description", "")),
                "description": truncate(strip_html(data.get("about_the_game", "")), 1500),
                "genres": [g["description"] for g in data.get("genres", [])][:4],
            }
        if not base or base.get("type") != "game":
            print(f"skip {app_id}: not available", file=sys.stderr)
            continue

        hero = f"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{app_id}/library_hero.jpg"
        screenshots = [s["path_full"] for s in base.get("screenshots", [])][:6]
        if not url_exists(hero):
            hero = screenshots[0] if screenshots else base.get("header_image")
        price = base.get("price_overview")
        games.append(
            {
                "appId": app_id,
                "slug": slugify(base["name"]) or str(app_id),
                "title": base["name"].replace("™", "").replace("®", "").strip(),
                "developer": ", ".join(base.get("developers", [])[:2]) or None,
                "releaseDate": parse_date(base),
                "popularity": float(total - rank),
                "coverUrl": base.get("header_image"),
                "heroUrl": hero,
                "screenshots": screenshots,
                "requirements": parse_requirements(base.get("pc_requirements")),
                "isFree": bool(base.get("is_free")),
                "price": {
                    "currency": price["currency"],
                    "final": price["final"],
                    "initial": price["initial"],
                    "discountPercent": price["discount_percent"],
                    "finalFormatted": price["final_formatted"],
                    "initialFormatted": price["initial_formatted"] or price["final_formatted"],
                }
                if price
                else None,
                "i18n": localized,
            }
        )
        print(f"[{rank + 1}/{total}] {base['name']}")

    OUT.write_text(
        json.dumps(
            {"sourceId": "steam", "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "games": games},
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(games)} games to {OUT}")


if __name__ == "__main__":
    main()
