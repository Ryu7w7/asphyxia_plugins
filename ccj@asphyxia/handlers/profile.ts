import { ALL_ITEMS } from '../data/items';

export const dataLoad = async (info: any, data: any, send: any) => {
  let refid = info.refid || $(data).str('ref_id') || $(data).attr().ref_id || $(data).str('refid') || $(data).attr().refid;
  let profile: any = null;

  let authStatus = 0;

  if (refid) {
    profile = await DB.FindOne<any>(refid, { collection: 'profile' });
  }

  // Guest mode (no refid at all)
  if (!profile) {
    console.log(`Using generic Guest profile for session`);
    profile = {
      name: "Ɵ-ƟƟƟƟ",
      refid: refid || "GUEST",
    } as any;
  }

  console.log(`Loading profile for ${profile!.name}`);

  // Character generation
  let characters = [];

  if (profile.CharaCustomize) {
    for (const slotId in profile.CharaCustomize) {
      // Force unlock any character already in DB
      let charData = profile.CharaCustomize[slotId];
      if (typeof charData === 'object' && charData !== null) {
        charData.unlock = true;
        if (!charData.level) charData.level = 1;
      } else {
        charData = { unlock: true, level: 1 };
      }
      characters.push({ id: slotId, jsondata: charData });
    }
  }

  // Ensure all standard and special characters are always unlocked
  const allCharacters = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, // Base Roster
    101, 102, 103, // Extra/Event
    110, 111, 113, 114 // Extra/Event
  ];

  for (const charId of allCharacters) {
    const cid = charId.toString();
    if (!characters.some(c => c.id === cid)) {
      characters.push({ id: cid, jsondata: { unlock: true, level: 1 } });
    }
  }

  let possession = profile.UserPossesionData || {};

  // Clean up any broken standalone GEAR slot from previous bugs
  if (possession['GEAR00000001']) {
    delete possession['GEAR00000001'];
  }

  // Inject default tickets (GEAR00000001) into the proper 'Basic' slot
  if (!possession['Basic']) {
    possession['Basic'] = { gearKey: ["GEAR00000001"], gearValue: [100], itemKey: [], itemValue: [] };
  } else {
    let b = possession['Basic'];
    if (!b.gearKey) b.gearKey = [];
    if (!b.gearValue) b.gearValue = [];
    let idx = b.gearKey.indexOf("GEAR00000001");
    if (idx === -1) {
      b.gearKey.push("GEAR00000001");
      b.gearValue.push(100);
    }
  }

  // --- Safe Unlock All Injection ---
  // Using the central items repository, but disabled auto-unlock to prevent UDP packet size crash during Matchmaking.
  // Users must buy items from the shop instead.
  const verifiedUnlockAll = [];
  if (!possession['Basic'].itemKey) possession['Basic'].itemKey = [];
  if (!possession['Basic'].itemValue) possession['Basic'].itemValue = [];

  for (const item of verifiedUnlockAll) {
    if (!possession['Basic'].itemKey.includes(item)) {
      possession['Basic'].itemKey.push(item);
      possession['Basic'].itemValue.push(1); // Insert 1 copy of the item
    }
  }
  // ------------------------------------

  const initialLeagueRank = U.GetConfig('ccj_initial_league_rank');
  const leagueRank = (typeof initialLeagueRank === 'number') ? initialLeagueRank : 1;

  return send.pugFile('templates/player_data_load.pug', {
    status: authStatus,
    characters,
    profile,
    possession,
    leagueRank
  });
};

export const checkIn = async (info: any, data: any, send: any) => {
  const refid = $(data).str('ref_id') || $(data).attr().ref_id || $(data).str('refid') || $(data).attr().refid;
  console.log(`[player.checkIn] Card session start: ${refid}`);

  return send.object({
    is_login_already: K.ITEM('bool', false),
  });
};

export const checkOut = async (info: any, data: any, send: any) => {
  console.log(`[player.checkOut] Session closed`);
  return send.success();
};

export const dataSave = async (info: any, data: any, send: any) => {
  // CCJ natively sends `ref_id` inside standard save or `refid`
  const refid = $(data).str('ref_id') || $(data).attr().ref_id || $(data).str('refid') || $(data).attr().refid;

  if (!refid) {
    console.log(`[player.dataSave] ERROR: No ref_id found, denying request.`);
    return send.deny();
  }

  // Create update object strictly using dot-notation for MongoDB/NeDB deep merge
  const profileUpdate: any = {};

  let isFirstRegistration = false;
  let newName = "";

  // CCJ sends data inside <pdata> or <gdata> wrappers
  let pdataRoot = $(data).element('pdata');
  let pdataNodes = pdataRoot ? pdataRoot.elements('json') : null;
  if (!pdataNodes || pdataNodes.length === 0) {
    let gdataRoot = $(data).element('gdata');
    pdataNodes = gdataRoot ? gdataRoot.elements('json') : null;
  }
  if (pdataNodes && pdataNodes.length > 0) {
    for (let i = 0; i < pdataNodes.length; i++) {
      const node = pdataNodes[i];
      const resultType = node.str('datatype') || node.str('resulttype'); // Actually, in CCJ they use 'datatype' instead of 'resulttype' for typical saves, but play_log uses 'resulttype'
      const slotid = node.str('slotid') || "0";
      const jsonData = node.str('jsondata');

      if (jsonData) {
        try {
          const parsed = JSON.parse(jsonData);

          // If this is UserCustomize, extract the name (specifically 'userName', fallback to 'name')
          if (resultType === 'UserCustomize' && (parsed.userName || parsed.name)) {
            newName = parsed.userName || parsed.name;
            isFirstRegistration = true;
            console.log(`[player.dataSave] Extracted profile name: ${newName}`);
          }



          // IMPORTANT: Format using dot-notation to merge objects rather than wipe them
          if (resultType && resultType !== 'play_log') {
            profileUpdate[`${resultType}.${slotid}`] = parsed;
          }

          // Log data to console
          console.log(`[player.dataSave] Merging ${resultType}[${slotid}] data for ${refid}`);
        } catch (e) {
          // Silently skip parse errors
        }
      }
    }
  }

  // Ensure we track name if first time
  if (isFirstRegistration) {
    profileUpdate.name = newName;
  }

  // Safety check refid presence
  profileUpdate.refid = refid;

  await DB.Upsert<any>(
    refid,
    { collection: 'profile' },
    { $set: profileUpdate }
  );

  console.log(`[player.dataSave] Profile ${refid} saved successfully!`);
  return send.success();
};

export const saveResult = async (info: any, data: any, send: any) => {
  const gdataRoot = $(data).element('gdata');
  const jsonNodes = gdataRoot ? gdataRoot.elements('json') : null;
  const resultType = (jsonNodes && jsonNodes[0]) ? jsonNodes[0].str('resulttype') : undefined;
  console.log(`[play_log Interceptor] Payload sent by client. Type: ${resultType}`);

  if (resultType === 'error_log') {
    const errData = (jsonNodes && jsonNodes[0]) ? jsonNodes[0].str('jsondata') : undefined;
    console.log(`[play_log error_log] ${errData}`);
  }

  if (resultType === 'play_log') {
    const jsonRefId = (jsonNodes && jsonNodes[0]) ? (jsonNodes[0].str('ref_id') || jsonNodes[0].str('refid')) : undefined;
    const refid = $(data).str('ref_id') || $(data).str('refid') || $(data).attr().ref_id || $(data).attr().refid || jsonRefId;

    const jsonData = (jsonNodes && jsonNodes[0]) ? jsonNodes[0].str('jsondata') : undefined;

    if (refid && jsonData) {
      try {
        const parsed = JSON.parse(jsonData);
        const currentProfile = await DB.FindOne<any>(refid as string, { collection: 'profile' });

        if (currentProfile) {
          const initialLeagueRank = U.GetConfig('ccj_initial_league_rank');
          const defaultRank = (typeof initialLeagueRank === 'number') ? initialLeagueRank : 1;

          let leagueData = currentProfile.leaguedata || {};
          let league = leagueData['0'] || leagueData['noSlot'] || { season_id: 1, maxMatchingRank: defaultRank, maxMatchingRankExp: 0, currentMatchingRank: defaultRank, currentMatchingRankExp: 0 };

          const earnedExp = parsed.exp || 50;
          league.currentMatchingRankExp = (league.currentMatchingRankExp || 0) + earnedExp;

          // Rank Up (1000 EXP per rank)
          while (league.currentMatchingRankExp >= 1000 && league.currentMatchingRank < 99) {
            league.currentMatchingRank += 1;
            league.currentMatchingRankExp -= 1000;
          }

          if (league.currentMatchingRank > league.maxMatchingRank) {
            league.maxMatchingRank = league.currentMatchingRank;
          }

          let statsData = currentProfile.UserStatsData || {};
          let stats = statsData['0'] || statsData['noSlot'] || { playCount: 0, killCount: 0, mvpCount: 0, firstRankCount: 0 };
          stats.playCount = (stats.playCount || 0) + 1;
          stats.killCount = (stats.killCount || 0) + (parsed.killCount || 0);
          if (parsed.isMvp) stats.mvpCount = (stats.mvpCount || 0) + 1;
          if (parsed.matchingRank === 1) stats.firstRankCount = (stats.firstRankCount || 0) + 1;

          await DB.Upsert<any>(
            refid as string,
            { collection: 'profile' },
            { $set: { 'leaguedata.0': league, 'UserStatsData.0': stats } }
          );

          console.log(`[game.saveResult] Processed play_log for ${refid}. Earned ${earnedExp} EXP. New Rank: ${league.currentMatchingRank}`);
        }
      } catch (e) {
        console.log(`[game.saveResult] Error parsing play_log JSON: ${e}`);
      }
    } else {
      console.log(`[game.saveResult] Missing refid or jsondata for play_log.`);
    }
  }

  return send.success();
};
