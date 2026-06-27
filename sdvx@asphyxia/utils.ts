import {Counter} from './models/counter';

export function IDToCode(id: number) {
  const padded = _.padStart(id.toString(), 8);
  return `${padded.slice(0, 4)}-${padded.slice(4)}`;
}

export async function GetCounter(key: string) {
  return (
    await DB.Upsert<Counter>(
      { collection: 'counter', key: 'mix' },
      { $inc: { value: 1 } }
    )
  ).docs[0].value;
}

export function getVersion(info: EamuseInfo) {
  const dateCode = parseInt(info.model.split(":")[4]);
  if (dateCode <= 2013052900) return 1;
  if (dateCode <= 2014112000) return 2;
  if (dateCode <= 2016121200) return 3;
  if (info.method.startsWith('sv4')) return 4;
  if (info.method.startsWith('sv5')) return 5;
  if (dateCode <= 2021082400) return 6;
  if (dateCode <= 2025121900) return -6;
  if (dateCode >= 2025122400) return 7;
  return 0;
}

export function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min); //The maximum is inclusive and the minimum is inclusive
}

let musicDbCache: any = null;
let validMidSet: Set<string> | null = null;
let musicDbLoadFailed = false;

export async function loadMusicDb() {
  if (musicDbCache) return musicDbCache;
  if (musicDbLoadFailed) return null;
  try {
    const buf = await IO.ReadFile('webui/asset/json/music_db.json');
    if (!buf) {
      musicDbLoadFailed = true;
      return null;
    }
    const mdb = JSON.parse(U.DecodeString(buf, 'utf8'));

    // Merge custom songs if file exists
    if (IO.Exists('webui/asset/json/custom_music_db.json')) {
      try {
        const customBuf = await IO.ReadFile('webui/asset/json/custom_music_db.json');
        if (customBuf) {
          const customDb = JSON.parse(U.DecodeString(customBuf, 'utf8'));
          if (customDb?.mdb?.music?.length) {
            mdb.mdb.music = mdb.mdb.music.concat(customDb.mdb.music);
          }
        }
      } catch {}
    }

    // Build valid MID lookup set
    validMidSet = new Set(mdb.mdb.music.map((s: any) => String(s.id)));

    musicDbCache = mdb;
    return musicDbCache;
  } catch {}
  musicDbLoadFailed = true;
  return null;
}

export function isValidMid(mid: number): boolean {
  if (!validMidSet) return true; // If DB failed to load, don't block scores
  return validMidSet.has(String(mid));
}

export function invalidateMusicDbCache() {
  musicDbCache = null;
  validMidSet = null;
  musicDbLoadFailed = false;
}

// Game crashes with music IDs >= 3072 (internal array limit in soundvoltex.dll).
// That upper bound is a hard game-side constant; the starting ID is operator-
// configurable via `sdvx_nautica_id_start` so servers with lots of custom
// charts can expand into the space between the last official song and 3071.
export const NAUTICA_ID_END = 3071;
export const NAUTICA_ID_START_DEFAULT = 2800;

/** Resolve the currently-configured starting ID, clamped to [1, NAUTICA_ID_END - 1]. */
export function getNauticaIdStart(): number {
  const raw = U.GetConfig('sdvx_nautica_id_start');
  const parsed = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed >= NAUTICA_ID_END) {
    return NAUTICA_ID_START_DEFAULT;
  }
  return parsed;
}

/**
 * True for any music id in the custom-chart range. Used to gate behaviour
 * that should differ between official and community charts — most notably
 * VOLFORCE: scores still save normally, but the volforce contribution is
 * forced to 0 so custom charts don't pad a player's rating.
 */
export function isCustomMid(mid: number): boolean {
  return Number.isFinite(mid) && mid >= getNauticaIdStart() && mid <= NAUTICA_ID_END;
}

export function nauticaSlotExhaustedError(): string {
  const start = getNauticaIdStart();
  const capacity = NAUTICA_ID_END - start + 1;
  return (
    `No music ID slots available. The game crashes with IDs >= 3072, so only ` +
    `${capacity} custom chart slots (${start}-${NAUTICA_ID_END}) ` +
    `exist and all are in use. Remove an existing custom chart before adding a new one.`
  );
}

export type NauticaSlotsStatus = {
  start: number;
  end: number;
  capacity: number;
  used: number;
  remaining: number;
  full: boolean;
};

export async function getNauticaSlotsStatus(): Promise<NauticaSlotsStatus> {
  const start = getNauticaIdStart();
  const songs = await DB.Find<any>({
    collection: 'nautica_song',
    mid: { $gte: start, $lte: NAUTICA_ID_END },
  });
  const usedIds = new Set((songs || []).map((s: any) => s.mid));
  const capacity = NAUTICA_ID_END - start + 1;
  const used = usedIds.size;
  return {
    start,
    end: NAUTICA_ID_END,
    capacity,
    used,
    remaining: capacity - used,
    full: used >= capacity,
  };
}

// IDs reserved during this server session but not yet written to the DB.
// Prevents concurrent prepareForConversion calls from allocating the same
// mid when they all query the DB before any of them has written their mid back.
const _reservedMids = new Set<number>();

export async function GetNextNauticaId(): Promise<number> {
  const start = getNauticaIdStart();
  const songs = await DB.Find<any>({ collection: 'nautica_song', mid: { $gte: start } });
  const usedIds = new Set((songs || []).map((s: any) => s.mid));
  // Include in-memory reservations not yet persisted to the DB
  for (const id of _reservedMids) usedIds.add(id);

  for (let id = start; id <= NAUTICA_ID_END; id++) {
    if (!usedIds.has(id)) {
      // Reserve synchronously before any await so concurrent callers see it
      _reservedMids.add(id);
      await DB.Upsert<Counter>(
        { collection: 'counter', key: 'nautica_music_id' },
        { $set: { value: id } }
      );
      return id;
    }
  }

  throw new Error(nauticaSlotExhaustedError());
}

export function computeForce(diff, score, medal, grade) { // computing force with EG values
  const medalCoef = [0, 0.50, 1.0, 1.02, 1.04, 1.05, 1.10]
  const gradeCoef = [0, 0.8, 0.82, 0.85, 0.88, 0.91, 0.94, 0.97, 1.0, 1.02, 1.05]
  return Math.floor(diff * (score / 10000000) * (gradeCoef[grade]) * (medalCoef[medal]) * 20)
}

export function checkVerStart(gameVersion, checkVersion, checkStart, dateObj) {
  if(checkStart === 0) return true
  let startYr = checkStart.toString().slice(0,4)
  let startMo = checkStart.toString().slice(4,6)
  let startDa = checkStart.toString().slice(6,8)
  let checkStartUTC = new Date(startYr + '-' + startMo + '-' + startDa +'T00:00:00Z')

  if (gameVersion < checkVersion) return false
  if (dateObj.getTime() < checkStartUTC.getTime()) return false
  return true
}

export async function getDateCodeInit() {
  // based on get_identifier from sp2xpatcher's find_sp2x_patches
  // https://github.com/pinapelz/sp2xpatcher/blob/1b69d4f1abedbfe5ee6f56865504dd37e8568785/find_sp2x_patches/find_sp2x_patches.py#L212-L241
  const dateCodes = {
    "69318a20_74de58": 20251209,
    "694a2601_743f28": 20251224,
    "694cd6fa_743f38": 20251226,
    "695f6ac9_7449d8": 20260113,
    "6970d404_7463f8": 20260127,
    "697c025d_751898": 20260203,
    "698e6863_753ba8": 20260217,
    "69a00a63_7551f8": 20260303,
    "69bb5ab5_75b7e8": 20260324,
    "69ccbc0e_75b838": 20260407,
    "69e097b6_770498": 20260421,
    "69fd4402_772268": 20260512
  }
  let bufOffset = 60
  let gameDir = U.GetConfig('sdvx_eg_root_dir')
  if(gameDir != "" && IO.Exists(gameDir + '/modules/soundvoltex.dll')) {
    let dll = await IO.ReadFile(gameDir + '/modules/soundvoltex.dll', {flag: 'r'})
    let hdrOffset = dll.readUInt32LE(bufOffset)
    let hdr = dll.readUInt32BE(hdrOffset).toString(16).toUpperCase()
    if (hdr !== '50450000') return false
    let opt = hdrOffset + 24
    let epoint = dll.readUInt32LE(hdrOffset + 8).toString(16) + "_" + dll.readUInt32LE(opt + 16).toString(16)
    if(!(epoint in dateCodes)) return false
    return dateCodes[epoint]
  }
  return false
}
