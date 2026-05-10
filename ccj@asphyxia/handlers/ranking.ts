export const getRanking = async (info: any, data: any, send: any) => {
  const rankingId = $(data).str('ranking_id') || "202307";
  
  // Fetch all profiles from the DB
  const profiles = await DB.Find<any>(null, { collection: 'profile' });
  
  // Sort them by EXP (descending)
  profiles.sort((a, b) => {
    let expA = (a.leaguedata && a.leaguedata['0'] && typeof a.leaguedata['0'].currentMatchingRankExp === 'number') 
                ? a.leaguedata['0'].currentMatchingRankExp 
                : ((a.leaguedata && a.leaguedata['noSlot'] && typeof a.leaguedata['noSlot'].currentMatchingRankExp === 'number') ? a.leaguedata['noSlot'].currentMatchingRankExp : 0);
    
    let expB = (b.leaguedata && b.leaguedata['0'] && typeof b.leaguedata['0'].currentMatchingRankExp === 'number') 
                ? b.leaguedata['0'].currentMatchingRankExp 
                : ((b.leaguedata && b.leaguedata['noSlot'] && typeof b.leaguedata['noSlot'].currentMatchingRankExp === 'number') ? b.leaguedata['noSlot'].currentMatchingRankExp : 0);
                
    return expB - expA;
  });

  // Take top 100
  const topProfiles = profiles.slice(0, 100);

  const rankElements = topProfiles.map((p, index) => {
    let charaId = 1;
    let shogoId = 1;
    let score = (p.leaguedata && p.leaguedata['0'] && p.leaguedata['0'].currentMatchingRankExp) || 
                (p.leaguedata && p.leaguedata['noSlot'] && p.leaguedata['noSlot'].currentMatchingRankExp) || 
                0;

    return {
      shogo_id: K.ITEM('s32', shogoId),
      chara_id: K.ITEM('s32', charaId),
      score: K.ITEM('s32', score),
      name: K.ITEM('str', p.name || `GUEST-${index + 1}`),
    };
  });

  if (rankElements.length === 0) {
    rankElements.push({
      shogo_id: K.ITEM('s32', 1),
      chara_id: K.ITEM('s32', 1),
      score: K.ITEM('s32', 0),
      name: K.ITEM('str', '---'),
    });
  }

  return send.object({
    ranking_id: K.ITEM('str', rankingId),
    gettime: K.ITEM('s64', BigInt(Math.floor(Date.now() / 1000))),
    rank: rankElements
  });
};

export const getRankUpData = async (info: any, data: any, send: any) => {
  return send.xmlFile('xml/getRankUpData.xml');
};
