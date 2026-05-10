const dgram = require('dgram');
import { Socket } from 'dgram';

interface ClientInfo {
    id: number;
    address: string;
    port: number;
    lastSeen: number;
}

interface RelaySession {
    port: number;
    socket: dgram.Socket;
    host: { address: string; port: number } | null;
    clients: Map<string, ClientInfo>; // key: "ip:port"
    clientsById: Map<number, ClientInfo>;
    nextClientId: number;
    lastActivity: number;
}

export class RelayManager {
    private static instance: RelayManager;
    private sessions: Map<number, RelaySession> = new Map(); // key: port
    private portRange: { min: number; max: number } = { min: 50000, max: 50100 };
    private publicIp: string = '127.0.0.1';
    private idleTimeout: number = 3600000; // 1 hour

    private verbose: boolean = false;

    private constructor() {
        // Run cleanup every minute
        setInterval(() => this.cleanup(), 60000);
    }

    public static getInstance(): RelayManager {
        if (!RelayManager.instance) {
            RelayManager.instance = new RelayManager();
        }
        return RelayManager.instance;
    }

    public setConfig(publicIp: string, range: string, verbose: boolean = false) {
        this.publicIp = publicIp;
        this.verbose = verbose;
        const [min, max] = range.split('-').map(Number);
        if (min && max) {
            this.portRange = { min, max };
        }
    }

    public async allocatePort(): Promise<number | null> {
        for (let port = this.portRange.min; port <= this.portRange.max; port++) {
            if (!this.sessions.has(port)) {
                try {
                    const session = await this.createSession(port);
                    this.sessions.set(port, session);
                    return port;
                } catch (e) {
                    console.error(`[CCJ Relay] Failed to bind to port ${port}:`, e);
                }
            }
        }
        return null;
    }

    public releasePort(port: number) {
        const session = this.sessions.get(port);
        if (session) {
            session.socket.close();
            this.sessions.delete(port);
            console.log(`[CCJ Relay] Released port ${port}`);
        }
    }

    private createSession(port: number): Promise<RelaySession> {
        return new Promise((resolve, reject) => {
            const socket = dgram.createSocket('udp4');
            
            const session: RelaySession = {
                port,
                socket,
                host: null,
                clients: new Map(),
                clientsById: new Map(),
                nextClientId: 1,
                lastActivity: Date.now(),
            };

            socket.on('message', (msg, rinfo) => {
                this.handlePacket(session, msg, rinfo);
            });

            socket.on('error', (err) => {
                console.error(`[CCJ Relay] Socket error on port ${port}:`, err);
                this.releasePort(port);
            });

            socket.bind(port, () => {
                console.log(`[CCJ Relay] Session started on port ${port}`);
                resolve(session);
            });

            socket.on('close', () => {
                this.sessions.delete(port);
            });
        });
    }

    private handlePacket(session: RelaySession, msg: Buffer, rinfo: dgram.RemoteInfo) {
        session.lastActivity = Date.now();
        const senderKey = `${rinfo.address}:${rinfo.port}`;

        // 1. Host Registration Magic
        if (msg.length === 8 && msg.toString('ascii') === 'CCJRELAY') {
            session.host = { address: rinfo.address, port: rinfo.port };
            console.log(`[CCJ Relay][Port ${session.port}] Host registered: ${senderKey}`);
            return;
        }

        // 2. Traffic from Host (Framed: [ID(2b)][Payload])
        if (session.host && rinfo.address === session.host.address && rinfo.port === session.host.port) {
            if (msg.length < 2) return;
            const clientId = msg.readUInt16BE(0);
            const payload = msg.slice(2);
            
            const client = session.clientsById.get(clientId);
            if (client) {
                if (this.verbose) {
                    console.log(`[CCJ Relay][Port ${session.port}] Host -> Client ${clientId} (${payload.length} bytes)`);
                }
                session.socket.send(payload, client.port, client.address);
            }
            return;
        }

        // 3. Traffic from Client (Unframed: [Payload])
        if (!session.host) {
            // Drop packets if host hasn't registered yet
            if (this.verbose) {
                console.log(`[CCJ Relay][Port ${session.port}] Dropped packet from ${senderKey}: No host registered yet`);
            }
            return;
        }

        let client = session.clients.get(senderKey);
        if (!client) {
            const id = session.nextClientId++;
            client = {
                id,
                address: rinfo.address,
                port: rinfo.port,
                lastSeen: Date.now(),
            };
            session.clients.set(senderKey, client);
            session.clientsById.set(id, client);
            console.log(`[CCJ Relay][Port ${session.port}] New connection: ${senderKey} (Assigned ID: ${id})`);
        } else {
            client.lastSeen = Date.now();
        }

        // Forward to Host with 2-byte ID prefix
        if (this.verbose) {
            console.log(`[CCJ Relay][Port ${session.port}] Client ${client.id} -> Host (${msg.length} bytes)`);
        }
        const framed = Buffer.alloc(2 + msg.length);
        framed.writeUInt16BE(client.id, 0);
        msg.copy(framed, 2);
        session.socket.send(framed, session.host.port, session.host.address);
    }


    private cleanup() {
        const now = Date.now();
        for (const [port, session] of this.sessions.entries()) {
            // Session timeout
            if (now - session.lastActivity > this.idleTimeout) {
                console.log(`[CCJ Relay] Timing out session on port ${port}`);
                this.releasePort(port);
                continue;
            }

            // Client timeout (10 mins)
            for (const [key, client] of session.clients.entries()) {
                if (now - client.lastSeen > 600000) {
                    session.clients.delete(key);
                    session.clientsById.delete(client.id);
                    console.log(`[CCJ Relay][Port ${port}] Evicted stale client ${key}`);
                }
            }
        }
    }
}
