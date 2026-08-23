import { profile } from "../models/profile";
import { rival, rival_sub } from "../models/rival";
import { custom } from "../models/custom";
import { score, old_score } from "../models/score";
import { lightning_custom } from "../models/lightning";
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as fs_top from 'fs';
import * as path_top from 'path';

export const updateRivalSettings = async (data) => {
  let rival_array = [], rival_sub_array = [];

  if (!(_.isEmpty(data.sp_rival1))) {
    let update_data = {
      play_style: 1,
      index: 0,
      rival_refid: data.sp_rival1,
    };

    rival_array.push(update_data);
  } else {
    await DB.Remove<rival>(data.refid,
      {
        collection: "rival",
        play_style: 1,
        index: 0,
      }
    )
  }

  if (!(_.isEmpty(data.sp_rival2))) {
    let update_data = {
      play_style: 1,
      index: 1,
      rival_refid: data.sp_rival2,
    };

    rival_array.push(update_data);
  } else {
    await DB.Remove<rival>(data.refid,
      {
        collection: "rival",
        play_style: 1,
        index: 1,
      }
    )
  }

  if (!(_.isEmpty(data.sp_rival3))) {
    let update_data = {
      play_style: 1,
      index: 2,
      rival_refid: data.sp_rival3,
    };

    rival_array.push(update_data);
  } else {
    await DB.Remove<rival>(data.refid,
      {
        collection: "rival",
        play_style: 1,
        index: 2,
      }
    )
  }

  if (!(_.isEmpty(data.sp_rival4))) {
    let update_data = {
      play_style: 1,
      index: 3,
      rival_refid: data.sp_rival4,
    };

    rival_array.push(update_data);
  } else {
    await DB.Remove<rival>(data.refid,
      {
        collection: "rival",
        play_style: 1,
        index: 3,
      }
    )
  }

  if (!(_.isEmpty(data.sp_rival5))) {
    let update_data = {
      play_style: 1,
      index: 4,
      rival_refid: data.sp_rival5,
    };

    rival_array.push(update_data);
  } else {
    await DB.Remove<rival>(data.refid,
      {
        collection: "rival",
        play_style: 1,
        index: 4,
      }
    )
  }

  if (!(_.isEmpty(data.dp_rival1))) {
    let update_data = {
      play_style: 2,
      index: 0,
      rival_refid: data.dp_rival1,
    };

    rival_array.push(update_data);
  } else {
    await DB.Remove<rival>(data.refid,
      {
        collection: "rival",
        play_style: 2,
        index: 0,
      }
    )
  }

  if (!(_.isEmpty(data.dp_rival2))) {
    let update_data = {
      play_style: 2,
      index: 1,
      rival_refid: data.dp_rival2,
    };

    rival_array.push(update_data);
  } else {
    await DB.Remove<rival>(data.refid,
      {
        collection: "rival",
        play_style: 2,
        index: 1,
      }
    )
  }

  if (!(_.isEmpty(data.dp_rival3))) {
    let update_data = {
      play_style: 2,
      index: 2,
      rival_refid: data.dp_rival3,
    };

    rival_array.push(update_data);
  } else {
    await DB.Remove<rival>(data.refid,
      {
        collection: "rival",
        play_style: 2,
        index: 2,
      }
    )
  }

  if (!(_.isEmpty(data.dp_rival4))) {
    let update_data = {
      play_style: 2,
      index: 3,
      rival_refid: data.dp_rival4,
    };

    rival_array.push(update_data);
  } else {
    await DB.Remove<rival>(data.refid,
      {
        collection: "rival",
        play_style: 2,
        index: 3,
      }
    )
  }

  if (!(_.isEmpty(data.dp_rival5))) {
    let update_data = {
      play_style: 2,
      index: 4,
      rival_refid: data.dp_rival5,
    };

    rival_array.push(update_data);
  } else {
    await DB.Remove<rival>(data.refid,
      {
        collection: "rival",
        play_style: 2,
        index: 4,
      }
    )
  }

  if (!(_.isEmpty(data.sp_rival1_sub))) {
    let update_data = {
      play_style: 1,
      index: 0,
      rival_refid: data.sp_rival1_sub,
    };

    rival_sub_array.push(update_data);
  } else {
    await DB.Remove<rival_sub>(data.refid,
      {
        collection: "rival_sub",
        play_style: 1,
        index: 0,
      }
    )
  }

  if (!(_.isEmpty(data.sp_rival2_sub))) {
    let update_data = {
      play_style: 1,
      index: 1,
      rival_refid: data.sp_rival2_sub,
    };

    rival_sub_array.push(update_data);
  } else {
    await DB.Remove<rival_sub>(data.refid,
      {
        collection: "rival_sub",
        play_style: 1,
        index: 1,
      }
    )
  }

  if (!(_.isEmpty(data.sp_rival3_sub))) {
    let update_data = {
      play_style: 1,
      index: 2,
      rival_refid: data.sp_rival3_sub,
    };

    rival_sub_array.push(update_data);
  } else {
    await DB.Remove<rival_sub>(data.refid,
      {
        collection: "rival_sub",
        play_style: 1,
        index: 2,
      }
    )
  }

  if (!(_.isEmpty(data.sp_rival4_sub))) {
    let update_data = {
      play_style: 1,
      index: 3,
      rival_refid: data.sp_rival4_sub,
    };

    rival_sub_array.push(update_data);
  } else {
    await DB.Remove<rival_sub>(data.refid,
      {
        collection: "rival_sub",
        play_style: 1,
        index: 3,
      }
    )
  }

  if (!(_.isEmpty(data.sp_rival5_sub))) {
    let update_data = {
      play_style: 1,
      index: 4,
      rival_refid: data.sp_rival5_sub,
    };

    rival_sub_array.push(update_data);
  } else {
    await DB.Remove<rival_sub>(data.refid,
      {
        collection: "rival_sub",
        play_style: 1,
        index: 4,
      }
    )
  }

  if (!(_.isEmpty(data.dp_rival1_sub))) {
    let update_data = {
      play_style: 2,
      index: 0,
      rival_refid: data.dp_rival1_sub,
    };

    rival_sub_array.push(update_data);
  } else {
    await DB.Remove<rival_sub>(data.refid,
      {
        collection: "rival_sub",
        play_style: 2,
        index: 0,
      }
    )
  }

  if (!(_.isEmpty(data.dp_rival2_sub))) {
    let update_data = {
      play_style: 2,
      index: 1,
      rival_refid: data.dp_rival2_sub,
    };

    rival_sub_array.push(update_data);
  } else {
    await DB.Remove<rival_sub>(data.refid,
      {
        collection: "rival_sub",
        play_style: 2,
        index: 1,
      }
    )
  }

  if (!(_.isEmpty(data.dp_rival3_sub))) {
    let update_data = {
      play_style: 2,
      index: 2,
      rival_refid: data.dp_rival3_sub,
    };

    rival_sub_array.push(update_data);
  } else {
    await DB.Remove<rival_sub>(data.refid,
      {
        collection: "rival_sub",
        play_style: 2,
        index: 2,
      }
    )
  }

  if (!(_.isEmpty(data.dp_rival4_sub))) {
    let update_data = {
      play_style: 2,
      index: 3,
      rival_refid: data.dp_rival4_sub,
    };

    rival_sub_array.push(update_data);
  } else {
    await DB.Remove<rival_sub>(data.refid,
      {
        collection: "rival_sub",
        play_style: 2,
        index: 3,
      }
    )
  }

  if (!(_.isEmpty(data.dp_rival5_sub))) {
    let update_data = {
      play_style: 2,
      index: 4,
      rival_refid: data.dp_rival5_sub,
    };

    rival_sub_array.push(update_data);
  } else {
    await DB.Remove<rival_sub>(data.refid,
      {
        collection: "rival_sub",
        play_style: 2,
        index: 4,
      }
    )
  }

  for (let i = 0; i < rival_array.length; i++) {
    await DB.Upsert<rival>(data.refid, {
      collection: "rival",
      play_style: rival_array[i].play_style,
      index: rival_array[i].index,
    }, {
      $set: {
        rival_refid: rival_array[i].rival_refid,
        }
      }
    )
  }

  for (let i = 0; i < rival_sub_array.length; i++) {
    await DB.Upsert<rival_sub>(data.refid, {
      collection: "rival_sub",
      play_style: rival_sub_array[i].play_style,
      index: rival_sub_array[i].index,
    }, {
      $set: {
        rival_refid: rival_sub_array[i].rival_refid,
        }
     }
    )
  }
};

export const updateCustomSettings = async (data) => {
  const profile = await DB.FindOne<profile>(data.refid, {
    collection: "profile",
  });

  let customize = {
    frame: Number(data.frame),
    turntable: Number(data.turntable),
    note_burst: Number(data.note_burst),
    menu_music: Number(data.menu_music),
    lane_cover: Number(data.lane_cover),
    lift_cover: Number(data.lift_cover),
    category_vox: Number(data.category_vox),
    note_skin: Number(data.note_skin),
    full_combo_splash: Number(data.full_combo_splash),
    disable_musicpreview: StoB(data.disable_musicpreview),

    note_beam: Number(data.note_beam),
    note_beam_size: Number(data.note_beam_size) || 0,
    judge_font: Number(data.judge_font),
    pacemaker_cover: Number(data.pacemaker_cover),
    vefx_lock: StoB(data.vefx_lock),
    effect: Number(data.effect),
    bomb_size: Number(data.bomb_size),
    disable_hcn_color: StoB(data.disable_hcn_color),
    first_note_preview: Number(data.first_note_preview),
    note_size: Number(data.note_size),
    cn_color: Number(data.cn_color),
    cn_size: Number(data.cn_size),

    rank_folder: StoB(data.rank_folder),
    clear_folder: StoB(data.clear_folder),
    diff_folder: StoB(data.diff_folder),
    alpha_folder: StoB(data.alpha_folder),
    rival_folder: StoB(data.rival_folder),
    rival_battle_folder: StoB(data.rival_battle_folder),
    rival_info: StoB(data.rival_info),
    hide_playcount: StoB(data.hide_playcount),
    disable_graph_cutin: StoB(data.disable_graph_cutin),
    classic_hispeed: StoB(data.classic_hispeed),
    rival_played_folder: StoB(data.rival_played_folder),
    hide_iidxid: StoB(data.hide_iidxid),
    disable_beginner_option: StoB(data.disable_beginner_option),

    qpro_head: Number(data.qpro_head),
    qpro_hair: Number(data.qpro_hair),
    qpro_face: Number(data.qpro_face),
    qpro_hand: Number(data.qpro_hand),
    qpro_body: Number(data.qpro_body),
    qpro_back: Number(data.qpro_back),
  }

  await DB.Upsert<custom>(data.refid, {
    collection: "custom",
    version: Number(data.version)
  },
  {
    $set: customize
  });

  if (!_.isEmpty(data.name) && data.name != profile.name) {
    // TODO:: check name is in valid format //
    await DB.Upsert<profile>(data.refid, {
      collection: "profile",
    }, {
      $set: {
        name: data.name
      }
    });
  }

  if (data.version > 27) {
    let saveData = {
      premium_skin: Number(data.lm_skin),
      premium_bg: Number(data.lm_bg),
    }

    if (data.version >= 33) {
      saveData = Object.assign(saveData, {
        premium_bg_concent: Number(data.lm_bg_2),
        entry_bg: Number(data.lm_entry_bg),
        entry_bg_brightness: Number(data.lm_entry_bg_bright),
      });
    }

    await DB.Upsert<lightning_custom>(data.refid, {
      collection: "lightning_custom",
      version: Number(data.version)
    },
    {
      $set: {
        ...saveData
      }
    });
  }
};

export const importScoreData = async (data, send: WebUISend) => {
  if (_.isEmpty(data.data)) {
    console.error("[Score Importer] Supplied data is empty");
    return send.error(400, "Empty data");
  }

  let content = null;
  let version = 0;
  let count = 0;
  try {
    content = JSON.parse(data.data);
    version = content.version;
    count = content.count;
  }
  catch {
    console.error("[Score Importer] Invaild data has been supplied");
    return send.error(400, "Invalid data");
  }

  // Track SP/DP play counts for newly inserted records.
  let spAdded = 0, dpAdded = 0;

  switch (version) {
    case 1:
      let sd_ver1: old_score[] = content.data;
      for (let a = 0; a < count; a++) {
        let result = {
          pgArray: Array<number>(10).fill(0),
          gArray: Array<number>(10).fill(0),
          mArray: Array<number>(10).fill(-1),
          cArray: Array<number>(10).fill(0),
          rArray: Array<number>(10).fill(-1),
          esArray: Array<number>(10).fill(0),

          optArray: Array<number>(10).fill(0),
          opt2Array: Array<number>(10).fill(0),
        }

        if (!_.isNil(sd_ver1[a].spmArray)) {
          for (let b = 0; b < 5; b++) {
            result.cArray[b] = sd_ver1[a].spmArray[2 + b];
            result.esArray[b] = sd_ver1[a].spmArray[7 + b];
            if (sd_ver1[a].spmArray[12 + b] != -1) result.mArray[b] = sd_ver1[a].spmArray[12 + b];
          }
        }

        if (!_.isNil(sd_ver1[a].dpmArray)) {
          for (let b = 5; b < 10; b++) {
            result.cArray[b] = sd_ver1[a].dpmArray[2 + (b - 5)];
            result.esArray[b] = sd_ver1[a].dpmArray[7 + (b - 5)];
            if (sd_ver1[a].dpmArray[12 + (b - 5)] != -1) result.mArray[b] = sd_ver1[a].dpmArray[12 + (b - 5)];
          }
        }

        if (!_.isNil(sd_ver1[a].optArray)) {
          result.optArray = sd_ver1[a].optArray;
        }

        if (!_.isNil(sd_ver1[a].opt2Array)) {
          result.opt2Array = sd_ver1[a].opt2Array;
        }

        for (let b = 0; b < 10; b++) {
          if (_.isNil(sd_ver1[a][b])) continue;
          result[b] = sd_ver1[a][b];

          if (!_.isNil(sd_ver1[a][b + 10])) {
            result[b + 10] = sd_ver1[a][b + 10];
          }
        }

        // Count play types for newly inserted records.
        const existing1 = await DB.FindOne<score>(data.refid, { collection: 'score', mid: sd_ver1[a].music_id });
        if (!existing1) {
          if (result.esArray.slice(0, 5).some(v => v > 0)) spAdded++;
          if (result.esArray.slice(5, 10).some(v => v > 0)) dpAdded++;
        }

        await DB.Upsert<score>(data.refid,
          {
            collection: "score",
            mid: sd_ver1[a].music_id
          },
          {
            $set: {
              ...result
            }
          }
        );
      }
      break;
    case 2:
      let sd_ver2: score[] = content.data;
      for (let a = 0; a < count; a++) {
        let result = {
          pgArray: sd_ver2[a].pgArray,
          gArray: sd_ver2[a].gArray,
          mArray: sd_ver2[a].mArray,
          cArray: sd_ver2[a].cArray,
          rArray: sd_ver2[a].rArray,
          esArray: sd_ver2[a].esArray,

          optArray: sd_ver2[a].optArray,
          opt2Array: sd_ver2[a].opt2Array,
        };

        for (let b = 0; b < 10; b++) {
          if (_.isNil(sd_ver2[a][b])) continue;
          result[b] = sd_ver2[a][b];

          if (!_.isNil(sd_ver2[a][b + 10])) {
            result[b + 10] = sd_ver2[a][b + 10];
          }
        }

        // Count play types for newly inserted records.
        const existing2 = await DB.FindOne<score>(data.refid, { collection: 'score', mid: sd_ver2[a].mid });
        if (!existing2) {
          const esArr = sd_ver2[a].esArray || Array(10).fill(0);
          if (esArr.slice(0, 5).some(v => v > 0)) spAdded++;
          if (esArr.slice(5, 10).some(v => v > 0)) dpAdded++;
        }

        await DB.Upsert<score>(data.refid,
          {
            collection: "score",
            mid: sd_ver2[a].mid
          },
          {
            $set: {
              ...result,
            }
          }
        );
      }
      break;

    default:
      console.error("[Score Importer] Unregistered score data version");
      return send.error(400, "Invalid data version");
  }

  // Update the profile's play counters for newly inserted songs.
  if (spAdded + dpAdded > 0) {
    const prof = await DB.FindOne<profile>(data.refid, { collection: 'profile' });
    if (prof) {
      await DB.Upsert<profile>(data.refid, { collection: 'profile' }, {
        $set: {
          total_pc:  (prof.total_pc  || 0) + spAdded + dpAdded,
          total_kbd: (prof.total_kbd || 0) + spAdded,
          total_scr: (prof.total_scr || 0) + dpAdded,
        },
      });
    }
  }
}

export const exportScoreData = async (data, send: WebUISend) => {
  const score = await DB.Find<score>(data.refid, {
    collection: "score"
  });

  if (score == null) return send.error(400, "No data");

  let result = {
    version: 2,
    count: score.length,
    data: {
      ...score,
    }
  }

  send.json(result);
}

// ─── Native IFS texture extractor (no external tools required) ───────────────
// Ported from popn@asphyxia/handler/ifs_texture.ts
// Reads only the manifest header first to instantly skip non-texture .ifs files.

type KNode = { name: string; type: number; attrs: Record<string, string>; values: Array<number | string>; children: KNode[]; parent?: KNode; };
type KFormat = { size: number; count: number; signed?: boolean; float?: boolean };
const SIX_BIT = '0123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
const K_FORMATS: Record<number, KFormat> = {
  1:{size:0,count:0},2:{size:1,count:1,signed:true},3:{size:1,count:1},4:{size:2,count:1,signed:true},5:{size:2,count:1},
  6:{size:4,count:1,signed:true},7:{size:4,count:1},8:{size:8,count:1,signed:true},9:{size:8,count:1},
  10:{size:1,count:-1},11:{size:1,count:-1},12:{size:4,count:1},13:{size:4,count:1},14:{size:4,count:1,float:true},
  15:{size:8,count:1,float:true},16:{size:1,count:2,signed:true},17:{size:1,count:2},18:{size:2,count:2,signed:true},
  19:{size:2,count:2},20:{size:4,count:2,signed:true},21:{size:4,count:2},22:{size:8,count:2,signed:true},23:{size:8,count:2},
  24:{size:4,count:2,float:true},25:{size:8,count:2,float:true},26:{size:1,count:3,signed:true},27:{size:1,count:3},
  28:{size:2,count:3,signed:true},29:{size:2,count:3},30:{size:4,count:3,signed:true},31:{size:4,count:3},
  32:{size:8,count:3,signed:true},33:{size:8,count:3},34:{size:4,count:3,float:true},35:{size:8,count:3,float:true},
  36:{size:1,count:4,signed:true},37:{size:1,count:4},38:{size:2,count:4,signed:true},39:{size:2,count:4},
  40:{size:4,count:4,signed:true},41:{size:4,count:4},42:{size:8,count:4,signed:true},43:{size:8,count:4},
  44:{size:4,count:4,float:true},45:{size:8,count:4,float:true},48:{size:1,count:16,signed:true},49:{size:1,count:16},
  50:{size:2,count:8,signed:true},51:{size:2,count:8},52:{size:1,count:1,signed:true},53:{size:1,count:2,signed:true},
  54:{size:1,count:3,signed:true},55:{size:1,count:4,signed:true},56:{size:1,count:16,signed:true},
};
const align4 = (v: number) => (v + 3) & ~3;

function readKBin(input: Buffer): KNode {
  if (input.length < 12 || input[0] !== 0xa0 || (input[1] !== 0x42 && input[1] !== 0x45)) throw new Error('Invalid binary XML');
  const compressed = input[1] === 0x42;
  let nodeOffset = 8;
  const nodeEnd = input.readUInt32BE(4) + 8;
  let dataOffset = nodeEnd + 4, byteOffset = nodeEnd, wordOffset = nodeEnd;
  const root: KNode = { name: '$root', type: 1, attrs: {}, values: [], children: [] };
  let current = root;
  const readName = (): string => {
    if (!compressed) { const l = (input[nodeOffset++] & ~64) + 1; const v = input.toString('latin1', nodeOffset, nodeOffset + l); nodeOffset += l; return v; }
    const length = input[nodeOffset++];
    const byteLength = Math.ceil(length * 6 / 8);
    let bits = BigInt(0);
    for (let i = 0; i < byteLength; i++) bits = (bits << BigInt(8)) | BigInt(input[nodeOffset++]);
    const padding = (8 - (length * 6 % 8)) % 8;
    bits >>= BigInt(padding);
    const chars = new Array<string>(length);
    for (let i = length - 1; i >= 0; i--) { chars[i] = SIX_BIT[Number(bits & BigInt(63))]; bits >>= BigInt(6); }
    return chars.join('');
  };
  const readNumber = (offset: number, fmt: KFormat): number => {
    if (fmt.float) return fmt.size === 4 ? input.readFloatBE(offset) : input.readDoubleBE(offset);
    if (fmt.size === 1) return fmt.signed ? input.readInt8(offset) : input.readUInt8(offset);
    if (fmt.size === 2) return fmt.signed ? input.readInt16BE(offset) : input.readUInt16BE(offset);
    if (fmt.size === 4) return fmt.signed ? input.readInt32BE(offset) : input.readUInt32BE(offset);
    return Number(fmt.signed ? input.readBigInt64BE(offset) : input.readBigUInt64BE(offset));
  };
  const readValues = (fmt: KFormat, count: number, array: boolean): number[] => {
    const result: number[] = [];
    let offset: number;
    if (array || fmt.size * count > 2) {
      offset = dataOffset;
      for (let i = 0; i < count; i++) result.push(readNumber(offset + i * fmt.size, fmt));
      dataOffset = align4(offset + count * fmt.size);
      return result;
    }
    if (fmt.size === 1) { if (byteOffset % 4 === 0) byteOffset = dataOffset; offset = byteOffset; byteOffset += count; }
    else { if (wordOffset % 4 === 0) wordOffset = dataOffset; offset = wordOffset; wordOffset += fmt.size * count; }
    for (let i = 0; i < count; i++) result.push(readNumber(offset + i * fmt.size, fmt));
    const trailing = Math.max(byteOffset, wordOffset);
    if (dataOffset < trailing) dataOffset = align4(trailing);
    return result;
  };
  const readString = (): string => { const size = input.readInt32BE(dataOffset); const start = dataOffset + 4; dataOffset = align4(start + size); return input.toString('utf8', start, start + Math.max(0, size - 1)).replace(/\0+$/, ''); };
  while (nodeOffset < nodeEnd) {
    while (nodeOffset < nodeEnd && input[nodeOffset] === 0) nodeOffset++;
    if (nodeOffset >= nodeEnd) break;
    const rawType = input[nodeOffset++];
    const array = (rawType & 64) !== 0;
    const type = rawType & ~64;
    if (type === 190) { if (current.parent) current = current.parent; continue; }
    if (type === 191) break;
    const name = readName();
    if (type === 46) { current.attrs[name] = readString(); continue; }
    const fmt = K_FORMATS[type];
    if (!fmt) throw new Error(`Unsupported binary XML node type ${type}`);
    const node: KNode = { name, type, attrs: {}, values: [], children: [], parent: current };
    current.children.push(node); current = node;
    if (type === 1) continue;
    let count = fmt.count; let isArray = array;
    if (count === -1) { count = input.readUInt32BE(dataOffset); dataOffset += 4; isArray = true; }
    else if (array) { count *= input.readUInt32BE(dataOffset) / (fmt.size * fmt.count); dataOffset += 4; }
    node.values = readValues(fmt, count, isArray);
  }
  if (root.children.length !== 1) throw new Error('Binary XML has no root node');
  return root.children[0];
}

const fixedName = (n: string) => { let r = n.replace(/_E/g, '.').replace(/__/g, '_'); if (/^_\d/.test(r)) r = r.slice(1); return r; };
const findChild = (node: KNode, name: string) => node.children.find(c => fixedName(c.name) === name);
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (data: Buffer) => { let c = 0xffffffff; for (const b of data) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const pngChunk = (name: string, data: Buffer) => { const type = Buffer.from(name, 'ascii'); const h = Buffer.alloc(8); h.writeUInt32BE(data.length, 0); type.copy(h, 4); const cs = Buffer.alloc(4); cs.writeUInt32BE(crc32(Buffer.concat([type, data])), 0); return Buffer.concat([h, data, cs]); };
const encodePng = (w: number, h: number, rgba: Buffer) => { const s = Buffer.alloc(h * (w * 4 + 1)); for (let y = 0; y < h; y++) rgba.copy(s, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(s)), pngChunk('IEND', Buffer.alloc(0))]); };
const decompressAvslz = (input: Buffer) => { const out: number[] = []; let off = 0; while (off < input.length) { const flag = input[off++]; for (let bit = 0; bit < 8; bit++) { if ((flag >> bit) & 1) { if (off >= input.length) throw new Error('Truncated AVSLZ literal'); out.push(input[off++]); continue; } if (off + 1 >= input.length) throw new Error('Truncated AVSLZ reference'); const word = input.readUInt16BE(off); off += 2; const pos = word >> 4; let len = (word & 15) + 3; if (pos === 0) return Buffer.from(out); if (pos > out.length) { const z = Math.min(pos - out.length, len); for (let i = 0; i < z; i++) out.push(0); len -= z; } for (let i = 0; i < len; i++) out.push(out[out.length - pos]); } } throw new Error('AVSLZ stream has no terminator'); };
const color565 = (v: number): [number,number,number] => [Math.round(((v>>11)&31)*255/31), Math.round(((v>>5)&63)*255/63), Math.round((v&31)*255/31)];
const decodeDxtColors = (data: Buffer, offset: number, forceFour: boolean): Array<[number,number,number,number]> => { const f = data.readUInt16LE(offset), s = data.readUInt16LE(offset+2); const a = color565(f), b = color565(s); const colors: Array<[number,number,number,number]> = [[...a,255],[...b,255]]; if (f > s || forceFour) colors.push([Math.round((2*a[0]+b[0])/3),Math.round((2*a[1]+b[1])/3),Math.round((2*a[2]+b[2])/3),255],[Math.round((a[0]+2*b[0])/3),Math.round((a[1]+2*b[1])/3),Math.round((a[2]+2*b[2])/3),255]); else colors.push([Math.round((a[0]+b[0])/2),Math.round((a[1]+b[1])/2),Math.round((a[2]+b[2])/2),255],[0,0,0,0]); return colors; };
const decodeDxt = (raw: Buffer, w: number, h: number, dxt5: boolean) => { const data = Buffer.from(raw); for (let i = 0; i+1 < data.length; i+=2) { const b = data[i]; data[i] = data[i+1]; data[i+1] = b; } const rgba = Buffer.alloc(w*h*4); const bs = dxt5?16:8; let off = 0; for (let by = 0; by < h; by+=4) for (let bx = 0; bx < w; bx+=4) { if (off+bs > data.length) return rgba; let alpha: number[] = new Array(16).fill(255); let co = off; if (dxt5) { const a0=data[off],a1=data[off+1]; const pal=[a0,a1]; if(a0>a1) for(let i=1;i<=6;i++) pal.push(Math.round(((7-i)*a0+i*a1)/7)); else {for(let i=1;i<=4;i++) pal.push(Math.round(((5-i)*a0+i*a1)/5)); pal.push(0,255);} let bits=BigInt(0); for(let i=0;i<6;i++) bits|=BigInt(data[off+2+i])<<BigInt(i*8); alpha=alpha.map((_,i)=>pal[Number((bits>>BigInt(i*3))&BigInt(7))]); co+=8; } const colors=decodeDxtColors(data,co,dxt5); const idx=data.readUInt32LE(co+4); for(let py=0;py<4;py++) for(let px=0;px<4;px++){const x=bx+px,y=by+py; if(x>=w||y>=h) continue; const pixel=py*4+px,color=colors[(idx>>>(pixel*2))&3],t=(y*w+x)*4; rgba[t]=color[0];rgba[t+1]=color[1];rgba[t+2]=color[2];rgba[t+3]=dxt5?alpha[pixel]:color[3];} off+=bs; } return rgba; };
const decodePixels = (format: string, data: Buffer, w: number, h: number): Buffer => { const pixels = w*h; if (format==='argb8888rev') { const rgba=Buffer.alloc(pixels*4); for(let i=0;i<pixels;i++){const s=i*4; rgba[s]=data[s+2]||0;rgba[s+1]=data[s+1]||0;rgba[s+2]=data[s]||0;rgba[s+3]=data[s+3]||0;} return rgba; } if (format==='argb4444') { const rgba=Buffer.alloc(pixels*4); for(let i=0;i<pixels;i++){const word=i*2+1<data.length?data.readUInt16BE(i*2):0,t=i*4; rgba[t]=(word&15)*17;rgba[t+1]=((word>>8)&15)*17;rgba[t+2]=((word>>12)&15)*17;rgba[t+3]=((word>>4)&15)*17;} return rgba; } if (format==='dxt1') return decodeDxt(data,w,h,false); if (format==='dxt5') return decodeDxt(data,w,h,true); throw new Error(`Unsupported IFS texture format ${format}`); };

/**
 * Extract textures from a single IFS file natively (no ifstools.exe needed).
 * Phase 1: reads just the header+manifest (~a few KB) to check for a tex node.
 * Phase 2: only if tex node found, reads and decodes the full file.
 * Returns array of written PNG paths.
 */
function extractIfsTextures(source: string, outputRoot: string): string[] {
  const fd = fs_top.openSync(source, 'r');
  const header = Buffer.alloc(36);
  const headerRead = fs_top.readSync(fd, header, 0, 36, 0);
  if (headerRead < 36 || header.readUInt32BE(0) !== 0x6cad8f89) { fs_top.closeSync(fd); throw new Error('Unsupported or invalid IFS file'); }
  const manifestEnd = header.readUInt32BE(16);
  if (manifestEnd <= 36) { fs_top.closeSync(fd); throw new Error('Invalid IFS manifest size'); }
  const manifestBuf = Buffer.alloc(manifestEnd - 36);
  fs_top.readSync(fd, manifestBuf, 0, manifestBuf.length, 36);
  fs_top.closeSync(fd);
  const manifest = readKBin(manifestBuf);
  const tex = findChild(manifest, 'tex');
  // No tex node → nested-IFS container or animation-only archive; skip without loading data
  if (!tex) return [];

  const input = fs_top.readFileSync(source);
  if (manifestEnd > input.length) throw new Error('Invalid IFS manifest size');
  const files = new Map<string, { offset: number; size: number }>();
  for (const entry of tex.children) if (entry.values.length >= 2) files.set(fixedName(entry.name), { offset: Number(entry.values[0]), size: Number(entry.values[1]) });
  const textureListEntry = [...files.entries()].find(([name]) => name.endsWith('.xml'));
  if (!textureListEntry) throw new Error('IFS texture list was not found');
  const textureListData = input.subarray(manifestEnd + textureListEntry[1].offset, manifestEnd + textureListEntry[1].offset + textureListEntry[1].size);
  const textureList = readKBin(textureListData);
  const compress = textureList.attrs.compress || '';
  const outputDirectory = path_top.join(outputRoot, `${path_top.basename(source, path_top.extname(source))}_ifs`);
  fs_top.mkdirSync(outputDirectory, { recursive: true });
  const outputs: string[] = [];
  for (const texture of textureList.children) {
    const format = texture.attrs.format;
    for (const image of texture.children.filter((n: KNode) => n.name === 'image')) {
      const imageName = image.attrs.name;
      const manifestName = crypto.createHash('md5').update(Buffer.from(imageName, 'utf8')).digest('hex');
      const entry = files.get(manifestName) || files.get(`_${manifestName}`);
      const imgrect = findChild(image, 'imgrect')?.values.map(Number);
      if (!entry || !imageName || !imgrect || imgrect.length < 4) continue;
      let data = input.subarray(manifestEnd + entry.offset, manifestEnd + entry.offset + entry.size);
      if (compress === 'avslz') {
        if (data.length < 8) throw new Error(`Invalid AVSLZ texture ${imageName}`);
        const uncompressed = data.readUInt32BE(0), compressed = data.readUInt32BE(4);
        if (data.length === compressed + 8) { data = decompressAvslz(data.subarray(8)); if (data.length !== uncompressed) throw new Error(`AVSLZ size mismatch for ${imageName}`); }
        else data = Buffer.concat([data.subarray(8), data.subarray(0, 8)]);
      }
      const w = Math.floor((imgrect[1] - imgrect[0]) / 2), h = Math.floor((imgrect[3] - imgrect[2]) / 2);
      if (w <= 0 || h <= 0) continue;
      const output = path_top.join(outputDirectory, `${imageName}.png`);
      fs_top.writeFileSync(output, encodePng(w, h, decodePixels(format, data, w, h)));
      outputs.push(output);
    }
  }
  return outputs;
}
// ─────────────────────────────────────────────────────────────────────────────

export const extractQproAssets = async (data: {}, send: WebUISend) => {
  const qproSrcDir  = U.GetConfig('iidx_qpro_src_dir') as string;
  const assetOutDir = path_top.resolve(__dirname, '../webui/asset/qpro');
  const MAX_WORKERS = 8; // No subprocess overhead → can use more workers safely

  const logs: string[]   = [];
  const errors: string[] = [];
  let done = 0, skipped = 0, failed = 0;

  const log = (msg: string) => { console.log(msg); logs.push(msg); };
  const err = (msg: string) => { console.error(msg); errors.push(msg); };

  function category(name: string): string | null {
    if (name.includes('_head')) return 'head';
    if (name.includes('_hair')) return 'hair';
    if (name.includes('_face')) return 'face';
    if (name.includes('_hand')) return 'hand';
    if (name.includes('_body')) return 'body';
    if (name.includes('_bg'))   return 'bg';
    return null;
  }

  if (!qproSrcDir || !fs_top.existsSync(qproSrcDir)) {
    err('Q-Pro source directory not found. Set "iidx_qpro_src_dir" in plugin settings.');
    return send.json({ status: 'error', logs, errors, done, skipped, failed, total: 0 });
  }

  // Pre-filter: only process filenames that look like qpro parts.
  // This instantly skips thousands of unrelated .ifs files without even opening them.
  const allIfs: string[] = fs_top.readdirSync(qproSrcDir).filter((f: string) => f.endsWith('.ifs'));
  const qproIfs: string[] = allIfs.filter((f: string) => category(f) !== null);
  const total = qproIfs.length;
  log(`Found ${allIfs.length} total IFS files, ${total} match qpro naming pattern. Extracting with ${MAX_WORKERS} workers...`);

  // Prepare output category dirs
  for (const cat of ['head', 'hair', 'face', 'hand', 'body', 'bg']) {
    fs_top.mkdirSync(path_top.join(assetOutDir, cat), { recursive: true });
  }

  async function extractOne(ifsName: string): Promise<void> {
    const cat      = category(ifsName)!;
    const baseName = ifsName.replace('.ifs', '');
    const targetDir = path_top.join(assetOutDir, cat, baseName);

    // Skip if already extracted
    if (fs_top.existsSync(targetDir) && fs_top.readdirSync(targetDir).some((f: string) => f.endsWith('.png'))) {
      skipped++;
      return;
    }

    const ifsPath = path_top.join(qproSrcDir, ifsName);
    try {
      // extractIfsTextures writes to a temp subdir of assetOutDir, then we move PNGs
      const pngs = extractIfsTextures(ifsPath, assetOutDir);
      if (pngs.length === 0) {
        // No tex node found in this file — shouldn't happen for named qpro files but handle gracefully
        skipped++;
        return;
      }
      // Move from the _ifs subfolder into the flat category/name folder
      const tmpDir = path_top.join(assetOutDir, `${baseName}_ifs`);
      fs_top.mkdirSync(targetDir, { recursive: true });
      for (const png of pngs) {
        const dest = path_top.join(targetDir, path_top.basename(png));
        fs_top.renameSync(png, dest);
      }
      try { fs_top.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      done++;
      if ((done + skipped + failed) % 50 === 0) {
        log(`Progress: ${done + skipped + failed}/${total} (${done} new, ${skipped} skipped, ${failed} failed)`);
      }
    } catch (e: any) {
      err(`FAIL ${ifsName}: ${e.message}`);
      failed++;
    }
  }

  // Parallel pool — no subprocess overhead so 8 workers is safe
  async function runPool(files: string[]) {
    let idx = 0;
    const next = async () => { while (idx < files.length) { const f = files[idx++]; await extractOne(f); } };
    await Promise.all(Array.from({ length: MAX_WORKERS }, next));
  }

  try {
    await runPool(qproIfs);
    log(`Extraction complete: ${done} new, ${skipped} already existed, ${failed} failed.`);
    send.json({ status: 'ok', logs, errors, done, skipped, failed, total });
  } catch (e: any) {
    err(String(e));
    send.json({ status: 'error', logs, errors, done, skipped, failed, total });
  }
};

function StoB(value: string) {
  return value == "on" ? true : false;
};

