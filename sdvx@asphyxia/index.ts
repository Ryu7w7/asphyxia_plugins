import {common, log} from './handlers/common';
import {hiscore, rival, globalMatch, lounge, entryE, serial, saveAp, loadAp} from './handlers/features';
import {
  updateProfile,
  copyResourcesFromGame,
  getRivalScores,
  addRival,
  deleteAllRivals,
  preGeneRoll,
  preGeneReward,
  manageEvents,
  manageStartupFlags,
  addWeekly,
  getWeekRankList,
  getDateCode,
  getMorePluginSettings,
  saveMorePluginSettings,
  saveCustomAkanames,
  importMix,
  updateMix,
  deleteMix,
  clearCustomChartScores,
  clearAllScores,
  fixCorruptedScores
} from './handlers/webui';
import {
  nauticaBrowse,
  nauticaApprove,
  nauticaRemove,
  nauticaList,
  nauticaDeletedList,
  nauticaConvertStatus,
  nauticaReconvert,
  nauticaReconvertAll,
  nauticaExportList,
  nauticaImportList,
  nauticaDownloadSong,
  nauticaDownloadAll,
  nauticaNominate,
  nauticaMyNominations,
  nauticaNominationQueue,
  nauticaSubmitFeedback,
  nauticaGetFeedback,
  nauticaSetTesting,
  nauticaReject,
  nauticaSlotsStatus,
  nauticaSetBg,
} from './handlers/nautica';
import {
  load,
  create,
  loadScore,
  save,
  saveScore,
  saveCourse,
  buy,
  print,
  saveValgene,
  saveE,
  savePb
} from './handlers/profiles';
import { ARENA_STATION_ITEMS } from './data/exg';
import { ARENA_STATION_ITEMS7 } from './data/nbl';
import { dataUpdate } from './handlers/migrate';
import * as eacloud from './handlers/eacloud';

export function register() {

  R.Contributor("LatoWolf#1170");
  R.Contributor("22vv0");
  R.GameCode('KFC');
  R.GameCode('QCV'); // Konasute PC client

  R.Config('sdvx_eg_root_dir', { type: 'string', needRestart: true, default: '', name: 'Game Data Directory', desc: 'The root directory of your Exceed Gear/∇ game files (for asset copying)'});
  R.Config('use_blasterpass',{ type: 'boolean', default: true, name:'Use BLASTER PASS', desc:''});
  R.Config('unlock_all_songs', { type: 'boolean', default: false, name:'Unlock All Songs'});
  R.Config('unlock_all_navigators', { type: 'boolean', default: false, name:'Unlock All Navigators'} );
  R.Config('unlock_all_appeal_cards', { type: 'boolean', default: false, name:'Unlock All Appeal Cards'});
  R.Config('unlock_all_valk_items', { type: 'boolean', default: false, name:'Unlock Customization Items', desc: 'Unlock most customization items (Navigators not included; check \'unlock all navigators\' option)'});
  
  R.DataFile('./webui/asset/uploads/1_mdb.xml', {name: 'music_db.xml (BOOTH)', accept: 'text/xml, .xml'});
  R.DataFile('./webui/asset/uploads/2_mdb.xml', {name: 'music_db.xml (infinite infection)', accept: 'text/xml, .xml'});
  R.DataFile('./webui/asset/uploads/3_mdb.xml', {name: 'music_db.xml (GRAVITY WARS)', accept: 'text/xml, .xml'});
  R.DataFile('./webui/asset/uploads/4_mdb.xml', {name: 'music_db.xml (HEAVENLY HAVEN)', accept: 'text/xml, .xml'});
  R.DataFile('./webui/asset/uploads/5_mdb.xml', {name: 'music_db.xml (VIVID WAVE)', accept: 'text/xml, .xml'});
  R.DataFile('./webui/asset/uploads/6_mdb.xml', {name: 'music_db.xml (EXCEED GEAR)', accept: 'text/xml, .xml'});
  R.DataFile('./webui/asset/uploads/7_mdb.xml', {name: 'music_db.xml (∇)', accept: 'text/xml, .xml'});
  R.DataFile('./webui/asset/uploads/0_mdb.xml', {name: 'music_db.xml (Omnimix)', desc: 'SDVX7 compatible mdb', accept: 'text/xml, .xml'});
  R.DataFile('./webui/asset/uploads/8_mdb.xml', {name: 'music_db.xml (Konasute)', desc: 'Konasute PC (QCV) compatible music_db', accept: 'text/xml, .xml'});

  R.WebUIEvent('copyResourcesFromGame', copyResourcesFromGame);
  R.WebUIEvent('getRivalScores', getRivalScores);
  R.WebUIEvent('addRival', addRival);
  R.WebUIEvent('deleteAllRivals', deleteAllRivals);
  R.WebUIEvent('preGeneRoll', preGeneRoll);
  R.WebUIEvent('preGeneReward', preGeneReward);
  R.WebUIEvent('manageEvents', manageEvents);
  R.WebUIEvent('manageStartupFlags', manageStartupFlags);
  R.WebUIEvent('updateProfile', updateProfile);
  R.WebUIEvent('addWeekly', addWeekly);
  R.WebUIEvent('getWeekRankList', getWeekRankList);
  R.WebUIEvent('getDateCode', getDateCode);
  R.WebUIEvent('getMorePluginSettings', getMorePluginSettings);
  R.WebUIEvent('saveMorePluginSettings', saveMorePluginSettings);
  R.WebUIEvent('saveCustomAkanames', saveCustomAkanames);
  R.WebUIEvent('importMix', importMix);
  R.WebUIEvent('updateMix', updateMix);
  R.WebUIEvent('deleteMix', deleteMix);
  R.WebUIEvent('clearCustomChartScores', clearCustomChartScores);
  R.WebUIEvent('clearAllScores', clearAllScores);
  R.WebUIEvent('fixCorruptedScores', fixCorruptedScores);
  R.WebUIEvent('nauticaBrowse', nauticaBrowse);
  R.WebUIEvent('nauticaApprove', nauticaApprove);
  R.WebUIEvent('nauticaRemove', nauticaRemove);
  R.WebUIEvent('nauticaList', nauticaList);
  R.WebUIEvent('nauticaDeletedList', nauticaDeletedList);
  R.WebUIEvent('nauticaConvertStatus', nauticaConvertStatus);
  R.WebUIEvent('nauticaReconvert', nauticaReconvert);
  R.WebUIEvent('nauticaReconvertAll', nauticaReconvertAll);
  R.WebUIEvent('nauticaExportList', nauticaExportList);
  R.WebUIEvent('nauticaImportList', nauticaImportList);
  R.WebUIEvent('nauticaDownloadSong', nauticaDownloadSong);
  R.WebUIEvent('nauticaDownloadAll', nauticaDownloadAll);
  R.WebUIEvent('nauticaNominate', nauticaNominate);
  R.WebUIEvent('nauticaMyNominations', nauticaMyNominations);
  R.WebUIEvent('nauticaNominationQueue', nauticaNominationQueue);
  R.WebUIEvent('nauticaSubmitFeedback', nauticaSubmitFeedback);
  R.WebUIEvent('nauticaGetFeedback', nauticaGetFeedback);
  R.WebUIEvent('nauticaSetTesting', nauticaSetTesting);
  R.WebUIEvent('nauticaReject', nauticaReject);
  R.WebUIEvent('nauticaSlotsStatus', nauticaSlotsStatus);
  R.WebUIEvent('nauticaSetBg', nauticaSetBg);

  const MultiRoute = (method: string, handler: EPR | boolean) => {
    // Helper for register multiple versions.
    R.Route(`game.${method}`, handler);
    R.Route(`game_2.${method}`, handler);
    R.Route(`game_3.${method}`, handler);
    R.Route(`game.sv4_${method}`, handler);
    R.Route(`game.sv6_${method}`, handler);
    R.Route(`game.sv5_${method}`, handler);
    R.Route(`game.sv7_${method}`, handler);
  };

  // Common
  MultiRoute('common', common);

  // Profile
  MultiRoute('new', create);
  MultiRoute('load', load);
  MultiRoute('load_m', loadScore);
  MultiRoute('save', save);
  MultiRoute('save_m', saveScore);
  MultiRoute('save_c', saveCourse);
  MultiRoute('save_pb', savePb);
  MultiRoute('save_ap', saveAp);
  MultiRoute('load_ap', loadAp);
  MultiRoute('save_valgene', saveValgene);
  MultiRoute('frozen', true);
  MultiRoute('buy', buy);
  MultiRoute('print', print);
  MultiRoute('serial', serial);

  // Features
  MultiRoute('hiscore', hiscore);
  MultiRoute('load_r', rival);

  // Lazy
  MultiRoute('lounge', lounge);
  MultiRoute('shop', (_, __, send) => send.object({
    nxt_time: K.ITEM('u32', 1000 * 5 * 60)
  }));
  MultiRoute('save_e', saveE);
  MultiRoute('save_mega', true);
  MultiRoute('play_e', true);
  MultiRoute('play_s', true);
  MultiRoute('entry_s', globalMatch);
  MultiRoute('entry_e', entryE);
  MultiRoute('exception', true);
  MultiRoute('log',log);
 
  R.Route('eventlog.write', (_, __, send) => send.object({
    gamesession: K.ITEM('s64', BigInt(1)),
    logsendflg: K.ITEM('s32', 0),
    logerrlevel: K.ITEM('s32', 0),
    evtidnosendflg: K.ITEM('s32', 0)
  }));
  
  R.Route('package.list',(_,__,send)=>send.object({
      package:K.ATTR({expire:"1200"},{status:"1"})
  }));
  
  R.Route('ins.netlog', (_, __, send) => send.object({
    //gamesession: K.ITEM('s64', BigInt(1)),
    //logsendflg: K.ITEM('s32', 0),
    //logerrlevel: K.ITEM('s32', 0),
    //evtidnosendflg: K.ITEM('s32', 0)
  }));

  // ─── Konasute (QCV) — eacnet routes ────────────────────────────────────────
  // The Konasute PC client uses a separate protocol (eacnet) on top of EA3.
  // These routes are completely independent from the arcade KFC flow.
  R.Route('sdvx.getServices',              eacloud.getServices);
  R.Route('sdvx.getServerState',           eacloud.getServerState);
  R.Route('sdvx.getServerClock',           eacloud.getServerClock);
  R.Route('sdvx.checkVersion',             eacloud.checkVersion);
  R.Route('sdvx.getGoodsList',             eacloud.getGoodsList);
  R.Route('sdvx.getHash',                  eacloud.getHash);
  R.Route('sdvx.uploadFile',               eacloud.uploadFile);
  R.Route('sdvx.getResourceInfo',          eacloud.getResourceInfo);
  R.Route('sdvx.checkSendLogAvailable',    eacloud.checkSendLogAvailable);
  R.Route('sdvx.getInformation',           eacloud.getInformation);
  R.Route('sdvx.getServerValues',          eacloud.getServerValues);
  R.Route('sdvx.sendLog',                  eacloud.sendLog);
  R.Route('sdvx.consumeItem',              eacloud.consumeItem);
  R.Route('sdvx.checkGameStart',           eacloud.checkGameStart);
  R.Route('sdvx.getItemList',              eacloud.getItemList);
  R.Route('sdvx.getSubscriptionStatus',    eacloud.getSubscriptionStatus);
  R.Route('sdvx.getUserIDs',               eacloud.getUserIDs);
  R.Route('sdvx.heartbeat',                eacloud.heartbeat);
  R.Route('sdvx.reserveConsumeItem',       eacloud.reserveConsumeItem);
  R.Route('sdvx.cancelReserveConsumeItem', eacloud.cancelReserveConsumeItem);
  R.Route('sdvx.gameEnd',                  eacloud.gameEnd);
  R.Route('sdvx.acRelay',                  eacloud.acRelay);
  // Legacy qcv surface (URLs advertised in getServices — must exist)
  R.Route('sdvx.login',                    eacloud.login);
  R.Route('sdvx.getLauncherData',          eacloud.getLauncherData);
  R.Route('sdvx.getFile',                  eacloud.getFile);
  R.Route('sdvx.getItemNum',               eacloud.getItemNum);
  R.Route('sdvx.softwareSpecificService',  eacloud.softwareSpecificService);
  R.Route('sdvx.urlAgreement',             eacloud.urlAgreement);
  R.Route('sdvx.urlEaShop',               eacloud.urlEaShop);
  R.Route('sdvx.checkGameVersion',         eacloud.checkGameVersion);
  R.Route('sdvx.checkUpdate',              eacloud.checkUpdate);

  // ─── Konasute (QCV) — p2d routes ───────────────────────────────────────────
  // P2D protocol — handles subscription/account state for Konasute.
  // Without correct P2D responses the client defaults to GUEST.
  R.Route('p2d.getServerValues',           eacloud.p2dGetServerValues);
  R.Route('p2d.heartbeat',                 eacloud.p2dHeartbeat);
  R.Route('p2d.checkGameStart',            eacloud.p2dCheckGameStart);
  R.Route('p2d.checkVersion',              eacloud.p2dCheckVersion);
  R.Route('p2d.checkUpdate',               eacloud.p2dCheckUpdate);
  R.Route('p2d.sendLog',                   eacloud.p2dSendLog);
  R.Route('p2d.getClearRate',              eacloud.p2dGetClearRate);
  R.Route('p2d.getServices',               eacloud.getServices);
  R.Route('p2d.getServerState',            eacloud.getServerState);
  R.Route('p2d.getServerClock',            eacloud.getServerClock);
  R.Route('p2d.getUserIDs',                eacloud.getUserIDs);
  R.Route('p2d.getSubscriptionStatus',     eacloud.getSubscriptionStatus);
  R.Route('p2d.getItemList',               eacloud.getItemList);
  R.Route('p2d.getGoodsList',              eacloud.getGoodsList);
  R.Route('p2d.reserveConsumeItem',        eacloud.reserveConsumeItem);
  R.Route('p2d.consumeItem',               eacloud.consumeItem);
  R.Route('p2d.cancelReserveConsumeItem',  eacloud.cancelReserveConsumeItem);

  // ─── Konasute (QCV) — acRelay tunnelled game routes ───────────────────────
  // Konasute tunnels standard arcade EA3 calls through eacnet's acRelay.
  // These routes forward the inner request to the standard game handlers.
  R.Route('sdvx.sv6_common',     common);
  R.Route('sdvx.sv6_hiscore',    hiscore);
  R.Route('sdvx.sv6_log',        log);
  R.Route('sdvx.sv6_load',       load);
  R.Route('sdvx.sv6_load_r',     rival);
  R.Route('sdvx.sv6_load_m',     loadScore);
  R.Route('sdvx.sv6_save',       save);
  R.Route('sdvx.sv6_save_m',     saveScore);
  R.Route('sdvx.sv6_save_c',     saveCourse);
  R.Route('sdvx.sv6_save_pb',    savePb);
  R.Route('sdvx.sv6_save_e',     saveE);
  R.Route('sdvx.sv6_save_mega',  true);
  R.Route('sdvx.sv6_play_e',     true);
  R.Route('sdvx.sv6_play_s',     true);
  R.Route('sdvx.sv6_buy',        buy);
  R.Route('sdvx.sv6_lounge',     lounge);
  R.Route('sdvx.sv6_entry_s',    globalMatch);
  R.Route('sdvx.sv6_entry_e',    entryE);
  R.Route('sdvx.sv6_frozen',     true);
  R.Route('sdvx.sv6_exception',  true);
  R.Route('sdvx.sv6_music_url',  eacloud.acRelay);
  R.Route('sdvx.sv6_mdata',      true);
  R.Route('sdvx.sv6_st',         true);
  R.Route('sdvx.sv6_arena_m',    true);

  R.Unhandled(undefined)

  // Hiscore options (apply to sv4+/sv5+/sv6/sv7 cabinets)
  R.Config('sdvx_hiscore_serve_limit', {
    name: 'Hiscore Serve Limit',
    desc: 'Max hiscore entries served per page when the cabinet omits offset/limit (default 1000).',
    type: 'integer',
    default: 1000,
    needRestart: true
  });
  R.Config('sdvx_hiscore_lfields', {
    name: 'Hiscore Include L-Fields',
    desc: 'Include the l_*/lx_* fields that duplicate a_*/ax_* in every hiscore entry. Set to false to halve the response size.',
    type: 'boolean',
    default: true,
    needRestart: true
  });
  R.Config('sdvx_hiscore_full_catalog', {
    name: 'Hiscore Full Catalog',
    desc: 'Fill hiscore entries for every song in the music DB, even songs nobody has played yet.',
    type: 'boolean',
    default: false,
    needRestart: true
  });

  // Custom Charts (Nautica) options
  R.Config('sdvx_voxcharger_path', { type: 'string', needRestart: false, default: '', name: 'VoxCharger Path', desc: 'Path to VoxCharger.exe for converting custom charts'});
  R.Config('sdvx_custom_mix_name', { type: 'string', needRestart: false, default: 'asphyxia_custom', name: 'Custom Mix Name', desc: 'Folder name under data_mods/ for curated custom charts'});
  R.Config('sdvx_nautica_id_start', { type: 'string', needRestart: false, default: '2800', name: 'Custom Chart Starting ID', desc: 'First music ID allocated to custom (Nautica) charts. The game crashes at IDs >= 3072, so this is capped at 3070.'});
  R.Config('sdvx_drive_enabled', { type: 'boolean', needRestart: false, default: false, name: 'Google Drive Uploads', desc: 'When enabled, converted charts are uploaded to Google Drive.'});
  R.Config('sdvx_drive_oauth_client_id', { type: 'string', needRestart: false, default: '', name: 'Drive OAuth Client ID', desc: 'OAuth 2.0 Client ID from GCP Console.'});
  R.Config('sdvx_drive_oauth_client_secret', { type: 'string', needRestart: false, default: '', name: 'Drive OAuth Client Secret', desc: 'OAuth 2.0 Client Secret.'});
  R.Config('sdvx_drive_oauth_refresh_token', { type: 'string', needRestart: false, default: '', name: 'Drive OAuth Refresh Token', desc: 'Populated automatically after authorization.'});
  R.Config('sdvx_drive_folder_id', { type: 'string', needRestart: false, default: '', name: 'Drive Folder ID', desc: 'Target Google Drive folder ID.'});

  dataUpdate()
}
