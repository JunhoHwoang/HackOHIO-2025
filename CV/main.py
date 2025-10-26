#!/usr/bin/env python3
"""Train a MobileNetV3-Small classifier on per-slot parking data."""

from __future__ import annotations

import argparse
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Sequence, Tuple

import numpy as np
import pandas as pd
import torch
from PIL import Image
from torch import nn, optim
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")


@dataclass
class TrainConfig:
    dataset_dir: Path
    output_dir: Path
    epochs: int
    batch_size: int
    lr: float
    weight_decay: float
    train_split: float
    seed: int
    num_workers: int


class SlotDataset(Dataset):
    def __init__(self, df: pd.DataFrame, root: Path, transform: transforms.Compose):
        self.df = df.reset_index(drop=True)
        self.root = root
        self.transform = transform

    def __len__(self) -> int:  # type: ignore[override]
        return len(self.df)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int]:  # type: ignore[override]
        row = self.df.iloc[idx]
        path = self.root / row["image_path"]
        image = Image.open(path).convert("RGB")
        return self.transform(image), int(row["label_id"])


def parse_args(argv: Optional[Sequence[str]] = None) -> TrainConfig:
    parser = argparse.ArgumentParser(description="MobileNetV3-Small slot classifier")
    parser.add_argument("--dataset-dir", type=Path, default=Path("./slot_dataset"), help="Directory with metadata.csv and images/")
    parser.add_argument("--output-dir", type=Path, default=Path("./runs/mobilenet"), help="Where to store checkpoints and logs")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--train-split", type=float, default=0.8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--num-workers", type=int, default=4)
    args = parser.parse_args(argv)
    return TrainConfig(
        dataset_dir=args.dataset_dir,
        output_dir=args.output_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        weight_decay=args.weight_decay,
        train_split=args.train_split,
        seed=args.seed,
        num_workers=args.num_workers,
    )


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def resolve_device() -> torch.device:
    if torch.backends.mps.is_available():
        print("⚙️  Using Mac GPU (MPS)")
        return torch.device("mps")
    if torch.cuda.is_available():
        print("⚙️  Using CUDA GPU")
        return torch.device("cuda")
    print("⚙️  Using CPU")
    return torch.device("cpu")


def load_metadata(cfg: TrainConfig) -> Tuple[pd.DataFrame, pd.DataFrame, int]:
    metadata_path = cfg.dataset_dir / "metadata.csv"
    if not metadata_path.exists():
        raise FileNotFoundError(
            f"metadata.csv not found in {cfg.dataset_dir}. Run extract_slots_xml.py or extract_slots_json.py first to create slot samples."
        )

    df = pd.read_csv(metadata_path)
    if "label_id" not in df.columns:
        raise ValueError("metadata.csv must contain a 'label_id' column")

    df = df.sample(frac=1.0, random_state=cfg.seed).reset_index(drop=True)
    train_len = int(len(df) * cfg.train_split)
    train_df = df.iloc[:train_len]
    val_df = df.iloc[train_len:]
    num_classes = df["label_id"].nunique()

    print(
        f"Loaded {len(df)} slot samples -> train: {len(train_df)}, val: {len(val_df)}, classes: {num_classes}"
    )
    return train_df, val_df, num_classes


def build_transforms() -> Tuple[transforms.Compose, transforms.Compose]:
    normalize = transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    resize = transforms.Resize((224, 224))

    train_tf = transforms.Compose(
        [
            resize,
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.05),
            transforms.RandomHorizontalFlip(),
            transforms.ToTensor(),
            normalize,
        ]
    )

    val_tf = transforms.Compose(
        [
            resize,
            transforms.ToTensor(),
            normalize,
        ]
    )
    return train_tf, val_tf


def build_model(num_classes: int) -> nn.Module:
    weights = models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
    model = models.mobilenet_v3_small(weights=weights)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, num_classes)
    return model


def train_one_epoch(model: nn.Module, loader: DataLoader, criterion: nn.Module, optimizer: optim.Optimizer, device: torch.device) -> Tuple[float, float]:
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0

    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad()
        logits = model(images)
        loss = criterion(logits, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * labels.size(0)
        preds = torch.argmax(logits, dim=1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)

    return running_loss / total, correct / total if total else 0.0


def evaluate(model: nn.Module, loader: DataLoader, criterion: nn.Module, device: torch.device) -> Tuple[float, float]:
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            logits = model(images)
            loss = criterion(logits, labels)
            running_loss += loss.item() * labels.size(0)
            preds = torch.argmax(logits, dim=1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

    return running_loss / total, correct / total if total else 0.0


def main(cfg: Optional[TrainConfig] = None) -> None:
    if cfg is None:
        cfg = parse_args()
    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    set_seed(cfg.seed)

    train_df, val_df, num_classes = load_metadata(cfg)
    train_tf, val_tf = build_transforms()

    train_dataset = SlotDataset(train_df, cfg.dataset_dir, train_tf)
    val_dataset = SlotDataset(val_df, cfg.dataset_dir, val_tf)

    train_loader = DataLoader(train_dataset, batch_size=cfg.batch_size, shuffle=True, num_workers=cfg.num_workers, pin_memory=True)
    val_loader = DataLoader(val_dataset, batch_size=cfg.batch_size, shuffle=False, num_workers=cfg.num_workers, pin_memory=True)

    device = resolve_device()
    model = build_model(num_classes).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=cfg.epochs)

    best_acc = 0.0
    best_path = cfg.output_dir / "mobilenet_v3_small_best.pth"
    history_path = cfg.output_dir / "training_history.csv"

    with history_path.open("w", encoding="utf-8") as history_file:
        history_file.write("epoch,train_loss,train_acc,val_loss,val_acc,lr\n")
        for epoch in range(1, cfg.epochs + 1):
            train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, device)
            val_loss, val_acc = evaluate(model, val_loader, criterion, device)
            scheduler.step()

            lr = optimizer.param_groups[0]["lr"]
            history_file.write(f"{epoch},{train_loss:.4f},{train_acc:.4f},{val_loss:.4f},{val_acc:.4f},{lr:.6f}\n")
            history_file.flush()

            print(
                f"Epoch {epoch:02d}/{cfg.epochs} | train_loss={train_loss:.4f} acc={train_acc:.3f} | "
                f"val_loss={val_loss:.4f} acc={val_acc:.3f}"
            )

            if val_acc > best_acc:
                best_acc = val_acc
                torch.save(
                    {
                        "model_state": model.state_dict(),
                        "optimizer_state": optimizer.state_dict(),
                        "config": cfg.__dict__,
                        "val_acc": val_acc,
                    },
                    best_path,
                )
                print(f"✨ Saved new best model to {best_path} (val_acc={val_acc:.3f})")

    print("Training complete! Best validation accuracy:", round(best_acc, 3))
    print(f"Checkpoints and logs stored in {cfg.output_dir}")


if __name__ == "__main__":
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    main()
