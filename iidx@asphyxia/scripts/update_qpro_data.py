"""
update_qpro_data.py
-------------------
1. Reads bm2dx.dll to extract Q-Pro filenames (source-of-truth for IDs)
2. Updates customization.json with the correct names
3. Extracts all .ifs files in parallel using ifstools.exe
4. Organises the resulting PNGs into webui/asset/qpro/<cat>/<base_name>/

Run once (or after a game update) to refresh assets.
"""

import re
import json
import os
import subprocess
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR     = os.path.dirname(os.path.abspath(__file__))
PLUGIN_ROOT    = os.path.dirname(SCRIPT_DIR)

DLL_PATH       = r"C:\path\to\game\modules\bm2dx.dll"
CUSTOM_JSON    = os.path.join(PLUGIN_ROOT, "data", "customization.json")
QPRO_SRC_DIR   = r"C:\path\to\qpro\ifs\folder"
IFSTOOLS_BIN   = r"ifstools.exe" # Replace with path to ifstools.exe if not in PATH
ASSET_OUT_DIR  = os.path.join(PLUGIN_ROOT, "webui", "asset", "qpro")
TEMP_BASE_DIR  = os.path.join(SCRIPT_DIR, "qpro_out_temp")

# Number of parallel ifstools workers. Keep at 4 to avoid flooding disk I/O.
MAX_WORKERS = 4

# ── Helpers ───────────────────────────────────────────────────────────────────

def _category(name: str) -> str | None:
    if "_head" in name: return "head"
    if "_hair" in name: return "hair"
    if "_face" in name: return "face"
    if "_hand" in name: return "hand"
    if "_body" in name: return "body"
    if "_bg"   in name: return "bg"
    return None

# ── Step 1: Update customization.json from DLL ────────────────────────────────

def update_json_mapping():
    print("Reading bm2dx.dll …")
    with open(DLL_PATH, "rb") as f:
        data = f.read()

    raw = re.findall(rb"qp_[a-zA-Z0-9_]+\.ifs", data)
    seen, unique = set(), []
    for s in raw:
        if s not in seen:
            seen.add(s)
            unique.append(s.decode("ascii"))

    result = {k: [] for k in ("qpro_head", "qpro_hair", "qpro_face", "qpro_hand", "qpro_body", "qpro_back")}

    for s in unique:
        base = s.removesuffix(".ifs")
        cat  = _category(s)
        key  = f"qpro_{cat}" if cat and cat != "bg" else "qpro_back" if cat == "bg" else None
        if key:
            result[key].append(base)

    with open(CUSTOM_JSON, "r", encoding="utf-8") as f:
        custom = json.load(f)

    for k, v in result.items():
        custom[k] = v
        print(f"  {k}: {len(v)} entries")

    with open(CUSTOM_JSON, "w", encoding="utf-8") as f:
        json.dump(custom, f, ensure_ascii=False, indent=2)

    print("customization.json updated.\n")

# ── Step 2: Parallel extraction ───────────────────────────────────────────────

def _extract_one(args):
    """Worker: extract a single .ifs file. Returns (name, ok, msg)."""
    idx, total, ifs_name, worker_id = args
    ifs_path   = os.path.join(QPRO_SRC_DIR, ifs_name)
    cat        = _category(ifs_name)
    if not cat:
        return ifs_name, False, "unknown category – skipped"

    base_name  = ifs_name.removesuffix(".ifs")
    target_dir = os.path.join(ASSET_OUT_DIR, cat, base_name)

    # Skip if already extracted
    if os.path.isdir(target_dir) and any(f.endswith(".png") for f in os.listdir(target_dir)):
        return ifs_name, True, "already exists"

    # Each worker uses its own temp directory to avoid collisions
    worker_tmp = os.path.join(TEMP_BASE_DIR, f"worker_{worker_id}")
    os.makedirs(worker_tmp, exist_ok=True)

    try:
        subprocess.run(
            [IFSTOOLS_BIN, ifs_path, "-o", worker_tmp, "-y"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=30,
        )

        tex_dir = os.path.join(worker_tmp, f"{base_name}_ifs", "tex")
        if not os.path.isdir(tex_dir):
            return ifs_name, False, "tex dir not found after extraction"

        os.makedirs(target_dir, exist_ok=True)
        count = 0
        for png in os.listdir(tex_dir):
            if png.endswith(".png"):
                shutil.copy2(os.path.join(tex_dir, png), os.path.join(target_dir, png))
                count += 1

        # Clean up this worker's temp subfolder to free disk space
        shutil.rmtree(os.path.join(worker_tmp, f"{base_name}_ifs"), ignore_errors=True)

        return ifs_name, True, f"{count} PNGs"

    except subprocess.TimeoutExpired:
        return ifs_name, False, "timeout"
    except Exception as exc:
        return ifs_name, False, str(exc)


def extract_qpro_images():
    print("Extracting QPRO images …")

    for cat in ("head", "hair", "face", "hand", "body", "bg"):
        os.makedirs(os.path.join(ASSET_OUT_DIR, cat), exist_ok=True)
    os.makedirs(TEMP_BASE_DIR, exist_ok=True)

    ifs_files = sorted(f for f in os.listdir(QPRO_SRC_DIR) if f.endswith(".ifs"))
    total     = len(ifs_files)
    print(f"  {total} .ifs files found, using {MAX_WORKERS} parallel workers\n")

    # Build task list; worker_id cycles 0 … MAX_WORKERS-1 to distribute temp dirs
    tasks = [(i + 1, total, name, i % MAX_WORKERS) for i, name in enumerate(ifs_files)]

    done = skipped = failed = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(_extract_one, t): t for t in tasks}
        for future in as_completed(futures):
            idx = futures[future][0]
            name, ok, msg = future.result()
            if not ok and msg != "already exists":
                print(f"  [{idx:4}/{total}] FAIL  {name}: {msg}")
                failed += 1
            elif msg == "already exists":
                skipped += 1
            else:
                done += 1
            # Progress every 50 files
            if (done + skipped + failed) % 50 == 0:
                print(f"  Progress: {done + skipped + failed}/{total} ({done} new, {skipped} skipped, {failed} failed)")

    # Clean up temp base
    shutil.rmtree(TEMP_BASE_DIR, ignore_errors=True)

    print(f"\nExtraction done: {done} new, {skipped} already existed, {failed} failed.")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    update_json_mapping()
    extract_qpro_images()
