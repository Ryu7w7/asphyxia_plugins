import { pcbBoot, dataLoad as systemDataLoad, getGachaSchedule, genericSuccess } from './handlers/system';
import { dataLoad, dataSave, checkIn, checkOut, saveResult } from './handlers/profile';
import { getRanking, getRankUpData } from './handlers/ranking';
import { matchMake } from './handlers/match';
import { drawChaseGacha } from './handlers/gacha';
import { getProfiles, updateName } from './handlers/webui';

export function register() {

  R.GameCode('UJK');

  R.Contributor('Ryu7w7');

  // Player Session Handlers
  R.Route('player.checkIn', checkIn);
  R.Route('player.checkOut', checkOut);
  R.Route('player.dataLoad', dataLoad);
  R.Route('player.dataSave', dataSave);
  R.Route('player.drawChaseGacha', drawChaseGacha);

  // System Handlers - CRITICAL: Must be separated from player data
  R.Route('system.pcbBoot', pcbBoot);
  R.Route('system.dataLoad', systemDataLoad);
  R.Route('system.dataSave', genericSuccess);
  R.Route('system.getGachaSchedule', getGachaSchedule);

  // Game & Social Handlers
  R.Route('game.matchMake', matchMake);
  R.Route('game.saveResult', saveResult);
  R.Route('game.getRankUpData', getRankUpData);
  R.Route('player.getNowRank', genericSuccess);
  R.Route('player.getRanking', getRanking);

  // Relay Handlers
  // (Launcher queries WebUI API directly via ccj_get_relay_info)

  // Miscellaneous PCB Handlers
  R.Route('system.setPcbUpdateStatus', genericSuccess);
  R.Route('system.reportAssetDownloadProgress', genericSuccess);

  // Config Options Setup
  R.Config('ccj_host_matching_time', {
    name: 'CCJ Host Matching Time (Seconds)',
    desc: 'Sets the maximum time a host lobby waits for players before expiring (Default: 180 seconds).',
    type: 'integer',
    default: 180
  });

  R.Config('ccj_initial_league_rank', {
    name: 'CCJ League Initial Rank',
    desc: 'Sets the initial default matching rank for new user profiles (1 = Rank D3, 2 = Rank D2, etc)',
    type: 'integer',
    default: 1
  });

  // WebUI Handlers
  R.WebUIEvent('ccj_get_profiles', getProfiles);
  R.WebUIEvent('ccj_update_name', updateName);

  R.Unhandled();

  console.log('CCJ Plugin - Glassmorphism WebUI Loaded');
}
