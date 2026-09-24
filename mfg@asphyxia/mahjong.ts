/**
 * Mahjong rules engine for MFG - TypeScript port of mfg-private-server-main/mahjong.py
 *
 * Tile ids follow MFG.Types.Pai: man 1-9, sou 11-19, pin 21-29, honours 31-37
 * (J1..J4 = E/S/W/N, J5..J7 = haku/hatsu/chun). Red fives are same id + 64.
 *
 * Internally everything works on 0..33 index (0-8 man, 9-17 sou, 18-26 pin, 27-33 honours)
 */

// --------------------------------------------------------------------------
// tile helpers
// --------------------------------------------------------------------------

export const MAN = 0;
export const SOU = 9;
export const PIN = 18;
export const HON = 27;

export function pai_norm(pai: number): number {
  const p = Math.trunc(pai);
  return p >= 64 ? p - 64 : p;
}

export function pai_to_idx(pai: number): number {
  const p = pai_norm(pai);
  if (p >= 1 && p <= 9) return MAN + p - 1;
  if (p >= 11 && p <= 19) return SOU + p - 11;
  if (p >= 21 && p <= 29) return PIN + p - 21;
  if (p >= 31 && p <= 37) return HON + p - 31;
  return -1;
}

export function idx_to_pai(idx: number): number {
  if (idx < SOU) return 1 + idx;
  if (idx < PIN) return 11 + (idx - SOU);
  if (idx < HON) return 21 + (idx - PIN);
  return 31 + (idx - HON);
}

export function is_honor(idx: number): boolean {
  return idx >= HON;
}

export function is_terminal(idx: number): boolean {
  return !is_honor(idx) && (idx % 9 === 0 || idx % 9 === 8);
}

export function is_yaochu(idx: number): boolean {
  return is_honor(idx) || is_terminal(idx);
}

export const YAOCHU_IDX: readonly number[] = (() => {
  const out: number[] = [];
  for (let i = 0; i < 34; i++) if (is_yaochu(i)) out.push(i);
  return out;
})();

// souzu 2,3,4,6,8 + hatsu
export const GREEN_IDX: readonly number[] = [SOU + 1, SOU + 2, SOU + 3, SOU + 5, SOU + 7, HON + 5] as const;

// TakuType (MFG.Types.TakuType)
export const TONPU = 0;
export const HANCHAN = 1;
export const SANMA = 2;
export const NIMA = 3;

export const SEATS_OF: Record<number, number> = {
  [TONPU]: 4,
  [HANCHAN]: 4,
  [SANMA]: 3,
  [NIMA]: 2,
};

export const KYOKU_COUNT: Record<number, number> = {
  [TONPU]: 4,
  [HANCHAN]: 8,
  [SANMA]: 3,
  [NIMA]: 2,
};

export const START_SCORE: Record<number, number> = {
  [TONPU]: 25000,
  [HANCHAN]: 25000,
  [SANMA]: 35000,
  [NIMA]: 35000,
};

export function live_kinds(taku: number): number[] {
  if (taku === NIMA) {
    // no manzu at all, no west / north
    const out: number[] = [];
    for (let i = 0; i < 34; i++) {
      if (i >= SOU && i !== HON + 2 && i !== HON + 3) out.push(i);
    }
    return out;
  }
  if (taku === SANMA) {
    // manzu 2-8 removed
    const out: number[] = [];
    for (let i = 0; i < 34; i++) {
      if (!(MAN + 1 <= i && i <= MAN + 7)) out.push(i);
    }
    return out;
  }
  const all: number[] = [];
  for (let i = 0; i < 34; i++) all.push(i);
  return all;
}

// RNG type for build_wall: supports Python-like object with shuffle, or function returning [0,1), or object with random()
export type ShuffleRng = { shuffle<T>(arr: T[]): void };
export type RandomRng = { random(): number };
export type Rng = ShuffleRng | RandomRng | (() => number) | null | undefined;

function shuffleInPlace<T>(arr: T[], rng?: Rng): void {
  // if rng has shuffle method, delegate
  if (rng && typeof (rng as ShuffleRng).shuffle === "function") {
    (rng as ShuffleRng).shuffle(arr);
    return;
  }
  let rnd: () => number;
  if (typeof rng === "function") {
    rnd = rng as () => number;
  } else if (rng && typeof (rng as RandomRng).random === "function") {
    rnd = () => (rng as RandomRng).random();
  } else {
    rnd = Math.random;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

export function build_wall(taku: number, rng?: Rng): number[] {
  const tiles: number[] = [];
  for (const idx of live_kinds(taku)) {
    tiles.push(idx, idx, idx, idx);
  }
  shuffleInPlace(tiles, rng);
  return tiles;
}

export function dora_from_indicator(idx: number, taku: number): number {
  if (is_honor(idx)) {
    const n = idx - HON;
    if (n <= 3) {
      // winds
      if (taku === NIMA) {
        // only east / south exist, so south wraps back to east
        return HON + (n === 1 ? 0 : 1);
      }
      return HON + ((n + 1) % 4);
    }
    return HON + 4 + ((n - 4 + 1) % 3);
  }
  const suit = Math.floor(idx / 9);
  const num = idx % 9;
  if (suit === 0 && taku === SANMA) {
    // only M1 / M9 in play
    return MAN + (num === 0 ? 8 : 0);
  }
  return suit * 9 + ((num + 1) % 9);
}

export function counts_of(tiles: readonly number[]): number[] {
  const c = new Array(34).fill(0) as number[];
  for (const t of tiles) {
    if (t >= 0 && t < 34) c[t] += 1;
  }
  return c;
}

// --------------------------------------------------------------------------
// shanten / agari
// --------------------------------------------------------------------------

export function _enum_group(
  c: number[],
  i: number,
  melds: number,
  partials: number,
  pair: boolean,
  out: Set<string>,
  runs: boolean,
): void {
  const n = c.length;
  while (i < n && c[i] === 0) i++;
  if (i >= n || melds + partials >= 5) {
    out.add(`${melds},${partials},${pair ? 1 : 0}`);
    return;
  }
  if (c[i] >= 3) {
    c[i] -= 3;
    _enum_group(c, i, melds + 1, partials, pair, out, runs);
    c[i] += 3;
  }
  if (runs && i + 2 < n && c[i + 1] && c[i + 2]) {
    c[i] -= 1;
    c[i + 1] -= 1;
    c[i + 2] -= 1;
    _enum_group(c, i, melds + 1, partials, pair, out, runs);
    c[i] += 1;
    c[i + 1] += 1;
    c[i + 2] += 1;
  }
  if (c[i] >= 2) {
    if (!pair) {
      c[i] -= 2;
      _enum_group(c, i, melds, partials, true, out, runs);
      c[i] += 2;
    }
    c[i] -= 2;
    _enum_group(c, i, melds, partials + 1, pair, out, runs);
    c[i] += 2;
  }
  if (runs && i + 1 < n && c[i + 1]) {
    c[i] -= 1;
    c[i + 1] -= 1;
    _enum_group(c, i, melds, partials + 1, pair, out, runs);
    c[i] += 1;
    c[i + 1] += 1;
  }
  if (runs && i + 2 < n && c[i + 2]) {
    c[i] -= 1;
    c[i + 2] -= 1;
    _enum_group(c, i, melds, partials + 1, pair, out, runs);
    c[i] += 1;
    c[i + 2] += 1;
  }
  const saved = c[i];
  c[i] = 0;
  _enum_group(c, i + 1, melds, partials, pair, out, runs);
  c[i] = saved;
}

export type GroupOption = [number, number, boolean];

export function _pareto(options: Iterable<GroupOption>): GroupOption[] {
  const opts = [...options].sort((a, b) => {
    if (a[0] !== b[0]) return b[0] - a[0];
    if (a[1] !== b[1]) return b[1] - a[1];
    return (b[2] ? 1 : 0) - (a[2] ? 1 : 0);
  });
  const keep: GroupOption[] = [];
  for (const o of opts) {
    let dominated = false;
    for (const k of keep) {
      if (k[0] >= o[0] && k[1] >= o[1] && (k[2] ? 1 : 0) >= (o[2] ? 1 : 0)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) keep.push([o[0], o[1], !!o[2]]);
  }
  return keep;
}

// caches
const _groupOptionsCache = new Map<string, readonly GroupOption[]>();
const _shantenStdCache = new Map<string, number>();

export function _group_options(key: readonly number[], runs: boolean): readonly GroupOption[] {
  const cacheKey = `${key.join(",")}|${runs ? 1 : 0}`;
  const cached = _groupOptionsCache.get(cacheKey);
  if (cached) return cached;
  const out = new Set<string>();
  _enum_group([...key], 0, 0, 0, false, out, runs);
  const parsed: GroupOption[] = [];
  for (const s of out) {
    const [a, b, c] = s.split(",").map(Number);
    parsed.push([a, b, c === 1]);
  }
  const res = _pareto(parsed);
  _groupOptionsCache.set(cacheKey, res);
  return res;
}

export function _shanten_std_cached(key: readonly number[], open_melds: number): number {
  const cacheKey = `${key.join(",")}|${open_melds}`;
  const cached = _shantenStdCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const groups: readonly (readonly GroupOption[])[] = [
    _group_options(key.slice(0, 9), true),
    _group_options(key.slice(9, 18), true),
    _group_options(key.slice(18, 27), true),
    _group_options(key.slice(27, 34), false),
  ];

  let cur: Set<string> = new Set(["0,0,0"]);
  for (const opts of groups) {
    const nxt = new Set<string>();
    for (const curStr of cur) {
      const [mStr, pStr, prStr] = curStr.split(",");
      const m = Number(mStr);
      const p = Number(pStr);
      const pr = prStr === "1";
      for (const [m2, p2, pr2] of opts) {
        if (pr && pr2) continue;
        let nm = m + m2;
        if (nm > 4) nm = 4;
        let np_ = p + p2;
        if (np_ > 4) np_ = 4;
        const npr = pr || pr2;
        nxt.add(`${nm},${np_},${npr ? 1 : 0}`);
      }
    }
    // pareto filter
    const parsed: GroupOption[] = [];
    for (const s of nxt) {
      const [a, b, c] = s.split(",").map(Number);
      parsed.push([a, b, c === 1]);
    }
    const filtered = _pareto(parsed);
    cur = new Set(filtered.map(([a, b, c]) => `${a},${b},${c ? 1 : 0}`));
  }

  let best = 99;
  for (const curStr of cur) {
    const [mStr, pStr, prStr] = curStr.split(",");
    let m = Number(mStr);
    let p = Number(pStr);
    const pr = prStr === "1";
    let tm = m + open_melds;
    if (tm > 4) tm = 4;
    let pp = p;
    if (tm + pp > 4) pp = 4 - tm;
    const v = (4 - tm) * 2 - pp - (pr ? 1 : 0);
    if (v < best) best = v;
  }

  _shantenStdCache.set(cacheKey, best);
  return best;
}

export function shanten_standard(counts: readonly number[], open_melds = 0): number {
  return _shanten_std_cached(counts as readonly number[], open_melds);
}

export function shanten_chiitoi(counts: readonly number[]): number {
  let pairs = 0;
  let kinds = 0;
  for (const n of counts) {
    if (n >= 2) pairs++;
    if (n >= 1) kinds++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

export function shanten_kokushi(counts: readonly number[]): number {
  let kinds = 0;
  for (const i of YAOCHU_IDX) if (counts[i] >= 1) kinds++;
  const has_pair = YAOCHU_IDX.some((i) => counts[i] >= 2);
  return 13 - kinds - (has_pair ? 1 : 0);
}

export function shanten(counts: readonly number[], open_melds = 0, taku: number = TONPU): number {
  let best = shanten_standard(counts, open_melds);
  if (open_melds === 0) {
    best = Math.min(best, shanten_chiitoi(counts));
    if (taku !== NIMA) best = Math.min(best, shanten_kokushi(counts));
  }
  return best;
}

export function is_agari(counts: readonly number[], open_melds = 0, taku: number = TONPU): boolean {
  return shanten(counts, open_melds, taku) < 0;
}

export function waits_of(counts: readonly number[], open_melds = 0, taku: number = TONPU): number[] {
  const c = [...counts];
  const out: number[] = [];
  for (const t of live_kinds(taku)) {
    if (c[t] >= 4) continue;
    c[t] += 1;
    if (is_agari(c, open_melds, taku)) out.push(t);
    c[t] -= 1;
  }
  return out;
}

export function ukeire(
  counts: readonly number[],
  open_melds: number,
  taku: number,
  seen: readonly number[],
): number {
  const cur = shanten(counts, open_melds, taku);
  const c = [...counts];
  let total = 0;
  for (const t of live_kinds(taku)) {
    if (c[t] >= 4) continue;
    c[t] += 1;
    if (shanten(c, open_melds, taku) < cur) {
      total += Math.max(0, 4 - (seen[t] ?? 0));
    }
    c[t] -= 1;
  }
  return total;
}

// --------------------------------------------------------------------------
// hand decomposition (for yaku / fu)
// --------------------------------------------------------------------------

export const KOTSU = 0;
export const SHUNTSU = 1;
export type SetKind = typeof KOTSU | typeof SHUNTSU;
export type HandSet = [SetKind, number];

export function _decompose(c: number[], i: number, sets: HandSet[], out: HandSet[][]): void {
  while (i < 34 && c[i] === 0) i++;
  if (i >= 34) {
    out.push([...sets]);
    return;
  }
  if (c[i] >= 3) {
    c[i] -= 3;
    sets.push([KOTSU, i]);
    _decompose(c, i, sets, out);
    sets.pop();
    c[i] += 3;
  }
  if (i < HON && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
    c[i] -= 1;
    c[i + 1] -= 1;
    c[i + 2] -= 1;
    sets.push([SHUNTSU, i]);
    _decompose(c, i, sets, out);
    sets.pop();
    c[i] += 1;
    c[i + 1] += 1;
    c[i + 2] += 1;
  }
}

export function decompositions(counts: readonly number[]): [number, HandSet[]][] {
  const res: [number, HandSet[]][] = [];
  const c = [...counts];
  for (let p = 0; p < 34; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const need = Math.floor(c.reduce((a, b) => a + b, 0) / 3);
    const out: HandSet[][] = [];
    _decompose(c, 0, [], out);
    for (const sets of out) {
      if (sets.length === need) res.push([p, sets]);
    }
    c[p] += 2;
  }
  return res;
}

// --------------------------------------------------------------------------
// melds
// --------------------------------------------------------------------------

export const PON = "pon";
export const CHI = "chi";
export const ANKAN = "ankan";
export const MINKAN = "minkan";
export const KAKAN = "kakan";

export type MeldKind = typeof PON | typeof CHI | typeof ANKAN | typeof MINKAN | typeof KAKAN;

// MFG FuroData.MentsuType
export const MENTSU_TYPE: Record<string, number> = {
  [CHI]: 1,
  [PON]: 2,
  [ANKAN]: 3,
  [MINKAN]: 4,
  [KAKAN]: 5,
};

export class Meld {
  kind: MeldKind;
  base: number;
  tiles: number[];
  called: number;
  from_seat: number;

  constructor(kind: MeldKind | string, tiles: number[], called = -1, from_seat = -1) {
    this.kind = kind as MeldKind;
    this.tiles = [...tiles];
    this.called = called;
    this.from_seat = from_seat;
    this.base = Math.min(...tiles);
  }

  get is_kan(): boolean {
    return this.kind === ANKAN || this.kind === MINKAN || this.kind === KAKAN;
  }

  get is_open(): boolean {
    return this.kind !== ANKAN;
  }

  get is_concealed_triplet(): boolean {
    return this.kind === ANKAN;
  }

  as_kotsu(): HandSet | null {
    if (this.kind === PON || this.kind === ANKAN || this.kind === MINKAN || this.kind === KAKAN) {
      return [KOTSU, this.tiles[0]];
    }
    return null;
  }

  to_dict(): Record<string, unknown> {
    return {
      kind: this.kind,
      tiles: [...this.tiles],
      called: this.called,
      from_seat: this.from_seat,
    };
  }

  static from_dict(d: Record<string, unknown>): Meld {
    return new Meld(
      d["kind"] as string,
      d["tiles"] as number[],
      (d["called"] as number) ?? -1,
      (d["from_seat"] as number) ?? -1,
    );
  }
}

// --------------------------------------------------------------------------
// yaku
// --------------------------------------------------------------------------

// bit index == MFG.Types.Yaku ordinal
export const Y: Record<string, number> = {
  Tenho: 0,
  Chiho: 1,
  Renho: 2,
  Tyuren9: 3,
  TyurenTanki: 4,
  Chinroto: 5,
  Tsuiso: 6,
  Ryuiso: 7,
  Kokushi13: 8,
  KokushiTanki: 9,
  Sukantsu: 10,
  Suanko: 11,
  SuankoTanki: 12,
  Daisushi: 13,
  Syosushi: 14,
  Daisangen: 15,
  Daisyarin: 16,
  Surenko: 17,
  Parenchan: 18,
  Kazoeyakuman: 19,
  Chiniso: 20,
  Honroto: 21,
  Syosangen: 22,
  Nagashimangan: 23,
  Shisanputo: 24,
  Junchan: 25,
  Ryanpeko: 26,
  Honiso: 27,
  DoubleRichi: 28,
  Sankantsu: 29,
  Sananko: 30,
  Toitoiho: 31,
  Chitoitsu: 32,
  Sansyokudoko: 33,
  Sansyokudojun: 34,
  Chanta: 35,
  Ikkitsukan: 36,
  Sanrenko: 37,
  Haitei: 38,
  Hotei: 39,
  Chankan: 40,
  Rinsyan: 41,
  Ipeiko: 42,
  Tanyao: 43,
  Pinfu: 44,
  Richi: 45,
  Ippatsu: 46,
  Menzen: 47,
  Haku: 48,
  Hatsu: 49,
  Tyun: 50,
  Bakaze: 51,
  Jikaze: 52,
  Dora: 53,
  ChinisoNaki: 54,
  JunchanNaki: 55,
  HonisoNaki: 56,
  SansyokudojunNaki: 57,
  ChantaNaki: 58,
  IkkitsukanNaki: 59,
};

// han value per yaku (closed value; the *Naki bits carry the reduced value)
export const YAKU_HAN: Record<string, number> = {
  Tanyao: 1,
  Pinfu: 1,
  Ipeiko: 1,
  Richi: 1,
  Ippatsu: 1,
  Menzen: 1,
  Haku: 1,
  Hatsu: 1,
  Tyun: 1,
  Bakaze: 1,
  Jikaze: 1,
  Haitei: 1,
  Hotei: 1,
  Chankan: 1,
  Rinsyan: 1,
  Chitoitsu: 2,
  Toitoiho: 2,
  Sananko: 2,
  Sankantsu: 2,
  Sansyokudoko: 2,
  DoubleRichi: 2,
  Syosangen: 2,
  Honroto: 2,
  Sansyokudojun: 2,
  Ikkitsukan: 2,
  Chanta: 2,
  SansyokudojunNaki: 1,
  IkkitsukanNaki: 1,
  ChantaNaki: 1,
  Junchan: 3,
  JunchanNaki: 2,
  Honiso: 3,
  HonisoNaki: 2,
  Ryanpeko: 3,
  Chiniso: 6,
  ChinisoNaki: 5,
};

export const YAKUMAN: Record<string, number> = {
  Tenho: 1,
  Chiho: 1,
  Kokushi13: 2,
  KokushiTanki: 1,
  Suanko: 1,
  SuankoTanki: 2,
  Daisangen: 1,
  Syosushi: 1,
  Daisushi: 2,
  Tsuiso: 1,
  Chinroto: 1,
  Ryuiso: 1,
  Tyuren9: 1,
  TyurenTanki: 2,
  Sukantsu: 1,
};

export interface WinContextOpts {
  hand: number[];
  melds: Meld[];
  win_tile: number;
  is_tsumo: boolean;
  seat_wind: number;
  round_wind: number;
  riichi?: boolean;
  double_riichi?: boolean;
  ippatsu?: boolean;
  haitei?: boolean;
  houtei?: boolean;
  rinshan?: boolean;
  chankan?: boolean;
  tenho?: boolean;
  chiho?: boolean;
  dora_indicators?: number[];
  ura_indicators?: number[];
  taku?: number;
}

export class WinContext {
  hand: number[];
  melds: Meld[];
  win_tile: number;
  is_tsumo: boolean;
  seat_wind: number;
  round_wind: number;
  riichi: boolean;
  double_riichi: boolean;
  ippatsu: boolean;
  haitei: boolean;
  houtei: boolean;
  rinshan: boolean;
  chankan: boolean;
  tenho: boolean;
  chiho: boolean;
  dora_indicators: number[];
  ura_indicators: number[];
  taku: number;

  constructor(
    handOrOpts: number[] | WinContextOpts,
    melds?: Meld[],
    win_tile?: number,
    is_tsumo?: boolean,
    seat_wind?: number,
    round_wind?: number,
    riichi = false,
    double_riichi = false,
    ippatsu = false,
    haitei = false,
    houtei = false,
    rinshan = false,
    chankan = false,
    tenho = false,
    chiho = false,
    dora_indicators: number[] = [],
    ura_indicators: number[] = [],
    taku: number = TONPU,
  ) {
    // object-style construction: new WinContext({ hand, melds, win_tile, ... })
    if (
      handOrOpts !== null &&
      typeof handOrOpts === "object" &&
      !Array.isArray(handOrOpts) &&
      (handOrOpts as WinContextOpts).hand !== undefined
    ) {
      const o = handOrOpts as WinContextOpts;
      this.hand = [...o.hand];
      this.melds = [...(o.melds ?? [])];
      this.win_tile = o.win_tile;
      this.is_tsumo = !!o.is_tsumo;
      this.seat_wind = o.seat_wind;
      this.round_wind = o.round_wind;
      this.riichi = !!o.riichi;
      this.double_riichi = !!o.double_riichi;
      this.ippatsu = !!o.ippatsu;
      this.haitei = !!o.haitei;
      this.houtei = !!o.houtei;
      this.rinshan = !!o.rinshan;
      this.chankan = !!o.chankan;
      this.tenho = !!o.tenho;
      this.chiho = !!o.chiho;
      this.dora_indicators = [...(o.dora_indicators ?? [])];
      this.ura_indicators = [...(o.ura_indicators ?? [])];
      this.taku = o.taku ?? TONPU;
      return;
    }

    // positional construction
    this.hand = [...(handOrOpts as number[])];
    this.melds = [...(melds ?? [])];
    this.win_tile = win_tile!;
    this.is_tsumo = !!is_tsumo;
    this.seat_wind = seat_wind!;
    this.round_wind = round_wind!;
    this.riichi = !!riichi;
    this.double_riichi = !!double_riichi;
    this.ippatsu = !!ippatsu;
    this.haitei = !!haitei;
    this.houtei = !!houtei;
    this.rinshan = !!rinshan;
    this.chankan = !!chankan;
    this.tenho = !!tenho;
    this.chiho = !!chiho;
    this.dora_indicators = [...(dora_indicators ?? [])];
    this.ura_indicators = [...(ura_indicators ?? [])];
    this.taku = taku ?? TONPU;
  }

  get menzen(): boolean {
    return this.melds.every((m) => m.kind === ANKAN);
  }
}

export interface EvaluateResult {
  bits: bigint;
  han: number;
  yaku_han: number;
  fu: number;
  dora: number;
  yakuman: number;
  rank: number;
}

export function _all_sets(pair: number, sets: HandSet[], melds: readonly Meld[]): HandSet[] {
  const full: HandSet[] = [...sets];
  for (const m of melds) {
    if (m.kind === CHI) {
      full.push([SHUNTSU, m.base]);
    } else {
      full.push([KOTSU, m.tiles[0]]);
    }
  }
  // pair not needed for this helper, but keep signature compatible
  void pair;
  return full;
}

export function _kokushi(ctx: WinContext): [bigint, number, number, number] | null {
  const c = counts_of(ctx.hand);
  if (ctx.melds.length || c.reduce((a, b) => a + b, 0) !== 14) return null;
  if (c.some((n, i) => n > 0 && !is_yaochu(i))) return null;
  if (!YAOCHU_IDX.every((i) => c[i] >= 1)) return null;
  const minus = [...c];
  minus[ctx.win_tile] -= 1;
  const thirteen = YAOCHU_IDX.every((i) => minus[i] === 1);
  let bits = BigInt(0);
  if (thirteen) {
    bits |= BigInt(1) << BigInt(Y["Kokushi13"]);
    return [bits, 2, 25, 2];
  }
  bits |= BigInt(1) << BigInt(Y["KokushiTanki"]);
  return [bits, 1, 25, 1];
}

export function _chiitoi_bits(ctx: WinContext): [bigint, number[]] | null {
  const c = counts_of(ctx.hand);
  if (ctx.melds.length || c.reduce((a, b) => a + b, 0) !== 14) return null;
  if (c.filter((n) => n === 2).length !== 7) return null;
  return [BigInt(0), c.map((n, i) => (n === 2 ? i : -1)).filter((i) => i !== -1)];
}

export function _yakuhai_bits(ctx: WinContext, sets: HandSet[]): [bigint, number] {
  let bits = BigInt(0);
  let han = 0;
  for (const [kind, base] of sets) {
    if (kind !== KOTSU || !is_honor(base)) continue;
    const n = base - HON;
    if (n === 4) {
      bits |= BigInt(1) << BigInt(Y["Haku"]);
      han += 1;
    } else if (n === 5) {
      bits |= BigInt(1) << BigInt(Y["Hatsu"]);
      han += 1;
    } else if (n === 6) {
      bits |= BigInt(1) << BigInt(Y["Tyun"]);
      han += 1;
    } else {
      if (n === ctx.round_wind) {
        bits |= BigInt(1) << BigInt(Y["Bakaze"]);
        han += 1;
      }
      if (n === ctx.seat_wind) {
        bits |= BigInt(1) << BigInt(Y["Jikaze"]);
        han += 1;
      }
    }
  }
  return [bits, han];
}

export function _fu_for(ctx: WinContext, pair: number, sets: HandSet[], pinfu: boolean, menzen: boolean): number {
  if (pinfu) return ctx.is_tsumo ? 20 : 30;
  let fu = 20;
  // melds
  for (const m of ctx.melds) {
    if (m.kind === CHI) continue;
    const base = m.tiles[0];
    let val = 2;
    if (m.is_kan) val = 8;
    if (m.kind === ANKAN) val *= 2;
    else if (!m.is_kan && m.kind === PON) val = 2;
    if (is_yaochu(base)) val *= 2;
    fu += val;
  }
  // concealed part
  const closed_counts = counts_of(ctx.hand);
  for (const [kind, base] of sets) {
    if (kind !== KOTSU) continue;
    // a triplet completed by ron counts as open
    const concealed = !(!ctx.is_tsumo && base === ctx.win_tile && closed_counts[base] === 3);
    let val = concealed ? 4 : 2;
    if (is_yaochu(base)) val *= 2;
    fu += val;
  }
  // pair
  if (is_honor(pair)) {
    const n = pair - HON;
    if (n >= 4) fu += 2;
    else {
      if (n === ctx.round_wind) fu += 2;
      if (n === ctx.seat_wind) fu += 2;
    }
  }
  // wait shape
  fu += _wait_fu(ctx, pair, sets);
  if (ctx.is_tsumo) fu += 2;
  else if (menzen) fu += 10;
  return Math.floor((fu + 9) / 10) * 10;
}

export function _wait_fu(ctx: WinContext, pair: number, sets: HandSet[]): number {
  const w = ctx.win_tile;
  if (pair === w) return 2; // tanki
  let best = 99;
  for (const [kind, base] of sets) {
    if (kind === KOTSU) {
      if (base === w) best = Math.min(best, 0);
      continue;
    }
    if (base <= w && w <= base + 2) {
      if (w === base + 1) best = Math.min(best, 2); // kanchan
      else if ((base % 9 === 0 && w === base + 2) || (base % 9 === 6 && w === base)) best = Math.min(best, 2); // penchan
      else best = Math.min(best, 0);
    }
  }
  return best === 99 ? 0 : best;
}

export function _is_pinfu(ctx: WinContext, pair: number, sets: HandSet[]): boolean {
  if (!ctx.menzen || ctx.melds.some((m) => m.kind === ANKAN)) return false;
  if (sets.some(([k]) => k === KOTSU)) return false;
  if (is_honor(pair)) {
    const n = pair - HON;
    if (n >= 4 || n === ctx.round_wind || n === ctx.seat_wind) return false;
  }
  // winning tile must complete a two-sided run
  for (const [kind, base] of sets) {
    if (kind !== SHUNTSU) continue;
    if (base === ctx.win_tile && base % 9 !== 6) return true;
    if (base + 2 === ctx.win_tile && base % 9 !== 0) return true;
  }
  return false;
}

export function evaluate(ctx: WinContext): EvaluateResult {
  const kok = _kokushi(ctx);
  if (kok) {
    const [bits, ym, fu] = kok;
    return _finish(ctx, bits, 0, fu, ym, 0);
  }

  let best: EvaluateResult | null = null;

  const chi = _chiitoi_bits(ctx);
  if (chi !== null) {
    let bits = BigInt(1) << BigInt(Y["Chitoitsu"]);
    let han = YAKU_HAN["Chitoitsu"];
    const [extra, ehan, ym] = _common_bits(ctx, null, [], true);
    bits |= extra;
    han += ehan;
    best = _finish(ctx, bits, han, 25, ym, _dora_count(ctx));
  }

  const closed = [...ctx.hand];
  const ccounts = counts_of(closed);
  for (const [pair, sets] of decompositions(ccounts)) {
    const full = _all_sets(pair, sets, ctx.melds);
    if (full.length !== 4) continue;
    let bits = BigInt(0);
    let han = 0;
    const pinfu = _is_pinfu(ctx, pair, sets);
    if (pinfu) {
      bits |= BigInt(1) << BigInt(Y["Pinfu"]);
      han += 1;
    }
    const [yb, yh] = _yakuhai_bits(ctx, full);
    bits |= yb;
    han += yh;
    const [extra, ehan, ym] = _common_bits(ctx, pair, full);
    bits |= extra;
    han += ehan;
    // closed-hand shape yaku
    const [sb, sh] = _shape_bits(ctx, pair, sets, full);
    bits |= sb;
    han += sh;
    const fu = _fu_for(ctx, pair, sets, pinfu, ctx.menzen);
    const cand = _finish(ctx, bits, han, fu, ym, _dora_count(ctx));
    if (best === null || _better(cand, best)) best = cand;
  }
  if (best === null) {
    // should not happen, but never crash the table
    best = _finish(ctx, BigInt(0), 1, 30, 0, _dora_count(ctx));
  }
  return best;
}

export function _better(a: EvaluateResult, b: EvaluateResult): boolean {
  if (a.yakuman !== b.yakuman) return a.yakuman > b.yakuman;
  if (a.han !== b.han) return a.han > b.han;
  return a.fu > b.fu;
}

export function _common_bits(
  ctx: WinContext,
  pair: number | null,
  sets: HandSet[],
  chiitoi = false,
): [bigint, number, number] {
  let bits = BigInt(0);
  let han = 0;
  let yakuman = 0;
  const menzen = ctx.menzen;

  if (ctx.riichi) {
    if (ctx.double_riichi) {
      bits |= BigInt(1) << BigInt(Y["DoubleRichi"]);
      han += 2;
    } else {
      bits |= BigInt(1) << BigInt(Y["Richi"]);
      han += 1;
    }
    if (ctx.ippatsu) {
      bits |= BigInt(1) << BigInt(Y["Ippatsu"]);
      han += 1;
    }
  }
  if (menzen && ctx.is_tsumo) {
    bits |= BigInt(1) << BigInt(Y["Menzen"]);
    han += 1;
  }
  if (ctx.haitei) {
    bits |= BigInt(1) << BigInt(Y["Haitei"]);
    han += 1;
  }
  if (ctx.houtei) {
    bits |= BigInt(1) << BigInt(Y["Hotei"]);
    han += 1;
  }
  if (ctx.rinshan) {
    bits |= BigInt(1) << BigInt(Y["Rinsyan"]);
    han += 1;
  }
  if (ctx.chankan) {
    bits |= BigInt(1) << BigInt(Y["Chankan"]);
    han += 1;
  }

  const all_tiles: number[] = [...ctx.hand];
  for (const m of ctx.melds) all_tiles.push(...m.tiles);
  const cnt = counts_of(all_tiles);

  if (!YAOCHU_IDX.some((i) => cnt[i] > 0)) {
    bits |= BigInt(1) << BigInt(Y["Tanyao"]);
    han += 1;
  }

  const suits = new Set<number>();
  let honors = false;
  for (let i = 0; i < 34; i++) {
    const n = cnt[i];
    if (!n) continue;
    if (is_honor(i)) honors = true;
    else suits.add(Math.floor(i / 9));
  }
  if (suits.size === 1 && !honors) {
    if (menzen) {
      bits |= BigInt(1) << BigInt(Y["Chiniso"]);
      han += 6;
    } else {
      bits |= BigInt(1) << BigInt(Y["ChinisoNaki"]);
      han += 5;
    }
  } else if (suits.size <= 1 && honors) {
    if (menzen) {
      bits |= BigInt(1) << BigInt(Y["Honiso"]);
      han += 3;
    } else {
      bits |= BigInt(1) << BigInt(Y["HonisoNaki"]);
      han += 2;
    }
  }

  const kans = ctx.melds.filter((m) => m.is_kan).length;
  if (kans === 3) {
    bits |= BigInt(1) << BigInt(Y["Sankantsu"]);
    han += 2;
  } else if (kans === 4) {
    bits |= BigInt(1) << BigInt(Y["Sukantsu"]);
    yakuman += 1;
  }

  if (!honors && cnt.every((n, i) => n === 0 || is_terminal(i))) {
    // check only tiles present are terminals
    const hasAny = cnt.some((n) => n > 0);
    const allTerminal = cnt.every((n, i) => n === 0 || is_terminal(i));
    if (hasAny && allTerminal) {
      bits |= BigInt(1) << BigInt(Y["Chinroto"]);
      yakuman += 1;
    }
  } else if (cnt.every((n, i) => n === 0 || is_honor(i))) {
    if (cnt.some((n) => n > 0)) {
      bits |= BigInt(1) << BigInt(Y["Tsuiso"]);
      yakuman += 1;
    }
  } else if (cnt.every((n, i) => n === 0 || is_yaochu(i))) {
    if (cnt.some((n) => n > 0)) {
      bits |= BigInt(1) << BigInt(Y["Honroto"]);
      han += 2;
    }
  }
  if (cnt.every((n, i) => n === 0 || (GREEN_IDX as readonly number[]).includes(i))) {
    if (cnt.some((n) => n > 0)) {
      bits |= BigInt(1) << BigInt(Y["Ryuiso"]);
      yakuman += 1;
    }
  }

  const dragons = [HON + 4, HON + 5, HON + 6];
  const trip = dragons.filter((d) => cnt[d] >= 3).length;
  const pairs = dragons.filter((d) => cnt[d] === 2).length;
  if (trip === 3) {
    bits |= BigInt(1) << BigInt(Y["Daisangen"]);
    yakuman += 1;
  } else if (trip === 2 && pairs === 1) {
    bits |= BigInt(1) << BigInt(Y["Syosangen"]);
    han += 2;
  }

  const winds = [HON, HON + 1, HON + 2, HON + 3];
  const wtrip = winds.filter((d) => cnt[d] >= 3).length;
  const wpair = winds.filter((d) => cnt[d] === 2).length;
  if (wtrip === 4) {
    bits |= BigInt(1) << BigInt(Y["Daisushi"]);
    yakuman += 2;
  } else if (wtrip === 3 && wpair === 1) {
    bits |= BigInt(1) << BigInt(Y["Syosushi"]);
    yakuman += 1;
  }

  if (menzen && !chiitoi && suits.size === 1 && !honors) {
    const base = Math.min(...suits) * 9;
    const pat = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    const diff = pat.map((v, k) => cnt[base + k] - v);
    if (diff.every((d) => d >= 0) && diff.reduce((a, b) => a + b, 0) === 1) {
      const k = diff.indexOf(1);
      if (base + k === ctx.win_tile) {
        bits |= BigInt(1) << BigInt(Y["TyurenTanki"]);
        yakuman += 2;
      } else {
        bits |= BigInt(1) << BigInt(Y["Tyuren9"]);
        yakuman += 1;
      }
    }
  }

  if (ctx.tenho) {
    bits |= BigInt(1) << BigInt(Y["Tenho"]);
    yakuman += 1;
  } else if (ctx.chiho) {
    bits |= BigInt(1) << BigInt(Y["Chiho"]);
    yakuman += 1;
  }

  // avoid unused param warnings
  void pair;
  void sets;

  return [bits, han, yakuman];
}

export function _shape_bits(
  ctx: WinContext,
  pair: number,
  closed_sets: HandSet[],
  full_sets: HandSet[],
): [bigint, number] {
  let bits = BigInt(0);
  let han = 0;
  const menzen = ctx.menzen;
  const runs = full_sets.filter(([k]) => k === SHUNTSU).map(([, b]) => b);
  const trips = full_sets.filter(([k]) => k === KOTSU).map(([, b]) => b);

  // iipeiko / ryanpeiko (closed only)
  if (menzen) {
    const closed_runs = closed_sets.filter(([k]) => k === SHUNTSU).map(([, b]) => b);
    let dup = 0;
    for (const b of new Set(closed_runs)) {
      dup += Math.floor(closed_runs.filter((x) => x === b).length / 2);
    }
    if (dup >= 2) {
      bits |= BigInt(1) << BigInt(Y["Ryanpeko"]);
      han += 3;
    } else if (dup === 1) {
      bits |= BigInt(1) << BigInt(Y["Ipeiko"]);
      han += 1;
    }
  }

  // sanshoku doujun
  for (const b of runs) {
    if (b >= HON) continue;
    const n = b % 9;
    if ([0, 1, 2].every((s) => runs.includes(s * 9 + n))) {
      if (menzen) {
        bits |= BigInt(1) << BigInt(Y["Sansyokudojun"]);
        han += 2;
      } else {
        bits |= BigInt(1) << BigInt(Y["SansyokudojunNaki"]);
        han += 1;
      }
      break;
    }
  }

  // ittsu
  for (let s = 0; s < 3; s++) {
    if ([0, 3, 6].every((k) => runs.includes(s * 9 + k))) {
      if (menzen) {
        bits |= BigInt(1) << BigInt(Y["Ikkitsukan"]);
        han += 2;
      } else {
        bits |= BigInt(1) << BigInt(Y["IkkitsukanNaki"]);
        han += 1;
      }
      break;
    }
  }

  // sanshoku doukou
  for (const b of trips) {
    if (b >= HON) continue;
    const n = b % 9;
    if ([0, 1, 2].every((s) => trips.includes(s * 9 + n))) {
      bits |= BigInt(1) << BigInt(Y["Sansyokudoko"]);
      han += 2;
      break;
    }
  }

  // toitoi / ankou count
  if (trips.length === 4) {
    bits |= BigInt(1) << BigInt(Y["Toitoiho"]);
    han += 2;
  }
  const closed_counts = counts_of(ctx.hand);
  let ankou = ctx.melds.filter((m) => m.kind === ANKAN).length;
  for (const [k, b] of closed_sets) {
    if (k !== KOTSU) continue;
    if (!ctx.is_tsumo && b === ctx.win_tile && closed_counts[b] === 3) continue;
    ankou += 1;
  }
  if (ankou >= 4) {
    if (pair === ctx.win_tile) bits |= BigInt(1) << BigInt(Y["SuankoTanki"]);
    else bits |= BigInt(1) << BigInt(Y["Suanko"]);
    // yakuman handled via caller? In Python, Suanko adds to yakuman via _common_bits? Actually shape bits adds bit but yakuman increment happens in _common? No, here: Suanko is yakuman, but Python's _shape_bits only sets bits, not yakuman; _common handles some yakuman, but Suanko is in _shape_bits and doesn't increment yakuman directly - evaluate's _better will compare yakuman from _common only, missing? Wait check Python: _shape_bits does not return yakuman, but evaluate handles yakuman from _common only. However Suanko bits are set but YAKUMAN mapping says Suanko is yakuman. In _finish, yakuman is from _common only, so Suanko wouldn't count as yakuman? Let's follow Python exactly: _shape_bits only returns bits/han, and yakuman for Suanko is set as bits but not yakuman count? In Python's YAKUMAN dict, Suanko maps to 1, but _common handles Tenho etc. Yet evaluate's ym comes only from _common, not _shape. So Suanko yakuman counting must happen elsewhere: In Python, Sukantsu/Chinroto etc are in _common, but Suanko is in _shape_bits but Python's evaluate does: extra, ehan, ym = _common_bits(...); bits|=extra; han+=ehan; sb,sh = _shape_bits(...); bits|=sb; han+=sh; fu=...; cand=_finish(ctx,bits,han,fu,ym,...) So ym only from _common, shape's Suanko would NOT contribute to yakuman count. That seems odd vs Python original - maybe Suanko yakuman is not handled via ym but via bits+ han? However Python's YAKUMAN includes Suanko, but _shape_bits would set bits but not increment ym, so _finish would not treat it as yakuman rank. Could be intentional bug replica or Python's has_yaku checks yakuman bit? Let's replicate Python exactly: keep shape bits only setting bits, yakuman remains from _common. To match Python scoring, we need to replicate: Suanko bits set but yakuman not incremented - however Python's has_yaku checks yakuman>0, so Suanko would not be considered yakuman in Python? Check Python YAKUMAN dict and _shape_bits: it sets bits for Suanko but does not increment yakuman variable there. That suggests evaluate's yakuman for Suanko would be 0, which seems inconsistent. Maybe original Python intentionally leaves Suanko to be counted via han? But Python's _finish uses yakuman to determine rank, so Suanko would be treated as regular han hand if ym stays 0. Could be oversight but we must port exactly. We replicate Python behavior.
    // Replicate Python: do NOT increment yakuman here (bits only). If we want to fix, we'd add yakuman++, but we keep Python verbatim.
  } else if (ankou === 3) {
    bits |= BigInt(1) << BigInt(Y["Sananko"]);
    han += 2;
  }

  // chanta / junchan (already covers honroutou separately)
  const blocks = [...full_sets];
  const touches = (kind_base: HandSet): boolean => {
    const [k, b] = kind_base;
    if (k === KOTSU) return is_yaochu(b);
    return b % 9 === 0 || b % 9 === 6;
  };
  if (blocks.every(touches) && is_yaochu(pair)) {
    const has_run = blocks.some(([k]) => k === SHUNTSU);
    const has_honor = is_honor(pair) || blocks.some(([k, b]) => k === KOTSU && is_honor(b));
    if (has_run) {
      if (has_honor) {
        if (menzen) {
          bits |= BigInt(1) << BigInt(Y["Chanta"]);
          han += 2;
        } else {
          bits |= BigInt(1) << BigInt(Y["ChantaNaki"]);
          han += 1;
        }
      } else {
        if (menzen) {
          bits |= BigInt(1) << BigInt(Y["Junchan"]);
          han += 3;
        } else {
          bits |= BigInt(1) << BigInt(Y["JunchanNaki"]);
          han += 2;
        }
      }
    }
  }
  return [bits, han];
}

export function _dora_count(ctx: WinContext): number {
  const tiles: number[] = [...ctx.hand];
  for (const m of ctx.melds) tiles.push(...m.tiles);
  const cnt = counts_of(tiles);
  let total = 0;
  for (const ind of ctx.dora_indicators) total += cnt[dora_from_indicator(ind, ctx.taku)] ?? 0;
  if (ctx.riichi) {
    for (const ind of ctx.ura_indicators) total += cnt[dora_from_indicator(ind, ctx.taku)] ?? 0;
  }
  return total;
}

export function han_rank(han: number, fu: number, yakuman: number): number {
  if (yakuman > 0) return 9 + yakuman - 1;
  if (han >= 13) return 9;
  if (han >= 11) return 8;
  if (han >= 8) return 7;
  if (han >= 6) return 6;
  if (han >= 5) return 5;
  if (base_score(han, fu) >= 2000) return 5;
  return han;
}

export function base_score(han: number, fu: number): number {
  if (han >= 13) return 8000;
  if (han >= 11) return 6000;
  if (han >= 8) return 4000;
  if (han >= 6) return 3000;
  if (han >= 5) return 2000;
  const v = fu << (han + 2);
  return v >= 1920 ? 2000 : v;
}

export function base_score_rank(rank: number, fu: number): number {
  if (rank >= 9) return 8000 * (rank - 9 + 1);
  if (rank === 8) return 6000;
  if (rank === 7) return 4000;
  if (rank === 6) return 3000;
  if (rank === 5) return 2000;
  const v = fu << (rank + 2);
  return v >= 1920 ? 2000 : v;
}

export function _roundup100(v: number): number {
  return Math.floor(v / 100) * 100 + (v % 100 ? 100 : 0);
}

export function payments(
  taku: number,
  rank: number,
  fu: number,
  is_oya: boolean,
  is_tsumo: boolean,
): [number, number, number] {
  const b = base_score_rank(rank, fu);
  const n4 = _roundup100((is_oya ? 6 : 4) * b);
  if (taku === NIMA) return [n4, n4, n4];
  if (taku === SANMA) {
    const ko = _roundup100(Math.floor(n4 / 2));
    const oya = ko;
    const total = n4 ? (is_tsumo ? (is_oya ? 2 * ko : oya + ko) : n4) : 0;
    // Python: total = n4 if not is_tsumo else (2*ko if is_oya else oya+ko)
    // keep exact
    const tot = !is_tsumo ? n4 : is_oya ? 2 * ko : oya + ko;
    return [tot, ko, oya];
  }
  const ko = _roundup100((is_oya ? 2 : 1) * b);
  const oya = _roundup100(2 * b);
  const total = !is_tsumo ? n4 : is_oya ? 3 * ko : oya + 2 * ko;
  return [total, ko, oya];
}

export function _finish(
  ctx: WinContext,
  bits: bigint,
  han: number,
  fu: number,
  yakuman: number,
  dora: number,
): EvaluateResult {
  const total_han = han + dora;
  if (yakuman === 0 && total_han >= 13) bits |= BigInt(1) << BigInt(Y["Kazoeyakuman"]);
  if (dora) bits |= BigInt(1) << BigInt(Y["Dora"]);
  const rank = han_rank(total_han, fu, yakuman);
  return {
    bits,
    han: total_han,
    yaku_han: han,
    fu,
    dora,
    yakuman,
    rank,
  };
}

// yaku bits that on their own do not make a hand valid
export const _NO_YAKU_BITS = (BigInt(1) << BigInt(Y["Dora"])) | (BigInt(1) << BigInt(Y["Kazoeyakuman"]));

export function has_yaku(result: EvaluateResult): boolean {
  return result.yakuman > 0 || (result.bits & ~_NO_YAKU_BITS) !== BigInt(0);
}

export function score_hand(ctx: WinContext): EvaluateResult | null {
  const res = evaluate(ctx);
  if (!has_yaku(res)) return null;
  return res;
}

// --------------------------------------------------------------------------
// aliases for camelCase / underscore compatibility and re-exports
// --------------------------------------------------------------------------

// Provide snake_case aliases already exported; also expose camelCase for convenience
export const paiNorm = pai_norm;
export const paiToIdx = pai_to_idx;
export const idxToPai = idx_to_pai;
export const isHonor = is_honor;
export const isTerminal = is_terminal;
export const isYaochu = is_yaochu;
export const liveKinds = live_kinds;
export const buildWall = build_wall;
export const doraFromIndicator = dora_from_indicator;
export const countsOf = counts_of;
export const shantenStandard = shanten_standard;
export const shantenChiitoi = shanten_chiitoi;
export const shantenKokushi = shanten_kokushi;
export const isAgari = is_agari;
export const waitsOf = waits_of;
export const baseScore = base_score;
export const baseScoreRank = base_score_rank;
export const hanRank = han_rank;
export const hasYaku = has_yaku;
export const scoreHand = score_hand;

// internal helpers are already accessible via imports (named exports below)
// Python parity: re-export with same names via export alias block at EOF if needed

// ensure default export compatibility if needed
export default {
  MAN,
  SOU,
  PIN,
  HON,
  pai_norm,
  pai_to_idx,
  idx_to_pai,
  is_honor,
  is_terminal,
  is_yaochu,
  YAOCHU_IDX,
  GREEN_IDX,
  TONPU,
  HANCHAN,
  SANMA,
  NIMA,
  SEATS_OF,
  KYOKU_COUNT,
  START_SCORE,
  live_kinds,
  build_wall,
  dora_from_indicator,
  counts_of,
  shanten_standard,
  shanten_chiitoi,
  shanten_kokushi,
  shanten,
  is_agari,
  waits_of,
  ukeire,
  KOTSU,
  SHUNTSU,
  decompositions,
  PON,
  CHI,
  ANKAN,
  MINKAN,
  KAKAN,
  MENTSU_TYPE,
  Meld,
  Y,
  YAKU_HAN,
  YAKUMAN,
  WinContext,
  evaluate,
  han_rank,
  base_score,
  base_score_rank,
  payments,
  has_yaku,
  score_hand,
};
