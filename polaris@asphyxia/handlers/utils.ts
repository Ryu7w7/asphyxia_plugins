// @ts-ignore - Asphyxia globals injected at runtime
declare const K: any;
// @ts-ignore
declare const DB: any;
// @ts-ignore
declare const U: any;
// @ts-ignore
declare const R: any;
// @ts-ignore
declare const IO: any;
// @ts-ignore
declare const CONFIG: any;
// @ts-ignore
declare const console: any;
declare const require: any;
declare const Buffer: any;
declare const __dirname: string;

// ---------------------------------------------------------------------------
// Polaris Chord (XIF) — shared utils
// Port of medusapluginpolarischord (C# / Medusa) to Asphyxia TypeScript.
// Persistence model is "echo raw": usr.save stores the incoming XRPC object
// verbatim; usr.get returns it back. This tolerates client version changes
// without needing every nested Usr* type mapped in TS.
// ---------------------------------------------------------------------------

export const GAMECODE = "XIF";
export const LOCATION_ID = "XIF00001";
export const FACILITY_NAME = "LOCAL TEST";
export const COUNTRY = "JP";
export const REGION = "13";

export const HOST = "127.0.0.1";
export const PORT = 8083;

export const CARDMNG_SHADOW_MODULE = "xifcard";
export const DEFAULT_CARDID = "E0047CC78DFBA459";
export const PASELI_BALANCE = 57300;

export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

export function nowDateSpace(): string {
  // C# usr responses: "yyyy-MM-dd HH:mm:ss"
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function nowDateT(): string {
  // C# mst/gacha responses: "yyyy-MM-ddTHH:mm:ss"
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function isVerbose(): boolean {
  try {
    const v = U.GetConfig("XIF_VERBOSE");
    if (v == null || v === false || v === 0) return false;
    const s = String(v).trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "on";
  } catch { return false; }
}

export function vlog(...args: any[]): void {
  try { if (isVerbose()) console.log(...args); } catch { }
}

// ---------------------------------------------------------------------------
// XRPC leaf helpers (K.ITEM shaped: { "@attr": { __type }, "@content": [...] })
// ---------------------------------------------------------------------------

function leafNum(v: any, def: number = 0): number {
  try {
    if (v == null) return def;
    if (typeof v === "number") return Number.isFinite(v) ? v : def;
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "string") {
      const n = parseInt(v, 10);
      return isNaN(n) ? def : n;
    }
    if (typeof v === "object") {
      const c = (v as any)["@content"];
      if (Array.isArray(c)) return leafNum(c[0], def);
      if (c != null) return leafNum(c, def);
    }
    return def;
  } catch { return def; }
}

function leafStr(v: any, def: string = ""): string {
  try {
    if (v == null) return def;
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "bigint" || typeof v === "boolean") return String(v);
    if (typeof v === "object") {
      const c = (v as any)["@content"];
      if (Array.isArray(c)) return leafStr(c[0], def);
      if (c != null) return leafStr(c, def);
    }
    return def;
  } catch { return def; }
}

export function numOf(data: any, ...keys: string[]): number {
  for (const k of keys) {
    if (data && data[k] != null) {
      const n = leafNum(data[k], NaN);
      if (!isNaN(n)) return n;
    }
    // also check nested "0" wrapper (EamusePlugin raw form)
    if (data && (data as any)["0"] && (data as any)["0"][k] != null) {
      const n = leafNum((data as any)["0"][k], NaN);
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}

export function strOf(data: any, ...keys: string[]): string {
  for (const k of keys) {
    if (data && data[k] != null) {
      const s = leafStr(data[k], "");
      if (s !== "") return s;
    }
    if (data && (data as any)["0"] && (data as any)["0"][k] != null) {
      const s = leafStr((data as any)["0"][k], "");
      if (s !== "") return s;
    }
    // @attr fallback (cardmng style)
    if (data && data["@attr"] && data["@attr"][keys[0]] != null) {
      return String(data["@attr"][keys[0]]);
    }
  }
  return "";
}

function arrOf(data: any, key: string): any[] {
  const v = (data && (data as any)[key]) ?? (data && (data as any)["0"] && (data as any)["0"][key]);
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

export const X = { numOf, strOf, arrOf, leafNum, leafStr };

// JSON-safe clone: BigInt -> Number (Asphyxia DB cannot store BigInt)
export function jsonSafe(o: any): any {
  try {
    return JSON.parse(JSON.stringify(o, (_k, v) => typeof v === "bigint" ? Number(v) : v));
  } catch {
    return o;
  }
}

// ---------------------------------------------------------------------------
// Profile store (echo raw) — collection "profile", refid-first (ProfileSpace)
// ---------------------------------------------------------------------------

export interface XifProfile {
  collection?: string;
  refid: string;
  usr_id: number;
  crew_id: string;
  data: any;          // raw usr.save echo (K.ITEM leaves preserved)
  scores: any[];      // raw music play logs (for get_usr_music aggregation)
  created_at?: number;
  updated_at?: number;
}

export function normalizeRefid(refid: string): string {
  return (refid || "").trim().toUpperCase();
}

export function playerIdFromRefid(refid: string): number {
  const prefix = (refid || "").slice(0, 8);
  try {
    const v = parseInt(prefix, 16);
    if (!isNaN(v)) return (v & 0x7fffffff) || 1;
  } catch { }
  let h = 5381;
  const s = refid || "GUEST";
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return ((h >>> 0) & 0x7fffffff) || 1;
}

function randomCrewId(): string {
  // 8-digit, no leading zero (mirrors C# GenerateUniqueCrewId length=8)
  return String(10000000 + Math.floor(Math.random() * 90000000));
}

async function allProfiles(): Promise<XifProfile[]> {
  try {
    // @ts-ignore
    const all: XifProfile[] = await DB.Find(null, { collection: "profile" });
    return (all || []).map(d => dbDecode(d));
  } catch { return []; }
}

// The core DB rejects ANY "__"-prefixed key anywhere in the doc tree
// (CheckQuery, RyuNET-core EamuseIO), but K.ITEM leaves are full of
// @attr.__type / @attr.__count. MFG never hits this because it stores
// plain strings. Escape __* (except __refid, which the core explicitly
// allows) as @__* on write, restore on read. Lossless round trip.
function mapKeysDeep(o: any, fn: (k: string) => string): any {
  if (Array.isArray(o)) return o.map(v => mapKeysDeep(v, fn));
  if (o && typeof o === "object") {
    const out: any = {};
    for (const k of Object.keys(o)) out[fn(k)] = mapKeysDeep((o as any)[k], fn);
    return out;
  }
  return o;
}
const dbEscKey = (k: string): string =>
  (k.length > 2 && k.startsWith("__") && k !== "__refid" ? "@" + k : k);
const dbUnescKey = (k: string): string =>
  (k.startsWith("@__") ? k.slice(1) : k);

function dbEncode(doc: any): any {
  return mapKeysDeep(jsonSafe(doc), dbEscKey);
}
function dbDecode(doc: any): any {
  if (!doc || typeof doc !== "object") return doc;
  return mapKeysDeep(doc, dbUnescKey);
}

async function findFreeUsrId(base: number, excludeRefid: string): Promise<number> {
  let cand = base || 1;
  const excl = normalizeRefid(excludeRefid);
  for (let i = 0; i < 100000; i++) {
    if (cand <= 0) cand = 1;
    try {
      // @ts-ignore
      const hit: any = await DB.FindOne(null, { collection: "profile", usr_id: Number(cand) });
      if (hit && normalizeRefid(hit.refid) !== excl) { cand++; continue; }
      if (hit && normalizeRefid(hit.refid) === excl) return Number(cand);
      return Number(cand);
    } catch { return Number(cand); }
  }
  return Number(cand);
}

export async function getProfileByRefid(refid: string): Promise<XifProfile | null> {
  const norm = normalizeRefid(refid);
  if (!norm) return null;
  const cached = _byRefid.get(norm);
  if (cached) return cached;
  try {
    // @ts-ignore
    const doc = await DB.FindOne(norm, { collection: "profile" });
    if (doc) { const dec = dbDecode(doc); _cache(dec); return dec; }
  } catch (e) { try { console.error(`[XIF] getProfileByRefid FindOne failed: ${e}`); } catch {} }
  try {
    const all = await allProfiles();
    for (const p of all) {
      _cache(p);
      if (normalizeRefid((p as any).refid) === norm) return p;
    }
  } catch (e) { try { console.error(`[XIF] getProfileByRefid scan failed: ${e}`); } catch {} }
  return null;
}

export async function getProfileByUsrId(usrId: number): Promise<XifProfile | null> {
  const num = Number(usrId);
  if (!num) return null;
  const cached = _byUsrId.get(num);
  if (cached && Number((cached as any).usr_id) === num) return cached;
  try {
    // @ts-ignore
    const doc = await DB.FindOne(null, { collection: "profile", usr_id: num });
    if (doc) { const dec = dbDecode(doc); _cache(dec); return dec; }
  } catch { }
  try {
    const all = await allProfiles();
    for (const p of all) {
      _cache(p);
      if (Number((p as any).usr_id) === num) return p;
    }
  } catch { }
  return null;
}

export async function ensureProfileByRefid(refid: string): Promise<XifProfile> {
  const norm = normalizeRefid(refid) || "GUEST";
  const existing = await getProfileByRefid(norm);
  if (existing) {
    // lazy collision repair (same approach as mfg@asphyxia)
    try {
      const owner = _byUsrId.get(Number((existing as any).usr_id));
      if (owner && normalizeRefid((owner as any).refid) !== norm) {
        (existing as any).usr_id = await findFreeUsrId(Number((existing as any).usr_id) + 1, norm);
        await saveProfile(norm, existing);
      }
    } catch { }
    return existing;
  }
  let uid = await findFreeUsrId(playerIdFromRefid(norm), norm);
  // unique crew_id via scan
  let crew = randomCrewId();
  try {
    const all = await allProfiles();
    const used = new Set(all.map(p => String((p as any).crew_id || "")));
    for (let i = 0; i < 50 && used.has(crew); i++) crew = randomCrewId();
  } catch { }
  const doc: XifProfile = {
    collection: "profile",
    refid: norm,
    usr_id: uid,
    crew_id: crew,
    data: {},
    scores: [],
    created_at: nowUnix(),
  };
  try {
    // @ts-ignore
    await DB.Upsert(norm, { collection: "profile" }, dbEncode(doc));
  } catch { }
  _cache(doc);
  return doc;
}

export async function saveProfile(refid: string, doc: XifProfile): Promise<void> {
  const norm = normalizeRefid(refid) || normalizeRefid((doc as any).refid) || "GUEST";
  (doc as any).refid = norm;
  (doc as any).updated_at = nowUnix();
  // Stamp the in-game name at the top level so the RyuNET WebUI profile
  // listing (which looks for doc.name) shows the real player name instead
  // of falling back to the core profile's random or GUEST name.
  try {
    const inGameName = echoUsrName((doc as any).data);
    if (inGameName) (doc as any).name = inGameName;
  } catch { }
  try {
    // @ts-ignore
    await DB.Upsert(norm, { collection: "profile" }, dbEncode(doc));
  } catch (e) {
    try { console.error(`[XIF] saveProfile FAILED refid=${norm} keys=${Object.keys(jsonSafe(doc) as any).join(",")}: ${e}`); } catch {}
    throw e;
  }
  _cache(doc);
}

const _byUsrId: Map<number, XifProfile> = new Map();
const _byRefid: Map<string, XifProfile> = new Map();

function _cache(p: XifProfile): void {
  const norm = normalizeRefid((p as any).refid);
  if (norm) _byRefid.set(norm, p);
  if ((p as any).usr_id) {
    const cur = _byUsrId.get(Number((p as any).usr_id));
    if (!cur || normalizeRefid((cur as any).refid) === norm) _byUsrId.set(Number((p as any).usr_id), p);
  }
}

// Name stored inside echo data (usr_profile.usr_name leaf). Tolerant to
// array-wrapped structs (Asphyxia sometimes wraps single elements).
export function echoUsrName(data: any): string {
  try {
    let prof = (data && (data as any).usr_profile) || {};
    if (Array.isArray(prof)) prof = prof[0] || {};
    const direct = X.strOf({ v: (prof as any).usr_name }, "v");
    if (direct) return direct;
    // last resort: scan one level for any usr_name-ish leaf
    if (prof && typeof prof === "object") {
      for (const k of Object.keys(prof)) {
        if (/usr_?name/i.test(k)) {
          const s = X.strOf(prof, k);
          if (s) return s;
        }
      }
    }
  } catch { }
  return "";
}

// ---------------------------------------------------------------------------
// Gacha transactions (in-memory, mirrors C# GachaService)
// ---------------------------------------------------------------------------

export interface GachaTx {
  id: string;
  usr_id: number;
  gacha_id: number | null;
  draw_count: number;
  payment_method: number | null;
  drawn: Array<{ item_id: string; count: number; rarity: string }>;
  created_at: number;
}

export const GACHA_TX: Map<string, GachaTx> = new Map();
const GACHA_TX_TTL_MS = 30 * 60 * 1000;

export function gachaBegin(id: string, usrId: number): GachaTx {
  const ex = GACHA_TX.get(id);
  if (ex) return ex;
  const tx: GachaTx = { id, usr_id: Number(usrId), gacha_id: null, draw_count: 0, payment_method: null, drawn: [], created_at: Date.now() };
  GACHA_TX.set(id, tx);
  return tx;
}

export function gachaPurge(): void {
  const now = Date.now();
  for (const [k, v] of GACHA_TX) {
    if (now - v.created_at > GACHA_TX_TTL_MS) GACHA_TX.delete(k);
  }
}

// ---------------------------------------------------------------------------
// Static master data (songs/charts + gacha catalog)
// Port of C# LoadStatic*Data: the C# plugin reads the game's own Unity asset
// bundles (StreamingAssets/aa/StandaloneWindows64/*.bytes.bundle). Here we
// read JSON seeds from data/ (editable + WebUI-friendly). Operators can dump
// MusicDataMaster.csv / ChartDataMaster.csv rows to data/musics.json with an
// external tool; without seeds the server still boots (empty catalog).
// ---------------------------------------------------------------------------

export interface ChartSeed { difficulty: number; open_at?: string; close_at?: string; }
export interface MusicSeed { music_id: number; charts: ChartSeed[]; }
// count: quantity granted per draw (consumables, e.g. 1000 mira); cards are always 1.
export interface GachaItemSeed { item_id: string; rarity: number; pickup?: boolean; count?: number; }
export interface GachaSeed {
  id: number | string;
  name: string;
  payment_type?: number; // flags: Credit=2 Paseli=4 Item=8 (C# GachaPaymentMethodFlags)
  consume_item_id?: string;
  consume_item_count?: number;
  w_r?: number; w_sr?: number; w_ssr?: number; w_pickup?: number;
  open_at?: string; close_at?: string;
  items: GachaItemSeed[];
}

// ---------------------------------------------------------------------------
// Game builds. The release code is the last segment of the model string
// ("XIF:J:A:A:2026012100"). Each build ships its own master tables, so seeds
// live in data/<release>/ (generated by tools/xif_data.py); data/*.json is the
// 2025070800 set and the fallback for anything not overridden.
// ---------------------------------------------------------------------------

export const VERSION_2025070800 = 2025070800;
export const VERSION_2026012100 = 2026012100;
export const DEFAULT_VERSION = VERSION_2025070800;

export function xifVersion(info: any): number {
  try {
    const code = Number(String((info && info.model) || "").split(":").pop());
    if (Number.isFinite(code) && code >= 2000000000) return code;
  } catch { }
  return DEFAULT_VERSION;
}

// Protocol additions of 2026012100: draw_goods_gacha, usr_shop_goods_history,
// mst_music_stats, mst_shop_goods_event in usr.save, played_at on scores.
export function isProtocol2026(ver: number): boolean {
  return ver >= VERSION_2026012100;
}

function pluginFile(rel: string): string | null {
  try {
    // @ts-ignore
    const fs = require("fs");
    // @ts-ignore
    const path = require("path");
    const candidates: string[] = [];
    try {
      // @ts-ignore
      if (typeof __dirname !== "undefined") candidates.push(path.join(__dirname, "..", rel));
    } catch { }
    candidates.push(rel, `polaris@asphyxia/${rel}`);
    for (const p of candidates) {
      try { if (fs.existsSync(p)) return p; } catch { }
    }
  } catch { }
  return null;
}

function readTextSync(rel: string): string | null {
  const p = pluginFile(rel);
  if (!p) return null;
  try {
    // Strip UTF-8 BOM: WebUI text uploads on Windows often add one and
    // JSON.parse chokes on it (this silently killed events.json once ->
    // empty shop, empty login bonus boards).
    // @ts-ignore
    return require("fs").readFileSync(p, "utf-8").replace(/^﻿/, "");
  } catch { return null; }
}

function tryReadJsonFileSync(rel: string): any | null {
  const txt = readTextSync(rel);
  if (txt == null) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

// Release folders present under data/, newest first.
let _seedDirs: number[] | null = null;
function seedDirs(): number[] {
  if (_seedDirs) return _seedDirs;
  let dirs: number[] = [];
  try {
    const base = pluginFile("data");
    // @ts-ignore
    if (base) dirs = require("fs").readdirSync(base).map(Number).filter((n: number) => n >= 2000000000);
  } catch { }
  _seedDirs = dirs.sort((a, b) => b - a);
  return _seedDirs;
}

// data/<newest release <= ver>/<file>, else data/<file>. A build newer than
// every folder reuses the latest one, so a fresh release boots before its
// own seeds are generated.
function seedPath(ver: number, file: string): string {
  for (const d of seedDirs()) {
    if (d <= ver && pluginFile(`data/${d}/${file}`)) return `data/${d}/${file}`;
  }
  return `data/${file}`;
}

const _seedCache: Map<string, any> = new Map();
function seedList<T>(ver: number, file: string, key: string): T[] {
  const rel = seedPath(ver, file);
  if (!_seedCache.has(rel)) {
    const j = tryReadJsonFileSync(rel);
    _seedCache.set(rel, j && Array.isArray(j[key]) ? j[key] : Array.isArray(j) ? j : []);
  }
  return _seedCache.get(rel);
}

export function getMusics(ver: number = DEFAULT_VERSION): MusicSeed[] {
  const list = seedList<MusicSeed>(ver, "musics.json", "musics");
  if (list.length) return list;
  // No seeds: boot with the full known catalog, all charts Open — mirrors
  // MonkeyBusiness mst.py (songs 1-400 + event songs 99900/99901, all 5
  // difficulties). Drop a data/musics.json to override with real masters.
  return FULL_CATALOG_IDS.map(id => ({
    music_id: id,
    charts: [0, 1, 2, 3, 4].map(d => ({
      difficulty: d,
      open_at: "2000-01-01 00:00:00",
      close_at: "2099-12-31 23:59:59",
    })),
  }));
}

export function getGachas(ver: number = DEFAULT_VERSION): GachaSeed[] {
  return seedList<GachaSeed>(ver, "gacha.json", "gachas");
}

// mst.get_common's mst_patch: master-table CSV the client applies before
// FilterDatabase(assetVersion). Rescues the CharacterCardMaster rows shipped
// with a placeholder Version (9999999) that the filter would delete — drawing
// those cards otherwise fails with gacha error 301.
export function getMstPatch(ver: number = DEFAULT_VERSION): string {
  const rel = seedPath(ver, "mst_patch.csv");
  if (!_seedCache.has(rel)) _seedCache.set(rel, readTextSync(rel) || "");
  return _seedCache.get(rel);
}

export function reloadStaticData(): void {
  _seedDirs = null;
  _seedCache.clear();
  for (const ver of [DEFAULT_VERSION, ...seedDirs()]) {
    getMusics(ver);
    getGachas(ver);
    getEvents(ver);
    getShopGoods(ver);
    getDemos(ver);
    getMstPatch(ver);
  }
}

export interface DemoSeed { demo_type: number; path: string; }

// Attract-mode previews (DemoMovieMaster MusicPreview rows whose song is in
// the served catalog). Shown on the title screen when idle.
export function getDemos(ver: number = DEFAULT_VERSION): DemoSeed[] {
  return seedList<DemoSeed>(ver, "demo.json", "demos");
}

export interface ShopGoodsItemSeed { id: number; weight: number; name: string; stock: number; }
export interface ShopGoodsEventSeed {
  id: number;
  open_at: string;
  close_at: string;
  goods: ShopGoodsItemSeed[];
  // "lottery" (default): rolled server-side on every usr.save and returned as
  // usr_goods_lottery (events 1/2). "draw" (2026012100+): offered by the
  // client at Continue and resolved by usr.draw_goods_gacha (event 3).
  campaign?: "lottery" | "draw";
  // draw campaigns: relative weight of drawing nothing (0 = every draw wins)
  // and days until a won prize expires.
  lose_weight?: number;
  expire_days?: number;
}

export function getShopGoods(ver: number = DEFAULT_VERSION): ShopGoodsEventSeed[] {
  return seedList<ShopGoodsEventSeed>(ver, "shop_goods.json", "events");
}

export interface OpenEventSeed { id: string; param: string; }

const DEFAULT_EVENTS: OpenEventSeed[] = [
  { id: "matching.local.00001", param: "asset_id=00001" },
  { id: "matching.online.00001", param: "asset_id=00002" },
  { id: "matching.room.00001", param: "asset_id=00001" },
  { id: "feature.entryboostitem", param: "" },
  { id: "feature.privacyranking", param: "" },
  { id: "feature.storyselect", param: "" },
  { id: "feature.costumechange", param: "" },
  { id: "feature.namechange", param: "" },
];

// Always-open events. Primary source is data/events.json (built from the
// real masters: shop/ticket/promotion/caravan/login-bonus/advertisement +
// matching/feature flags — the same union C# builds from its DB). Falls
// back to the well-known core set when no seed is present.
export function getEvents(ver: number = DEFAULT_VERSION): OpenEventSeed[] {
  const list = seedList<OpenEventSeed>(ver, "events.json", "events");
  return list.length ? list : DEFAULT_EVENTS;
}

// Song id ranges (mirror MonkeyBusiness: mst serves 1-400 + event songs,
// usr_unlock_music covers 1-285 + event songs).
export const FULL_CATALOG_IDS: number[] = (() => {
  const ids: number[] = [];
  for (let i = 1; i <= 400; i++) ids.push(i);
  ids.push(99900, 99901);
  return ids;
})();
export const UNLOCK_MUSIC_IDS: number[] = (() => {
  const ids: number[] = [];
  for (let i = 1; i <= 285; i++) ids.push(i);
  ids.push(99900, 99901);
  return ids;
})();

export function isUnlockSongs(): boolean {
  try {
    const v = U.GetConfig("XIF_UNLOCK_SONGS");
    if (v == null) return true;
    const s = String(v).trim().toLowerCase();
    return !(s === "0" || s === "false" || s === "no" || s === "off");
  } catch { return true; }
}

// Always-open event ids (port of C# GetCommonMstHandler.BuildEventsAsync —
// the DB-backed union of feature flags / seasons / login bonus / shop /
// caravan / promotion events; here served from data/events.json).
// Matching rooms carry asset_id params like MonkeyBusiness mst.py.
export function alwaysOpenEvents(ver: number = DEFAULT_VERSION): Array<{ id: string; param: string }> {
  return getEvents(ver);
}

// Weighted single draw within a gacha seed (mirrors C# GachaService.PickOne:
// rarity bucket R=1/SR=2/SSR=3 by weights, then pickup-weighted item pick).
export function pickGachaItem(g: GachaSeed): { item_id: string; rarity: string; count: number } | null {
  const items = g.items || [];
  if (!items.length) return null;
  const wR = g.w_r ?? 70, wSR = g.w_sr ?? 25, wSSR = g.w_ssr ?? 5;
  const wPick = g.w_pickup ?? 10;
  const buckets: Array<[number, GachaItemSeed[]]> = [
    [1, items.filter(i => Number(i.rarity) === 1)],
    [2, items.filter(i => Number(i.rarity) === 2)],
    [3, items.filter(i => Number(i.rarity) === 3)],
  ];
  const weights = [wR, wSR, wSSR];
  for (let attempt = 0; attempt < 20; attempt++) {
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let roll = Math.random() * total;
    let idx = 0;
    for (; idx < weights.length; idx++) { roll -= weights[idx]; if (roll < 0) break; }
    idx = Math.min(idx, weights.length - 1);
    const bucket = buckets[idx][1];
    if (!bucket.length) continue;
    const iw = bucket.map(i => (i.pickup ? wPick : 1));
    const itotal = iw.reduce((a, b) => a + b, 0) || 1;
    let r2 = Math.random() * itotal;
    let pick = bucket[0];
    for (let i = 0; i < bucket.length; i++) { r2 -= iw[i]; if (r2 < 0) { pick = bucket[i]; break; } }
    return { item_id: String(pick.item_id), rarity: String(pick.rarity), count: Math.max(1, Number(pick.count) || 1) };
  }
  const fb = items[0];
  return { item_id: String(fb.item_id), rarity: String((fb as any).rarity ?? "1"), count: Math.max(1, Number(fb.count) || 1) };
}

// eacoin sessions (shared with eamuse handler)
export const PASELI_SESSIONS: Map<string, number> = new Map();

// card store (mirrors mfg@asphyxia; cards persisted inside profile docs)
export interface CardRec {
  card_id: string;
  refid: string;
  issued?: boolean;
  bound?: boolean;
  pin?: string;
  created_at?: number;
  updated_at?: number;
}
export const CARD_STORE: Map<string, CardRec> = new Map();
export const CARD_STORE_BY_REFID: Map<string, CardRec> = new Map();

export function newRefid(): string {
  const hex = "0123456789ABCDEF";
  let r = "A";
  for (let i = 1; i < 16; i++) r += hex[Math.floor(Math.random() * 16)];
  return r;
}

export function sanitizePin(raw: string, fallback: string = "0000"): string {
  const s = (raw || "").trim();
  if (/^\d{4}$/.test(s)) return s;
  if (/^\d{4}$/.test(fallback || "")) return fallback;
  return "0000";
}

export function gameBaseUrl(info?: any): string {
  let host = HOST;
  let port = PORT;
  try {
    if (info && (info as any).host) host = String((info as any).host);
  } catch { }
  try {
    if (info && (info as any).port) port = Number((info as any).port);
    else if (CONFIG && CONFIG.port) port = Number(CONFIG.port);
  } catch { }
  return `http://${host}:${port}`;
}
