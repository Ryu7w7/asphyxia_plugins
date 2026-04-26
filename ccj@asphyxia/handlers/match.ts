// Removed Relay Imports
let activeMatchId = 1;

interface Lobby {
    matchid: number;
    host_ip: string;
    host_port: number;
    local_ip: string;
    local_port: number;
    hostouttime: number;
    players_joined: number;
    matchnum: number;
}

const lobbies: Record<string, Lobby> = {};

export const matchMake: EPR = async (info, data, send) => {
    const matchtype = $(data).str('matchtype');
    const matchnum = $(data).number('matchnum', 6);
    const reqMatchId = $(data).number('matchid', 0);
    const reqJoinType = $(data).number('jointype', 0);
    const BI = Function('return BigInt')();

    const hostTimeSecs = U.GetConfig('ccj_host_matching_time');
    const durationMs = (typeof hostTimeSecs === 'number' && hostTimeSecs > 0) ? hostTimeSecs * 1000 : 300000;

    let localip = $(data).str('localip') || '';
    let globalip_xml = $(data).str('globalip') || '';
    
    // Auto-detect if the game is being forced to a Virtual LAN (Radmin/ZeroTier/Hamachi) or Physical LAN via -network
    let isVirtualLan = localip.startsWith('26.') || localip.startsWith('25.') || localip.startsWith('10.') || localip.startsWith('192.168.');
    
    // If Virtual LAN, prioritize the localip. Otherwise, prioritize the globalip (Public IP) for port forwarding.
    let globalip = (isVirtualLan ? localip : (globalip_xml || localip)) || '127.0.0.1';
    let globalport = $(data).number('globalport', 10000);
    console.log(`[XRPC] game.matchMake - Requested globalport is: ${globalport}`);

    let lobby = lobbies[matchtype];
    const currentTimeMs = Date.now();

    // Clean up if lobby is expired
    if (lobby && currentTimeMs > lobby.hostouttime) {
        console.log(`[XRPC] game.matchMake - Queue ${matchtype} is expired. Clearing...`);
        lobby = undefined;
        delete lobbies[matchtype];
    }

    // Polling for updates
    if (reqMatchId > 0 && lobby && reqMatchId === lobby.matchid) {
        // If Host uses the relay, we must tell the Host to bind locally (127.0.0.1) 
        // while we tell Clients to connect to the Relay IP.
        const isHost = reqJoinType === 1;
        
        return send.object({
            matchid: K.ITEM('s32', lobby.matchid),
            jointype: K.ITEM('s32', reqJoinType), // Send back their current role
            globalip: K.ITEM('str', lobby.host_ip),
            globalport: K.ITEM('s32', lobby.host_port),
            localip: K.ITEM('str', lobby.local_ip),
            localport: K.ITEM('s32', lobby.local_port),
            hostouttime: K.ITEM('s64', BI(lobby.hostouttime) as any),
            waitcount: K.ITEM('s32', lobby.players_joined),
            matchnum: K.ITEM('s32', lobby.matchnum),
            result: K.ITEM('s32', 0)
        });
    }

    // Create new lobby (Host)
    if (!lobby) {
        activeMatchId++;
        
        lobbies[matchtype] = {
            matchid: activeMatchId,
            host_ip: globalip,
            host_port: globalport,
            local_ip: localip, // The original local IP sent by the Host
            local_port: globalport, // The original port used by the Host
            hostouttime: currentTimeMs + durationMs,
            players_joined: 1,
            matchnum: matchnum
        };
        lobby = lobbies[matchtype];

        console.log(`[XRPC] game.matchMake - Created Lobby [${lobby.matchid}] as HOST with Public IP ${lobby.host_ip}:${lobby.host_port} for queue ${matchtype}`);
        return send.object({
            matchid: K.ITEM('s32', lobby.matchid),
            jointype: K.ITEM('s32', 1), // 1 = Host
            globalip: K.ITEM('str', lobby.host_ip),
            globalport: K.ITEM('s32', lobby.host_port),
            localip: K.ITEM('str', lobby.local_ip),
            localport: K.ITEM('s32', lobby.local_port),
            hostouttime: K.ITEM('s64', BI(lobby.hostouttime) as any),
            waitcount: K.ITEM('s32', lobby.players_joined),
            matchnum: K.ITEM('s32', lobby.matchnum),
            result: K.ITEM('s32', 0)
        });
    } else {
        // Join existing lobby (Client)
        lobby.players_joined++;
        console.log(`[XRPC] game.matchMake - User joined Lobby [${lobby.matchid}] as CLIENT for queue ${matchtype} [${lobby.players_joined}/${lobby.matchnum}]`);

        const currentLobby = { ...lobby };
        // Close lobby immediately if full so next queue searchers make a new lobby
        if (lobby.players_joined >= lobby.matchnum) {
            delete lobbies[matchtype];
        }

        return send.object({
            matchid: K.ITEM('s32', currentLobby.matchid),
            jointype: K.ITEM('s32', 0), // 0 = Client
            globalip: K.ITEM('str', currentLobby.host_ip),
            globalport: K.ITEM('s32', currentLobby.host_port),
            localip: K.ITEM('str', currentLobby.local_ip),
            localport: K.ITEM('s32', currentLobby.local_port),
            hostouttime: K.ITEM('s64', BI(currentLobby.hostouttime) as any),
            waitcount: K.ITEM('s32', currentLobby.players_joined),
            matchnum: K.ITEM('s32', currentLobby.matchnum),
            result: K.ITEM('s32', 0)
        });
    }
};
