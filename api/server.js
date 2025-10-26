import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import schedule from "node-schedule";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const DATA_DIR = path.join(__dirname, "data");
const IMG_DIR = path.join(DATA_DIR, "images");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

const OSM_SOURCES = [
  path.join(DATA_DIR, "osm", "osu_campus_parking_lots.geojson"),
  path.join(DATA_DIR, "export.geojson"),
  path.join(DATA_DIR, "export-surface.geojson"),
];

const osmFeatureIndex = new Map();
for (const file of OSM_SOURCES) {
  try {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    const geojson = JSON.parse(raw);
    if (!Array.isArray(geojson?.features)) continue;
    for (const feature of geojson.features) {
      const props = feature?.properties || {};
      const id = props.id || props["@id"];
      if (id) osmFeatureIndex.set(id, feature);
    }
  } catch (err) {
    console.warn("Failed to index OSM feature file", file, err);
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || null;
const SUPABASE_KEY = process.env.SUPABASE_KEY || null;
const SUPABASE_TABLE = process.env.SUPABASE_PARKING_TABLE || "parking_lot";
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
if (!supabase) {
  console.warn("Supabase not configured. Set SUPABASE_URL and SUPABASE_KEY to enable live data.");
}

const SUPABASE_CACHE_MS = 60_000;
let supabaseLotsCache = { fetchedAt: 0, list: [], byLocation: new Map(), byName: new Map(), spotsByLotName: new Map() };
const PROTECTED_OSM_IDS = new Set([
  "way/38911611", // Saint John's Arena Parking
  "way/444966505", // Stadium Northeast Parking
  "way/39115920", // Stadium Southeast Parking
  "way/275147287", // Stadium East Parking
]);

function readJSON(name, fallback) {
  const file = path.join(DATA_DIR, name);
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.error("Failed to read", name, e); return fallback; }
}
function writeJSON(name, obj) {
  const file = path.join(DATA_DIR, name);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

async function fetchSupabaseData() {
  if (!supabase) return null;
  const now = Date.now();
  if (supabaseLotsCache.list.length && now - supabaseLotsCache.fetchedAt < SUPABASE_CACHE_MS) {
    return supabaseLotsCache;
  }

  try {
    const [lotsRes, spotsRes, accessRes, permitRes] = await Promise.all([
      supabase.from(SUPABASE_TABLE).select("lot_name,capacity,occupancy,location,pricing"),
      supabase.from("parking_spot").select("lot_name,is_filled"),
      supabase.from("permit_access").select("lot_name,permit_id"),
      supabase.from("permit_type").select("permit_id,code,name"),
    ]);

    if (lotsRes.error) throw lotsRes.error;
    if (spotsRes.error) throw spotsRes.error;
    if (accessRes.error) throw accessRes.error;
    if (permitRes.error) throw permitRes.error;

    const lotRows = lotsRes.data || [];
    const spotRows = spotsRes.data || [];
    const accessRows = accessRes.data || [];
    const permitRows = permitRes.data || [];

    const permitTypeMap = new Map();
    for (const row of permitRows) {
      if (row?.permit_id != null) {
        permitTypeMap.set(row.permit_id, row.code || row.name || null);
      }
    }

    const permitsByLotName = new Map();
    for (const row of accessRows) {
      if (!row?.lot_name) continue;
      const entry = permitsByLotName.get(row.lot_name) || new Set();
      const code = permitTypeMap.get(row.permit_id);
      if (code) entry.add(code);
      permitsByLotName.set(row.lot_name, entry);
    }

    const spotStatsByLotName = new Map();
    const spotsByLotName = new Map();
    for (const row of spotRows) {
      if (!row?.lot_name) continue;
      const stats = spotStatsByLotName.get(row.lot_name) || { total: 0, occupied: 0 };
      stats.total += 1;
      if (row.is_filled) stats.occupied += 1;
      spotStatsByLotName.set(row.lot_name, stats);

      const arr = spotsByLotName.get(row.lot_name) || [];
      arr.push(row);
      spotsByLotName.set(row.lot_name, arr);
    }

    const list = lotRows.map((row) => {
      const stats = spotStatsByLotName.get(row.lot_name) || {
        total: Number(row.capacity) || 0,
        occupied: Number(row.occupancy) || 0,
      };
      const permitsSet = permitsByLotName.get(row.lot_name) || new Set();
      const id = supabaseLotId(row);
      return {
        id,
        row,
        stats,
        permits: Array.from(permitsSet),
        spots: spotsByLotName.get(row.lot_name) || [],
      };
    });

    const byLocation = new Map();
    const byName = new Map();
    for (const entry of list) {
      if (entry.row.location) byLocation.set(entry.row.location, entry);
      if (entry.row.lot_name) byName.set(entry.row.lot_name, entry);
    }

    supabaseLotsCache = { fetchedAt: now, list, byLocation, byName, spotsByLotName };
    return supabaseLotsCache;
  } catch (err) {
    console.error("Failed to load Supabase data", err);
    return supabaseLotsCache;
  }
}

let lots = readJSON("lots.json", []);
let stallsByLot = readJSON("stalls.json", {});
let capacity = readJSON("capacity.json", {});
let snapshots = readJSON("snapshots.json", {});

app.get("/", (_req, res) => res.json({ ok: true, service: "smart-parking-api" }));
app.use("/images", express.static(IMG_DIR));
app.use("/osm", express.static(path.join(DATA_DIR, "osm")));
app.use("/data", express.static(DATA_DIR));

app.get("/api/lots", async (req, res) => {
  try {
    const supaSnapshot = await fetchSupabaseData();
    const { near, radius, permit } = req.query;

    let result = lots.map((l) => summarizeLot(l, supaSnapshot));

    if (supaSnapshot) {
      for (const entry of supaSnapshot.list) {
        const existing = result.find((lot) =>
          lot.metadata?.supabase?.location === entry.row.location ||
          lot.metadata?.osmId === entry.row.location ||
          lot.name === entry.row.lot_name
        );
        if (!existing) {
          result.push(createSupabaseOnlyLot(entry));
        }
      }
    }

    if (permit) {
      result = result.filter((l) =>
        Array.isArray(l.permit_types) && l.permit_types.includes(permit)
      );
    }

    if (near && typeof near === "string") {
      const [lat, lng] = near.split(",").map(Number);
      result.forEach((l) => {
        l.distanceMeters = l.centroid ? distanceMeters({ lat, lng }, l.centroid) : null;
      });
      result.sort((a, b) => (a.distanceMeters ?? 1e12) - (b.distanceMeters ?? 1e12));
      if (radius) {
        const max = Number(radius);
        result = result.filter((l) => (l.distanceMeters ?? 1e12) <= max);
      }
    }

    res.json(result);
  } catch (err) {
    console.error("Failed to list lots", err);
    res.status(500).json({ error: "Failed to load lots" });
  }
});

app.get("/api/lots/:id", async (req, res) => {
  const supaSnapshot = await fetchSupabaseData();
  let lot = lots.find((l) => l.id === req.params.id);
  if (lot) {
    const summary = summarizeLot(lot, supaSnapshot);
    return res.json(summary);
  }

  if (supaSnapshot) {
    const entry = supaSnapshot.list.find((row) => row.id === req.params.id);
    if (entry) {
      return res.json(createSupabaseOnlyLot(entry));
    }
  }

  return res.status(404).json({ error: "lot not found" });
});

app.get("/api/lots/:id/stalls", async (req, res) => {
  const lotId = req.params.id;
  const supaSnapshot = await fetchSupabaseData();

  const baseLot = lots.find((l) => l.id === lotId);
  if (baseLot) {
    const stalls = stallsByLot[lotId] || [];
    return res.json({
      lotId,
      snapshot: { at: new Date().toISOString(), source: "manual", counts: summarizeStalls(stalls) },
      stalls,
    });
  }

  if (supaSnapshot) {
    const entry = supaSnapshot.list.find((row) => row.id === lotId);
    if (entry) {
      const stalls = (entry.spots || []).map((spot, index) => ({
        id: spot.spot_id != null ? `spot-${spot.spot_id}` : `spot-${index}`,
        status: spot.is_filled ? "occupied" : "open",
      }));
      const counts = summarizeStalls(stalls);
      return res.json({
        lotId,
        snapshot: { at: new Date().toISOString(), source: "supabase", counts },
        stalls,
      });
    }
  }

  return res.status(404).json({ error: "lot not found" });
});

app.post("/api/lots", (req, res) => {
  const id = nanoid(10);
  const b = req.body || {};
  const lot = { id, name: b.name, code: b.code || null, campus: "Columbus", centroid: b.centroid, boundary: b.boundary || null, permit_types: b.permit_types || ["C","Visitor"], parkmobile_zone: b.parkmobile_zone || null, pricing_json: b.pricing_json || null, metadata: b.metadata || {} };
  lots.push(lot); writeJSON("lots.json", lots);
  res.json(lot);
});

app.post("/api/lots/:id/stalls", (req, res) => {
  const lotId = req.params.id;
  const items = Array.isArray(req.body) ? req.body : [];
  stallsByLot[lotId] = items;
  writeJSON("stalls.json", stallsByLot);
  res.json({ ok: true, count: items.length });
});

app.get("/api/lots/:id/forecast", (req, res) => {
  const lotId = req.params.id;
  const weekday = Number(req.query.weekday ?? (new Date().getDay()));
  const slot = String(req.query.slot ?? "10:00");
  const hist = (snapshots[lotId] || []).filter(s => s.weekday === weekday && s.slot === slot);
  const values = hist.map(s => s.open);
  const median = values.length ? quantile(values, 0.5) : null;
  const lastWeek = hist.slice(-1)[0]?.open ?? null;
  const alpha = 0.6;
  const open_expected = (median == null && lastWeek == null) ? null : Math.round((alpha*(lastWeek ?? median ?? 0)) + ((1-alpha)*(median ?? lastWeek ?? 0)));
  const p25 = values.length ? quantile(values, 0.25) : null;
  const p75 = values.length ? quantile(values, 0.75) : null;
  res.json({ lotId, weekday, slot, open_expected, open_p25: p25, open_p75: p75 });
});

function summarizeLot(l, supaData) {
  const metadata = { ...(l.metadata || {}) };
  const osmId = metadata.osmId;
  const supaEntry = supaData
    ? supaData.byLocation.get(osmId) || supaData.byName.get(l.name)
    : null;
  const isProtected = osmId && PROTECTED_OSM_IDS.has(osmId);

  let permitTypes = Array.isArray(l.permit_types) ? [...l.permit_types] : [];

  const computeSeedCounts = () => {
    const stalls = stallsByLot[l.id] || [];
    let localCounts = summarizeStalls(stalls);
    const spaceCount = metadata.spaceCount;
    const occupiedCount = metadata.occupiedCount ?? 0;
    if (localCounts.total === 0 && spaceCount) {
      const open = Math.max(spaceCount - occupiedCount, 0);
      localCounts = {
        total: spaceCount,
        occupied: occupiedCount,
        open,
        unknown: Math.max(spaceCount - open - occupiedCount, 0),
      };
    }
    metadata.spaceCount = metadata.spaceCount ?? localCounts.total;
    metadata.occupiedCount = metadata.occupiedCount ?? localCounts.occupied;
    const capEntry = (capacity[l.id] || []).slice(-1)[0] || {
      capacity: metadata.spaceCount,
      occupied: metadata.occupiedCount,
      source: "seed",
      observed_at: new Date().toISOString(),
    };
    if (metadata.pricing == null) {
      metadata.pricing = derivePricingInfo(metadata.tags, l.name);
    }
    return { counts: localCounts, latestCap: capEntry };
  };

  let counts;
  let latestCap;

  if (supaEntry && !isProtected) {
    const stats = supaEntry.stats || { total: 0, occupied: 0 };
    const capacityVal = Number(stats.total ?? supaEntry.row.capacity ?? metadata.spaceCount ?? 0);
    const occupiedVal = Math.min(
      Number(stats.occupied ?? supaEntry.row.occupancy ?? metadata.occupiedCount ?? 0),
      capacityVal
    );
    metadata.osmId = metadata.osmId || supaEntry.row.location || metadata.osmId;
    counts = {
      total: capacityVal,
      occupied: occupiedVal,
      open: Math.max(capacityVal - occupiedVal, 0),
      unknown: 0,
    };
    latestCap = {
      capacity: capacityVal,
      occupied: occupiedVal,
      source: "supabase",
      observed_at: new Date().toISOString(),
    };
    metadata.spaceCount = capacityVal;
    metadata.occupiedCount = occupiedVal;
    if (supaEntry.permits?.length) {
      const merged = new Set([...permitTypes, ...supaEntry.permits]);
      permitTypes = Array.from(merged);
    }
    metadata.pricing = supaEntry.row.pricing ?? metadata.pricing ?? derivePricingInfo(metadata.tags, l.name);
    metadata.supabase = {
      lot_name: supaEntry.row.lot_name,
      location: supaEntry.row.location,
      capacity: supaEntry.row.capacity,
      occupancy: supaEntry.row.occupancy,
      spot_total: stats.total,
      spot_occupied: stats.occupied,
      permits: supaEntry.permits,
      spots: supaEntry.spots,
    };
  } else {
    const seed = computeSeedCounts();
    counts = seed.counts;
    latestCap = seed.latestCap;
    if (supaEntry) {
      metadata.supabase = {
        lot_name: supaEntry.row.lot_name,
        location: supaEntry.row.location,
        capacity: supaEntry.row.capacity,
        occupancy: supaEntry.row.occupancy,
        spot_total: supaEntry.stats?.total,
        spot_occupied: supaEntry.stats?.occupied,
        permits: supaEntry.permits,
        spots: supaEntry.spots,
      };
      if (supaEntry.permits?.length) {
        const merged = new Set([...permitTypes, ...supaEntry.permits]);
        permitTypes = Array.from(merged);
      }
      if (metadata.pricing == null) {
        metadata.pricing = supaEntry.row.pricing ?? derivePricingInfo(metadata.tags, l.name);
      }
    }
  }

  const latestImage = latestImageForLot(l.id);

  return {
    id: l.id,
    name: l.name,
    code: l.code || null,
    campus: l.campus || "Columbus",
    centroid: l.centroid,
    boundary: l.boundary || null,
    permit_types: permitTypes,
    latestCap,
    latestImage,
    counts,
    pricing: metadata.pricing ?? null,
    metadata,
  };
}
function latestImageForLot(lotId) {
  const imgs = readJSON("images.json", {});
  const list = Object.values(imgs).filter(r => r.lotId === lotId);
  if (!list.length) return null;
  list.sort((a,b)=>new Date(a.captured_at)-new Date(b.captured_at));
  return list.slice(-1)[0];
}
function summarizeStalls(stalls) {
  let total = stalls.length, occ = 0, unk = 0;
  for (const s of stalls) {
    if (s.status === "occupied") occ++;
    else if (s.status !== "open") unk++;
  }
  return { total, occupied: occ, open: total - occ - unk, unknown: unk };
}
// haversine
function toRad(d){ return d*Math.PI/180; }
function distanceMeters(a,b){
  if (!a || !b) return null;
  const R=6371000, dLat=toRad(b.lat-a.lat), dLon=toRad(b.lng-a.lng);
  const la1=toRad(a.lat), la2=toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1, Math.sqrt(h)));
}
function quantile(arr, q){
  const a=[...arr].sort((x,y)=>x-y);
  const pos=(a.length-1)*q, base=Math.floor(pos), rest=pos-base;
  if (a[base+1] !== undefined) return a[base] + rest*(a[base+1]-a[base]);
  return a[base];
}

function supabaseLotId(row) {
  if (row?.location) return `lot-${row.location.replace(/\W+/g, "-")}`;
  return `supabase-${slugify(row?.lot_name || "lot")}`;
}

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getOsmFeature(osmId) {
  if (!osmId) return null;
  return osmFeatureIndex.get(osmId) || null;
}

function centroidForGeometry(geometry) {
  if (!geometry) return null;
  const average = (coords) => {
    if (!coords || !coords.length) return null;
    let lat = 0;
    let lng = 0;
    for (const [lon, la] of coords) {
      lat += la;
      lng += lon;
    }
    const count = coords.length;
    return count ? [lat / count, lng / count] : null;
  };
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates[1], geometry.coordinates[0]];
    case "Polygon":
      return average(geometry.coordinates[0]);
    case "MultiPolygon":
      for (const poly of geometry.coordinates) {
        const center = average(poly[0]);
        if (center) return center;
      }
      return null;
    default:
      return null;
  }
}

function toBoundaryLatLng(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Polygon") {
    return geometry.coordinates[0].map(([lon, lat]) => ({ lat, lng: lon }));
  }
  if (geometry.type === "MultiPolygon") {
    const poly = geometry.coordinates[0];
    if (!poly || !poly[0]) return null;
    return poly[0].map(([lon, lat]) => ({ lat, lng: lon }));
  }
  if (geometry.type === "Point") {
    const [lon, lat] = geometry.coordinates;
    return [{ lat, lng: lon }];
  }
  return null;
}

function createSupabaseOnlyLot(entry) {
  const { row, stats, permits } = entry;
  const osmFeature = getOsmFeature(row.location);
  const centroidArr = centroidForGeometry(osmFeature?.geometry);
  const centroid = centroidArr ? { lat: centroidArr[0], lng: centroidArr[1] } : null;
  const boundary = toBoundaryLatLng(osmFeature?.geometry);
  const capacityVal = Number(stats.total ?? row.capacity ?? 0);
  const occupiedVal = Math.min(Number(stats.occupied ?? row.occupancy ?? 0), capacityVal);

  const metadata = {
    source: "supabase",
    osmId: row.location,
    pricing: row.pricing ?? null,
    supabase: {
      lot_name: row.lot_name,
      location: row.location,
      capacity: row.capacity,
      occupancy: row.occupancy,
      spot_total: stats.total,
      spot_occupied: stats.occupied,
      permits,
      spots: entry.spots,
    },
  };
  if (osmFeature?.properties) {
    metadata.tags = osmFeature.properties;
  }
  if (metadata.pricing == null) {
    metadata.pricing = derivePricingInfo(metadata.tags, row.lot_name);
  }
  metadata.spaceCount = capacityVal;
  metadata.occupiedCount = occupiedVal;

  return {
    id: entry.id,
    name: row.lot_name,
    code: null,
    campus: "Columbus",
    centroid,
    boundary,
    permit_types: permits && permits.length ? permits : ["Visitor"],
    latestCap: {
      capacity: capacityVal,
      occupied: occupiedVal,
      source: "supabase",
      observed_at: new Date().toISOString(),
    },
    latestImage: null,
    counts: {
      total: capacityVal,
      occupied: occupiedVal,
      open: Math.max(capacityVal - occupiedVal, 0),
      unknown: 0,
    },
    pricing: metadata.pricing ?? null,
    metadata,
  };
}

function derivePricingInfo(tags, lotName) {
  if (tags?.pricing) return String(tags.pricing);
  if (tags?.fee === "no") return "No fee (permit enforcement applies).";
  if (tags?.fee === "yes") return "Paid parking (rates may vary).";
  if (lotName?.toLowerCase().includes("garage")) return "Garage rates apply (hourly fees, daily max).";
  return "Check on-site signage for pricing details.";
}

// scheduler: simulate capacity & snapshots
schedule.scheduleJob("*/10 * * * *", ()=>{
  const capacityFileExists = fs.existsSync(path.join(DATA_DIR, "capacity.json"));
  if (!capacityFileExists) return;
  let cap = readJSON("capacity.json", {});
  for (const l of readJSON("lots.json", [])) {
    const list = cap[l.id] || [];
    const last = list.slice(-1)[0] || { capacity: 200, occupied: 80 };
    const delta = Math.round((Math.random()-0.45)*5);
    const next = { capacity: last.capacity, occupied: Math.max(0, Math.min(last.capacity, last.occupied + delta)), source: "mock", observed_at: new Date().toISOString() };
    cap[l.id] = [...list, next];
  }
  writeJSON("capacity.json", cap);
  let snaps = readJSON("snapshots.json", {});
  const now = new Date();
  const weekday = now.getDay();
  const slot = now.toTimeString().slice(0,5);
  for (const l of readJSON("lots.json", [])) {
    const arr = snaps[l.id] || [];
    const counts = summarizeStalls(readJSON("stalls.json", {})[l.id] || []);
    arr.push({ weekday, slot, open: counts.open, occupied: counts.occupied, detected_at: now.toISOString() });
    snaps[l.id] = arr.slice(-2000);
  }
  writeJSON("snapshots.json", snaps);
});

app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
