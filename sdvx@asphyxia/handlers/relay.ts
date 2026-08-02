import * as dgram from 'dgram';
import * as net from 'net';

interface RelaySession {
  port: number;
  tcpServer: net.Server;
  udpSocket: dgram.Socket;
  tcpConns: (net.Socket | null)[];
  udpClients: ({ address: string; port: number } | null)[];
  tcpBuf: Buffer[][];
  udpBuf: Buffer[][];
  lastActivity: number;
}

// TCP+UDP bridge per port. Both players connect OUT to the same port on this
// server (CGNAT-friendly), and the two most recent connections are paired.
// - TCP: battle state packets (CP2PTcpSystem)
// - UDP: chat packets (CP2PUdpSystem)
export class SdvxRelayManager {
  private static instance: SdvxRelayManager;
  private sessions: Map<number, RelaySession> = new Map();
  private portRange: { min: number; max: number } = { min: 50000, max: 50100 };
  private publicIp: string = '127.0.0.1';
  private idleTimeout: number = 1800000; // 30 minutes without traffic
  private verbose: boolean = false;

  private constructor() {
    setInterval(() => this.cleanup(), 60000);
  }

  public static getInstance(): SdvxRelayManager {
    if (!SdvxRelayManager.instance) {
      SdvxRelayManager.instance = new SdvxRelayManager();
    }
    return SdvxRelayManager.instance;
  }

  public setConfig(publicIp: string, range: string, verbose: boolean = false) {
    this.publicIp = publicIp;
    this.verbose = verbose;
    const [min, max] = range.split('-').map(Number);
    if (min && max) {
      this.portRange = { min, max };
    }
  }

  public getPublicIp(): string {
    return this.publicIp;
  }

  public async allocatePort(): Promise<number | null> {
    for (let port = this.portRange.min; port <= this.portRange.max; port++) {
      if (!this.sessions.has(port)) {
        try {
          const session = await this.createSession(port);
          this.sessions.set(port, session);
          console.log(`[SDVX Relay] Session started on port ${port}`);
          return port;
        } catch (e: any) {
          console.error(`[SDVX Relay] Failed to bind port ${port}: ${e.message}`);
        }
      }
    }
    console.warn(`[SDVX Relay] No free ports in range ${this.portRange.min}-${this.portRange.max}`);
    return null;
  }

  public releasePort(port: number) {
    const session = this.sessions.get(port);
    if (session) {
      for (const c of session.tcpConns) {
        try { c && c.destroy(); } catch (e) {}
      }
      try { session.tcpServer.close(); } catch (e) {}
      try { session.udpSocket.close(); } catch (e) {}
      this.sessions.delete(port);
      console.log(`[SDVX Relay] Released port ${port}`);
    }
  }

  private createSession(port: number): Promise<RelaySession> {
    return new Promise((resolve, reject) => {
      const session: RelaySession = {
        port,
        tcpServer: undefined as any,
        udpSocket: undefined as any,
        tcpConns: [null, null],
        udpClients: [null, null],
        tcpBuf: [[], []],
        udpBuf: [[], []],
        lastActivity: Date.now(),
      };

      const tcpServer = net.createServer();
      const udpSocket = dgram.createSocket('udp4');
      session.tcpServer = tcpServer;
      session.udpSocket = udpSocket;

      let boundTcp = false;
      let boundUdp = false;
      let settled = false;

      const finish = () => {
        if (!settled && boundTcp && boundUdp) {
          settled = true;
          resolve(session);
        }
      };

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        try { tcpServer.close(); } catch (e) {}
        try { udpSocket.close(); } catch (e) {}
        reject(err);
      };

      tcpServer.once('error', fail);
      udpSocket.once('error', fail);

      tcpServer.listen(port, () => {
        boundTcp = true;
        finish();
      });
      udpSocket.bind(port, () => {
        boundUdp = true;
        finish();
      });

      tcpServer.on('error', (err) => {
        console.error(`[SDVX Relay] TCP error on port ${port}: ${err.message}`);
        this.releasePort(port);
      });

      udpSocket.on('error', (err) => {
        console.error(`[SDVX Relay] UDP error on port ${port}: ${err.message}`);
        this.releasePort(port);
      });

      // --- TCP half: pair the 2 most recent connections (one per player) ---
      const normAddr = (addr: string) => addr.replace(/^::ffff:/, '');

      tcpServer.on('connection', (socket) => {
        session.lastActivity = Date.now();
        const remoteAddr = normAddr(socket.remoteAddress || '');
        const remotePort = socket.remotePort || 0;
        const remoteKey = `${remoteAddr}:${remotePort}`;

        // 1. Exact match (ip:port) — same connection re-connecting
        let idx = -1;
        for (let i = 0; i < 2; i++) {
          if (session.tcpConns[i] && (session.tcpConns[i] as any).__remoteKey === remoteKey) {
            idx = i;
            break;
          }
        }
        // 2. Free slot (two players can share the same public IP behind a NAT)
        if (idx === -1) {
          for (let i = 0; i < 2; i++) {
            if (!session.tcpConns[i]) {
              idx = i;
              break;
            }
          }
        }
        // 3. Same IP with a different source port -> this player re-connected
        //    with a new ephemeral port, replace their slot
        if (idx === -1) {
          for (let i = 0; i < 2; i++) {
            if (session.tcpConns[i] && (session.tcpConns[i] as any).__remoteAddr === remoteAddr) {
              idx = i;
              break;
            }
          }
        }
        if (idx === -1) {
          console.log(`[SDVX Relay][Port ${session.port}] Extra TCP connection rejected from ${remoteAddr}`);
          socket.destroy();
          return;
        }

        if (session.tcpConns[idx]) {
          try { (session.tcpConns[idx] as net.Socket).destroy(); } catch (e) {}
        }

        console.log(`[SDVX Relay][Port ${session.port}] P${idx} TCP connected from ${remoteAddr}`);
        socket.setNoDelay(true);
        socket.setKeepAlive(true, 1000);
        (socket as any).__remoteAddr = remoteAddr;
        (socket as any).__remoteKey = remoteKey;
        session.tcpConns[idx] = socket;

        socket.on('data', (data) => {
          session.lastActivity = Date.now();
          const otherIdx = 1 - idx;
          const otherConn = session.tcpConns[otherIdx];
          if (otherConn) {
            otherConn.write(data);
          } else {
            if (session.tcpBuf[otherIdx].length < 65536) {
              session.tcpBuf[otherIdx].push(data);
            }
          }
        });

        socket.on('close', () => {
          console.log(`[SDVX Relay][Port ${session.port}] P${idx} TCP disconnected`);
          if (session.tcpConns[idx] === socket) {
            session.tcpConns[idx] = null;
          }
        });

        socket.on('error', () => {
          if (session.tcpConns[idx] === socket) {
            session.tcpConns[idx] = null;
          }
        });

        const flush = (bufArr: Buffer[], target: net.Socket) => {
          for (const b of bufArr) target.write(b);
          bufArr.length = 0;
        };

        // Deliver data buffered for this player
        flush(session.tcpBuf[idx], socket);
        // If the other player is connected, deliver data buffered for them too
        const otherIdx = 1 - idx;
        const otherConn = session.tcpConns[otherIdx];
        if (otherConn) {
          flush(session.tcpBuf[otherIdx], otherConn);
        }
      });

      // --- UDP half: pair the 2 most recent source endpoints ---
      udpSocket.on('message', (msg, rinfo) => {
        session.lastActivity = Date.now();

        let idx = -1;
        for (let i = 0; i < 2; i++) {
          if (session.udpClients[i] && session.udpClients[i].address === rinfo.address && session.udpClients[i].port === rinfo.port) {
            idx = i;
            break;
          }
        }
        if (idx === -1) {
          for (let i = 0; i < 2; i++) {
            if (!session.udpClients[i]) {
              session.udpClients[i] = { address: rinfo.address, port: rinfo.port };
              idx = i;
              console.log(`[SDVX Relay][Port ${session.port}] P${i} UDP registered from ${rinfo.address}:${rinfo.port}`);
              break;
            }
          }
          if (idx === -1) {
            idx = 1;
            session.udpClients[1] = { address: rinfo.address, port: rinfo.port };
            console.log(`[SDVX Relay][Port ${session.port}] P1 UDP replaced by ${rinfo.address}:${rinfo.port}`);
          }
        }

        const otherIdx = 1 - idx;
        const other = session.udpClients[otherIdx];

        if (other) {
          if (session.udpBuf[otherIdx].length > 0) {
            for (const b of session.udpBuf[otherIdx]) udpSocket.send(b, other.port, other.address);
            session.udpBuf[otherIdx] = [];
          }
          udpSocket.send(msg, other.port, other.address, (err) => {
            if (err && this.verbose) console.log(`[SDVX Relay] UDP forward error: ${err.message}`);
          });
        } else {
          if (session.udpBuf[otherIdx].length < 500) {
            session.udpBuf[otherIdx].push(Buffer.from(msg));
          }
        }
      });
    });
  }

  private cleanup() {
    const now = Date.now();
    for (const [port, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.idleTimeout) {
        console.log(`[SDVX Relay] Timing out session on port ${port} (no traffic for ${this.idleTimeout / 60000} min)`);
        this.releasePort(port);
      }
    }
  }
}
