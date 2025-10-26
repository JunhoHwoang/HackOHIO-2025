#!/usr/bin/env python3
"""Extract per-slot classification samples from CVAT annotations."""

from __future__ import annotations

import argparse
import csv
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import cv2
import numpy as np

CLASS_MAP = {
    "free_parking_space": 0,
    "not_free_parking_space": 1,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract parking slot patches from annotations.xml")
    parser.add_argument("--data-dir", type=Path, default=Path("./data"), help="Directory containing images/ and annotations.xml")
    parser.add_argument("--output-dir", type=Path, default=Path("./slot_dataset"), help="Destination directory for samples")
    parser.add_argument("--margin", type=float, default=0.05, help="Padding ratio to expand each slot crop")
    parser.add_argument("--min-area", type=float, default=50.0, help="Minimum bounding-box area to keep a slot")
    parser.add_argument("--image-ext", type=str, default="jpg", help="Image extension for saved crops (jpg/png)")
    return parser.parse_args()


def ensure_output_dirs(output_dir: Path) -> Dict[str, Path]:
    paths = {}
    for label in CLASS_MAP.keys():
        path = output_dir / "images" / label
        path.mkdir(parents=True, exist_ok=True)
        paths[label] = path
    return paths


def parse_points(points_str: str) -> np.ndarray:
    pts = []
    for pair in points_str.split(";"):
        x_str, y_str = pair.split(",")
        pts.append((float(x_str), float(y_str)))
    return np.array(pts, dtype=np.float32)


def polygon_bbox(points: np.ndarray) -> Tuple[float, float, float, float]:
    x_min = float(points[:, 0].min())
    x_max = float(points[:, 0].max())
    y_min = float(points[:, 1].min())
    y_max = float(points[:, 1].max())
    return x_min, y_min, x_max, y_max


def load_annotations(xml_path: Path) -> Iterable[Tuple[str, str, np.ndarray]]:
    root = ET.parse(xml_path).getroot()
    for image in root.findall("image"):
        image_name = image.get("name")
        for polygon in image.findall("polygon"):
            label = polygon.get("label")
            if label not in CLASS_MAP:
                continue
            points = parse_points(polygon.get("points", ""))
            yield image_name, label, points


def crop_slot(image: np.ndarray, points: np.ndarray, margin_ratio: float) -> np.ndarray:
    h, w = image.shape[:2]
    x_min, y_min, x_max, y_max = polygon_bbox(points)
    width = x_max - x_min
    height = y_max - y_min
    margin = margin_ratio * max(width, height)

    x0 = max(int(round(x_min - margin)), 0)
    y0 = max(int(round(y_min - margin)), 0)
    x1 = min(int(round(x_max + margin)), w)
    y1 = min(int(round(y_max + margin)), h)

    roi = image[y0:y1, x0:x1]

    # mask polygon within ROI to remove background cars
    shifted_points = points - np.array([x0, y0], dtype=np.float32)
    mask = np.zeros((roi.shape[0], roi.shape[1]), dtype=np.uint8)
    cv2.fillPoly(mask, [shifted_points.astype(np.int32)], 255)
    masked_roi = cv2.bitwise_and(roi, roi, mask=mask)
    return masked_roi


def main() -> None:
    args = parse_args()
    data_dir = args.data_dir
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    image_cache: Dict[str, np.ndarray] = {}
    label_dirs = ensure_output_dirs(output_dir)

    metadata_path = output_dir / "metadata.csv"
    with metadata_path.open("w", newline="", encoding="utf-8") as meta_file:
        writer = csv.writer(meta_file)
        writer.writerow(["sample_id", "label", "label_id", "image_path", "source_image", "points"])

        sample_id = 0
        for image_name, label, points in load_annotations(data_dir / "annotations.xml"):
            image_path = data_dir / image_name
            if image_name not in image_cache:
                img = cv2.imread(str(image_path))
                if img is None:
                    print(f"[WARN] Failed to load image: {image_path}")
                    continue
                image_cache[image_name] = img
            img = image_cache[image_name]

            x_min, y_min, x_max, y_max = polygon_bbox(points)
            if (x_max - x_min) * (y_max - y_min) < args.min_area:
                continue

            crop = crop_slot(img, points, args.margin)
            if crop.size == 0:
                continue

            sample_name = f"slot_{sample_id:05d}.{args.image_ext}"
            save_dir = label_dirs[label]
            save_path = save_dir / sample_name
            cv2.imwrite(str(save_path), crop)

            writer.writerow(
                [
                    sample_id,
                    label,
                    CLASS_MAP[label],
                    str(save_path.relative_to(output_dir)),
                    image_name,
                    "|".join(f"{pt[0]:.2f},{pt[1]:.2f}" for pt in points),
                ]
            )
            sample_id += 1

    print(
        f"Done! Saved {sample_id} slot images under {output_dir}.\n"
        f"Per-label directories: {[str(path) for path in label_dirs.values()]}\n"
        f"Metadata: {metadata_path}"
    )


if __name__ == "__main__":
    main()
