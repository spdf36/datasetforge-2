import sys, io
# Force UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
import os

import io

import random

from PIL import Image, ImageFile
 
# Allow loading of truncated images just in case some files are slightly corrupted

ImageFile.LOAD_TRUNCATED_IMAGES = True
 
def process_single_image(filepath):

    """

    Processes a single image. Ensures minimum dimensions of 512x512

    and a minimum file size of ~128KB (randomized).

    """

    orig_size_kb = os.path.getsize(filepath) / 1024.0

    with Image.open(filepath) as img:

        orig_format = img.format or filepath.split('.')[-1].upper()

        # Fallback for formats Pillow names differently

        if orig_format == 'JPG': orig_format = 'JPEG'

        w, h = img.size

        orig_info = img.info

        # 1. Check conditions

        needs_resizing = w < 512 or h < 512

        needs_filesize_increase = orig_size_kb < 128

        if not needs_resizing and not needs_filesize_increase:

            return False, "Already meets criteria"
 
        # 2. Determine target size in KB (randomized between 130 and 260 if it's currently under 128)

        target_kb = random.uniform(130, 260) if needs_filesize_increase else orig_size_kb

        target_bytes = target_kb * 1024

        # 3. Preserve specific metadata tags (EXIF contains orientation, GPS, camera details)

        save_kwargs = {'format': orig_format}

        for key in ['exif', 'icc_profile', 'dpi', 'transparency']:

            if key in orig_info:

                save_kwargs[key] = orig_info[key]

        # For JPEGs/WebP, save at high quality to naturally boost file size without over-scaling

        if orig_format in ['JPEG', 'WEBP']:

            save_kwargs['quality'] = 98

            save_kwargs['subsampling'] = 0
 
        # 4. Step 1: Ensure both dimensions are >= 512

        scale = 1.0

        if needs_resizing:

            # We scale based on the shortest side to ensure BOTH sides are >= 512

            scale = max(512.0 / w, 512.0 / h)

        new_w = int(w * scale)

        new_h = int(h * scale)

        # We test sizes in an in-memory buffer to avoid writing to the disk continuously

        buf = io.BytesIO()

        temp_img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

        try:

            temp_img.save(buf, **save_kwargs)

        except Exception as e:

            # Fallback if specific save_kwargs crash on certain formats (like PNG transparency issues)

            temp_img.save(buf, format=orig_format)

            save_kwargs = {'format': orig_format}

        current_size = buf.tell()

        # 5. Step 2: Ensure file size >= target

        # Incrementally upscale the image until it hits the target file size

        while current_size < target_bytes:

            scale *= 1.05  # Upscale by 5% each iteration

            new_w = int(w * scale)

            new_h = int(h * scale)

            # Safeguard against infinite loops (e.g., solid color PNGs that won't grow easily)

            if new_w > 8000 or new_h > 8000:

                break

            buf = io.BytesIO()

            temp_img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

            temp_img.save(buf, **save_kwargs)

            current_size = buf.tell()

        # 6. Save back to disk, overwriting the original

        temp_img.save(filepath, **save_kwargs)

        final_size_kb = os.path.getsize(filepath) / 1024.0

        return True, f"Resized from {w}x{h} ({orig_size_kb:.1f}KB) to {new_w}x{new_h} ({final_size_kb:.1f}KB)"
 
 
def main():

    folder_path = input("Enter the folder path to process: ").strip()

    if not os.path.isdir(folder_path):

        print("Error: The specified path is not a valid folder.")

        return
 
    valid_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'}

    summary = {

        "total_checked": 0,

        "modified": 0,

        "skipped": 0,

        "errors": 0

    }

    print(f"\nScanning '{folder_path}'...")

    # Recursively traverse directories

    for root, dirs, files in os.walk(folder_path):

        for file in files:

            ext = os.path.splitext(file)[1].lower()

            if ext not in valid_extensions:

                continue

            summary["total_checked"] += 1

            filepath = os.path.join(root, file)

            try:

                modified, msg = process_single_image(filepath)

                if modified:

                    print(f"[MODIFIED] {file}: {msg}")

                    summary["modified"] += 1

                else:

                    summary["skipped"] += 1

            except Exception as e:

                print(f"[ERROR] Failed to process {file}: {e}")

                summary["errors"] += 1
 
    # Print Final Summary

    print("\n" + "="*30)

    print("=== PROCESSING SUMMARY ===")

    print("="*30)

    print(f"Total Images Checked  : {summary['total_checked']}")

    print(f"Images Modified       : {summary['modified']}")

    print(f"Images Skipped (Valid): {summary['skipped']}")

    print(f"Errors Encountered    : {summary['errors']}")

    print("="*30)
 
if __name__ == "__main__":

    main()