#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io
# Force UTF-8 output on Windows to prevent cp1252 encoding errors
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

"""
Universal JPG Converter & JSON Sync (In-Place Version)
====================================================================
Features:
- Processes everything in-place (no output folder needed).
- Forces every image file to .jpg format.
- Quickly renames .jpeg to .jpg (no quality loss).
- Converts HEIC, MPO, PNG, etc., to standard RGB JPEG and deletes the original.
- Updates metadata.json only after verifying the .jpg actually exists on disk.
- Filters out system junk and temp files automatically.
- STRIPS proprietary Apple/HEIC metadata tags to ensure clean client ingestion.
"""

import json
import os
import sys
import traceback
from pathlib import Path

try:
    import piexif
    import pillow_heif
    from PIL import Image, ImageOps, ImageFile
    # Allow PIL to process slightly truncated files without crashing
    ImageFile.LOAD_TRUNCATED_IMAGES = True 
except ImportError as e:
    print(f"[ERROR] Missing dependency: {e}")
    print("Install with: pip install pillow-heif Pillow piexif")
    input("\nPress Enter to exit...")
    sys.exit(1)

# Register HEIF opener with Pillow
pillow_heif.register_heif_opener()


def get_real_image_format(filepath: Path) -> str:
    """Reads the first bytes to determine true image format."""
    try:
        with open(filepath, "rb") as f:
            header = f.read(32)

        if len(header) < 12:
            return "UNKNOWN"

        if header[4:8] == b"ftyp":
            return "HEIC"
        if header.startswith(b"\x89PNG\r\n\x1a\n"):
            return "PNG"
        if header.startswith(b"\xff\xd8"):
            try:
                with Image.open(filepath) as img:
                    if img.format == "MPO":
                        return "MPO"
                    return "JPEG"
            except Exception:
                return "JPEG"

    except Exception:
        pass

    return "UNKNOWN"


def convert_to_jpg(src_path: Path, dst_path: Path) -> bool:
    """Universal converter: Handles HEIC, MPO, PNG, etc., turning them into standard JPG."""
    try:
        with Image.open(src_path) as img:
            icc_profile = img.info.get("icc_profile")
            exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}

            if "exif" in img.info:
                try:
                    exif_dict = piexif.load(img.info["exif"])
                    
                    # --- NEW FIX: STRIP PROPRIETARY APPLE/HEIC HEADERS ---
                    
                    # 1. Remove MakerNotes (Tag 37500). This holds Apple's proprietary HEIC data.
                    if 37500 in exif_dict.get("Exif", {}):
                        del exif_dict["Exif"][37500]
                    if 37500 in exif_dict.get("0th", {}):
                        del exif_dict["0th"][37500]
                        
                    # 2. Remove Live Photo Video Index (Often stored in Tag 17 / 0x0011)
                    if 17 in exif_dict.get("0th", {}):
                        del exif_dict["0th"][17]
                    if 17 in exif_dict.get("Exif", {}):
                        del exif_dict["Exif"][17]
                        
                    # -----------------------------------------------------

                except Exception:
                    pass

            # Fix physical orientation so it doesn't rotate on Windows/Mac viewers
            img = ImageOps.exif_transpose(img)

            if piexif.ImageIFD.Orientation in exif_dict["0th"]:
                exif_dict["0th"][piexif.ImageIFD.Orientation] = 1

            # Strip alpha channels (transparency) since JPEG doesn't support them
            if img.mode != "RGB":
                img = img.convert("RGB")

            exif_bytes = piexif.dump(exif_dict) if exif_dict != {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None} else img.info.get("exif", b"")

            save_kwargs = {
                "format": "JPEG",
                "quality": 95,
                "optimize": True,
            }

            if exif_bytes:
                save_kwargs["exif"] = exif_bytes
            if icc_profile:
                save_kwargs["icc_profile"] = icc_profile

            img.save(dst_path, **save_kwargs)

        # Sync timestamps
        src_stats = os.stat(src_path)
        os.utime(dst_path, (src_stats.st_atime, src_stats.st_mtime))
        return True

    except Exception:
        print(f"  [ERROR] Failed to convert {src_path.name}:")
        traceback.print_exc()
        return False


def process_folder(target_folder: Path):
    """
    Forces all valid files to be .jpg in place. Cleans up old files.
    Returns counts for logging.
    """
    converted = renamed = skipped = failed = 0

    all_files = list(target_folder.rglob("*"))
    # Filter out ExifTool temp files, Windows Thumbs.db, and existing JSONs
    files_to_process = [
        p for p in all_files 
        if p.is_file() 
        and not p.name.endswith("_exiftool_tmp") 
        and p.name.lower() != "thumbs.db"
        and p.name.lower() != "metadata.json"
    ]
    
    total = len(files_to_process)
    print(f"\nFound {total} image(s) to process.\n")

    for idx, src_path in enumerate(files_to_process, 1):
        rel_path = src_path.relative_to(target_folder)
        fmt = get_real_image_format(src_path)
        dst_path = src_path.with_suffix(".jpg")

        if fmt == "JPEG":
            if src_path.suffix.lower() == ".jpg":
                print(f"[{idx}/{total}] Skipping (Already JPG) : {rel_path.name}")
                skipped += 1
            else:
                print(f"[{idx}/{total}] Renaming to .jpg     : {rel_path.name} -> {dst_path.name}")
                try:
                    src_path.rename(dst_path)
                    renamed += 1
                except Exception as e:
                    print(f"  [ERROR] Failed to rename {src_path.name}: {e}")
                    failed += 1
        else:
            print(f"[{idx}/{total}] Converting to JPG  : {rel_path.name} -> {dst_path.name}")
            
            # Safe conversion logic if the file is a different format but ALREADY named .jpg
            # (e.g. a PNG misnamed as .jpg). We use a temp file so we don't read/write simultaneously.
            if src_path == dst_path:
                temp_path = src_path.with_suffix(".tmp.jpg")
                success = convert_to_jpg(src_path, temp_path)
                if success:
                    src_path.unlink()  # Delete the bad original
                    temp_path.rename(dst_path)  # Rename temp to the final name
            else:
                success = convert_to_jpg(src_path, dst_path)
                if success:
                    src_path.unlink()  # Clean up original file (e.g., the .heic or .png)

            if success:
                converted += 1
            else:
                failed += 1

    return converted, renamed, skipped, failed


def update_metadata_json(target_folder: Path):
    """
    Finds metadata.json in-place, iterates through its keys,
    forces the extension to .jpg, and cross-checks the local disk.
    """
    meta_files = list(target_folder.rglob("metadata.json"))
    if not meta_files:
        print("\nNo metadata.json files found. Nothing to update.")
        return

    # Build a master list of all .jpg files in the folder (case-insensitive)
    available_jpgs = {p.name.lower() for p in target_folder.rglob("*") if p.suffix.lower() == ".jpg"}

    changes_made = 0

    for meta_path in meta_files:
        rel_meta = meta_path.relative_to(target_folder)
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"  [WARNING] Could not read {meta_path.name}: {e}")
            continue

        if "historic_capture_dates" not in data or not isinstance(data["historic_capture_dates"], dict):
            continue

        dates = data["historic_capture_dates"]
        updated_dates = {}
        file_changed = False

        print(f"\nVerifying JSON: {rel_meta}")

        for old_key, val in dates.items():
            new_key = Path(old_key).with_suffix(".jpg").name
            if new_key.lower() in available_jpgs:
                updated_dates[new_key] = val
                if old_key != new_key:
                    print(f"  [OK] Updated key: '{old_key}' -> '{new_key}'")
                    file_changed = True
            else:
                print(f"  ! Skipped key: '{old_key}' (Target '{new_key}' not found in folder)")
                updated_dates[old_key] = val

        data["historic_capture_dates"] = updated_dates

        if file_changed:
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            changes_made += 1

    if changes_made > 0:
        print(f"\n[SUCCESS] {changes_made} metadata.json file(s) synchronized successfully.")
    else:
        print("\n[INFO] All JSON keys already matched output files perfectly. No changes needed.")


def main() -> None:
    print("=" * 60)
    print("  Universal JPG Converter & JSON Sync (In-Place)")
    print("=" * 60)

    input_dir = input("\nTARGET folder (drag here): ").strip().strip('"').strip("'")
    
    if not input_dir:
        print("\n[ERROR] Path cannot be empty.")
        return

    target_folder = Path(input_dir).resolve()
    
    if not target_folder.exists():
        print(f"\n[ERROR] Folder does not exist: {target_folder}")
        return

    print("\n" + "-" * 60)
    print(f"  Target : {target_folder}")
    print("-" * 60)

    # 1. Process all images in-place
    conv, ren, skip, fail = process_folder(target_folder)

    # 2. Synchronize metadata.json
    update_metadata_json(target_folder)

    print("\n" + "=" * 60)
    print("  Summary")
    print("=" * 60)
    print(f"  Converted to JPG : {conv}")
    print(f"  Renamed to .jpg  : {ren}")
    print(f"  Skipped (As-Is)  : {skip}")
    print(f"  Failed           : {fail}")
    print("=" * 60)

    if fail:
        print(f"\n[WARNING] {fail} image(s) failed. See logs above.")
    else:
        print("\n[SUCCESS] All files processed perfectly.")

    input("\nPress Enter to exit...")


if __name__ == "__main__":
    main()