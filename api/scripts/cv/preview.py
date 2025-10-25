#!/usr/bin/env python3
"""
Overlay stalls from data/stalls.json onto a parking lot image for quick QA.

Usage:
    python scripts/cv/preview.py \
        --image data/images/stadium-lot-northeast.png \
        --stalls data/stalls.json \
        --lot-id osu-parking-lot-c-north \
        --out data/images/overlay-preview.png
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

import cv2
import numpy as np


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser()
  parser.add_argument("--image", required=True, help="Path to base lot image")
  parser.add_argument("--stalls", required=True, help="stalls.json path")
  parser.add_argument("--lot-id", required=True, help="Lot identifier")
  parser.add_argument("--out", required=True, help="Output PNG for overlay")
  return parser.parse_args()


def main():
  args = parse_args()
  image_path = Path(args.image)
  stalls_path = Path(args.stalls)
  out_path = Path(args.out)

  img = cv2.imread(str(image_path))
  if img is None:
    raise ValueError(f"Cannot open image {image_path}")

  data: Dict[str, Any] = json.loads(stalls_path.read_text())
  stalls: List[Dict[str, Any]] = data.get(args.lot_id, [])

  for stall in stalls:
    pts = np.array(stall["polygon"], np.int32)
    color = (0, 200, 0) if stall.get("status", "open") == "open" else (0, 0, 200)
    cv2.fillPoly(img, [pts], color)
    cv2.polylines(img, [pts], True, (0, 0, 0), 1)

  out_path.parent.mkdir(parents=True, exist_ok=True)
  cv2.imwrite(str(out_path), img)
  print(f"Overlay saved to {out_path}")


if __name__ == "__main__":
  main()
