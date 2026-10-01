// @ts-ignore
declare const R: any;
// @ts-ignore
declare const U: any;
// @ts-ignore
declare const CONFIG: any;
// @ts-ignore
declare const console: any;

import { registerEamuseRoutes } from "./handlers/eamuse";
import { registerXifRoutes } from "./handlers/xif";
import { registerMatchingRoutes } from "./handlers/matching";
import { reloadStaticData, vlog } from "./handlers/utils";

export function register(): void {
  R.GameCode("XIF");
  R.Contributor("Ryu7w7");

  try {
    R.Config("XIF_VERBOSE", {
      name: "Verbose Logging",
      desc: "If enabled, per-request debug logs go to console. OFF by default. Errors always show.",
      type: "boolean",
      default: false,
    });
  } catch {}
  try {
    R.Config("XIF_CARDMNG_MODE", {
      name: "CardMNG Mode",
      desc: "compat (default) recovers malformed cardid, strict quarantines",
      type: "string",
      options: ["compat", "strict"],
      default: "compat",
    });
  } catch {}

  try {
    R.Config("XIF_UNLOCK_SONGS", {
      name: "Unlock All Songs",
      desc: "If enabled, usr.get always returns the full song unlock list (1-285 + event songs, all difficulties). Disable for a locked roster.",
      type: "boolean",
      default: true,
    });
  } catch {}

  try {
    R.DataFile("data/musics.json", {
      name: "Song catalog (musics.json)",
      desc: "Optional song/chart catalog. Without it the server boots with an empty list. See README for the CSV-import format.",
    });
  } catch {}
  try {
    R.DataFile("data/gacha.json", {
      name: "Gacha catalog (gacha.json)",
      desc: "Gacha events with probabilities and drawable items (built from GachaEventMaster + CharacterCardMaster).",
    });
  } catch {}
  try {
    R.DataFile("data/events.json", {
      name: "Always-open events (events.json)",
      desc: "Event ids served as open in mst.get_common (shop/ticket/promo/caravan/login-bonus/matching). Built from masters.",
    });
  } catch {}
  try {
    R.DataFile("data/demo.json", {
      name: "Attract demos (demo.json)",
      desc: "Title-screen preview videos (DemoMovieMaster MusicPreview rows).",
    });
  } catch {}
  try {
    R.DataFile("data/shop_goods.json", {
      name: "Shop goods lottery (shop_goods.json)",
      desc: "Continue-lottery goods events rolled in usr.save. Edit weights/stock/names freely.",
    });
  } catch {}

  try { reloadStaticData(); } catch {}
  try { vlog(`[XIF] static data loaded`); } catch {}

  registerEamuseRoutes();
  registerXifRoutes();
  registerMatchingRoutes();

  R.Unhandled(async (info: any, data: any, send: any) => {
    const mod = info.module || "unknown";
    const meth = info.method || "unknown";
    if (["eventlog", "posevent", "pkglist", "netlog", "sidmgr"].includes(mod)) return;
    vlog(`[XIF] Unhandled XRPC ${mod}.${meth} model=${info.model}`);
    // Empty module-shaped element (NOT bare success): the client feeds the
    // <module> child into XmlSerializer, and a missing child throws
    // "Root element is missing" (seen live with pcb.save_error_log).
    // An empty <mod/> deserializes to a default object instead.
    try { await send.object({}); }
    catch { try { await send.success(); } catch {} }
  });
}
