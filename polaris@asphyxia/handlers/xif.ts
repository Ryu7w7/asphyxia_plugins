// @ts-ignore
declare const K: any;
// @ts-ignore
declare const DB: any;
// @ts-ignore
declare const U: any;
// @ts-ignore
declare const R: any;
// @ts-ignore
declare const console: any;

import {
  X,
  jsonSafe,
  nowDateSpace,
  nowDateT,
  vlog,
  normalizeRefid,
  getProfileByRefid,
  getProfileByUsrId,
  ensureProfileByRefid,
  saveProfile,
  echoUsrName,
  GACHA_TX,
  gachaBegin,
  gachaPurge,
  getMusics,
  getGachas,
  alwaysOpenEvents,
  pickGachaItem,
  UNLOCK_MUSIC_IDS,
  isUnlockSongs,
  getShopGoods,
  getDemos,
} from "./utils";

// ---------------------------------------------------------------------------
// Helpers to build XRPC fragments with K.ITEM
// ---------------------------------------------------------------------------

// Always-on one-line diagnostics (visible without XIF_VERBOSE): login and
// save outcomes are the first thing to check when profiles misbehave.
function dlog(...args: any[]): void {
  try { console.log("[XIF]", ...args); } catch { }
}

function errObj(code: number, message: string): any {
  return {
    error: {
      code: K.ITEM("s32", code),
      message: K.ITEM("str", message),
    },
  };
}

function okErr(): any {
  return { error: { code: K.ITEM("s32", 0), message: K.ITEM("str", "") } };
}

// Full song unlock list: every chart of every song in the served catalog
// (plus event songs), unlock_type 0. Merged over the echo on every get so
// songs never gate behind missing unlock rows.
function fullUnlockMusic(): any[] {
  const ids = new Set<number>(UNLOCK_MUSIC_IDS);
  const diffs = new Map<number, number[]>();
  try {
    for (const m of getMusics()) {
      const mid = Number(m.music_id);
      ids.add(mid);
      diffs.set(mid, (m.charts || []).map(c => Number(c.difficulty)));
    }
  } catch { }
  const rows: any[] = [];
  for (const mid of ids) {
    const ds = diffs.get(mid) || [0, 1, 2, 3, 4];
    for (const diff of ds) {
      rows.push({
        music_id: K.ITEM("s32", mid),
        chart_difficulty_type: K.ITEM("s32", diff),
        unlock_type: K.ITEM("s32", 0),
      });
    }
  }
  return rows;
}

function truthyLeaf(v: any): boolean {
  try {
    if (v == null) return false;
    if (typeof v === "boolean") return v;
    const c = (v as any)["@content"];
    const s = String(Array.isArray(c) ? c[0] : c ?? v).trim().toLowerCase();
    return s === "1" || s === "true";
  } catch { return false; }
}

// Build the usr.get / end_gacha.player_data body from the stored echo.
// Mirrors C# PlayDataResponseBuilder.Build: ids + now_date + everything the
// client last saved. Unknown future fields survive automatically (echo).
function playerDataBody(profile: any): any {
  const data = (profile && (profile as any).data) || {};
  const out: any = {
    result: K.ITEM("s32", 0),
    now_date: K.ITEM("str", nowDateSpace()),
    usr_id: K.ITEM("s32", Number((profile as any).usr_id || 0)),
    crew_id: K.ITEM("str", String((profile as any).crew_id || "")),
  };
  for (const k of Object.keys(data)) {
    if (k === "result" || k === "now_date" || k === "usr_id" || k === "crew_id") continue;
    if (k === "@attr") continue;
    out[k] = (data as any)[k];
  }
  // Defaults the client always expects (C# GetPlayDataResponse newcomers)
  if (out.gacha_ticket_received == null) out.gacha_ticket_received = K.ITEM("s32", 0);
  if (out.tutorial_skipped == null) out.tutorial_skipped = K.ITEM("s32", 0);
  // Tutorial coherence (MonkeyBusiness): cleared OR ticket received means
  // the tutorial is done — the client needs is_tutorial_cleared=1 to proceed.
  try {
    const prof = out.usr_profile || {};
    const cleared = truthyLeaf(prof.is_tutorial_cleared);
    const ticket = X.numOf(out, "gacha_ticket_received") === 1;
    if ((cleared || ticket) && typeof prof === "object" && !Array.isArray(prof)) {
      prof.is_tutorial_cleared = K.ITEM("bool", true);
      out.usr_profile = prof;
    }
  } catch { }
  // The client saves max counters as usr_max_action_count but reads them
  // back as usr_action_count — mirror one into the other (C# keeps a single
  // ProfileActionCounts table for both).
  try {
    if (out.usr_action_count == null && (out as any).usr_max_action_count != null) {
      out.usr_action_count = (out as any).usr_max_action_count;
    }
  } catch { }
  // Write-only delta logs (C# SavePlayDataRequest-only fields): the client
  // never sends usr_item, only usr_item_change_log, so balances must be
  // applied server-side (see applyItemChangeLog). Echoing the raw logs back
  // would double-apply / confuse the client — drop them like Medusa, which
  // has no such fields on GetPlayDataResponse.
  try {
    delete (out as any).usr_item_change_log;
    delete (out as any).usr_action_count_change_log;
    delete (out as any).usr_max_action_count;
  } catch { }
  // Card-list filters: 0 means "show nothing" client-side (empty training /
  // replacement / material lists). MonkeyBusiness forces SHOW_ALL (all 25
  // bits) when unset — a fresh profile would otherwise hide its own units.
  try {
    const sort = out.usr_sort_setting;
    if (sort && typeof sort === "object" && !Array.isArray(sort)) {
      for (const f of ["character_training_list_filter", "character_replacement_list_filter", "character_material_list_filter"]) {
        if (X.numOf(sort, f) === 0) sort[f] = K.ITEM("s32", 33554431);
      }
    }
  } catch { }
  // Prologue completion (HomeSceneRoot.ReservePlayPrologue): the prologue
  // (story + name keyboard) repeats every boot until usr_count carries
  // "Tutorial.Prologue". Profiles stuck from the silent-save era have play
  // activity but never recorded it, so they loop forever. If this profile
  // has clearly played before yet lacks the key, serve it as seen — the
  // client merges it locally and carries it back on the next save.
  // Genuine first-timers (no scores/counters/EXP) are untouched.
  try {
    const playedBefore = ((profile as any).scores || []).length > 0
      || X.numOf(((data as any).usr_profile || {}), "exp") > 0
      || COUNT_FIELDS.some(f => X.numOf(((data as any).usr_play_info || {}), f) > 0);
    if (playedBefore) {
      const holder = (out as any).usr_count;
      const rows = readListRows(holder).rows;
      const has = rows.some((r: any) => X.strOf(r, "key") === "Tutorial.Prologue");
      if (!has) {
        const tpl = rows[0] || null;
        const keyLeaf = tpl ? keyLeafOf(tpl) : "key";
        const countLeaf = tpl ? countLeafOf(tpl) : "value";
        const row: any = {};
        row[keyLeaf] = K.ITEM("str", "Tutorial.Prologue");
        row[countLeaf] = K.ITEM("s32", 1);
        if (holder != null && typeof holder === "object" && !Array.isArray(holder)) {
          const wk = Object.keys(holder).find(k => k !== "@attr");
          if (wk) {
            const cur = (holder as any)[wk];
            (holder as any)[wk] = Array.isArray(cur) ? [...cur, row] : [cur, row].filter(Boolean);
            out.usr_count = holder;
          } else {
            out.usr_count = { count: [row] };
          }
        } else if (Array.isArray(holder)) {
          out.usr_count = [...holder, row];
        } else {
          out.usr_count = { count: [row] };
        }
        vlog(`[XIF] injected Tutorial.Prologue completion for refid=${(profile as any).refid}`);
      }
    }
  } catch { }
  if (isUnlockSongs()) {
    out.usr_unlock_music = { music: fullUnlockMusic() };
  }
  return out;
}

// ---------------------------------------------------------------------------
// usr.checkin / usr.checkout (C#: always status 0 — multi-cab guard TODO)
// ---------------------------------------------------------------------------

async function usrCheckin(info: any, data: any, send: any): Promise<void> {
  vlog(`[XIF] usr.checkin data_id=${X.strOf(data, "data_id")}`);
  await send.object({ "@attr": { status: 0 } });
}

async function usrCheckout(info: any, data: any, send: any): Promise<void> {
  await send.object({ "@attr": { status: 0 } });
}

// ---------------------------------------------------------------------------
// usr.get — C# UsrGetHandler:
//   no card/profile            -> result=1, crew="", usr_id=0
//   profile without usr_name   -> result=2, crew+usr_id (must sign_up/save)
//   else                       -> result=0 + full play data (echo)
// ---------------------------------------------------------------------------

async function usrGet(info: any, data: any, send: any): Promise<void> {
  const refId = normalizeRefid(X.strOf(data, "ref_id"));
  const dataId = normalizeRefid(X.strOf(data, "data_id"));
  const cardId = normalizeRefid(X.strOf(data, "card_id"));
  const want = refId || dataId || cardId;
  vlog(`[XIF] usr.get ref_id=${refId} data_id=${dataId} card_id=${cardId}`);

  let profile: any = null;
  for (const cand of [refId, dataId, cardId]) {
    if (!cand) continue;
    profile = await getProfileByRefid(cand);
    if (profile) break;
  }

  if (!profile) {
    dlog(`usr.get refs=${refId || "-"}/${dataId || "-"}/${cardId || "-"} -> result=1 (no profile)`);
    await send.object({
      result: K.ITEM("s32", 1),
      now_date: K.ITEM("str", nowDateSpace()),
      usr_id: K.ITEM("s32", 0),
      crew_id: K.ITEM("str", ""),
    });
    return;
  }

  if (!echoUsrName((profile as any).data)) {
    dlog(`usr.get refid=${(profile as any).refid} -> result=2 (no name yet) usr_id=${Number((profile as any).usr_id || 0)}`);
    await send.object({
      result: K.ITEM("s32", 2),
      now_date: K.ITEM("str", nowDateSpace()),
      usr_id: K.ITEM("s32", Number((profile as any).usr_id || 0)),
      crew_id: K.ITEM("str", String((profile as any).crew_id || "")),
    });
    return;
  }

  dlog(`usr.get refid=${(profile as any).refid} -> result=0 usr_id=${Number((profile as any).usr_id || 0)} fields=${Object.keys((profile as any).data || {}).length}`);
  if (healCardIndices(profile)) {
    try { await saveProfile((profile as any).refid, profile); } catch { }
    dlog(`usr.get refid=${(profile as any).refid} healed card indices`);
  }
  await send.object(playerDataBody(profile));
}

// ---------------------------------------------------------------------------
// usr.sign_up — C# UsrSignUpHandler: create Profile + sub-rows, return ids.
// Echo variant: create the profile shell (fresh crew/usr ids, empty data).
// Idempotent: signing up twice with the same ref_id returns the same ids.
// ---------------------------------------------------------------------------

async function usrSignUp(info: any, data: any, send: any): Promise<void> {
  const refId = normalizeRefid(X.strOf(data, "ref_id"));
  const dataId = normalizeRefid(X.strOf(data, "data_id"));
  const want = refId || dataId;
  vlog(`[XIF] usr.sign_up ref_id=${refId} data_id=${dataId}`);
  if (!want) {
    await send.object({ usr_id: K.ITEM("s32", 0), crew_id: K.ITEM("str", "") });
    return;
  }
  const profile = await ensureProfileByRefid(want);
  dlog(`usr.sign_up ref=${want} -> usr_id=${Number((profile as any).usr_id || 0)} crew=${String((profile as any).crew_id || "")}`);
  await send.object({
    usr_id: K.ITEM("s32", Number((profile as any).usr_id || 0)),
    crew_id: K.ITEM("str", String((profile as any).crew_id || "")),
  });
}

// ---------------------------------------------------------------------------
// usr.save — C# UsrSaveHandler: full-snapshot replace + delta changelogs.
// Echo variant: store the request body verbatim (minus routing ids) so every
// current AND future field round-trips. Item/action-count changelogs are
// applied by the client sending the resulting balances, which we keep as-is.
// score-effecting subset (usr_music_mission etc.) is preserved untouched.
// ---------------------------------------------------------------------------

const SAVE_SKIP_KEYS = new Set(["usr_id", "@attr"]);

// Play-count snapshot fields: the client sometimes sends stale/zero
// snapshots (retry after a failed save), so merge monotonically (MAX) like
// MonkeyBusiness instead of blindly overwriting.
const COUNT_FIELDS = [
  "beginner_play_count", "standard_play_count",
  "freetime4_play_count", "freetime6_play_count", "freetime8_play_count",
  "freetime12_play_count", "local_matching_play_count",
  "global_matching_play_count", "freetime_play_count",
  "freetime_play_total_time",
];

// mode_id -> snapshot counter (MonkeyBusiness mapping)
const MODE_COUNT_FIELD: Record<number, string> = {
  10: "standard_play_count",
  20: "freetime6_play_count",
  21: "freetime8_play_count",
  23: "freetime12_play_count",
  30: "local_matching_play_count",
  40: "global_matching_play_count",
};

function actionLogEntries(data: any): Array<{ key: string; change: number }> {
  const out: Array<{ key: string; change: number }> = [];
  try {
    const holder = (data as any).usr_action_count_change_log;
    if (holder == null) return out;
    const raw = typeof holder === "object" && !Array.isArray(holder) && (holder as any).action_log != null
      ? (holder as any).action_log
      : holder;
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const e of arr) {
      if (e == null || typeof e !== "object") continue;
      out.push({ key: X.strOf(e, "key"), change: X.numOf(e, "change_count") });
    }
  } catch { }
  return out;
}

function fullActionLogEntries(data: any): Array<{ uuid: string; key: string; change: number }> {
  const out: Array<{ uuid: string; key: string; change: number }> = [];
  try {
    const holder = (data as any).usr_action_count_change_log;
    if (holder == null) return out;
    const raw = typeof holder === "object" && !Array.isArray(holder) && (holder as any).action_log != null
      ? (holder as any).action_log
      : holder;
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const e of arr) {
      if (e == null || typeof e !== "object") continue;
      out.push({ uuid: X.strOf(e, "uuid"), key: X.strOf(e, "key"), change: X.numOf(e, "change_count") });
    }
  } catch { }
  return out;
}

function itemLogEntries(data: any): Array<{ uuid: string; item_id: string; change: number }> {
  const out: Array<{ uuid: string; item_id: string; change: number }> = [];
  try {
    const holder = (data as any).usr_item_change_log;
    if (holder == null) return out;
    const raw = typeof holder === "object" && !Array.isArray(holder) && (holder as any).item != null
      ? (holder as any).item
      : holder;
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const e of arr) {
      if (e == null || typeof e !== "object") continue;
      const chg = X.numOf(e, "change_count") || X.numOf(e, "count");
      out.push({ uuid: X.strOf(e, "uuid"), item_id: X.strOf(e, "item_id"), change: chg });
    }
  } catch { }
  return out;
}

// uuid sets live on the profile doc root (never echoed to the client).
function appliedSet(profile: any, field: string): Set<string> {
  try {
    const arr = (profile as any)[field];
    if (Array.isArray(arr)) return new Set(arr.map(String));
  } catch { }
  return new Set();
}
function storeAppliedSet(profile: any, field: string, set: Set<string>): void {
  try {
    const arr = Array.from(set);
    (profile as any)[field] = arr.slice(-3000);
  } catch { }
}

// Read a {wrapper: [...]} / bare-array / single list generically.
function readListRows(holder: any): { rows: any[]; wrap: string | null } {
  if (holder == null) return { rows: [], wrap: null };
  if (Array.isArray(holder)) return { rows: holder, wrap: null };
  if (typeof holder !== "object") return { rows: [], wrap: null };
  for (const k of Object.keys(holder)) {
    if (k === "@attr") continue;
    const v = (holder as any)[k];
    if (Array.isArray(v)) return { rows: v, wrap: k };
    if (v != null && typeof v === "object") return { rows: [v], wrap: k };
  }
  return { rows: [], wrap: null };
}

function keyLeafOf(row: any): string {
  for (const k of ["key", "data_key", "dataKey", "id", "item_id"]) {
    const s = X.strOf(row, k);
    if (s !== "") return k;
  }
  return "key";
}
function countLeafOf(row: any): string {
  for (const k of ["count", "value"]) {
    if (row && row[k] != null) return k;
  }
  return "count";
}

// Port of C# UsrSaveHandler.ApplyItemChangeLog: fold unseen
// usr_item_change_log deltas into the usr_item balances (income/expense
// tracked like Medusa). The client never sends usr_item itself, so without
// this coins and consumables never accumulate.
function applyItemChangeLog(profile: any, next: any): number {
  const entries = itemLogEntries(next);
  if (!entries.length) return 0;
  const seen = appliedSet(profile, "applied_item_uuids");
  const stored = readListRows(((profile as any).data || {}).usr_item);
  const byId = new Map<string, any>();
  for (const r of stored.rows) {
    const id = X.strOf(r, "item_id");
    if (id) byId.set(id, r);
  }
  // Overlay a client-sent full list if present (authoritative per item).
  const incoming = readListRows((next as any).usr_item);
  for (const r of incoming.rows) {
    const id = X.strOf(r, "item_id");
    if (id) byId.set(id, r);
  }
  let applied = 0;
  for (const e of entries) {
    if (!e.item_id || !e.change) continue;
    if (e.uuid && seen.has(e.uuid)) continue;
    if (e.uuid) seen.add(e.uuid);
    let row = byId.get(e.item_id);
    if (!row) {
      row = {
        item_id: K.ITEM("str", e.item_id),
        count: K.ITEM("s32", 0),
        income: K.ITEM("s32", 0),
        expense: K.ITEM("s32", 0),
      };
      byId.set(e.item_id, row);
    }
    const cur = X.numOf(row, "count");
    row.count = K.ITEM("s32", Math.max(0, cur + e.change));
    if (e.change > 0) row.income = K.ITEM("s32", X.numOf(row, "income") + e.change);
    else row.expense = K.ITEM("s32", X.numOf(row, "expense") - e.change);
    applied++;
  }
  storeAppliedSet(profile, "applied_item_uuids", seen);
  next.usr_item = { item: Array.from(byId.values()) };
  return applied;
}

// Port of ApplyActionCountChangeLog + ApplyMaxActionCount: fold unseen
// action deltas, then take the max with the incoming usr_max_action_count
// snapshot (retry-safe). Shape follows the incoming max list when present.
function applyActionChangeLog(profile: any, next: any): number {
  const entries = fullActionLogEntries(next);
  const maxRows = readListRows((next as any).usr_max_action_count);
  const storedRows = readListRows(((profile as any).data || {}).usr_action_count);
  const storedMaxRows = readListRows(((profile as any).data || {}).usr_max_action_count);
  if (!entries.length && !maxRows.rows.length && !storedRows.rows.length && !storedMaxRows.rows.length) return 0;
  const template = maxRows.rows[0] || storedRows.rows[0] || storedMaxRows.rows[0] || null;
  const keyLeaf = template ? keyLeafOf(template) : "key";
  const countLeaf = template ? countLeafOf(template) : "count";
  const keyType = keyLeaf === "item_id" ? "str" : "str";
  const counts = new Map<string, number>();
  const put = (rows: any[]) => {
    for (const r of rows) {
      const k = X.strOf(r, keyLeaf) || X.strOf(r, "key") || X.strOf(r, "data_key");
      if (k) counts.set(k, X.numOf(r, countLeaf));
    }
  };
  put(storedRows.rows);
  put(storedMaxRows.rows);
  // Incoming max snapshot wins upward (retry-safe).
  for (const r of maxRows.rows) {
    const k = X.strOf(r, keyLeaf) || X.strOf(r, "key") || X.strOf(r, "data_key");
    if (!k) continue;
    counts.set(k, Math.max(counts.get(k) || 0, X.numOf(r, countLeaf)));
  }
  const seen = appliedSet(profile, "applied_action_uuids");
  let applied = 0;
  for (const e of entries) {
    if (!e.key || !e.change) continue;
    if (e.uuid && seen.has(e.uuid)) continue;
    if (e.uuid) seen.add(e.uuid);
    counts.set(e.key, (counts.get(e.key) || 0) + e.change);
    applied++;
  }
  storeAppliedSet(profile, "applied_action_uuids", seen);
  const rows = Array.from(counts.entries()).map(([k, v]) => {
    const r: any = {};
    r[keyLeaf] = K.ITEM(keyType as any, k);
    r[countLeaf] = K.ITEM("s32", v);
    return r;
  });
  // Preserve the incoming wrapper shape when the client sent one.
  if (maxRows.wrap) {
    const holder: any = {};
    holder[maxRows.wrap] = rows;
    next.usr_max_action_count = holder;
    next.usr_action_count = holder;
  } else if (storedRows.wrap) {
    const holder: any = {};
    holder[storedRows.wrap] = rows;
    next.usr_action_count = holder;
  } else {
    next.usr_action_count = { action_count: rows };
  }
  return applied;
}

async function usrSave(info: any, data: any, send: any): Promise<void> {
  const usrId = X.numOf(data, "usr_id");
  vlog(`[XIF] usr.save usr_id=${usrId}`);
  let profile: any = null;
  if (usrId) profile = await getProfileByUsrId(usrId);
  if (!profile) {
    dlog(`usr.save usr_id=${usrId} keys=${Object.keys(data || {}).join(",") || "(empty)"} -> 145 (no profile)`);
    await send.object({ "@attr": { status: 145 }, now_date: K.ITEM("str", nowDateSpace()) });
    return;
  }
  // Start with a clone of the existing profile data. This is CRITICAL because
  // the client sends delta updates (e.g., omitting usr_item or usr_character_card).
  // Without this, any omitted top-level list is permanently deleted from the profile.
  const next: any = { ...((profile as any).data || {}) };
  
  // Drop write-only changelogs from the cloned base so we don't re-process
  // or accumulate old deltas if the client didn't send new ones.
  delete next.usr_item_change_log;
  delete next.usr_action_count_change_log;

  for (const k of Object.keys(data || {})) {
    if (SAVE_SKIP_KEYS.has(k)) continue;
    next[k] = (data as any)[k];
  }
  try {
    const up = (next as any).usr_profile;
    const upKeys = up && typeof up === "object" && !Array.isArray(up) ? Object.keys(up).join(",") : (Array.isArray(up) ? `array[${up.length}]` : typeof up);
    dlog(`usr.save profile keys=${upKeys} raw_name=${JSON.stringify((up || {}).usr_name || null).slice(0, 200)}`);
  } catch { }
  // Fold write-only changelogs into balances BEFORE storing (the client
  // never sends usr_item/usr_action_count snapshots — without this, coins
  // and counters from change logs are silently dropped).
  let appliedItems = 0;
  let appliedActions = 0;
  try { appliedItems = applyItemChangeLog(profile, next); } catch { }
  try { appliedActions = applyActionChangeLog(profile, next); } catch { }
  try { if (healCardIndicesIn(next)) vlog(`[XIF] usr.save healed card indices`); } catch { }
  // Monotonic counter merge over the previous echo
  try {
    const oldInfo = ((profile as any).data || {}).usr_play_info;
    const newInfo = next.usr_play_info;
    if (oldInfo && newInfo && typeof newInfo === "object" && !Array.isArray(newInfo)) {
      for (const f of COUNT_FIELDS) {
        const merged = Math.max(X.numOf(newInfo, f), X.numOf(oldInfo, f));
        if (merged !== X.numOf(newInfo, f)) newInfo[f] = K.ITEM("s32", merged);
      }
      // game_play_count delta from the action log applies to the mode the
      // client was playing (snapshot may still read 0 on retry).
      let delta = 0;
      for (const e of actionLogEntries(next)) {
        if (e.key === "game_play_count" && e.change > 0) delta += e.change;
      }
      if (delta > 0) {
        const mode = X.numOf(newInfo, "mode_id");
        const field = MODE_COUNT_FIELD[mode];
        if (field) {
          newInfo[field] = K.ITEM("s32", X.numOf(newInfo, field) + delta);
          if (mode === 20 || mode === 21 || mode === 23) {
            newInfo["freetime_play_count"] = K.ITEM("s32", X.numOf(newInfo, "freetime_play_count") + delta);
          }
        }
      }
    }
  } catch { }
  (profile as any).data = jsonSafe(next);
  await saveProfile((profile as any).refid, profile);
  const lottery = rollShopLottery();
  dlog(`usr.save usr_id=${usrId} fields=${Object.keys(next).length} +items=${appliedItems} +actions=${appliedActions} lotto=${lottery.map(w => `${w.event_id}:${w.goods_id}`).join(",") || "-"} -> ok`);
  await send.object({
    "@attr": { status: 0 },
    now_date: K.ITEM("str", nowDateSpace()),
    usr_goods_lottery: {
      lottery: lottery.map(w => ({
        goods_event_id: K.ITEM("s32", w.event_id),
        goods_id: K.ITEM("s32", w.goods_id),
      })),
    },
  });
}

// ---------------------------------------------------------------------------
// usr.save_musicscore — append play logs; C# returns status 145 when the log
// list is empty or the profile is missing.
// ---------------------------------------------------------------------------

async function usrSaveMusicscore(info: any, data: any, send: any): Promise<void> {
  const usrId = X.numOf(data, "usr_id");
  let logs: any[] = [];
  try {
    // Wire shape (Asphyxia convention): usr_music_play_log: { music: [...] }.
    // Accept bare arrays and single objects too (client version tolerance).
    const holder = (data as any).usr_music_play_log;
    const raw = holder != null && typeof holder === "object" && !Array.isArray(holder) && (holder as any).music != null
      ? (holder as any).music
      : holder;
    const arr = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    for (const e of arr) {
      if (e && typeof e === "object" && (e as any).music && (e as any).music_id == null) logs.push((e as any).music);
      else logs.push(e);
    }
  } catch { logs = []; }
  vlog(`[XIF] usr.save_musicscore usr_id=${usrId} logs=${logs.length}`);
  if (!logs.length) {
    dlog(`usr.save_musicscore usr_id=${usrId} -> 145 (empty)`);
    await send.object({ "@attr": { status: 145 }, now_date: K.ITEM("str", nowDateSpace()) });
    return;
  }
  const profile: any = usrId ? await getProfileByUsrId(usrId) : null;
  if (!profile) {
    dlog(`usr.save_musicscore usr_id=${usrId} logs=${logs.length} -> 145 (no profile)`);
    await send.object({ "@attr": { status: 145 }, now_date: K.ITEM("str", nowDateSpace()) });
    return;
  }
  if (!Array.isArray((profile as any).scores)) (profile as any).scores = [];
  // Store slim summaries (plain numbers): get_usr_music only needs these,
  // and the raw logs carry bulky inputs[]/cards[] per play. Plain numbers
  // also dodge the DB __-prefix rule entirely. Cap the journal so one doc
  // can't grow without bound (counts are derived from stored rows).
  for (const l of logs) {
    (profile as any).scores.push({
      music_id: X.numOf(l, "music_id"),
      chart_difficulty_type: X.numOf(l, "chart_difficulty_type"),
      achievement_rate: X.numOf(l, "achievement_rate"),
      score: X.numOf(l, "score"),
      score_rank: X.numOf(l, "score_rank"),
      combo: X.numOf(l, "combo"),
      combo_rank: X.numOf(l, "combo_rank"),
      clear_status: X.numOf(l, "clear_status"),
    });
  }
  if ((profile as any).scores.length > 3000) {
    (profile as any).scores.splice(0, (profile as any).scores.length - 3000);
  }
  await saveProfile((profile as any).refid, profile);
  dlog(`usr.save_musicscore usr_id=${usrId} logs=${logs.length} -> ok total=${(profile as any).scores.length}`);
  await send.object({ "@attr": { status: 0 }, now_date: K.ITEM("str", nowDateSpace()) });
}

// ---------------------------------------------------------------------------
// usr.get_usr_music — per-chart high scores, aggregated like C#
// GetUsrMusicHandler (max achievement/score/combo/rank, counts by
// clear_status thresholds). Field names match the decompiled client
// (highscore/maxcombo without underscores).
// ---------------------------------------------------------------------------

async function usrGetUsrMusic(info: any, data: any, send: any): Promise<void> {
  const usrId = X.numOf(data, "usr_id");
  vlog(`[XIF] usr.get_usr_music usr_id=${usrId}`);
  const profile: any = usrId ? await getProfileByUsrId(usrId) : null;
  const scores: any[] = (profile && Array.isArray((profile as any).scores) ? (profile as any).scores : []) || [];
  if (!scores.length) {
    await send.object({ "@attr": { status: 0 }, usr_music_highscore: {} });
    return;
  }
  const groups = new Map<string, any[]>();
  for (const s of scores) {
    const mid = X.numOf(s, "music_id");
    const diff = X.numOf(s, "chart_difficulty_type");
    const k = `${mid}:${diff}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  const rows: any[] = [];
  for (const [k, arr] of groups) {
    const [midS, diffS] = k.split(":");
    const maxNum = (key: string) => Math.max(...arr.map(e => X.numOf(e, key)));
    const playCount = arr.length;
    // Normalize clear_status: handle both compact scale (1/2/3/4) and x10
    // scale (10/20/30/40) that some client versions may send. Values >= 10
    // are floor-divided by 10 so thresholds are always in the 1-4 range.
    const normCs = (e: any) => { const v = X.numOf(e, "clear_status"); return v >= 10 ? Math.floor(v / 10) : v; };
    const clearCount = arr.filter(e => normCs(e) >= 2).length; // 2 = Clear (not failed)
    const fcCount    = arr.filter(e => normCs(e) >= 3).length; // 3 = Full Combo
    const pcCount    = arr.filter(e => normCs(e) >= 4).length; // 4 = Perfect
    rows.push({
      music_id: K.ITEM("s32", Number(midS)),
      chart_difficulty_type: K.ITEM("s32", Number(diffS)),
      achievement_rate: K.ITEM("s32", maxNum("achievement_rate")),
      highscore: K.ITEM("s32", maxNum("score")),
      score_rank: K.ITEM("s32", maxNum("score_rank")),
      maxcombo: K.ITEM("s32", maxNum("combo")),
      combo_rank: K.ITEM("s32", maxNum("combo_rank")),
      clear_status: K.ITEM("s32", maxNum("clear_status")),
      play_count: K.ITEM("s32", playCount),
      clear_count: K.ITEM("s32", clearCount),
      perfect_clear_count: K.ITEM("s32", pcCount),
      full_combo_count: K.ITEM("s32", fcCount),
    });
  }
  await send.object({ "@attr": { status: 0 }, usr_music_highscore: { music: rows } });
}

// ---------------------------------------------------------------------------
// mst.get_common — C# GetCommonMstHandler: song catalog (music_id + per-chart
// difficulty/limitation/open-close), demo playlist, always-open events.
// limitation_type is forced Open(2) like C#; dates come from seeds.
// ---------------------------------------------------------------------------

async function mstGetCommon(info: any, data: any, send: any): Promise<void> {
  const musics = getMusics();
  const musicRows = musics.map(m => ({
    music_id: K.ITEM("s32", Number(m.music_id)),
    charts: {
      chart: (m.charts || []).map(c => ({
        chart_difficulty_type: K.ITEM("s32", Number(c.difficulty)),
        limitation_type: K.ITEM("s32", 2),
        open_at: K.ITEM("str", c.open_at || "2020-01-01T00:00:00"),
        close_at: K.ITEM("str", c.close_at || "2099-01-01T00:00:00"),
      })),
    },
  }));
  const events = alwaysOpenEvents().map(e => ({
    id: K.ITEM("str", e.id),
    param: K.ITEM("str", e.param),
    open_at: K.ITEM("str", "2020-01-01T00:00:00"),
    close_at: K.ITEM("str", "2099-01-01T00:00:00"),
  }));
  // Continue-lottery goods events (server-rolled in usr.save; the client
  // matches them by id and shows the entry banners while stock lasts).
  const goodsEvents = getShopGoods().map(g => ({
    goods_event_id: K.ITEM("s32", Number(g.id)),
    open_at: K.ITEM("str", g.open_at || "2024-01-01T00:00:00"),
    close_at: K.ITEM("str", g.close_at || "2099-12-31T00:00:00"),
    items: {
      item: (g.goods || []).map(it => ({
        goods_id: K.ITEM("s32", Number(it.id)),
        weight: K.ITEM("s32", Number(it.weight ?? 1)),
        name: K.ITEM("str", it.name || ""),
        stock: K.ITEM("s32", Number(it.stock ?? 0)),
      })),
    },
  }));
  vlog(`[XIF] mst.get_common musics=${musicRows.length} events=${events.length} goods=${goodsEvents.length}`);
  await send.object({
    "@attr": { status: 0 },
    now_date: K.ITEM("str", nowDateT()),
    mst_music: { music: musicRows },
    mst_demo: {
      demo_item: getDemos().map(d => ({
        demo_type: K.ITEM("s32", Number(d.demo_type)),
        path: K.ITEM("str", d.path),
      })),
    },
    mst_event: { event_item: events },
    mst_shop_goods_event: { event: goodsEvents },
    mst_patch: { version: K.ITEM("s32", 0), patch: K.ITEM("str", "") },
    mst_official_accounts: {},
  });
}

// Weighted roll of the Continue-lottery winners, one goods per served
// event (client checks (event 1, goods 1) and (event 2, goods 1) to show
// the campaign views). Stock is display-only; weights decide.
function rollShopLottery(): Array<{ event_id: number; goods_id: number }> {
  const wins: Array<{ event_id: number; goods_id: number }> = [];
  try {
    for (const g of getShopGoods()) {
      const pool = (g.goods || []).filter(it => Number(it.stock ?? 0) > 0);
      if (!pool.length) continue;
      const total = pool.reduce((a, it) => a + Math.max(0, Number(it.weight ?? 1)), 0) || 1;
      let roll = Math.random() * total;
      let pick = pool[0];
      for (const it of pool) {
        roll -= Math.max(0, Number(it.weight ?? 1));
        if (roll < 0) { pick = it; break; }
      }
      wins.push({ event_id: Number(g.id), goods_id: Number(pick.id) });
    }
  } catch { }
  return wins;
}

// ---------------------------------------------------------------------------
// gacha.get_gacha_info — catalog from data/gacha.json (C# reads
// StaticGachaEventData + probabilities + drawable items; always-open).
// ---------------------------------------------------------------------------

async function gachaGetInfo(info: any, data: any, send: any): Promise<void> {
  const seeds = getGachas();
  const rows = seeds.map(g => ({
    // NOTE: gacha_id is XrpcInt on the wire (client parses it as int; a str
    // node NREs downstream — seen live as "String reference not set").
    gacha_id: K.ITEM("s32", Number(g.id) || 0),
    name: K.ITEM("str", g.name || ""),
    payment_type: K.ITEM("s32", g.payment_type ?? 14),
    prob_weight_r: K.ITEM("s32", g.w_r ?? 70),
    prob_weight_sr: K.ITEM("s32", g.w_sr ?? 25),
    prob_weight_ssr: K.ITEM("s32", g.w_ssr ?? 5),
    prob_weight_pickup: K.ITEM("s32", g.w_pickup ?? 10),
    guarantee_serial_limit: K.ITEM("s32", 0),
    gacha_consume_item_id: K.ITEM("str", g.consume_item_id || ""),
    gacha_consume_item_count: K.ITEM("s32", g.consume_item_count ?? 0),
    open_at: K.ITEM("str", g.open_at || "2024-01-01 00:00:00"),
    close_at: K.ITEM("str", g.close_at || "2099-12-31 23:59:59"),
    start_softcode: K.ITEM("str", ""),
    end_softcode: K.ITEM("str", ""),
    drawable_item_type: K.ITEM("s32", 0),
    items: {
      item: (g.items || []).map(it => ({
        item_id: K.ITEM("str", String(it.item_id)),
        rarity_type: K.ITEM("s32", Number(it.rarity)),
        is_pickup: K.ITEM("s32", it.pickup ? 1 : 0),
      })),
    },
  }));
  vlog(`[XIF] gacha.get_gacha_info gachas=${rows.length}`);
  await send.object({ "@attr": { status: 0 }, gacha_list: { gacha: rows } });
}

// ---------------------------------------------------------------------------
// gacha.begin_gacha — open a transaction keyed by sequence_id (C# echoes it
// back as transaction_id).
// ---------------------------------------------------------------------------

async function gachaBeginH(info: any, data: any, send: any): Promise<void> {
  gachaPurge();
  const seqId = X.strOf(data, "sequence_id") || `tx-${Date.now()}`;
  let usrId = 0;
  try {
    const pd = (data as any).player_data;
    usrId = X.numOf(pd || {}, "usr_id");
  } catch { usrId = 0; }
  vlog(`[XIF] gacha.begin_gacha seq=${seqId} usr_id=${usrId}`);
  gachaBegin(seqId, usrId);
  dlog(`gacha.begin_gacha seq=${seqId} usr_id=${usrId} -> ok`);
  await send.object({
    now_date: K.ITEM("str", nowDateT()),
    transaction_id: K.ITEM("str", seqId),
    ...okErr(),
  });
}

// ---------------------------------------------------------------------------
// gacha.draw_gacha — weighted rolls stored on the transaction (C#
// GachaService.DrawGacha). Empty body + error.code=0 == success (C# returns
// an empty DrawGachaResponse on success, error object otherwise).
// ---------------------------------------------------------------------------

async function gachaDraw(info: any, data: any, send: any): Promise<void> {
  gachaPurge();
  const txId = X.strOf(data, "transaction_id");
  const usrId = X.numOf(data, "usr_id");
  const gachaId = X.strOf(data, "gacha_id") || String(X.numOf(data, "gacha_id"));
  const drawCount = Math.max(1, Math.min(20, X.numOf(data, "draw_count") || 1));
  const payMethod = X.numOf(data, "payment_method");
  vlog(`[XIF] gacha.draw_gacha tx=${txId} usr=${usrId} gacha=${gachaId} x${drawCount}`);
  const tx = GACHA_TX.get(txId);
  if (!tx || tx.gacha_id != null) {
    dlog(`gacha.draw_gacha tx=${txId} -> 145 (already drawn / unknown tx)`);
    await send.object(errObj(145, "Gacha already drawn."));
    return;
  }
  if (tx.usr_id && usrId && tx.usr_id !== usrId) {
    dlog(`gacha.draw_gacha tx=${txId} usr=${usrId} -> 145 (tx owned by ${tx.usr_id})`);
    await send.object(errObj(145, "Transaction not found or not drawn."));
    return;
  }
  const seed = getGachas().find(g => String(g.id) === String(gachaId));
  if (!seed) {
    dlog(`gacha.draw_gacha gacha=${gachaId} -> 145 (unknown gacha)`);
    await send.object(errObj(145, "No gacha events found."));
    return;
  }
  if (!(seed.items || []).length) {
    dlog(`gacha.draw_gacha gacha=${gachaId} -> 145 (no drawable items)`);
    await send.object(errObj(145, "No gacha probability found."));
    return;
  }
  tx.gacha_id = Number(gachaId) || 0;
  if (String(gachaId) !== String(tx.gacha_id)) tx.gacha_id = 0;
  (tx as any).gacha_key = String(gachaId);
  tx.draw_count = drawCount;
  tx.payment_method = payMethod;
  tx.drawn = [];
  for (let i = 0; i < drawCount; i++) {
    const pick = pickGachaItem(seed);
    if (pick) tx.drawn.push({ item_id: pick.item_id, count: 1, rarity: pick.rarity });
  }
  if (!tx.drawn.length) {
    dlog(`gacha.draw_gacha tx=${txId} -> 145 (no items rolled)`);
    await send.object(errObj(145, "No drawn items found for transaction."));
    return;
  }
  dlog(`gacha.draw_gacha tx=${txId} gacha=${gachaId} x${drawCount} -> ok [${tx.drawn.map(d => d.item_id).join(",")}]`);
  await send.object(okErr());
}

// ---------------------------------------------------------------------------
// gacha.end_gacha — settle the transaction: grant drawn items into the echo
// profile (usr_item list, creating it if absent) and return the drawn lists
// + refreshed player_data (same shape as usr.get — C# PlayDataResponseBuilder).
// ---------------------------------------------------------------------------

function ensureUsrItemList(data: any): any[] {
  // echo data may hold usr_item as { item: [...] } or plain array
  let cur = (data as any).usr_item;
  if (cur == null) {
    (data as any).usr_item = { item: [] };
    return (data as any).usr_item.item;
  }
  if (Array.isArray(cur)) return cur;
  if (typeof cur === "object" && Array.isArray((cur as any).item)) return (cur as any).item;
  if (typeof cur === "object") {
    (cur as any).item = [];
    return (cur as any).item;
  }
  (data as any).usr_item = { item: [] };
  return (data as any).usr_item.item;
}

// Character cards live in usr_character_card/card[] (NOT usr_item) —
// Medusa splits them the same way (EndGachaHandler). Shape matches the
// client UsrCharacterCard (index/item_id/counts/exps/skills/fav/source/
// deleted/created_at); units are selectable by their index.
function ensureCharCardList(data: any): any[] {
  let cur = (data as any).usr_character_card;
  if (cur == null) {
    (data as any).usr_character_card = { card: [] };
    return (data as any).usr_character_card.card;
  }
  if (Array.isArray(cur)) return cur;
  if (typeof cur === "object" && Array.isArray((cur as any).card)) return (cur as any).card;
  if (typeof cur === "object") {
    (cur as any).card = [];
    return (cur as any).card;
  }
  (data as any).usr_character_card = { card: [] };
  return (data as any).usr_character_card.card;
}

function newCardGuid(): string {
  // MUST be a GUID string: the client runs new Guid(card.Index) while
  // applying player_data — sequential "1","2",... throw FormatException
  // and surface as gacha error 302 (PlayerDataFetchCatchException).
  // (Medusa uses Guid.NewGuid().ToString() for the same reason.)
  const hex = "0123456789abcdef";
  const seg = (n: number) => Array.from({ length: n }, () => hex[Math.floor(Math.random() * 16)]).join("");
  return `${seg(8)}-${seg(4)}-4${seg(3)}-${["8", "9", "a", "b"][Math.floor(Math.random() * 4)]}${seg(3)}-${seg(12)}`;
}

function nextCardIndex(profile: any): string {
  void profile;
  return newCardGuid();
}

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// One-time heal for cards granted with non-GUID indices (they crash the
// client's player_data apply with error 302). Rewrites bad indices AND the
// deck slots referencing them, so decks survive. Operates on a data
// container (incoming save body or stored echo). Returns true if changed.
function healCardIndicesIn(data: any): boolean {
  let changed = false;
  try {
    if (!data || typeof data !== "object") return false;
    const holder = (data as any).usr_character_card;
    if (holder == null) return false;
    const list = ensureCharCardList(data);
    const remap = new Map<string, string>();
    for (const c of list) {
      const idx = X.strOf(c, "index");
      if (idx && !GUID_RE.test(idx)) {
        const nu = newCardGuid();
        remap.set(idx, nu);
        c.index = K.ITEM("str", nu);
        changed = true;
      }
    }
    if (changed && remap.size) {
      const decks = readListRows((data as any).usr_deck).rows;
      for (const d of decks) {
        const inner = (d && (d as any).deck) || d;
        if (!inner || typeof inner !== "object") continue;
        for (const f of ["contenter_index", "supportsnap1_index", "supportsnap2_index", "supportsnap3_index", "supportsnap4_index"]) {
          const v = X.strOf(inner, f);
          if (v && remap.has(v)) inner[f] = K.ITEM("str", remap.get(v));
        }
      }
    }
  } catch { }
  return changed;
}

function healCardIndices(profile: any): boolean {
  try {
    return healCardIndicesIn((profile as any).data || {});
  } catch { return false; }
}

function isCharacterCardItem(itemId: string): boolean {
  return itemId === "chara_card" || itemId.startsWith("chara_card.");
}

async function gachaEnd(info: any, data: any, send: any): Promise<void> {
  gachaPurge();
  const txId = X.strOf(data, "transaction_id");
  const usrId = X.numOf(data, "usr_id");
  vlog(`[XIF] gacha.end_gacha tx=${txId} usr=${usrId}`);
  const tx = GACHA_TX.get(txId);
  const profile: any = usrId ? await getProfileByUsrId(usrId) : null;
  if (!profile || !tx || (tx.usr_id && tx.usr_id !== usrId) || !(tx.drawn || []).length) {
    dlog(`gacha.end_gacha tx=${txId} usr=${usrId} -> 145 (profile=${profile ? "ok" : "null"} tx=${tx ? "ok" : "null"} drawn=${(tx && tx.drawn.length) || 0})`);
    await send.object({
      gacha_result: {
        items: { item: [] },
        item_counts: { count: [] },
        item_params: { param: [] },
        ...errObj(145, "Transaction not found or not drawn."),
      },
    });
    return;
  }
  // grant into echo: character cards go to usr_character_card (selectable
  // units), everything else lands in usr_item keyed by item_id
  try {
    if (!(profile as any).data) (profile as any).data = {};
    healCardIndices(profile);
    const list = ensureUsrItemList((profile as any).data);
    const cards = ensureCharCardList((profile as any).data);
    // Ticket payment (GachaPaymentMethod.Ticket = 1): deduct use_items first
    // (C# EndGachaHandler; code 1 = balance too low). Other methods are
    // free, like the mfg economy.
    if (Number((tx as any).payment_method) === 1) {
      const holder = (data as any).use_items;
      const raw = holder != null && typeof holder === "object" && !Array.isArray(holder) && (holder as any).item != null
        ? (holder as any).item : holder;
      const uses = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
      for (const u of uses) {
        if (u == null || typeof u !== "object") continue;
        const iid = X.strOf(u, "item_id");
        const cnt = X.numOf(u, "count");
        if (!iid || !(cnt > 0)) continue;
        const found = list.find((e: any) => X.strOf(e, "item_id") === iid);
        const have = found ? X.numOf(found, "count") : 0;
        if (have < cnt) {
          await send.object({
            gacha_result: {
              items: { item: [] },
              item_counts: { count: [] },
              item_params: { param: [] },
              ...errObj(1, "Item balance too low."),
            },
          });
          return;
        }
      }
      for (const u of uses) {
        if (u == null || typeof u !== "object") continue;
        const iid = X.strOf(u, "item_id");
        const cnt = X.numOf(u, "count");
        if (!iid || !(cnt > 0)) continue;
        const found = list.find((e: any) => X.strOf(e, "item_id") === iid);
        if (found) {
          found.count = K.ITEM("s32", X.numOf(found, "count") - cnt);
          found.expense = K.ITEM("s32", X.numOf(found, "expense") + cnt);
        }
      }
    }
    for (const d of tx.drawn) {
      if (isCharacterCardItem(d.item_id)) {
        cards.push({
          index: K.ITEM("str", nextCardIndex(profile)),
          item_id: K.ITEM("str", d.item_id),
          card_limit_over_count: K.ITEM("s32", 0),
          character_card_exp: K.ITEM("s32", 0),
          character_card_skill_exp: K.ITEM("s32", 0),
          additional_skills: {},
          is_favorite: K.ITEM("bool", false),
          source: K.ITEM("s32", 0),
          deleted: K.ITEM("bool", false),
          created_at: K.ITEM("str", nowDateSpace()),
        });
        continue;
      }
      const found = list.find((e: any) => X.strOf(e, "item_id") === d.item_id);
      if (found) {
        // usr_item/item shape per client UsrItem: item_id, count, income, expense
        const cur = X.numOf(found, "count");
        const inc = X.numOf(found, "income");
        found.count = K.ITEM("s32", cur + d.count);
        found.income = K.ITEM("s32", inc + d.count);
        if (found.expense == null) found.expense = K.ITEM("s32", 0);
      } else {
        list.push({
          item_id: K.ITEM("str", d.item_id),
          count: K.ITEM("s32", d.count),
          income: K.ITEM("s32", d.count),
          expense: K.ITEM("s32", 0),
        });
      }
    }
    await saveProfile((profile as any).refid, profile);
  } catch (e) { try { console.error(`[XIF] gacha grant failed: ${e}`); } catch {} }
  GACHA_TX.delete(txId);
  const nCards = tx.drawn.filter(d => isCharacterCardItem(d.item_id)).length;
  dlog(`gacha.end_gacha tx=${txId} usr=${usrId} -> ok cards=${nCards} items=${tx.drawn.length - nCards}`);
  // Exact C# EndGachaResponse shape: gacha_result holds FLAT lists
  // (items/item[] = bare item_id strings, item_counts/count[] = ints,
  // item_params/param[] = rarity strings) plus the error object, and the
  // full player_data. Anything richer breaks the client's deserializer
  // (and a bad player_data surfaces as gacha error 302).
  await send.object({
    gacha_result: {
      items: { item: tx.drawn.map(d => K.ITEM("str", d.item_id)) },
      item_counts: { count: tx.drawn.map(d => K.ITEM("s32", Number(d.count) || 1)) },
      item_params: { param: tx.drawn.map(d => K.ITEM("str", String(d.rarity ?? "1"))) },
      ...okErr(),
    },
    player_data: playerDataBody(profile),
  });
}

// ---------------------------------------------------------------------------
// pcb.save — C#: status 0 + now_date
// ---------------------------------------------------------------------------

async function pcbSave(info: any, data: any, send: any): Promise<void> {
  await send.object({
    "@attr": { status: 0 },
    now_date: K.ITEM("str", nowDateSpace()),
  });
}

function xroute(method: string, handler: (info: any, data: any, send: any) => Promise<any>): void {
  const wrapped = async (info: any, data: any, send: any) => {
    const t0 = Date.now();
    try { vlog(`[XIF] XRPC ${method} model=${info?.model || ""}`); } catch { }
    try {
      await handler(info, data, send);
    } catch (e) {
      try { console.error(`[XIF] XRPC ${method} handler threw: ${e}`); } catch { }
      throw e;
    } finally {
      try { vlog(`[XIF] XRPC ${method} done ${Date.now() - t0}ms`); } catch { }
    }
  };
  R.Route(method, wrapped);
}

export function registerXifRoutes(): void {
  xroute("usr.checkin", usrCheckin);
  xroute("usr.checkout", usrCheckout);
  xroute("usr.get", usrGet);
  xroute("usr.sign_up", usrSignUp);
  xroute("usr.save", usrSave);
  xroute("usr.save_musicscore", usrSaveMusicscore);
  xroute("usr.get_usr_music", usrGetUsrMusic);
  xroute("mst.get_common", mstGetCommon);
  xroute("gacha.begin_gacha", gachaBeginH);
  xroute("gacha.draw_gacha", gachaDraw);
  xroute("gacha.end_gacha", gachaEnd);
  xroute("gacha.get_gacha_info", gachaGetInfo);
  xroute("pcb.save", pcbSave);
}
