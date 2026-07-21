import { Profile } from '../models/profile';
import { MusicRecord } from '../models/music_record';
import { Serial } from '../models/param';
import { Matchmaker } from '../models/matchmaker';
import { getVersion, IDToCode, GetCounter, checkVerStart } from '../utils';
import { Rival } from '../models/rival';
import { Item } from '../models/item';
import { SERIAL3 } from '../data/gw';

var matchRooms = []

const hiscoreCache: Record<number, any> = {};
const hiscoreLastUpdate: Record<number, number> = {};
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes

export function invalidateHiscoreCache() {
  for (const key in hiscoreCache) {
    delete hiscoreCache[key];
    delete hiscoreLastUpdate[key];
  }
}

export const hiscore: EPR = async (info, data, send) => {
  const version = Math.abs(getVersion(info));
  console.log(`[hiscore] Received hiscore request for version: ${version}`);
  const dVersion = parseInt(info.model.split(":")[4].slice(0, -2));

  if (hiscoreCache[version] && (Date.now() - hiscoreLastUpdate[version] < CACHE_TTL)) {
    return send.object(_.cloneDeep(hiscoreCache[version]));
  }

  // For SDVX 6 (Exceed Gear) and 7 (Valkyrie Model), scores can be stored
  // under either version depending on when/how they were saved (in-game saves
  // under the active version; imports may default to version 6).
  // We fetch profiles and records from BOTH versions and pick the best score
  // per (player × mid × type) so the leaderboard is always fully populated.
  const versionsToSearch = (version === 6 || version === 7) ? [6, 7] : [version];

  // Gather ALL profiles across the relevant versions, deduplicated by refid
  // (prefer the profile whose version matches the requesting client).
  // __refid is injected at runtime by the DB layer (not in the Profile type).
  const profilesByRefid: Record<string, any> = {};
  for (const v of versionsToSearch) {
    const list = await DB.Find<Profile>(null, { collection: 'profile', version: v });
    for (const p of (list || []) as any[]) {
      if (!p.__refid) continue;
      // Keep the one whose version matches the current game; fall back to any.
      if (!profilesByRefid[p.__refid] || p.version === version) {
        profilesByRefid[p.__refid] = p;
      }
    }
  }
  const profileList: any[] = Object.values(profilesByRefid);
  // Keep the original groupBy structure so the rest of the handler stays unchanged.
  const profiles: Record<string, any[]> = {};
  for (const p of profileList) {
    if (!profiles[p.__refid]) profiles[p.__refid] = [];
    profiles[p.__refid].push(p);
  }

  // Fetch music records for each player across all relevant versions, then
  // deduplicate: for the same (refid, mid, type) keep the highest score.
  const bestRecordKey = (r: MusicRecord & { __refid?: string }, refid: string) => `${refid}:${r.mid}:${r.type}`;
  const bestRecords: Record<string, MusicRecord & { __refid?: string }> = {};

  for (const p of profileList) {
    if (!p.__refid) continue;
    for (const v of versionsToSearch) {
      try {
        const recs = await DB.Find<MusicRecord>(p.__refid, { collection: 'music', version: v });
        for (const r of (recs || []) as any[]) {
          const key = bestRecordKey(r, p.__refid);
          if (!bestRecords[key] || r.score > bestRecords[key].score) {
            bestRecords[key] = { ...r, __refid: p.__refid };
          }
        }
      } catch { /* skip on error */ }
    }
  }

  const records = Object.values(bestRecords).filter(
    r => profiles[r.__refid] && profiles[r.__refid].length > 0
  );

  let result: any;

  try {
    if (version === 1) {
      result = {
        hiscore: K.ATTR({ type: "1" }, {
          music: _.map(
            _.groupBy(records, r => `${r.mid}:${r.type}`),
            group => {
              const r = _.maxBy(group, 'score');
              return K.ATTR({ id: r.mid.toString() }, {
                note: K.ATTR({ type: r.type.toString() }, {
                  name: K.ITEM('str', profiles[r.__refid][0].name),
                  score: K.ITEM('u32', r.score),
                })
              })
            }
          )
        })
      };
    } else if (version === 2 || (version === 3 && dVersion === 20151116)) {
      let profCnt = Object.keys(profiles).length;
      result = {
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
    } else {
      result = {
        sc: {
          d: _.map(
            _.groupBy(records, r => `${r.mid}:${r.type}`),
            group => {
              const rScore = _.maxBy(group, 'score');
              const profile = profiles[rScore.__refid]?.[0];
              const pId = profile?.id || 0;
              const pName = profile?.name || 'UNKNOWN';

              return {
                id: K.ITEM('u32', rScore.mid),
                ty: K.ITEM('u32', rScore.type),
                a_sq: K.ITEM('str', IDToCode(pId)),
                a_nm: K.ITEM('str', pName),
                a_sc: K.ITEM('u32', rScore.score),
                l_sq: K.ITEM('str', IDToCode(pId)),
                l_nm: K.ITEM('str', pName),
                l_sc: K.ITEM('u32', rScore.score),
              };
            }
          )
        }
      };
    }

    try {
      IO.WriteFile('hiscore_debug.json', JSON.stringify({
        records_length: records.length,
        sc_d_length: result.sc ? result.sc.d.length : 0,
        sample: result.sc ? result.sc.d.slice(0, 5) : null
      }));
    } catch(e) {}

    hiscoreCache[version] = result;
    hiscoreLastUpdate[version] = Date.now();
    return send.object(_.cloneDeep(result));
  } catch (err) {
    console.error("Error in hiscore processing:", err);
    return send.object({ sc: { d: [] } });
  }
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

  const RELAY_URL = "http://127.0.0.1:8717/allocate";
  const RELAY_PUBLIC_IP = "165.1.125.122";
  const ENABLE_RELAY = true;

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

  let loggip = entryData.gip.join(".")
  let loglip = entryData.lip.join(".")

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

  if (matchRooms.length === 0) {
    // create room if not exists
    console.log("[" + loglip + " | " + loggip + "] Creating new room: " + entryData.c_ver + " - " + entryData.filter + " - " + entryData.mid)
    matchRooms.push({
      version: version,
      c_ver: entryData.c_ver,
      filter: entryData.filter,
      mid: entryData.mid,
      p_rest: entryData.p_rest,
      p_num: entryData.p_num,
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
      console.log("[" + loglip + " | " + loggip + "] Deleting expired room: " + entryData.c_ver + " - " + entryData.filter + -  + entryData.mid)
      const search = (element) => element.players[0].lip.join('.') === entryData.lip.join('.')
      const index = matchRooms.findIndex(search)
      matchRooms.splice(index, 1)
    }, entryData.sec * 1000);

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
    for (const [ind, room] of matchRooms.entries()) {
      if (room.version === version && room.c_ver === entryData.c_ver && room.filter === entryData.filter && room.mid === entryData.mid) {
        let playInd = room.players.findIndex(p => p.lip.join('.') === entryData.lip.join('.'))
        if (playInd != -1) {
          inRoom = true
          roomInd = ind
        }
      }
    }

    // if not in room, find room with slot, add ip to players arr, get otherplayer data
    let otherPlayers = []
    if (!inRoom) {
      console.log(`[${loglip} | ${loggip}] Looking for match room. My params: ${version} - ${entryData.c_ver} - ${entryData.filter} - ${entryData.mid}`)
      let dataAdded = false
      for(const [ind, room] of matchRooms.entries()) {
        console.log(`Comparing with Room: ${room.version} - ${room.c_ver} - ${room.filter} - ${room.mid}`);
        // REGLAS PARA PRODUCCIÓN (Matchmaker Flexible)
        // Se respeta la versión del juego y el modo (Megamix vs Arena), pero ignora el rango (mid)
        if(room.version === version && room.c_ver === entryData.c_ver && room.filter === entryData.filter) {
          if (room.players.length < room.p_rest + room.p_num) {
            matchRooms[ind].players.push({
              gip: entryData.gip,
              lip: entryData.lip,
              port: entryData.port
            })
            dataAdded = true
            otherPlayers = [...room.players]
            otherPlayers.splice(room.players.length - 1, 1)

            let opponents = await buildOpponents(matchRooms[ind], matchRooms[ind].players.length - 1);
            console.log("[" + loglip + " | " + loggip + "] Added data to player list. Sending opponent data.")

            return send.object(opponents)
          }
        }
      }

      // if no rooms with slot, create new
      if (!dataAdded) {
        console.log("[" + loglip + " | " + loggip + "] No available rooms, creating new room.")
        matchRooms.push({
          version: version,
          c_ver: entryData.c_ver,
          filter: entryData.filter,
          mid: entryData.mid,
          p_rest: entryData.p_rest,
          p_num: entryData.p_num,
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
          console.log("[" + loglip + " | " + loggip + "] Deleting expired room: " + entryData.c_ver + " - " + entryData.filter + -  + entryData.mid)
          matchRooms.splice(index, 1)
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

      let opponents = await buildOpponents(room, playInd);

      // console.log("[" + loglip + " | " + loggip + "] Already in room, re-sending opponent data.")
      return send.object(opponents)
    }
  }

  // Helper function para asignar puertos del Relay a los oponentes
  async function buildOpponents(room, playInd) {
    let otherPlayers = [...room.players]
    otherPlayers.splice(playInd, 1)

    let proxyEntries = [];

    if (ENABLE_RELAY && otherPlayers.length > 0) {
      try {
        let relayReq = {
          sessionId: room.c_ver + "_" + room.mid + "_" + room.filter,
          players: room.players.map(p => ({
            id: p.lip.join('.'),
            gip: p.gip.join('.')
          }))
        };

        // Usa http nativo para compatibilidad con Node.js 16 de RyuNET
        const http = require('http');
        const postData = JSON.stringify(relayReq);
        const options = {
          hostname: '127.0.0.1',
          port: 8080,
          path: '/allocate',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const data: any = await new Promise((resolve, reject) => {
          const req = http.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
            });
          });
          req.on('error', reject);
          req.write(postData);
          req.end();
        });

        if (data && data.ports) {
          proxyEntries = otherPlayers.map(e => {
            let targetId = e.lip.join('.');
            let targetRelayPort = data.ports[targetId];
            let relayIpArr = RELAY_PUBLIC_IP.split('.').map(Number);

            // Restaurado el Bypass de LAN
            if (e.gip.join('.') === loggip && e.lip[0] === entryData.lip[0] && e.lip[1] === entryData.lip[1]) {
              return {
                port: K.ITEM('u16', e.port),
                gip: K.ITEM('4u8', e.gip),
                lip: K.ITEM('4u8', e.lip)
              };
            }

            return {
              port: K.ITEM('u16', targetRelayPort),
              gip: K.ITEM('4u8', relayIpArr),
              lip: K.ITEM('4u8', relayIpArr) // Engañar a SDVX para enrutar todo al Relay
            };
          });
        }
      } catch (e) {
        console.error("[Relay] Error allocating ports: " + e);
      }
    }

    if (proxyEntries.length === 0 && otherPlayers.length > 0) {
      // Fallback a IP directa si el relay falla o está apagado
      proxyEntries = otherPlayers.map(e => ({
        port: K.ITEM('u16', e.port),
        gip: K.ITEM('4u8', e.gip),
        lip: K.ITEM('4u8', e.lip)
      }));
    }

    let res: any = {
      entry_id: K.ITEM('u32', entryData.entry_id)
    };
    if (proxyEntries.length > 0) {
      res.entry = proxyEntries;
    }
    return res;
  }
}

export const lounge: EPR = async (info, data, send) => {
  const version = Math.abs(getVersion(info));
  let filter = $(data).number('filter')
  let matches = matchRooms.filter(room => room.version === version && room.filter === filter)
  if (matches.length < 1) {
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
  if (version !== 3) return send.deny()
  let date = new Date()
  let refid = $(data).str('refid')
  let serial = SERIAL3.filter(s => checkVerStart(dVersion, s.version, 1, date))

  const code = parseInt($(data).str('code'))
  let used = await DB.FindOne<Serial>(refid, { collection: 'serial', version })
  let usedInd = used ? used.list.findIndex(l => l === code) : -1
  let found = serial.find(s => s.code === code)
  let result = 0
  if (!found) result = 2
  else if (usedInd >= 0 && found.onetime) result = 3

  let finItems = []
  if (result === 0) {
    for (const item of found.items) {
      await DB.Upsert<Item>(refid, { collection: 'item', version, type: item.type, id: item.id }, {
        $inc: {
          param: item.param
        }
      })
      finItems.push({ item: await DB.FindOne<Item>(refid, { collection: 'item', version, type: item.type, id: item.id }), param: item.param })
    }

    if (usedInd < 0) {
      await DB.Upsert<Serial>(refid, { collection: 'serial', version }, {
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
