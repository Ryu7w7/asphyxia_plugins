import {Score} from "../models/score";

export const getScoreRoute = async (data: any, send: WebUISend) => {
    const refid = (data.refid || '').toString().trim().toUpperCase();
    if(!refid)
        return send.json({});

    const scores = await DB.Find<Score>(refid, {collection: "score"});

    const hard = {};
    const normal = {};
    for(const scoreData of scores){
        const dataObject = scoreData.isHardMode ? hard : normal;
        dataObject[scoreData.musicId] ??= [];
        if(
            !dataObject[scoreData.musicId][scoreData.seq] ||
            dataObject[scoreData.musicId][scoreData.seq].score < scoreData.score
        ){
            dataObject[scoreData.musicId][scoreData.seq] = scoreData
        }
    }
    send.json({
        hard: Object.values(hard),
        normal: Object.values(normal),
    });
};
