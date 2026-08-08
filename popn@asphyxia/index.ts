import * as tunestreet from "./handler/tunestreet";
import * as fantasia from "./handler/fantasia";
import * as sunny from "./handler/sunny";
import * as lapistoria from "./handler/lapistoria";
import * as eclale from "./handler/eclale";
import * as usaneko from "./handler/usaneko";
import { clearPopnGeneratedAssets, getPopnAssetStorage, getPopnAssetUpdateLog, syncPopnCharacterArt, syncPopnDecorationAssets } from './handler/webui';
import { Rivals } from "./models/common";

const getVersion = (req: any) => {
  switch (req.gameCode) {
    case 'K39':
      return tunestreet;
    case 'L39':
      return fantasia;
    case 'M39':
      return sunny;
  }
}

export function register() {
  console.log('[popn] High Cheers compatibility revision 64 loaded');
  R.GameCode('K39');
  R.GameCode('L39');
  R.GameCode('M39');

  R.Config("enable_score_sharing", {
    name: "Score sharing",
    desc: "Enable sharing scores between versions. This also affect rivals scores.",
    type: "boolean",
    default: true,
  });

  R.Config("enable_force_unlock", {
    name: "Unlock all songs",
    desc: "Force unlocking all songs (Lapistoria and later).",
    type: "boolean",
    default: true,
  });

  R.Config('popn_m39_root_dir', {
    name: 'Game Data Directory',
    desc: 'Select the game data root: the folder that contains plain_data. Do not select plain_data or tex itself. Asset refresh also reads optional musicdb/charadb XML files from data_mods.',
    type: 'string',
    default: '',
  });

  // M39 rejects CORE's default `<item/>` response for message.get because
  // its message receiver requires every item to have a `name` attribute.
  // An empty message list is represented by an empty `message` node instead.
  R.Route(`message.get`, async (_req, _data, send) => {
    console.log('[popn] M39-compatible message.get response');
    return send.object({
      message: K.ATTR({ expire: "300", status: "0" }),
    });
  });

  // High Cheers asks for local3 after card registration. CORE v1.60b does not
  // advertise this newer service, so the game aborts before it can issue the
  // request. Advertise it only for the M39 family; its concrete methods are
  // handled below by the plugin fallback while we implement them.
  R.ExtraModuleHandler((model) =>
    model.startsWith('M39') ? ['local3'] : []
  );

  R.WebUIEvent('updatePnmPlayerInfo', async (data: any) => {
    await DB.Update(data.refid, { collection: 'profile' }, { $set: { name: data.name } });
  });

  R.WebUIEvent('getPnmAssetUpdateLog', getPopnAssetUpdateLog);
  R.WebUIEvent('getPnmAssetStorage', getPopnAssetStorage);
  R.WebUIEvent('clearPnmGeneratedAssets', clearPopnGeneratedAssets);

  // High Cheers exposes the selected profile decoration through account.item_*
  // even though the cabinet has no menu to change it. Keep this WebUI-only
  // setting in the M39 profile parameters, like the official web service.
  R.WebUIEvent('updatePnmDecoration', async (data: any) => {
    const refid = String(data.refid || '').trim();
    const seals = Array.from({ length: 7 }, (_, index) => Number.parseInt(String(data[`seal${index}`] || 0), 10));
    const seat = Number.parseInt(String(data.seat || 0), 10);
    if (!refid || seals.some((id) => !Number.isInteger(id) || id < 0) || !Number.isInteger(seat) || seat < 0) {
      return;
    }

    const params = await DB.FindOne<any>(refid, { collection: 'params', version: 'v29' }) || {
      collection: 'params',
      version: 'v29',
      params: {},
    };
    params.params = params.params || {};
    // Actual M39 player.read customize fields.
    seals.forEach((id, index) => params.params[`seal_${index}`] = id);
    params.params.seat = seat;
    params.params.profile_item_type = seals[0] === 0 ? 0 : 3;
    params.params.profile_item_id = seals[0];
    await DB.Upsert(refid, { collection: 'params', version: 'v29' }, params);
  });

  R.WebUIEvent('syncPnmDecorationAssets', syncPopnDecorationAssets);
  R.WebUIEvent('syncPnmCharacterArt', syncPopnCharacterArt);

  R.WebUIEvent('updatePnmTouchTheme', async (data: any) => {
    const refid = String(data.refid || '').trim();
    const touchTheme = Number.parseInt(String(data.touch_th), 10);
    if (!refid || !Number.isInteger(touchTheme) || touchTheme < 0 || touchTheme > 9999) return;
    const params = await DB.FindOne<any>(refid, { collection: 'params', version: 'v29' }) || { collection: 'params', version: 'v29', params: {} };
    params.params = params.params || {};
    // utils.addExtraData maps this value into player.read/customize.touch_th.
    params.params.touch_th = touchTheme;
    await DB.Upsert(refid, { collection: 'params', version: 'v29' }, params);
  });

  R.WebUIEvent('updatePnmPlayCustomize', async (data: any) => {
    const refid = String(data.refid || '').trim();
    const laneCover = Number.parseInt(String(data.lane_cover), 10);
    const stageBk = Number.parseInt(String(data.stage_bk), 10);
    const highlight = Number.parseInt(String(data.highlight), 10);
    if (!refid || [laneCover, stageBk, highlight].some((value) => !Number.isInteger(value) || value < 0 || value > 9999)) return;
    const params = await DB.FindOne<any>(refid, { collection: 'params', version: 'v29' }) || { collection: 'params', version: 'v29', params: {} };
    params.params = params.params || {};
    params.params.lane_cover = laneCover;
    params.params.stage_bk = stageBk;
    params.params.highlight = highlight;
    await DB.Upsert(refid, { collection: 'params', version: 'v29' }, params);
  });

  // Rivals UI management
  R.WebUIEvent('deleteRival', async (data: any) => {
    const rivals = await DB.FindOne<Rivals>(data.refid, { collection: 'rivals' }) || { collection: 'rivals', rivals: [] };
    const idx = rivals.rivals.indexOf(data.rivalid);
    if (idx >= 0) {
      rivals.rivals.splice(idx, 1);
      await DB.Update(data.refid, { collection: 'rivals' }, rivals);
    }
  });

  R.WebUIEvent('addRival', async (data: any) => {
    const refid = data.refid.trim();
    const profile = await DB.FindOne(data.rivalid, { collection: 'profile' });
    if (profile != undefined && profile != null) {
      const rivals = await DB.FindOne<Rivals>(refid, { collection: 'rivals' }) || { collection: 'rivals', rivals: [] };
      if (rivals.rivals.length < 4) {
        rivals.rivals.push(data.rivalid);
        await DB.Upsert(refid, { collection: 'rivals' }, rivals);
      }
    }
  });

  // Route management for PnM <= 21
  R.Route(`game.get`, async (req, data, send) => getVersion(req).getInfo(req, data, send));
  R.Route(`playerdata.new`, async (req, data, send) => getVersion(req).newPlayer(req, data, send));
  R.Route(`playerdata.conversion`, async (req, data, send) => getVersion(req).newPlayer(req, data, send));
  R.Route(`playerdata.get`, async (req, data, send) => getVersion(req).read(req, data, send));
  R.Route(`playerdata.set`, async (req, data, send) => getVersion(req).write(req, data, send));
  R.Route(`playerdata.friend`, async (req, data, send) => getVersion(req).friend(req, data, send));
  
  R.Route(`playerdata.town`, async (req, data, send) => tunestreet.map(req, data, send));

  // For Pnm >= 22, each game set his own route
  lapistoria.setRoutes();
  eclale.setRoutes();
  usaneko.setRoutes();

  R.Unhandled((req: EamuseInfo, data: any, send: EamuseSend) => {
    console.log(`[popn] unhandled ${req.module}.${req.method}`, data);
    return send.success();
  });
}
