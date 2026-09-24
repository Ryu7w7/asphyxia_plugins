/**
 * Server-side mahjong table for the VFG local server - TypeScript port of taikyoku.py
 *
 * Owns one CPU match: wall, hands, melds, turn order, the CPU AI and the
 * `cell_data_N` command stream the Unity client consumes through /gget and
 * /gpost.
 *
 * Cell kinds and field names come from MFG.Taikyoku.Command.Receive.*.
 */

/// <reference lib="es2020" />
/// <reference lib="dom" />

import * as mahjong from "./mahjong";

// RECEIVE_COMMAND_TYPE
export const K_TSUMO = 1;
export const K_SUTEHAI = 2;
export const K_TSUMOAGARI = 3;
export const K_RON = 4;
export const K_RYUKYOKU = 5;
export const K_PON = 6;
export const K_CHI = 7;
export const K_ANKAN = 8;
export const K_MINKAN = 9;
export const K_KAKAN = 10;
export const K_TYOKO = 14;
export const K_TSUMOCHOICES = 15;
export const K_SUTECHOICES = 16;
export const K_KYOKUSTART = 17;
export const K_KYOKUEND = 23;
export const K_SCORERANK = 24;

// SEND_COMMAND_TYPE
export const S_ENTRY = 1;
export const S_SUTE_PAI = 2;
export const S_TSUMO_AGARI = 3;
export const S_RON_AGARI = 4;
export const S_PON = 5;
export const S_CHI = 6;
export const S_ANKAN = 7;
export const S_MINKAN = 8;
export const S_KAKAN = 9;
export const S_KYUSYUKYUHAI = 10;
export const S_NAKINASHI = 11;
export const S_CYOUKOU = 12;
export const S_KIKEN = 13;
export const S_RECONNECT = 14;
export const S_NEXT_KYOKU_READY = 15;

// SELECTABLE_TYPE_FLAG
export const F_NONE = 0x1;
export const F_PON = 0x2;
export const F_CHI = 0x4;
export const F_KAN = 0x8;
export const F_TSUMOAGARI = 0x40;
export const F_RON = 0x80;
export const F_KYUSYU = 0x100;
export const F_REACH = 0x200;
export const F_SUTE = 0x400;

export const TAKU_PLAYER_MAX = 4;

function _ints(tag: string, values: readonly number[]): string {
  const vals = values.map((v) => String(Math.trunc(v)));
  const out = vals.length ? vals : ["0"];
  return `<${tag} __count="${out.length}">${out.join(" ")}</${tag}>`;
}

function _pais(values: readonly number[]): number[] {
  return values.map((v) => mahjong.idx_to_pai(v));
}

// RNG compatible with mahjong.build_wall (provides shuffle / random)
class RNG {
  private fn: () => number;
  constructor(seed?: number | null) {
    if (seed !== undefined && seed !== null) {
      let a = seed >>> 0;
      // mulberry32
      this.fn = (() => {
        let s = a;
        return () => {
          let t = (s += 0x6d2b79f5);
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      })();
    } else {
      this.fn = Math.random;
    }
  }
  random(): number {
    return this.fn();
  }
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.fn() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }
  randint(a: number, b: number): number {
    return Math.floor(this.fn() * (b - a + 1)) + a;
  }
}

// Dummy naki XML for yaku cells (4 nakis each with 4 pais)
const DUMMY_NAKI: string = (() => {
  let out = "";
  for (let i = 0; i < 4; i++) {
    let inner = "";
    for (let j = 0; j < 4; j++) {
      inner += `<pai${j}><pai_st>0</pai_st><pai>0</pai></pai${j}>`;
    }
    out += `<naki${i}><type>0</type><kantype>0</kantype>${inner}</naki${i}>`;
  }
  return out;
})();

export class Table {
  taku: number;
  seats: number;
  human: number;
  rng: RNG;
  total_kyoku: number;
  scores: number[];
  kyoku_index: number;
  honba: number;
  kyotaku: number;
  cells: string[];
  state: string;
  pending_tsumo_choices: any | null;
  call_ctx: any | null;
  finished: boolean;
  advance_kyoku: boolean;
  nokori_start: number;

  hands: number[][];
  melds: mahjong.Meld[][];
  discards: number[][];
  discard_log: [number, number][];
  riichi: boolean[];
  double_riichi: boolean[];
  ippatsu: boolean[];
  riichi_at: number[];
  furiten: boolean[];
  temp_furiten: boolean[];
  wall: number[];
  rinshan: number[];
  dora_ind: number[];
  ura_ind: number[];
  dora_open: number;
  kan_count: number;
  turn: number;
  drawn: (number | null)[];
  last_draw_rinshan: boolean;
  first_go_around: boolean;
  discard_count: number;
  any_call: boolean;

  constructor(taku: number, human_seat: number = 0, seed?: number | null) {
    this.taku = taku;
    this.seats = (mahjong as any).SEATS_OF[taku] as number;
    this.human = human_seat % this.seats;
    this.rng = new RNG(seed ?? null);
    this.total_kyoku = (mahjong as any).KYOKU_COUNT[taku] as number;
    this.scores = new Array(4).fill((mahjong as any).START_SCORE[taku] as number);
    for (let i = this.seats; i < 4; i++) {
      this.scores[i] = 0;
    }
    this.kyoku_index = 0;
    this.honba = 0;
    this.kyotaku = 0;
    this.cells = [];
    this.state = "init";
    this.pending_tsumo_choices = null;
    this.call_ctx = null;
    this.finished = false;
    this.advance_kyoku = true;
    this.nokori_start = 0;
    // init kyoku state fields to satisfy TS definite assignment
    this.hands = [[], [], [], []];
    this.melds = [[], [], [], []];
    this.discards = [[], [], [], []];
    this.discard_log = [];
    this.riichi = [false, false, false, false];
    this.double_riichi = [false, false, false, false];
    this.ippatsu = [false, false, false, false];
    this.riichi_at = [-1, -1, -1, -1];
    this.furiten = [false, false, false, false];
    this.temp_furiten = [false, false, false, false];
    this.wall = [];
    this.rinshan = [];
    this.dora_ind = [];
    this.ura_ind = [];
    this.dora_open = 1;
    this.kan_count = 0;
    this.turn = 0;
    this.drawn = [null, null, null, null];
    this.last_draw_rinshan = false;
    this.first_go_around = true;
    this.discard_count = 0;
    this.any_call = false;

    this._new_kyoku_state();
  }

  // bookkeeping
  get oya(): number {
    return this.kyoku_index % this.seats;
  }

  get ba(): number {
    return this.kyoku_index < this.seats ? 0 : 1;
  }

  get kyoku(): number {
    return this.kyoku_index % this.seats;
  }

  get is_all_last(): boolean {
    return this.kyoku_index >= this.total_kyoku - 1;
  }

  seat_wind(seat: number): number {
    return ((seat - this.oya) % this.seats + this.seats) % this.seats;
  }

  private _new_kyoku_state(): void {
    this.hands = [[], [], [], []];
    this.melds = [[], [], [], []];
    this.discards = [[], [], [], []];
    this.discard_log = [];
    this.riichi = [false, false, false, false];
    this.double_riichi = [false, false, false, false];
    this.ippatsu = [false, false, false, false];
    this.riichi_at = [-1, -1, -1, -1];
    this.furiten = [false, false, false, false];
    this.temp_furiten = [false, false, false, false];
    this.wall = [];
    this.rinshan = [];
    this.dora_ind = [];
    this.ura_ind = [];
    this.dora_open = 1;
    this.kan_count = 0;
    this.turn = 0;
    this.drawn = [null, null, null, null];
    this.last_draw_rinshan = false;
    this.first_go_around = true;
    this.discard_count = 0;
    this.any_call = false;
  }

  // cells
  private _cell(kind: number, inner: string, pis?: readonly number[] | null): void {
    const seq = this.cells.length;
    const targets = pis == null ? Array.from({ length: this.seats }, (_, i) => i) : [...pis];
    let flags = "";
    for (let i = 0; i < 4; i++) {
      flags += ` pi${i}="${targets.includes(i) ? 1 : 0}"`;
    }
    this.cells.push(`<cell_data_${seq} kind="${kind}"${flags}>${inner}</cell_data_${seq}>`);
  }

  cells_from(start: number): string {
    if (start < 0) start = 0;
    if (start >= this.cells.length) {
      return '<taikyoku><cell_info available="0" /></taikyoku>';
    }
    const chunk = this.cells.slice(start);
    return (
      "<taikyoku>" +
      '<cell_info available="1">' +
      `<cell_sno start="${start}" count="${chunk.length}"></cell_sno>` +
      chunk.join("") +
      "</cell_info></taikyoku>"
    );
  }

  // kyoku life cycle
  start_kyoku(): void {
    this._new_kyoku_state();
    const tiles = mahjong.build_wall(this.taku, this.rng as any);
    const dead = tiles.slice(-14);
    const live = tiles.slice(0, -14);
    this.rinshan = dead.slice(0, 4);
    this.dora_ind = dead.slice(4, 9);
    this.ura_ind = dead.slice(9, 14);
    let livePtr = 0;
    // distribute hands: use sliced live sequentially
    // replicate Python: for s in range(seats): hands[s]=sorted(live[:13]); live=live[13:]
    let remainingLive = live.slice();
    for (let s = 0; s < this.seats; s++) {
      this.hands[s] = remainingLive.slice(0, 13).sort((a, b) => a - b);
      remainingLive = remainingLive.slice(13);
    }
    this.wall = remainingLive;
    this.nokori_start = this.wall.length;
    this.state = "discard";

    let inner =
      "<chicya>0</chicya>" +
      `<oya>${this.oya}</oya>` +
      _ints("sai", [this.rng.randint(1, 6), this.rng.randint(1, 6)]) +
      `<ba>${this.ba}</ba>` +
      `<kyoku>${this.kyoku}</kyoku>` +
      `<all_last>${this.is_all_last ? 1 : 0}</all_last>` +
      `<honba>${this.honba}</honba>` +
      "<rencyan>0</rencyan>" +
      `<kyoutaku>${this.kyotaku}</kyoutaku>` +
      `<nokori>${this.nokori_start}</nokori>` +
      "<dora_open>1</dora_open>" +
      _ints("dora", _pais(this.dora_ind)) +
      _ints("ura_dora", _pais(this.ura_ind)) +
      `<yama_cnt>${this.wall.length}</yama_cnt>` +
      _ints("yama", _pais(this.wall)) +
      _ints("rinshan", _pais(this.rinshan));

    const ranks = this._ranks();
    for (let i = 0; i < TAKU_PLAYER_MAX; i++) {
      let tepai: number[];
      let score: number;
      let rank: number;
      let jikaze: number;
      if (i < this.seats) {
        tepai = _pais(this.hands[i]);
        score = this.scores[i];
        rank = ranks[i];
        jikaze = this.seat_wind(i);
      } else {
        tepai = new Array(13).fill(1);
        score = 0;
        rank = i;
        jikaze = i;
      }
      inner +=
        `<player_info${i}>` +
        `<jikaze>${jikaze}</jikaze>` +
        _ints("tepai", tepai) +
        `<score>${score}</score>` +
        `<rank>${rank}</rank>` +
        `</player_info${i}>`;
    }
    this._cell(K_KYOKUSTART, inner);
    // log omitted
    this._begin_turn(this.oya);
  }

  private _ranks(): number[] {
    const order = Array.from({ length: this.seats }, (_, i) => i).sort((a, b) => {
      if (this.scores[b] !== this.scores[a]) return this.scores[b] - this.scores[a];
      return this.seat_wind(a) - this.seat_wind(b);
    });
    const ranks = new Array(4).fill(0) as number[];
    for (let r = 0; r < order.length; r++) {
      const i = order[r];
      ranks[i] = r;
    }
    for (let i = this.seats; i < 4; i++) ranks[i] = i;
    return ranks;
  }

  // drawing / turns
  private _draw(seat: number, from_rinshan: boolean = false): number | null {
    if (from_rinshan) {
      if (!this.wall.length || this.kan_count > this.rinshan.length) {
        return null;
      }
      const tile = this.rinshan[this.kan_count - 1];
      this.wall.pop();
      this.hands[seat].push(tile);
      this.hands[seat].sort((a, b) => a - b);
      this.drawn[seat] = tile;
      this.last_draw_rinshan = from_rinshan;
      return tile;
    } else {
      if (!this.wall.length) return null;
      const tile = this.wall.shift()!;
      this.hands[seat].push(tile);
      this.hands[seat].sort((a, b) => a - b);
      this.drawn[seat] = tile;
      this.last_draw_rinshan = from_rinshan;
      return tile;
    }
  }

  private _begin_turn(seat: number, from_rinshan: boolean = false): void {
    if (this.state === "kyoku_end" || this.state === "game_end") return;
    const tile = this._draw(seat, from_rinshan);
    if (tile === null) {
      this._ryuukyoku();
      return;
    }
    this.turn = seat;
    this._cell(K_TSUMO, `<pindex>${seat}</pindex><pai>${mahjong.idx_to_pai(tile)}</pai>`);
    this.temp_furiten[seat] = false;
    if (seat === this.human) {
      this._offer_tsumo_choices(seat);
    } else {
      this._cpu_turn(seat);
    }
  }

  private _next_seat(seat: number): number {
    return (seat + 1) % this.seats;
  }

  // human choice cells
  private _tenpai_patterns(seat: number): [number, number[]][] {
    const hand = this.hands[seat];
    const opened = this.melds[seat].length;
    const out: [number, number[]][] = [];
    const seen = new Set<number>();
    for (const t of hand) {
      if (seen.has(t)) continue;
      seen.add(t);
      const rest = [...hand];
      const idx = rest.indexOf(t);
      if (idx !== -1) rest.splice(idx, 1);
      const c = mahjong.counts_of(rest);
      if (mahjong.shanten(c as any, opened, this.taku) !== 0) continue;
      const w = mahjong.waits_of(c as any, opened, this.taku);
      if (w.length) out.push([t, w]);
    }
    return out;
  }

  private _visible_counts(seat: number): number[] {
    const c = new Array(34).fill(0) as number[];
    for (const t of this.hands[seat]) c[t] += 1;
    for (let s = 0; s < this.seats; s++) {
      for (const t of this.discards[s]) c[t] += 1;
      for (const m of this.melds[s]) {
        for (const t of m.tiles) c[t] += 1;
      }
    }
    for (const t of this.dora_ind.slice(0, this.dora_open)) c[t] += 1;
    return c.map((n) => Math.min(4, n));
  }

  private _ankan_options(seat: number): [number, number][] {
    const out: [number, number][] = [];
    if (!this.wall.length || this.kan_count >= 4) return out;
    const c = mahjong.counts_of(this.hands[seat]);
    const opened = this.melds[seat].length;
    for (let t = 0; t < 34; t++) {
      if ((c as number[])[t] !== 4) continue;
      if (this.riichi[seat]) {
        if (this.drawn[seat] !== t) continue;
        const before_hand = [...this.hands[seat]];
        const idx = before_hand.indexOf(t);
        if (idx !== -1) before_hand.splice(idx, 1);
        const before = (mahjong.waits_of(mahjong.counts_of(before_hand) as any, opened, this.taku) as number[]).slice().sort((a, b) => a - b);
        const after_hand = this.hands[seat].filter((x) => x !== t);
        const after = (mahjong.waits_of(mahjong.counts_of(after_hand) as any, opened + 1, this.taku) as number[]).slice().sort((a, b) => a - b);
        if (before.join(",") !== after.join(",") || !after.length) continue;
      }
      out.push([t, 1]);
    }
    if (!this.riichi[seat]) {
      for (const m of this.melds[seat]) {
        if (m.kind === (mahjong as any).PON && (c as number[])[(m.tiles[0] as number)] >= 1) {
          out.push([m.tiles[0] as number, 3]);
        }
      }
    }
    return out;
  }

  private _kyuushu_ok(seat: number): boolean {
    if (!this.first_go_around || this.any_call) return false;
    if (this.discards[seat].length) return false;
    const kinds = new Set<number>();
    for (const t of this.hands[seat]) if (mahjong.is_yaochu(t)) kinds.add(t);
    return kinds.size >= 9;
  }

  private _offer_tsumo_choices(seat: number): void {
    const opened = this.melds[seat].length;
    let flags = F_SUTE;
    let patterns: [number, number[]][] = [];
    if (this._win_result(seat, this.drawn[seat], true) !== null) {
      flags |= F_TSUMOAGARI;
    }
    if (!this.riichi[seat] && opened === 0 && this.scores[seat] >= 1000 && this.wall.length >= 4) {
      patterns = this._tenpai_patterns(seat);
      if (patterns.length) flags |= F_REACH;
    }
    const kans = this._ankan_options(seat);
    if (kans.length) flags |= F_KAN;
    if (this._kyuushu_ok(seat)) flags |= F_KYUSYU;
    this.pending_tsumo_choices = {
      seat,
      flags,
      patterns,
      kans,
    };
    this.state = "discard";
  }

  flush_pending(): void {
    const p = this.pending_tsumo_choices;
    if (!p) return;
    this.pending_tsumo_choices = null;
    const seat: number = p.seat;
    const vis = this._visible_counts(seat);
    let inner = `<select>${p.flags}</select>`;
    inner += `<ptn_num>${p.patterns.length}</ptn_num>`;
    for (let i = 0; i < p.patterns.length; i++) {
      const [sute, waits] = p.patterns[i] as [number, number[]];
      const stat = waits.map((w) => (vis[w] >= 4 ? 2 : 0));
      inner +=
        `<ptn${i}>` +
        `<sute_pai>${mahjong.idx_to_pai(sute)}</sute_pai>` +
        `<machi_num>${waits.length}</machi_num>` +
        _ints("machi_pai", _pais(waits)) +
        _ints("stat", stat) +
        `</ptn${i}>`;
    }
    if (p.kans && p.kans.length) {
      inner += _ints("kan_pai", (p.kans as [number, number][]).map(([t, _]) => mahjong.idx_to_pai(t)));
      inner += _ints("kan_type", (p.kans as [number, number][]).map(([_, k]) => k));
    }
    this._cell(K_TSUMOCHOICES, inner, [seat]);
  }

  // win evaluation
  private _win_result(seat: number, win_tile: number | null, is_tsumo: boolean, chankan: boolean = false): any | null {
    if (win_tile === null || win_tile === undefined) return null;
    let hand = [...this.hands[seat]];
    if (!is_tsumo) hand = hand.concat([win_tile]);
    if (hand.length % 3 !== 2) return null;
    if (!mahjong.is_agari(mahjong.counts_of(hand) as any, this.melds[seat].length, this.taku)) return null;
    if (!is_tsumo && (this.furiten[seat] || this.temp_furiten[seat])) return null;
    const last_tile = this.wall.length === 0;
    const ctx = new mahjong.WinContext({
      hand,
      melds: this.melds[seat],
      win_tile,
      is_tsumo,
      seat_wind: this.seat_wind(seat),
      round_wind: this.ba,
      riichi: this.riichi[seat],
      double_riichi: this.double_riichi[seat],
      ippatsu: this.ippatsu[seat],
      haitei: is_tsumo && last_tile && !this.last_draw_rinshan,
      houtei: !is_tsumo && last_tile && !chankan,
      rinshan: is_tsumo && this.last_draw_rinshan,
      chankan,
      tenho: is_tsumo && this.first_go_around && !this.any_call && seat === this.oya && this.discard_count === 0,
      chiho: is_tsumo && this.first_go_around && !this.any_call && seat !== this.oya && !this.discards[seat].length,
      dora_indicators: this.dora_ind.slice(0, this.dora_open),
      ura_indicators: this.ura_ind.slice(0, this.dora_open),
      taku: this.taku,
    } as any);
    return mahjong.score_hand(ctx as any);
  }

  private _update_furiten(seat: number): void {
    const opened = this.melds[seat].length;
    const c = mahjong.counts_of(this.hands[seat]) as number[];
    if ((c.reduce((a, b) => a + b, 0) % 3) !== 1) return;
    const w = new Set(mahjong.waits_of(c as any, opened, this.taku) as number[]);
    this.furiten[seat] = w.size > 0 && this.discards[seat].some((t) => w.has(t));
  }

  // discard
  private _do_discard(seat: number, tile: number, riichi: boolean, tsumogiri: boolean): void {
    if (!this.hands[seat].includes(tile)) {
      if (this.drawn[seat] !== null && this.hands[seat].includes(this.drawn[seat] as number)) {
        tile = this.drawn[seat] as number;
      } else if (this.hands[seat].length) {
        tile = this.hands[seat][this.hands[seat].length - 1];
      } else {
        return;
      }
    }
    const idx = this.hands[seat].indexOf(tile);
    if (idx !== -1) this.hands[seat].splice(idx, 1);
    this.hands[seat].sort((a, b) => a - b);
    this.discards[seat].push(tile);
    this.discard_log.push([seat, tile]);
    this.drawn[seat] = null;
    this.discard_count += 1;
    if (riichi) {
      this.riichi[seat] = true;
      this.ippatsu[seat] = true;
      this.riichi_at[seat] = this.discard_log.length;
      if (this.first_go_around && !this.any_call) {
        this.double_riichi[seat] = true;
      }
      this.scores[seat] -= 1000;
      this.kyotaku += 1;
    } else {
      this.ippatsu[seat] = false;
    }
    const stat = (riichi ? 1 : 0) | (tsumogiri ? 2 : 0);
    this._cell(K_SUTEHAI, `<pindex>${seat}</pindex><pai>${mahjong.idx_to_pai(tile)}</pai><stat>${stat}</stat>`);
    if (riichi) {
      this._score_rank_cell();
    }
    this._update_furiten(seat);
    if (this.discard_count >= this.seats) {
      this.first_go_around = false;
    }
    this._after_discard(seat, tile);
  }

  private _score_rank_cell(): void {
    const ranks = this._ranks();
    let inner = `<kyoutaku>${this.kyotaku}</kyoutaku>`;
    for (let i = 0; i < TAKU_PLAYER_MAX; i++) {
      const score = i < this.seats ? this.scores[i] : 0;
      inner += `<riti_after${i}><score>${score}</score><rank>${ranks[i]}</rank></riti_after${i}>`;
    }
    this._cell(K_SCORERANK, inner);
  }

  // calls after a discard
  private _pon_options(seat: number, tile: number): number[][] {
    if ((mahjong.counts_of(this.hands[seat]) as number[])[tile] < 2) return [];
    return [[tile, tile]];
  }

  private _chi_options(seat: number, tile: number): number[][] {
    if (mahjong.is_honor(tile)) return [];
    const c = mahjong.counts_of(this.hands[seat]) as number[];
    const n = tile % 9;
    const out: number[][] = [];
    if (n >= 2 && c[tile - 2] && c[tile - 1]) out.push([tile - 2, tile - 1]);
    if (n >= 1 && n <= 7 && c[tile - 1] && c[tile + 1]) out.push([tile - 1, tile + 1]);
    if (n <= 6 && c[tile + 1] && c[tile + 2]) out.push([tile + 1, tile + 2]);
    return out;
  }

  private _minkan_ok(seat: number, tile: number): boolean {
    return (mahjong.counts_of(this.hands[seat]) as number[])[tile] >= 3 && this.kan_count < 4 && !!this.wall.length;
  }

  private _after_discard(discarder: number, tile: number): void {
    const human = this.human;
    if (human !== discarder) {
      const ron = this._win_result(human, tile, false) !== null;
      const pon = !this.riichi[human] && !!this._pon_options(human, tile).length;
      const chi = !this.riichi[human] && human === this._next_seat(discarder) && !!this._chi_options(human, tile).length;
      const kan = !this.riichi[human] && this._minkan_ok(human, tile);
      if (ron || pon || chi || kan) {
        this._offer_sute_choices(discarder, tile, ron, pon, chi, kan);
        return;
      }
    }
    this._cpu_calls(discarder, tile);
  }

  private _offer_sute_choices(discarder: number, tile: number, ron: boolean, pon: boolean, chi: boolean, kan: boolean, chankan: boolean = false): void {
    let flags = 0;
    let naki = 0;
    if (ron) flags |= F_RON;
    if (pon) {
      flags |= F_PON;
      naki |= F_PON;
    }
    if (chi) {
      flags |= F_CHI;
      naki |= F_CHI;
    }
    if (kan) {
      flags |= F_KAN;
      naki |= F_KAN;
    }
    let inner =
      `<select>${flags}</select>` +
      `<naki>${naki}</naki>` +
      `<pindex>${discarder}</pindex>` +
      `<sute_pai>${mahjong.idx_to_pai(tile)}</sute_pai>`;
    if (chi) {
      const flat: number[] = [];
      for (const o of this._chi_options(this.human, tile).slice(0, 6)) {
        for (const t of o) flat.push(mahjong.idx_to_pai(t));
      }
      inner += _ints("chi_pai", flat);
    }
    if (pon) {
      inner += _ints("pon_pai", [mahjong.idx_to_pai(tile), mahjong.idx_to_pai(tile)]);
    }
    if (kan) {
      inner += _ints("kan_pai", [mahjong.idx_to_pai(tile)]);
      inner += _ints("kan_type", [2]);
    }
    this._cell(K_SUTECHOICES, inner, [this.human]);
    this.call_ctx = {
      discarder,
      tile,
      ron,
      chankan,
    };
    this.state = "call";
  }

  private _cpu_calls(discarder: number, tile: number): void {
    const order = Array.from({ length: this.seats - 1 }, (_, i) => (discarder + 1 + i) % this.seats);
    for (const s of order) {
      if (s === this.human) continue;
      const res = this._win_result(s, tile, false);
      if (res !== null) {
        const m: Record<number, any> = {};
        m[s] = res;
        this._apply_ron([s], discarder, tile, m);
        return;
      }
    }
    for (const s of order) {
      if (s === this.human || this.riichi[s]) continue;
      if (this._minkan_ok(s, tile) && this._cpu_wants_pon(s, tile)) {
        this._apply_minkan(s, discarder, tile);
        return;
      }
      if (this._pon_options(s, tile).length && this._cpu_wants_pon(s, tile)) {
        this._apply_pon(s, discarder, tile, [tile, tile]);
        return;
      }
    }
    const nxt = this._next_seat(discarder);
    if (nxt !== this.human && !this.riichi[nxt]) {
      const pick = this._cpu_pick_chi(nxt, tile, this._chi_options(nxt, tile));
      if (pick !== null) {
        this._apply_chi(nxt, discarder, tile, pick);
        return;
      }
    }
    this._begin_turn(this._next_seat(discarder));
  }

  private _resume_after_chankan(kan_seat: number): void {
    this._begin_turn(kan_seat, true);
  }

  // meld application
  private _break_ippatsu(): void {
    for (let s = 0; s < this.seats; s++) this.ippatsu[s] = false;
    this.any_call = true;
    this.first_go_around = false;
  }

  private _apply_pon(seat: number, from_seat: number, tile: number, own: readonly number[]): void {
    for (const t of own) {
      const idx = this.hands[seat].indexOf(t);
      if (idx !== -1) this.hands[seat].splice(idx, 1);
    }
    this.melds[seat].push(new mahjong.Meld(mahjong.PON as any, [tile, tile, tile], tile, from_seat));
    this._break_ippatsu();
    this._cell(K_PON, `<pindex>${seat}</pindex><sute_pindex>${from_seat}</sute_pindex><pai>${mahjong.idx_to_pai(tile)}</pai>${_ints("pon_pai", own.map((t) => mahjong.idx_to_pai(t)))}`);
    this.turn = seat;
    this.drawn[seat] = null;
    if (seat === this.human) {
      this._offer_tsumo_choices(seat);
    } else {
      this._cpu_discard_after_call(seat);
    }
  }

  private _apply_chi(seat: number, from_seat: number, tile: number, own: readonly number[]): void {
    for (const t of own) {
      const idx = this.hands[seat].indexOf(t);
      if (idx !== -1) this.hands[seat].splice(idx, 1);
    }
    const sortedTiles = [...[tile, ...own]].sort((a, b) => a - b);
    this.melds[seat].push(new mahjong.Meld(mahjong.CHI as any, sortedTiles, tile, from_seat));
    this._break_ippatsu();
    this._cell(K_CHI, `<pindex>${seat}</pindex><sute_pindex>${from_seat}</sute_pindex><pai>${mahjong.idx_to_pai(tile)}</pai>${_ints("chi_pai", own.map((t) => mahjong.idx_to_pai(t)))}`);
    this.turn = seat;
    this.drawn[seat] = null;
    if (seat === this.human) {
      this._offer_tsumo_choices(seat);
    } else {
      this._cpu_discard_after_call(seat);
    }
  }

  private _apply_minkan(seat: number, from_seat: number, tile: number): void {
    for (let i = 0; i < 3; i++) {
      const idx = this.hands[seat].indexOf(tile);
      if (idx !== -1) this.hands[seat].splice(idx, 1);
    }
    this.melds[seat].push(new mahjong.Meld(mahjong.MINKAN as any, [tile, tile, tile, tile], tile, from_seat));
    this._break_ippatsu();
    this.kan_count += 1;
    this.dora_open = Math.min(5, this.dora_open + 1);
    this._cell(K_MINKAN, `<pindex>${seat}</pindex><sute_pindex>${from_seat}</sute_pindex><pai>${mahjong.idx_to_pai(tile)}</pai>`);
    this._begin_turn(seat, true);
  }

  private _apply_ankan(seat: number, tile: number): void {
    for (let i = 0; i < 4; i++) {
      const idx = this.hands[seat].indexOf(tile);
      if (idx !== -1) this.hands[seat].splice(idx, 1);
    }
    this.melds[seat].push(new mahjong.Meld(mahjong.ANKAN as any, [tile, tile, tile, tile], tile, seat));
    this.kan_count += 1;
    this.dora_open = Math.min(5, this.dora_open + 1);
    this.any_call = true;
    this._cell(K_ANKAN, `<pindex>${seat}</pindex><pai>${mahjong.idx_to_pai(tile)}</pai>`);
    this._begin_turn(seat, true);
  }

  private _apply_kakan(seat: number, tile: number): void {
    const idxH = this.hands[seat].indexOf(tile);
    if (idxH !== -1) this.hands[seat].splice(idxH, 1);
    for (const m of this.melds[seat]) {
      if (m.kind === (mahjong as any).PON && m.tiles[0] === tile) {
        (m as any).kind = mahjong.KAKAN as any;
        (m as any).tiles = [tile, tile, tile, tile];
        break;
      }
    }
    this.kan_count += 1;
    this.dora_open = Math.min(5, this.dora_open + 1);
    this.any_call = true;
    this._cell(K_KAKAN, `<pindex>${seat}</pindex><pai>${mahjong.idx_to_pai(tile)}</pai>`);
    for (let i = 1; i < this.seats; i++) {
      const s = (seat + i) % this.seats;
      const res = this._win_result(s, tile, false, true);
      if (res === null) continue;
      if (s === this.human) {
        this._offer_sute_choices(seat, tile, true, false, false, false, true);
        return;
      }
      const m: Record<number, any> = {};
      m[s] = res;
      this._apply_ron([s], seat, tile, m);
      return;
    }
    this._begin_turn(seat, true);
  }

  // CPU AI
  private _danger(seat: number, tile: number): number {
    let risk = 0;
    for (let s = 0; s < this.seats; s++) {
      if (s === seat || !this.riichi[s]) continue;
      if (this.discards[s].includes(tile)) continue;
      const start = Math.max(0, this.riichi_at[s]);
      let seen = false;
      for (let k = start; k < this.discard_log.length; k++) {
        if (this.discard_log[k][1] === tile) {
          seen = true;
          break;
        }
      }
      if (seen) continue;
      risk += mahjong.is_yaochu(tile) ? 4 : 10;
      if (!mahjong.is_honor(tile) && tile % 9 >= 2 && tile % 9 <= 6) risk += 4;
    }
    return risk;
  }

  private _cpu_choose_discard(seat: number): [number, boolean] {
    const drawn = this.drawn[seat];
    if (this.riichi[seat]) {
      return [(drawn !== null ? drawn : this.hands[seat][this.hands[seat].length - 1]), false];
    }
    const opened = this.melds[seat].length;
    const seen = this._visible_counts(seat);
    const threat = this.riichi.some((v, s) => s !== seat && v);
    const doraSet = new Set<number>();
    for (const d of this.dora_ind.slice(0, this.dora_open)) doraSet.add(mahjong.dora_from_indicator(d, this.taku));
    const yakuhai = new Set(this._cpu_yakuhai_kinds(seat));

    let best_tile: number | null = null;
    let best_score: number | null = null;
    let best_sh = 99;
    const uniq = Array.from(new Set(this.hands[seat])).sort((a, b) => a - b);
    for (const t of uniq) {
      const rest = [...this.hands[seat]];
      const idx = rest.indexOf(t);
      if (idx !== -1) rest.splice(idx, 1);
      const c = mahjong.counts_of(rest) as number[];
      const sh = mahjong.shanten(c as any, opened, this.taku);
      const uk = sh <= 3 ? mahjong.ukeire(c as any, opened, this.taku, seen as any) : 0;
      const danger = this._danger(seat, t);
      let keep = 0;
      if (yakuhai.has(t) && (mahjong.counts_of(this.hands[seat]) as number[])[t] >= 2) keep += 3;
      if (doraSet.has(t)) keep += 3;
      let score = sh * 120.0 - uk * 1.5 + keep * 6.0;
      if (threat) {
        const weight = sh >= 2 ? 3.0 : 1.2;
        score += danger * weight;
      }
      score += this.rng.random() * 0.5;
      if (best_score === null || score < best_score) {
        best_score = score;
        best_tile = t;
        best_sh = sh;
      }
    }
    const tile = best_tile !== null ? best_tile : this.hands[seat][this.hands[seat].length - 1];
    let declare = false;
    if (opened === 0 && best_sh === 0 && this.scores[seat] >= 1000 && this.wall.length >= 4) {
      const rest = [...this.hands[seat]];
      const idx = rest.indexOf(tile);
      if (idx !== -1) rest.splice(idx, 1);
      if ((mahjong.waits_of(mahjong.counts_of(rest) as any, 0, this.taku) as number[]).length) {
        declare = true;
      }
    }
    return [tile, declare];
  }

  private _cpu_yakuhai_kinds(seat: number): number[] {
    const out = [mahjong.HON + 4, mahjong.HON + 5, mahjong.HON + 6, mahjong.HON + this.ba, mahjong.HON + this.seat_wind(seat)];
    return out.filter((t) => mahjong.HON <= t && t < 34);
  }

  private _cpu_wants_pon(seat: number, tile: number): boolean {
    if (this.riichi[seat]) return false;
    const opened = this.melds[seat].length;
    const rest = [...this.hands[seat]];
    for (let i = 0; i < 2; i++) {
      const idx = rest.indexOf(tile);
      if (idx !== -1) rest.splice(idx, 1);
    }
    const before = mahjong.shanten(mahjong.counts_of(this.hands[seat]) as any, opened, this.taku);
    const after = mahjong.shanten(mahjong.counts_of(rest) as any, opened + 1, this.taku);
    if (after > before) return false;
    if (this._cpu_yakuhai_kinds(seat).includes(tile)) return true;
    if (after >= before) return false;
    const allt: number[] = [...rest, tile, tile, tile];
    for (const m of this.melds[seat]) allt.push(...m.tiles as number[]);
    if (!allt.some((t) => mahjong.is_yaochu(t))) return true;
    if (opened && this.melds[seat].every((m) => m.kind !== (mahjong as any).CHI)) return true;
    return false;
  }

  private _cpu_pick_chi(seat: number, tile: number, opts: number[][]): number[] | null {
    if (!opts.length || this.riichi[seat]) return null;
    const opened = this.melds[seat].length;
    const before = mahjong.shanten(mahjong.counts_of(this.hands[seat]) as any, opened, this.taku);
    let best: [number, number[]] | null = null;
    for (const o of opts) {
      const rest = [...this.hands[seat]];
      let ok = true;
      for (const t of o) {
        const idx = rest.indexOf(t);
        if (idx !== -1) rest.splice(idx, 1);
        else ok = false;
      }
      if (!ok) continue;
      const after = mahjong.shanten(mahjong.counts_of(rest) as any, opened + 1, this.taku);
      if (after >= before) continue;
      const allt: number[] = [...rest, ...o, tile];
      for (const m of this.melds[seat]) allt.push(...m.tiles as number[]);
      if (allt.some((t) => mahjong.is_yaochu(t))) continue;
      if (best === null || after < best[0]) best = [after, o];
    }
    return best ? best[1] : null;
  }

  private _cpu_wants_kan(seat: number, tile: number, ktype: number): boolean {
    if (this.riichi[seat]) return ktype === 1;
    const opened = this.melds[seat].length;
    const before = mahjong.shanten(mahjong.counts_of(this.hands[seat]) as any, opened, this.taku);
    const rest = [...this.hands[seat]];
    const drop = ktype === 1 ? 4 : 1;
    for (let i = 0; i < drop; i++) {
      const idx = rest.indexOf(tile);
      if (idx !== -1) rest.splice(idx, 1);
    }
    const after = mahjong.shanten(mahjong.counts_of(rest) as any, opened + 1, this.taku);
    return after <= before;
  }

  private _cpu_turn(seat: number): void {
    const drawn = this.drawn[seat];
    const res = this._win_result(seat, drawn as number, true);
    if (res !== null) {
      this._apply_tsumo(seat, drawn as number, res);
      return;
    }
    for (const [tile, ktype] of this._ankan_options(seat)) {
      if (!this._cpu_wants_kan(seat, tile, ktype)) continue;
      if (ktype === 1) {
        this._apply_ankan(seat, tile);
      } else {
        this._apply_kakan(seat, tile);
      }
      return;
    }
    const [tile, declare] = this._cpu_choose_discard(seat);
    this._do_discard(seat, tile, declare, tile === drawn);
  }

  private _cpu_discard_after_call(seat: number): void {
    const [tile] = this._cpu_choose_discard(seat);
    this._do_discard(seat, tile, false, false);
  }

  // agari / ryuukyoku
  private _yaku_xml(tag: string, res: any | null, win_pai_idx: number, hand_idx: readonly number[]): string {
    let bits: bigint;
    let han: number;
    let fu: number;
    let dora: number;
    let rank: number;
    if (res === null) {
      bits = BigInt(0);
      han = 0;
      fu = 0;
      dora = 0;
      rank = 0;
    } else {
      bits = BigInt(res.bits);
      han = res.han;
      fu = res.fu;
      dora = res.dora;
      rank = res.rank;
    }
    const yaku1 = Number(bits & BigInt(0xffffffff));
    const yaku2 = Number((bits >> BigInt(32)) & BigInt(0xffffffff));
    return (
      `<${tag}>` +
      `<pai>${mahjong.idx_to_pai(win_pai_idx)}</pai>` +
      `<yaku_han>${rank}</yaku_han>` +
      `<han_num>${han}</han_num>` +
      `<fu_num>${fu}</fu_num>` +
      `<dora_num>${dora}</dora_num>` +
      "<bonus_han>0</bonus_han>" +
      `<yaku1>${yaku1}</yaku1>` +
      `<yaku2>${yaku2}</yaku2>` +
      _ints("tepai", _pais(hand_idx)) +
      DUMMY_NAKI +
      `</${tag}>`
    );
  }

  private _calc_score_xml(before: readonly number[], yaku: readonly number[], kyotaku: readonly number[], tsumifu: readonly number[]): string {
    let out = "";
    for (let i = 0; i < TAKU_PLAYER_MAX; i++) {
      const b = before[i];
      const y = yaku[i];
      const k = kyotaku[i];
      const t = tsumifu[i];
      out +=
        `<calc_score${i}>` +
        `<before_score>${b}</before_score>` +
        `<yaku_score>${y}</yaku_score>` +
        `<kyotaku_score>${k}</kyotaku_score>` +
        `<tumifu_score>${t}</tumifu_score>` +
        `<new_score>${b + y + k + t}</new_score>` +
        "<wherefore>0</wherefore>" +
        `</calc_score${i}>`;
    }
    return out;
  }

  private _apply_tsumo(seat: number, win_tile: number, res: any): void {
    const before = [...this.scores];
    const yaku = [0, 0, 0, 0] as number[];
    const kyo = [0, 0, 0, 0] as number[];
    const fu = [0, 0, 0, 0] as number[];
    const is_oya = seat === this.oya;
    const [_total, ko, oya] = mahjong.payments(this.taku, res.rank, res.fu, is_oya, true);
    let gain = 0;
    for (let s = 0; s < this.seats; s++) {
      if (s === seat) continue;
      const pay = s === this.oya && !is_oya ? oya : ko;
      yaku[s] = -pay;
      fu[s] = -100 * this.honba;
      gain += pay;
    }
    yaku[seat] = gain;
    fu[seat] = 100 * this.honba * (this.seats - 1);
    kyo[seat] = 1000 * this.kyotaku;
    for (let i = 0; i < 4; i++) this.scores[i] = before[i] + yaku[i] + kyo[i] + fu[i];
    this.kyotaku = 0;

    const inner =
      `<pindex>${seat}</pindex>` +
      `<dora_open>${this.dora_open}</dora_open>` +
      _ints("dora", _pais(this.dora_ind)) +
      _ints("ura_dora", _pais(this.ura_ind)) +
      this._yaku_xml("yaku", res, win_tile, this.hands[seat]) +
      this._calc_score_xml(before, yaku, kyo, fu);
    this._cell(K_TSUMOAGARI, inner);
    this._end_kyoku([seat]);
  }

  private _apply_ron(winners: number[], discarder: number, win_tile: number, results: Record<number, any>): void {
    const before = [...this.scores];
    const yaku = [0, 0, 0, 0] as number[];
    const kyo = [0, 0, 0, 0] as number[];
    const fu = [0, 0, 0, 0] as number[];
    let first = true;
    for (const s of winners) {
      const res = results[s];
      const [total, _ko, _oya] = mahjong.payments(this.taku, res.rank, res.fu, s === this.oya, false);
      yaku[s] += total;
      yaku[discarder] -= total;
      fu[s] += 300 * this.honba;
      fu[discarder] -= 300 * this.honba;
      if (first) {
        kyo[s] += 1000 * this.kyotaku;
        first = false;
      }
    }
    this.kyotaku = 0;
    for (let i = 0; i < 4; i++) this.scores[i] = before[i] + yaku[i] + kyo[i] + fu[i];

    let inner =
      `<furikomi_pindex>${discarder}</furikomi_pindex>` +
      _ints("ron_flg", [0, 1, 2, 3].map((i) => (winners.includes(i) ? 1 : 0))) +
      `<dora_open>${this.dora_open}</dora_open>` +
      _ints("dora", _pais(this.dora_ind)) +
      _ints("ura_dora", _pais(this.ura_ind));
    for (let i = 0; i < TAKU_PLAYER_MAX; i++) {
      if (winners.includes(i)) {
        inner += this._yaku_xml(`yaku${i}`, results[i], win_tile, [...this.hands[i], win_tile].sort((a, b) => a - b));
      } else {
        inner += this._yaku_xml(`yaku${i}`, null, win_tile, new Array(13).fill(0));
      }
    }
    inner += this._calc_score_xml(before, yaku, kyo, fu);
    this._cell(K_RON, inner);
    this._end_kyoku(winners);
  }

  private _ryuukyoku(abortive: boolean = false): void {
    const before = [...this.scores];
    const yaku = [0, 0, 0, 0] as number[];
    const tenpai: number[] = [];
    const machi: Record<number, number[]> = {};
    if (!abortive) {
      for (let s = 0; s < this.seats; s++) {
        const c = mahjong.counts_of(this.hands[s]) as number[];
        if (c.reduce((a, b) => a + b, 0) % 3 !== 1) continue;
        if (mahjong.shanten(c as any, this.melds[s].length, this.taku) !== 0) continue;
        const w = mahjong.waits_of(c as any, this.melds[s].length, this.taku) as number[];
        if (w.length) {
          tenpai.push(s);
          machi[s] = w;
        }
      }
      const n = tenpai.length;
      if (n > 0 && n < this.seats) {
        const gain = Math.floor(3000 / n);
        const loss = Math.floor(3000 / (this.seats - n));
        for (let s = 0; s < this.seats; s++) {
          yaku[s] = tenpai.includes(s) ? gain : -loss;
        }
      }
    }
    for (let i = 0; i < 4; i++) this.scores[i] = before[i] + yaku[i];

    let inner = "";
    for (let i = 0; i < TAKU_PLAYER_MAX; i++) {
      const is_tenpai = tenpai.includes(i);
      const pais = is_tenpai ? _pais(machi[i] ?? []) : [0];
      inner +=
        `<ryukyoku_status${i}>` +
        `<end_stat>${is_tenpai ? 1 : 0}</end_stat>` +
        _ints("machi_pai", pais) +
        `</ryukyoku_status${i}>`;
    }
    inner += this._calc_score_xml(before, yaku, [0, 0, 0, 0], [0, 0, 0, 0]);
    this._cell(K_RYUKYOKU, inner);
    const renchan = abortive || tenpai.includes(this.oya);
    this._end_kyoku([], renchan, true);
  }

  private _end_kyoku(winners: number[], renchan: boolean | null = null, draw: boolean = false): void {
    this._score_rank_cell();
    if (renchan === null) renchan = winners.includes(this.oya);
    if (renchan || draw) this.honba += 1;
    else this.honba = 0;
    this.advance_kyoku = !renchan;
    const last = this.kyoku_index >= this.total_kyoku - 1;
    const busted = this.scores.slice(0, this.seats).some((s) => s < 0);
    const game_over = busted || (last && !renchan);
    this._cell(K_KYOKUEND, `<end_stat>${game_over ? 1 : 0}</end_stat>`);
    this.pending_tsumo_choices = null;
    this.call_ctx = null;
    if (game_over) {
      this.state = "game_end";
      this.finished = true;
    } else {
      this.state = "kyoku_end";
    }
  }

  next_kyoku(): void {
    if (this.state !== "kyoku_end") return;
    if (this.advance_kyoku) this.kyoku_index += 1;
    this.start_kyoku();
  }

  // client commands
  on_command(kind: number, pindex: number, pai: number, tepai_id: number, tepai_id2: number, reach: number, tsumogiri: number): void {
    const seat = pindex;
    try {
      this._dispatch(kind, seat, pindex, pai, tepai_id, tepai_id2, reach, tsumogiri);
    } catch (_e) {
      // log exception omitted
    }
  }

  private _dispatch(kind: number, seat: number, pindex: number, pai: number, tepai_id: number, tepai_id2: number, reach: number, tsumogiri: number): void {
    if (kind === S_SUTE_PAI) {
      if (this.state === "kyoku_end" || this.state === "game_end") return;
      if (this.hands[seat].length % 3 !== 2) return;
      this.call_ctx = null;
      this.pending_tsumo_choices = null;
      const tile = mahjong.pai_to_idx(pai);
      if (tile < 0) return;
      this._do_discard(seat, tile, !!reach, !!tsumogiri);
    } else if (kind === S_TSUMO_AGARI) {
      this.pending_tsumo_choices = null;
      const drawn = this.drawn[seat] as number | null;
      const res = this._win_result(seat, drawn, true);
      if (res === null) {
        this._offer_tsumo_choices(seat);
        return;
      }
      this._apply_tsumo(seat, drawn as number, res);
    } else if (kind === S_RON_AGARI) {
      const ctx = this.call_ctx;
      if (!ctx) return;
      this.call_ctx = null;
      const tile: number = ctx.tile;
      const res = this._win_result(seat, tile, false, !!ctx.chankan);
      if (res === null) {
        this._decline_call(ctx);
        return;
      }
      const m: Record<number, any> = {};
      m[seat] = res;
      this._apply_ron([seat], ctx.discarder, tile, m);
    } else if (kind === S_PON) {
      const ctx = this.call_ctx;
      if (!ctx) return;
      this.call_ctx = null;
      let own = [mahjong.pai_to_idx(tepai_id), mahjong.pai_to_idx(tepai_id2)];
      if (own.some((o) => o < 0)) own = [ctx.tile, ctx.tile];
      this._apply_pon(seat, ctx.discarder, ctx.tile, own);
    } else if (kind === S_CHI) {
      const ctx = this.call_ctx;
      if (!ctx) return;
      this.call_ctx = null;
      const own = [mahjong.pai_to_idx(tepai_id), mahjong.pai_to_idx(tepai_id2)];
      const opts = this._chi_options(seat, ctx.tile);
      const sortedOwn = [...own].sort((a, b) => a - b);
      const isValid = opts.some((o) => [...o].sort((a, b) => a - b).join(",") === sortedOwn.join(","));
      let finalOwn: number[];
      if (!isValid) {
        finalOwn = opts.length ? opts[0] : [];
      } else {
        finalOwn = own;
      }
      if (!finalOwn.length) {
        this._decline_call(ctx);
        return;
      }
      this._apply_chi(seat, ctx.discarder, ctx.tile, finalOwn);
    } else if (kind === S_MINKAN) {
      const ctx = this.call_ctx;
      if (!ctx) return;
      this.call_ctx = null;
      if (this._minkan_ok(seat, ctx.tile)) {
        this._apply_minkan(seat, ctx.discarder, ctx.tile);
      } else {
        this._decline_call(ctx);
      }
    } else if (kind === S_ANKAN) {
      this.pending_tsumo_choices = null;
      const tile = mahjong.pai_to_idx(pai);
      if (tile >= 0 && (mahjong.counts_of(this.hands[seat]) as number[])[tile] === 4) {
        this._apply_ankan(seat, tile);
      } else {
        this._offer_tsumo_choices(seat);
      }
    } else if (kind === S_KAKAN) {
      this.pending_tsumo_choices = null;
      const tile = mahjong.pai_to_idx(pai);
      if (this.melds[seat].some((m) => m.kind === (mahjong as any).PON && m.tiles[0] === tile)) {
        this._apply_kakan(seat, tile);
      } else {
        this._offer_tsumo_choices(seat);
      }
    } else if (kind === S_KYUSYUKYUHAI) {
      this.pending_tsumo_choices = null;
      this._ryuukyoku(true);
    } else if (kind === S_NAKINASHI) {
      const ctx = this.call_ctx;
      if (!ctx) return;
      this.call_ctx = null;
      this._decline_call(ctx);
    } else if (kind === S_CYOUKOU) {
      this._cell(K_TYOKO, `<pindex>${pindex}</pindex>`);
    } else if (kind === S_NEXT_KYOKU_READY) {
      this.next_kyoku();
    } else if (kind === S_KIKEN) {
      this.state = "game_end";
      this.finished = true;
    }
  }

  private _decline_call(ctx: any): void {
    const seat = this.human;
    if (ctx.ron) {
      this.temp_furiten[seat] = true;
      const c = mahjong.counts_of(this.hands[seat]) as number[];
      if (c.reduce((a, b) => a + b, 0) % 3 === 1 && (mahjong.waits_of(c as any, this.melds[seat].length, this.taku) as number[]).includes(ctx.tile)) {
        if (this.riichi[seat]) this.furiten[seat] = true;
      }
    }
    this.state = "discard";
    if (ctx.chankan) {
      this._resume_after_chankan(ctx.discarder);
    } else {
      this._cpu_calls(ctx.discarder, ctx.tile);
    }
  }

  // result for /end_game
  result_rows(): [number, number, number][] {
    const ranks = this._ranks();
    const uma_table: Record<number, number[]> = {
      4: [20000, 10000, -10000, -20000],
      3: [20000, 0, -20000],
      2: [10000, -10000],
    };
    const uma = uma_table[this.seats] ?? [0, 0, 0, 0];
    const rows: [number, number, number][] = [];
    for (let s = 0; s < this.seats; s++) {
      const r = ranks[s];
      rows.push([r, this.scores[s], r < uma.length ? uma[r] : 0]);
    }
    return rows;
  }
}

// also export helper functions for parity with Python module
export { _ints, _pais };

export default Table;
