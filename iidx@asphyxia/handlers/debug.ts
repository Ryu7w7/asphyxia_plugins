import { GetVersion } from "../util";

// request/response of these get dumped when ArenaDebugLog is enabled, every other request only logs its name //
const ARENA_METHODS = ["lobby.", "music.arenaCPU", "gameSystem.systemInfo", "pc.save", "music.reg"];
// these payloads are huge, only keep arena related nodes //
const PICK_ARENA = ["gameSystem.systemInfo", "pc.save"];
const MAX_LOG = 4000;

function dump(obj: any) {
  let str: string;
  try {
    str = JSON.stringify(obj, (k, v) => typeof v === "bigint" ? `${v}n` : v);
  } catch {
    str = String(obj);
  }

  return str.length > MAX_LOG ? `${str.slice(0, MAX_LOG)}... (${str.length} chars)` : str;
}

function pickArena(obj: any) {
  if (_.isNil(obj) || typeof obj != "object") return obj;

  const keys = Object.keys(obj).filter(k => k == "@attr" || k.startsWith("arena") || k.startsWith("maching"));
  return _.pick(obj, keys);
}

export function withArenaDebug(method: string, handler: EPR): EPR {
  const isArena = ARENA_METHODS.some(m => method.startsWith(m));
  const isPick = PICK_ARENA.includes(method);

  return async (info, data, send) => {
    if (!U.GetConfig("ArenaDebugLog")) return handler(info, data, send);

    const tag = `[arena-debug] [${GetVersion(info)}] ${info.module}.${info.method}`;
    if (!isArena) {
      console.log(tag);
      return handler(info, data, send);
    }

    console.log(`${tag} req: ${dump(isPick ? pickArena(data) : data)}`);
    const logged: EamuseSend = {
      success: (opt) => { console.log(`${tag} res: success`); return send.success(opt); },
      deny: (opt) => { console.log(`${tag} res: deny`); return send.deny(opt); },
      status: (code, opt) => { console.log(`${tag} res: status ${code}`); return send.status(code, opt); },
      object: (res, opt) => { console.log(`${tag} res: ${dump(isPick ? pickArena(res) : res)}`); return send.object(res, opt); },
      xml: (res, d, opt) => send.xml(res, d, opt),
      pug: (res, d, opt) => send.pug(res, d, opt),
      xmlFile: (file, d, opt) => send.xmlFile(file, d, opt),
      pugFile: (file, d, opt) => { console.log(`${tag} res: ${file}`); return send.pugFile(file, d, opt); },
    };

    return handler(info, data, logged);
  };
}
