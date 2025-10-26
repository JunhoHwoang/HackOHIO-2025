#!/usr/bin/env python3
"""Extract per-slot images using VIA-style JSON annotations."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Dict, List

import cv2
import numpy as np

CLASS_MAP = {
    "free": 0,
    "occupied": 1,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract parking slots from JSON annotations")
    parser.add_argument("--data-dir", type=Path, default=Path("./test2"), help="Directory containing images and JSON")
    parser.add_argument("--json", type=Path, default=Path("./test2/test_data.json"), help="Annotation JSON file")
    parser.add_argument("--output-dir", type=Path, default=Path("./slot_dataset_json"), help="Output directory")
    parser.add_argument("--image-ext", type=str, default="jpg", help="Output image extension")
    parser.add_argument("--default-label", type=str, choices=list(CLASS_MAP.keys()), default="occupied")
    return parser.parse_args()


def ensure_dirs(output_dir: Path) -> Dict[str, Path]:
    paths = {}
    for label in CLASS_MAP:
        path = output_dir / "images" / label
        path.mkdir(parents=True, exist_ok=True)
        paths[label] = path
    return paths


def extract_regions(json_path: Path) -> List[Dict]:
    data = json.loads(json_path.read_text(encoding="utf-8"))
    regions = []
    for entry in data.values():
        image_name = entry.get("filename") or entry.get("file_name") or entry.get("file")
        if image_name is None:
            continue
        for region in entry.get("regions", []):
            attrs = region.get("shape_attributes", {})
            if attrs.get("name") != "rect":
                continue
            label_attr = next(iter(region.get("region_attributes", {}).values()), None)
            label = label_attr if label_attr in CLASS_MAP else None
            regions.append(
                {
                    "image": image_name,
                    "label": label,
                    "x": int(attrs.get("x", 0)),
                    "y": int(attrs.get("y", 0)),
                    "width": int(attrs.get("width", 0)),
                    "height": int(attrs.get("height", 0)),
                }
            )
    return regions


def crop_rect(image: np.ndarray, x: int, y: int, width: int, height: int) -> np.ndarray:
    h, w = image.shape[:2]
    x0 = max(x, 0)
    y0 = max(y, 0)
    x1 = min(x + width, w)
    y1 = min(y + height, h)
    if x1 <= x0:
        x1 = min(x0 + 1, w)
    if y1 <= y0:
        y1 = min(y0 + 1, h)
    return image[y0:y1, x0:x1]


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    label_dirs = ensure_dirs(output_dir)

    regions = extract_regions(args.json)
    if not regions:
        raise SystemExit("No regions found in JSON.")

    metadata_path = output_dir / "metadata.json.csv"
    with metadata_path.open("w", newline="", encoding="utf-8") as meta_file:
        writer = csv.writer(meta_file)
        writer.writerow(["sample_id", "label", "label_id", "image_path", "source_image", "bbox"])

        image_cache: Dict[str, np.ndarray] = {}
        idx = 0
        for region in regions:
            image_path = args.data_dir / region["image"]
            if image_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                image_path = args.data_dir / f"{region['image']}.{args.image_ext}"
            if image_path not in image_cache:
                img = cv2.imread(str(image_path))
                if img is None:
                    print(f"[WARN] Missing image: {image_path}")
                    continue
                image_cache[str(image_path)] = img
            img = image_cache[str(image_path)]

            crop = crop_rect(img, region["x"], region["y"], region["width"], region["height"])
            label = region["label"] or args.default_label
            class_id = CLASS_MAP[label]
            file_name = f"slot_json_{idx:05d}.{args.image_ext}"
            save_path = label_dirs[label] / file_name
            cv2.imwrite(str(save_path), crop)

            writer.writerow(
                [
                    idx,
                    label,
                    class_id,
                    str(save_path.relative_to(output_dir)),
                    region["image"],
                    f"{region['x']},{region['y']},{region['width']},{region['height']}",
                ]
            )
            idx += 1

    print(f"Done! Saved {idx} crops to {output_dir} (metadata: {metadata_path})")


if __name__ == "__main__":
    main()
