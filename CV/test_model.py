#!/usr/bin/env python3
"""
Enhanced parking detection model with individual spot tracking
This script runs inference on masked parking spots and tracks individual spot status
"""

import os
import cv2
import numpy as np
import pandas as pd
from ultralytics import YOLO
from pathlib import Path
import json
from datetime import datetime

class ParkingSpotTracker:
    """Track individual parking spots using masks and model predictions"""
    
    def __init__(self, model_path: str, data_csv: str = "./data/parking.csv"):
        self.model = YOLO(model_path)
        self.data_df = pd.read_csv(data_csv)
        self.class_names = {
            0: 'free_parking_space',
            1: 'not_free_parking_space', 
            2: 'partially_free_parking_space'
        }
        
    def load_mask(self, mask_path: str) -> np.ndarray:
        """Load and process parking spot mask"""
        mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if mask is None:
            raise ValueError(f"Could not load mask from {mask_path}")
        return mask
    
    def extract_individual_spots(self, mask: np.ndarray) -> dict:
        """Extract individual parking spot regions from mask"""
        # Find connected components (individual parking spots)
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
        
        spots = {}
        for i in range(1, num_labels):  # Skip background (label 0)
            # Get bounding box for this spot
            x, y, w, h, area = stats[i]
            
            # Filter out very small regions (noise)
            if area < 100:  
                continue
                
            # Create individual spot mask
            spot_mask = (labels == i).astype(np.uint8) * 255
            
            spots[i] = {
                'id': i,
                'bbox': (x, y, w, h),
                'area': area,
                'centroid': centroids[i],
                'mask': spot_mask
            }
        
        return spots
    
    def predict_spot_status(self, image: np.ndarray, spot_info: dict) -> dict:
        """Predict status for a single parking spot"""
        x, y, w, h = spot_info['bbox']
        spot_mask = spot_info['mask']
        
        # Extract the spot region from the image
        spot_region = image[y:y+h, x:x+w]
        spot_mask_region = spot_mask[y:y+h, x:x+w]
        
        # Apply mask to isolate just the parking spot
        masked_spot = cv2.bitwise_and(spot_region, spot_region, mask=spot_mask_region)
        
        # Run inference on the masked spot
        results = self.model(masked_spot, verbose=False)
        
        # Get the best prediction
        if len(results[0].boxes) > 0:
            # Get the most confident prediction
            confidences = results[0].boxes.conf.cpu().numpy()
            classes = results[0].boxes.cls.cpu().numpy()
            
            best_idx = np.argmax(confidences)
            predicted_class = int(classes[best_idx])
            confidence = float(confidences[best_idx])
            
            return {
                'spot_id': spot_info['id'],
                'status': self.class_names[predicted_class],
                'confidence': confidence,
                'bbox': spot_info['bbox'],
                'centroid': spot_info['centroid'].tolist(),
                'area': spot_info['area']
            }
        else:
            # No detection - assume free
            return {
                'spot_id': spot_info['id'],
                'status': 'free_parking_space',
                'confidence': 0.0,
                'bbox': spot_info['bbox'],
                'centroid': spot_info['centroid'].tolist(),
                'area': spot_info['area']
            }
    
    def process_image(self, image_path: str, mask_path: str) -> dict:
        """Process a single image and return status for all parking spots"""
        # Load image and mask
        image = cv2.imread(image_path)
        mask = self.load_mask(mask_path)
        
        if image is None:
            raise ValueError(f"Could not load image from {image_path}")
        
        # Extract individual parking spots
        spots = self.extract_individual_spots(mask)
        
        # Predict status for each spot
        results = {
            'image_path': image_path,
            'mask_path': mask_path,
            'timestamp': datetime.now().isoformat(),
            'total_spots': len(spots),
            'spots': []
        }
        
        for spot_id, spot_info in spots.items():
            spot_status = self.predict_spot_status(image, spot_info)
            results['spots'].append(spot_status)
        
        return results
    
    def visualize_results(self, image_path: str, results: dict, output_path: str):
        """Create visualization with spot IDs and status"""
        image = cv2.imread(image_path)
        
        # Color mapping for different statuses
        colors = {
            'free_parking_space': (0, 255, 0),           # Green
            'not_free_parking_space': (0, 0, 255),       # Red
            'partially_free_parking_space': (0, 255, 255) # Yellow
        }
        
        for spot in results['spots']:
            x, y, w, h = spot['bbox']
            status = spot['status']
            confidence = spot['confidence']
            spot_id = spot['spot_id']
            
            # Draw bounding box
            color = colors.get(status, (128, 128, 128))
            cv2.rectangle(image, (x, y), (x + w, y + h), color, 2)
            
            # Add text label
            label = f"ID:{spot_id} {status.replace('_parking_space', '')} ({confidence:.2f})"
            label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0]
            
            # Background for text
            cv2.rectangle(image, (x, y - label_size[1] - 10), 
                         (x + label_size[0], y), color, -1)
            
            # Text
            cv2.putText(image, label, (x, y - 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        # Save visualization
        cv2.imwrite(output_path, image)
        print(f"Saved visualization to: {output_path}")

def test_enhanced_model():
    """Test the enhanced model with individual spot tracking"""
    
    # Find the best trained model
    runs_dir = Path("./runs/parking_detection")
    if not runs_dir.exists():
        print("No training runs found. Please train the model first.")
        return
    
    weights_path = runs_dir / "weights" / "best.pt"
    if not weights_path.exists():
        print("No trained model found. Training might still be in progress.")
        return
    
    print(f"Loading model from: {weights_path}")
    
    # Initialize tracker
    tracker = ParkingSpotTracker(str(weights_path))
    
    # Process each image-mask pair from the CSV
    results_summary = {
        'session_timestamp': datetime.now().isoformat(),
        'total_images_processed': 0,
        'images': []
    }
    
    for idx, row in tracker.data_df.iterrows():
        if idx >= 5:  # Limit to first 5 for testing
            break
            
        image_path = Path("./data") / row['image']
        mask_path = Path("./data") / row['mask']
        
        if not image_path.exists() or not mask_path.exists():
            print(f"Skipping {image_path.name} - missing files")
            continue
        
        print(f"\nProcessing: {image_path.name}")
        
        try:
            # Process the image
            results = tracker.process_image(str(image_path), str(mask_path))
            
            # Create visualization
            output_path = f"./predict/spot_analysis_{image_path.stem}.jpg"
            tracker.visualize_results(str(image_path), results, output_path)
            
            # Print summary
            spot_summary = {}
            for spot in results['spots']:
                status = spot['status'].replace('_parking_space', '')
                spot_summary[status] = spot_summary.get(status, 0) + 1
            
            print(f"  Found {results['total_spots']} parking spots:")
            for status, count in spot_summary.items():
                print(f"    {status}: {count}")
            
            results_summary['images'].append(results)
            results_summary['total_images_processed'] += 1
            
        except Exception as e:
            print(f"Error processing {image_path.name}: {e}")
    
    # Save detailed results to JSON
    results_file = "parking_analysis_results.json"
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(results_summary, f, indent=2)
    
    print(f"\nAnalysis completed! Detailed results saved to: {results_file}")
    print("Check the spot_analysis_*.jpg files for visualizations.")

if __name__ == "__main__":
    test_enhanced_model()
