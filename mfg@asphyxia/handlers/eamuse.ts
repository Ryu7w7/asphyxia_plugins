// @ts-ignore
declare const K: any;
// @ts-ignore
declare const DB: any;
// @ts-ignore
declare const U: any;
// @ts-ignore
declare const R: any;
// @ts-ignore
declare const IO: any;
// @ts-ignore
declare const CONFIG: any;
// @ts-ignore
declare const console: any;

import {
  LOCATION_ID,
  FACILITY_NAME,
  COUNTRY,
  REGION,
  HOST,
  PORT,
  CARDMNG_SHADOW_MODULE,
  DEFAULT_CARDID,
  PASELI_BALANCE,
  PASELI_SESSIONS,
  CARD_STORE,
  CARD_STORE_BY_REFID,
  nowUnix,
  newRefid,
  sanitizePin,
  playerIdFromRefid,
  gameBaseUrl,
  ensureProfile,
  vlog,
} from "./utils";

// helpers for cardmng
const CARDID_RE = /^[0-9A-Fa-f]{16}$/;

function isCanonicalCardId(raw: string): boolean {
  if (!raw) return false;
  const s = String(raw).trim().replace(/\s+/g, "");
  return CARDID_RE.test(s);
}

function normalizeCardId(raw: string): string {
  const s = (raw || "").trim().replace(/\s+/g, "").toUpperCase();
  if (CARDID_RE.test(s)) return s;
  try {
    const b = (raw || "").split("").map(c => c.charCodeAt(0));
    // try latin1 8-byte => hex
    // @ts-ignore
    const buf = Buffer.from(raw || "", "latin1");
    if (buf.length === 8) {
      const hx = buf.toString("hex").toUpperCase();
      if (CARDID_RE.test(hx)) return hx;
    }
  } catch { }
  return DEFAULT_CARDID;
}

function extractCardId(sanitized: string): string {
  if (!sanitized) return "";
  if (sanitized.includes("|")) {
    const parts = sanitized.split("|");
    return parts[parts.length - 1] || sanitized;
  }
  return sanitized;
}
function extractRefId(sanitized: string): string {
  if (!sanitized) return "";
  if (sanitized.includes("|")) {
    return sanitized.split("|")[0] || sanitized;
  }
  return sanitized;
}

function cardAttr(data: any, key: string): string {
  try {
    // data is KDataReader converted object, but EamusePlugin passes raw data object with @attr
    // Use lodash get-like fallback
    if (!data) return "";
    if (data["@attr"] && data["@attr"][key] != null) return String(data["@attr"][key]);
    // also check nested 0.@attr
    if (data["0"] && data["0"]["@attr"] && data["0"]["@attr"][key] != null) return String(data["0"]["@attr"][key]);
    // try direct
    if (data[key] != null) {
      const v = data[key];
      if (typeof v === "string") return v;
      if (v && typeof v === "object" && v["@content"] != null) return String(v["@content"]);
      if (v && typeof v === "object" && v["@content"] && Array.isArray(v["@content"])) return String(v["@content"][0]);
    }
    return "";
  } catch { return ""; }
}

// in-memory fallback for cards
function getCardById(cardid: string): any | null {
  return CARD_STORE.get(cardid) || null;
}
function setCard(cardid: string, rec: any): void {
  CARD_STORE.set(cardid, rec);
  // Keep secondary refid index in sync
  if (rec && rec.refid) CARD_STORE_BY_REFID.set(String(rec.refid).toUpperCase(), rec);
}

// Persist card data inside the profile document (the only collection that reliably saves to DB).
// This avoids the issue where the 'cards' collection is silently dropped by Asphyxia.
async function saveCardToProfile(cardid: string, refid: string, rec: any): Promise<void> {
  try {
    const norm = String(refid || "").trim().toUpperCase();
    if (!norm) return;
    const { getProfileByRefid, saveProfile } = await import("./utils");
    const prof: any = await getProfileByRefid(norm);
    if (prof) {
      prof.card_id = String(cardid || "").toUpperCase();
      prof.card_issued = !!rec.issued;
      prof.card_bound = !!rec.bound;
      prof.card_pin = rec.pin || "0000";
      prof.card_updated_at = rec.updated_at || rec.created_at;
      await saveProfile(norm, prof);
    }
  } catch (e) { try { console.error("saveCardToProfile error:", e); } catch {} }
}

// Look up a card record by card_id from the DB via profile documents.
async function loadCardFromDB(cardid: string): Promise<any | null> {
  try {
    const want = String(cardid || "").toUpperCase();
    if (!want) return null;
    // @ts-ignore - ProfileSpace scan: refid=null matches all profiles
    const all: any[] = await DB.Find(null, { collection: "profile" });
    if (!all) return null;
    for (const p of all) {
      if (p && String(p.card_id || "").toUpperCase() === want) {
        const rec: any = {
          collection: "cards",
          card_id: String(cardid).toUpperCase(),
          refid: String(p.refid || "").toUpperCase(),
          issued: !!p.card_issued,
          bound: !!p.card_bound,
          pin: p.card_pin || "0000",
          updated_at: p.card_updated_at || p.updated_at || 0,
          created_at: p.created_at || 0,
        };
        setCard(String(cardid).toUpperCase(), rec);
        return rec;
      }
    }
  } catch (e) { try { console.error("loadCardFromDB error:", e); } catch {} }
  return null;
}

// XRPC handlers
async function handlePcbtracker(info: any, data: any, send: any): Promise<void> {
  await send.object({
    "@attr": {
      expire: 1200,
      status: 0,
      ecenable: 1,
      eclimit: 0,
      limit: 0,
      time: nowUnix(),
    },
  });
}

async function handleMessageGet(info: any, data: any, send: any): Promise<void> {
  await send.object({
    "@attr": {
      expire: 300,
      status: 0,
    },
  });
}

async function handleFacilityGet(info: any, data: any, send: any): Promise<void> {
  const ip = (info as any).ip || HOST;
  const port = (() => {
    try { const v = U.GetConfig('matching_port'); if (v) return Number(v); } catch { }
    try { const v = U.GetConfig('port'); if (v) return Number(v); } catch { }
    try { if (typeof CONFIG !== 'undefined' && (CONFIG as any).matching_port) return Number((CONFIG as any).matching_port); } catch { }
    try { if (typeof CONFIG !== 'undefined' && (CONFIG as any).port) return Number((CONFIG as any).port); } catch { }
    return PORT;
  })();
  // facility response similar to core but using VFG constants
  await send.object({
    location: {
      id: K.ITEM("str", LOCATION_ID),
      country: K.ITEM("str", COUNTRY),
      region: K.ITEM("str", REGION),
      name: K.ITEM("str", FACILITY_NAME),
      type: K.ITEM("u8", 0),
      countryname: K.ITEM("str", "Japan"),
      countryjname: K.ITEM("str", "日本"),
      regionname: K.ITEM("str", "Tokyo"),
      regionjname: K.ITEM("str", "東京都"),
      customercode: K.ITEM("str", "VFG"),
      companycode: K.ITEM("str", "00"),
      latitude: K.ITEM("s32", 0),
      longitude: K.ITEM("s32", 0),
      accuracy: K.ITEM("u8", 0),
    },
    line: {
      id: K.ITEM("str", "0"),
      class: K.ITEM("u8", 1),
    },
    portfw: {
      globalip: K.ITEM("ip4", ip),
      globalport: K.ITEM("u16", port),
      privateport: K.ITEM("u16", port),
    },
    public: {
      flag: K.ITEM("u8", 1),
      name: K.ITEM("str", FACILITY_NAME),
      latitude: K.ITEM("s32", 0),
      longitude: K.ITEM("s32", 0),
    },
    share: {
      eacoin: {
        notchamount: K.ITEM("s32", 0),
        notchcount: K.ITEM("s32", 0),
        supplylimit: K.ITEM("s32", 100000),
      },
      url: {
        eapass: K.ITEM("str", `http://${HOST}:${port}`),
        arcadefan: K.ITEM("str", `http://${HOST}:${port}`),
        konaminetdx: K.ITEM("str", `http://${HOST}:${port}`),
        konamiid: K.ITEM("str", `http://${HOST}:${port}`),
        eagate: K.ITEM("str", `http://${HOST}:${port}`),
      },
    },
  });
}

async function handlePackageList(info: any, data: any, send: any): Promise<void> {
  await send.object({
    "@attr": {
      expire: 600,
      status: 0,
    },
  });
}

async function handlePcbeventPut(info: any, data: any, send: any): Promise<void> {
  await send.success();
}

async function handleEventlogWrite(info: any, data: any, send: any): Promise<void> {
  await send.object({
    gamesession: K.ITEM("s64", BigInt(1)),
    logsendflg: K.ITEM("s32", 0),
    logerrlevel: K.ITEM("s32", 0),
    evtidnosendflg: K.ITEM("s32", 0),
  });
}

// cardmng (with vfgcard shadow)
async function handleCardmng(info: any, data: any, send: any): Promise<void> {
  // data may contain cardid/refid in @attr
  // Extract raw values (handle sanitized "|" form)
  let rawCardId = cardAttr(data, "cardid") || cardAttr(data, "card_id") || "";
  let reqRefid = cardAttr(data, "refid") || "";
  // Handle sanitized form where cardid is "refid|cardid"
  if (rawCardId.includes("|")) {
    const cid = extractCardId(rawCardId);
    const ref = extractRefId(rawCardId);
    // If rawCardId was sanitized, the original cardid is after "|"
    rawCardId = cid;
    if (!reqRefid) reqRefid = ref;
  }
  if (reqRefid.includes("|")) reqRefid = extractRefId(reqRefid);
  reqRefid = (reqRefid || "").trim().toUpperCase();

  // Detect method from info.method (e.g., "inquire")
  const method: string = (info.method || "").toLowerCase();
  const model: string = info.model || "";

  // For decode failure empty <call/> case: cardid missing
  if (!rawCardId && (method === "inquire" || method === "getrefid")) {
    vlog(`[cardmng] ${method} rejected: missing cardid`);
    if (method === "inquire") return send.status(112);
    return send.status(110);
  }
  if ((method === "bindmodel" || method === "bindcard") && !reqRefid) {
    return send.status(110);
  }

  const canonical = isCanonicalCardId(rawCardId);
  // strict mode check via U.GetConfig
  let strict = false;
  try {
    const m = U.GetConfig("VFG_CARDMNG_MODE");
    if (String(m).toLowerCase() === "strict") strict = true;
    // @ts-ignore
    if (process && process.env && process.env.VFG_CARDMNG_MODE === "strict") strict = true;
  } catch { }
  if (!canonical && (method === "inquire" || method === "getrefid")) {
    if (strict) {
      const st = method === "inquire" ? 112 : 110;
      return send.status(st);
    }
    // compat: map malformed to default cardid but log
  }

  const cardid = normalizeCardId(rawCardId);
  vlog(`[cardmng] ${method} rawCardId='${rawCardId}' cardid='${cardid}' reqRefid='${reqRefid}'`);

  // Use in-memory store + also try to persist via DB (plugin DB)
  // For persistence, we also try to load from DB collection "cards"
  let rec: any = null;
  let recByCard: any = null;
  let recByRefid: any = null;

  // Try in-memory first (normalize: card ids uppercase, refids uppercase)
  const cardKey = String(cardid || "").toUpperCase();
  const refKey = String(reqRefid || "").trim().toUpperCase();
  recByCard = getCardById(cardKey) || getCardById(cardid) || null;
  if (refKey) {
    // O(1) lookup via secondary index
    recByRefid = CARD_STORE_BY_REFID.get(refKey) || null;
  }
  rec = refKey ? recByRefid : recByCard;

  // Also try DB if not found in memory — look inside profile documents (cards col doesn't persist)
  if (!recByCard) {
    const dbRec = await loadCardFromDB(cardKey);
    if (dbRec) {
      recByCard = dbRec;
      if (!refKey) rec = dbRec;
    }
  }
  if (refKey && !recByRefid) {
    // Look for profile with this refid and check it has a card
    try {
      const { getProfileByRefid } = await import("./utils");
      const prof: any = await getProfileByRefid(refKey);
      if (prof && prof.card_id) {
        const synth: any = {
          collection: "cards",
          card_id: String(prof.card_id).toUpperCase(),
          refid: String(prof.refid).toUpperCase(),
          issued: !!prof.card_issued,
          bound: !!prof.card_bound,
          pin: prof.card_pin || "0000",
          updated_at: prof.card_updated_at || prof.updated_at || 0,
          created_at: prof.created_at || 0,
        };
        recByRefid = synth;
        setCard(String(prof.card_id).toUpperCase(), synth);
        rec = synth;
      }
    } catch (e) { try { console.error("loadCardByRefid error:", e); } catch {} }
  }

  if (method === "inquire") {
    // check inquire mode
    let inquireMode = "auto";
    try {
      const v = U.GetConfig("VFG_CARDMNG_INQUIRE_MODE");
      if (v) inquireMode = String(v).toLowerCase();
      // @ts-ignore
      if (process && process.env && process.env.VFG_CARDMNG_INQUIRE_MODE) inquireMode = String(process.env.VFG_CARDMNG_INQUIRE_MODE).toLowerCase();
    } catch { }
    if (inquireMode === "new") {
      return send.status(112);
    }
    if (!recByCard || !recByCard.issued) {
      return send.status(112);
    }
    const refid = recByCard.refid;
    const bound = !!recByCard.bound;
    const lastupdate = Math.floor((recByCard.updated_at || recByCard.created_at || nowUnix()));
    // success without status, attrs on element
    await send.object({
      "@attr": {
        binded: bound ? 1 : 0,
        dataid: refid,
        refid: refid,
        newflag: bound ? 0 : 1,
        expired: 0,
        exflag: 0,
        ecflag: 1,
        ...(bound ? { lastupdate } : {}),
      },
    });
    return;
  }

  if (method === "getrefid") {
    // create or update card profile (keys always uppercase)
    const cardKey = String(cardid || "").toUpperCase();
    let existing = getCardById(cardKey);
    if (!existing) {
      // Look up via profile documents instead of 'cards' collection
      existing = await loadCardFromDB(cardKey);
    }
    let refid: string;
    if (existing && existing.refid) {
      refid = String(existing.refid).toUpperCase();
      existing.refid = refid;
      existing.card_id = cardKey;
      existing.issued = true;
      existing.bound = false;
      const passwd = cardAttr(data, "passwd") || "";
      existing.pin = sanitizePin(passwd, existing.pin || "0000");
      existing.updated_at = nowUnix();
      setCard(cardKey, existing);
      await saveCardToProfile(cardKey, refid, existing);
    } else {
      refid = String(newRefid()).toUpperCase();
      const passwd = cardAttr(data, "passwd") || "";
      const recNew: any = {
        collection: "cards",
        card_id: cardKey,
        refid,
        issued: true,
        bound: false,
        pin: sanitizePin(passwd, "0000"),
        created_at: nowUnix(),
        updated_at: nowUnix(),
      };
      setCard(cardKey, recNew);
      // ensure profile exists first, then persist card data inside the profile
      try {
        const { ensureProfile: ep } = await import("./utils");
        await ep(refid, "GUEST");
      } catch { }
      await saveCardToProfile(cardKey, refid, recNew);
    }
    await send.object({
      "@attr": {
        refid,
        dataid: refid,
      },
    });
    return;
  }

  if (method === "authpass") {
    // permissive
    await send.object({ "@attr": { status: 0 } });
    // alternative: send.success();
    return;
  }

  if (method === "bindmodel" || method === "bindcard") {
    if (!rec) {
      return send.status(110);
    }
    rec.issued = true;
    rec.bound = true;
    rec.updated_at = nowUnix();
    rec.refid = String(rec.refid || reqRefid || "").toUpperCase();
    rec.card_id = String(rec.card_id || cardid || "").toUpperCase();
    setCard(rec.card_id, rec);
    // bind profile to gamecode and persist card data inside profile
    // (never touch profile.name here — that belongs to create_player)
    try {
      await ensureProfile(rec.refid, "GUEST");
    } catch { }
    await saveCardToProfile(rec.card_id, rec.refid, rec);
    await send.object({
      "@attr": {
        dataid: rec.refid,
      },
    });
    return;
  }

  if (method === "getdatalist") {
    await send.object({ "@attr": {} });
    return;
  }

  await send.success();
}

// vfgac / vfglog / eacoin
async function handleVfgac(info: any, data: any, send: any): Promise<void> {
  const method = (info.method || "").toLowerCase();
  if (method === "service_list") {
    // Allow custom override like old plugin (mfg_service_url)
    let customUrl: string | null = null;
    try { customUrl = U.GetConfig('mfg_service_url'); } catch { }
    let url: string;
    if (customUrl && String(customUrl).trim() !== '') {
      url = String(customUrl).trim();
      if (!url.endsWith('/')) url += '/';
      // A bare host:port root 404s game endpoints on the CORE port (core
      // only routes /aog/*), while the native :22421 server accepts both
      // root and /aog/. Appending aog/ to a bare root is therefore safe
      // for either backend. (A bare core-port root caused
      // CutinGachaPlayDraw resCb4:ProtocolError/404.)
      try {
        const u = new URL(url);
        if (!u.pathname || u.pathname === '/') url = url + 'aog/';
      } catch { }
    } else {
      // Default: native AOG port with /aog/ path. The native server strips
      // the aog/ prefix, and if it ever failed to bind (port clash) the
      // core integrated router serves the same /aog/ path — one URL that
      // works on both backends, never a bare root that can 404.
      const host = (info as any).host || (info as any).ip || '127.0.0.1';
      let separatePort = (() => {
        try {
          const p = U.GetConfig('mfg_http_port');
          if (p) return Number(p);
        } catch { }
        return 22421;
      })();
      url = `http://${host}:${separatePort}/aog/`;
    }
    // @ts-ignore
    let cfgPort: any = 'n/a';
    try { cfgPort = (typeof CONFIG !== 'undefined' ? (CONFIG as any).port : U.GetConfig('port')); } catch { }
    vlog(`[VFG] vfgac.service_list host=${(info as any).host} port=${(info as any).port} cfgPort=${cfgPort} -> url=${url} model=${info.model} ip=${info.ip}`);
    await send.object({
      service_url: K.ITEM("str", url),
      services: {
        item: [
          { "@attr": { service: "front", mode: "operation" }, "@content": url },
          { "@attr": { service: "game", mode: "operation" }, "@content": url },
        ],
      },
    });
    return;
  }
  if (method === "update_refer" || method === "ext_campaign" || method === "send_paylog") {
    await send.success();
    return;
  }
  await send.success();
}

async function handleVfglog(info: any, data: any, send: any): Promise<void> {
  const method = (info.method || "").toLowerCase();
  if (method === "put_msg") {
    try {
      // data may contain msg elements: could be array or single
      const msgs: any[] = [];
      if (data && data.msg) {
        if (Array.isArray(data.msg)) msgs.push(...data.msg);
        else msgs.push(data.msg);
      } else if (data && (data as any)["0"] && (data as any)["0"].msg) {
        const m = (data as any)["0"].msg;
        if (Array.isArray(m)) msgs.push(...m);
        else msgs.push(m);
      }
      for (const m of msgs) {
        let label = "";
        let value = "";
        if (m && m["@attr"] && m["@attr"].label) label = String(m["@attr"].label);
        else if (m && (m as any).label) label = String((m as any).label);
        if (m && m["@content"] != null) {
          const c = m["@content"];
          if (typeof c === "string") value = c;
          else if (Array.isArray(c)) value = String(c[0] || "");
          else value = String(c);
        } else if (typeof m === "string") value = m;
        else if (m && typeof m === "object" && m["@content"] == null && typeof m["label"] === "undefined") {
          // try get text
          value = JSON.stringify(m).slice(0, 500);
        }
        if (label === "network_error") {
          // @ts-ignore
          console.error(`[client] network_error: ${value}`);
        } else if (value || label !== "?") {
          vlog(`[client] ${label}: ${String(value).slice(0, 500)}`);
        }
      }
    } catch { }
  }
  await send.success();
}

async function handleEacoin(info: any, data: any, send: any): Promise<void> {
  const method = (info.method || "").toLowerCase();
  const getChild = (key: string): string => {
    return cardAttr(data, key) || "";
  };
  const shortSess = (s: string) => String(s || "").slice(0, 8) + "...";
  vlog(`[eacoin] ${method} sess=${shortSess(getChild("sessid"))} payment=${getChild("payment") || 0}`);
  if (method === "checkin" || method === "opcheckin") {
    // generate sessid
    const sess = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    PASELI_SESSIONS.set(sess, PASELI_BALANCE);
    vlog(`[eacoin] ${method} -> new sess=${shortSess(sess)} balance=${PASELI_BALANCE}`);
    if (method === "opcheckin") {
      await send.object({ sessid: K.ITEM("str", sess) });
      return;
    }
    await send.object({
      sequence: K.ITEM("s16", 0),
      acstatus: K.ITEM("u8", 0),
      acid: K.ITEM("str", "LOCAL"),
      acname: K.ITEM("str", FACILITY_NAME),
      balance: K.ITEM("s32", PASELI_BALANCE),
      sessid: K.ITEM("str", sess),
    });
    return;
  }
  if (method === "consume") {
    const sess = getChild("sessid");
    let payment = 0;
    try {
      payment = parseInt(getChild("payment") || "0", 10) || 0;
    } catch { payment = 0; }
    let balance = PASELI_SESSIONS.get(sess);
    if (balance == null) balance = PASELI_BALANCE;
    balance = balance - payment;
    if (balance < 0) balance = 0;
    PASELI_SESSIONS.set(sess, balance);
    vlog(`[eacoin] consume sess=${shortSess(sess)} paid=${payment} new_balance=${balance}`);
    await send.object({
      acstatus: K.ITEM("u8", 0),
      autocharge: K.ITEM("u8", 0),
      balance: K.ITEM("s32", balance),
    });
    return;
  }
  if (method === "getbalance") {
    const sess = getChild("sessid");
    let balance = PASELI_SESSIONS.get(sess);
    if (balance == null) balance = PASELI_BALANCE;
    await send.object({
      acstatus: K.ITEM("u8", 0),
      balance: K.ITEM("s32", balance),
    });
    return;
  }
  if (method === "checkout") {
    const sess = getChild("sessid");
    PASELI_SESSIONS.delete(sess);
    await send.success();
    return;
  }
  if (method === "getlog" || method === "getoplog" || method === "getcampaign") {
    // need <topic><sumdate __type="str">0</sumdate></topic>
    await send.object({
      topic: {
        sumdate: K.ITEM("str", "0"),
      },
    });
    return;
  }
  await send.success();
}

// XRPC route wrapper: entry/exit through vlog so payment (eacoin) and all
// other XRPC traffic is visible with VFG_VERBOSE (core doesn't log these).
function xroute(method: string, handler: (info: any, data: any, send: any) => Promise<any>): void {
  const wrapped = async (info: any, data: any, send: any) => {
    const t0 = Date.now();
    try { vlog(`[VFG] XRPC ${method} model=${info?.model || ""}`); } catch { }
    try {
      await handler(info, data, send);
    } catch (e) {
      try { console.error(`[VFG] XRPC ${method} handler threw: ${e}`); } catch { }
      throw e;
    } finally {
      try { vlog(`[VFG] XRPC ${method} done ${Date.now() - t0}ms`); } catch { }
    }
  };
  R.Route(method, wrapped);
}

// register
export function registerEamuseRoutes(): void {
  // pcbtracker
  xroute("pcbtracker.alive", handlePcbtracker);
  xroute("pcbtracker.keepalive", handlePcbtracker);

  // message
  xroute("message.get", handleMessageGet);

  // facility
  xroute("facility.get", handleFacilityGet);

  // package
  xroute("package.list", handlePackageList);

  // pcbevent
  xroute("pcbevent.put", handlePcbeventPut);

  // eventlog
  xroute("eventlog.write", handleEventlogWrite);

  // cardmng + shadow
  const cardMethods = ["inquire", "getrefid", "authpass", "bindmodel", "bindcard", "getdatalist"];
  for (const m of cardMethods) {
    xroute(`cardmng.${m}`, handleCardmng);
    xroute(`${CARDMNG_SHADOW_MODULE}.${m}`, handleCardmng);
  }

  // vfgac
  xroute("vfgac.service_list", handleVfgac);
  xroute("vfgac.update_refer", handleVfgac);
  xroute("vfgac.ext_campaign", handleVfgac);
  xroute("vfgac.send_paylog", handleVfgac);

  // vfglog
  xroute("vfglog.put_msg", handleVfglog);
  // also generic vfglog handler for any method
  xroute("vfglog.put", handleVfglog);

  // eacoin
  const eacoinMethods = ["checkin", "opcheckin", "consume", "getbalance", "checkout", "getlog", "getoplog", "getcampaign"];
  for (const m of eacoinMethods) {
    xroute(`eacoin.${m}`, handleEacoin);
  }

  // generic fallbacks for other modules (posevent, pkglist, userdata, userid, sidmgr, netlog, etc.)
  const genericModules = ["posevent", "pkglist", "userdata", "userid", "sidmgr", "netlog", "local", "local2"];
  for (const mod of genericModules) {
    xroute(`${mod}.get`, async (info: any, data: any, send: any) => send.success());
    xroute(`${mod}.put`, async (info: any, data: any, send: any) => send.success());
    xroute(`${mod}.write`, async (info: any, data: any, send: any) => send.success());
  }
}
