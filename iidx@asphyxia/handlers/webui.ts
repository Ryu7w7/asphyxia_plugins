import { profile } from "../models/profile";
import { rival, rival_sub } from "../models/rival";
import { custom } from "../models/custom";
import { score, old_score } from "../models/score";
import { lightning_custom } from "../models/lightning";

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
    category_vox: Number(data.category_vox),
    note_skin: Number(data.note_skin),
    full_combo_splash: Number(data.full_combo_splash),
    disable_musicpreview: StoB(data.disable_musicpreview),

    note_beam: Number(data.note_beam),
    judge_font: Number(data.judge_font),
    pacemaker_cover: Number(data.pacemaker_cover),
    vefx_lock: StoB(data.vefx_lock),
    effect: Number(data.effect),
    bomb_size: Number(data.bomb_size),
    disable_hcn_color: StoB(data.disable_hcn_color),
    first_note_preview: Number(data.first_note_preview),
    note_size: Number(data.note_size),
    lift_cover: Number(data.lift_cover),
    note_beam_size: Number(data.note_beam_size),
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

export const extractQproAssets = async (data: {}, send: WebUISend) => {
  // Asphyxia's `child_process` is available via the Node snapshot
  const { execFile } = require('child_process');
  const path = require('path');
  const fs = require('fs');

  const iifstoolsBin  = U.GetConfig('iidx_ifstools_path') as string;
  const qproSrcDir    = U.GetConfig('iidx_qpro_src_dir') as string;
  const assetOutDir   = path.resolve('plugins/iidx@asphyxia/webui/asset/qpro');
  const tempBase      = path.resolve('plugins/iidx@asphyxia/webui/asset/qpro_temp');
  const MAX_WORKERS   = 4;

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

  // Validate config
  if (!iifstoolsBin || !fs.existsSync(iifstoolsBin)) {
    err('ifstools not found. Set "iidx_ifstools_path" in plugin settings.');
    return send.json({ status: 'error', logs, errors, done, skipped, failed, total: 0 });
  }
  if (!qproSrcDir || !fs.existsSync(qproSrcDir)) {
    err('Q-Pro source directory not found. Set "iidx_qpro_src_dir" in plugin settings.');
    return send.json({ status: 'error', logs, errors, done, skipped, failed, total: 0 });
  }

  // Prepare output dirs
  for (const cat of ['head', 'hair', 'face', 'hand', 'body', 'bg']) {
    fs.mkdirSync(path.join(assetOutDir, cat), { recursive: true });
  }
  fs.mkdirSync(tempBase, { recursive: true });

  const ifsFiles: string[] = fs.readdirSync(qproSrcDir).filter((f: string) => f.endsWith('.ifs'));
  const total = ifsFiles.length;
  log(`Found ${total} IFS files. Extracting with ${MAX_WORKERS} workers...`);

  // Worker: extract one IFS file, returns a promise
  function extractOne(ifsName: string, workerId: number): Promise<void> {
    return new Promise((resolve) => {
      const cat = category(ifsName);
      if (!cat) { skipped++; resolve(); return; }

      const baseName   = ifsName.replace('.ifs', '');
      const targetDir  = path.join(assetOutDir, cat, baseName);

      // Skip if already extracted
      if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).some((f: string) => f.endsWith('.png'))) {
        skipped++;
        resolve();
        return;
      }

      const ifsPath   = path.join(qproSrcDir, ifsName);
      const workerTmp = path.join(tempBase, `w${workerId}`);
      fs.mkdirSync(workerTmp, { recursive: true });

      execFile(iifstoolsBin, [ifsPath, '-o', workerTmp, '-y'],
        { timeout: 30000 },
        (error: any) => {
          if (error) {
            err(`FAIL ${ifsName}: ${error.message}`);
            failed++;
            resolve();
            return;
          }

          const texDir = path.join(workerTmp, `${baseName}_ifs`, 'tex');
          if (!fs.existsSync(texDir)) {
            err(`FAIL ${ifsName}: tex dir not found`);
            failed++;
            resolve();
            return;
          }

          fs.mkdirSync(targetDir, { recursive: true });
          const pngs: string[] = fs.readdirSync(texDir).filter((f: string) => f.endsWith('.png'));
          for (const png of pngs) {
            fs.copyFileSync(path.join(texDir, png), path.join(targetDir, png));
          }

          // Clean up worker temp for this file to free disk space
          try { fs.rmSync(path.join(workerTmp, `${baseName}_ifs`), { recursive: true, force: true }); } catch {}

          done++;
          if ((done + skipped + failed) % 100 === 0) {
            log(`Progress: ${done + skipped + failed}/${total} (${done} new, ${skipped} skipped, ${failed} failed)`);
          }
          resolve();
        }
      );
    });
  }

  // Run in parallel pools of MAX_WORKERS
  async function runPool(files: string[]) {
    let idx = 0;
    const next = async (workerId: number) => {
      while (idx < files.length) {
        const file = files[idx++];
        await extractOne(file, workerId);
      }
    };
    const workers = Array.from({ length: MAX_WORKERS }, (_, i) => next(i));
    await Promise.all(workers);
  }

  try {
    await runPool(ifsFiles);
    try { fs.rmSync(tempBase, { recursive: true, force: true }); } catch {}
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
