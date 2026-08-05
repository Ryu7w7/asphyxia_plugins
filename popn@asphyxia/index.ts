import * as tunestreet from "./handler/tunestreet";
import * as fantasia from "./handler/fantasia";
import * as sunny from "./handler/sunny";
import * as lapistoria from "./handler/lapistoria";
import * as eclale from "./handler/eclale";
import * as usaneko from "./handler/usaneko";
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

  // M39 rejects CORE's default `<item/>` response for message.get because
  // its message receiver requires every item to have a `name` attribute.
  // An empty message list is represented by an empty `message` node instead.
  R.Route(`message.get`, async (_req, _data, send) => {
    return send.object({
      message: K.ATTR({ expire: "300", status: "0" }),
    });
  });

  // High Cheers asks for local3 after card registration. CORE v1.60b does not
  // advertise this newer service, so the game aborts before it can issue the
  // request. Advertise it only for the M39 family; unsupported local3
  // requests receive the plugin's standard empty success response.
  R.ExtraModuleHandler((model) =>
    model.startsWith('M39') ? ['local3'] : []
  );

  R.WebUIEvent('updatePnmPlayerInfo', async (data: any) => {
    await DB.Update(data.refid, { collection: 'profile' }, { $set: { name: data.name } });
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

  R.Unhandled((_req: EamuseInfo, _data: any, send: EamuseSend) => {
    return send.success();
  });
}
