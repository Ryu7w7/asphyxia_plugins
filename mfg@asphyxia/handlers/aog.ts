// @ts-ignore
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

import * as mahjong from "../mahjong";
import { Table } from "../taikyoku";
import {
  xml_escape,
  kitem,
  serv_st_ok,
  xml_response,
  formGet,
  parseMust,
  mustInt,
  nowUnix,
  playerIdFromRefid,
  ensureProfile,
  getProfileBySession,
  getProfileByPlayerId,
  saveProfile,
  saveState,
  MATCHES,
  TABLES,
  MATCH_LOBBY,
  PLAYER_SEAT,
  SHARED_TABLES,
  nextTid,
  STAMPS,
  _stampSeq,
  incStampSeq,
  PASELI_SESSIONS,
  stateB64,
  infoData,
  eventsJson,
  proStatsJson,
  EVENT_BEGIN,
  EVENT_END,
  PORT,
  HOST,
  _gachaInfoXml,
  buildGachaInfoXml,
  gachaSeries,
  _gachaPool,
  MUSIC_GACHA_POOL,
  MUSIC_GACHA_RESERVES,
  incMusicReqSeq,
  DOJO_SLOTS,
  DOJO_STOCK_MAX,
  DOJO_LESSON_SECONDS,
  gameBaseUrl,
} from "./utils";

// ---------------------------------------------------------------------------
// GMODE constants (port of server.py)
// ---------------------------------------------------------------------------
export const GMODE_TAKU: Record<number, number> = {
  1: 0, 2: 1, 3: 2, 4: 3,
  5: 0, 6: 0, 7: 2, 8: 0, 9: 0, 10: 2, 11: 0, 12: 2, 13: 0, 14: 2,
  15: 0, 16: 0, 17: 2, 18: 2, 19: 2, 20: 0, 21: 2, 22: 0, 23: 2,
};
export const GMODE_SEATS: Record<number, number> = (() => {
  const m: Record<number, number> = {};
  for (const g of Object.keys(GMODE_TAKU) as any) {
    const gi = Number(g);
    const taku = GMODE_TAKU[gi];
    // @ts-ignore - mahjong.SEATS_OF
    m[gi] = (mahjong as any).SEATS_OF[taku];
  }
  return m;
})();
export const GMODE_TENBO: Record<number, number> = (() => {
  const m: Record<number, number> = {};
  for (const g of Object.keys(GMODE_TAKU) as any) {
    const gi = Number(g);
    const taku = GMODE_TAKU[gi];
    // @ts-ignore
    m[gi] = (mahjong as any).START_SCORE[taku];
  }
  return m;
})();
export const GAME_MODES = Object.keys(GMODE_TAKU).map(n => Number(n)).sort((a, b) => a - b);

// ---------------------------------------------------------------------------
// helpers for matching
// ---------------------------------------------------------------------------
function matchingPlayerHuman(index: number, zaseki: number, profile: any): string {
  const states: string[] = [];
  for (const kind of ["player_game", "customize_item"]) {
    const b64 = stateB64(profile, kind);
    if (b64) states.push(`<state kind="${xml_escape(kind)}"><data>${xml_escape(b64)}</data></state>`);
  }
  let inner = `<zaseki>${zaseki}</zaseki><cpu_level>0</cpu_level>`;
  if (states.length) inner += "<client_states>" + states.join("") + "</client_states>";
  return `<player_${index} ptype="1">${inner}</player_${index}>`;
}

function matchingPlayerCpu(index: number, zaseki: number, chara1based: number, level: number = 1): string {
  const oid = `OID_CHARACTER_${chara1based}`;
  return `<player_${index} ptype="3"><cpu_level>${level}</cpu_level><zaseki>${zaseki}</zaseki><cpu_name>${xml_escape(oid)}</cpu_name></player_${index}>`;
}

function mgresultXml(table: Table | null | undefined, match: any): string {
  const gmode = Number((match || {}).gmode || 1);
  const parts: string[] = [
    `<gmode>${gmode}</gmode>`,
    "<taku_class>1</taku_class>",
    "<continue_state>0</continue_state>",
    "<continue_fee>0</continue_fee>",
  ];
  let rows: Array<[number, number, number]>;
  if (table) {
    rows = (table as any).result_rows();
  } else {
    const seats = GMODE_SEATS[gmode] || 4;
    const score = GMODE_TENBO[gmode] || 25000;
    rows = Array.from({ length: seats }, (_, i) => [i, score, 0] as [number, number, number]);
  }
  for (let i = 0; i < rows.length; i++) {
    const [rank, score, uma] = rows[i];
    parts.push(`<player_${i}><rank>${rank}</rank><score>${score}</score><uma>${uma}</uma></player_${i}>`);
  }
  return "<mgresult>" + parts.join("") + "</mgresult>";
}

function matchingXml(seats: number, myPindex: number, players: Array<{ pcuid: string; mid: number; name: string; profile: any }>, isMatched: boolean): string {
  const pnum = players.length;
  const cpu_n = Math.max(0, seats - pnum);
  let used = 1;
  const myProfile = players[myPindex]?.profile || {};
  try {
    const pg = JSON.parse(myProfile.states?.player_game || "{}");
    used = Number(pg.SelectChara || 0) + 1;
  } catch { used = 1; }
  
  const playersXml: string[] = [];
  const epdataXml: string[] = [];
  
  for (let i = 0; i < (isMatched ? seats : pnum); i++) {
    const p = players[i];
    if (p) {
      if (isMatched) playersXml.push(matchingPlayerHuman(i, i, p.profile));
      epdataXml.push(`<epdata_${i}><name>${xml_escape(p.name)}</name><mid>${p.mid}</mid></epdata_${i}>`);
    } else if (isMatched) {
      let cpuChara = used + i + 1;
      if (cpuChara > 19) cpuChara = (cpuChara % 19) || 1;
      if (cpuChara === used) cpuChara = (cpuChara % 19) + 1;
      playersXml.push(matchingPlayerCpu(i, i, cpuChara, 1));
    }
  }
  
  const mendTag = isMatched ? `<mend>${playersXml.join("")}</mend>` : "";
  const epdata = epdataXml.join("");
  return (
    "<mwait>" +
    `<status>${isMatched ? 1 : 0}</status>` +
    `<pnum>${pnum}</pnum>` +
    `<cpu_num>${isMatched ? cpu_n : 0}</cpu_num>` +
    `<pindex>${myPindex}</pindex>` +
    `${epdata}` +
    `${mendTag}` +
    "</mwait>"
  );
}

function ensureSharedTable(tid: number, taku: number): Table {
  let table = SHARED_TABLES.get(tid) as Table | undefined;
  if (!table) {
    table = new Table(taku, 0); // 0 is just for local masking, our modified taikyoku ignores it for on_command
    (table as any).start_kyoku();
    SHARED_TABLES.set(tid, table);
  }
  return table;
}

// ---------------------------------------------------------------------------
// stamps
// ---------------------------------------------------------------------------
function stampPost(tid: number, mid: number, pindex: number, name: string, contents: string, param: string): void {
  if (!contents) return;
  const idx = incStampSeq();
  const room = STAMPS.get(tid) || [];
  room.push({
    idx,
    mid: Number(mid || 0),
    pindex: Number(pindex || 0),
    time: Date.now(),
    name: name || "",
    contents,
    param: param || "",
  });
  // keep last 40
  if (room.length > 40) room.splice(0, room.length - 40);
  STAMPS.set(tid, room);
}

function stampXml(tag: string, tid: number, since: number = 0): string {
  const room = STAMPS.get(tid) || [];
  const rows = room.filter(e => e.idx > since);
  if (!rows.length) return `<${tag}></${tag}>`;
  const body = rows.map(e =>
    `<d idx="${e.idx}" mid="${e.mid}" pindex="${e.pindex}" time="${e.time}"><name>${xml_escape(e.name)}</name><contents>${xml_escape(e.contents)}</contents><param>${xml_escape(e.param)}</param></d>`
  ).join("");
  return `<${tag}>${body}</${tag}>`;
}

const CPU_STAMP_REPLIES = ["TableSticker001", "TableSticker002", "TableSticker003", "TableSticker004"];
function seatsForTid(tid: number): number {
  const table = SHARED_TABLES.get(tid);
  if (table) return table.seats;
  for (const m of PLAYER_SEAT.values()) if (Number(m.tid || 0) === Number(tid)) return 4;
  return 4;
}
function maybeCpuStamp(tid: number, humanPindex: number): void {
  if (Math.random() > 0.55) return;
  const seats = seatsForTid(tid);
  if (seats < 2) return;
  const seat = (humanPindex + Math.floor(Math.random() * (seats - 1)) + 1) % seats;
  const pick = CPU_STAMP_REPLIES[Math.floor(Math.random() * CPU_STAMP_REPLIES.length)];
  stampPost(tid, 0, seat, "CPU", pick, "");
}

// ---------------------------------------------------------------------------
// dojo helpers
// ---------------------------------------------------------------------------
function dojoState(profile: any): any[] {
  if (!profile.dojo) profile.dojo = [];
  const slots = profile.dojo as any[];
  while (slots.length < DOJO_SLOTS) slots.push({ available: false, chara: "", start: 0, next: 0, stock: 0 });
  return slots;
}
function dojoRefresh(slot: any): void {
  if (!slot.available) return;
  const now = nowUnix();
  let nxt = Number(slot.next || 0);
  while (slot.stock < DOJO_STOCK_MAX && nxt && now >= nxt) {
    slot.stock += 1;
    nxt += DOJO_LESSON_SECONDS;
  }
  slot.next = nxt;
}
function dojoSlotXml(idx: number, slot: any): string {
  if (!slot.available) return `<slot idx="${idx}"><available>0</available></slot>`;
  const has_next = slot.stock < DOJO_STOCK_MAX ? 1 : 0;
  return `<slot idx="${idx}"><available>1</available><character_obj>${xml_escape(slot.chara || "OID_CHARACTER_1")}</character_obj><start_time>${Number(slot.start || nowUnix())}</start_time><next_time>${Number(slot.next || nowUnix())}</next_time><has_next>${has_next}</has_next><reserve_souls>${Number(slot.stock || 0)}</reserve_souls><all_souls>${DOJO_STOCK_MAX}</all_souls></slot>`;
}
async function dojoProfile(form: Record<string, string>): Promise<any> {
  const pcuid = formGet(form, "pcuid");
  let p = await getProfileBySession(pcuid);
  if (!p) {
    p = await ensureProfile("GUEST", "GUEST");
  }
  return p;
}

// Pre-computed static XML — these never change at runtime
const _playmodeXmlCache: string = (() => {
  const parts: string[] = ["<playmode_list>"];
  for (const gmode of GAME_MODES) {
    const taku = GMODE_TAKU[gmode];
    // @ts-ignore
    const seats = (mahjong as any).SEATS_OF[taku];
    // @ts-ignore
    const tenbo = (mahjong as any).START_SCORE[taku];
    parts.push(`<mode><gmode>${gmode}</gmode><taku_class>1</taku_class><payment_mode>0</payment_mode><table_type>0</table_type><pmax>${seats}</pmax><tenbo>${tenbo}</tenbo><state>1</state><rate>0</rate><superior_border>0</superior_border></mode>`);
  }
  parts.push("</playmode_list>");
  return parts.join("");
})();

const _battleItemXmlCache: string = (() => {
  const parts: string[] = ["<battle_item_settings><basic_settings/><playmode_settings>"];
  for (const gmode of GAME_MODES) parts.push(`<setting gmode="${gmode}" taku_class="1"/>`);
  parts.push("</playmode_settings></battle_item_settings>");
  return parts.join("");
})();

function playmodeXml(): string { return _playmodeXmlCache; }
function battleItemXml(): string { return _battleItemXmlCache; }

// ---------------------------------------------------------------------------
// AOG handlers - each sends xml via ctx.res
// ---------------------------------------------------------------------------
function sendXml(ctx: any, xml: string): void {
  try {
    ctx.res.set("Content-Type", "text/xml; charset=utf-8");
    ctx.res.send(xml);
  } catch {
    try { ctx.res.send(xml); } catch { }
  }
}

export async function handle_appli_boot(form: Record<string, string>, ctx: any): Promise<void> {
  const base = gameBaseUrl(ctx?.req ? (ctx.req as any).headers?.host : undefined);
  // try to get host from req
  let url = "http://127.0.0.1:8083/aog";
  try {
    const host = ctx?.req?.hostname || ctx?.req?.headers?.host || "127.0.0.1";
    let port = PORT;
    try { if (CONFIG && CONFIG.port) port = CONFIG.port; } catch { }
    url = `http://${String(host).split(":")[0]}:${port}/aog`;
  } catch { url = gameBaseUrl(); }
  const xml = xml_response(
    "<server_setting><mask_ac_link_scene>0</mask_ac_link_scene><reviewed_version>false</reviewed_version></server_setting>" +
    `<boot_mes><status>0</status><moserv_url>${xml_escape(url)}</moserv_url><message>0</message></boot_mes>`
  );
  sendXml(ctx, xml);
}

export async function handle_appli_info(form: Record<string, string>, ctx: any): Promise<void> {
  const xml = xml_response(
    "<expire_seconds>3600</expire_seconds>" +
    infoData("events", eventsJson()) +
    infoData("pro_stats", proStatsJson())
  );
  sendXml(ctx, xml);
}

export async function handle_login(form: Record<string, string>, ctx: any): Promise<void> {
  const guest = formGet(form, "guest") === "1";
  const userId = formGet(form, "user_id", "dataid") || "GUEST";
  const session = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const profile = await ensureProfile(userId, guest ? "GUEST" : "PLAYER");
  (profile as any).session_id = session;
  (profile as any).is_guest = guest;
  // saveProfile also updates the in-memory cache
  await saveProfile(profile.refid, profile);
  const xml = xml_response(`<auth><session_id>${session}</session_id></auth>`);
  sendXml(ctx, xml);
}

export async function handle_logout(form: Record<string, string>, ctx: any): Promise<void> {
  const xml = xml_response();
  sendXml(ctx, xml);
}

export async function handle_create_player(form: Record<string, string>, ctx: any): Promise<void> {
  const name = formGet(form, "name") || "PLAYER";
  const userId = formGet(form, "user_id") || Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const p = await ensureProfile(userId, name);
  (p as any).name = name;
  // @ts-ignore
  await DB.Upsert(p.refid, { collection: "profile" }, p);
  const xml = xml_response();
  sendXml(ctx, xml);
}

export async function handle_get_menudata(form: Record<string, string>, ctx: any): Promise<void> {
  let name = "GUEST";
  let mid = 1;
  const pcuid = formGet(form, "pcuid");
  const p = await getProfileBySession(pcuid);
  if (p) {
    name = (p as any).name || name;
    mid = Number((p as any).player_id || 1);
  }
  const xml = xml_response(
    "<menudata>" +
    `<mpdata><mid>${mid}</mid><name>${xml_escape(name)}</name></mpdata>` +
    playmodeXml() +
    battleItemXml() +
    "</menudata>"
  );
  sendXml(ctx, xml);
}

export async function handle_keep_alive(form: Record<string, string>, ctx: any): Promise<void> {
  sendXml(ctx, xml_response());
}

export async function handle_client_state_read(form: Record<string, string>, ctx: any): Promise<void> {
  const mid = Number(formGet(form, "mid") || 0) || 0;
  const one = formGet(form, "one_kind");
  const chunks: string[] = [];
  let profile: any = null;
  if (mid) profile = await getProfileByPlayerId(mid);
  if (!profile) profile = await getProfileBySession(formGet(form, "pcuid"));
  const states = (profile || {}).states || {};
  const items: Array<[string, string]> = one ? (states[one] ? [[one, states[one]]] : []) : Object.entries(states) as any;
  for (const [kind, payload] of items) {
    let b64 = "";
    try { b64 = Buffer.from(String(payload), "utf-8").toString("base64"); } catch { b64 = ""; }
    chunks.push(`<state kind="${xml_escape(kind)}"><data>${b64}</data></state>`);
  }
  sendXml(ctx, xml_response(...chunks));
}

export async function handle_client_state_write(form: Record<string, string>, ctx: any): Promise<void> {
  const midRaw = formGet(form, "mid");
  let mid = Number(midRaw || 0) || 0;
  const kind = formGet(form, "kind") || "unknown";
  const data = formGet(form, "data");
  if (!mid) {
    const p = await getProfileBySession(formGet(form, "pcuid"));
    mid = Number((p as any)?.player_id || 0);
  }
  if (data && mid) {
    let decoded = data;
    try {
      const plus = decodeURIComponent(data.replace(/\+/g, " "));
      // data is urlencoded base64, try base64 decode
      decoded = Buffer.from(plus, "base64").toString("utf-8");
      // if result looks like not base64, fallback to raw
      if (!decoded) decoded = data;
    } catch {
      try { decoded = Buffer.from(data, "base64").toString("utf-8"); } catch { decoded = data; }
    }
    await saveState(mid, kind, decoded);
  }
  sendXml(ctx, xml_response());
}

// ---------------------------------------------------------------------------
// match
// ---------------------------------------------------------------------------
export async function handle_entry_game(form: Record<string, string>, ctx: any): Promise<void> {
  let gmode = Number(formGet(form, "gmode") || 1) || 1;
  if (!(gmode in GMODE_TAKU)) gmode = 1;
  const pcuid = formGet(form, "pcuid");
  const passphrase = formGet(form, "passphrase");
  const seats = GMODE_SEATS[gmode];
  const profile = await getProfileBySession(pcuid);
  const mid = Number((profile as any)?.player_id || 1);
  const name = (profile as any)?.name || "ゲスト";

  const lobbyKey = passphrase ? `${gmode}_${passphrase}` : `${gmode}`;

  let lobby = MATCH_LOBBY.get(lobbyKey);
  if (!lobby) {
    lobby = { pcuids: [], tid: nextTid(), createdAt: nowUnix() };
    MATCH_LOBBY.set(lobbyKey, lobby);
  }
  
  if (!lobby.pcuids.includes(pcuid)) {
    lobby.pcuids.push(pcuid);
  }
  
  const pindex = lobby.pcuids.indexOf(pcuid);
  PLAYER_SEAT.set(pcuid, { tid: lobby.tid, pindex, name, mid, profile, lobbyKey, gmode });
  
  if (lobby.pcuids.length >= seats) {
    const taku = GMODE_TAKU[gmode] ?? 0;
    ensureSharedTable(lobby.tid, taku);
    MATCH_LOBBY.delete(lobbyKey);
  }

  let url = gameBaseUrl();
  try {
    const host = ctx?.req?.hostname || ctx?.req?.headers?.host || "127.0.0.1";
    let port = PORT;
    try { if (CONFIG && CONFIG.port) port = CONFIG.port; } catch { }
    url = `http://${String(host).split(":")[0]}:${port}/aog/`;
  } catch { }
  const xml = xml_response(
    "<entry>" +
    "<gserv_id>1</gserv_id>" +
    `<tid>${lobby.tid}</tid>` +
    `<pindex>${pindex}</pindex>` +
    "<next_sno>0</next_sno>" +
    "<last_cyoukou_num>3</last_cyoukou_num>" +
    "<cyoukou_num>3</cyoukou_num>" +
    "<ste_oya1_limit_time>15000</ste_oya1_limit_time>" +
    "<ste_limit_time>10000</ste_limit_time>" +
    "<ste_reechi1_limit_time>15000</ste_reechi1_limit_time>" +
    "<naki_limit_time>8000</naki_limit_time>" +
    "<agari_limit_time>10000</agari_limit_time>" +
    "<naki_choice_limit_time>8000</naki_choice_limit_time>" +
    "<reechi_choice_limit_time>8000</reechi_choice_limit_time>" +
    "<last_cyoukou_limit_time>30000</last_cyoukou_limit_time>" +
    "<last_time>30000</last_time>" +
    `<gserv_url>${xml_escape(url)}</gserv_url>` +
    "<pay_mode>0</pay_mode>" +
    `<gmode>${gmode}</gmode>` +
    "</entry>"
  );
  sendXml(ctx, xml);
}

export async function handle_gget(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  const ready = formGet(form, "ready") === "1";
  const parts = parseMust(form);
  const tid = mustInt(parts, 2, 1);
  const nextSno = mustInt(parts, 5, 0);
  
  const seatInfo = PLAYER_SEAT.get(pcuid) || { tid: 1, pindex: 0, name: "ゲスト", mid: 1, profile: null, lobbyKey: "1", gmode: 1 };
  const gmode = seatInfo.gmode || 1;
  const seats = GMODE_SEATS[gmode] || 4;
  const lobbyKey = seatInfo.lobbyKey || "1";

  let lobby = MATCH_LOBBY.get(lobbyKey);
  if (lobby && lobby.tid === seatInfo.tid) {
    if (nowUnix() - lobby.createdAt > 60) {
      const taku = GMODE_TAKU[gmode] ?? 0;
      ensureSharedTable(lobby.tid, taku);
      MATCH_LOBBY.delete(lobbyKey);
    }
  }

  let table = SHARED_TABLES.get(seatInfo.tid);
  let isMatched = false;
  
  const players = [];
  if (table) {
    isMatched = true;
    // If table exists, gather players from PLAYER_SEAT
    for (let i = 0; i < seats; i++) {
      let found = null;
      for (const p of PLAYER_SEAT.values()) {
        if (p.tid === seatInfo.tid && p.pindex === i) {
          found = { pcuid: "unknown", mid: p.mid, name: p.name, profile: p.profile };
          break;
        }
      }
      players.push(found);
    }
  } else if (lobby && lobby.tid === seatInfo.tid) {
    // If still in lobby, gather players from lobby
    for (const puid of lobby.pcuids) {
      const s = PLAYER_SEAT.get(puid);
      players.push({ pcuid: puid, mid: s?.mid || 1, name: s?.name || "ゲスト", profile: s?.profile });
    }
  } else {
    players.push({ pcuid, mid: seatInfo.mid, name: seatInfo.name, profile: seatInfo.profile });
  }

  const mwait = matchingXml(seats, seatInfo.pindex, players as any, isMatched);

  let tai = "";
  let allReady = 0;
  if (ready && table) {
    // @ts-ignore
    table.flush_pending();
    tai = table.cells_from(nextSno);
    allReady = 1;
  }
  const chat = stampXml("chat", tid, mustInt(parts, 6, 0));
  const xml = xml_response(`<game><all_ready>${allReady}</all_ready>${mwait}${tai}</game>${chat}`);
  sendXml(ctx, xml);
}

export async function handle_gpost(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  const parts = parseMust(form);
  const tid = mustInt(parts, 2, 1);
  const kind = mustInt(parts, 6, 0);
  const pindex = mustInt(parts, 3, 0);
  const pai = mustInt(parts, 9, 0);
  const tepai_id = mustInt(parts, 10, 0);
  const tepai_id2 = mustInt(parts, 11, 0);
  const reach = mustInt(parts, 12, 0);
  const tsumogiri = mustInt(parts, 13, 0);
  
  const seatInfo = PLAYER_SEAT.get(pcuid) || { tid: 1, pindex: 0, name: "ゲスト", mid: 1, profile: null };
  const table = SHARED_TABLES.get(seatInfo.tid);
  if (!table) {
    sendXml(ctx, xml_response(`<game></game>` + stampXml("chat", tid, 1000000000)));
    return;
  }

  const start = table.cells.length;
  // Use seatInfo.pindex to override the client's provided pindex just to be safe
  table.on_command(kind, seatInfo.pindex, pai, tepai_id, tepai_id2, reach, tsumogiri);
  
  // flush if needed for certain kinds
  const S_NAKINASHI = 11, S_PON = 5, S_CHI = 6, S_MINKAN = 8, S_ANKAN = 7, S_KAKAN = 9, S_NEXT_KYOKU_READY = 15;
  if ([S_NAKINASHI, S_PON, S_CHI, S_MINKAN, S_ANKAN, S_KAKAN, S_NEXT_KYOKU_READY].includes(kind)) {
    table.flush_pending();
  }
  const tai = table.cells_from(start);
  const xml = xml_response(`<game>${tai}</game>` + stampXml("chat", tid, 1000000000));
  sendXml(ctx, xml);
}

export async function handle_end_or_kiken(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  const seatInfo = PLAYER_SEAT.get(pcuid);
  const table = seatInfo ? SHARED_TABLES.get(seatInfo.tid) : null;
  
  if (table) {
    table.state = "game_end";
    table.finished = true;
  }
  // Optional: Clean up PLAYER_SEAT to detect when all players have left
  PLAYER_SEAT.delete(pcuid);
  
  const body = mgresultXml(table, { gmode: Number(formGet(form, "gmode") || 1) });
  sendXml(ctx, xml_response(body));
}

export async function handle_end_show(form: Record<string, string>, ctx: any): Promise<void> {
  const voltage = Number(formGet(form, "voltage") || 0) || 0;
  const contribute = Number(formGet(form, "contribute_percent") || 100) || 100;
  const bonus = Number(formGet(form, "bonus") || 0) || 0;
  const xml = xml_response(
    "<showresult>" +
    `<voltage>${voltage}</voltage>` +
    `<contribute_percent>${contribute}</contribute_percent>` +
    "<card_effect_percent>0</card_effect_percent>" +
    "<item_effect_percent>0</item_effect_percent>" +
    `<bonus>${bonus}</bonus>` +
    `<get_point>${Math.max(0, Math.floor(voltage / 10))}</get_point>` +
    "</showresult>"
  );
  sendXml(ctx, xml);
}

// ---------------------------------------------------------------------------
// sticker chat
// ---------------------------------------------------------------------------
export async function handle_gchat(form: Record<string, string>, ctx: any): Promise<void> {
  const tid = Number(formGet(form, "tid") || 1) || 1;
  const mid = Number(formGet(form, "mid") || 0) || 0;
  const pindex = Number(formGet(form, "pindex") || 0) || 0;
  const name = formGet(form, "name");
  const contents = formGet(form, "contents");
  const param = formGet(form, "param");
  if (contents) {
    stampPost(tid, mid, pindex, name, contents, param);
    maybeCpuStamp(tid, pindex);
  }
  sendXml(ctx, xml_response(stampXml("chat", tid, 0)));
}

export async function handle_gget_stamp_info(form: Record<string, string>, ctx: any): Promise<void> {
  const parts = parseMust(form);
  const tid = mustInt(parts, 2, 1);
  const pindex = mustInt(parts, 3, 0);
  const mid = mustInt(parts, 4, 0);
  const info = (formGet(form, "stamp_info") || "").split(",");
  let since = 0;
  try { since = Number(info[1] || 0) || 0; } catch { since = 0; }
  if (info.length >= 3 && info[2]) {
    stampPost(tid, mid, pindex, info[3] || "", info[2], "");
    maybeCpuStamp(tid, pindex);
  }
  sendXml(ctx, xml_response(stampXml("stamp_info", tid, since)));
}

// ---------------------------------------------------------------------------
// dojo
// ---------------------------------------------------------------------------
export async function handle_dojo_get_status(form: Record<string, string>, ctx: any): Promise<void> {
  const p = await dojoProfile(form);
  const slots = dojoState(p);
  for (const s of slots) dojoRefresh(s);
  await saveProfile((p as any).refid, p);
  const body = slots.map((s, i) => dojoSlotXml(i, s)).join("");
  sendXml(ctx, xml_response(`<dojo><slot_nr>${DOJO_SLOTS}</slot_nr>${body}</dojo>`));
}

export async function handle_dojo_set_slot(form: Record<string, string>, ctx: any): Promise<void> {
  const slotIdRaw = Number(formGet(form, "slot_id") || 0) || 0;
  const chara = formGet(form, "set_character") || "OID_CHARACTER_1";
  const p = await dojoProfile(form);
  const slots = dojoState(p);
  const slotId = Math.max(0, Math.min(slotIdRaw, DOJO_SLOTS - 1));
  const slot = slots[slotId];
  Object.assign(slot, { available: true, chara, start: nowUnix(), next: nowUnix() + DOJO_LESSON_SECONDS, stock: 0 });
  await saveProfile((p as any).refid, p);
  const body = dojoSlotXml(slotId, slot);
  sendXml(ctx, xml_response(`<dojo><slot_id>${slotId}</slot_id><updated>1</updated>${body}</dojo>`));
}

export async function handle_dojo_gain_soul(form: Record<string, string>, ctx: any): Promise<void> {
  const slotIdRaw = Number(formGet(form, "slot_id") || 0) || 0;
  const p = await dojoProfile(form);
  const slots = dojoState(p);
  const slotId = Math.max(0, Math.min(slotIdRaw, DOJO_SLOTS - 1));
  const slot = slots[slotId];
  dojoRefresh(slot);
  const got = Number(slot.stock || 0);
  slot.stock = 0;
  slot.start = nowUnix();
  slot.next = nowUnix() + DOJO_LESSON_SECONDS;
  await saveProfile((p as any).refid, p);
  const body = dojoSlotXml(slotId, slot);
  sendXml(ctx, xml_response(`<dojo><slot_id>${slotId}</slot_id><get_nr>${got}</get_nr>${body}</dojo>`));
}

// ---------------------------------------------------------------------------
// gacha
// ---------------------------------------------------------------------------
export async function handle_gacha_info(form: Record<string, string>, ctx: any): Promise<void> {
  const xml = xml_response(_gachaInfoXml());
  sendXml(ctx, xml);
}

export async function handle_req_draw_gacha(form: Record<string, string>, ctx: any): Promise<void> {
  const txn = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const p = await getProfileBySession(formGet(form, "pcuid"));
  if (p) {
    (p as any).gacha_txn = { id: txn, gacha: formGet(form, "gacha_name"), times: Number(formGet(form, "times") || 1) || 1 };
    // @ts-ignore
    await DB.Upsert((p as any).refid, { collection: "profile" }, p);
  }
  sendXml(ctx, xml_response(`<transaction_info><transaction_id>${txn}</transaction_id></transaction_info>`));
}

export async function handle_get_gacha_result(form: Record<string, string>, ctx: any): Promise<void> {
  const times = Number(formGet(form, "times") || 1) || 1;
  const rows = Array.from({ length: Math.max(1, times) }, () => `<data><character_id>0</character_id><unique_id>${Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}</unique_id></data>`).join("");
  sendXml(ctx, xml_response(`<lottery_result>${rows}</lottery_result><gift><acquired>0</acquired><prev>0</prev><after>0</after></gift>`));
}

export async function handle_gacha_log(form: Record<string, string>, ctx: any): Promise<void> {
  const raw = formGet(form, "log");
  if (raw) {
    try {
      const txt = Buffer.from(decodeURIComponent(raw.replace(/\+/g, " ")), "base64").toString("utf-8");
      // @ts-ignore
      console.log(`[gacha] ${txt}`);
    } catch { }
  }
  sendXml(ctx, xml_response());
}

export async function handle_music_gacha_play_reserve(form: Record<string, string>, ctx: any): Promise<void> {
  const series = Number(formGet(form, "gacha_id") || 0) || 0;
  const req = incMusicReqSeq();
  MUSIC_GACHA_RESERVES.set(req, series);
  sendXml(ctx, xml_response(`<gacha_reserve><is_success>1</is_success><request_id>${req}</request_id></gacha_reserve>`));
}

export async function handle_music_gacha_play(form: Record<string, string>, ctx: any): Promise<void> {
  let req = 0;
  try { req = Number(formGet(form, "request_id") || 0) || 0; } catch { req = 0; }
  const series = MUSIC_GACHA_RESERVES.get(req) || 0;
  MUSIC_GACHA_RESERVES.delete(req);
  let pool: string[] | undefined = MUSIC_GACHA_POOL.get(series);
  if (!pool || !pool.length) pool = MUSIC_GACHA_POOL.get(91) || ["OID_ReachBgm148"];
  const oid = pool[Math.floor(Math.random() * pool.length)];
  sendXml(ctx, xml_response(`<gacha_result><is_success>1</is_success><gain_items><item>${xml_escape(oid)}</item></gain_items><gift>2</gift><fight_spirits></fight_spirits></gacha_result>`));
}

export async function handle_get_jongstone_info(form: Record<string, string>, ctx: any): Promise<void> {
  sendXml(ctx, xml_response("<jongstone_info><free_point>0</free_point><record_point>0</record_point></jongstone_info>"));
}

export async function handle_get_mg(form: Record<string, string>, ctx: any): Promise<void> {
  sendXml(ctx, xml_response("<mg_info><mg>0</mg><additional_mg>0</additional_mg></mg_info>"));
}

export async function handle_mission_date(form: Record<string, string>, ctx: any): Promise<void> {
  const payload = JSON.stringify({ list: [] });
  sendXml(ctx, xml_response(infoData("missions", payload)));
}

export async function handle_player_record(form: Record<string, string>, ctx: any): Promise<void> {
  sendXml(ctx, xml_response("<player_record></player_record>"));
}

export async function handle_get_haifu_list(form: Record<string, string>, ctx: any): Promise<void> {
  sendXml(ctx, xml_response("<haifu_list></haifu_list>"));
}
export async function handle_get_haifu_data(form: Record<string, string>, ctx: any): Promise<void> {
  sendXml(ctx, xml_response());
}

export async function handle_present_done(form: Record<string, string>, ctx: any): Promise<void> {
  const ids = (formGet(form, "done_ids") || "").split(",").map(s => s.trim()).filter(Boolean);
  const rows = ids.map(i => `<data><id>${xml_escape(i)}</id><success>1</success><content></content><amount>0</amount></data>`).join("");
  sendXml(ctx, xml_response(`<present>${rows}</present>`));
}

export async function handle_competition_entry(form: Record<string, string>, ctx: any): Promise<void> {
  sendXml(ctx, xml_response("<competition><entry_result>1</entry_result></competition>"));
}

export async function handle_log_only(form: Record<string, string>, ctx: any): Promise<void> {
  const raw = formGet(form, "log");
  if (raw) {
    try {
      const txt = Buffer.from(decodeURIComponent(raw.replace(/\+/g, " ")), "base64").toString("utf-8");
      // @ts-ignore
      console.log(`[itemlog] ${txt}`);
    } catch { }
  }
  sendXml(ctx, xml_response());
}

export const TABOO_WORDS: string[] = [];
function isTaboo(word: string): boolean {
  const s = (word || "").trim().toLowerCase();
  return TABOO_WORDS.some(bad => s.includes(bad));
}
export async function handle_chk_tabooword(form: Record<string, string>, ctx: any): Promise<void> {
  const word = formGet(form, "str");
  const banned = isTaboo(word) ? 1 : 0;
  sendXml(ctx, xml_response(`<taboo_chk><result>${banned}</result></taboo_chk>`));
}

export const AOG_HANDLER_MAP: Record<string, (f: any, c: any) => Promise<void>> = {
  appli_boot: handle_appli_boot,
  appli_info: handle_appli_info,
  login: handle_login,
  logout: handle_logout,
  create_player: handle_create_player,
  get_menudata: handle_get_menudata,
  keep_alive: handle_keep_alive,
  client_state_read: handle_client_state_read,
  client_state_write: handle_client_state_write,
  entry_game: handle_entry_game,
  gget: handle_gget,
  gpost: handle_gpost,
  end_game: handle_end_or_kiken,
  kiken_game: handle_end_or_kiken,
  end_show: handle_end_show,
  reconnect: handle_entry_game,
  chk_tabooword: handle_chk_tabooword,
  dojo_get_status: handle_dojo_get_status,
  dojo_set_slot: handle_dojo_set_slot,
  dojo_gain_soul: handle_dojo_gain_soul,
  gacha_info: handle_gacha_info,
  gacha_log: handle_gacha_log,
  req_draw_gacha: handle_req_draw_gacha,
  get_gacha_result: handle_get_gacha_result,
  music_gacha_play: handle_music_gacha_play,
  music_gacha_play_reserve: handle_music_gacha_play_reserve,
  gchat: handle_gchat,
  gget_stamp_info: handle_gget_stamp_info,
  player_record: handle_player_record,
  get_record: handle_player_record,
  get_haifu_list: handle_get_haifu_list,
  get_haifu_data: handle_get_haifu_data,
  get_jongstone_info: handle_get_jongstone_info,
  get_mg: handle_get_mg,
  mission_date: handle_mission_date,
  present_done: handle_present_done,
  competition_entry: handle_competition_entry,
  item_gain_log: handle_log_only,
  item_consume_log: handle_log_only,
  notice_done: async (f: any, c: any) => sendXml(c, xml_response()),
  important_notice_done: async (f: any, c: any) => sendXml(c, xml_response()),
  set_favorite_character: async (f: any, c: any) => sendXml(c, xml_response()),
  odekake_done: async (f: any, c: any) => sendXml(c, xml_response()),
  coop_done: async (f: any, c: any) => sendXml(c, xml_response()),
  eashop_done: async (f: any, c: any) => sendXml(c, xml_response()),
};


// register
export function registerAogRoutes(): void {
  for (const [name, handler] of Object.entries(AOG_HANDLER_MAP)) {
    // @ts-ignore - R.AogRoute is injected by RyuNET
    if (typeof R !== "undefined" && R.AogRoute) R.AogRoute(name, handler as any);
  }
}
