#!/usr/bin/env python3
"""
Structure-aware stall generator for OSU Lot C (north).

This script tries to detect parking aisles using Hough line clustering,
then subdivides each aisle into evenly spaced stalls by analyzing stripe
frequency along the aisle axis. It is still heuristic-driven, but it
produces far more granular boxes than the naive contour approach.

Usage:
  python scripts/cv/detect_stalls_smart.py \
      --image data/images/stadium-lot-northeast.png \
      --json-output data/stalls.json \
      --lot-id osu-parking-lot-c-north \
      --preview data/images/overlay-smart.png
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np


@dataclass
class Aisle:
  orientation: str  # "horizontal" or "vertical"
  start: float
  end: float
  fixed: float  # y for horizontal aisles, x for vertical
  thickness: float


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser()
  parser.add_argument("--image", required=True)
  parser.add_argument("--json-output", required=True)
  parser.add_argument("--lot-id", required=True)
  parser.add_argument("--preview")
  parser.add_argument("--horizontal-cluster-gap", type=float, default=14.0)
  parser.add_argument("--vertical-cluster-gap", type=float, default=18.0)
  parser.add_argument("--stripe-threshold", type=float, default=0.35)
  return parser.parse_args()


def load_image(path: Path):
  img = cv2.imread(str(path))
  if img is None:
    raise ValueError(f"Failed to read image {path}")
  gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
  blur = cv2.GaussianBlur(gray, (3, 3), 0)
  edges = cv2.Canny(blur, 40, 110, apertureSize=3, L2gradient=True)
  return img, edges


def cluster_positions(values: List[float], gap: float) -> List[float]:
  if not values:
    return []
  values.sort()
  clusters = []
  current = [values[0]]
  for v in values[1:]:
    if v - current[-1] <= gap:
      current.append(v)
    else:
      clusters.append(sum(current) / len(current))
      current = [v]
  clusters.append(sum(current) / len(current))
  return clusters


def detect_aisles(edges: np.ndarray,
                  orientation: str,
                  cluster_gap: float,
                  min_length: float = 150.0) -> List[Aisle]:
  lines = cv2.HoughLinesP(
      edges,
      rho=1,
      theta=np.pi / 180,
      threshold=80,
      minLineLength=120,
      maxLineGap=25)

  if lines is None:
    return []

  filtered = []
  for x1, y1, x2, y2 in lines[:, 0]:
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    if length < min_length:
      continue
    angle = math.degrees(math.atan2(dy, dx))
    if orientation == "horizontal":
      if abs(angle) < 12 or abs(abs(angle) - 180) < 12:
        filtered.append((x1, y1, x2, y2, length))
    else:
      if abs(abs(angle) - 90) < 12:
        filtered.append((x1, y1, x2, y2, length))

  if not filtered:
    return []

  # cluster based on orthogonal coordinate (y for horizontal, x for vertical)
  coords = [((y1 + y2) / 2) if orientation == "horizontal" else ((x1 + x2) / 2)
            for x1, y1, x2, y2, _ in filtered]
  clusters = cluster_positions(coords, cluster_gap)

  aisles: List[Aisle] = []
  for center in clusters:
    span_start = float("inf")
    span_end = float("-inf")
    thickness_accum = []
    for x1, y1, x2, y2, _ in filtered:
      reference = (y1 + y2) / 2 if orientation == "horizontal" else (x1 + x2) / 2
      if abs(reference - center) <= cluster_gap:
        if orientation == "horizontal":
          span_start = min(span_start, x1, x2)
          span_end = max(span_end, x1, x2)
          thickness_accum.append(abs(y2 - y1))
        else:
          span_start = min(span_start, y1, y2)
          span_end = max(span_end, y1, y2)
          thickness_accum.append(abs(x2 - x1))
    if span_end <= span_start:
      continue
    thickness = np.median(thickness_accum) if thickness_accum else 10.0
    aisles.append(
        Aisle(orientation=orientation,
              start=span_start,
              end=span_end,
              fixed=center,
              thickness=thickness))
  return aisles


def slice_horizontal_aisle(edges: np.ndarray,
                           aisle: Aisle,
                           stripe_threshold: float) -> List[Tuple[int, int, int, int]]:
  y0 = int(max(0, aisle.fixed - aisle.thickness * 1.8))
  y1 = int(min(edges.shape[0], aisle.fixed + aisle.thickness * 1.8))
  x0 = int(max(0, aisle.start))
  x1 = int(min(edges.shape[1], aisle.end))
  roi = edges[y0:y1, x0:x1]
  if roi.size == 0:
    return []

  projection = cv2.reduce(roi, 0, cv2.REDUCE_SUM, dtype=cv2.CV_32F).ravel()
  projection = cv2.GaussianBlur(projection, (1, 31), 0).ravel()
  if projection.max() == 0:
    return []

  norm = projection / projection.max()
  mask = norm > stripe_threshold
  segments = []
  in_seg = False
  seg_start = 0
  for idx, flag in enumerate(mask):
    if flag and not in_seg:
      in_seg = True
      seg_start = idx
    elif not flag and in_seg:
      in_seg = False
      segments.append((seg_start, idx))
  if in_seg:
    segments.append((seg_start, len(mask)))

  if len(segments) < 2:
    return []

  boundaries = [0]
  for start, end in segments:
    center = (start + end) / 2
    boundaries.append(center)
  boundaries.append(len(mask) - 1)
  boundaries = sorted(boundaries)

  boxes: List[Tuple[int, int, int, int]] = []
  for left_idx, right_idx in zip(boundaries[:-1], boundaries[1:]):
    if right_idx - left_idx < 6:
      continue
    left = int(x0 + left_idx)
    right = int(x0 + right_idx)
    boxes.append((left, y0, right, y1))
  return boxes


def slice_vertical_aisle(edges: np.ndarray,
                         aisle: Aisle,
                         stripe_threshold: float) -> List[Tuple[int, int, int, int]]:
  x0 = int(max(0, aisle.fixed - aisle.thickness * 2.0))
  x1 = int(min(edges.shape[1], aisle.fixed + aisle.thickness * 2.0))
  y0 = int(max(0, aisle.start))
  y1 = int(min(edges.shape[0], aisle.end))
  roi = edges[y0:y1, x0:x1]
  if roi.size == 0:
    return []

  projection = cv2.reduce(roi, 1, cv2.REDUCE_SUM, dtype=cv2.CV_32F).ravel()
  projection = cv2.GaussianBlur(projection, (31, 1), 0).ravel()
  if projection.max() == 0:
    return []

  norm = projection / projection.max()
  mask = norm > stripe_threshold
  segments = []
  in_seg = False
  seg_start = 0
  for idx, flag in enumerate(mask):
    if flag and not in_seg:
      in_seg = True
      seg_start = idx
    elif not flag and in_seg:
      in_seg = False
      segments.append((seg_start, idx))
  if in_seg:
    segments.append((seg_start, len(mask)))

  if len(segments) < 2:
    return []

  boundaries = [0]
  for start, end in segments:
    center = (start + end) / 2
    boundaries.append(center)
  boundaries.append(len(mask) - 1)
  boundaries = sorted(boundaries)

  boxes: List[Tuple[int, int, int, int]] = []
  for top_idx, bottom_idx in zip(boundaries[:-1], boundaries[1:]):
    if bottom_idx - top_idx < 6:
      continue
    top = int(y0 + top_idx)
    bottom = int(y0 + bottom_idx)
    boxes.append((x0, top, x1, bottom))
  return boxes


def boxes_to_stalls(boxes: List[Tuple[int, int, int, int]],
                    start_index: int) -> Tuple[List[dict], int]:
  stalls = []
  idx = start_index
  for x0, y0, x1, y1 in boxes:
    polygon = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    stalls.append({
        "id": f"S-{idx:03d}",
        "polygon": polygon,
        "permit": ["C"],
        "status": "open",
        "confidence": 0.7
    })
    idx += 1
  return stalls, idx


def save_preview(image: np.ndarray, stalls: List[dict], path: Path):
  preview = image.copy()
  for stall in stalls:
    pts = np.array(stall["polygon"], np.int32)
    cv2.fillPoly(preview, [pts], (60, 200, 80))
    cv2.polylines(preview, [pts], True, (0, 0, 0), 1)
  path.parent.mkdir(parents=True, exist_ok=True)
  cv2.imwrite(str(path), preview)


def main():
  args = parse_args()
  image_path = Path(args.image)
  json_path = Path(args.json_output)

  image, edges = load_image(image_path)

  horizontal_aisles = detect_aisles(
      edges, "horizontal", args.horizontal_cluster_gap)
  vertical_aisles = detect_aisles(
      edges, "vertical", args.vertical_cluster_gap, min_length=80)

  stalls: List[dict] = []
  next_id = 1

  for aisle in horizontal_aisles:
    boxes = slice_horizontal_aisle(edges, aisle, args.stripe_threshold)
    new_stalls, next_id = boxes_to_stalls(boxes, next_id)
    stalls.extend(new_stalls)

  for aisle in vertical_aisles:
    boxes = slice_vertical_aisle(edges, aisle, args.stripe_threshold)
    new_stalls, next_id = boxes_to_stalls(boxes, next_id)
    stalls.extend(new_stalls)

  stalls.sort(key=lambda s: (np.mean([p[1] for p in s["polygon"]]),
                             np.mean([p[0] for p in s["polygon"]])))

  if json_path.exists():
    with open(json_path) as f:
      data = json.load(f)
  else:
    data = {}
  data[args.lot_id] = stalls

  with open(json_path, "w") as f:
    json.dump(data, f, indent=2)

  if args.preview:
    save_preview(image, stalls, Path(args.preview))

  print(f"Generated {len(stalls)} stalls for lot '{args.lot_id}'")


if __name__ == "__main__":
  main()
