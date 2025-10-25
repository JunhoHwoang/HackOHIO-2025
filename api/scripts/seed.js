import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "..", "data");
const IMG_DIR = path.join(DATA_DIR, "images");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(IMG_DIR, { recursive: true });

const lotBoundaryNorth = [
  { lat: 40.0038132, lng: -83.0191099 },
  { lat: 40.0038073, lng: -83.0191108 },
  { lat: 40.003488, lng: -83.0191598 },
  { lat: 40.003377, lng: -83.0191768 },
  { lat: 40.0032068, lng: -83.0192029 },
  { lat: 40.0031073, lng: -83.0192182 },
  { lat: 40.0031702, lng: -83.0191503 },
  { lat: 40.003018, lng: -83.0190227 },
  { lat: 40.0028588, lng: -83.0187927 },
  { lat: 40.0028557, lng: -83.0181987 },
  { lat: 40.0030568, lng: -83.0180388 },
  { lat: 40.0031147, lng: -83.0180203 },
  { lat: 40.0031714, lng: -83.0179941 },
  { lat: 40.0031753, lng: -83.0179934 },
  { lat: 40.0031833, lng: -83.0179924 },
  { lat: 40.0032228, lng: -83.0179906 },
  { lat: 40.0032949, lng: -83.0179873 },
  { lat: 40.003344, lng: -83.017981 },
  { lat: 40.0034521, lng: -83.0179287 },
  { lat: 40.0035395, lng: -83.0178995 },
  { lat: 40.0036047, lng: -83.0178891 },
  { lat: 40.0036643, lng: -83.0178871 },
  { lat: 40.0036994, lng: -83.0179038 },
  { lat: 40.0037118, lng: -83.0179167 },
  { lat: 40.0037217, lng: -83.0179271 },
  { lat: 40.0037291, lng: -83.0179348 },
  { lat: 40.0037344, lng: -83.0179404 },
  { lat: 40.0038017, lng: -83.018039 },
  { lat: 40.0038369, lng: -83.0181249 },
  { lat: 40.0038389, lng: -83.0181366 },
  { lat: 40.0038439, lng: -83.0181668 },
  { lat: 40.0038489, lng: -83.0181969 },
  { lat: 40.0038541, lng: -83.0182282 },
  { lat: 40.0038557, lng: -83.0188894 },
  { lat: 40.003812, lng: -83.0188896 },
  { lat: 40.0038121, lng: -83.018914 },
  { lat: 40.0038125, lng: -83.0189853 },
  { lat: 40.003813, lng: -83.0190761 }
];

const lotBoundaryEast = [
  { lat: 40.00235, lng: -83.0169 },
  { lat: 40.00228, lng: -83.01635 },
  { lat: 40.00192, lng: -83.01624 },
  { lat: 40.00162, lng: -83.01637 },
  { lat: 40.0015, lng: -83.01677 },
  { lat: 40.00162, lng: -83.01708 },
  { lat: 40.00202, lng: -83.01718 },
  { lat: 40.0023, lng: -83.01704 }
];

const lotsConfig = [
  {
    id: "osu-parking-lot-c-north",
    name: "OSU Parking Lot C (North)",
    code: "C",
    centroid: { lat: 40.00332, lng: -83.01886 },
    boundary: lotBoundaryNorth,
    permit_types: ["C", "Visitor"],
    notes: "Seeded from OSM geometry of way 38911611 (north surface lot between Lane Ave and French Field House)",
    image: { file: "stadium-lot-northeast.png", width: 1024, height: 1536 },
    initialCapacity: { capacity: 0, occupied: 0 }
  },
  {
    id: "stadium-lot-east",
    name: "Stadium Lot East",
    code: "E",
    centroid: { lat: 40.00194, lng: -83.01671 },
    boundary: lotBoundaryEast,
    permit_types: ["A", "B"],
    notes: "Mock boundary approximated for demo purposes east of Ohio Stadium",
    image: { file: "stadium-lot-east.png", width: 900, height: 1200 },
    initialCapacity: { capacity: 180, occupied: 65 }
  }
];

let stallsByLot = {};

try {
  const raw = fs.readFileSync(path.join(DATA_DIR, "stalls.json"), "utf8");
  stallsByLot = JSON.parse(raw);
} catch {
  stallsByLot = {};
}

const capacity = {};
const images = {};

for (const lot of lotsConfig) {
  capacity[lot.id] = [
    {
      capacity: lot.initialCapacity.capacity,
      occupied: lot.initialCapacity.occupied,
      source: "seed",
      observed_at: new Date().toISOString()
    }
  ];

  images[lot.image.file] = {
    lotId: lot.id,
    url: `/images/${lot.image.file}`,
    captured_at: new Date().toISOString(),
    source: "seed"
  };
}

const lots = lotsConfig.map((lot) => ({
  id: lot.id,
  name: lot.name,
  code: lot.code,
  campus: "Columbus",
  centroid: lot.centroid,
  boundary: lot.boundary,
  permit_types: lot.permit_types,
  parkmobile_zone: null,
  pricing_json: null,
  metadata: {
    source: "custom",
    notes: lot.notes,
    imageDimensions: { width: lot.image.width, height: lot.image.height }
  }
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
