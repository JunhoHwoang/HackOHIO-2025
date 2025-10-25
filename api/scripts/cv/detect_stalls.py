#!/usr/bin/env python3
"""
Quick-and-dirty parking stall extractor for OSU Lot C (north) map imagery.

Usage example:
    python scripts/cv/detect_stalls.py \
        --image data/images/stadium-lot-northeast.png \
        --json-output data/stalls.json \
        --lot-id osu-parking-lot-c-north \
        --preview data/images/overlay-preview.png

You will likely tweak blur size, thresholds, min/max contour area, or add
custom row/column clustering depending on your source imagery.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List, Sequence

import cv2
import numpy as np


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser()
  parser.add_argument(
      "--image",
      required=True,
      help="Path to the overhead PNG/JPG image of the lot")
  parser.add_argument(
      "--json-output",
      required=True,
      help="Path to stalls.json (will be created/overwritten)")
  parser.add_argument("--lot-id", required=True, help="Lot identifier key")
  parser.add_argument(
      "--preview",
      help="Optional PNG path; overlays detected stalls for inspection")
  parser.add_argument(
      "--min-area",
      type=float,
      default=350.0,
      help="Reject contours smaller than this area (pixel units)")
  parser.add_argument(
      "--max-area",
      type=float,
      default=4000.0,
      help="Reject contours larger than this area (pixel units)")
  return parser.parse_args()


def load_and_preprocess(image_path: Path):
  img = cv2.imread(str(image_path))
  if img is None:
    raise ValueError(f"Failed to read image: {image_path}")

  gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
  blur = cv2.GaussianBlur(gray, (5, 5), 0)
  edges = cv2.adaptiveThreshold(
      blur, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 4)
  kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
  closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
  cleaned = cv2.erode(closed, kernel, iterations=1)
  return img, cleaned


def contour_to_polygon(contour: np.ndarray) -> np.ndarray:
  rect = cv2.minAreaRect(contour)
  box = cv2.boxPoints(rect)
  return box.astype(np.int32)


def polygon_to_stall(points: Sequence[Sequence[int]],
                     stall_id: str) -> Dict[str, object]:
  polygon = [[int(x), int(y)] for x, y in points]
  return {
      "id": stall_id,
      "polygon": polygon,
      "permit": ["C"],
      "status": "open",
      "confidence": 0.6,
  }


def write_preview(image: np.ndarray, stalls: List[Dict[str, object]],
                  preview_path: Path):
  preview = image.copy()
  for stall in stalls:
    pts = np.array(stall["polygon"], np.int32)
    cv2.polylines(preview, [pts], True, (0, 255, 0), thickness=2)
  preview_path.parent.mkdir(parents=True, exist_ok=True)
  cv2.imwrite(str(preview_path), preview)


def main():
  args = parse_args()
  image_path = Path(args.image)
  json_path = Path(args.json_output)
  lot_id = args.lot_id

  image, binary = load_and_preprocess(image_path)

  contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL,
                                 cv2.CHAIN_APPROX_SIMPLE)

  stalls: List[Dict[str, object]] = []
  for contour in contours:
    area = cv2.contourArea(contour)
    if area < args.min_area or area > args.max_area:
      continue
    epsilon = 0.02 * cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, epsilon, True)
    if len(approx) < 4:
      continue
    box = contour_to_polygon(approx)
    stall_id = f"S-{len(stalls) + 1:03d}"
    stalls.append(polygon_to_stall(box, stall_id))

  stalls.sort(key=lambda s: (
      np.mean([p[1] for p in s["polygon"]]),
      np.mean([p[0] for p in s["polygon"]]),
  ))

  if json_path.exists():
    with open(json_path) as f:
      data = json.load(f)
  else:
    data = {}

  data[lot_id] = stalls

  json_path.parent.mkdir(parents=True, exist_ok=True)
  with open(json_path, "w") as f:
    json.dump(data, f, indent=2)

  if args.preview:
    write_preview(image, stalls, Path(args.preview))

  print(f"Detected {len(stalls)} stalls for lot '{lot_id}' and wrote {json_path}")


if __name__ == "__main__":
  main()
