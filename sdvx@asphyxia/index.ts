import {common, log} from './handlers/common';
import {hiscore, rival, globalMatch, lounge, entryE, serial} from './handlers/features';
import {
  updateProfile,
  copyResourcesFromGame,
  getRivalScores,
  addRival,
  preGeneRoll,
  preGeneReward,
  manageEvents,
  manageStartupFlags,
  addWeekly,
  getWeekRankList,
  getDateCode,
  clearCustomChartScores
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
import { SdvxRelayManager } from './handlers/relay';

export function register() {

  R.Contributor("LatoWolf#1170");
  R.Contributor("22vv0");
  R.GameCode('KFC');

  R.Config('sdvx_eg_root_dir', { type: 'string', needRestart: true, default: '', name: 'Game Data Directory', desc: 'The root directory of your Exceed Gear/∇ game files (for asset copying)'});
  R.Config('use_blasterpass',{ type: 'boolean', default: true, name:'Use BLASTER PASS', desc:''});
  R.Config('arena_no_endtime',{ type: 'boolean', default: true, name: 'Keep ARENA running', desc: 'Choose whether to keep the latest ARENA season running past the end date.'});
  R.Config('arena_station7',{ type: 'string', options: Object.keys(ARENA_STATION_ITEMS7), default: 'None', name: 'ARENA STATION set', desc: 'Choose which set of ARENA STATION items are available for purchase during ARENA (∇ only)'});
  R.Config('unlock_all_songs', { type: 'boolean', default: false, name:'Unlock All Songs'});
  R.Config('unlock_all_navigators', { type: 'boolean', default: false, name:'Unlock All Navigators'} );
  R.Config('unlock_all_appeal_cards', { type: 'boolean', default: false, name:'Unlock All Appeal Cards'});
  R.Config('unlock_all_valk_items', { type: 'boolean', default: false, name:'Unlock Customization Items', desc: 'Unlock most customization items (Navigators not included; check \'unlock all navigators\' option)'});
  R.Config('gw_mission', { type: 'boolean', default: false, name: 'Enable MISSION mode', desc: 'For GRAVITY WARS' })
  R.Config('gw_mission_skipmatch', { type: 'boolean', default: false, name: 'Skip matchmaking MISSION objectives', desc: 'In case you\'re unable to do matchmaking. Prologue and episode 10 only. Dialogue will be skipped.' })
  R.Config('gw_gene', { type: 'boolean', default: true, name: 'GENERATOR START', desc: 'For GRAVITY WARS: disable to hide in mode select in case of print problem loop (due to missing chara_card files)' })

  R.Config('sdvx_voxcharger_path', { type: 'string', needRestart: false, default: '', name: 'VoxCharger Path', desc: 'Path to VoxCharger.exe for converting custom charts'});
  R.Config('sdvx_custom_mix_name', { type: 'string', needRestart: false, default: 'asphyxia_custom', name: 'Custom Mix Name', desc: 'Folder name under data_mods/ for curated custom charts'});
  R.Config('sdvx_nomination_mode', { type: 'string', options: ['production', 'staging'], default: 'production', name: 'Nomination Mode', desc: 'On staging servers, charts moved to testing are auto-converted for playtesting'});
  R.Config('sdvx_nautica_id_start', { type: 'string', needRestart: false, default: '2800', name: 'Custom Chart Starting ID', desc: 'First music ID allocated to custom (Nautica) charts. The game crashes at IDs >= 3072, so this is capped at 3070. Lowering it gives more custom-chart slots, but values too low will collide with official song IDs (typically up to ~1900). Change this BEFORE adding custom charts — songs already assigned below the new start remain in the DB but will be invisible to slot tracking.'});
  R.Config('sdvx_drive_enabled', { type: 'boolean', needRestart: false, default: false, name: 'Google Drive Uploads', desc: 'When enabled, converted charts are uploaded to Google Drive and clients download from there instead of this server.'});
  R.Config('sdvx_drive_oauth_client_id', { type: 'string', needRestart: false, default: '', name: 'Drive OAuth Client ID', desc: 'OAuth 2.0 Client ID from GCP Console > APIs & Services > Credentials. Create a Web application client and add http://localhost:8083/api/drive-oauth-callback (matching your server URL) as an Authorized redirect URI.'});
  R.Config('sdvx_drive_oauth_client_secret', { type: 'string', needRestart: false, default: '', name: 'Drive OAuth Client Secret', desc: 'OAuth 2.0 Client Secret that pairs with the Client ID above.'});
  R.Config('sdvx_drive_oauth_refresh_token', { type: 'string', needRestart: false, default: '', name: 'Drive OAuth Refresh Token', desc: 'Populated automatically after you click "Authorize with Google Drive" on the Custom Charts Admin page. Leave empty.'});
  R.Config('sdvx_drive_folder_id', { type: 'string', needRestart: false, default: '', name: 'Drive Folder ID', desc: 'The target Google Drive folder ID (the last segment of the folder URL). Uploads go into this folder under your own Google account, counting against your personal Drive quota.'});
  R.Config('sdvx_chrome_path', { type: 'string', needRestart: false, default: '', name: 'Chrome / Chromium / Edge executable', desc: 'Absolute path to a Chromium-based browser used to render the VF Top 50 PNG endpoint (/api/sdvx/vf-top-50/<refid>.png). Leave empty to auto-detect Chrome and Edge on Windows / macOS / Linux. Only needed if auto-detect fails or you want a specific install.'});

  R.Config('sdvx_relay_enabled', {
    name: 'Enable Online Relay',
    desc: 'Routes all online matching traffic through this server (TCP+UDP bridge). Lets players behind CGNAT play online without port forwarding. Set the Relay Public IP below.',
    type: 'boolean',
    default: false
  });
  R.Config('sdvx_relay_public_ip', {
    name: 'Relay Public IP',
    desc: 'The public IP of this server that players will connect to for relayed matches. Use a separate VPS for testing without affecting the main server.',
    type: 'string',
    default: '127.0.0.1'
  });
  R.Config('sdvx_relay_port_range', {
    name: 'Relay Port Range',
    desc: 'TCP+UDP ports used for relay sessions (e.g., 50000-50100). Open these in the server firewall.',
    type: 'string',
    default: '50000-50100'
  });
  R.Config('sdvx_relay_verbose', {
    name: 'Relay Verbose Logging',
    desc: 'Logs every connection/registration on the relay. Use only for debugging.',
    type: 'boolean',
    default: false
  });
  
  R.DataFile('./webui/asset/uploads/1_mdb.xml', {name: 'music_db.xml (BOOTH)', accept: 'text/xml, .xml'});
  R.DataFile('./webui/asset/uploads/2_mdb.xml', {name: 'music_db.xml (infinite infection)', accept: 'text/xml, .xml'});
  R.DataFile('./webui/asset/uploads/3_mdb.xml', {name: 'music_db.xml (GRAVITY WARS)', accept: 'text/xml, .xml'});
  // R.DataFile('./webui/asset/uploads/4_mdb.xml', {name: 'music_db.xml (HEAVENLY HAVEN)', accept: 'text/xml, .xml'});
  // R.DataFile('./webui/asset/uploads/5_mdb.xml', {name: 'music_db.xml (VIVID WAVE)', accept: 'text/xml, .xml'});
  R.DataFile('./webui/asset/uploads/6_mdb.xml', {name: 'music_db.xml (EXCEED GEAR)', accept: 'text/xml, .xml'});
  R.DataFile('./webui/asset/uploads/7_mdb.xml', {name: 'music_db.xml (∇)', accept: 'text/xml, .xml'});
  R.DataFile('./webui/asset/uploads/0_mdb.xml', {name: 'music_db.xml (Omnimix)', desc: 'SDVX7 compatible mdb', accept: 'text/xml, .xml'});

  R.WebUIEvent('copyResourcesFromGame', copyResourcesFromGame);
  R.WebUIEvent('getRivalScores', getRivalScores);
  R.WebUIEvent('addRival', addRival);
  R.WebUIEvent('preGeneRoll', preGeneRoll);
  R.WebUIEvent('preGeneReward', preGeneReward);
  R.WebUIEvent('manageEvents', manageEvents);
  R.WebUIEvent('manageStartupFlags', manageStartupFlags);
  R.WebUIEvent('updateProfile', updateProfile);
  R.WebUIEvent('addWeekly', addWeekly);
  R.WebUIEvent('getWeekRankList', getWeekRankList);
  R.WebUIEvent('getDateCode', getDateCode);
  R.WebUIEvent('clearCustomChartScores', clearCustomChartScores);
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

  const MultiRoute = (method: string, handler: EPR | boolean) => {
    // Helper for register multiple versions.
    R.Route(`game.${method}`, handler);
    R.Route(`game_2.${method}`, handler);
    R.Route(`game_3.${method}`, handler);
    R.Route(`game.sv6_${method}`, handler);
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

  SdvxRelayManager.getInstance().setConfig(
    U.GetConfig('sdvx_relay_public_ip') || '127.0.0.1',
    U.GetConfig('sdvx_relay_port_range') || '50000-50100',
    U.GetConfig('sdvx_relay_verbose') === true
  );
  if (U.GetConfig('sdvx_relay_enabled') === true) {
    console.log(`SDVX Online Relay: enabled (${U.GetConfig('sdvx_relay_public_ip') || '127.0.0.1'})`);
  }

  dataUpdate()
}
