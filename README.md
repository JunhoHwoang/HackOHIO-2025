# 🅿️ OSU Smart Parking — Hackathon Prototype

A full-stack prototype for a real-time smart parking tracker at The Ohio State University, built during the HackOHIO 2025 hackathon.
This project combines a computer vision backend that detects occupied stalls with a React + Leaflet web app for live visualization.

____

Two-part app:
- `api/`: Node/Express mock API (ESM). Seeds mock OSU lots & a demo image.
- `web/`: React + Vite + TypeScript + Tailwind + Leaflet frontend.

## Requirements
- Node 18+
- npm (or pnpm/yarn)
- Python 3.8+

## 1) API
```bash
cd api
npm i
npm run seed       # seeds Carmack 5/Tuttle, stalls, capacity, images
npm run dev        # http://localhost:4000
```

## 2) Web
```bash
cd web
npm i
npm run dev        # http://localhost:5173
```
The web uses `VITE_API_BASE` if set:
```bash
# Example: point web to a deployed API
VITE_API_BASE="https://your-api.example.com" npm run dev
```

## 3) Backend (Computer Vision + Web Scraping)

### Model Training

1. **Download dataset**  
   Get the [Parking Space Detection Dataset](https://www.kaggle.com/datasets/trainingdatapro/parking-space-detection-dataset).

2. **Place the dataset**  
   Move the downloaded folder into: Backend/CV
   
3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Extract XML slot labels**
```python extract_slots_xml.py```

5. **Train the model**
```python main.py```
Once the training is complete, the best model weight will be stored in /model.

### Backend Logic
Now that the model is ready, you can run the backend logic from Backend/scheduler
```python scheduler.py```

This file updates the parking spots and the parking lots' status in the database

## Features
- Discover map (Leaflet) + nearby list; filter by permit (A/B/C/Visitor)
- Lot detail with **bird’s-eye overlay** (open/occupied/unknown) + timestamp
- Naïve **forecast** per PRD (median-by-slot + last-week weight)
- **Admin**: draw polygons over the image, save to API

## Endpoints
- `GET /api/lots?near=lat,lng&radius=1500&permit=C`
- `GET /api/lots/:id`
- `GET /api/lots/:id/stalls`
- `GET /api/lots/:id/forecast?weekday=1&slot=10:00`
- `POST /api/lots/:id/stalls`

## Notes
- Polygons are saved in **display coordinates** for the demo (simple and consistent within the same viewport). For production, switch to image pixel space + homography (see PRD §21).
- Garage `% full` is mocked. Replace with a real scraper/API later.
- Add EV/ADA layers by extending `Stall` + overlay legend.
- Experimental CV helpers live in `api/scripts/cv/`. Example:
  ```bash
  cd api
  python scripts/cv/detect_stalls.py \
    --image data/images/stadium-lot-northeast.png \
    --json-output data/stalls.json \
    --lot-id osu-parking-lot-c-north \
    --preview data/images/overlay-preview.png
  ```
  Adjust thresholds or swap in your own model; the script just needs to emit stall polygons for the API to consume.
- For a more geometry-aware approach that attempts to split aisles into individual stalls, try:
  ```bash
  cd api
  python scripts/cv/detect_stalls_smart.py \
    --image data/images/stadium-lot-northeast.png \
    --json-output data/stalls.json \
    --lot-id osu-parking-lot-c-north \
    --preview data/images/overlay-smart.png \
    --stripe-threshold 0.28
  ```
The `--stripe-threshold`, `--horizontal-cluster-gap`, and `--vertical-cluster-gap`
flags allow fine-grain tuning for different imagery.

- Need raw OSM parking-space polygons for a custom box? Use the helper:
  ```bash
  cd api
  source ../.venv/bin/activate
  python scripts/fetch_parking_spaces.py \
    --south 40.0028 --west -83.0196 --north 40.0043 --east -83.0176 \
    --out data/osm/osu_lane_avenue_parking_spaces.geojson
  ```
  Adjust the bounding box for the area you care about. The script writes a GeoJSON FeatureCollection with each `amenity=parking_space` feature and its tags.

- For campus-wide parking lots **and** stalls, run:
  ```bash
  cd api
  source ../.venv/bin/activate
  python scripts/fetch_osu_parking_data.py \
    --south 40.0000 --west -83.0325 --north 40.0180 --east -83.0085
  ```
  It saves `data/osm/osu_campus_parking_lots.geojson` and `data/osm/osu_campus_parking_spaces.geojson`,
  which the frontend overlays when you zoom in on any OSU lot.
