// @ts-ignore
declare const K: any;
// @ts-ignore
declare const R: any;
// @ts-ignore
declare const console: any;

import {
  X,
  nowDateSpace,
  vlog,
  getProfileByUsrId,
  echoUsrName,
} from "./utils";

// ---------------------------------------------------------------------------
// Online matching — port of MonkeyBusiness modules/polaris/pcb.py +
// the get_temp/save_temp tail of modules/polaris/usr.py.
//
// Flow: sync_matching_room (lobby rendezvous) -> sync_matching_music (song
// vote) -> sync_matching_progress (ready sync) -> sync_matching_game_result
// -> finish_matching_room. usr.save_temp/get_temp exchanges lobby profile
// cards between matched members.
//
// NOTE: MonkeyBusiness also runs a UDP peer-relay (peer_relay.py) so two
// cabs behind different NATs can exchange P2P gameplay packets. An Asphyxia
// plugin cannot open UDP sockets, so there is no relay here: matching works
// when the cabs can reach each other directly (same LAN/VPN, port forward).
// The XRPC lobby itself is fully functional.
// ---------------------------------------------------------------------------

const MAX_MEMBERS = 4;
const MIN_MEMBERS = 2;
const ROOM_TTL_MS = 15 * 60 * 1000;
const TEMP_TTL_MS = 20 * 60 * 1000;
const MUSIC_OMAKASE = 2;
const MUSIC_SELECTED = 3;
const MUSIC_TOTAL_STAGES = 4;

interface Member {
  slot: number;
  usr_id: number;
  local_ip: string;
  local_port: number;
  global_ip: string;
  global_port: number;
  client_ip: string;
  request_host: string;
  asset_version: number;
  patch_version: number;
}

interface Room {
  match_id: number;
  key: string;
  location: string;
  event_room_id: number;
  created_at: string;
  updated_at: number;
  members: Map<number, Member>;
  music: Record<number, { music_id: number; select: number; chart_permission: number; seq: number }>;
  music_step: number;
  music_timeup: boolean;
  music_decided_id: number;
  music_decided_chart_permission: number;
  music_decided_slot: number;
  music_sequence: number;
  progress: Record<number, number>;
  progress_step: number;
  progress_timeup: boolean;
  results: Record<number, any>;
  result_step: number;
  result_timeup: boolean;
  decided: boolean;
  timeup: boolean;
  finished: boolean;
}

const rooms = new Map<number, Room>();
const userRoom = new Map<number, number>();
const clientUser = new Map<string, number>();
const tempData = new Map<number, { data: any; updated: number }>();
let nextMatchId = (Math.floor(Date.now() / 1000) % 1000000) || 1;

// --- tolerant node readers (data = decoded <pcb>/<usr> content) ---

function tstr(node: any, ...names: string[]): string {
  for (const n of names) {
    const s = X.strOf(node || {}, n);
    if (s !== "") return s;
  }
  return "";
}

function tnum(node: any, ...names: string[]): number {
  for (const n of names) {
    if (node && node[n] != null) return X.numOf(node, n);
  }
  return 0;
}

function tbool(node: any, ...names: string[]): boolean {
  for (const n of names) {
    if (node && node[n] != null) {
      const v = node[n];
      if (typeof v === "boolean") return v;
      const s = X.strOf({ v }, "v").trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(s)) return true;
      if (["0", "false", "no", "off", ""].includes(s)) return false;
      return X.numOf({ v }, "v") !== 0;
    }
  }
  return false;
}

function clientKey(info: any): string {
  return `${(info as any).ip || ""}|${(info as any).host || ""}`;
}

// --- room management (mirrors pcb.py) ---

function cleanupRooms(now?: number): void {
  const t = now || Date.now();
  for (const [id, room] of rooms) {
    if (room.finished || t - room.updated_at > ROOM_TTL_MS) {
      rooms.delete(id);
      for (const uid of room.members.keys()) {
        if (userRoom.get(uid) === id) userRoom.delete(uid);
      }
    }
  }
}

function roomKey(location: string, eventRoomId: number): string {
  return `${location}|${eventRoomId}`;
}

function emptyRoom(timeup = false): Room {
  return {
    match_id: 0, key: "", location: "", event_room_id: 0,
    created_at: "", updated_at: Date.now(), members: new Map(),
    music: {}, music_step: 0, music_timeup: false,
    music_decided_id: 0, music_decided_chart_permission: 0,
    music_decided_slot: 0, music_sequence: 0,
    progress: {}, progress_step: 0, progress_timeup: false,
    results: {}, result_step: 0, result_timeup: false,
    decided: false, timeup: !!timeup, finished: false,
  };
}

function removeMember(usrId: number): void {
  const mid = userRoom.get(usrId);
  if (!mid) return;
  userRoom.delete(usrId);
  const room = rooms.get(mid);
  if (!room) return;
  room.members.delete(usrId);
  room.updated_at = Date.now();
  if (!room.members.size) room.finished = true;
}

function assignSlot(room: Room): number {
  const used = new Set(Array.from(room.members.values()).map(m => m.slot));
  for (let s = 1; s <= MAX_MEMBERS; s++) if (!used.has(s)) return s;
  return 0;
}

function findOpenRoom(key: string): Room | null {
  for (const room of rooms.values()) {
    if (room.finished || room.decided || room.timeup) continue;
    if (room.key !== key) continue;
    if (room.members.size < MAX_MEMBERS) return room;
  }
  return null;
}

function createRoom(location: string, eventRoomId: number): Room {
  nextMatchId += 1;
  if (nextMatchId <= 0) nextMatchId = 1;
  const room: Room = {
    ...emptyRoom(),
    match_id: nextMatchId,
    key: roomKey(location, eventRoomId),
    location: String(location || ""),
    event_room_id: Number(eventRoomId || 0),
    created_at: nowDateSpace(),
    updated_at: Date.now(),
  };
  rooms.set(room.match_id, room);
  return room;
}

function roomReadyToClose(room: Room): boolean {
  if (room.members.size >= MAX_MEMBERS) return true;
  return !!(room.timeup && room.members.size >= MIN_MEMBERS);
}

function syncRoomState(node: any, clientHost: string, requestHost: string): Room {
  const now = Date.now();
  cleanupRooms(now);
  const usrId = tnum(node, "usr_id", "user_id");
  const cancel = tbool(node, "cancel");
  const timeup = tbool(node, "timeup");
  if (usrId <= 0) return emptyRoom(timeup);

  let prevId = userRoom.get(usrId);
  let room = (prevId && rooms.get(prevId)) || null;
  if (cancel) {
    if (room && room.members.size >= MIN_MEMBERS) {
      room.timeup = true;
      room.decided = true;
      room.updated_at = now;
      return room;
    }
    removeMember(usrId);
    return emptyRoom(timeup);
  }

  const location = tstr(node, "location", "location_id");
  const eventRoomId = tnum(node, "event_room_id", "exclusive_room_id");
  if (tbool(node, "ignore_prev_room") && prevId) {
    removeMember(usrId);
    prevId = undefined;
    room = null;
  }
  if (!room || room.finished) {
    room = findOpenRoom(roomKey(location, eventRoomId)) || createRoom(location, eventRoomId);
  }
  let member = room.members.get(usrId);
  if (!member) {
    let slot = assignSlot(room);
    if (slot <= 0) {
      room = createRoom(location, eventRoomId);
      slot = assignSlot(room);
    }
    member = {
      slot, usr_id: usrId, local_ip: "", local_port: 0, global_ip: "",
      global_port: 0, client_ip: "", request_host: "", asset_version: 0, patch_version: 0,
    };
    room.members.set(usrId, member);
    userRoom.set(usrId, room.match_id);
  }
  member.local_ip = tstr(node, "local_ip");
  member.local_port = tnum(node, "local_port");
  member.global_ip = tstr(node, "global_ip");
  member.global_port = tnum(node, "global_port");
  member.client_ip = String(clientHost || "");
  member.request_host = String(requestHost || "");
  member.asset_version = tnum(node, "asset_version");
  member.patch_version = tnum(node, "patch_version");
  room.updated_at = now;
  room.timeup = !!(room.timeup || timeup);
  if (room.decided || roomReadyToClose(room)) room.decided = true;
  return room;
}

function viewMembers(room: Room): Member[] {
  return Array.from(room.members.values()).sort((a, b) => a.slot - b.slot);
}

function memberByViewSlot(room: Room, slot: number): Member | null {
  const v = viewMembers(room);
  return (slot >= 1 && slot <= v.length) ? v[slot - 1] : null;
}

// Without the UDP relay every client sees direct addresses; prefer the
// LAN address for other members (pcb.py non-relay path).
function memberIp(m: Member | null, viewer: number): string {
  if (!m) return "";
  if (m.usr_id !== viewer && m.local_ip) return m.local_ip;
  return m.global_ip || m.local_ip || "";
}
function memberPort(m: Member | null, viewer: number): number {
  if (!m) return 0;
  if (m.usr_id !== viewer && m.local_port > 0) return m.local_port;
  if (m.global_port > 0) return m.global_port;
  return m.local_port || 0;
}

function roomXml(room: Room, viewer: number): any {
  const kids: any = {
    match_id: K.ITEM("s32", room.match_id),
    location: K.ITEM("str", room.location),
    timeup: K.ITEM("bool", !!room.timeup),
    decided: K.ITEM("bool", !!room.decided),
    created_at: K.ITEM("str", room.created_at),
    now_date: K.ITEM("str", nowDateSpace()),
  };
  const fields = ["local_ip", "local_port", "global_ip", "global_port", "usr_id", "cpu_id"];
  for (const f of fields) {
    for (let s = 1; s <= MAX_MEMBERS; s++) {
      const m = memberByViewSlot(room, s);
      if (f.endsWith("ip")) {
        const v = f === "local_ip" ? (m ? m.local_ip : "") : memberIp(m, viewer);
        kids[`${f}_${s}`] = K.ITEM("str", v || "");
      } else {
        let v = 0;
        if (m) {
          if (f === "local_port") v = m.local_port;
          else if (f === "global_port") v = memberPort(m, viewer);
          else if (f === "usr_id") v = m.usr_id;
        }
        kids[`${f}_${s}`] = K.ITEM("s32", v);
      }
    }
  }
  kids.event_room_id = K.ITEM("s32", room.event_room_id);
  return { matching_room: kids };
}

// --- music vote (mirrors pcb.py decision logic) ---

function activeSlots(room: Room): number[] {
  return Array.from(room.members.values()).map(m => m.slot).filter(s => s > 0).sort((a, b) => a - b);
}

function musicRightSlot(room: Room): number {
  const active = activeSlots(room);
  if (!active.length) return 0;
  const selectable = Math.floor(MUSIC_TOTAL_STAGES / active.length) * active.length;
  if (room.music_step >= selectable) return 0;
  return active[room.music_step % active.length];
}

function slotCandidate(room: Room, slot: number): any | null {
  const st = room.music[slot];
  if (!st || st.music_id <= 0) return null;
  if (st.select !== MUSIC_OMAKASE && st.select !== MUSIC_SELECTED) return null;
  return { slot, music_id: st.music_id, selection: st.select, chart_permission: st.chart_permission };
}

function musicAllReady(room: Room): boolean {
  const active = activeSlots(room);
  if (!active.length) return false;
  return active.every(s => !!slotCandidate(room, s));
}

function updateMusicDecision(room: Room): void {
  if (!room || room.music_decided_id > 0) return;
  const active = activeSlots(room);
  if (!active.length) return;
  const right = musicRightSlot(room);
  const cands = active.map(s => slotCandidate(room, s)).filter(Boolean) as any[];
  const allReady = musicAllReady(room);
  if (!allReady && !room.music_timeup) return;
  if (!cands.length) return;
  const rightCand = right > 0 ? slotCandidate(room, right) : null;
  let pick: any;
  if (right <= 0) {
    pick = cands[Math.floor(Math.random() * cands.length)];
  } else if (!rightCand) {
    return;
  } else if (cands.length === active.length && cands.every(c => c.selection === MUSIC_OMAKASE)) {
    pick = cands[Math.floor(Math.random() * cands.length)];
  } else if (rightCand.selection === MUSIC_SELECTED) {
    pick = rightCand;
  } else {
    const others = cands.filter(c => c.slot !== right)
      .sort((a, b) => (a.selection === MUSIC_SELECTED ? 0 : 1) - (b.selection === MUSIC_SELECTED ? 0 : 1) || a.slot - b.slot);
    pick = others[0] || rightCand;
  }
  if (pick.music_id <= 0) return;
  room.music_decided_id = pick.music_id;
  room.music_decided_chart_permission = pick.chart_permission;
  room.music_decided_slot = pick.slot;
}

function findRoom(matchId: number, memberId: number): Room | null {
  const r = rooms.get(matchId);
  if (r) return r;
  if (memberId > 0) {
    for (const cand of rooms.values()) {
      for (const m of cand.members.values()) {
        if (m.slot === memberId) return cand;
      }
    }
  }
  return null;
}

// client member_id is 0-based view index -> global slot
function globalSlot(room: Room, memberId: number, viewer: number): number {
  if (memberId >= 0 && memberId < MAX_MEMBERS) return memberId + 1;
  if (viewer > 0) {
    const m = room.members.get(viewer);
    if (m) return m.slot;
  }
  return 0;
}

function musicXml(room: Room): any {
  const kids: any = {
    match_id: K.ITEM("s32", room.match_id),
    timeup: K.ITEM("bool", !!room.music_timeup),
    step: K.ITEM("s32", room.music_step),
  };
  for (let s = 1; s <= MAX_MEMBERS; s++) {
    const st = room.music[s];
    kids[`music_id_${s}`] = K.ITEM("s32", st ? st.music_id : -1);
  }
  kids.music_id_decided = K.ITEM("s32", room.music_decided_id > 0 ? room.music_decided_id : -1);
  for (let s = 1; s <= MAX_MEMBERS; s++) {
    const st = room.music[s];
    kids[`select_${s}`] = K.ITEM("s32", st ? st.select : -1);
  }
  for (let s = 1; s <= MAX_MEMBERS; s++) {
    const st = room.music[s];
    kids[`chart_permission_${s}`] = K.ITEM("s32", st ? st.chart_permission : 0);
  }
  return { matching_music: kids };
}

function progressXml(room: Room): any {
  const kids: any = {
    match_id: K.ITEM("s32", room.match_id),
    timeup: K.ITEM("bool", !!room.progress_timeup),
    step: K.ITEM("s32", room.progress_step),
  };
  for (let s = 1; s <= MAX_MEMBERS; s++) {
    kids[`progress_${s}`] = K.ITEM("s32", room.progress[s] != null ? room.progress[s] : -1);
  }
  return { matching_progress: kids };
}

function resultEntry(r: any, memberId: number): any {
  return {
    member_id: K.ITEM("s32", memberId),
    score: K.ITEM("s32", Number(r.score || 0)),
    difficult: K.ITEM("s32", Number(r.difficult || 0)),
    achive_new_record: K.ITEM("bool", !!r.achive_new_record),
    likes_new_record: K.ITEM("bool", !!r.likes_new_record),
    clear_type: K.ITEM("s32", Number(r.clear_type || 0)),
    likes_score: K.ITEM("s32", Number(r.likes_score || 0)),
    achive_emblem: K.ITEM("s32", Number(r.achive_emblem || 0)),
    likes_emblem: K.ITEM("s32", Number(r.likes_emblem || 0)),
    exp: K.ITEM("s32", Number(r.exp || 0)),
    pa_class: K.ITEM("s32", Number(r.pa_class || 0)),
    pa_skill: K.ITEM("s32", Number(r.pa_skill || 0)),
    display_pa_skill: K.ITEM("s32", Number(r.display_pa_skill || 0)),
    display_pa_skill_grade: K.ITEM("s32", Number(r.display_pa_skill_grade || 0)),
    combo: K.ITEM("s32", Number(r.combo || 0)),
    combo_new_record: K.ITEM("bool", !!r.combo_new_record),
  };
}

function gameResultXml(room: Room): any {
  const entries: any[] = [];
  const v = viewMembers(room);
  v.forEach((m, i) => {
    const r = room.results[m.slot];
    if (r) entries.push(resultEntry(r, i));
  });
  if (!entries.length) {
    for (const s of Object.keys(room.results).map(Number).sort((a, b) => a - b)) {
      entries.push(resultEntry(room.results[s], s - 1));
    }
  }
  return {
    matching_game_result: {
      match_id: K.ITEM("s32", room.match_id),
      timeup: K.ITEM("bool", false),
      step: K.ITEM("s32", room.result_step),
      results: { result: entries },
    },
  };
}

// --- pcb handlers ---

async function pcbSyncRoom(info: any, data: any, send: any): Promise<void> {
  const node = data || {};
  const viewer = tnum(node, "usr_id", "user_id");
  const ckey = clientKey(info);
  if (viewer > 0) clientUser.set(ckey, viewer);
  const room = syncRoomState(node, (info as any).ip || "", (info as any).host || "");
  vlog(`[XIF] pcb.sync_matching_room usr=${viewer} match=${room.match_id} members=${room.members.size} decided=${room.decided}`);
  await send.object({ "@attr": { status: 0 }, ...roomXml(room, viewer) });
}

async function pcbSyncMusic(info: any, data: any, send: any): Promise<void> {
  const node = data || {};
  const viewer = clientUser.get(clientKey(info)) || 0;
  cleanupRooms();
  const matchId = tnum(node, "match_id", "matching_id");
  const memberId = (node.member_id != null) ? tnum(node, "member_id") : -1;
  const room = findRoom(matchId, memberId);
  if (room) {
    const gslot = globalSlot(room, memberId, viewer);
    const reqStep = tnum(node, "step");
    if (!(room.music_step > 0 && reqStep < room.music_step)) {
      if (reqStep > room.music_step) {
        room.music = {};
        room.music_timeup = false;
        room.music_decided_id = 0;
        room.music_decided_chart_permission = 0;
        room.music_sequence = 0;
      }
      room.music_sequence += 1;
      if (activeSlots(room).includes(gslot)) {
        room.music[gslot] = {
          music_id: tnum(node, "music_id"),
          select: tnum(node, "select_state", "select"),
          chart_permission: (() => {
            const v = tnum(node, "chart_permission", "chart_permision");
            return node.chart_permission != null || node.chart_permision != null ? v : 31;
          })(),
          seq: room.music_sequence,
        };
      }
      room.music_step = Math.max(room.music_step, reqStep);
      room.music_timeup = !!(room.music_timeup || tbool(node, "timeup"));
      updateMusicDecision(room);
      room.updated_at = Date.now();
    } else {
      room.updated_at = Date.now();
    }
  }
  const target = room || emptyRoom();
  await send.object({ "@attr": { status: 0 }, ...musicXml(target) });
}

async function pcbSyncProgress(info: any, data: any, send: any): Promise<void> {
  const node = data || {};
  const viewer = clientUser.get(clientKey(info)) || 0;
  cleanupRooms();
  const matchId = tnum(node, "match_id", "matching_id");
  const memberId = (node.member_id != null) ? tnum(node, "member_id") : -1;
  const room = findRoom(matchId, memberId);
  if (room) {
    const gslot = globalSlot(room, memberId, viewer);
    if (gslot > 0) room.progress[gslot] = tnum(node, "progress");
    room.progress_step = Math.max(room.progress_step, tnum(node, "step"));
    room.progress_timeup = !!(room.progress_timeup || tbool(node, "timeup"));
    room.updated_at = Date.now();
  }
  await send.object({ "@attr": { status: 0 }, ...progressXml(room || emptyRoom()) });
}

async function pcbSyncResult(info: any, data: any, send: any): Promise<void> {
  const node = data || {};
  const viewer = clientUser.get(clientKey(info)) || 0;
  cleanupRooms();
  const matchId = tnum(node, "match_id", "matching_id");
  const memberId = (node.member_id != null) ? tnum(node, "member_id") : -1;
  const room = findRoom(matchId, memberId);
  if (room) {
    const gslot = globalSlot(room, memberId, viewer);
    if (gslot > 0) {
      room.results[gslot] = {
        member_id: gslot, score: tnum(node, "score"), difficult: tnum(node, "difficult"),
        achive_new_record: tbool(node, "achive_new_record"), likes_new_record: tbool(node, "likes_new_record"),
        clear_type: tnum(node, "clear_type"), likes_score: tnum(node, "likes_score"),
        achive_emblem: tnum(node, "achive_emblem"), likes_emblem: tnum(node, "likes_emblem"),
        exp: tnum(node, "exp"), pa_class: tnum(node, "pa_class"), pa_skill: tnum(node, "pa_skill"),
        display_pa_skill: tnum(node, "display_pa_skill"),
        display_pa_skill_grade: tnum(node, "display_pa_skill_grade"),
        combo: tnum(node, "combo"), combo_new_record: tbool(node, "combo_new_record"),
      };
    }
    room.result_step = Math.max(room.result_step, tnum(node, "step"));
    room.result_timeup = !!(room.result_timeup || tbool(node, "timeup"));
    room.updated_at = Date.now();
  }
  await send.object({ "@attr": { status: 0 }, ...gameResultXml(room || emptyRoom()) });
}

async function pcbFinish(info: any, data: any, send: any): Promise<void> {
  const node = data || {};
  const matchId = tnum(node, "match_id", "matching_id");
  if (matchId) {
    const room = rooms.get(matchId);
    if (room) {
      room.finished = true;
      for (const uid of room.members.keys()) {
        if (userRoom.get(uid) === matchId) userRoom.delete(uid);
      }
      rooms.delete(matchId);
    }
    cleanupRooms();
  }
  await send.object({
    "@attr": { status: 0 },
    finish_matching: { now_date: K.ITEM("str", nowDateSpace()) },
  });
}

async function pcbSaveErrorLog(info: any, data: any, send: any): Promise<void> {
  await send.object({ "@attr": { status: 0 }, now_date: K.ITEM("str", nowDateSpace()) });
}

// --- usr.get_temp / usr.save_temp (lobby profile cards) ---

const STAMP_TAGS = new Set(["stamp_id", "chat_stamp_id", "stamp_no", "chat_stamp_no"]);

function cleanupTemp(now?: number): void {
  const t = now || Date.now();
  for (const [k, v] of tempData) {
    if (t - v.updated > TEMP_TTL_MS) tempData.delete(k);
  }
}

function leafStrOf(obj: any, key: string, def: string = ""): string {
  try {
    const v = obj ? obj[key] : undefined;
    return X.strOf({ v }, "v") || def;
  } catch { return def; }
}
function leafNumOf(obj: any, key: string, def: number = 0): number {
  try {
    const v = obj ? obj[key] : undefined;
    if (v == null) return def;
    return X.numOf({ v }, "v");
  } catch { return def; }
}

function listItems(obj: any): string[] {
  try {
    const cur = obj ? obj.usr_item : undefined;
    if (cur == null) return [];
    const arr = Array.isArray(cur) ? cur : (cur.item != null ? (Array.isArray(cur.item) ? cur.item : [cur.item]) : [cur]);
    const out: string[] = [];
    for (const e of arr) {
      const s = typeof e === "string" ? e : X.strOf({ e }, "e");
      if (s) out.push(s);
    }
    return out;
  } catch { return []; }
}

async function profileTempDefaults(usrId: number, matchId = 0, memberIndex = 0): Promise<any> {
  const profile: any = await getProfileByUsrId(usrId);
  const d = (profile && (profile as any).data) || {};
  const play = (d as any).usr_play_info || {};
  const privacy = (d as any).usr_privacy || {};
  const nametag = (d as any).usr_nametag || {};
  const pa = (d as any).pa_skill || {};
  // selected deck (best effort over echo shapes)
  let deck: any = {};
  try {
    const holder = (d as any).usr_deck;
    const arr = !holder ? [] : Array.isArray(holder) ? holder
      : (holder.deck != null ? (Array.isArray(holder.deck) ? holder.deck : [holder.deck]) : []);
    for (const c of arr) {
      const inner = (c && (c as any).deck) || c;
      if (!deck || !Object.keys(deck).length) deck = inner || {};
      const sel = inner ? X.strOf({ v: inner.is_select }, "v").trim().toLowerCase() : "";
      if (sel === "1" || sel === "true") { deck = inner; break; }
    }
  } catch { deck = {}; }
  const bool1 = (o: any, k: string, def: number) => {
    const v = o ? o[k] : undefined;
    if (v == null) return def;
    const s = X.strOf({ v }, "v").trim().toLowerCase();
    if (s === "true") return 1;
    if (s === "false") return 0;
    const n = parseInt(s, 10);
    return isNaN(n) ? def : (n ? 1 : 0);
  };
  return {
    version: 1, usr_id: Number(usrId), cpu_id: 0, member_type: 1,
    match_id: Number(matchId || 0), member_index: Number(memberIndex || 0),
    crew_id: String((profile as any)?.crew_id || "0"),
    loc_id: leafStrOf(play, "loc_id", "EA000001"),
    region: "JP-13",
    loc_name: leafStrOf(play, "shop_name", "MONKEYBUSINESS"),
    country: "JP", country_name: "Japan", country_jname: "Japan",
    region_name: "Tokyo", region_jname: "Tokyo",
    shop_name: leafStrOf(play, "shop_name", "MONKEYBUSINESS"),
    usr_name: echoUsrName(d) || "PLAYER",
    exp: leafNumOf((d as any).usr_profile || {}, "exp"),
    pa_skill: leafNumOf(pa, "skill"),
    contenter_id: leafStrOf(deck, "contenter_index"),
    another_costume_id: leafStrOf(deck, "another_costume_id", "costume.0000000000"),
    frame_id: leafStrOf(deck, "frame_id", "banner.frame.90000001"),
    pose_id: leafStrOf(deck, "pose_id", "banner.pose.90000001"),
    nametag_badge1_id: leafStrOf(nametag, "nametag_badge1_id", "0"),
    nametag_badge2_id: leafStrOf(nametag, "nametag_badge2_id", "0"),
    nametag_badge3_id: leafStrOf(nametag, "nametag_badge3_id", "0"),
    nametag_plate_id: leafStrOf(nametag, "nametag_plate_id", "nametag.plate.00000000"),
    nametag_title_id: leafStrOf(nametag, "nametag_title_id", "0"),
    disp_name_to_other: bool1(privacy, "disp_name_to_other", 1),
    disp_shop_to_other: bool1(privacy, "disp_shop_to_other", 1),
    disp_shop_to_me: bool1(privacy, "disp_shop_to_me", 1),
    disp_skill_to_other: bool1(privacy, "disp_skill_to_other", 1),
    disp_skill_to_me: bool1(privacy, "disp_skill_to_me", 1),
    usr_item: listItems(d),
    set_title_name: leafStrOf(nametag, "set_title_name"),
    set_title_rarity: leafStrOf(nametag, "set_title_rarity", "0"),
    total_play_count: leafNumOf(play, "freetime_play_count") + leafNumOf(play, "local_matching_play_count") + leafNumOf(play, "global_matching_play_count"),
    end_date: "2099-12-31 23:59:59",
  };
}

function tempUsrXml(rec: any): any {
  const s = (k: string, d: string = "") => String(rec[k] ?? d);
  const n = (k: string, d: number = 0) => Number(rec[k] ?? d) || 0;
  const memberType = (Number(rec.cpu_id) > 0 || Number(rec.member_type) === 2) ? 2 : 1;
  const out: any = {
    version: K.ITEM("s32", n("version", 1)),
    usr_id: K.ITEM("s32", n("usr_id")),
    cpu_id: K.ITEM("s32", n("cpu_id")),
    member_type: K.ITEM("s32", memberType),
    match_id: K.ITEM("s32", n("match_id")),
    member_id: K.ITEM("s32", Number(rec.member_id ?? (n("member_index") + 1))),
    member_index: K.ITEM("s32", n("member_index")),
    crew_id: K.ITEM("str", s("crew_id", "0")),
    loc_id: K.ITEM("str", s("loc_id", "EA000001")),
    region: K.ITEM("str", s("region", "JP-13")),
    loc_name: K.ITEM("str", s("loc_name", "MONKEYBUSINESS")),
    country: K.ITEM("str", s("country", "JP")),
    country_name: K.ITEM("str", s("country_name", "Japan")),
    country_jname: K.ITEM("str", s("country_jname", "Japan")),
    region_name: K.ITEM("str", s("region_name", "Tokyo")),
    region_jname: K.ITEM("str", s("region_jname", "Tokyo")),
    shop_name: K.ITEM("str", s("shop_name", "MONKEYBUSINESS")),
    usr_name: K.ITEM("str", s("usr_name", "PLAYER")),
    exp: K.ITEM("s32", n("exp")),
    pa_skill: K.ITEM("s32", n("pa_skill")),
    contenter_id: K.ITEM("str", s("contenter_id")),
    another_costume_id: K.ITEM("str", s("another_costume_id", "costume.0000000000")),
    frame_id: K.ITEM("str", s("frame_id", "banner.frame.90000001")),
    pose_id: K.ITEM("str", s("pose_id", "banner.pose.90000001")),
    nametag_badge1_id: K.ITEM("str", s("nametag_badge1_id", "0")),
    nametag_badge2_id: K.ITEM("str", s("nametag_badge2_id", "0")),
    nametag_badge3_id: K.ITEM("str", s("nametag_badge3_id", "0")),
    nametag_plate_id: K.ITEM("str", s("nametag_plate_id", "nametag.plate.00000000")),
    nametag_title_id: K.ITEM("str", s("nametag_title_id", "0")),
    disp_name_to_other: K.ITEM("s32", n("disp_name_to_other", 1)),
    disp_shop_to_other: K.ITEM("s32", n("disp_shop_to_other", 1)),
    disp_shop_to_me: K.ITEM("s32", n("disp_shop_to_me", 1)),
    disp_skill_to_other: K.ITEM("s32", n("disp_skill_to_other", 1)),
    disp_skill_to_me: K.ITEM("s32", n("disp_skill_to_me", 1)),
    usr_item: { item: (rec.usr_item || []).map((it: string) => K.ITEM("str", String(it))) },
    set_title_name: K.ITEM("str", s("set_title_name")),
    set_title_rarity: K.ITEM("str", s("set_title_rarity", "0")),
    total_play_count: K.ITEM("s32", n("total_play_count")),
    end_date: K.ITEM("str", s("end_date", "2099-12-31 23:59:59")),
    official_roles: {},
  };
  for (const tag of ["stamp_id", "chat_stamp_id", "stamp_no", "chat_stamp_no"]) {
    if (rec[tag] != null && rec[tag] !== "") out[tag] = K.ITEM("str", String(rec[tag]));
  }
  return out;
}

async function usrSaveTemp(info: any, data: any, send: any): Promise<void> {
  // data = <usr> content: flat scalars + usr_item + stamp tags
  const node = data || {};
  const usrId = X.numOf(node, "usr_id");
  if (usrId > 0) {
    const rec: any = { usr_id: usrId };
    for (const k of Object.keys(node)) {
      if (k === "@attr" || k === "usr_item") continue;
      const v = (node as any)[k];
      if (v != null && typeof v === "object" && !Array.isArray(v) && (v as any)["@content"] != null) {
        const c = (v as any)["@content"];
        rec[k] = Array.isArray(c) ? String(c[0] ?? "") : String(c ?? "");
      } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        rec[k] = String(v);
      } else if (v != null && typeof v === "object") {
        // nested struct: keep stamp-tag leaves only (like MonkeyBusiness)
        for (const sk of Object.keys(v)) {
          if (STAMP_TAGS.has(sk)) rec[sk] = X.strOf(v, sk);
        }
      }
    }
    rec.usr_item = listItems(node);
    rec.shop_name = "MONKEYBUSINESS";
    rec.loc_name = rec.loc_name || "MONKEYBUSINESS";
    tempData.set(usrId, { data: rec, updated: Date.now() });
    vlog(`[XIF] usr.save_temp usr_id=${usrId}`);
  }
  await send.object({ now_date: K.ITEM("str", nowDateSpace()) });
}

async function usrGetTemp(info: any, data: any, send: any): Promise<void> {
  cleanupTemp();
  const node = data || {};
  const matchId = X.numOf(node, "match_id");
  const viewUsr = X.numOf(node, "usr_id") || clientUser.get(clientKey(info)) || 0;
  const records: any[] = [];
  const seen = new Set<number>();
  const room = matchId ? rooms.get(matchId) : undefined;
  if (room) {
    const v = viewMembers(room);
    for (let i = 0; i < v.length; i++) {
      const m = v[i];
      const base = await profileTempDefaults(m.usr_id, matchId, i);
      const up = tempData.get(m.usr_id);
      if (up) {
        for (const [k, val] of Object.entries(up.data)) {
          if (k.startsWith("_") || val == null || val === "") continue;
          (base as any)[k] = val;
        }
      }
      base.shop_name = "MONKEYBUSINESS";
      base.loc_name = base.loc_name || "MONKEYBUSINESS";
      base.match_id = matchId;
      base.member_id = i + 1;
      base.member_index = i;
      records.push(base);
      seen.add(m.usr_id);
    }
  }
  for (const [uid, up] of tempData) {
    if (seen.has(uid)) continue;
    const upMatch = Number(up.data.match_id || 0);
    if (upMatch && upMatch !== Number(matchId || 0)) continue;
    const base = await profileTempDefaults(uid, matchId, Number(up.data.member_index || 0));
    for (const [k, val] of Object.entries(up.data)) {
      if (k.startsWith("_") || val == null || val === "") continue;
      (base as any)[k] = val;
    }
    base.shop_name = "MONKEYBUSINESS";
    base.member_id = Number(base.member_index || 0) + 1;
    records.push(base);
  }
  vlog(`[XIF] usr.get_temp match=${matchId} view=${viewUsr} records=${records.length}`);
  await send.object({ usrs: { usr: records.map(tempUsrXml) } });
}

function mroute(method: string, handler: (info: any, data: any, send: any) => Promise<any>): void {
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

export function registerMatchingRoutes(): void {
  mroute("pcb.sync_matching_room", pcbSyncRoom);
  mroute("pcb.matching_room", pcbSyncRoom);
  mroute("pcb.sync_matching_music", pcbSyncMusic);
  mroute("pcb.matching_music", pcbSyncMusic);
  mroute("pcb.sync_matching_progress", pcbSyncProgress);
  mroute("pcb.sync_matching_game_result", pcbSyncResult);
  mroute("pcb.finish_matching_room", pcbFinish);
  mroute("pcb.save_error_log", pcbSaveErrorLog);
  mroute("usr.get_temp", usrGetTemp);
  mroute("usr.save_temp", usrSaveTemp);
}
