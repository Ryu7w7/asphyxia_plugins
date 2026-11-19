import Profile from "../models/profile";

export const addRival = async (data: any) => {
    const refid = data.refid;
    const rivalJid = Number(data.rival_jid);

    if(!refid || !Number.isInteger(rivalJid)) {
        return;
    }

    // 자기 자신 방지
    const self = await DB.FindOne<Profile>(refid, {collection: "profile"});
    if(!self || self.jubeatId === rivalJid) {
        return;
    }

    // 상대 프로필 존재 확인
    const target = await DB.FindOne<Profile>(null, {collection: "profile", jubeatId: rivalJid});
    if(!target){
        console.error("Rival profile not found", rivalJid);
        return;
    }

    // 중복 없이 추가
    await DB.Update(
        refid,
        {collection: "profile"},
        {$addToSet: {rivals: {jubeatId: rivalJid, name: target.name}}}
    );
};

export const removeRival = async (data: any) => {
    const refid = data.refid;
    const rivalJid = Number(data.rival_jid);
    if(!refid || !Number.isInteger(rivalJid)) return;
    await DB.Update(
        refid,
        {collection: "profile"},
        {$pull: {rivals: {jubeatId: rivalJid}}}
    );
};

export const searchRival = async (data: any, send: WebUISend) => {
    const jubeatId = Number(data.jubeatId);
    const qRaw = (data.q || '').toString().trim().toUpperCase();
    if(!qRaw)
        return send.json({results: []});

    const candidates = await DB.Find<Profile>(null, {collection: "profile"});

    // 자기 자신 제외
    // 이름 부분일치(대소문자 무시) + 숫자 입력 시 JID 정확히 일치도 허용
    send.json({
        results: candidates
            .filter(p => (p.name.includes(qRaw) || p.jubeatId === Number(qRaw)) && p.jubeatId !== jubeatId)
            .map(p => ({
                name: p.name,
                jubeatId: p.jubeatId,
            })),
    });
};
