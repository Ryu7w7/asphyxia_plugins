// @ts-ignore
declare const console: any;
declare const require: any;
declare const Buffer: any;

/*
 * SdvxRelayManager — Global TCP/UDP relay for SDVX P2P matches.
 *
 * Confirmed game ports (from ZeroTier firewall analysis):
 *   TCP 5700  → CP2PTcpSystem  (match battle state)
 *   UDP 5854  → CP2PUdpSystem  (real-time game data)
 *
 * Architecture (single global relay, session-mux by token):
 *   1. features.ts creates a room → calls relay.registerSession(token) → allocates session slot.
 *   2. HOST polls entry_s → features.ts returns relay_ip:5700 as "opponent".
 *      sdvxrelay.dll reads relay_tcp_port=5700 from INI, connects TCP tunnel to relay_ip:5700
 *      and redirects UDP to relay_ip:5854.
 *   3. JOINER calls entry_s → features.ts links the joiner to the session, returns relay_ip:5700.
 *      JOINER game connects TCP to relay_ip:5700 and sends UDP to relay_ip:5854 directly.
 *   4. Relay receives two TCP connections → pairs them (matched by session token handshake or IP).
 *   5. Relay receives two UDP streams → routes by source IP to paired peer.
 *
 * Required open ports on the SERVER:
 *   TCP 5700   (or custom tcp port)
 *   UDP 5854   (or custom udp port)
 *
 * CGNAT support: clients send a 4-byte session token as the FIRST bytes of the TCP connection
 * so the relay can pair them even if multiple users share the same WAN IP.
 * sdvxrelay.dll must be updated to prepend this token (see DLL notes).
 */

// ---- KFC frame helpers --------------------------------------------------

function kermitCrc16(buf: any, len: number): number {
  let crc = 0xffff;
  for (let i = 0; i < len; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >> 1) ^ 0x8408 : crc >> 1;
    }
  }
  return (crc ^ 0xffff) & 0xffff;
}

function buildHello(ipOctets: number[]): any {
  const b = Buffer.alloc(26);
  b[0] = 0x4b; b[1] = 0x46; b[2] = 0x43; b[3] = 0x20; // "KFC "
  b[4] = 0x00; b[5] = 0x1a;
  b[6] = 0x00; b[7] = 0x00;   // CRC placeholder
  b[8]  = ipOctets[0]; b[9]  = ipOctets[1];
  b[10] = ipOctets[2]; b[11] = ipOctets[3];
  b[12] = 0; b[13] = 0; b[14] = 0; b[15] = 0;
  b[16] = 0x01;                // type 01 hello
  b[17] = 0x00; b[18] = 0x00; b[19] = 0x04; // host role
  b[20] = 0; b[21] = 0; b[22] = 0; b[23] = 0; b[24] = 0; b[25] = 0;
  const crc = kermitCrc16(b, 26);
  b[6] = (crc >> 8) & 0xff;
  b[7] =  crc       & 0xff;
  return b;
}

// ---- Session types ------------------------------------------------------

const TOKEN_MAGIC = 0x5358564d; // "SVXM" — first 4 bytes sent by DLL to identify session

interface TcpSlot { socket: any; ip: string; key: string; }
interface UdpSlot { address: string; port: number; }

/**
 * One relay session = one match pair (host + joiner).
 * Identified by a 32-bit token assigned by features.ts when the room is created.
 */
interface RelaySession {
  token: number;
  tcp:   (TcpSlot | null)[];   // [0]=host, [1]=joiner
  udp:   (UdpSlot | null)[];
  tcpBuf: any[][];
  udpBuf: any[][];
  lastActivity: number;
  helloTimer:   any;
}

// ---- Manager ------------------------------------------------------------

export class SdvxRelayManager {
  private static _inst: SdvxRelayManager | null = null;

  // Global servers (shared across all sessions)
  private tcpServer: any   = null;
  private udpSocket: any   = null;

  // Active sessions keyed by token
  private sessions: Map<number, RelaySession> = new Map();
  // Pending connections that haven't sent their token yet: socket → buffer
  private pendingTcp: Map<any, { buf: any; ip: string }> = new Map();
  // UDP: source-ip:port → session token (built when UDP arrives from known IPs)
  private udpIpToToken: Map<string, number> = new Map();

  private publicIp  = '127.0.0.1';
  private tcpPort   = 5700;
  private udpPort   = 5854;
  private idleMs    = 300_000;
  private verbose   = false;
  private running   = false;
  private nextToken = 1;

  private constructor() {
    setInterval(() => this._sweep(), 60_000);
  }

  static getInstance(): SdvxRelayManager {
    if (!SdvxRelayManager._inst) SdvxRelayManager._inst = new SdvxRelayManager();
    return SdvxRelayManager._inst;
  }

  configure(ip: string, tcpPort: number, udpPort: number, verbose = false) {
    this.publicIp = ip;
    this.tcpPort  = tcpPort;
    this.udpPort  = udpPort;
    this.verbose  = verbose;
  }

  getPublicIp()  { return this.publicIp; }
  getTcpPort()   { return this.tcpPort;  }
  getUdpPort()   { return this.udpPort;  }

  // ---- Lifecycle ---------------------------------------------------------

  async start(): Promise<void> {
    if (this.running) return;
    let net: any, dgram: any;
    try { net   = require('net');   } catch { console.log('[SDVX Relay] node:net unavailable'); return; }
    try { dgram = require('dgram'); } catch { console.log('[SDVX Relay] node:dgram unavailable'); return; }

    await new Promise<void>((resolve, reject) => {
      const srv = net.createServer();
      srv.once('error', reject);
      srv.listen(this.tcpPort, '0.0.0.0', () => {
        this.tcpServer = srv;
        srv.on('error', (e: any) => console.log(`[SDVX Relay] TCP error: ${e.message}`));
        srv.on('connection', (sock: any) => this._onTcpConnect(sock));
        console.log(`[SDVX Relay] TCP listening on port ${this.tcpPort}`);
        resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      const udp = dgram.createSocket('udp4');
      udp.once('error', reject);
      udp.bind(this.udpPort, '0.0.0.0', () => {
        this.udpSocket = udp;
        udp.on('error', (e: any) => console.log(`[SDVX Relay] UDP error: ${e.message}`));
        udp.on('message', (msg: any, rinfo: any) => this._onUdp(msg, rinfo));
        console.log(`[SDVX Relay] UDP listening on port ${this.udpPort}`);
        resolve();
      });
    });

    this.running = true;
    console.log(`[SDVX Relay] Started — public=${this.publicIp}, tcp=${this.tcpPort}, udp=${this.udpPort}`);
  }

  stop() {
    for (const [token] of this.sessions) this._releaseSession(token);
    try { this.tcpServer && this.tcpServer.close(); } catch {}
    try { this.udpSocket && this.udpSocket.close(); } catch {}
    this.running = false;
  }

  // ---- Session management (called by features.ts) -----------------------

  /**
   * Register a session for an upcoming match.
   * Returns a 32-bit token that must be communicated to both players
   * (embedded in entry_s response and written to sdvxrelay.ini by the DLL).
   */
  registerSession(): number {
    const token = this.nextToken++;
    if (this.nextToken > 0x7fffffff) this.nextToken = 1;

    const sess: RelaySession = {
      token,
      tcp:   [null, null],
      udp:   [null, null],
      tcpBuf: [[], []],
      udpBuf: [[], []],
      lastActivity: Date.now(),
      helloTimer:   null,
    };
    this.sessions.set(token, sess);
    console.log(`[SDVX Relay] Session ${token} registered`);
    return token;
  }

  /**
   * Register the joiner's WAN IP so UDP can be routed without a token
   * (the game sends UDP without the token preamble).
   * Called by features.ts when the joiner joins a room.
   */
  linkJoinerIp(token: number, joinerWanIp: string) {
    const sess = this.sessions.get(token);
    if (!sess) return;
    // Pre-register IP → token mapping for UDP routing
    this.udpIpToToken.set(joinerWanIp, token);
  }

  releaseSession(token: number) {
    this._releaseSession(token);
  }

  private _releaseSession(token: number) {
    const s = this.sessions.get(token);
    if (!s) return;
    if (s.helloTimer) { clearInterval(s.helloTimer); s.helloTimer = null; }
    for (const c of s.tcp) { try { c && c.socket.destroy(); } catch {} }
    // Clean up UDP IP mappings
    for (const [ip, t] of this.udpIpToToken) { if (t === token) this.udpIpToToken.delete(ip); }
    this.sessions.delete(token);
    console.log(`[SDVX Relay] Session ${token} released`);
  }

  // ---- TCP handler -------------------------------------------------------

  private _normIp(a: string) { return (a || '').replace(/^::ffff:/, ''); }

  private _onTcpConnect(sock: any) {
    const ip  = this._normIp(sock.remoteAddress || '');
    console.log(`[SDVX Relay] TCP connection from ${ip}:${sock.remotePort}`);

    sock.setNoDelay(true);
    sock.setKeepAlive(true, 5000);

    // Wait for 4-byte token header from DLL
    const pending = { buf: Buffer.alloc(0), ip };
    this.pendingTcp.set(sock, pending);

    const onData = (data: any) => {
      pending.buf = Buffer.concat([pending.buf, data]);
      if (pending.buf.length < 4) return; // wait for full token

      sock.removeListener('data', onData);
      this.pendingTcp.delete(sock);

      const token = pending.buf.readUInt32LE(0);
      const rest  = pending.buf.slice(4); // any game data that followed the token

      const sess = this.sessions.get(token);
      if (!sess) {
        console.log(`[SDVX Relay] TCP from ${ip}: unknown token ${token}, disconnecting`);
        sock.destroy();
        return;
      }

      // Assign slot
      let idx = sess.tcp[0] ? 1 : 0;
      if (sess.tcp[idx]) {
        console.log(`[SDVX Relay] Session ${token}: both slots full, rejecting ${ip}`);
        sock.destroy();
        return;
      }

      sess.tcp[idx] = { socket: sock, ip, key: `${ip}:${sock.remotePort}` };
      sess.lastActivity = Date.now();
      // Pre-register UDP routing by WAN IP
      this.udpIpToToken.set(ip, token);
      console.log(`[SDVX Relay] Session ${token}: TCP P${idx} assigned to ${ip}`);

      // If both slots filled → flush buffers
      if (sess.tcp[0] && sess.tcp[1]) {
        if (sess.helloTimer) { clearInterval(sess.helloTimer); sess.helloTimer = null; }
        const flush = (buf: any[], target: any) => { for (const b of buf) { try { target.write(b); } catch {} } buf.length = 0; };
        flush(sess.tcpBuf[0], sess.tcp[0].socket);
        flush(sess.tcpBuf[1], sess.tcp[1].socket);
        console.log(`[SDVX Relay] Session ${token}: both players connected, bridging`);
      } else {
        // Send keepalive hellos to joiner while waiting for host
        if (idx === 1) {
          const hello = buildHello(this.publicIp.split('.').map(Number));
          let ticks = 0;
          sess.helloTimer = setInterval(() => {
            ticks++;
            if (sess.tcp[0] || ticks > 6) { clearInterval(sess.helloTimer); sess.helloTimer = null; return; }
            try { sock.write(hello); } catch {}
          }, 5000);
        }
      }

      // Replay any game data that arrived after the 4-byte token
      if (rest.length > 0) _forwardTcp(rest, sess, idx);

      sock.on('data', (d: any) => {
        sess.lastActivity = Date.now();
        _forwardTcp(d, sess, idx);
      });
      sock.on('close', () => {
        if (this.verbose) console.log(`[SDVX Relay] Session ${token}: TCP P${idx} disconnected`);
        if (sess.tcp[idx]?.socket === sock) sess.tcp[idx] = null;
      });
      sock.on('error', () => {
        if (sess.tcp[idx]?.socket === sock) sess.tcp[idx] = null;
      });
    };

    sock.on('data', onData);
    sock.on('error', () => { this.pendingTcp.delete(sock); });
    sock.on('close', () => { this.pendingTcp.delete(sock); });

    // If the client doesn't send a token within 5s, disconnect
    setTimeout(() => {
      if (this.pendingTcp.has(sock)) {
        console.log(`[SDVX Relay] TCP from ${ip}: no token within 5s, disconnecting`);
        this.pendingTcp.delete(sock);
        sock.destroy();
      }
    }, 5000);
  }

  // ---- UDP handler -------------------------------------------------------

  private _onUdp(msg: any, rinfo: any) {
    const ip      = rinfo.address;
    const srcPort = rinfo.port;
    const srcKey  = `${ip}:${srcPort}`;

    // Find session for this IP
    const token = this.udpIpToToken.get(ip);
    if (token === undefined) {
      if (this.verbose) console.log(`[SDVX Relay] UDP from ${ip}: no session, dropping`);
      return;
    }
    const sess = this.sessions.get(token);
    if (!sess) { this.udpIpToToken.delete(ip); return; }

    sess.lastActivity = Date.now();

    // Register or find UDP slot
    let idx = -1;
    for (let i = 0; i < 2; i++) {
      const p = sess.udp[i];
      if (p && `${p.address}:${p.port}` === srcKey) { idx = i; break; }
    }
    if (idx === -1) {
      for (let i = 0; i < 2; i++) {
        if (!sess.udp[i]) {
          sess.udp[i] = { address: ip, port: srcPort };
          idx = i;
          if (this.verbose) console.log(`[SDVX Relay] Session ${token}: UDP P${i} from ${ip}:${srcPort}`);
          break;
        }
      }
    }
    if (idx === -1) { sess.udp[1] = { address: ip, port: srcPort }; idx = 1; }

    const other = sess.udp[1 - idx];
    if (other) {
      for (const b of sess.udpBuf[1 - idx]) { try { this.udpSocket.send(b, other.port, other.address); } catch {} }
      sess.udpBuf[1 - idx] = [];
      try { this.udpSocket.send(msg, other.port, other.address); } catch {}
    } else {
      const buf = sess.udpBuf[1 - idx];
      if (buf.length < 500) buf.push(Buffer.from(msg));
    }
  }

  // ---- Idle sweep --------------------------------------------------------
  private _sweep() {
    const now = Date.now();
    for (const [token, sess] of this.sessions) {
      if (now - sess.lastActivity > this.idleMs) {
        console.log(`[SDVX Relay] Session ${token} idle timeout`);
        this._releaseSession(token);
      }
    }
  }
}

function _forwardTcp(data: any, sess: RelaySession, fromIdx: number) {
  const peer = sess.tcp[1 - fromIdx];
  if (peer) {
    try { peer.socket.write(data); } catch {}
  } else {
    const buf = sess.tcpBuf[1 - fromIdx];
    const total: number = buf.reduce((n: number, b: any) => n + b.length, 0);
    if (total < 524288) buf.push(Buffer.from(data));
  }
}

interface RelaySession {
  token: number;
  tcp:   (TcpSlot | null)[];
  udp:   (UdpSlot | null)[];
  tcpBuf: any[][];
  udpBuf: any[][];
  lastActivity: number;
  helloTimer:   any;
}
