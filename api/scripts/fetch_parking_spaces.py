#!/usr/bin/env python3
"""
Fetch parking-space geometries from OpenStreetMap using Overpass.

Example:
    source ../.venv/bin/activate
    python scripts/fetch_parking_spaces.py \
        --south 40.0028 --west -83.0196 --north 40.0043 --east -83.0176 \
        --out data/osm/parking_spaces_lane_north.geojson

The script hits the public Overpass API, so be considerate (narrow bbox, low frequency).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def build_query(south: float, west: float, north: float, east: float) -> str:
  bbox = f"{south},{west},{north},{east}"
  return f"""
[out:json][timeout:25];
(
  node["amenity"="parking_space"]({bbox});
  way["amenity"="parking_space"]({bbox});
  relation["amenity"="parking_space"]({bbox});
);
out geom tags;
"""


def element_to_feature(element: Dict[str, Any]) -> Dict[str, Any]:
  geom = element.get("geometry", [])
  etype = element["type"]
  feature: Dict[str, Any] = {
      "type": "Feature",
      "properties": {
          "id": f'{etype}/{element["id"]}',
          "tags": element.get("tags", {})
      }
  }

  if etype == "node":
    feature["geometry"] = {
        "type": "Point",
        "coordinates": [element["lon"], element["lat"]]
    }
  elif geom:
    coords = [[g["lon"], g["lat"]] for g in geom]
    # ensure closed polygon
    if coords and coords[0] != coords[-1]:
      coords.append(coords[0])
    feature["geometry"] = {"type": "Polygon", "coordinates": [coords]}
  else:
    # fallback to center point
    center = element.get("center")
    if not center:
      raise ValueError(f"No geometry for element {element['id']}")
    feature["geometry"] = {
        "type": "Point",
        "coordinates": [center["lon"], center["lat"]]
    }
  return feature


def fetch_features(query: str) -> List[Dict[str, Any]]:
  response = requests.post(OVERPASS_URL, data=query)
  response.raise_for_status()
  payload = response.json()
  return payload.get("elements", [])


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser()
  parser.add_argument("--south", type=float, required=True)
  parser.add_argument("--west", type=float, required=True)
  parser.add_argument("--north", type=float, required=True)
  parser.add_argument("--east", type=float, required=True)
  parser.add_argument(
      "--out",
      type=Path,
      default=Path("data/osm/parking_spaces.geojson"),
      help="Output GeoJSON file")
  return parser.parse_args()


def main() -> int:
  args = parse_args()

  query = build_query(args.south, args.west, args.north, args.east)
  print("Querying Overpass...", file=sys.stderr)

  elements = fetch_features(query)
  print(f"Retrieved {len(elements)} elements", file=sys.stderr)

  features = [element_to_feature(el) for el in elements]

  feature_collection = {
      "type": "FeatureCollection",
      "features": features,
      "bbox": [args.west, args.south, args.east, args.north],
      "meta": {"generated_by": "fetch_parking_spaces.py"}
  }

  args.out.parent.mkdir(parents=True, exist_ok=True)
  with args.out.open("w") as fh:
    json.dump(feature_collection, fh, indent=2)
    fh.write("\n")

  print(f"Saved GeoJSON to {args.out}", file=sys.stderr)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
