import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import schedule from "node-schedule";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const DATA_DIR = path.join(__dirname, "data");
const IMG_DIR = path.join(DATA_DIR, "images");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

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

let lots = readJSON("lots.json", []);
let stallsByLot = readJSON("stalls.json", {});
let capacity = readJSON("capacity.json", {});
let snapshots = readJSON("snapshots.json", {});

app.get("/", (_req, res) => res.json({ ok: true, service: "smart-parking-api" }));
app.use("/images", express.static(IMG_DIR));
app.use("/osm", express.static(path.join(DATA_DIR, "osm")));

app.get("/api/lots", (req, res) => {
  const { near, radius, permit } = req.query;
  let result = lots.map(l => summarizeLot(l));
  if (permit) result = result.filter(l => (l.permit_types || []).includes(permit));
  if (near && typeof near === "string") {
    const [lat, lng] = near.split(",").map(Number);
    result.forEach(l => { l.distanceMeters = distanceMeters({lat, lng}, l.centroid); });
    result.sort((a,b)=> (a.distanceMeters ?? 1e12) - (b.distanceMeters ?? 1e12));
    if (radius) result = result.filter(l => (l.distanceMeters ?? 1e12) <= Number(radius));
  }
  res.json(result);
});

app.get("/api/lots/:id", (req, res) => {
  const lot = lots.find(l => l.id === req.params.id);
  if (!lot) return res.status(404).json({ error: "lot not found" });
  const latestCap = (capacity[lot.id] || []).slice(-1)[0];
  const latestImage = latestImageForLot(lot.id);
  const stalls = stallsByLot[lot.id] || [];
  const counts = summarizeStalls(stalls);
  res.json({ ...lot, latestCap, latestImage, counts });
});

app.get("/api/lots/:id/stalls", (req, res) => {
  const stalls = stallsByLot[req.params.id] || [];
  res.json({ lotId: req.params.id, snapshot: { at: new Date().toISOString(), source: "manual", counts: summarizeStalls(stalls) }, stalls });
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

function summarizeLot(l) {
  const stalls = stallsByLot[l.id] || [];
  const counts = summarizeStalls(stalls);
  const cap = (capacity[l.id] || []).slice(-1)[0] || null;
  const latestImage = latestImageForLot(l.id);
  return { id: l.id, name: l.name, code: l.code || null, centroid: l.centroid, permit_types: l.permit_types || [], latestCap: cap, latestImage, counts };
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
