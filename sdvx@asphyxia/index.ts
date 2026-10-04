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

export function register() {

  R.Contributor("LatoWolf#1170");
  R.Contributor("22vv0");
  R.GameCode('KFC');

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
