#!/usr/bin/env python3
"""Run parking-slot classification on a single image + JSON rectangles."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np
import torch
from PIL import Image
from torch import nn
from torchvision import models, transforms

CLASS_NAMES = {0: "free_parking_space", 1: "not_free_parking_space"}
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CHECKPOINT = SCRIPT_DIR / "model" / "mobilenet_v3_small_best.pth"

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Classify parking slots from image + JSON rectangles.")
    parser.add_argument("--image", type=Path, required=True, help="Path to the parking lot image (PNG/JPG).")
    parser.add_argument("--json", type=Path, required=True, help="Annotation JSON with rectangle regions.")
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=DEFAULT_CHECKPOINT,
        help="Path to trained MobileNet checkpoint.",
    )
    parser.add_argument("--output", type=Path, default=Path("./slot_predictions.json"), help="Output JSON file path.")
    parser.add_argument("--margin", type=float, default=0.05, help="Extra padding ratio for each slot crop.")
    return parser.parse_args()


def resolve_device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def load_model(checkpoint: Path, device: torch.device) -> nn.Module:
    weights = models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
    model = models.mobilenet_v3_small(weights=weights)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, len(CLASS_NAMES))
    state = torch.load(checkpoint, map_location=device, weights_only=False)
    if isinstance(state, dict) and "model_state" in state:
        model.load_state_dict(state["model_state"])
    else:
        model.load_state_dict(state)
    model.eval()
    model.to(device)
    return model


def crop_slot(
    image: np.ndarray, rect: Tuple[float, float, float, float], margin_ratio: float
) -> Image.Image:
    x, y, width, height = rect
    margin = margin_ratio * max(width, height)

    x0 = max(int(round(x - margin)), 0)
    y0 = max(int(round(y - margin)), 0)
    x1 = min(int(round(x + width + margin)), image.shape[1])
    y1 = min(int(round(y + height + margin)), image.shape[0])

    if x1 <= x0:
        x1 = min(x0 + 1, image.shape[1])
    if y1 <= y0:
        y1 = min(y0 + 1, image.shape[0])

    roi = image[y0:y1, x0:x1]
    return Image.fromarray(cv2.cvtColor(roi, cv2.COLOR_BGR2RGB))


def load_rectangles(json_path: Path) -> List[Tuple[float, float, float, float, int]]:
    data = json.loads(json_path.read_text(encoding="utf-8"))
    iterable = data if isinstance(data, list) else data.values()
    rects: List[Tuple[float, float, float, float, int]] = []
    for entry in iterable:
        for region in entry.get("regions", []):
            attrs = region.get("shape_attributes", {})
            if attrs.get("name") != "rect":
                continue
            x = float(attrs.get("x", 0))
            y = float(attrs.get("y", 0))
            width = float(attrs.get("width", 0))
            height = float(attrs.get("height", 0))
            rect_id = int(region.get("id", len(rects)))
            rects.append((x, y, width, height, rect_id))
    return rects


def build_transform() -> transforms.Compose:
    return transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )


def run_inference(image_path=None, json_path=None, output_path=None, checkpoint_path=None) -> dict:
    """
    Run inference programmatically or from command line.
    Returns the results dict instead of just saving to file.
    """
    # If called programmatically with parameters, use them
    if image_path is not None:
        class Args:
            def __init__(self):
                self.image = Path(image_path)
                self.json = Path(json_path)
                self.output = Path(output_path) if output_path else Path("./slot_predictions.json")
                self.checkpoint = Path(checkpoint_path) if checkpoint_path else DEFAULT_CHECKPOINT
                self.margin = 0.05
        args = Args()
    else:
        # Otherwise use command line arguments
        args = parse_args()
    
    device = resolve_device()
    transform = build_transform()

    image = cv2.imread(str(args.image))
    if image is None:
        raise FileNotFoundError(f"Failed to load image: {args.image}")

    rectangles = load_rectangles(args.json)
    model = load_model(args.checkpoint, device)

    results = []
    with torch.no_grad():
        for idx, rect in enumerate(rectangles):
            x, y, width, height, region_id = rect
            patch = crop_slot(image, (x, y, width, height), args.margin)
            tensor = transform(patch).unsqueeze(0).to(device)
            logits = model(tensor)
            pred = torch.argmax(logits, dim=1).item()
            results.append({"id": region_id, "occupied": bool(pred == 1)})

    payload = {"image": args.image.name, "slots": results}
    
    # Save to file
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(f"Saved predictions to {args.output}")
    
    # Return the results for programmatic use
    return payload
