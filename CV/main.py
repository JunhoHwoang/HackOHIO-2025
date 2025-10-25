#!/usr/bin/env python3
"""
YOLO Training Script for Parking Space Detection
This script trains a YOLO model on parking space detection data using Ultralytics.
"""

import sys
import xml.etree.ElementTree as ET
import pandas as pd
from pathlib import Path
import yaml
import shutil
from typing import Dict

# Import YOLO from ultralytics
try:
    from ultralytics import YOLO
    print("Using Ultralytics YOLO for training")
except ImportError:
    print("Ultralytics not available. Please install it with: pip install ultralytics")
    sys.exit(1)

class ParkingDatasetConverter:
    """Convert parking dataset from CVAT XML format to YOLO format"""
    
    def __init__(self, data_dir: str):
        self.data_dir = Path(data_dir)
        self.classes = {
            'free_parking_space': 0,
            'not_free_parking_space': 1, 
            'partially_free_parking_space': 2
        }
        self.class_names = list(self.classes.keys())
        
    def parse_xml_annotations(self, xml_path: str) -> Dict:
        """Parse CVAT XML annotations"""
        tree = ET.parse(xml_path)
        root = tree.getroot()
        
        annotations = {}
        
        for image in root.findall('image'):
            image_name = image.get('name')
            width = int(image.get('width'))
            height = int(image.get('height'))
            
            boxes = []
            
            # Handle polygon annotations
            for polygon in image.findall('polygon'):
                label = polygon.get('label')
                if label in self.classes:
                    points_str = polygon.get('points')
                    # Parse points: "x1,y1;x2,y2;x3,y3;..."
                    points = []
                    for point_str in points_str.split(';'):
                        x, y = map(float, point_str.split(','))
                        points.append((x, y))
                    
                    # Convert polygon to bounding box
                    x_coords = [p[0] for p in points]
                    y_coords = [p[1] for p in points]
                    
                    xtl = min(x_coords)
                    ytl = min(y_coords)
                    xbr = max(x_coords)
                    ybr = max(y_coords)
                    
                    # Convert to YOLO format (center_x, center_y, width, height) normalized
                    center_x = (xtl + xbr) / 2 / width
                    center_y = (ytl + ybr) / 2 / height
                    box_width = (xbr - xtl) / width
                    box_height = (ybr - ytl) / height
                    
                    boxes.append({
                        'class_id': self.classes[label],
                        'center_x': center_x,
                        'center_y': center_y,
                        'width': box_width,
                        'height': box_height
                    })
            
            # Handle box annotations (if any)
            for box in image.findall('box'):
                label = box.get('label')
                if label in self.classes:
                    xtl = float(box.get('xtl'))
                    ytl = float(box.get('ytl'))
                    xbr = float(box.get('xbr'))
                    ybr = float(box.get('ybr'))
                    
                    # Convert to YOLO format (center_x, center_y, width, height) normalized
                    center_x = (xtl + xbr) / 2 / width
                    center_y = (ytl + ybr) / 2 / height
                    box_width = (xbr - xtl) / width
                    box_height = (ybr - ytl) / height
                    
                    boxes.append({
                        'class_id': self.classes[label],
                        'center_x': center_x,
                        'center_y': center_y,
                        'width': box_width,
                        'height': box_height
                    })
            
            if boxes:  # Only add if there are annotations
                annotations[image_name] = {
                    'boxes': boxes,
                    'image_width': width,
                    'image_height': height
                }
        
        return annotations
    
    def create_yolo_dataset(self, output_dir: str, train_split: float = 0.8):
        """Create YOLO format dataset"""
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)
        
        # Create directory structure
        train_images_dir = output_path / 'images' / 'train'
        val_images_dir = output_path / 'images' / 'val'
        train_labels_dir = output_path / 'labels' / 'train'
        val_labels_dir = output_path / 'labels' / 'val'
        
        for dir_path in [train_images_dir, val_images_dir, train_labels_dir, val_labels_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)
        
        # Parse annotations
        xml_path = self.data_dir / 'annotations.xml'
        annotations = self.parse_xml_annotations(str(xml_path))
        
        # Read CSV for image-mask mapping
        csv_path = self.data_dir / 'parking.csv'
        df = pd.read_csv(csv_path)
        
        # Split data
        total_images = len(df)
        train_count = int(total_images * train_split)
        
        for idx, row in df.iterrows():
            image_name = row['image']
            image_path = self.data_dir / image_name
            
            if not image_path.exists():
                print(f"Warning: Image {image_path} not found")
                continue
            
            # Determine if train or val
            is_train = idx < train_count
            target_image_dir = train_images_dir if is_train else val_images_dir
            target_label_dir = train_labels_dir if is_train else val_labels_dir
            
            # Copy image
            image_filename = Path(image_name).name
            shutil.copy2(image_path, target_image_dir / image_filename)
            
            # Create label file
            label_filename = Path(image_filename).stem + '.txt'
            label_path = target_label_dir / label_filename
            
            # Get annotations for this image
            if image_name in annotations:
                with open(label_path, 'w', encoding='utf-8') as f:
                    for box in annotations[image_name]['boxes']:
                        f.write(f"{box['class_id']} {box['center_x']:.6f} {box['center_y']:.6f} "
                               f"{box['width']:.6f} {box['height']:.6f}\n")
            else:
                # Create empty label file if no annotations
                with open(label_path, 'w', encoding='utf-8') as f:
                    pass
        
        # Create data.yaml file
        data_yaml = {
            'path': str(output_path.absolute()),
            'train': 'images/train',
            'val': 'images/val',
            'nc': len(self.classes),
            'names': self.class_names
        }
        
        with open(output_path / 'data.yaml', 'w', encoding='utf-8') as f:
            yaml.dump(data_yaml, f)
        
        print(f"Dataset created successfully at {output_path}")
        print(f"Training images: {train_count}")
        print(f"Validation images: {total_images - train_count}")
        print(f"Classes: {self.class_names}")
        
        return str(output_path / 'data.yaml')

class YOLOTrainer:
    """YOLO training class using Ultralytics"""
    
    def __init__(self, data_yaml_path: str, model_size: str = 'yolov8n'):
        self.data_yaml_path = data_yaml_path
        self.model_size = model_size
        
        # Detect best available device (prioritize MPS for Mac GPU)
        import torch
        if torch.backends.mps.is_available():
            self.device = 'mps'
            print("Using Mac GPU (MPS) for training")
        elif torch.cuda.is_available():
            self.device = 'cuda'
            print("Using NVIDIA GPU (CUDA) for training")
        else:
            self.device = 'cpu'
            print("Using CPU for training")
            
        print(f"Using model: {model_size}")
        
        # Load data config
        with open(data_yaml_path, 'r', encoding='utf-8') as f:
            self.data_config = yaml.safe_load(f)
    
    def train(self, epochs: int = 100, batch_size: int = 16):
        """Train using Ultralytics YOLO"""
        print("Training with Ultralytics YOLO")
        
        # Initialize model
        model = YOLO(f'{self.model_size}.pt')
        
        # Train the model with Mac GPU support
        results = model.train(
            data=self.data_yaml_path,
            epochs=epochs,
            batch=batch_size,
            imgsz=640,
            device=self.device,  # Use detected device (mps, cuda, or cpu)
            project='./runs',
            name='parking_detection',
            exist_ok=True,
            patience=50,
            save=True,
            plots=True,
            amp=True,  # Enable automatic mixed precision
            workers=4,  # Reduce workers for Mac
            cache=False,  # Disable caching to save memory
        )
        
        return model, results

def main():
    """Main training function"""
    # Configuration optimized for Mac
    DATA_DIR = "./data"
    OUTPUT_DIR = "./yolo_dataset"
    EPOCHS = 50  # Reduced for faster training on Mac
    BATCH_SIZE = 8  # Smaller batch size for Mac GPU memory
    MODEL_SIZE = "yolov8n"  # yolov8n, yolov8s, yolov8m, yolov8l, yolov8x
    
    print("Starting parking space detection training...")
    print(f"Data directory: {DATA_DIR}")
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"Model size: {MODEL_SIZE}")
    print(f"Epochs: {EPOCHS}")
    print(f"Batch size: {BATCH_SIZE}")
    
    # Convert dataset
    print("\n1. Converting dataset to YOLO format...")
    converter = ParkingDatasetConverter(DATA_DIR)
    data_yaml_path = converter.create_yolo_dataset(OUTPUT_DIR)
    
    # Train model
    print("\n2. Starting training...")
    trainer = YOLOTrainer(data_yaml_path, MODEL_SIZE)
    
    try:
        print("Training with Ultralytics YOLO...")
        model, results = trainer.train(EPOCHS, BATCH_SIZE)
        print("Training completed successfully!")
        print(f"Results: {results}")
        print("Check the ./runs/parking_detection directory for training results and model weights.")
            
    except ImportError as e:
        print(f"Import error: {e}")
        print("Please install required packages with: pip install ultralytics")
        return
    except Exception as e:
        print(f"Training failed: {e}")
        print("Please check your environment and dependencies.")
        return
    
    print("\nTraining completed! Check the ./runs directory for results.")

if __name__ == "__main__":
    main()
