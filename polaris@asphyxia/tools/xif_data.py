"""Polaris Chord (XIF) data tool: dump game master tables and build plugin data.

The plugin serves song / gacha / event catalogs from JSON seeds. Those seeds are
derived from the master tables (CSV TextAssets) bundled with each game build, so
every new build needs its own seeds under data/<version>/.

    # 1) dump the master tables of a game install (needs: pip install UnityPy)
    python tools/xif_data.py dump  <game contents dir>  <masters dir>

    # 2) build data/<version>/ from those tables
    python tools/xif_data.py build <masters dir>  data/2026012100

`build` writes musics.json, gacha.json, events.json, demo.json and mst_patch.csv.
Event selection reuses data/events.json as the baseline (feature / matching /
season flags and the login bonus boards that were opened there) and adds every
event the new masters reference, so the result is a superset of the old build.
"""
import argparse
import csv
import io
import json
import os
import sys

UNITY_VERSION = "2022.3.1f1"
BUNDLE_DIR = os.path.join("game", "svm_data", "StreamingAssets", "aa", "StandaloneWindows64", "database_assets_database")

GRADES = {"NOV": 0, "ADV": 1, "EXH": 2, "INF": 3, "MXM": 4}
RARITY = {"N": 1, "R": 1, "SR": 2, "SSR": 3}
OPEN_AT, CLOSE_AT = "2020-01-01T00:00:00", "2099-01-01T00:00:00"
GACHA_OPEN, GACHA_CLOSE = "2024-01-01 00:00:00", "2099-12-31 23:59:59"
# Rows with a placeholder Version (9999999) are deleted by the client's
# FilterDatabase(assetVersion) right after mst_patch is applied. Re-sending them
# with Version 0 keeps them alive (mst_patch runs before FilterDatabase).
PLACEHOLDER_VERSION = 1000
PATCH_TABLES = ["CharacterCardMaster"]


def dump(game, out):
    import UnityPy
    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    src = os.path.join(game, BUNDLE_DIR)
    os.makedirs(out, exist_ok=True)
    count = 0
    for f in sorted(os.listdir(src)):
        if not f.endswith(".bundle"):
            continue
        for obj in UnityPy.load(os.path.join(src, f)).objects:
            if obj.type.name != "TextAsset":
                continue
            data = obj.read()
            script = data.m_Script
            raw = script.encode("utf-8", "surrogateescape") if isinstance(script, str) else bytes(script)
            with open(os.path.join(out, data.m_Name + ".csv"), "wb") as fh:
                fh.write(raw)
            count += 1
    print(f"{count} tables -> {out}")


def table(masters, name):
    path = os.path.join(masters, name + ".csv")
    if not os.path.exists(path):
        return []
    text = open(path, encoding="utf-8-sig").read().lstrip("﻿")
    return list(csv.DictReader(io.StringIO(text)))


def enabled(row, key):
    return str(row.get(key, "True")).strip().lower() != "false"


def build_musics(m):
    charts = {}
    for r in table(m, "ChartDataMaster"):
        diff = GRADES.get(r["note_grade"])
        if diff is not None:
            charts.setdefault(int(r["music_id"]), set()).add(diff)
    musics = []
    for r in table(m, "MusicDataMaster"):
        mid = int(r["music_id"])
        musics.append({
            "music_id": mid,
            "charts": [{"difficulty": d, "open_at": OPEN_AT, "close_at": CLOSE_AT} for d in sorted(charts.get(mid, ()))],
        })
    return {"musics": musics}


def build_gacha(m):
    cards = [r for r in table(m, "CharacterCardMaster") if r["CardUsage"] == "ForPlayers"]
    pools = {
        "Contenter": [c for c in cards if c["CardType"] == "Contenter"],
        "Snapshot": [c for c in cards if c["CardType"] == "SupportSnap"],
        "Fukubiki": cards,
    }
    gachas = []
    for r in table(m, "GachaEventMaster"):
        pay = (2 if r["CanPayWithCredit"] == "True" else 0) | (4 if r["CanPayWithPaseli"] == "True" else 0) | (8 if r["CanPayWithItem"] == "True" else 0)
        gachas.append({
            "id": r["Id"],
            "name": r["Name"],
            "payment_type": pay,
            "consume_item_id": r["UseItemId"],
            "consume_item_count": int(r["UseItemCount"] or 0),
            "w_r": 70, "w_sr": 25, "w_ssr": 5, "w_pickup": 10,
            "open_at": GACHA_OPEN,
            "close_at": GACHA_CLOSE,
            "items": [{"item_id": "chara_card." + c["CharacterCardId"], "rarity": RARITY.get(c["CardRarity"], 1)}
                      for c in pools.get(r["Category"], cards)],
        })
    return {"gachas": gachas}


def build_events(m, baseline):
    out, seen = [], set()

    def add(eid, param=""):
        if eid and eid not in seen:
            seen.add(eid)
            out.append({"id": eid, "param": param})

    base = baseline.get("events", []) if baseline else []
    for e in base:  # keep everything the previous build opened (incl. feature flags the masters do not list)
        add(e["id"], e.get("param", ""))
    # login bonus boards: the baseline selection plus every collab ("Play") board
    sheets = {}
    for r in table(m, "LoginBonusRewardMaster"):
        sheets.setdefault(r["LoginBonusId"], [])
        if r["SheetId"] not in sheets[r["LoginBonusId"]]:
            sheets[r["LoginBonusId"]].append(r["SheetId"])
    boards = [e["id"].split(".")[1] for e in base if e["id"].count(".") == 1 and e["id"].startswith("login_bonus.")]
    boards += [r["Id"] for r in table(m, "LoginBonusMaster") if r["LoginBonusType"] == "Play" and r["Id"] not in boards]
    for b in boards:
        add("login_bonus." + b)
    for b in boards:
        for s in sheets.get(b, []):
            add(f"login_bonus.{b}.{s}")
    for r in table(m, "TicketEventMaster"):
        if enabled(r, "Enable"):
            add(r["Id"])
    for r in table(m, "ChangeItemSetGroupMaster"):
        if enabled(r, "Enable"):
            add(r["EventId"])
    for r in table(m, "ChangeItemSetMaster"):
        if enabled(r, "Enable"):
            add(r["EventId"])
    for r in table(m, "PromotionMaster"):
        if enabled(r, "Enabled"):
            add(r["EventId"])
    for r in table(m, "CaravanSeasonMaster") + table(m, "CaravanLocationMaster"):
        if enabled(r, "Enable"):
            add(r["RequiredEventId"])
    for r in table(m, "CharacterAnotherCostumeMaster"):
        if enabled(r, "Enabled"):
            add(r["RequiredEventId"])
            add(r["RequiredLockEventId"])
    for r in table(m, "MvScheduleMaster"):
        add(r["EventId"])
    for r in table(m, "LogboExchangeEntryMaster"):
        if enabled(r, "Enabled"):
            add(r["EventId"])
    return {"events": out}


def build_demos(m):
    rows = [r for r in table(m, "DemoMovieMaster") if r["demo_type"] == "MusicPreview" and enabled(r, "enable")]
    return {"demos": [{"demo_type": 0, "path": r["movie_url"]} for r in sorted(rows, key=lambda r: r["movie_url"])]}


def build_patch(m):
    """CSV for mst.get_common's mst_patch: <table>, <columns>, rows, blank line."""
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    rows_total = 0
    for name in PATCH_TABLES:
        rows = table(m, name)
        fix = [r for r in rows if r.get("Version", "").isdigit() and int(r["Version"]) > PLACEHOLDER_VERSION]
        if not fix:
            continue
        cols = list(rows[0].keys())
        buf.write(name + "\n")
        w.writerow(cols)
        for r in fix:
            w.writerow([("0" if c == "Version" else r[c]) for c in cols])
        buf.write("\n")
        rows_total += len(fix)
    return buf.getvalue(), rows_total


def write_json(path, obj):
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=1)
        fh.write("\n")


def build(masters, out, baseline_path):
    baseline = json.load(open(baseline_path, encoding="utf-8-sig")) if baseline_path and os.path.exists(baseline_path) else None
    os.makedirs(out, exist_ok=True)
    parts = {
        "musics.json": build_musics(masters),
        "gacha.json": build_gacha(masters),
        "events.json": build_events(masters, baseline),
        "demo.json": build_demos(masters),
    }
    for name, obj in parts.items():
        write_json(os.path.join(out, name), obj)
    patch, n = build_patch(masters)
    with open(os.path.join(out, "mst_patch.csv"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(patch)
    print(f"musics={len(parts['musics.json']['musics'])} gachas={len(parts['gacha.json']['gachas'])} "
          f"events={len(parts['events.json']['events'])} demos={len(parts['demo.json']['demos'])} patch_rows={n} -> {out}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("dump", help="dump master CSVs from a game install")
    d.add_argument("game")
    d.add_argument("out")
    b = sub.add_parser("build", help="build plugin data files from dumped masters")
    b.add_argument("masters")
    b.add_argument("out")
    here = os.path.dirname(os.path.abspath(__file__))
    b.add_argument("--baseline", default=os.path.join(here, "..", "data", "events.json"),
                   help="events.json whose flags / login bonus boards are carried over")
    a = ap.parse_args()
    if a.cmd == "dump":
        dump(a.game, a.out)
    else:
        build(a.masters, a.out, a.baseline)


if __name__ == "__main__":
    sys.exit(main())
