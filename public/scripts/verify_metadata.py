#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_metadata.py
------------------
Recursively finds every metadata.json, compares historic_capture_dates
against the actual Historical/ images, and interactively fixes:
  - Date mismatches       (update JSON from EXIF)
  - Extra JSON entries    (file missing from disk  -> offer to remove)
  - Missing JSON entries  (file on disk but not in JSON -> offer to add)
  - No-EXIF images        (file exists but no EXIF   -> offer manual date entry)
  - EXIF coverage check   (25% minimum threshold, writes low_exif_coverage.txt)
"""
import json
import sys
import io
# Force UTF-8 output on Windows to prevent cp1252 encoding errors
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from datetime import datetime
from pathlib import Path
try:
    from PIL import Image
    from PIL.ExifTags import TAGS
except ImportError:
    print("ERROR: Pillow is required.")
    sys.exit(1)

EXIF_DATE_TAGS = ("DateTimeOriginal", "DateTimeDigitized", "DateTime")
IMAGE_EXTS     = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}

def get_capture_date(image_path: Path):
    try:
        img = Image.open(image_path)
        raw = img._getexif()
        if not raw:
            return None
        tag_map = {TAGS.get(k, k): v for k, v in raw.items()}
        for tag in EXIF_DATE_TAGS:
            val = tag_map.get(tag)
            if val:
                try:
                    dt = datetime.strptime(val.strip(), "%Y:%m:%d %H:%M:%S")
                    return dt.strftime("%Y-%m-%dT%H:%M:%S")
                except ValueError:
                    continue
    except Exception as e:
        print(f"    [WARNING] Could not read {image_path.name}: {e}")
    return None

def load_json(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path: Path, data: dict):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def prompt_yes_no(question: str) -> bool:
    while True:
        ans = input(f"{question} [y/n]: ").strip().lower()
        if ans in ("y", "yes"):
            return True
        if ans in ("n", "no"):
            return False
        print("    Please type 'y' or 'n'.")

def prompt_choice(question: str, choices: list) -> str:
    for i, c in enumerate(choices, 1):
        print(f"    {i}) {c}")
    while True:
        ans = input(f"  {question} [1-{len(choices)}]: ").strip()
        if ans.isdigit() and 1 <= int(ans) <= len(choices):
            return choices[int(ans) - 1]
        print(f"    Please enter a number between 1 and {len(choices)}.")

def prompt_date(prompt_text: str):
    FORMATS = ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"]
    while True:
        raw = input(f"    {prompt_text} (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS, blank to skip): ").strip()
        if not raw:
            return None
        for fmt in FORMATS:
            try:
                dt = datetime.strptime(raw, fmt)
                return dt.strftime("%Y-%m-%dT%H:%M:%S")
            except ValueError:
                continue
        print("    Invalid format -- please try again.")

def find_metadata_files(root: Path) -> list:
    found = []
    for p in sorted(root.rglob("metadata.json")):
        if not (p.parent / "Historical").is_dir():
            continue
        try:
            data = load_json(p)
            if "historic_capture_dates" in data:
                found.append(p)
        except Exception:
            pass
    return found

DATE_FORMATS = [
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%I:%M %p",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %I:%M %p",
    "%Y-%m-%d",
]

def parse_json_date(value: str):
    v = value.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(v, fmt)
        except ValueError:
            continue
    return None

def process_subject(metadata_path: Path, global_policy: dict) -> dict:
    subject_dir    = metadata_path.parent
    subject_name   = subject_dir.name
    historical_dir = subject_dir / "Historical"
    metadata       = load_json(metadata_path)
    capture_dates  = dict(metadata.get("historic_capture_dates", {}))

    actual_images = {
        f.name: f for f in historical_dir.iterdir()
        if f.is_file() and f.suffix.lower() in IMAGE_EXTS
    }
    actual_count = len(actual_images)
    json_count   = len(capture_dates)

    time_only  = []
    mismatches = []
    no_exif    = []
    not_found  = []

    for filename in sorted(capture_dates.keys()):
        json_date = capture_dates[filename]
        after_t = json_date[11:] if "T" in json_date else ""
        if after_t != "00:00:00":
            time_only.append((filename, json_date))
        if filename not in actual_images:
            not_found.append(filename)
            continue
        exif_date = get_capture_date(actual_images[filename])
        if exif_date is None:
            no_exif.append(filename)
            continue
        date_part = json_date[:10]
        json_dt   = parse_json_date(json_date)
        has_wrong_date = json_dt.strftime("%Y-%m-%d") != exif_date[:10] if json_dt else date_part != exif_date[:10]
        if has_wrong_date:
            mismatches.append((filename, json_date, exif_date))

    unlisted = sorted(f for f in actual_images if f not in capture_dates)
    clean    = len(capture_dates) - len(mismatches) - len(time_only) - len(no_exif) - len(not_found)
    accounted = len(capture_dates) - len(not_found)

    print(f"  Subject  : {subject_name}")
    print(f"  JSON     : {metadata_path}")
    if accounted == actual_count and not unlisted:
        print(f"  Images   : [OK] {actual_count} in folder / {json_count} in JSON "
              f"({len(no_exif)} manually dated, no EXIF)")
    else:
        print(f"  Images   : [MISMATCH] {actual_count} in folder vs {json_count} in JSON")
        if unlisted:
            print(f"  + In folder, not in JSON : {', '.join(unlisted)}")
        if not_found:
            print(f"  - In JSON, not in folder : {', '.join(not_found)}")
    print(f"  [OK] {clean} match  |  [X] {len(mismatches)} date mismatch  "
          f"|  ~ {len(no_exif)} manual/no-EXIF  "
          f"|  + {len(unlisted)} unlisted  |  - {len(not_found)} stale")

    images_on_disk = actual_count
    exif_count     = images_on_disk - len(no_exif) - len(unlisted)
    exif_pct       = (exif_count / images_on_disk * 100) if images_on_disk else 0
    exif_ok        = exif_pct >= 25.0
    print(f"  EXIF cov : {'[OK]' if exif_ok else '[LOW]'} {exif_count}/{images_on_disk} images have original EXIF "
          f"({exif_pct:.1f}%)  {'[OK]' if exif_ok else '[BELOW 25% THRESHOLD]'}")
    print()

    changed = False

    if not_found:
        print(f"  -- Stale JSON entries ({len(not_found)}) --")
        print("  These filenames are in the JSON but the image is not on disk.\n")
        for filename in not_found:
            print(f"    Entry : {filename}  ->  {capture_dates[filename]}")
            if prompt_yes_no("    Remove this entry from JSON?"):
                del capture_dates[filename]
                changed = True
                print(f"    -> Removed.\n")
            else:
                print(f"    -> Kept.\n")

    if unlisted:
        print(f"  -- Unlisted images ({len(unlisted)}) --")
        print("  These images exist on disk but have no entry in JSON.\n")
        for filename in unlisted:
            img_path  = actual_images[filename]
            exif_date = get_capture_date(img_path)
            print(f"    File : {filename}")
            if exif_date:
                print(f"    EXIF : {exif_date}")
                if prompt_yes_no("    Add this entry to JSON using EXIF date?"):
                    capture_dates[filename] = exif_date[:10] + "T00:00:00"
                    changed = True
                    print(f"    -> Added.\n")
                else:
                    print(f"    -> Skipped.\n")
            else:
                print(f"    EXIF : (none)")
                if prompt_yes_no("    No EXIF found. Enter the date manually and add to JSON?"):
                    manual = prompt_date("Enter date for this image")
                    if manual:
                        capture_dates[filename] = manual
                        changed = True
                        print(f"    -> Added with date {manual}.\n")
                    else:
                        print(f"    -> Skipped.\n")
                else:
                    print(f"    -> Skipped.\n")

    if time_only:
        for filename, json_date in time_only:
            dt = parse_json_date(json_date)
            corrected = (dt.strftime("%Y-%m-%d") if dt else json_date[:10]) + "T00:00:00"
            capture_dates[filename] = corrected
            changed = True
        print(f"  Auto-zeroed time for {len(time_only)} image(s).")

    if mismatches:
        print(f"  -- Date mismatches ({len(mismatches)}) --")
        fix = global_policy.get("fix", "ask")
        if fix == "ask":
            choice = prompt_choice(
                "How to handle mismatches?",
                [
                    "Fix all in this subject",
                    "Fix none in this subject",
                    "Decide image-by-image",
                    "Fix ALL in ALL remaining subjects",
                    "Fix NONE in ALL remaining subjects",
                ]
            )
            if   "Fix all"  in choice and "remaining" not in choice: fix = "all_this"
            elif "Fix none" in choice and "remaining" not in choice: fix = "none_this"
            elif "image-by-image" in choice:                         fix = "per_image"
            elif "ALL remaining"  in choice: fix = "all";  global_policy["fix"] = "all"
            elif "NONE in ALL"    in choice: fix = "none"; global_policy["fix"] = "none"
            print()
        for filename, json_date, exif_date in mismatches:
            do_fix = False
            corrected = exif_date[:10] + "T00:00:00"
            if fix in ("all", "all_this"):
                do_fix = True
            elif fix in ("none", "none_this"):
                do_fix = False
            else:
                print(f"    File    : {filename}")
                print(f"    JSON    : {json_date}  <- wrong date")
                print(f"    EXIF    : {exif_date}")
                print(f"    Fix to  : {corrected}")
                do_fix = prompt_yes_no("    Update JSON?")
                print()
            if do_fix:
                capture_dates[filename] = corrected
                changed = True

    if changed:
        metadata["historic_capture_dates"] = capture_dates
        save_json(metadata_path, metadata)
        print(f"  [OK] metadata.json saved.\n")
    else:
        print(f"  -- No changes made for {subject_name}.\n")

    return global_policy, subject_name, exif_pct, exif_ok

def main():
    print()
    while True:
        raw = input("  Enter folder path (single subject or dataset root): ").strip().strip('"').strip("'")
        if not raw:
            print("  Path cannot be empty. Please try again.\n")
            continue
        root = Path(raw)
        if root.exists():
            break
        print(f"  Path not found: {root}\n  Please check and try again.\n")

    print(f"\n{'='*62}")
    print(f"  Metadata Date Verifier")
    print(f"  Root: {root.resolve()}")
    print(f"{'='*62}\n")

    metadata_files = find_metadata_files(root)
    if not metadata_files:
        all_meta = list(root.rglob("metadata.json"))
        if all_meta:
            print(f"  Found {len(all_meta)} metadata.json file(s), but none had both")
            print("  'historic_capture_dates' AND a sibling Historical/ folder.\n")
            for m in all_meta:
                hist    = m.parent / "Historical"
                has_key = "historic_capture_dates" in load_json(m) if m.exists() else False
                print(f"    {m}  |  key={'[OK]' if has_key else '[X]'}  Historical/={'[OK]' if hist.is_dir() else '[X]'}")
        else:
            print("  No metadata.json files found under the given path.")
        print()
        sys.exit(0)

    print(f"  Found {len(metadata_files)} subject(s) to verify.\n")
    print(f"{'-'*62}\n")

    global_policy   = {"fix": "ask"}
    below_threshold = []

    for i, mf in enumerate(metadata_files, 1):
        print(f"[{i}/{len(metadata_files)}]")
        global_policy, subject_name, exif_pct, exif_ok = process_subject(mf, global_policy)
        if not exif_ok:
            below_threshold.append((subject_name, exif_pct))

    if below_threshold:
        report_path = root / "low_exif_coverage.txt"
        with open(report_path, "w", encoding="utf-8") as f:
            f.write("Subjects below 25% original EXIF coverage\n")
            f.write("=" * 45 + "\n\n")
            for name, pct in below_threshold:
                f.write(f"{name}  ({pct:.1f}%)\n")
        print(f"  [!] {len(below_threshold)} subject(s) below 25% EXIF threshold.")
        print(f"      Report saved -> {report_path}\n")

    print(f"{'='*62}")
    print("  Done.")
    print(f"{'='*62}\n")

if __name__ == "__main__":
    main()