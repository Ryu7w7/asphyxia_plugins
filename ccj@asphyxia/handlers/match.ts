import { RelayManager } from './relay';
import { sendDiscordAnnouncement, sendDiscordJoinAnnouncement } from './discord';

// ============================================================
// CCJ Matchmaking Handler
// ============================================================
// Two modes (from MatchingConfig.MatchingMode):
//   - In-Store (Local): Players find each other via LAN/Radmin using
//     UJKCircleMatch (FindCircle UDP). They share the same teamid.
//     teamnum=2, teamid="ea_<guid>"
//
//   - Online (Global): Players are matched by the server using matchtype.
//     teamnum=1, teamid=""
//
// CRITICAL: The client ParseHandler (UjkXrpcModule.XrpcMethodMatchMake)
// reads exactly these XML fields from the response:
//   - matchid      (s32)
//   - jointype     (s32)  -> 1=you are host, 0=you connect to host
//   - globalip     (str)  -> IP the joiner should connect to
//   - globalport   (s32)  -> Port to connect to
//   - hostouttime  (s64)  -> Expiry time (milliseconds, Unix timestamp)
// ============================================================

interface LobbyMember {
    pcbid: string;
    localIp: string;   // LAN / Radmin VPN IP (from request "localip")
    globalIp: string;  // Public-facing IP (from request "globalip")
    port: number;
}

interface Lobby {
    matchid: number;
    matchtype: string;
    teamid: string;        // in-store grouping key (empty = online)
    host_pcbid: string;
    host_local_ip: string;
    host_global_ip: string;
    host_port: number;
    hostouttime: number;   // ms Unix timestamp
    members: LobbyMember[];
    relay_port?: number;   // Port assigned for the UDP relay
}

const lobbies: Map<string, Lobby> = new Map();
let activeMatchId = Math.floor(Math.random() * 5000) + 1000;

export const matchMake = async (info: any, data: any, send: any) => {
    const pcbid    = (info as any).pcbid || 'unknown';
    const matchtype  = $(data).str('matchtype') || 'normal';
    const teamid     = $(data).str('teamid')    || '';
    const reqLocalIp = $(data).str('localip')   || '127.0.0.1';
    const reqGlobalIp = $(data).str('globalip') || '127.0.0.1';
    const now = Date.now();
    const MATCH_TIME_MS = 350000; // 350 seconds

    const isInStore = teamid.length > 0;
    const relayEnabled = U.GetConfig('ccj_relay_enabled') === true;
    const relayPublicIp = U.GetConfig('ccj_relay_public_ip') || '127.0.0.1';
    const discordWebhook = U.GetConfig('ccj_discord_webhook');
    const discordIcon = U.GetConfig('ccj_discord_icon');

    // --- Cleanup expired lobbies ---
    for (const [key, l] of lobbies.entries()) {
        if (now > l.hostouttime) {
            if (l.relay_port) {
                RelayManager.getInstance().releasePort(l.relay_port);
            }
            lobbies.delete(key);
            console.log(`[CCJ P2P] Lobby ${l.matchid} expired, removed.`);
        }
    }

    // --- Find or create lobby ---
    let lobby: Lobby | undefined;

    // 1. Check if this player is already in a lobby (re-poll)
    for (const l of lobbies.values()) {
        if (l.members.some(m => m.pcbid === pcbid)) {
            lobby = l;
            break;
        }
    }

    if (!lobby) {
        if (isInStore) {
            // In-Store: find lobby with same teamid (LAN/Radmin group)
            for (const l of lobbies.values()) {
                if (l.teamid === teamid && l.members.length < 6) {
                    lobby = l;
                    break;
                }
            }
        } else {
            // Online: find open lobby with same matchtype
            for (const l of lobbies.values()) {
                if (l.teamid === '' && l.matchtype === matchtype && l.members.length < 6) {
                    lobby = l;
                    break;
                }
            }
        }
    }

    if (lobby) {
        // Join existing lobby if not already a member
        if (!lobby.members.some(m => m.pcbid === pcbid)) {
            lobby.members.push({ pcbid, localIp: reqLocalIp, globalIp: reqGlobalIp, port: 5700 });
            const mode = isInStore ? 'InStore' : 'Online';
            console.log(`[CCJ P2P][${mode}] Player ${pcbid} joined lobby ${lobby.matchid} (Local: ${reqLocalIp}, Global: ${reqGlobalIp})`);

            // --- Discord Join Announcement ---
            if (!isInStore && discordWebhook) {
                (async () => {
                    try {
                        const refid = (info as any).refid || $(data).str('ref_id') || $(data).attr().ref_id || $(data).str('refid') || $(data).attr().refid || pcbid;
                        const profile = await DB.FindOne<any>(refid, { collection: 'profile' });
                        const playerName = profile ? profile.name : "Guest Player";
                        await sendDiscordJoinAnnouncement(
                            discordWebhook,
                            playerName,
                            lobby!.matchid,
                            lobby!.matchtype,
                            !!lobby!.relay_port,
                            lobby!.members.length,
                            discordIcon
                        );
                    } catch (e) {
                        console.error(`[CCJ Discord] Failed to fetch player name or send join webhook: ${e.message}`);
                    }
                })();
            }
        }
    } else {
        // Auto-detect if Host has the CCJ Relay Mod (BepInEx)
        // The mod sends "0.0.0.0" to signal it wants a relay session.
        const hasRelayMod = reqGlobalIp === '0.0.0.0';
        const useRelay = !isInStore && relayEnabled && hasRelayMod;

        const matchid = activeMatchId++;
        let relay_port: number | undefined;

        // Allocate relay port if Online mode and relay is enabled
        if (useRelay) {
            relay_port = await RelayManager.getInstance().allocatePort();
            if (!relay_port) {
                console.error(`[CCJ P2P] Failed to allocate relay port for match ${matchid}`);
            }
        }

        lobby = {
            matchid,
            matchtype,
            teamid,
            host_pcbid: pcbid,
            host_local_ip: reqLocalIp,
            host_global_ip: hasRelayMod ? '0.0.0.0' : reqGlobalIp,
            host_port: relay_port || 5700,
            hostouttime: now + MATCH_TIME_MS,
            members: [{ pcbid, localIp: reqLocalIp, globalIp: reqGlobalIp, port: 5700 }],
            relay_port,
        };

        const lobbyKey = isInStore ? `INSTORE_${teamid}` : `ONLINE_${matchtype}_${pcbid}`;
        lobbies.set(lobbyKey, lobby);
        const mode = isInStore ? 'InStore' : 'Online';
        console.log(`[CCJ P2P][${mode}] Player ${pcbid} created lobby ${matchid} (Local: ${reqLocalIp}, Global: ${reqGlobalIp}, RelayPort: ${relay_port || 'N/A'})`);

        // --- Discord Announcement ---
        if (!isInStore && discordWebhook) {
            (async () => {
                try {
                    // Exhaustive search for refid (matching profile.ts logic)
                    const refid = (info as any).refid || $(data).str('ref_id') || $(data).attr().ref_id || $(data).str('refid') || $(data).attr().refid || pcbid;
                    
                    const profile = await DB.FindOne<any>(refid, { collection: 'profile' });
                    const hostName = profile ? profile.name : "Guest Player";
                    
                    console.log(`[CCJ Discord] Announcing lobby for ${hostName} (ID: ${refid})`);

                    await sendDiscordAnnouncement(
                        discordWebhook,
                        hostName,
                        lobby!.matchid,
                        matchtype,
                        !!relay_port,
                        1,
                        lobby!.hostouttime,
                        discordIcon
                    );
                } catch (e) {
                    console.error(`[CCJ Discord] Failed to fetch host name or send webhook: ${e.message}`);
                }
            })();
        }
    }

    const isHost = lobby.host_pcbid === pcbid;

    // --- Determine the IP and Port to give the client for P2P connection ---
    let connectIp: string;
    let connectPort: number;

    if (!isInStore && relayEnabled && lobby.relay_port) {
        // ONLINE + Relay: Always use server's public IP and the allocated relay port
        connectIp = relayPublicIp;
        connectPort = lobby.relay_port;
        console.log(`[CCJ P2P][Online/Relay] Routing ${pcbid} → Relay: ${connectIp}:${connectPort}`);
    } else {
        // Fallback to legacy P2P logic
        connectPort = 5700;
        if (isHost) {
            connectIp = reqGlobalIp;
        } else if (isInStore && reqGlobalIp === lobby.host_global_ip) {
            connectIp = lobby.host_local_ip;
            console.log(`[CCJ P2P][InStore] LAN/Radmin detected for ${pcbid} → host local IP: ${connectIp}`);
        } else {
            connectIp = lobby.host_global_ip;
            const mode = isInStore ? 'InStore/Internet' : 'Online';
            console.log(`[CCJ P2P][${mode}] Routing ${pcbid} → host global IP: ${connectIp}`);
        }
    }

    console.log(`[CCJ P2P] Response to ${pcbid}: Host=${isHost}, ConnectTo=${connectIp}:${connectPort}, LobbySize=${lobby.members.length}`);

    const hostouttime = lobby.hostouttime;

    const xml = `<game>
        <matchid __type="s32">${lobby.matchid}</matchid>
        <jointype __type="s32">${isHost ? 1 : 0}</jointype>
        <globalip __type="str">${connectIp}</globalip>
        <globalport __type="s32">${connectPort}</globalport>
        <hostouttime __type="s64">${hostouttime}</hostouttime>
        <waitcount __type="s32">${lobby.members.length}</waitcount>
        <matchnum __type="s32">6</matchnum>
        <state __type="s32">1</state>
        <token __type="str">P2P_${lobby.matchid}</token>
        <result __type="s32">0</result>
    </game>`;

    return send.xml(xml);
};

