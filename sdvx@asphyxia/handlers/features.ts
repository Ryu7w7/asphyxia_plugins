import { Profile } from '../models/profile';
import { MusicRecord } from '../models/music_record';
import { Serial } from '../models/param';
import { Matchmaker } from '../models/matchmaker';
import { getVersion, IDToCode, GetCounter, checkVerStart, loadMusicDb } from '../utils';
import { Rival } from '../models/rival';
import { Item } from '../models/item';
import { SERIAL3 } from '../data/gw';
import { SdvxRelayManager } from './relay';

var matchRooms = []

const relayEnabled = () => U.GetConfig('sdvx_relay_enabled') === true;
const relayPublicIp = () => U.GetConfig('sdvx_relay_public_ip') || '127.0.0.1';
const ipToOctets = (ip: string) => ip.split('.').map(Number);

// Builds the opponent list for the entry_s response. With the relay enabled,
// every online match is routed through this server so players behind CGNAT
// can connect (both players connect OUT to the same relay port). The relay
// port is allocated once per room and reused on re-sends.
async function opponentsWithRelay(room: any, otherPlayers: any[]): Promise<any[]> {
  if (!relayEnabled()) {
    return otherPlayers.map(e => ({
      port: K.ITEM('u16', e.port),
      gip: K.ITEM('4u8', e.gip),
      lip: K.ITEM('4u8', e.lip)
    }));
  }

  if (!room.relayPort) {
    room.relayPort = await SdvxRelayManager.getInstance().allocatePort();
    if (room.relayPort) {
      console.log(`[SDVX Relay] Room ${room.c_ver}/${room.filter}/${room.mid} -> relay ${relayPublicIp()}:${room.relayPort} (${otherPlayers.length + 1} players)`);
    } else {
      console.warn(`[SDVX Relay] No relay port available, falling back to direct connection for room ${room.c_ver}/${room.filter}/${room.mid}`);
    }
  }

  if (room.relayPort) {
    const octets = ipToOctets(relayPublicIp());
    return otherPlayers.map(e => ({
      port: K.ITEM('u16', room.relayPort),
      gip: K.ITEM('4u8', octets),
      lip: K.ITEM('4u8', octets),
      hostip_g: K.ITEM('4u8', octets),
      hostip_l: K.ITEM('4u8', octets),
      hostport_g: K.ITEM('u16', room.relayPort),
      hostport_l: K.ITEM('u16', room.relayPort),
      connport_g: K.ITEM('u16', room.relayPort),
      connport_l: K.ITEM('u16', room.relayPort),
      portfw: K.ITEM('u8', 0)
    }));
  }

  return otherPlayers.map(e => ({
    port: K.ITEM('u16', e.port),
    gip: K.ITEM('4u8', e.gip),
    lip: K.ITEM('4u8', e.lip)
  }));
}

// Hiscore is requested by every cabinet whenever a player browses the song
// list, and computing it scans ALL music records of ALL players (sync SQLite
// + JSON parse per row). With many concurrent players this blocks the event
// loop for hundreds of ms per request. The response only changes when a GLOBAL
// top is beaten: profiles.ts invalidates this cache via invalidateHiscoreIfNew
// on every save, so a long TTL just guards against missed paths.
const HISCORE_TTL_MS = 120000;
const hiscoreCache = new Map<string, { expires: number; data: any; d?: any[]; mids?: number[] }>();

// Temporary diagnostics for sv7_hiscore "property_mem_read() failed" hunting
// (logs the first N request offsets/limits per boot to D:\Asphyxia\log.txt).
const hiscoreLog = (() => { let n = 0; return () => n < 3 && n++; })();

// The cabinet (sv4+/sv5+/sv6/sv7) sends game/offset + game/limit spanning a
// range of MUSIC IDs, like MarbleBlue/Hydrogen: serve only that window and
// only fall back to the full list when the client omits the fields.
function creRange(cached: any, hasRange: boolean, offset: number, maxId: number) {
  if (!hasRange || !cached.d || !cached.mids) return cached.data;
  const d: any[] = [];
  for (let i = 0; i < cached.d.length; i++) {
    const m = cached.mids[i];
    if (m >= offset && m < maxId) d.push(cached.d[i]);
  }
  return { sc: { d } };
}

// Per-version snapshot of the current global top per song (feeds
// invalidateHiscoreOnTop). Nothing more than the last assembled hiscore
// response, kept as a compact map so a save can decide in O(1) whether the
// recorded score would CHANGE the response. If it doesn't, the cached
// response is still valid and we avoid a full music-table rescan.
const hiscoreTops = new Map<string, Map<string, { score: number; exscore: number }>>();

export function invalidateHiscoreCache() {
  hiscoreCache.clear();
}

// Called from profiles.ts save paths. Only invalidates the hiscore cache for
// this version when an actual top is beat — so the expensive full-table scan
// happens on real record improvements, not on every ordinary save.
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

export const hiscore: EPR = async (info, data, send) => {
  const version = Math.abs(getVersion(info));
  const dVersion = parseInt(info.model.split(":")[4].slice(0, -2));

  const cacheKey = `${version}:${dVersion}`;

  // The KFC cabinet family (sv4+/sv5+/sv6/sv7) pages hiscore by a RANGE of
  // music IDs inside <game><data><offset>/<limit>. Read both nesting levels
  // plus attribute fallbacks so the range is never missed.
  const gEl = data;
  const dEl = $(gEl).element('data');
  const gameEl = $(gEl).element('game');
  // pick() reads a named field from an element, trying str first then number
  // (sv7_hiscore sends offset/limit as u32, not str, so .str() returns undefined)
  const pick = (el: any, name: string): string | undefined => {
    if (el == null) return undefined;
    const s = $(el).str(name);
    if (s !== undefined && s !== '') return s;
    const n = $(el).number(name);
    if (n !== undefined && n !== null && !isNaN(n)) return String(n);
    // Direct @content array access (sv7_hiscore sends u32 typed nodes)
    const raw = (el as any)[name];
    if (raw && Array.isArray(raw['@content']) && raw['@content'].length > 0) return String(raw['@content'][0]);
    const attrs = $(el).attr();
    if (attrs && attrs[name] !== undefined && attrs[name] !== '') return String(attrs[name]);
    return undefined;
  };
  // sv7_hiscore: offset/limit are direct children of the root (gEl), typed u32
  // sv6_hiscore: they may be inside <game> or <data> sub-elements
  let rawOffset = pick(gEl, 'offset');        // root direct child (sv7)
  let rawLimit  = pick(gEl, 'limit');
  if (rawOffset === undefined) rawOffset = pick(gameEl, 'offset'); // <game><offset>
  if (rawLimit  === undefined) rawLimit  = pick(gameEl, 'limit');
  if (rawOffset === undefined) rawOffset = pick(dEl, 'offset');    // <data><offset>
  if (rawLimit  === undefined) rawLimit  = pick(dEl, 'limit');

  const offset = rawOffset !== undefined ? parseInt(rawOffset) : NaN;
  const limit = rawLimit !== undefined ? parseInt(rawLimit) : NaN;
  const hasRange = Number.isFinite(offset) && Number.isFinite(limit) && limit > 0;
  // When the cabinet sends offset/limit, respect the window (paginated mode).
  // When the cabinet omits them, serve ALL entries — RyuNET-core compresses
  // the response with LZ77 automatically (X-Compress: lz77), so even 8k+
  // entries compress from ~3MB XML to ~300KB on the wire, which the cabinet
  // handles fine. sdvx_hiscore_serve_limit is kept as a fallback escape hatch.
  const confServeLimit = parseInt(String(U.GetConfig('sdvx_hiscore_serve_limit')));
  const effOffset = hasRange ? offset : 0;
  // No range = serve everything (Infinity so creRange returns all d[]).
  // Because RyuNET-core compresses with LZ77 automatically, the full list
  // will not blow up the cabinet buffer.
  const effLimit = hasRange ? limit : Infinity;
  const maxId = hasRange ? (effOffset + effLimit) : Infinity;

  if (hiscoreLog()) {
    console.log(`[hiscore][diag] model=${info.model} version=${version} rawOffset=${String(rawOffset)} rawLimit=${String(rawLimit)} hasRange=${hasRange} serve=[${effOffset},${maxId})`);
    // Log raw request structure so we can find where offset/limit really are
    try {
      const rawStr = JSON.stringify(data, null, 2);
      console.log(`[hiscore][diag] RAW REQUEST (first 2000 chars): ${rawStr.slice(0, 2000)}`);
    } catch {}
  }

  const cached = hiscoreCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    if (hiscoreLog()) {
      console.log(`[hiscore][diag] serve_limit_conf=${String(confServeLimit)} lfields=${String(U.GetConfig('sdvx_hiscore_lfields'))} page=cached d_entries=${cached.d.length}`);
    }
    return send.object(creRange(cached, true, effOffset, maxId), { status: 0 });
  }

  const records = await DB.Find<MusicRecord>(null, { collection: 'music', version });

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
            name: K.ITEM('str', profiles[r.__refid][0].name),
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
          seq: K.ITEM('str', IDToCode(profiles[r.__refid][0].id)),
          name: K.ITEM('str', profiles[r.__refid][0].name),
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
          seq: K.ITEM('str', IDToCode(profiles[r.__refid][0].id)),
          name: K.ITEM('str', profiles[r.__refid][0].name),
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
    const lfields = U.GetConfig('sdvx_hiscore_lfields');
    const useL = !(lfields === false || String(lfields) === 'false' || String(lfields) === '0');
    const item: any = {
      id: K.ITEM('u32', rScore.mid),
      ty: K.ITEM('u32', rScore.type),
      a_sq: K.ITEM('str', sq),
      a_nm: K.ITEM('str', prof.name),
      a_sc: K.ITEM('u32', rScore.score),
    };
    if (useL) {
      item.l_sq = K.ITEM('str', sq);
      item.l_nm = K.ITEM('str', prof.name);
      item.l_sc = K.ITEM('u32', rScore.score);
    }
    if (rEx && rEx.exscore && profiles[rEx.__refid]) {
      const exProf = profiles[rEx.__refid][0];
      const exSq = String(exProf.id).padStart(8, '0');
      item.ax_sq = K.ITEM('str', exSq);
      item.ax_nm = K.ITEM('str', exProf.name);
      item.ax_sc = K.ITEM('u32', rEx.exscore);
      if (useL) {
        item.lx_sq = K.ITEM('str', exSq);
        item.lx_nm = K.ITEM('str', exProf.name);
        item.lx_sc = K.ITEM('u32', rEx.exscore);
      }
    }
    d.push(item);
  }
  if (String(U.GetConfig('sdvx_hiscore_full_catalog')) === '1') {
    const mdb = await loadMusicDb();
    const diffName = ['novice', 'advanced', 'exhaust', 'infinite', 'maximum', 'ultimate'];
    if (mdb && mdb.mdb && mdb.mdb.music) {
      for (const song of mdb.mdb.music) {
        const mid = parseInt(song.id, 10);
        const slot = song.difficulty && song.difficulty[6];
        if (!Number.isFinite(mid) || !slot) continue;
        for (let ty = 0; ty < diffName.length; ty++) {
          const lvl = slot[diffName[ty]];
          if (!lvl || String(lvl) === '0') continue;
          const key = `${mid}:${ty}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          mids.push(mid);
          const lfields = U.GetConfig('sdvx_hiscore_lfields');
          const useL = !(lfields === false || String(lfields) === 'false' || String(lfields) === '0');
          const filler: any = {
            id: K.ITEM('u32', mid),
            ty: K.ITEM('u32', ty),
            a_sq: K.ITEM('str', '00000000'),
            a_nm: K.ITEM('str', ''),
            a_sc: K.ITEM('u32', 0),
          };
          if (useL) {
            filler.l_sq = K.ITEM('str', '00000000');
            filler.l_nm = K.ITEM('str', '');
            filler.l_sc = K.ITEM('u32', 0);
          }
          d.push(filler);
        }
      }
    }
  }
  // Always serve ascending (mid, ty) — MarbleBlue sorts the same way.
  d.sort((x, y) => (x.id['@content'][0] - y.id['@content'][0]) || (x.ty['@content'][0] - y.ty['@content'][0]));
  for (let i = 0; i < d.length; i++) mids[i] = d[i].id['@content'][0];
  if (hiscoreLog()) {
    console.log(`[hiscore][diag] serve_limit_conf=${String(confServeLimit)} lfields=${String(U.GetConfig('sdvx_hiscore_lfields'))} page=fresh d_entries=${d.length} serve=[${effOffset},${maxId})`);
  }
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

  let entryData = {
    c_ver: $(data).number('c_ver'),
    p_num: $(data).number('p_num'),
    p_rest: $(data).number('p_rest'),
    filter: $(data).number('filter'),
    mid: $(data).number('mid'),
    sec: $(data).number('sec'),
    claim: $(data).number('claim'),
    entry_id: $(data).number('entry_id'),
    port: $(data).number('port'),
    gip: $(data).numbers('gip'),
    lip: $(data).numbers('lip'),
  }

  let loggip = '?.?.?.?'
  let loglip = '?.?.?.?'
  try {
    loggip = entryData.gip ? entryData.gip.join(".") : '?.?.?.?'
    loglip = entryData.lip ? entryData.lip.join(".") : '?.?.?.?'
  } catch (e: any) {
    loggip = 'ERR:' + e.message
  }
  console.log(`[entry_s] lip=${loglip} gip=${loggip} eid=${entryData.entry_id} c_ver=${entryData.c_ver} filter=${entryData.filter} mid=${entryData.mid} sec=${entryData.sec} p_num=${entryData.p_num} p_rest=${entryData.p_rest} port=${entryData.port} claim=${entryData.claim}`)

  // console.log("====================================")
  // console.log("   c_ver: " + entryData.c_ver)
  // console.log("   p_num: " + entryData.p_num) // current match player count
  // console.log("  p_rest: " + entryData.p_rest) // remaining player spaces
  // console.log("  filter: " + entryData.filter) // game mode matchmaking filter
  // console.log("     mid: " + entryData.mid)
  // console.log("     sec: " + entryData.sec) // remaining seconds
  // console.log("    port: " + entryData.port)
  // console.log("     gip: " + loggip)
  // console.log("     lip: " + loglip)
  // console.log("   claim: " + entryData.claim)
  // console.log("entry_id: " + entryData.entry_id)

  if(matchRooms.length === 0) {
    // create room if not exists
    console.log(`[${loglip} | ${loggip}] Creating new room: ver=${version} c_ver=${entryData.c_ver} filter=${entryData.filter} mid=${entryData.mid} p_num=${entryData.p_num} p_rest=${entryData.p_rest} sec=${entryData.sec}`)
    matchRooms.push({
      version: version,
      c_ver: entryData.c_ver,
      filter: entryData.filter,
      mid: entryData.mid,
      p_rest: entryData.p_rest,
      p_num: entryData.p_num,
      relayPort: null,
      players: [
        {
          gip: entryData.gip,
          lip: entryData.lip,
          port: entryData.port
        }
      ]
    })

    // delete room after sec
    setTimeout(function () {
      const search = (element) => element.players[0].lip.join('.') === entryData.lip.join('.')
      const index = matchRooms.findIndex(search)
      if (index !== -1) matchRooms.splice(index, 1)
    }, entryData.sec * 1000);

    // Allocate the relay port NOW so the host-side sdvxrelay.dll tunnel can
    // connect to it before the joiner arrives.
    if (relayEnabled()) {
      const room = matchRooms[matchRooms.length - 1];
      if (!room.relayPort) {
        room.relayPort = await SdvxRelayManager.getInstance().allocatePort();
        if (room.relayPort) {
          console.log(`[SDVX Relay] Room ${room.c_ver}/${room.filter}/${room.mid} -> relay ${relayPublicIp()}:${room.relayPort}`);
        } else {
          console.warn(`[SDVX Relay] No relay port available, room falls back to direct connection`);
        }
      }
    }

    // new room, waiting for opponents
    let opponents = {
      entry_id: K.ITEM('u32', entryData.entry_id),
    }   
    return send.object(opponents)
  } else {
    // if there are rooms
    let inRoom = false
    let roomInd = -1

    // check if lip already in a room
    for(const [ind, room] of matchRooms.entries()) {
      if(room.version === version && room.c_ver === entryData.c_ver && room.filter === entryData.filter) {
        let playInd = room.players.findIndex(p => p.lip.join('.') === entryData.lip.join('.'))
        if (playInd != -1) {
          inRoom = true
          roomInd = ind
        }
      }
    }

    // if not in room, find room with slot, add ip to players arr, get otherplayer data
    let otherPlayers = []
    if(!inRoom) {
      console.log(`[${loglip} | ${loggip}] Looking for match room. My params: ver=${version} c_ver=${entryData.c_ver} filter=${entryData.filter} mid=${entryData.mid} p_num=${entryData.p_num} p_rest=${entryData.p_rest} sec=${entryData.sec}`)
      let dataAdded = false
      for(const [ind, room] of matchRooms.entries()) {
        let why = ''
        if (room.version !== version) why = `version ${room.version} != ${version}`
        else if (room.c_ver !== entryData.c_ver) why = `c_ver ${room.c_ver} != ${entryData.c_ver}`
        else if (room.filter !== entryData.filter) why = `filter ${room.filter} != ${entryData.filter}`
        else if (room.players.length >= room.p_rest + room.p_num) why = `full (${room.players.length}/${room.p_rest + room.p_num})`
        else why = 'MATCH'
        console.log(`[${loglip}] vs room ${room.version}/${room.c_ver}/${room.filter}/${room.mid} (${room.players.length}/${room.p_rest + room.p_num}): ${why}`)
        if(why === 'MATCH') {
          matchRooms[ind].players.push({
            gip: entryData.gip,
            lip: entryData.lip,
            port: entryData.port
          })
          dataAdded = true
          otherPlayers = [...room.players]
          otherPlayers.splice(room.players.length-1, 1)

          let opponents = {
            entry_id: K.ITEM('u32', entryData.entry_id),
            entry: await opponentsWithRelay(room, otherPlayers)
          }
          console.log("[" + loglip + " | " + loggip + "] Added data to player list. Sending opponent data.")

          return send.object(opponents)
        }
      }

      // if no rooms with slot, create new
      if(!dataAdded) {
        console.log("[" + loglip + " | " + loggip + "] No available rooms, creating new room.")
        matchRooms.push({
          version: version,
          c_ver: entryData.c_ver,
          filter: entryData.filter,
          mid: entryData.mid,
          p_rest: entryData.p_rest,
          p_num: entryData.p_num,
          relayPort: null,
          players: [
            {
              gip: entryData.gip,
              lip: entryData.lip,
              port: entryData.port
            }
          ]
        })
        // delete room after sec
        setTimeout(function () {
          const search = (element) => element.players[0].lip.join('.') === entryData.lip.join('.')
          const index = matchRooms.findIndex(search)
          if (index !== -1) matchRooms.splice(index, 1)
        }, entryData.sec * 1000);
        let opponents = {
          entry_id: K.ITEM('u32', entryData.entry_id),
        }
        return send.object(opponents)
      }
    }

    // if in room, use index to find room, get otherplayer data
    else {
      let room = matchRooms[roomInd]
      let playInd = room.players.findIndex(p => p.lip.join('.') === entryData.lip.join('.'))
      otherPlayers = [...room.players]
      otherPlayers.splice(playInd, 1)
      let opponents = {
        entry_id: K.ITEM('u32', entryData.entry_id),
        entry: await opponentsWithRelay(room, otherPlayers)
      }
      console.log("[" + loglip + " | " + loggip + "] Already in room, re-sending opponent data.")
      return send.object(opponents)
    }
  }
}

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
  if(version !== 3) return send.deny()
  let date = new Date()
  let refid = $(data).str('refid')
  let serial = SERIAL3.filter(s => checkVerStart(dVersion, s.version, 1, date))

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
      type: K.ITEM('u32', i.item.type === 6 ? 3 : i.type),
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
