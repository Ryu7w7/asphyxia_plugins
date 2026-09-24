// @ts-ignore
declare const R: any;
// @ts-ignore
declare const U: any;
// @ts-ignore
declare const CONFIG: any;
// @ts-ignore
declare const console: any;
declare const require: any;
declare const Buffer: any;

import { registerEamuseRoutes } from "./handlers/eamuse";
import { registerAogRoutes, AOG_HANDLER_MAP } from "./handlers/aog";

export function register(): void {
  R.GameCode("VFG");
  R.Contributor("Ryu7w7");

  try {
    R.Config("VFG_EVENT_TAKU", {
      name: "Event Taku Set",
      desc: "VFG_EVENT_TAKU picks event table set: min (default, 3 panels), off (no event tables), all (12 panels - will break UI)",
      type: "string",
      options: ["min", "off", "all"],
      default: "min",
    });
  } catch {}
  try {
    R.Config("VFG_GACHA_ALL", {
      name: "Advertise All Gacha Series",
      desc: "If enabled, advertise every gacha series in catalog instead of curated set",
      type: "boolean",
      default: false,
    });
  } catch {}
  try {
    R.Config("VFG_CARDMNG_MODE", {
      name: "CardMNG Mode",
      desc: "compat (default) recovers malformed cardid, strict quarantines",
      type: "string",
      options: ["compat", "strict"],
      default: "compat",
    });
  } catch {}
  try {
    R.Config("mfg_service_url", {
      name: "MFG Service URL (AOG)",
      desc: "Override AOG URL returned by vfgac.service_list. Default: http://<host>:22421/ (separate port). Set to http://<host>:<port>/aog for integrated.",
      type: "string",
      default: "",
    });
  } catch {}
  try {
    R.Config("mfg_http_port", {
      name: "MFG HTTP Port (native)",
      desc: "Port for separate AOG HTTP server (when mfg_service_url is empty). Default 22421.",
      type: "integer",
      default: 22421,
    });
  } catch {}

  registerEamuseRoutes();
  registerAogRoutes();

  // Start separate native HTTP server on 22421 (like old mfg@asphyxia_bk) for AOG
  try {
    const http = require('http');
    const HTTP_PORT = (() => {
      try { const v = U.GetConfig('mfg_http_port'); if (v) return Number(v); } catch {}
      return 22421;
    })();

    function parseFormNative(body: string): Record<string,string> {
      const out: Record<string,string> = {};
      try {
        const p = new URLSearchParams(body);
        for (const [k,v] of p.entries()) out[k]=v;
      } catch {}
      return out;
    }
    function gameApiNameNative(path: string): string {
      let p = path.split('?')[0].replace(/^\/+/, '');
      if (p.startsWith('aog/')) p = p.slice(4);
      p = p.split('/').pop() || '';
      return p.trim();
    }
    // Wrap to match AOG handler signature (form, ctx) where ctx.res is http.ServerResponse with .set and .send
    function adaptRes(nativeRes: any): any {
      return {
        set: (k: string, v: string) => { try { nativeRes.setHeader(k, v); } catch {} },
        send: (body: string) => {
          try {
            if (!nativeRes.headersSent) nativeRes.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
            nativeRes.end(body);
          } catch {}
        },
      };
    }

    const server = http.createServer((req: any, res: any) => {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk.toString(); });
      req.on('end', async () => {
        const url = (req.url || '/').split('?')[0];
        const clean = url.replace(/\/\//g, '/');
        const params = parseFormNative(body);
        try {
          const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
          for (const [k,v] of u.searchParams.entries()) if (!(k in params)) params[k]=v;
        } catch {}
        const name = gameApiNameNative(clean);
        // Also handle root / case where name is empty but body may contain action? Treat as appli_boot if no name?
        let handlerName = name;
        if (!handlerName) {
          // Try to infer from body keys? For now keep empty
        }
        const ctx = { req, res: adaptRes(res), form: params, name: handlerName, url: clean };
        try { console.log(`[VFG-NATIVE] ${req.method} ${clean} name=${handlerName} keys=${Object.keys(params).join(',')}`); } catch {}
        let handler: any = (AOG_HANDLER_MAP as any)[handlerName];
        if (handler) {
          try { await handler(params, ctx); return; } catch (e) { console.log(`[VFG-NATIVE] handler error ${handlerName}: ${e}`); }
        }
        // Try fallback via registry if not found in map (e.g., integrated handlers)
        try {
          const reg = require('../../src/aog/AogRegistry');
          const regHandler = reg.getAogHandler(handlerName);
          if (regHandler) { await regHandler(params, ctx); return; }
          const fb = reg.getAogFallback();
          if (fb) { try { await fb(params, ctx); return; } catch {} try { await fb(ctx); return; } catch {} }
        } catch {}
        // Also try absolute path for dist
        try {
          const reg2 = require('../../../src/aog/AogRegistry');
          const regHandler2 = reg2.getAogHandler(handlerName);
          if (regHandler2) { await regHandler2(params, ctx); return; }
        } catch {}
        console.log(`[VFG-NATIVE] Unhandled ${clean} name=${handlerName} -> empty success`);
        try {
          const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<root><serv_st><code>0</code></serv_st></root>`;
          if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
          res.end(xml);
        } catch {}
      });
    });
    server.listen(HTTP_PORT, '0.0.0.0', () => {
      console.log(`[VFG] Native AOG HTTP Server listening on 0.0.0.0:${HTTP_PORT} (for service_url http://<host>:${HTTP_PORT}/)`);
    });
    server.on('error', (err: any) => {
      if (err && err.code === 'EADDRINUSE') console.log(`[VFG] Native HTTP port ${HTTP_PORT} in use`);
      else console.log(`[VFG] Native HTTP error: ${err}`);
    });
  } catch (e) {
    console.log(`[VFG] Failed to start native HTTP server: ${e}`);
  }

  R.Unhandled(async (info: any, data: any, send: any) => {
    const mod = info.module || "unknown";
    const meth = info.method || "unknown";
    if (["eventlog", "posevent", "pkglist", "netlog", "sidmgr"].includes(mod)) return;
    console.log(`[VFG] Unhandled XRPC ${mod}.${meth} model=${info.model}`);
    try { await send.success(); } catch {}
  });

  try {
    R.AogUnhandled(async (ctx: any) => {
      const name = ctx?.name || ctx?.url || "unknown";
      console.log(`[VFG] Unhandled AOG ${name}`);
      try {
        ctx.res.set("Content-Type", "text/xml; charset=utf-8");
        ctx.res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<root><serv_st><code>0</code></serv_st></root>`);
      } catch {}
    });
  } catch {}
}
