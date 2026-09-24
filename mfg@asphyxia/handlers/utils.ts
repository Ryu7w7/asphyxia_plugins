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

// constants
export const LOCATION_ID = "VFG00001";
export const FACILITY_NAME = "LOCAL TEST";
export const COUNTRY = "JP";
export const REGION = "13";

export const HOST = "127.0.0.1";
export const PORT = 8083;

export const CARDMNG_SHADOW_MODULE = "vfgcard";
export const DEFAULT_CARDID = "E0047CC78DFBA459";
export const PASELI_BALANCE = 57300;

// xml helpers
export function xml_escape(text: any): string {
  const s = text == null ? "" : String(text);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function kitem(tag: string, typ: string, value: any = "", extraAttrs: Record<string, any> = {}): string {
  const extra = Object.entries(extraAttrs)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ` ${k}="${xml_escape(v)}"`)
    .join("");
  if (value === "" || value == null) {
    return `<${tag} __type="${typ}"${extra} />`;
  }
  return `<${tag} __type="${typ}"${extra}>${xml_escape(value)}</${tag}>`;
}

export function serv_st_ok(): string {
  return "<serv_st><code>0</code></serv_st>";
}

export function xml_response(...chunks: string[]): string {
  const body = chunks.join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<root>${serv_st_ok()}${body}</root>`;
}

export function formGet(form: Record<string, string>, ...keys: string[]): string {
  // last arg may be default if keys length >1 and we want default param? Keep simple: find first present key
  for (const k of keys) {
    if (k in form && form[k] != null && form[k] !== "") return form[k];
  }
  return "";
}

export function formGetDefault(form: Record<string, string>, key: string, def: string): string {
  const v = form[key];
  if (v == null || v === "") return def;
  return v;
}

export function parseMust(form: Record<string, string>): string[] {
  return (formGet(form, "must") || "").split("/");
}

export function mustInt(parts: string[], index: number, def: number = 0): number {
  try {
    if (parts.length > index && parts[index] !== "") return parseInt(parts[index], 10) || def;
    return def;
  } catch {
    return def;
  }
}

export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

// player id helpers (port of Python _player_id_from_refid)
export function playerIdFromRefid(refid: string): number {
  const prefix = (refid || "").slice(0, 8);
  try {
    const v = parseInt(prefix, 16);
    if (!isNaN(v)) return (v & 0x7fffffff) || 1;
  } catch { }
  // fallback hash via simple djb2
  let h = 5381;
  const s = refid || "GUEST";
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0 & 0x7fffffff) || 1;
}

export function newRefid(): string {
  const len = 16;
  // Asphyxia style: letter + 15 hex
  // use random hex
  const hex = "0123456789ABCDEF";
  let r = "A";
  for (let i = 1; i < len; i++) r += hex[Math.floor(Math.random() * 16)];
  return r;
}

export function pcode(refid: string): string {
  try {
    const v = parseInt((refid || "A").slice(0, 8), 16);
    if (!isNaN(v)) return String(v % 100000000).padStart(8, "0");
  } catch { }
  return "00000001";
}

export function sanitizePin(raw: string, fallback: string = "0000"): string {
  const s = (raw || "").trim();
  if (/^\d{4}$/.test(s)) return s;
  if (/^\d{4}$/.test(fallback || "")) return fallback;
  return "0000";
}

// DB wrappers (Asphyxia plugin DB)
// Use collection: "profile" for per-refid data
export interface ProfileDoc {
  collection?: string;
  refid: string;
  name: string;
  player_id: number;
  session_id?: string;
  is_guest?: boolean;
  states: Record<string, string>;
  dojo?: any[];
  gacha_txn?: any;
  created_at?: number;
  updated_at?: number;
}

export async function getProfileByRefid(refid: string): Promise<ProfileDoc | null> {
  if (!refid) return null;
  try {
    // @ts-ignore
    const doc = await DB.FindOne({ collection: "profile", refid });
    if (doc) _cacheProfile(doc);
    return doc || null;
  } catch (e) {
    return null;
  }
}

export async function getProfileBySession(pcuid: string): Promise<ProfileDoc | null> {
  if (!pcuid) return null;
  // Fast path: in-memory cache
  const cached = _profileBySession.get(pcuid);
  if (cached) return cached;
  // Slow path: DB lookup — try indexed query first, fall back to full scan
  try {
    // @ts-ignore
    let doc: ProfileDoc | null = null;
    try {
      // @ts-ignore
      doc = await DB.FindOne(null, { collection: "profile", session_id: pcuid });
    } catch { }
    if (!doc) {
      // @ts-ignore
      const all: ProfileDoc[] = await DB.Find(null, { collection: "profile" });
      if (all) for (const p of all) { _cacheProfile(p); if ((p as any).session_id === pcuid) doc = p; }
    }
    if (doc) _cacheProfile(doc);
    return doc || null;
  } catch {
    return null;
  }
}

export async function getProfileByPlayerId(mid: number): Promise<ProfileDoc | null> {
  if (!mid) return null;
  // Fast path: in-memory cache
  const cached = _profileByPlayerId.get(Number(mid));
  if (cached) return cached;
  // Slow path: DB lookup
  try {
    let doc: ProfileDoc | null = null;
    try {
      // @ts-ignore
      doc = await DB.FindOne(null, { collection: "profile", player_id: mid });
    } catch { }
    if (!doc) {
      // @ts-ignore
      const all: ProfileDoc[] = await DB.Find(null, { collection: "profile" });
      if (all) for (const p of all) { _cacheProfile(p); if (Number(p.player_id) === Number(mid)) doc = p; }
    }
    if (doc) _cacheProfile(doc);
    return doc || null;
  } catch {
    return null;
  }
}

export async function ensureProfile(refid: string, name: string = "GUEST"): Promise<ProfileDoc> {
  let p = await getProfileByRefid(refid);
  if (p) {
    if (name && name !== "GUEST" && p.name === "GUEST") {
      p.name = name;
      await saveProfile(refid, p);
    }
    return p;
  }
  const doc: ProfileDoc = {
    collection: "profile",
    refid,
    name,
    player_id: playerIdFromRefid(refid),
    states: {},
    created_at: nowUnix(),
  };
  try {
    // @ts-ignore - global upsert to avoid core profile check
    await DB.Upsert({ collection: "profile", refid }, doc);
  } catch { }
  _cacheProfile(doc);
  return doc;
}

export async function saveProfile(refid: string, doc: ProfileDoc): Promise<void> {
  try {
    // @ts-ignore
    await DB.Upsert({ collection: "profile", refid }, doc);
  } catch { }
  _cacheProfile(doc);
}

export async function saveState(mid: number, kind: string, payload: string): Promise<void> {
  let p = await getProfileByPlayerId(mid);
  if (!p) {
    const refid = `MID${String(mid).padStart(8, "0")}`;
    p = await ensureProfile(refid, "GUEST");
    p.player_id = mid;
    p.refid = refid;
  }
  if (!p.states) p.states = {};
  p.states[kind] = payload;
  (p as any).updated_at = nowUnix();
  await saveProfile(p.refid, p);
}

// in-memory stores
export const MATCHES: Map<string, any> = new Map();
// MATCH_LOBBY: lobbyKey -> { pcuids: string[], tid: number, createdAt: number }
export const MATCH_LOBBY: Map<string, { pcuids: string[]; tid: number; createdAt: number }> = new Map();
// PLAYER_SEAT: pcuid -> { tid: number, pindex: number, name: string, mid: number, profile: any, lobbyKey?: string, gmode?: number }
export const PLAYER_SEAT: Map<string, { tid: number; pindex: number; name: string; mid: number; profile: any, lobbyKey?: string, gmode?: number }> = new Map();
export const TABLES: Map<string, any> = new Map();
export const SHARED_TABLES: Map<number, any> = new Map();
export const STAMPS: Map<number, any[]> = new Map();
export let _stampSeq = 0;
export let _matchTidCounter = 1000;
export function incStampSeq(): number {
  _stampSeq += 1;
  return _stampSeq;
}
export function nextTid(): number {
  _matchTidCounter += 1;
  return _matchTidCounter;
}

// For eacoin sessions
export const PASELI_SESSIONS: Map<string, number> = new Map();

// For card mapping (plugin-local, mirrors server.py cards)
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
// Secondary index: refid -> CardRec for O(1) lookups
export const CARD_STORE_BY_REFID: Map<string, CardRec> = new Map();

// Profile cache — avoids full DB.Find on every request
const _profileBySession: Map<string, ProfileDoc> = new Map();
const _profileByPlayerId: Map<number, ProfileDoc> = new Map();

function _cacheProfile(p: ProfileDoc): void {
  if ((p as any).session_id) _profileBySession.set(String((p as any).session_id), p);
  if (p.player_id) _profileByPlayerId.set(Number(p.player_id), p);
}
export function _evictProfileCache(p: ProfileDoc): void {
  if ((p as any).session_id) _profileBySession.delete(String((p as any).session_id));
  if (p.player_id) _profileByPlayerId.delete(Number(p.player_id));
}

// helpers for base64 / state
export function stateB64(profile: ProfileDoc | null | undefined, kind: string): string {
  const raw = ((profile as any)?.states || {})[kind];
  if (!raw) return "";
  let rawBytes: string;
  if (typeof raw === "string") rawBytes = raw;
  else rawBytes = JSON.stringify(raw);
  try {
    // @ts-ignore
    return Buffer.from(rawBytes, "utf-8").toString("base64");
  } catch {
    return "";
  }
}

export function infoData(kind: string, payload: string): string {
  let b64 = "";
  try {
    // @ts-ignore
    b64 = Buffer.from(payload, "utf-8").toString("base64");
  } catch {
    b64 = "";
  }
  return `<info_data kind="${kind}">${b64}</info_data>`;
}

// gacha pools loading
let GACHA_POOLS: any = { standard_pool: [], series: {}, item_index: {} };
let _poolsLoaded = false;
function loadGachaPoolsSync(): void {
  if (_poolsLoaded) return;
  _poolsLoaded = true;
  try {
    // @ts-ignore
    const pools = require("../data/gacha_pools.json");
    if (pools) GACHA_POOLS = pools;
  } catch (e1) {
    try {
      // @ts-ignore
      const fs = require("fs");
      // @ts-ignore
      const path = require("path");
      // __dirname is handlers folder in compiled js, so ../data is correct
      // fallback try multiple locations
      const candidates = [
        // @ts-ignore
        typeof __dirname !== "undefined" ? require("path").join(__dirname, "../data/gacha_pools.json") : null,
        "data/gacha_pools.json",
        "../data/gacha_pools.json",
      ].filter(Boolean) as string[];
      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) {
            const txt = fs.readFileSync(p, "utf-8");
            GACHA_POOLS = JSON.parse(txt);
            break;
          }
        } catch { }
      }
    } catch { }
  }
  // Also try async IO if available (non-blocking, but fill if sync failed)
  if (!GACHA_POOLS.standard_pool || !GACHA_POOLS.standard_pool.length) {
    try {
      // IO.ReadFile is async, can't use sync, ignore
    } catch { }
  }
}
loadGachaPoolsSync();

export function getGachaPools(): any {
  return GACHA_POOLS;
}
export const GACHA_STANDARD_POOL: string[] = (GACHA_POOLS.standard_pool || []) as string[];
export const GACHA_SERIES_POOLS: Record<string, any> = (GACHA_POOLS.series || {}) as Record<string, any>;
export const GACHA_FALLBACK_CHARA = "Chara01";

// gacha series definitions (port of server.py)
export const GACHA_SERIES_CURATED: Array<[number, string, number, string]> = [
  [0, "Normal", 0, "Normal"],
  [1, "NormalTicket", 1, "Normal"],
  [25, "UnlockClear", 0, "Unlock"],
  [44, "UnlockIyo", 0, "Unlock"],
  [56, "UnlockGrimAroe", 0, "Unlock"],
  [63, "UnlockCocoa", 0, "Unlock"],
  [74, "UnlockDia", 0, "Unlock"],
  [101, "UnlockDoubriel", 0, "Unlock"],
  [125, "UnlockIppatsu", 0, "Unlock"],
  [135, "UnlockShiroe", 0, "Unlock"],
  [91, "MusicHiyori", 0, "Music"],
  [92, "MusicSen", 0, "Music"],
  [107, "MusicYao", 0, "Music"],
  [114, "MusicTenshi", 0, "Music"],
  [132, "MusicMusashi", 0, "Music"],
  [133, "LimitedCharaReturns", 0, "Limited"],
  [124, "PickupIppatsu", 0, "Pickup"],
  [128, "PickupMizugiReturns4", 0, "Pickup"],
  [129, "PickupUniformDia", 0, "Pickup"],
  [130, "PickupYukataToytoy2", 0, "Pickup"],
  [131, "PickupUniformDoubriel", 0, "Pickup"],
  [134, "PickupShiroe", 0, "Pickup"],
  [136, "PickupXmasGrimAroe", 0, "Pickup"],
  [137, "PickupMarchingIchiko", 0, "Pickup"],
  [138, "PickupKimonoClear", 0, "Pickup"],
  [139, "PickupBomberPine2", 0, "Pickup"],
  [140, "PickupLillyIppatsu", 0, "Pickup"],
];

export const GACHA_SERIES_ALL: Array<[number, string, number, string]> = [
  [0, "Normal", 0, "Normal"],
  [1, "NormalTicket", 1, "Normal"],
  [2, "PickupPine", 0, "Pickup"],
  [3, "PickupMizugiSen", 0, "Pickup"],
  [4, "PickupMizugiMitsuba", 0, "Pickup"],
  [5, "PickupMizugiMusashi", 0, "Pickup"],
  [6, "PickupMizugiHiyori", 0, "Pickup"],
  [7, "PickupMizugiYao", 0, "Pickup"],
  [8, "PickupMizugiPain", 0, "Pickup"],
  [9, "PickupMizugiTenshi", 0, "Pickup"],
  [10, "PickupShiori", 0, "Pickup"],
  [11, "PickupMizugiTumire", 0, "Pickup"],
  [12, "PickupMizugiToitoi", 0, "Pickup"],
  [13, "PickupHalfAnniversary", 0, "Pickup"],
  [14, "PickupMizugiIchiko", 0, "Pickup"],
  [15, "PickupMizugiTeiyaku", 0, "Pickup"],
  [16, "PickupHalloweenMusashi", 0, "Pickup"],
  [17, "PickupMizugiNijo", 0, "Pickup"],
  [18, "PickupChaos", 0, "Pickup"],
  [19, "PickupCinderellaMitsuba", 0, "Pickup"],
  [20, "PickupXmasTenshi", 0, "Pickup"],
  [21, "PickupNewYearTsumire", 0, "Pickup"],
  [22, "PickupNewYearYao", 0, "Pickup"],
  [23, "PickupValentineToytoy", 0, "Pickup"],
  [24, "PickupClear", 0, "Pickup"],
  [25, "UnlockClear", 0, "Unlock"],
  [26, "PickupSuccubusTenshi", 0, "Pickup"],
  [27, "PickupParodiusTsumire", 0, "Pickup"],
  [28, "PickupRaceQueenHiyori", 0, "Pickup"],
  [29, "PickupShiori2", 0, "Pickup"],
  [30, "PickupMizugiChaos", 0, "Pickup"],
  [31, "PickupHalfAnniversary2", 0, "Pickup"],
  [32, "PickupMizugiClear", 0, "Pickup"],
  [33, "PickupAliceMaidPine", 0, "Pickup"],
  [34, "PickupMizugiReturns1", 0, "Pickup"],
  [35, "PickupJerseyMitsuba", 0, "Pickup"],
  [36, "PickupUniformMusashi", 0, "Pickup"],
  [37, "PickupUniformSen", 0, "Pickup"],
  [38, "PickupChaos2", 0, "Pickup"],
  [39, "PickupUniformYao", 0, "Pickup"],
  [40, "PickupYukataToytoy", 0, "Pickup"],
  [41, "PickupClear2", 0, "Pickup"],
  [42, "PickupShiori3", 0, "Pickup"],
  [43, "PickupIyo", 0, "Pickup"],
  [44, "UnlockIyo", 0, "Unlock"],
  [45, "PickupTohoHiyori", 0, "Pickup"],
  [46, "PickupTohoTenshi", 0, "Pickup"],
  [47, "PickupTohoClear", 0, "Pickup"],
  [48, "PickupMizugiKomugi", 0, "Pickup"],
  [49, "PickupMizugiReturns2", 0, "Pickup"],
  [50, "PickupDateMizugiSen", 0, "Pickup"],
  [51, "PickupSisterTsumire", 0, "Pickup"],
  [52, "PickupUniformSen2", 0, "Pickup"],
  [53, "PickupHalloweenMusashi2", 0, "Pickup"],
  [54, "PickupBomberPine", 0, "Pickup"],
  [55, "PickupGrimAroe", 0, "Pickup"],
  [56, "UnlockGrimAroe", 0, "Unlock"],
  [57, "PickupChaos3", 0, "Pickup"],
  [58, "PickupClear3", 0, "Pickup"],
  [59, "PickupIyo2", 0, "Pickup"],
  [60, "PickupDarknessRobeMitsuba", 0, "Pickup"],
  [61, "PickupNurseChaos", 0, "Pickup"],
  [62, "PickupCocoa", 0, "Pickup"],
  [63, "UnlockCocoa", 0, "Unlock"],
  [64, "PickupClear4", 0, "Pickup"],
  [65, "PickupGrimAroe2", 0, "Pickup"],
  [66, "PickupXmasTenshi2", 0, "Pickup"],
  [67, "PickupJiangshiIyo", 0, "Pickup"],
  [68, "PickupNewYearReturns1", 0, "Pickup"],
  [69, "PickupFundoshiMusashi", 0, "Pickup"],
  [70, "PickupValentineToytoy2", 0, "Pickup"],
  [71, "PickupBellyDanceYao", 0, "Pickup"],
  [72, "PickupAngelTenshi", 0, "Pickup"],
  [73, "PickupDia", 0, "Pickup"],
  [74, "UnlockDia", 0, "Unlock"],
  [75, "PickupIyo3", 0, "Pickup"],
  [76, "PickupGrimAroe3", 0, "Pickup"],
  [77, "PickupCocoa2", 0, "Pickup"],
  [78, "PickupLolitaToytoy", 0, "Pickup"],
  [79, "PickupGalHiyori", 0, "Pickup"],
  [80, "PickupGalGrimAroe", 0, "Pickup"],
  [81, "PickupGalClear", 0, "Pickup"],
  [82, "PickupParodiusTsumire2", 0, "Pickup"],
  [83, "PickupAnimalMizugiCocoa", 0, "Pickup"],
  [84, "PickupMizugiReturns3", 0, "Pickup"],
  [85, "PickupParkaMusashi", 0, "Pickup"],
  [86, "PickupAnimalMizugiDia", 0, "Pickup"],
  [87, "PickupSuccubusTenshi2", 0, "Pickup"],
  [88, "PickupDressChaos", 0, "Pickup"],
  [89, "PickupRaceQueenHiyori2", 0, "Pickup"],
  [90, "PickupMaidTsumire", 0, "Pickup"],
  [91, "MusicHiyori", 0, "Music"],
  [92, "MusicSen", 0, "Music"],
  [93, "PickupShiori4", 0, "Pickup"],
  [94, "PickupChaos4", 0, "Pickup"],
  [95, "PickupClear5", 0, "Pickup"],
  [96, "PickupIyo4", 0, "Pickup"],
  [97, "PickupGrimAroe4", 0, "Pickup"],
  [98, "PickupCocoa3", 0, "Pickup"],
  [99, "PickupDia2", 0, "Pickup"],
  [100, "PickupDoubriel", 0, "Pickup"],
  [101, "UnlockDoubriel", 0, "Unlock"],
  [102, "PickupPartTimerMitsuba", 0, "Pickup"],
  [103, "PickupUniformYao2", 0, "Pickup"],
  [104, "PickupCinderellaMitsuba2", 0, "Pickup"],
  [105, "PickupAliceMaidPine2", 0, "Pickup"],
  [106, "PickupSchoolMizugiSen", 0, "Pickup"],
  [107, "MusicYao", 0, "Music"],
  [108, "PickupUniformMusashi2", 0, "Pickup"],
  [109, "PickupSchoolMizugiIyo", 0, "Pickup"],
  [110, "PickupSchoolMizugiToytoy", 0, "Pickup"],
  [111, "PickupJerseyMitsuba2", 0, "Pickup"],
  [112, "PickupUniformSen3", 0, "Pickup"],
  [113, "PickupBellyDancePine", 0, "Pickup"],
  [114, "MusicTenshi", 0, "Music"],
  [115, "PickupYukataYao", 0, "Pickup"],
  [123, "PickupDoubriel2", 0, "Pickup"],
  [124, "PickupIppatsu", 0, "Pickup"],
  [125, "UnlockIppatsu", 0, "Unlock"],
  [126, "PickupUniformTenshi", 0, "Pickup"],
  [127, "PickupMaidToytoyIyo", 0, "Pickup"],
  [128, "PickupMizugiReturns4", 0, "Pickup"],
  [129, "PickupUniformDia", 0, "Pickup"],
  [130, "PickupYukataToytoy2", 0, "Pickup"],
  [131, "PickupUniformDoubriel", 0, "Pickup"],
  [132, "MusicMusashi", 0, "Music"],
  [133, "LimitedCharaReturns", 0, "Limited"],
  [134, "PickupShiroe", 0, "Pickup"],
  [135, "UnlockShiroe", 0, "Unlock"],
  [136, "PickupXmasGrimAroe", 0, "Pickup"],
  [137, "PickupMarchingIchiko", 0, "Pickup"],
  [138, "PickupKimonoClear", 0, "Pickup"],
  [139, "PickupBomberPine2", 0, "Pickup"],
  [140, "PickupLillyIppatsu", 0, "Pickup"],
];

export function gachaSeries(): Array<[number, string, number, string]> {
  try {
    // @ts-ignore
    const v = U.GetConfig("VFG_GACHA_ALL");
    if (String(v).toLowerCase() === "1" || String(v).toLowerCase() === "true" || String(v).toLowerCase() === "yes" || String(v).toLowerCase() === "on") {
      return GACHA_SERIES_ALL;
    }
  } catch { }
  try {
    // also check env for local testing
    // @ts-ignore
    const ev = process.env.VFG_GACHA_ALL;
    if (ev && ["1", "true", "yes", "on"].includes(ev.trim().toLowerCase())) return GACHA_SERIES_ALL;
  } catch { }
  return GACHA_SERIES_CURATED;
}

export function _gachaPool(sid: number, stype: string): { items: string[]; charas: string[]; custom: string[] } {
  const entry: any = GACHA_SERIES_POOLS[String(sid)] || {};
  let charas: string[] = [...(entry.pickup_charas || [])];
  let custom: string[] = [...(entry.custom_pickup_items || [])];
  if (stype === "Music") {
    return { items: [...(entry.music_items || [])], charas, custom: [] };
  }
  if (stype === "Pickup" && !charas.length && !custom.length) {
    charas = [GACHA_FALLBACK_CHARA];
  }
  let items: string[] = [...(GACHA_STANDARD_POOL || [])];
  for (const oid of (entry.extra_items || [])) {
    if (!items.includes(oid)) items.push(oid);
  }
  return { items, charas, custom };
}

let _gachaInfoCache: Map<boolean, string> = new Map();
export function buildGachaInfoXml(): string {
  const rows: string[] = [];
  for (const [sid, label, ticket, stype] of gachaSeries()) {
    const pool = _gachaPool(sid, stype);
    const items = pool.items.map(o => `<item>${xml_escape(o)}</item>`).join("");
    const charas = pool.charas.map(c => `<chara>${xml_escape(c)}</chara>`).join("");
    const custom = pool.custom.map(o => `<item>${xml_escape(o)}</item>`).join("");
    rows.push(
      "<info>" +
      `<id>${sid}</id>` +
      `<label>${xml_escape(label)}</label>` +
      `<ticket_nr>${ticket}</ticket_nr>` +
      "<now_active>1</now_active>" +
      "<force_active>0</force_active>" +
      `<series_type>${stype}</series_type>` +
      `<items>${items}</items>` +
      `<pickup_charas>${charas}</pickup_charas>` +
      `<custom_pickup_items>${custom}</custom_pickup_items>` +
      `<exchange_items>${stype === "Music" ? items : custom}</exchange_items>` +
      `<start_date>${EVENT_BEGIN}</start_date>` +
      `<end_date>${EVENT_END}</end_date>` +
      "</info>"
    );
  }
  return "<gacha_schedule>" + rows.join("") + "</gacha_schedule>";
}

export function _gachaInfoXml(): string {
  const key = gachaSeries() === GACHA_SERIES_ALL;
  let xml = _gachaInfoCache.get(key);
  if (xml == null) {
    xml = buildGachaInfoXml();
    _gachaInfoCache.set(key, xml);
  }
  return xml;
}

// aliases for legacy naming
export const gachaPools = GACHA_POOLS;

// MUSIC gacha pools (reach-song)
export const MUSIC_GACHA_POOL: Map<number, string[]> = (() => {
  const m = new Map<number, string[]>();
  for (const sidStr of Object.keys(GACHA_SERIES_POOLS)) {
    const entry = GACHA_SERIES_POOLS[sidStr];
    if (entry.type === "Music" && entry.music_items && entry.music_items.length) {
      m.set(parseInt(sidStr, 10), [...entry.music_items] as string[]);
    }
  }
  return m;
})();
export const MUSIC_GACHA_RESERVES: Map<number, number> = new Map();
export let _musicReqSeq = 1000;
export function incMusicReqSeq(): number {
  _musicReqSeq += 1;
  return _musicReqSeq;
}

// event taku (GameEventType flags)
export const EVENT_TAKU_PANEL_SLOTS = 3;
export const EVENT_TAKU_PANELS: Record<string, number> = {
  BlowAwaySanma: 1,
  FireReach2: 1,
  AotenjoEvent2: 1,
  ComebackTakuEvent: 1,
  KirisameTakuEvent: 1,
  ReversalTakuEvent: 1,
  MeldBonusTakuEvent2: 2,
  BombTakuEvent: 2,
  AllGreenTaku: 2,
  Competition6: 0,
  Competition7: 0,
  Competition8: 0,
};

export const EVENT_TAKU_SETS: Record<string, string[]> = {
  off: [],
  min: ["FireReach2", "ComebackTakuEvent", "KirisameTakuEvent"],
  all: [
    "BlowAwaySanma", "FireReach2", "Competition7", "Competition8",
    "AotenjoEvent2", "ComebackTakuEvent", "KirisameTakuEvent",
    "MeldBonusTakuEvent2", "Competition6", "ReversalTakuEvent",
    "BombTakuEvent", "AllGreenTaku",
  ],
};

export function eventTakuSetName(): string {
  let name = "min";
  try {
    // @ts-ignore
    const v = U.GetConfig("VFG_EVENT_TAKU");
    if (v) name = String(v).trim().toLowerCase();
    else {
      // @ts-ignore
      const ev = process.env.VFG_EVENT_TAKU;
      if (ev) name = ev.trim().toLowerCase();
    }
  } catch {
    try {
      // @ts-ignore
      const ev = process.env.VFG_EVENT_TAKU;
      if (ev) name = ev.trim().toLowerCase();
    } catch { }
  }
  if (!(name in EVENT_TAKU_SETS)) name = "min";
  return name;
}

export function eventTakuFlags(): string[] {
  return EVENT_TAKU_SETS[eventTakuSetName()] || [];
}

export const BASE_EVENTS: Array<[string, string]> = [
  ["PrivateMatchingDisplay", ""],
  ["PrivateMatchingEnable", ""],
  ["PrivateMatchingNotice", ""],
  ["SpiritGymBonusEvent", "OID=OID_DOJO_BONUS_3X"],
  ["ConstancyFireReach", ""],
  ["ConstancyFireReachAppearance", ""],
  ["ConstancyAccelDora", ""],
  ["ConstancyAccelDoraSchedule", ""],
  ["ConstancyMentanpin", ""],
  ["ConstancyMentanpinSchedule", ""],
  ["StickerEditNotice", ""],
  ["DecorationSticker", ""],
  ["ChaosUsable", ""],
  ["ClearAppearance", ""],
  ["IyoAppearance", ""],
  ["GrimAroeAppearance", ""],
  ["CocoaAppearance", ""],
  ["DiaAppearance", ""],
  ["DoubrielAppearance", ""],
  ["IppatsuAppearance", ""],
  ["ShiroeAppearance", ""],
  ["ShioriAppearance", ""],
  ["PineAppearance", ""],
  ["ZoudaiAppearance", ""],
  ["CinderellaMitsubaAppearance", ""],
  ["PremiumStartEnable", ""],
  ["RevengeContinueEnable", ""],
  ["EnableOdekake", ""],
  ["ItemGainLogEnable", ""],
  ["PrivateMatchingDisplay", ""],
  ["PrivateMatchingEnable", ""],
  ["FavoBonusEvent", ""],
  ["FanBonusEvent", ""],
  ["ReachSongVoiceGacha", ""],
];

export const ACTIVE_EVENTS: Array<[string, string]> = (() => {
  const flags = eventTakuFlags();
  const extra: Array<[string, string]> = flags.map(f => [f, ""]);
  return [...BASE_EVENTS, ...extra];
})();

export const EVENT_BEGIN = "2020/01/01 00:00:00";
export const EVENT_END = "2099/12/31 23:59:59";

export function eventsJson(): string {
  const rows = ACTIVE_EVENTS.map(([name, param]) => ({ name, active: true, begin: EVENT_BEGIN, end: EVENT_END, param }));
  return JSON.stringify({ list: rows });
}

export function proStatsJson(): string {
  return JSON.stringify({ now_pro_stats: false, ProStayDatas: [] });
}

// misc helpers
export function gameBaseUrl(info?: any): string {
  // dynamic host from request if available
  let host = HOST;
  let port = PORT;
  try {
    if (info && (info as any).host) host = String((info as any).host);
    else if (U && U.GetConfig) {
      const h = U.GetConfig("server_host");
      if (h) host = String(h);
    }
  } catch { }
  try {
    if (info && (info as any).port) port = Number((info as any).port);
    else if (CONFIG && CONFIG.port) port = Number(CONFIG.port);
    else if (U && U.GetConfig) {
      const p = U.GetConfig("port");
      if (p) port = Number(p);
    }
  } catch { }
  // Also try to infer from host header if info has it (fallback)
  try {
    if (info && (info as any).hostHeader) {
      const hh = String((info as any).hostHeader);
      if (hh.includes(':')) {
        const pp = hh.split(':').pop();
        if (pp && /^\d+$/.test(pp)) port = Number(pp);
      }
    }
  } catch { }
  return `http://${host}:${port}/aog`;
}

export function eamuseWrap(module: string, inner: string, status: string = "0"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<response><${module} status="${status}">${inner}</${module}></response>`;
}

// dojo constants (also exported for aog)
export const DOJO_SLOTS = 4;
export const DOJO_STOCK_MAX = 3;
export const DOJO_LESSON_SECONDS = 300;
