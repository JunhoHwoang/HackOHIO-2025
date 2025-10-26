#!/usr/bin/env python3
"""Fetch OSU campus parking lots and stalls from OpenStreetMap via Overpass."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List

import requests

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter"
]


def build_query(bbox: str, amenity: str) -> str:
    return f"""
[out:json][timeout:60];
(
  node["amenity"="{amenity}"]({bbox});
  way["amenity"="{amenity}"]({bbox});
  relation["amenity"="{amenity}"]({bbox});
);
out geom tags;
"""


def request_overpass(query: str) -> Dict[str, Any]:
    last_error: Exception | None = None
    for url in OVERPASS_ENDPOINTS:
        try:
            response = requests.post(url, data=query, timeout=60)
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print(f"  failed endpoint {url}: {exc}")
    if last_error:
        raise last_error
    raise RuntimeError("No Overpass endpoints attempted")


def element_to_feature(element: Dict[str, Any]) -> Dict[str, Any]:
    geometry = element.get("geometry")
    feature: Dict[str, Any] = {
        "type": "Feature",
        "properties": {
            "id": f"{element['type']}/{element['id']}",
            "tags": element.get("tags", {})
        }
    }

    if element["type"] == "node":
        feature["geometry"] = {
            "type": "Point",
            "coordinates": [element["lon"], element["lat"]]
        }
    elif geometry:
        coords = [[g["lon"], g["lat"]] for g in geometry]
        if coords and coords[0] != coords[-1]:
            coords.append(coords[0])
        feature["geometry"] = {
            "type": "Polygon",
            "coordinates": [coords]
        }
    else:
        center = element.get("center")
        if not center:
            raise ValueError(f"Element {element['id']} has no geometry")
        feature["geometry"] = {
            "type": "Point",
            "coordinates": [center["lon"], center["lat"]]
        }
    return feature


def features_from_overpass(elements: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [element_to_feature(el) for el in elements]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch OSU parking data from OSM")
    parser.add_argument("--south", type=float, default=40.0000)
    parser.add_argument("--west", type=float, default=-83.0325)
    parser.add_argument("--north", type=float, default=40.0180)
    parser.add_argument("--east", type=float, default=-83.0085)
    parser.add_argument("--dir", type=Path, default=Path("data/osm"))
    parser.add_argument("--lots", type=str, default="osu_campus_parking_lots.geojson")
    parser.add_argument("--spaces", type=str, default="osu_campus_parking_spaces.geojson")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    bbox = f"{args.south},{args.west},{args.north},{args.east}"

    print("Fetching parking lots...", flush=True)
    lots_data = request_overpass(build_query(bbox, "parking"))
    lot_features = features_from_overpass(lots_data.get("elements", []))
    print(f"  retrieved {len(lot_features)} features")

    print("Fetching parking spaces...", flush=True)
    spaces_data = request_overpass(build_query(bbox, "parking_space"))
    space_features = features_from_overpass(spaces_data.get("elements", []))
    print(f"  retrieved {len(space_features)} features")

    args.dir.mkdir(parents=True, exist_ok=True)

    lots_out = args.dir / args.lots
    spaces_out = args.dir / args.spaces

    lots_out.write_text(json.dumps({
        "type": "FeatureCollection",
        "features": lot_features,
        "bbox": [args.west, args.south, args.east, args.north]
    }, indent=2) + "\n")

    spaces_out.write_text(json.dumps({
        "type": "FeatureCollection",
        "features": space_features,
        "bbox": [args.west, args.south, args.east, args.north]
    }, indent=2) + "\n")

    print(f"Saved lots to {lots_out}")
    print(f"Saved spaces to {spaces_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
