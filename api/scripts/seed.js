import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "..", "data");
const IMG_DIR = path.join(DATA_DIR, "images");
const OSM_DIR = path.join(DATA_DIR, "osm");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(IMG_DIR, { recursive: true });

const PUBLIC_ACCESS = new Set(["", "yes", "public", "permissive"]);
const ALLOWED_LOT_IDS = new Set([
  "way/39115920",
  "way/38911611",
  "way/444966505",
  "way/275147287"
]);
const occupancyData = readJSON(path.join(DATA_DIR, "output1.json"), { slots: [] });
console.log('Occupancy data keys', occupancyData && Object.keys(occupancyData));
const sourceSlots = Array.isArray(occupancyData?.slots) ? occupancyData.slots : [];
console.log('Sample occupied entries', sourceSlots.filter((slot) => slot?.occupied).slice(0, 3));
const OCCUPIED_SPACE_IDS = new Set(sourceSlots.filter((slot) => slot?.occupied).map((slot) => `way/${slot.id}`));
console.log('Loaded occupied slots', OCCUPIED_SPACE_IDS.size);
const LOT_NAME_OVERRIDES = {
  "way/39115920": "Stadium Southeast Parking",
  "way/38911611": "Stadium Northeast Parking",
  "way/444966505": "Saint John's Arena Parking",
  "way/275147287": "Stadium East Parking"
};
const LOT_PERMIT_OVERRIDES = {
  "way/39115920": ["A", "B", "C"],
  "way/38911611": ["A", "B", "C"],
  "way/444966505": ["B", "C"],
  "way/275147287": ["A", "B"]
};
const MIN_LOT_AREA_SQ_M = 0;
const EARTH_RADIUS = 6378137;

function readJSON(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function projectMeters(lat, lng, refLatRad) {
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  return [EARTH_RADIUS * lngRad * Math.cos(refLatRad), EARTH_RADIUS * latRad];
}

function polygonArea(coords) {
  if (!coords || coords.length < 3) return 0;
  const refLatRad = (coords[0][1] * Math.PI) / 180;
  let area = 0;
  for (let i = 0; i < coords.length; i += 1) {
    const [x1, y1] = projectMeters(coords[i][1], coords[i][0], refLatRad);
    const [x2, y2] = projectMeters(coords[(i + 1) % coords.length][1], coords[(i + 1) % coords.length][0], refLatRad);
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function geometryArea(geometry) {
  if (!geometry) return 0;
  if (geometry.type === "Polygon") {
    return polygonArea(geometry.coordinates[0]);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce((sum, poly) => sum + polygonArea(poly[0]), 0);
  }
  return 0;
}

function centroidForGeometry(geometry) {
  if (!geometry) return null;
  const average = (coords) => {
    let lat = 0;
    let lng = 0;
    let count = 0;
    for (const [lon, la] of coords) {
      lat += la;
      lng += lon;
      count += 1;
    }
    return count ? [lat / count, lng / count] : null;
  };
  if (geometry.type === "Point") {
    return [geometry.coordinates[1], geometry.coordinates[0]];
  }
  if (geometry.type === "Polygon") {
    return average(geometry.coordinates[0]);
  }
  if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) {
      const center = average(poly[0]);
      if (center) return center;
    }
  }
  return null;
}

function toBoundaryLatLng(geometry) {
  if (!geometry) return [];
  const convertRing = (ring) => ring.map(([lon, lat]) => ({ lat, lng: lon }));
  if (geometry.type === "Polygon") {
    return convertRing(geometry.coordinates[0]);
  }
  if (geometry.type === "MultiPolygon") {
    let bestRing = [];
    let bestArea = 0;
    for (const poly of geometry.coordinates) {
      const ring = poly[0];
      const area = polygonArea(ring);
      if (area > bestArea) {
        bestArea = area;
        bestRing = ring;
      }
    }
    return convertRing(bestRing);
  }
  return [];
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function geometryContainsPoint(geometry, point) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    return pointInRing(point, geometry.coordinates[0]);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((poly) => pointInRing(point, poly[0]));
  }
  return false;
}

function featureCentroid(feature) {
  return centroidForGeometry(feature.geometry);
}

function generateLotsFromOSM() {
  const lotsGeo = readJSON(path.join(OSM_DIR, "osu_campus_parking_lots.geojson"), null);
  const spacesGeo = readJSON(path.join(OSM_DIR, "osu_campus_parking_spaces.geojson"), null);
  if (!lotsGeo || !lotsGeo.features?.length) return null;

  const spaces = (spacesGeo?.features || []).map((feature) => {
    const centroid = featureCentroid(feature);
    if (!centroid) return null;
    return { feature, center: centroid, point: [centroid[1], centroid[0]] };
  }).filter(Boolean);

  const lotsConfig = [];
  const stallsByLot = {};
  const capacity = {};
  const images = {};

  for (const feature of lotsGeo.features) {
    const featureId = feature.properties?.id;
    if (!ALLOWED_LOT_IDS.has(featureId)) continue;
    const tags = feature.properties?.tags || {};
    const access = (tags.access || "").toLowerCase();
    const area = geometryArea(feature.geometry);
    if (!PUBLIC_ACCESS.has(access) || area < MIN_LOT_AREA_SQ_M) continue;

    const centroid = featureCentroid(feature);
    const boundary = toBoundaryLatLng(feature.geometry);
    if (!centroid || !boundary.length) continue;

    const slugBase = tags.name ? slugify(tags.name) : null;
    const id = slugBase && slugBase.length > 2 ? slugBase : `lot-${featureId?.replace(/\W+/g, "-") || lotsConfig.length + 1}`;

    const lotSpaces = spaces.filter((space) => geometryContainsPoint(feature.geometry, space.point));
    const spaceCount = lotSpaces.length;
    const occupiedCount = lotSpaces.filter((space) => OCCUPIED_SPACE_IDS.has(space.feature.properties?.id)).length;

    stallsByLot[id] = [];
    capacity[id] = [
      {
        capacity: spaceCount,
        occupied: occupiedCount,
        source: "seed",
        observed_at: new Date().toISOString(),
      },
    ];

    lotsConfig.push({
      id,
      name: LOT_NAME_OVERRIDES[featureId] || tags.name || "Parking Lot",
      code: tags.ref || tags.operator || null,
      centroid: { lat: centroid[0], lng: centroid[1] },
      boundary,
      permit_types: LOT_PERMIT_OVERRIDES[featureId] || ["A", "B", "C"],
      notes: "Generated from OpenStreetMap",
      image: null,
      initialCapacity: { capacity: spaceCount, occupied: occupiedCount },
      spaceCount,
      occupiedCount,
      tags,
      osmId: featureId,
    });
  }

  if (!lotsConfig.length) return null;

  return { lotsConfig, stallsByLot, capacity, images };
}

const generated = generateLotsFromOSM();

let lotsConfig = [];
let stallsByLot = {};
let capacity = {};
let images = {};

if (generated) {
  lotsConfig = generated.lotsConfig;
  stallsByLot = generated.stallsByLot;
  capacity = generated.capacity;
  images = generated.images;
} else {
  const lotBoundaryEast = [
    { lat: 40.00235, lng: -83.0169 },
    { lat: 40.00228, lng: -83.01635 },
    { lat: 40.00192, lng: -83.01624 },
    { lat: 40.00162, lng: -83.01637 },
    { lat: 40.0015, lng: -83.01677 },
    { lat: 40.00162, lng: -83.01708 },
    { lat: 40.00202, lng: -83.01718 },
    { lat: 40.0023, lng: -83.01704 },
  ];

  lotsConfig = [
    {
      id: "stadium-lot-east",
      name: "Stadium Lot East",
      code: "E",
      centroid: { lat: 40.00194, lng: -83.01671 },
      boundary: lotBoundaryEast,
      permit_types: ["A", "B"],
      notes: "Fallback seed lot (mock)",
      image: { file: "stadium-lot-east.png", width: 900, height: 1200 },
      initialCapacity: { capacity: 180, occupied: 65 },
      spaceCount: 0,
      occupiedCount: 0,
      tags: {},
      osmId: null,
    },
  ];

  stallsByLot = { "stadium-lot-east": [] };
  capacity = {
    "stadium-lot-east": [
      {
        capacity: 180,
        occupied: 65,
        source: "seed",
        observed_at: new Date().toISOString(),
      },
    ],
  };

  images = {
    "stadium-lot-east.png": {
      lotId: "stadium-lot-east",
      url: "/images/stadium-lot-east.png",
      captured_at: new Date().toISOString(),
      source: "seed",
    },
  };
}

const lots = lotsConfig.map((lot) => ({
  id: lot.id,
  name: lot.name,
  code: lot.code || null,
  campus: "Columbus",
  centroid: lot.centroid,
  boundary: lot.boundary,
  permit_types: lot.permit_types,
  parkmobile_zone: null,
  pricing_json: null,
  metadata: {
    source: "custom",
    notes: lot.notes,
    imageDimensions: lot.image ? { width: lot.image.width, height: lot.image.height } : null,
    spaceCount: lot.spaceCount,
    occupiedCount: lot.occupiedCount,
    tags: lot.tags,
    osmId: lot.osmId,
  },
}));

const snapshots = {};

function writeJSON(name, value) {
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(value, null, 2));
}

writeJSON("lots.json", lots);
writeJSON("stalls.json", stallsByLot);
writeJSON("capacity.json", capacity);
writeJSON("snapshots.json", snapshots);
writeJSON("images.json", images);

console.log(`Seeded ${lots.length} lots to ${DATA_DIR}`);
