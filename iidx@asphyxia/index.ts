import { pccommon, pcreg, pcget, pcgetname, pctakeover, pcvisit, pcsave, pcoldget, pcgetlanegacha, pcdrawlanegacha, pcshopregister, pcmethod } from "./handlers/pc";
import { shopgetname, shopsavename, shopgetconvention, shopsetconvention, shopmethod } from "./handlers/shop";
import { musicreg, musicgetrank, musicappoint, musicarenacpu, musiccrate, musicbreg, musicgetralive, musicgetranksub, musicmethod } from "./handlers/music";
import { grademethod, graderaised } from "./handlers/grade";
import { gssysteminfo } from "./handlers/gamesystem";
import { updateRivalSettings, updateCustomSettings, importScoreData, exportScoreData, extractQproAssets } from "./handlers/webui";
import { GetVersion } from "./util";
import { rankingentry, rankinggetranker, rankingmethod, rankingoentry } from "./handlers/ranking";

import { streamingcommon, streaminggetcm } from "./handlers/streaming";
import { lobbyentry, lobbyupdate, lobbydelete, bplbattle_entry, bplbattle_update, bplbattle_delete } from "./handlers/lobby";

export function register() {
  if (CORE_VERSION_MAJOR <= 1 && CORE_VERSION_MINOR < 31) {
    console.error("The current version of Asphyxia Core is not supported. Requires version '1.31' or later.");
    return;
  }

  R.Contributor("duel0213");
  R.Contributor("anzuwork");
  R.Contributor("COLV9");

  const gameCodes = ["D01", "E11", "ECO", "FDD", "GLD", "HDD", "I00", "JDJ", "JDZ", "KDZ", "LDJ"];
  gameCodes.forEach((res) => {
    R.GameCode(res);
  });

  const oldVersion = ["D01", "E11", "ECO"];
  oldVersion.forEach((res) => {
    R.Route(`${res}.music`, musicmethod);
    R.Route(`${res}.pc`, pcmethod);
    R.Route(`${res}.ranking`, rankingmethod);
    R.Route(`${res}.grade`, grademethod);
    R.Route(`${res}.shop`, shopmethod);
  });

  const MultiRoute = (method: string, handler: EPR | boolean) => {
    R.Route(`${method}`, handler);
    R.Route(`IIDX21${method}`, handler);
    R.Route(`IIDX22${method}`, handler);
    R.Route(`IIDX23${method}`, handler);
    R.Route(`IIDX24${method}`, handler);
    R.Route(`IIDX25${method}`, handler);
    R.Route(`IIDX26${method}`, handler);
    R.Route(`IIDX27${method}`, handler);
    R.Route(`IIDX28${method}`, handler);
    R.Route(`IIDX29${method}`, handler);
    R.Route(`IIDX30${method}`, handler);
    R.Route(`IIDX31${method}`, handler);
    R.Route(`IIDX32${method}`, handler);
    R.Route(`IIDX33${method}`, handler);
  };

  MultiRoute("pc.common", pccommon);
  MultiRoute("pc.reg", pcreg);
  MultiRoute("pc.get", pcget);
  MultiRoute("pc.getname", pcgetname);
  MultiRoute("pc.oldget", pcoldget);
  MultiRoute("pc.takeover", pctakeover);
  MultiRoute("pc.visit", pcvisit);
  MultiRoute("pc.save", pcsave);
  MultiRoute("pc.shopregister", pcshopregister);
  MultiRoute("pc.getLaneGachaTicket", pcgetlanegacha);
  MultiRoute("pc.drawLaneGacha", pcdrawlanegacha);
  MultiRoute("pc.consumeLaneGachaTicket", true);
  
  // Dummy handlers for missing PC endpoints
  const pcDummys = ["playstart", "playend", "locaend", "lcommon", "eaappliresult", "eaappliexpert", "ifinish", "logout", "qrreward", "qrcompe", "qrfollow", "getCompeInfo", "compeOrganize", "compeEntry", "compeSearch", "save2pp", "mygoalcancel", "mygoalclear", "mygoalset", "setBestresult"];
  pcDummys.forEach(ep => MultiRoute(`pc.${ep}`, true));

  MultiRoute("shop.getname", shopgetname);
  MultiRoute("shop.savename", shopsavename);
  MultiRoute("shop.getconvention", shopgetconvention);
  MultiRoute("shop.setconvention", shopsetconvention);
  
  // Dummy handlers for missing SHOP endpoints
  const shopDummys = ["sentinfo", "keepalive", "sendpcbdetail", "gettaxconfig", "getclosingtime", "saveclosingtime", "sendescapepackageinfo", "recoveryfilelog"];
  shopDummys.forEach(ep => MultiRoute(`shop.${ep}`, true));

  MultiRoute("music.crate", musiccrate);
  MultiRoute("music.getrank", musicgetrank);
  MultiRoute("music.getranksub", musicgetranksub);
  MultiRoute("music.getralive", musicgetralive);
  MultiRoute("music.appoint", musicappoint);
  MultiRoute("music.reg", musicreg);
  MultiRoute("music.breg", musicbreg);
  MultiRoute("music.arenaCPU", musicarenacpu);
  
  // Dummy handlers for missing MUSIC endpoints
  const musicDummys = ["play", "lplay", "nosave", "beginnerplay", "movieinfo", "retry"];
  musicDummys.forEach(ep => MultiRoute(`music.${ep}`, true));

  MultiRoute("grade.raised", graderaised);

  MultiRoute("ranking.entry", rankingentry);
  MultiRoute("ranking.oentry", rankingoentry);
  MultiRoute("ranking.getranker", rankinggetranker);

  MultiRoute("gameSystem.systemInfo", gssysteminfo);

  // Streaming Handlers (TDJ Banners)
  MultiRoute("streaming.common", streamingcommon);
  MultiRoute("streaming.getcm", streaminggetcm);

  // Lobby Handlers (ARENA & BPL Battle)
  MultiRoute("lobby.entry", lobbyentry);
  MultiRoute("lobby.update", lobbyupdate);
  MultiRoute("lobby.delete", lobbydelete);
  MultiRoute("lobby.bplbattle_entry", bplbattle_entry);
  MultiRoute("lobby.bplbattle_update", bplbattle_update);
  MultiRoute("lobby.bplbattle_delete", bplbattle_delete);

  R.Unhandled((req: EamuseInfo, data: any, send: EamuseSend) => {
    console.warn(`Unhandled Request : [${GetVersion(req)}], ${req.module}.${req.method}, ${JSON.stringify(data)}`);
    return send.success();
  });

  R.WebUIEvent("iidxGetProfile", async (data, send: WebUISend) => {
    const pcdata = await DB.FindOne(data.refid, {
      collection: "pcdata",
      version: Number(data.version),
    });

    return send.json({
      pcdata,
    });
  });
  R.WebUIEvent("iidxGetSetting", async (data, send: WebUISend) => {
    const custom = await DB.FindOne(data.refid, {
      collection: "custom",
      version: Number(data.version),
    });

    const lm_custom = await DB.FindOne(data.refid, {
      collection: "lightning_custom",
      version: Number(data.version),
    });

    return send.json({
      custom,
      lm_custom,
    });
  });
  R.WebUIEvent("iidxUpdateRival", updateRivalSettings);
  R.WebUIEvent("iidxUpdateCustom", updateCustomSettings);
  R.WebUIEvent("iidxImportScoreData", importScoreData);
  R.WebUIEvent("iidxExportScoreData", exportScoreData);
  R.WebUIEvent("iidxExtractQpro", extractQproAssets);

  // common //
  R.Config("DiscordWebhookUrl", {
    name: "Discord Webhook URL",
    desc: "URL for Top 1 Score Tracker Discord Webhook (leave empty to disable)",
    type: "string",
    default: "",
  });

  // Q-Pro asset extraction settings //
  R.Config("iidx_ifstools_path", {
    name: "ifstools Path",
    desc: "Full path to ifstools.exe (e.g. C:\\tools\\ifstools.exe)",
    type: "string",
    default: "",
  });
  R.Config("iidx_qpro_src_dir", {
    name: "Q-Pro IFS Directory",
    desc: "Directory containing the qpro *.ifs files from the game (e.g. E:\\ARCADE\\IIDX33\\data\\graphic)",
    type: "string",
    default: "",
  });
  R.Config("iidx_jacket_dir", {
    name: "Jacket Directory",
    desc: "Path to the game's graphic folder containing jacket images (e.g. /mnt/extra/IIDX33/data/graphic). Used for Discord webhook thumbnails.",
    type: "string",
    default: "",
  });
  R.Config("BeatPhase", {
    name: "Beat #",
    desc: "1 / 2 / 3 / FREE", // This can be event phase on old versions //
    type: "integer",
    default: 3, // BEAT FREE //
  });
  // ~ Resort Anthem (common) / /
  R.Config("cmd_gmbl", {
    name: "G.JUDGE",
    desc: "Enable G.JUDGE Command (~ Resort Anthem)",
    type: "boolean",
    default: true,
  });
  R.Config("cmd_gmbla", {
    name: "G.JUDGE-A",
    desc: "Enable G.JUDGE-A Command (~ Resort Anthem)",
    type: "boolean",
    default: true,
  });
  R.Config("cmd_regl", {
    name: "REGUL-SPEED",
    desc: "Enable REGUL-SPEED Command (~ Resort Anthem)",
    type: "boolean",
    default: true,
  });
  R.Config("cmd_rndp", {
    name: "RANDOM+",
    desc: "Enable RANDOM+ Command (~ Resort Anthem)",
    type: "boolean",
    default: true,
  });
  R.Config("cmd_hrnd", {
    name: "H-RANDOM",
    desc: "Enable H-RANDOM Command (~ Resort Anthem)",
    type: "boolean",
    default: true,
  });
  R.Config("cmd_alls", {
    name: "ALL-SCRATCH",
    desc: "Enable ALL-SCRATCH Command (~ Resort Anthem)",
    type: "boolean",
    default: true,
  });
  // SPADA ~ (common) //
  R.Config("NewSongAnother12", {
    name: "New Song Another",
    desc: "Enables ANOTHER difficulty of current version's new songs that has Level 12",
    type: "boolean",
    default: true,
  });
  // PENDUAL ~ (common) //
  R.Config("ExpertPhase", {
    name: "Expert Phase",
    type: "integer",
    default: 2,
  });
  R.Config("ExpertRandomPhase", {
    name: "Expert Random Phase",
    type: "integer",
    default: 2,
  });
  // HEROIC VERSE ~ (common) //
  R.Config("ArenaPhase", {
    name: "ARENA Phase",
    type: "integer",
    default: 2, // ADVERTISE //
  });
  // BISTROVER ~ (common) //
  R.Config("MovieUpload", {
    name: "Movie Upload URL",
    type: "string",
    desc: "API address for play video uploading feature (JSON)",
    default: "http://localhost/"
  });
  R.Config("Eisei", {
    name: "Eisei Grade Courses",
    desc: "Enable EISEI/KIWAMI Grade Courses",
    type: "boolean",
    default: true,
  });
  // CastHour ~ RESIDENT (common) //
  R.Config("Grade", {
    name: "Grade Open Phase",
    desc: "RED / KAIDEN",
    type: "integer",
    default: 2,
  })

  // SIRIUS //
  R.Config("sr_league", {
    name: "League Phase (SR)",
    type: "integer",
    default: 0,
  });

  // Resort Anthem //
  R.Config("ra_league", {
    name: "League Phase (RA)",
    type: "integer",
    default: 0,
  });
  R.Config("ra_story", {
    name: "Story Phase (RA)",
    type: "integer",
    default: 0,
  });
  R.Config("ra_event", {
    name: "Tour Phase (RA)",
    type: "integer",
    default: 3,
  });
  R.Config("ra_lincle", {
    name: "Lincle LINK Phase (RA)",
    type: "integer",
    default: 1,
  });

  // Lincle //
  R.Config("lc_lincle", {
    name: "Lincle LINK Phase (LC)",
    type: "integer",
    default: 2,
  });
  R.Config("lc_boss", {
    name: "Lincle Kingdom Phase",
    type: "integer",
    default: 2,
  });

  // tricoro //
  R.Config("tr_limit", {
    name: "Limit Burst Phase (TR)",
    type: "integer",
    default: 24, // TODO:: verify //
  });
  R.Config("tr_boss", {
    name: "Event Phase (TR)",
    desc: "RED / BLUE / YELLOW",
    type: "integer",
    default: 3,
  });
  R.Config("tr_red", {
    name: "RED Phase",
    desc: "LEGEND CROSS Phase",
    type: "integer",
    default: 3,
  });
  R.Config("tr_yellow", {
    name: "YELLOW Phase",
    desc: "ぼくらの宇宙戦争 Phase",
    type: "integer",
    default: 3,
  });
  R.Config("tr_medal", {
    name: "Medal Phase (TR)",
    type: "integer",
    default: 3,
  });
  R.Config("tr_cafe", {
    name: "Café de Tran",
    desc: "Enable Café de Tran Event (tricoro)",
    type: "boolean",
    default: true,
  });
  R.Config("tr_tripark", {
    name: "Everyone's SPACEWAR!!",
    desc: "Enable クプロ・ミミニャミ・パステルくんのみんなで宇宙戦争!! Event (tricoro)",
    type: "boolean",
    default: true,
  });

  // SPADA //
  R.Config("sp_limit", {
    name: "Limit Burst Phase (SP)",
    type: "integer",
    default: 24,
  });
  R.Config("sp_boss", {
    name: "Event Phase (SP)",
    desc: "Spada†leggendaria Phase",
    type: "integer",
    default: 3,
  });
  R.Config("sp_boss1", {
    name: "Qprogue Phase (SP)",
    type: "integer",
    default: 4,
  });
  R.Config("sp_cafe", {
    name: "Café de Tran",
    desc: "Enable Café de Tran Event (SPADA)",
    type: "boolean",
    default: true,
  });
  R.Config("sp_tripark", {
    name: "Everyone's SPACEWAR!!",
    desc: "Enable クプロ・ミミニャミ・パステルくんのみんなで宇宙戦争!! Event (SPADA)",
    type: "boolean",
    default: true,
  });
  R.Config("sp_triparkskip", {
    name: "Everyone's SPACEWAR!! Skip",
    desc: "Skips クプロ・ミミニャミ・パステルくんのみんなで宇宙戦争!! Event Scenes",
    type: "integer",
    default: 2,
  });
  R.Config("sp_superstar", {
    name: "SUPER STAR -MITSURU-",
    desc: "SUPER STAR 満 -MITSURU- 完全復活祭 Phase",
    type: "integer",
    default: 2,
  });

  // PENDUAL //
  R.Config("pd_preplay", {
    name: "SUPER FUTURE 2323 Phase",
    type: "integer",
    default: 2,
  });
  R.Config("pd_tohoremix", {
    name: "BEMANI X TOHO",
    desc: "BEMANI×TOHO REITAISAI 2015 project Phase",
    type: "integer",
    default: 2,
  });
  R.Config("pd_limit", {
    name: "Chrono Chaser Phase",
    type: "integer",
    default: 9,
  });
  R.Config("pd_boss", {
    name: "Event Phase (PD)",
    desc: "Chrono Seeker / Qpronicle Chord / PENDUAL TALISMAN",
    type: "integer",
    default: 3,
  });
  R.Config("pd_chronodiver", {
    name: "Chrono Seeker",
    type: "integer",
    default: 3,
  });
  R.Config("pd_qproniclechord", {
    name: "Qpronicle Chord",
    type: "integer",
    default: 2,
  });
  R.Config("pd_cccollabo", {
    name: "Coca-Cola×BEMANI",
    desc: "Coca-Cola×BEMANI 店舗限定ロケテスト Phase",
    type: "integer",
    default: 3,
  });
  R.Config("pd_timephase", {
    name: "Time Phase",
    type: "integer",
    desc: "Default / Present / Future",
    default: 0,
  });

  // copula //
  R.Config("cp_boss", {
    name: "Event Phase (CP)",
    desc: "開通！とことこライン / Mystery Line",
    type: "integer",
    default: 2,
  });
  R.Config("cp_event1", {
    name: "開通！とことこライン",
    desc: "開通！とことこライン Phase",
    type: "integer",
    default: 1,
  });
  R.Config("cp_event2", {
    name: "Mystery Line",
    desc: "Mystery Line Phase",
    type: "integer",
    default: 2,
  });
  R.Config("cp_extraboss",
    {
      name: "Extra Boss Phase (CP)",
      desc: "Extra Boss Phase",
      type: "integer",
      default: 30,
    });
  R.Config("cp_bemanisummer", {
    name: "BEMANI Summer 2016",
    desc: "NEW Generation 夏の流星フェスタ2016 Phase",
    type: "integer",
    default: 2,
  });

  // SINOBUZ //
  R.Config("sb_boss", {
    name: "Event Phase (SB)",
    desc: "攻城シノバズ伝 / 忍々七鍵伝",
    type: "integer",
    default: 2,
  });
  R.Config("sb_event1", {
    name: "攻城シノバズ伝",
    desc: "攻城シノバズ伝 Phase",
    type: "integer",
    default: 2,
  });
  R.Config("sb_event2", {
    name: "忍々七鍵伝",
    desc: "忍々七鍵伝 Phase",
    type: "integer",
    default: 1,
  });
  R.Config("sb_extraboss",
    {
      name: "BUZRA ARTS",
      desc: "BUZRA ARTS Phase",
      type: "integer",
      default: 35,
    });

  // CANNON BALLERS //
  R.Config("cb_boss", {
    name: "Event Phase (SB)",
    desc: "激走！キャノンレーサー",
    type: "integer",
    default: 1,
  });
  R.Config("cb_event1", {
    name: "激走！キャノンレーサー",
    desc: "激走！キャノンレーサー Phase",
    type: "integer",
    default: 3,
  });
  R.Config("cb_extraboss",
    {
      name: "IIDX AIR RACE",
      desc: "IIDX AIR RACE Phase",
      type: "integer",
      default: 35,
    });

  // Rootage //
  R.Config("rt_boss", {
    name: "Event Phase (RT)",
    desc: "蜃気楼の図書館 / DELABITY LABORATORY",
    type: "integer",
    default: 2,
  });
  R.Config("rt_event1", {
    name: "蜃気楼の図書館",
    desc: "蜃気楼の図書館 Phase",
    type: "integer",
    default: 3,
  });
  R.Config("rt_event2", {
    name: "DELABITY LABORATORY",
    desc: "DELABITY LABORATORY Phase",
    type: "integer",
    default: 2,
  });
  R.Config("rt_extraboss",
    {
      name: "ARC SCORE",
      desc: "ARC SCORE Phase",
      type: "integer",
      default: 3,
    });

  // HEROIC VERSE //
  R.Config("hv_boss", {
    name: "Event Phase (HV)",
    desc: "HEROIC WORKOUT!!",
    type: "integer",
    default: 1,
  });
  R.Config("hv_event", {
    name: "HEROIC WORKOUT!!",
    desc: "HEROIC WORKOUT!! Phase",
    type: "integer",
    default: 4,
  });
  R.Config("hv_extraboss",
    {
      name: "SHADOW REBELLION",
      desc: "SHADOW REBELLION Phase",
      type: "integer",
      default: 1,
    });

  // BISTROVER //
  R.Config("bo_boss", {
    name: "Event Phase (BO)",
    desc: "召しませ！BISTROVER",
    type: "integer",
    default: 1,
  });
  R.Config("bo_extraboss", {
    name: "BISTRO LANDING",
    desc: "BISTRO LANDING Phase",
    type: "integer",
    default: 1,
  });
  R.Config("bo_event", {
    name: "召しませ！BISTROVER",
    desc: "召しませ！BISTROVER Phase",
    type: "integer",
    default: 1,
  });

  // CastHour //
  R.Config("ch_event", {
    name: "CastHour Space",
    desc: "CastHour Space Phase",
    type: "integer",
    default: 5,
  });
  R.Config("ch_extraboss", {
    name: "Extra Boss Phase (CH)",
    type: "integer",
    default: 3,
  });

  // RESIDENT //
  R.Config("rs_event", {
    name: "RESIDENT PARTY",
    desc: "RESIDENT PARTY Phase",
    type: "integer",
    default: 5,
  });
  R.Config("rs_extraboss", {
    name: "Extra Boss Phase (RS)",
    type: "integer",
    default: 3,
  });

  // EPOLIS //
  R.Config("ep_event", {
    name: "Event Phase (EP)",
    desc: "MY POLIS DESIGNER / EPOLIS RESTORATION",
    type: "integer",
    default: 2,
  });
  R.Config("ep_event1", {
    name: "MY POLIS DESIGNER",
    desc: "MY POLIS DESIGNER Phase",
    type: "integer",
    default: 3,
  });
  R.Config("ep_event2", {
    name: "EPOLIS RESTORATION",
    desc: "EPOLIS RESTORATION Phase",
    type: "integer",
    default: 3,
  });
  R.Config("ep_extraboss", {
    name: "EPOLIS SINGULARITY",
    desc: "EPOLIS SINGULARITY Phase",
    type: "integer",
    default: 3,
  });

  // Pinky Crush //
  R.Config("pc_event", {
    name: "Event Phase (PC)",
    desc: "ピンキージャンプアップ！ / ピンキーアンダーグラウンド",
    type: "integer",
    default: 2,
  });
  R.Config("pc_event1", {
    name: "ピンキージャンプアップ！",
    desc: "ピンキージャンプアップ！ Phase",
    type: "integer",
    default: 3,
  });
  R.Config("pc_event2", {
    name: "ピンキーアンダーグラウンド",
    desc: "ピンキーアンダーグラウンド Phase",
    type: "integer",
    default: 3,
  });
  R.Config("pc_extraboss", {
    name: "Extra Boss Phase (PC)",
    type: "integer",
    default: 3,
  });

  // Sparkle Shower //
  R.Config("ss_event1", {
    name: "Sparkle Fruit Lab.",
    desc: "Sparkle Fruit Lab. Phase",
    type: "integer",
    default: 1,
  });
  R.Config("ss_cyber", {
    name: "CYBER LOADER",
    desc: "CYBER LOADER Phase",
    type: "integer",
    default: 1,
  });
  R.Config("ss_extraboss", {
    name: "EXTRA CHALLENGE (SS)",
    desc: "EXTRA CHALLENGE Phase",
    type: "integer",
    default: 3,
  });
  R.Config("ss_extraboss_season", {
    name: "EXTRA CHALLENGE Season (SS)",
    type: "integer",
    default: 2,
  });
}
