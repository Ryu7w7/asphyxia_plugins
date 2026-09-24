"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.usergamedata = void 0;
const profile_1 = require("../models/profile");
const utils_1 = require("../utils");
const https = __importStar(require("https"));
const CLEAR_TO_LAMP_TACHI = {
    1: 'FAILED',
    2: 'ASSIST',
    3: 'CLEAR',
    4: 'LIFE4',
    5: 'LIFE4',
    6: 'LIFE4',
    7: 'FULL COMBO',
    8: 'GREAT FULL COMBO',
    9: 'PERFECT FULL COMBO',
    10: 'MARVELOUS FULL COMBO'
};
const TYPE_MAP_TACHI = {
    0: 'BEGINNER',
    1: 'BASIC',
    2: 'DIFFICULT',
    3: 'EXPERT',
    4: 'CHALLENGE'
};
async function tachiAutoExport(refid, style, difficulty, clearKind, score, songId) {
    const plugin = { identifier: "ddr@asphyxia", core: false };
    const autoExportDoc = await DB.FindOne(refid, { collection: 'tachi_auto_export' }, plugin);
    if (!autoExportDoc || !autoExportDoc.token)
        return;
    const lamp = CLEAR_TO_LAMP_TACHI[clearKind];
    if (!lamp)
        return;
    const tachiType = TYPE_MAP_TACHI[difficulty];
    if (!tachiType)
        return;
    const playtype = style === 1 ? 'DP' : 'SP';
    const tachiScores = [{
            score: score,
            lamp: lamp,
            matchType: 'inGameID',
            identifier: String(songId),
            difficulty: tachiType,
            timeAchieved: Date.now()
        }];
    const batchManual = JSON.stringify({
        meta: { game: 'ddr', playtype: playtype, service: 'Asphyxia' },
        scores: tachiScores,
    });
    const boundary = '----AsphyxiaTachi' + Date.now();
    const bodyParts = [
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="importType"\r\n\r\n`,
        `file/batch-manual\r\n`,
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="scoreData"; filename="scores.json"\r\n`,
        `Content-Type: application/json\r\n\r\n`,
        batchManual + '\r\n',
        `--${boundary}--\r\n`
    ];
    const postData = Buffer.from(bodyParts.join(''));
    await new Promise((resolve, reject) => {
        const req = https.request('https://kamai.tachi.ac/api/v1/import/file', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${autoExportDoc.token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': postData.length,
                'X-User-Intent': 'true',
            },
        }, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => resolve());
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    }).catch(e => console.error('Tachi auto-export error:', e));
}
var GameStyle;
(function (GameStyle) {
    GameStyle[GameStyle["SINGLE"] = 0] = "SINGLE";
    GameStyle[GameStyle["DOUBLE"] = 1] = "DOUBLE";
    GameStyle[GameStyle["VERSUS"] = 2] = "VERSUS";
})(GameStyle || (GameStyle = {}));
const usergamedata = async (info, data, send) => {
    const mode = $(data).str("data.mode");
    const refId = $(data).str("data.refid");
    switch (mode) {
        case "userload":
            return send.object(await userload(refId));
        case "usernew":
            return send.object(await usernew(refId, data));
        case "usersave":
            return send.object(await usersave(refId, data));
        case "rivalload":
            return send.object(await rivalload(refId, data));
        case "ghostload":
            return send.object(await ghostload(refId, data));
        case "inheritance":
            return send.object(inheritance(refId));
        default:
            return send.deny();
    }
};
exports.usergamedata = usergamedata;
const userload = async (refId) => {
    let resObj = {
        result: K.ITEM("s32", 0),
        is_new: K.ITEM("bool", false),
        music: [],
        eventdata: []
    };
    if (!refId.startsWith("X000")) {
        const profile = await DB.FindOne(refId, { collection: "profile" });
        if (!profile)
            resObj.is_new = K.ITEM("bool", true);
        const scores = await DB.Find(refId, { collection: "score" });
        for (const score of scores) {
            const note = [];
            for (let i = 0; i < 9; i++) {
                if (score.difficulty !== i) {
                    note.push({
                        count: K.ITEM("u16", 0),
                        rank: K.ITEM("u8", 0),
                        clearkind: K.ITEM("u8", 0),
                        score: K.ITEM("s32", 0),
                        ghostid: K.ITEM("s32", 0)
                    });
                }
                else {
                    note.push({
                        count: K.ITEM("u16", 1),
                        rank: K.ITEM("u8", score.rank),
                        clearkind: K.ITEM("u8", score.clearKind),
                        score: K.ITEM("s32", score.score),
                        ghostid: K.ITEM("s32", score.songId)
                    });
                }
            }
            resObj.music.push({
                mcode: K.ITEM("u32", score.songId),
                note
            });
        }
        resObj["grade"] = {
            single_grade: K.ITEM("u32", profile.singleGrade || 0),
            dougle_grade: K.ITEM("u32", profile.doubleGrade || 0)
        };
    }
    return resObj;
};
const usernew = async (refId, data) => {
    const shopArea = $(data).str("data.shoparea", "");
    let profile = await DB.FindOne(refId, { collection: "profile" });
    if (!profile) {
        profile = (await DB.Upsert(refId, { collection: "profile" }, {
            collection: "profile",
            ddrCode: _.random(1, 99999999),
            shopArea
        })).docs[0];
    }
    return {
        result: K.ITEM("s32", 0),
        seq: K.ITEM("str", (0, utils_1.formatCode)(profile.ddrCode)),
        code: K.ITEM("s32", profile.ddrCode),
        shoparea: K.ITEM("str", profile.shopArea),
    };
};
const usersave = async (refId, serverData) => {
    const profile = await DB.FindOne(refId, { collection: "profile" });
    if (profile) {
        const data = $(serverData).element("data");
        const notes = data.elements("note");
        const events = data.elements("event");
        const common = profile.usergamedata.COMMON.strdata.split(",");
        const option = profile.usergamedata.OPTION.strdata.split(",");
        const last = profile.usergamedata.LAST.strdata.split(",");
        if (data.bool("isgameover")) {
            const style = data.number("playstyle");
            if (style === GameStyle.DOUBLE) {
                common[profile_1.CommonOffset.DOUBLE_PLAYS] = (parseInt(common[profile_1.CommonOffset.DOUBLE_PLAYS]) + 1) + "";
            }
            else {
                common[profile_1.CommonOffset.SINGLE_PLAYS] = (parseInt(common[profile_1.CommonOffset.SINGLE_PLAYS]) + 1) + "";
            }
            common[profile_1.CommonOffset.TOTAL_PLAYS] = (+common[profile_1.CommonOffset.DOUBLE_PLAYS]) + (+common[profile_1.CommonOffset.SINGLE_PLAYS]) + "";
            const workoutEnabled = !!+common[profile_1.CommonOffset.WEIGHT_DISPLAY];
            const workoutWeight = +common[profile_1.CommonOffset.WEIGHT];
            if (workoutEnabled && workoutWeight > 0) {
                let total = 0;
                for (const note of notes) {
                    total = total + note.number("calorie", 0);
                }
                last[profile_1.LastOffset.CALORIES] = total + "";
            }
            for (const event of events) {
                const eventId = event.number("eventid", 0);
                const eventType = event.number("eventtype", 0);
                if (eventId === 0 || eventType === 0)
                    continue;
                const eventCompleted = event.number("comptime") !== 0;
                const eventProgress = event.number("savedata");
                if (!profile.events)
                    profile.events = {};
                profile.events[eventId] = {
                    completed: eventCompleted,
                    progress: eventProgress
                };
            }
            const gradeNode = data.element("grade");
            if (gradeNode) {
                const single = gradeNode.number("single_grade", 0);
                const double = gradeNode.number("double_grade", 0);
                profile.singleGrade = single;
                profile.doubleGrade = double;
            }
        }
        let scoreData;
        let stageNum = 0;
        for (const note of notes) {
            if (note.number("stagenum") > stageNum) {
                scoreData = note;
                stageNum = note.number("stagenum");
            }
        }
        if (scoreData) {
            const songId = scoreData.number("mcode");
            const difficulty = scoreData.number("notetype");
            const rank = scoreData.number("rank");
            const clearKind = scoreData.number("clearkind");
            const score = scoreData.number("score");
            const maxCombo = scoreData.number("maxcombo");
            const ghostSize = scoreData.number("ghostsize");
            const ghost = scoreData.str("ghost");
            option[profile_1.OptionOffset.SPEED] = scoreData.number("opt_speed").toString(16);
            option[profile_1.OptionOffset.BOOST] = scoreData.number("opt_boost").toString(16);
            option[profile_1.OptionOffset.APPEARANCE] = scoreData.number("opt_appearance").toString(16);
            option[profile_1.OptionOffset.TURN] = scoreData.number("opt_turn").toString(16);
            option[profile_1.OptionOffset.STEP_ZONE] = scoreData.number("opt_dark").toString(16);
            option[profile_1.OptionOffset.SCROLL] = scoreData.number("opt_scroll").toString(16);
            option[profile_1.OptionOffset.ARROW_COLOR] = scoreData.number("opt_arrowcolor").toString(16);
            option[profile_1.OptionOffset.CUT] = scoreData.number("opt_cut").toString(16);
            option[profile_1.OptionOffset.FREEZE] = scoreData.number("opt_freeze").toString(16);
            option[profile_1.OptionOffset.JUMP] = scoreData.number("opt_jump").toString(16);
            option[profile_1.OptionOffset.ARROW_SKIN] = scoreData.number("opt_arrowshape").toString(16);
            option[profile_1.OptionOffset.FILTER] = scoreData.number("opt_filter").toString(16);
            option[profile_1.OptionOffset.GUIDELINE] = scoreData.number("opt_guideline").toString(16);
            option[profile_1.OptionOffset.GAUGE] = scoreData.number("opt_gauge").toString(16);
            option[profile_1.OptionOffset.COMBO_POSITION] = scoreData.number("opt_judgepriority").toString(16);
            option[profile_1.OptionOffset.FAST_SLOW] = scoreData.number("opt_timing").toString(16);
            await DB.Upsert(refId, {
                collection: "score",
                songId,
                difficulty
            }, {
                $set: {
                    rank,
                    clearKind,
                    score,
                    maxCombo
                }
            });
            await DB.Upsert(refId, {
                collection: "ghost",
                songId,
                difficulty
            }, {
                $set: {
                    ghostSize,
                    ghost
                }
            });
            const mappedStyle = difficulty > 4 ? 1 : 0;
            const mappedDiff = difficulty > 4 ? difficulty - 4 : difficulty;
            tachiAutoExport(refId, mappedStyle, mappedDiff, clearKind, score, songId).catch(e => console.error(e));
        }
        await DB.Update(refId, { collection: "profile" }, {
            $set: {
                "usergamedata.COMMON.strdata": common.join(","),
                "usergamedata.OPTION.strdata": option.join(","),
                "usergamedata.LAST.strdata": last.join(","),
            }
        });
    }
    return {
        result: K.ITEM("s32", 0)
    };
};
const rivalload = (refId, data) => {
    const loadFlag = $(data).number("data.loadflag");
    const record = [];
    return {
        result: K.ITEM("s32", 0),
        data: {
            recordtype: K.ITEM("s32", loadFlag),
            record
        }
    };
};
const ghostload = (refId, data) => {
    const ghostdata = {};
    return {
        result: K.ITEM("s32", 0),
        ghostdata
    };
};
const inheritance = (refId) => {
    return {
        result: K.ITEM("s32", 0),
        InheritanceStatus: K.ITEM("s32", 1)
    };
};
