import { GetVersion } from "../util";

// In-memory lobby matching arrays
let arenaLobby: any[] = [];
let bplLobby: any[] = [];

function getIpFromReq(info: EamuseInfo) {
  // Asphyxia doesn't directly expose the source IP in `info`, 
  // but it usually runs locally or behind a proxy.
  // The client normally sends local_ip and global_ip in the XML payload anyway.
  return "0.0.0.0";
}

export const lobbyentry: EPR = async (info, data, send) => {
  const version = GetVersion(info);
  const clientVersion = parseInt(data.client_version?.["@content"] || "0");
  const playStyle = parseInt(data.play_style?.["@content"] || "0");
  const isOmni = parseInt(data.is_omnimix?.["@content"] || "0");
  const arenaClass = parseInt(data.arena_class?.["@content"] || "0");
  const port = parseInt(data.port?.["@content"] || "0");
  const gIp = data.global_ip_address?.["@content"] || "0 0 0 0";
  const lIp = data.local_ip_address?.["@content"] || "0 0 0 0";
  
  // Clean up expired (older than 2 minutes)
  const now = Date.now();
  arenaLobby = arenaLobby.filter(x => now - x.timestamp < 120000);

  // Check for an existing host
  const host = arenaLobby.find(x => x.play_style === playStyle && x.client_version === clientVersion && x.is_omni === isOmni);

  if (host) {
    // Found a host, return their details
    return send.object({
      arena_class: K.ITEM("s32", host.arena_class),
      port: K.ITEM("u16", host.port),
      global_ip_address: K.ITEM("str", host.global_ip_address),
      local_ip_address: K.ITEM("str", host.local_ip_address),
    });
  } else {
    // Register as host
    arenaLobby.push({
      client_version: clientVersion,
      play_style: playStyle,
      is_omni: isOmni,
      arena_class: arenaClass,
      port: port,
      global_ip_address: gIp,
      local_ip_address: lIp,
      timestamp: Date.now(),
    });
    // Return empty to signify we are waiting
    return send.object({});
  }
};

export const lobbyupdate: EPR = async (info, data, send) => {
  const port = parseInt(data.port?.["@content"] || "0");
  const gIp = data.global_ip_address?.["@content"] || "0 0 0 0";
  
  const host = arenaLobby.find(x => x.port === port && x.global_ip_address === gIp);
  if (host) {
    host.timestamp = Date.now();
  }
  return send.success();
};

export const lobbydelete: EPR = async (info, data, send) => {
  const port = parseInt(data.port?.["@content"] || "0");
  const gIp = data.global_ip_address?.["@content"] || "0 0 0 0";
  
  arenaLobby = arenaLobby.filter(x => !(x.port === port && x.global_ip_address === gIp));
  return send.success();
};

// BPL Battle Handlers
export const bplbattle_entry: EPR = async (info, data, send) => {
  const version = GetVersion(info);
  const clientVersion = parseInt(data.client_version?.["@content"] || "0");
  const playStyle = parseInt(data.play_style?.["@content"] || "0");
  const isOmni = parseInt(data.is_omnimix?.["@content"] || "0");
  const password = data.password?.["@content"] || "";
  const port = parseInt(data.port?.["@content"] || "0");
  const tag = data.tag?.["@content"] || "";
  const gIp = data.global_ip_address?.["@content"] || "0 0 0 0";
  const lIp = data.local_ip_address?.["@content"] || "0 0 0 0";

  const now = Date.now();
  bplLobby = bplLobby.filter(x => now - x.timestamp < 120000);

  const host = bplLobby.find(x => x.play_style === playStyle && x.client_version === clientVersion && x.is_omni === isOmni && x.password === password);

  if (host) {
    return send.object({
      tag: K.ITEM("str", host.tag),
      port: K.ITEM("u16", host.port),
      global_ip_address: K.ITEM("str", host.global_ip_address),
      local_ip_address: K.ITEM("str", host.local_ip_address),
    });
  } else {
    bplLobby.push({
      client_version: clientVersion,
      play_style: playStyle,
      is_omni: isOmni,
      password: password,
      port: port,
      tag: tag,
      global_ip_address: gIp,
      local_ip_address: lIp,
      timestamp: Date.now(),
    });
    return send.object({});
  }
};

export const bplbattle_update: EPR = async (info, data, send) => {
  const port = parseInt(data.port?.["@content"] || "0");
  const gIp = data.global_ip_address?.["@content"] || "0 0 0 0";
  
  const host = bplLobby.find(x => x.port === port && x.global_ip_address === gIp);
  if (host) {
    host.timestamp = Date.now();
  }
  return send.success();
};

export const bplbattle_delete: EPR = async (info, data, send) => {
  const port = parseInt(data.port?.["@content"] || "0");
  const gIp = data.global_ip_address?.["@content"] || "0 0 0 0";
  
  bplLobby = bplLobby.filter(x => !(x.port === port && x.global_ip_address === gIp));
  return send.success();
};
