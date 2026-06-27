import { pcbBoot, dataLoad as systemDataLoad, getGachaSchedule, genericSuccess } from './handlers/system';
import { dataLoad, dataSave, checkIn, checkOut, saveResult } from './handlers/profile';
import { getRanking, getRankUpData } from './handlers/ranking';
import { matchMake } from './handlers/match';
import { drawChaseGacha } from './handlers/gacha';
import { getProfiles, updateName } from './handlers/webui';
import { RelayManager } from './handlers/relay';

export function register() {

  R.GameCode('UJK');
  R.Contributor('Ryu7w7');

  // Player Session Handlers
  R.Route('player.checkIn', checkIn);
  R.Route('player.checkOut', checkOut);
  R.Route('player.dataLoad', dataLoad);
  R.Route('player.dataSave', dataSave);
  R.Route('player.drawChaseGacha', drawChaseGacha);

  // System Handlers
  R.Route('system.pcbBoot', pcbBoot);
  R.Route('system.dataLoad', systemDataLoad);
  R.Route('system.dataSave', genericSuccess);
  R.Route('system.getGachaSchedule', getGachaSchedule);

  // Game & Matching Handlers
  R.Route('game.matchMake', matchMake);
  R.Route('game.saveResult', saveResult);
  R.Route('game.getRankUpData', getRankUpData);
  R.Route('player.getNowRank', genericSuccess);
  R.Route('player.getRanking', getRanking);

  // Miscellaneous Handlers
  R.Route('system.setPcbUpdateStatus', genericSuccess);
  R.Route('system.reportAssetDownloadProgress', genericSuccess);

  // Config Options
  R.Config('ccj_host_matching_time', {
    name: 'Matching Time (Seconds)',
    desc: 'Sets the maximum time a lobby waits for players before expiring (Default: 350).',
    type: 'integer',
    default: 350
  });

  R.Config('ccj_initial_league_rank', {
    name: 'Initial League Rank',
    desc: 'Sets the default matching rank for new profiles (1 = Rank D3, 2 = Rank D2, etc).',
    type: 'integer',
    default: 1
  });

  R.Config('ccj_relay_enabled', {
    name: 'Enable UDP Relay',
    desc: 'Enables the internal UDP relay for online play. Requires CcjRelay plugin on the Host side.',
    type: 'boolean',
    default: false
  });

  R.Config('ccj_relay_public_ip', {
    name: 'Relay Public IP',
    desc: 'The public IP address of this server that players will connect to.',
    type: 'string',
    default: '127.0.0.1'
  });

  R.Config('ccj_relay_port_range', {
    name: 'Relay Port Range',
    desc: 'The range of UDP ports to use for relay sessions (e.g., 50000-50100).',
    type: 'string',
    default: '50000-50100'
  });

  R.Config('ccj_relay_verbose', {
    name: 'Relay Verbose Logging',
    desc: 'Logs every packet forwarded through the relay. Use only for debugging.',
    type: 'boolean',
    default: false
  });

  R.Config('ccj_discord_webhook', {
    name: 'Discord Webhook URL',
    desc: 'URL of the Discord webhook to announce new matchmaking lobbies.',
    type: 'string',
    default: ''
  });

  R.Config('ccj_discord_icon', {
    name: 'Discord Icon URL',
    desc: 'URL of the icon image to show in the footer of Discord announcements.',
    type: 'string',
    default: 'https://raw.githubusercontent.com/Ryu7w7/asphyxia-plugins/main/ccj%40asphyxia/webui/asset/icon.png'
  });

  // WebUI Handlers
  R.WebUIEvent('ccj_get_profiles', getProfiles);
  R.WebUIEvent('ccj_update_name', updateName);

  R.Unhandled();

  // Initialize Relay Manager
  const relay = RelayManager.getInstance();
  relay.setConfig(
    U.GetConfig('ccj_relay_public_ip') || '127.0.0.1',
    U.GetConfig('ccj_relay_port_range') || '50000-50100',
    U.GetConfig('ccj_relay_verbose') === true
  );


  console.log('Chase Chase Jokers Plugin - Relay Mode Support Loaded');
}

