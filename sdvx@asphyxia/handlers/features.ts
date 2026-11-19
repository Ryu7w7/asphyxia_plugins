import { Profile } from '../models/profile';
import { MusicRecord, AutomaRecord } from '../models/music_record';
import { Serial } from '../models/param';
import { Matchmaker } from '../models/matchmaker';
import { getVersion, IDToCode, GetCounter, checkVerStart, getYMDDate, loadMusicDb } from '../utils';
import { Rival } from '../models/rival';
import { Item } from '../models/item';
import { Mix } from '../models/mix';
import { SERIAL3 } from '../data/gw';
import { SERIAL4 } from '../data/hh';
import { SdvxRelayManager } from './relay';

var matchRooms: any[] = []

// ---- Relay helpers -------------------------------------------------------

/** Read plugin config safely, return undefined if not set */
const cfgStr  = (k: string) => { try { return U.GetConfig(k) as string | undefined; } catch { return undefined; } };
const cfgBool = (k: string) => { try { return U.GetConfig(k) as boolean | undefined; } catch { return undefined; } };

/** True when the operator has enabled the relay in plugin settings */
const relayEnabled  = () => cfgBool('sdvx_relay_enabled') === true;

/** Initialize (or re-configure) relay manager from current plugin settings */
function getRelay(): SdvxRelayManager {
  const mgr = SdvxRelayManager.getInstance();
  const tcpPort = parseInt(cfgStr('sdvx_relay_tcp_port') || '5700')  || 5700;
  const udpPort = parseInt(cfgStr('sdvx_relay_udp_port') || '5854')  || 5854;
  mgr.configure(
    cfgStr('sdvx_relay_public_ip') || '127.0.0.1',
    tcpPort,
    udpPort,
    false
  );
  return mgr;
}

/** Convert dotted-decimal string "a.b.c.d" → [a,b,c,d] */
function ipToOctets(ip: string): number[] {
  return ip.split('.').map(Number);
}

/** Unique key for a player that survives CGNAT (many users share the same lip).  
 *  Uses gip (global/WAN IP) + port, which the NAT makes unique. */
function playerKey(gip: number[], port: number): string {
  return gip.join('.') + ':' + port;
}

/**
 * Write the session token to sdvxrelay_token.tmp so sdvxrelay.dll can
 * reload it without needing a static INI entry.
 * The DLL reads this file just before calling tunnel_connect().
 */
function writeTokenFile(token: number) {
  try {
    const fs  = require('fs');
    const pth = require('path');
    const candidates = [
      pth.join(process.cwd(), 'sdvxrelay_token.tmp'),
      pth.join(pth.dirname(process.execPath || '.'), 'sdvxrelay_token.tmp'),
    ];
    for (const p of candidates) {
      try { fs.writeFileSync(p, String(token) + '\n', 'utf8'); console.log(`[SDVX Relay] Token ${token} -> ${p}`); return; } catch {}
    }
    console.log('[SDVX Relay] Warning: could not write token file (DLL will use IP-based mux)');
  } catch {}
}

// Auto-start relay server if enabled (runs once at module load)
setTimeout(async () => {
  if (!relayEnabled()) return;
  try {
    const relay = getRelay();
    await relay.start();
  } catch (e: any) {
    console.log('[SDVX Relay] Failed to start: ' + e.message);
  }
}, 2000);


// Hiscore is requested by every cabinet whenever a player browses the song
// list, and computing it scans ALL music records of ALL players (sync SQLite
// + JSON parse per row). With many concurrent players this blocks the event
// loop for hundreds of ms per request. The response only changes when a GLOBAL
// top is beaten: profiles.ts invalidates this cache via invalidateHiscoreIfNew
// on every save, so a long TTL just guards against missed paths.
const HISCORE_TTL_MS = 120000;
const hiscoreCache = new Map<string, { expires: number; data: any; d?: any[]; mids?: number[] }>();

// Per-version snapshot of the current global top per song
const hiscoreTops = new Map<string, Map<string, { score: number; exscore: number }>>();

export function invalidateHiscoreCache() {
  hiscoreCache.clear();
}

// Called from profiles.ts save paths. Only invalidates the hiscore cache for
// this version when an actual top is beat.
export function invalidateHiscoreIfNew(
  cacheKey: string,
  mid: number,
  type: number,
  score: number,
  exscore: number
) {
  const tops = hiscoreTops.get(cacheKey);
  if (!tops) return;
  const key = `${mid}:${type}`;
  const cur = tops.get(key);
  if (!cur) {
    tops.set(key, { score, exscore });
    return;
  }
  if (score > cur.score || exscore > cur.exscore) {
    hiscoreCache.delete(cacheKey);
  }
}

// Snapshot the response's tops for fast invalidateHiscoreIfNew lookups.
function rememberHiscoreTops(cacheKey: string, records: any[]) {
  const tops = new Map<string, { score: number; exscore: number }>();
  for (const r of records) {
    tops.set(`${r.mid}:${r.type}`, { score: r.score || 0, exscore: r.exscore || 0 });
  }
  hiscoreTops.set(cacheKey, tops);
}

// The cabinet (sv4+/sv5+/sv6/sv7) pages hiscore by a RANGE of MUSIC IDs.
// Serve only that window when present, otherwise fall back to the full list.
function creRange(cached: any, hasRange: boolean, offset: number, maxId: number) {
  if (!hasRange || !cached.d || !cached.mids) return cached.data;
  const d: any[] = [];
  for (let i = 0; i < cached.d.length; i++) {
    const m = cached.mids[i];
    if (m >= offset && m < maxId) d.push(cached.d[i]);
  }
  return { sc: { d } };
}

export const hiscore: EPR = async (info, data, send) => {
  const version = Math.abs(getVersion(info));
  const dVersion = parseInt(info.model.split(":")[4].slice(0, -2));

  const cacheKey = `${version}:${dVersion}`;

  // The KFC cabinet family pages hiscore by a RANGE of music IDs inside
  // <game><data><offset>/<limit>. Read both nesting levels plus attribute
  // fallbacks so the range is never missed.
  const gEl = data;
  const dEl = $(gEl).element('data');
  const gameEl = $(gEl).element('game');
  const pick = (el: any, name: string): string | undefined => {
    if (el == null) return undefined;
    const s = $(el).str(name);
    if (s !== undefined && s !== '') return s;
    const n = $(el).number(name);
    if (n !== undefined && n !== null && !isNaN(n)) return String(n);
    const raw = (el as any)[name];
    if (raw && Array.isArray(raw['@content']) && raw['@content'].length > 0) return String(raw['@content'][0]);
    const attrs = $(el).attr();
    if (attrs && attrs[name] !== undefined && attrs[name] !== '') return String(attrs[name]);
    return undefined;
  };
  let rawOffset = pick(gEl, 'offset');
  let rawLimit  = pick(gEl, 'limit');
  if (rawOffset === undefined) rawOffset = pick(gameEl, 'offset');
  if (rawLimit  === undefined) rawLimit  = pick(gameEl, 'limit');
  if (rawOffset === undefined) rawOffset = pick(dEl, 'offset');
  if (rawLimit  === undefined) rawLimit  = pick(dEl, 'limit');

  const offset = rawOffset !== undefined ? parseInt(rawOffset) : NaN;
  const limit = rawLimit !== undefined ? parseInt(rawLimit) : NaN;
  const hasRange = Number.isFinite(offset) && Number.isFinite(limit) && limit > 0;
  const effOffset = hasRange ? offset : 0;
  const effLimit = hasRange ? limit : Infinity;
  const maxId = hasRange ? (effOffset + effLimit) : Infinity;

  const cached = hiscoreCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return send.object(creRange(cached, true, effOffset, maxId), { status: 0 });
  }

  const records = await DB.Find<MusicRecord>(null, { collection: 'music', version, mid: {$nin: [1259]} });

  const profiles = _.groupBy(
    await DB.Find<Profile>(null, { collection: 'profile', version }),
    '__refid'
  );

  const cache = (data: any, d?: any[], mids?: number[]) => {
    rememberHiscoreTops(cacheKey, records);
    hiscoreCache.set(cacheKey, { expires: Date.now() + HISCORE_TTL_MS, data, d, mids });
  };

  if (version === 1) {
    const response = {
      hiscore: K.ATTR({ type: "1" }, {
        music: _.map(
          _.groupBy(records, r => `${r.mid}:${r.type}`),
          r => _.maxBy(r, 'score')
        ).map(r => (
          K.ATTR({ id: r.mid.toString() }, {
          note: K.ATTR({ type: r.type.toString() }, {
            name: K.ITEM('str', profiles[r.__refid]?.[0]?.name ?? ''),
            score: K.ITEM('u32', r.score)
          })
        }))),
      })
    };
    cache(response);
    return send.object(response);
  }

  if (version === 2 || (version === 3 && dVersion === 20151116)) {
    let profCnt = await DB.Count<Profile>(null, {collection: 'profile', version})
    const response = {
      hiscore_allover: {
        info: _.map(
          _.groupBy(records, r => `${r.mid}:${r.type}`),
          r => _.maxBy(r, 'score')
        ).map(r => ({
          id: K.ITEM('u32', r.mid),
          type: K.ITEM('u32', r.type),
          seq: K.ITEM('str', IDToCode(profiles[r.__refid]?.[0]?.id ?? 0)),
          name: K.ITEM('str', profiles[r.__refid]?.[0]?.name ?? ''),
          score: K.ITEM('u32', r.score)
        }))
      },
      hiscore_location: {
        info: _.map(
          _.groupBy(records, r => `${r.mid}:${r.type}`),
          r => _.maxBy(r, 'score')
        ).map(r => ({
          id: K.ITEM('u32', r.mid),
          type: K.ITEM('u32', r.type),
          seq: K.ITEM('str', IDToCode(profiles[r.__refid]?.[0]?.id ?? 0)),
          name: K.ITEM('str', profiles[r.__refid]?.[0]?.name ?? ''),
          score: K.ITEM('u32', r.score)
        }))
      },
      clear_rate: {
        d: _.map(
          _.groupBy(records, r => `${r.mid}:${r.type}`),
          group => {
            const filt = _.filter(group, g => g.clear > 1).length
            return {
              id: K.ITEM('u32', group[0].mid),
              type: K.ITEM('u32', group[0].type),
              cr: K.ITEM('s16', Math.ceil((filt / profCnt) * 10000))
            }
          }
        )
      }
    };
    cache(response);
    return send.object(response);
  }

  const groups = _.groupBy(records, r => `${r.mid}:${r.type}`);
  const d: any[] = [];
  const mids: number[] = [];
  const seenKeys = new Set<string>();
  for (const group of Object.values(groups)
    .sort((a, b) => a[0].mid - b[0].mid || a[0].type - b[0].type)) {
    const rScore = _.maxBy(group, 'score');
    const rEx = _.maxBy(group, 'exscore');
    const prof = rScore && profiles[rScore.__refid] ? profiles[rScore.__refid][0] : null;
    if (!rScore || !prof) continue;
    mids.push(rScore.mid);
    seenKeys.add(`${rScore.mid}:${rScore.type}`);
    const sq = String(prof.id).padStart(8, '0');
    const item: any = {
      id: K.ITEM('u32', rScore.mid),
      ty: K.ITEM('u32', rScore.type),
      a_sq: K.ITEM('str', sq),
      a_nm: K.ITEM('str', prof.name),
      a_sc: K.ITEM('u32', rScore.score),
      l_sq: K.ITEM('str', sq),
      l_nm: K.ITEM('str', prof.name),
      l_sc: K.ITEM('u32', rScore.score),
    };
    if (rEx && rEx.exscore && profiles[rEx.__refid]) {
      const exProf = profiles[rEx.__refid][0];
      const exSq = String(exProf.id).padStart(8, '0');
      item.ax_sq = K.ITEM('str', exSq);
      item.ax_nm = K.ITEM('str', exProf.name);
      item.ax_sc = K.ITEM('u32', rEx.exscore);
      item.lx_sq = K.ITEM('str', exSq);
      item.lx_nm = K.ITEM('str', exProf.name);
      item.lx_sc = K.ITEM('u32', rEx.exscore);
    }
    d.push(item);
  }
  // Always serve ascending (mid, ty)
  d.sort((x, y) => (x.id['@content'][0] - y.id['@content'][0]) || (x.ty['@content'][0] - y.ty['@content'][0]));
  for (let i = 0; i < d.length; i++) mids[i] = d[i].id['@content'][0];
  const response = { sc: { d } };
  cache(response, d, mids);
  return send.object(creRange({ d, mids, data: response }, true, effOffset, maxId), { status: 0 });
};

export const rival: EPR = async (info, data, send) => {
  const version = Math.abs(getVersion(info));
  const dVersion = parseInt(info.model.split(":")[4].slice(0, -2));
  let refid = $(data).str('refid', ((version === 2 || version === 3) ? $(data).str('dataid') : $(data).attr().dataid));
  if (!refid) return send.deny();

  const rivals = (
    await DB.Find<Rival>(refid, { collection: 'rival', version })
  ).filter(p => p.refid != refid);

  return send.object({
    rival: await Promise.all(
      rivals.map(async (p, index) => {
        return {
          no: K.ITEM('s16', index),
          seq: K.ITEM('str', IDToCode(p.sdvxID)),
          name: K.ITEM('str', p.name),
          music: (
            await DB.Find<MusicRecord>(p.refid, { collection: 'music', version })
          ).map(r => ({
            // Version 2023042500 added exscore to rival data.
            param: K.ARRAY('u32', dVersion < 20230425 ? [r.mid, r.type, r.score, r.clear, r.grade] : [r.mid, r.type, r.score, r.exscore, r.clear, r.grade]),
          })),
        };
      })
    ),
  });
};

export const entryE: EPR = async (info, data, send) => {
  console.log("entry_e id: " + $(data).number('eid'))
  send.success()
}

export const globalMatch: EPR = async (info, data, send) => {
  const version = Math.abs(getVersion(info));
  const useRelay = relayEnabled();

  const entryData = {
    c_ver:    $(data).number('c_ver'),
    p_num:    $(data).number('p_num'),
    p_rest:   $(data).number('p_rest'),
    filter:   $(data).number('filter'),
    mid:      $(data).number('mid'),
    sec:      $(data).number('sec'),
    claim:    $(data).number('claim'),
    entry_id: $(data).number('entry_id'),
    port:     $(data).number('port'),
    gip:      $(data).numbers('gip'),
    lip:      $(data).numbers('lip'),
  };

  const loggip = entryData.gip.join('.');
  const loglip = entryData.lip.join('.');
  const pkey   = playerKey(entryData.gip, entryData.port);
  const tag    = useRelay ? '[relay]' : '[vpn]';

  // -----------------------------------------------------------------------
  // Helper: build the entry objects that go back in the response.
  // In relay mode   → all opponents point to relay IP:tcpPort.
  //                   The session token is encoded as the port field of the
  //                   FIRST entry so sdvxrelay.dll can read it from entry_s.
  //                   Real relay tcp port is encoded in gip[3]/lip[3] bytes.
  // In VPN/LAN mode → opponents point to each other's real IP:port.
  // -----------------------------------------------------------------------
  const buildEntryList = (opponents: any[], relayToken?: number) => {
    if (useRelay && relayToken !== undefined) {
      const relay = getRelay();
      const relayOctets = ipToOctets(relay.getPublicIp());
      const tcpPort = relay.getTcpPort();
      // Encode session token in the port field so DLL can retrieve it.
      // All entries point to the relay; DLL/game connects to relay_ip:tcpPort.
      return opponents.map((_e, i) => ({
        // First entry encodes the token in upper 16 bits of a 32b field,
        // but since port is u16 we encode tcpPort normally.
        // DLL reads the separate token from a query-string parameter added
        // to the NEXT entry_s poll — or from the relay_token header.
        port: K.ITEM('u16', tcpPort),
        gip:  K.ITEM('4u8', relayOctets),
        lip:  K.ITEM('4u8', relayOctets),
      }));
    }
    // VPN / LAN mode: return real IPs as-is
    return opponents.map(e => ({
      port: K.ITEM('u16', e.port),
      gip:  K.ITEM('4u8', e.gip),
      lip:  K.ITEM('4u8', e.lip),
    }));
  };

  // -----------------------------------------------------------------------
  // Helper: create a new room.  In relay mode, register a relay session.
  // -----------------------------------------------------------------------
  const createRoom = async () => {
    let relayToken: number | null = null;
    if (useRelay) {
      const relay = getRelay();
      await relay.start();
      relayToken = relay.registerSession();
      // Pre-register host WAN IP for UDP routing
      relay.linkJoinerIp(relayToken, entryData.gip.join('.'));
      // Write token to file so sdvxrelay.dll can read it at tunnel-connect time
      writeTokenFile(relayToken);
      console.log(`[SDVX Match][${tag}] ${loglip}|${loggip} – relay session token=${relayToken}`);
    }

    const room: any = {
      version,
      c_ver:      entryData.c_ver,
      filter:     entryData.filter,
      mid:        entryData.mid,
      p_rest:     entryData.p_rest,
      p_num:      entryData.p_num,
      relayToken: relayToken,
      creatorKey: pkey,
      sec:        entryData.sec,
      players: [{
        gip:  entryData.gip,
        lip:  entryData.lip,
        port: entryData.port,
        key:  pkey,
      }],
    };
    matchRooms.push(room);

    // Auto-expire
    const ttl = (entryData.sec > 0 ? entryData.sec : 60) * 1000 + 30000;
    setTimeout(() => {
      const idx = matchRooms.findIndex(r => r.creatorKey === pkey && r.version === version);
      if (idx !== -1) {
        const r = matchRooms[idx];
        console.log(`[SDVX Match] Expiring room – ${r.creatorKey}`);
        if (useRelay && r.relayToken != null) getRelay().releaseSession(r.relayToken);
        matchRooms.splice(idx, 1);
      }
    }, ttl);

    return room;
  };

  // -----------------------------------------------------------------------
  // Check if this player is already registered in any room
  // -----------------------------------------------------------------------
  let inRoom = false;
  let roomInd = -1;

  for (const [ind, room] of matchRooms.entries()) {
    if (room.version !== version || room.c_ver !== entryData.c_ver || room.filter !== entryData.filter) continue;
    const playInd = room.players.findIndex((p: any) => p.key === pkey);
    if (playInd !== -1) { inRoom = true; roomInd = ind; break; }
  }

  // -----------------------------------------------------------------------
  // Player already in a room → poll: return current opponent list
  // -----------------------------------------------------------------------
  if (inRoom) {
    const room = matchRooms[roomInd];
    const playInd = room.players.findIndex((p: any) => p.key === pkey);
    const others  = room.players.filter((_: any, i: number) => i !== playInd);
    const opponents: any = {
      entry_id: K.ITEM('u32', entryData.entry_id),
      entry:    buildEntryList(others, room.relayToken),
    };
    // In relay mode, also send session token so DLL can configure itself
    if (useRelay && room.relayToken != null)
      opponents.relay_token = K.ITEM('u32', room.relayToken);
    if (others.length > 0)
      console.log(`[SDVX Match][${tag}] ${loglip}|${loggip} – poll: ${others.length} opponent(s)`);
    return send.object(opponents);
  }

  // -----------------------------------------------------------------------
  // Player not in a room yet
  // -----------------------------------------------------------------------

  // Try to find an existing room with a free slot
  for (const [ind, room] of matchRooms.entries()) {
    if (room.version !== version || room.c_ver !== entryData.c_ver || room.filter !== entryData.filter) continue;
    if (room.players.length >= room.p_rest + room.p_num) continue; // full

    // Join this room
    room.players.push({ gip: entryData.gip, lip: entryData.lip, port: entryData.port, key: pkey });
    // Register joiner WAN IP for UDP routing
    if (useRelay && room.relayToken != null)
      getRelay().linkJoinerIp(room.relayToken, entryData.gip.join('.'));

    const others = room.players.slice(0, -1);
    console.log(`[SDVX Match][${tag}] ${loglip}|${loggip} – joined (token=${room.relayToken ?? 'none'}), ${others.length} opponent(s)`);

    const resp: any = {
      entry_id: K.ITEM('u32', entryData.entry_id),
      entry:    buildEntryList(others, room.relayToken),
    };
    if (useRelay && room.relayToken != null)
      resp.relay_token = K.ITEM('u32', room.relayToken);
    return send.object(resp);
  }

  // No room with a free slot → create a new one
  console.log(`[SDVX Match][${tag}] ${loglip}|${loggip} – creating room (c_ver=${entryData.c_ver}, mode=${entryData.filter})`);
  await createRoom();

  // First response to the host: no rivals yet
  return send.object({ entry_id: K.ITEM('u32', entryData.entry_id) });
};

export const lounge: EPR = async (info, data, send) => {
  const version = Math.abs(getVersion(info));
  let filter = $(data).number('filter')
  let matches = matchRooms.filter(room => room.version === version && room.filter === filter)
  if(matches.length < 1) {
    send.object({
      interval: K.ITEM('u32', 5)
    })
  } else {
    let longestWait = Math.max(...matches.map(m => m.sec))
    send.object({
      interval: K.ITEM('u32', 10),
      wait: K.ITEM('u32', longestWait)
    })
  }
}

export const serial: EPR = async (info, data, send) => {
  const version = Math.abs(getVersion(info));
  const dVersion = parseInt(info.model.split(":")[4].slice(0, -2));
  if(version < 3) return send.deny()
  let date = new Date()
  let refid = $(data).str('refid')

  let serial
  switch(version) {
    case 3:
      serial = SERIAL3.filter(s => checkVerStart(dVersion, s.version, 1, date))
      break
    case 4:
      serial = SERIAL4.filter(s => checkVerStart(dVersion, s.version, 1, date))
  }

  const code = parseInt($(data).str('code'))
  let used = await DB.FindOne<Serial>(refid, {collection: 'serial', version})
  let usedInd = used ? used.list.findIndex(l => l === code) : -1
  let found = serial.find(s => s.code === code)
  let result = 0
  if(!found) result = 2
  else if(usedInd >= 0 && found.onetime) result = 3 

  let finItems = []
  if(result === 0) {
    for(const item of found.items) {
      await DB.Upsert<Item>(refid, {collection: 'item', version, type: item.type, id: item.id}, {
        $inc: {
          param: item.param
        }
      })
      finItems.push({item: await DB.FindOne<Item>(refid, {collection: 'item', version, type: item.type, id: item.id}), param: item.param})
    }

    if(usedInd < 0) {
      await DB.Upsert<Serial>(refid, {collection: 'serial', version}, {
        $push: {
          list: code
        }
      })
    } 
  } else {
    return send.object({
      result: K.ITEM('s8', result),
      serial_name: K.ITEM('str', "__"),
      gamecoin_packet: K.ITEM('u32', 0),
      gamecoin_block: K.ITEM('u32', 0),
      blaster_energy: K.ITEM('u32', 0),
    })
  }

  return send.object({
    //success, congest, invalid, used
    result: K.ITEM('s8', result), 
    serial_name: K.ITEM('str', "__"),
    item: finItems.map(i => ({
      type: K.ITEM('u32', i.item.type === 6 ? 3 : i.item.type),
      id: K.ITEM('u32', i.item.id),
      param: K.ITEM('u32', i.param),
      param_after: K.ITEM('u32', i.item.param),
    })),
    gamecoin_packet: K.ITEM('u32', found.pc),
    gamecoin_block: K.ITEM('u32', found.blc),
    blaster_energy: K.ITEM('u32', found.energy),
  })

  // return send.object({
  //   result: K.ITEM('s8', 0),
  //   serial_name: K.ITEM('str', "THis are an test"),
  //   item: [
  //     {
  //       type: K.ITEM('u32', 3),
  //       id: K.ITEM('u32', 1),
  //       param: K.ITEM('u32', 30),
  //       param_after: K.ITEM('u32', 35),
  //     }
  //   ],
  //   gamecoin_packet: K.ITEM('u32', 1000),
  //   gamecoin_block: K.ITEM('u32', 100),
  //   blaster_energy: K.ITEM('u32', 69),
  // })
}

export const saveAp: EPR = async (info, data, send) => {
  const date = new Date()
  const currentYMDDate = getYMDDate(date)
  const version = Math.abs(getVersion(info))
  let refid = $(data).str('ref_id')

  const profile = await DB.FindOne<Profile>(refid, {collection: 'profile', version})
  if (!profile) return send.deny();

  const mix = $(data).element('automation');
  const id = await GetCounter('mix');
  let code = _.padStart(_.random(0, 999999999999).toString(), 12, '0');
  while (await DB.FindOne<Mix>({ collection: 'mix', code, version })) {
    code = _.padStart(_.random(0, 999999999999).toString(), 12, '0');
  }

  const doc = await DB.Insert<Mix>(refid, {
    collection: 'mix',
    version,
    id,
    code,
    name: mix.str('mix_name'),
    creator: profile.name,
    param: mix.str('generate_param'),
    tag: mix.number('tag_bit'),
    jacket: mix.number('jacket_id'),
    likes: 0
  });

  return send.object({
    automation: {
      mix_id: K.ITEM('s32', id),
      mix_code: K.ITEM('str', doc.code),
      seq: K.ITEM('str', doc.code),
      mix_name: K.ITEM('str', doc.name),
      player_name: K.ITEM('str', doc.creator),
      generate_param: K.ITEM('str', doc.param),
      distribution_date: K.ITEM('u32', currentYMDDate),
      jacket_id: K.ITEM('s32', doc.jacket),
      tag_bit: K.ITEM('s32', doc.tag),
      like_flg: K.ITEM('bool', 0),
    },
  });
}

export const loadAp: EPR = async (info, data, send) => {
  const version = Math.abs(getVersion(info));
  const code = $(data).str('mix_code');
  let refid = $(data).str('ref_id')
  const profile = await DB.FindOne<Profile>(refid, {collection: 'profile', version})
  if (!profile) return send.deny();

  const mix = await DB.FindOne<Mix>(null, { collection: 'mix', code, version });
  if (!mix) {
    return send.object({ result: K.ITEM('s32', 1) });
  }

  const record = await DB.FindOne<AutomaRecord>(refid, {collection: 'automa', id: mix.id})
  const createDate = new Date(record['createdAt'])

  return send.object({
    automation: {
      mix_id: K.ITEM('s32', mix.id),
      mix_code: K.ITEM('str', mix.code),
      seq: K.ITEM('str', mix.code),
      mix_name: K.ITEM('str', mix.name),
      player_name: K.ITEM('str', mix.creator),
      generate_param: K.ITEM('str', mix.param),
      distribution_date: K.ITEM('u32', getYMDDate(createDate)),
      jacket_id: K.ITEM('s32', mix.jacket),
      tag_bit: K.ITEM('s32', mix.tag),
      like_flg: K.ITEM('bool', record.like),
      record: {
        param: K.ARRAY('u32', [
          mix.id, 0, record.score, record.clear, record.grade, 0
        ])
      }
    },
  });
}
