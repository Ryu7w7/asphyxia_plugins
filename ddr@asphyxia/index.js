"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
const common_1 = require("./handlers/common");
const usergamedata_1 = require("./handlers/usergamedata");
const usergamedata_recv_1 = require("./handlers/usergamedata_recv");
const usergamedata_send_1 = require("./handlers/usergamedata_send");
const ddrworld_1 = require("./handlers/ddrworld");
const profile_1 = require("./models/profile");
const world_1 = require("./data/world");
function register() {
    R.GameCode("MDX");
    R.Unhandled(undefined);
    R.Config("DiscordWebhookUrl", {
        name: "Discord Webhook URL",
        desc: "URL for Top 1 Score Tracker Discord Webhook (leave empty to disable). When a player sets a new server #1 score, a notification will be posted here.",
        type: "string",
        default: "",
    });
    R.Config("ddr_jacket_dir", {
        name: "DDR Jacket Directory",
        desc: "Path to the directory containing extracted jacket PNG files (e.g. C:\\Users\\RyuPC\\Desktop\\Code\\ddr_jackets). Used for Discord webhook thumbnails.",
        type: "string",
        default: "",
    });
    R.Config("save_option", {
        name: "Save option",
        desc: "Gets the previously set options as they are.",
        default: true,
        type: "boolean"
    });
    R.Config("song_unlock", {
        name: "Unlock all songs",
        desc: "Still requires musicdb.xml to get the song ids.",
        default: true,
        type: "boolean"
    });
    R.Config("world_league", {
        name: "WORLD LEAGUE",
        default: false,
        type: "boolean"
    });
    R.Config("blacklisted_songs", {
        name: "Blacklisted Songs",
        desc: "Comma-separated list of song IDs (mcodes) to hide (e.g. 38551,38491,38380).",
        default: "38551,38491,38380",
        type: "string"
    });
    R.DataFile('./webui/uploads/mdb_limited.xml', { name: 'musicdb.xml for musicdata_load', desc: 'musicdb.xml file to use for importing unlock and difficulty level info. (If not using modified musicdb, I advice using the musicdb file from DDR A3 2024040200.)', accept: 'text/xml, .xml' });
    R.DataFile('./webui/uploads/mdb_title.xml', { name: 'musicdb.xml for WebUI', desc: 'musicdb.xml file to retrieve song titles from, for use in WebUI. Keep this blank if you want to use the same file as above. (I advice using the latest DDR WORLD musicdb.)', accept: 'text/xml, .xml' });
    const RoutePlayerData = (method, handler) => {
        R.Route(`playerdata.${method}`, handler);
    };
    const RoutePlayData = (method, handler) => {
        R.Route(`playdata_3.${method}`, handler);
    };
    const WordCheck = (method, handler) => {
        R.Route(`wordcheck_3.${method}`, handler);
    };
    const RouteSystem = (method, handler) => {
        R.Route(`system.${method}`, handler);
        R.Route(`system_3.${method}`, handler);
    };
    const RouteEventLog = (method, handler) => {
        R.Route(`eventlog.${method}`, handler);
        R.Route(`eventlog_3.${method}`, handler);
    };
    RoutePlayerData('usergamedata_advanced', usergamedata_1.usergamedata);
    RoutePlayerData('usergamedata_recv', usergamedata_recv_1.usergamedata_recv);
    RoutePlayerData('usergamedata_send', usergamedata_send_1.usergamedata_send);
    RoutePlayData('musicdata_load', ddrworld_1.musicdataload);
    RoutePlayData('playerdata_new', ddrworld_1.playerdatanew);
    RoutePlayData('playerdata_load', ddrworld_1.playerdataload);
    RoutePlayData('playerdata_save', ddrworld_1.playerdatasave);
    RoutePlayData('rivaldata_load', ddrworld_1.rivaldataload);
    RoutePlayData('ghostdata_load', ddrworld_1.ghostdataload);
    RoutePlayData('mergeddata_load', ddrworld_1.mergeddataload);
    RouteSystem("convcardnumber", common_1.convcardnumber);
    RouteSystem("minidump", ddrworld_1.minidump);
    RouteEventLog("write", common_1.eventLog);
    WordCheck('tabooword_check', ddrworld_1.taboowordcheck);
    R.WebUIEvent("updateName", async ({ refid, name }) => {
        let strdata = await DB.FindOne(refid, { collection: "profile" });
        if (strdata) {
            strdata = strdata.usergamedata.COMMON.strdata.split(",");
            strdata[profile_1.CommonOffset.NAME] = name;
            await DB.Update(refid, { collection: "profile" }, {
                $set: {
                    "usergamedata.COMMON.strdata": strdata.join(",")
                }
            });
        }
    });
    R.WebUIEvent("updateWeight", async ({ refid, weight }) => {
        let strdata = await DB.FindOne(refid, { collection: "profile" });
        if (strdata) {
            strdata = strdata.usergamedata.COMMON.strdata.split(",");
            strdata[profile_1.CommonOffset.WEIGHT] = weight;
            await DB.Update(refid, { collection: "profile" }, {
                $set: {
                    "usergamedata.COMMON.strdata": strdata.join(",")
                }
            });
        }
    });
    R.WebUIEvent("updateDisplayCalories", async ({ refid, selected }) => {
        let strdata = await DB.FindOne(refid, { collection: "profile" });
        if (strdata) {
            strdata = strdata.usergamedata.COMMON.strdata.split(",");
            strdata[profile_1.CommonOffset.WEIGHT_DISPLAY] = selected;
            await DB.Update(refid, { collection: "profile" }, {
                $set: {
                    "usergamedata.COMMON.strdata": strdata.join(",")
                }
            });
        }
    });
    R.WebUIEvent("updateArrowSkin", async ({ refid, selected }) => {
        let strdata = await DB.FindOne(refid, { collection: "profile" });
        if (strdata) {
            strdata = strdata.usergamedata.OPTION.strdata.split(",");
            strdata[profile_1.OptionOffset.ARROW_SKIN] = selected;
            await DB.Update(refid, { collection: "profile" }, {
                $set: {
                    "usergamedata.OPTION.strdata": strdata.join(",")
                }
            });
        }
    });
    R.WebUIEvent("updateGuideline", async ({ refid, selected }) => {
        let strdata = await DB.FindOne(refid, { collection: "profile" });
        if (strdata) {
            strdata = strdata.usergamedata.OPTION.strdata.split(",");
            strdata[profile_1.OptionOffset.GUIDELINE] = selected;
            await DB.Update(refid, { collection: "profile" }, {
                $set: {
                    "usergamedata.OPTION.strdata": strdata.join(",")
                }
            });
        }
    });
    R.WebUIEvent("updateFilter", async ({ refid, selected }) => {
        let strdata = await DB.FindOne(refid, { collection: "profile" });
        if (strdata) {
            strdata = strdata.usergamedata.OPTION.strdata.split(",");
            strdata[profile_1.OptionOffset.FILTER] = selected;
            await DB.Update(refid, { collection: "profile" }, {
                $set: {
                    "usergamedata.OPTION.strdata": strdata.join(",")
                }
            });
        }
    });
    R.WebUIEvent("updateJudgmentPriority", async ({ refid, selected }) => {
        let strdata = await DB.FindOne(refid, { collection: "profile" });
        if (strdata) {
            strdata = strdata.usergamedata.OPTION.strdata.split(",");
            strdata[profile_1.OptionOffset.COMBO_POSITION] = selected;
            await DB.Update(refid, { collection: "profile" }, {
                $set: {
                    "usergamedata.OPTION.strdata": strdata.join(",")
                }
            });
        }
    });
    R.WebUIEvent("updateDisplayTiming", async ({ refid, selected }) => {
        let strdata = await DB.FindOne(refid, { collection: "profile" });
        if (strdata) {
            strdata = strdata.usergamedata.OPTION.strdata.split(",");
            strdata[profile_1.OptionOffset.FAST_SLOW] = selected;
            await DB.Update(refid, { collection: "profile" }, {
                $set: {
                    "usergamedata.OPTION.strdata": strdata.join(",")
                }
            });
        }
    });
    R.WebUIEvent("updateName3", async ({ refid, name }) => {
        await DB.Update(refid, { collection: "profile3" }, {
            $set: {
                dancerName: name
            }
        });
    });
    R.WebUIEvent("updateWeight3", async ({ refid, weight }) => {
        await DB.Update(refid, { collection: "profile3" }, {
            $set: {
                weight: weight
            }
        });
    });
    R.WebUIEvent("updateDisplayCalories3", async ({ refid, selected }) => {
        await DB.Update(refid, { collection: "profile3" }, {
            $set: {
                isDispWeight: selected
            }
        });
    });
    R.WebUIEvent("updatePlatinum", async ({ refid, selected, currentSub }) => {
        await DB.Update(refid, { collection: "profile3" }, {
            $set: {
                subscribed: selected,
                subscribePopupEnable: selected && selected !== currentSub,
                subscribePopupDisable: !selected && selected !== currentSub
            }
        });
    });
    R.WebUIEvent("playerCustomize", async ({ refid, selected }) => {
        for (const sel of selected) {
            await DB.Upsert(refid, { collection: "customize3", category: sel[0], pattern: sel[2] }, {
                $set: Object.assign({ key: sel[1] }, (sel[1] === 9999 && {
                    random: sel[3]
                }))
            });
        }
    });
    R.WebUIEvent("addRival", async (data, send) => {
        var _a;
        const ddrCode = (_a = parseInt(data === null || data === void 0 ? void 0 : data.ddrCode)) !== null && _a !== void 0 ? _a : '';
        if (!ddrCode)
            return send.json({ success: false, alert: "Enter a DDR code." });
        if (await DB.Count(data.refid, { collection: "rival3" }) >= 10)
            return send.json({ success: false, alert: "Rival list is full." });
        if (await DB.Count(data.refid, { collection: "rival3", ddrCode }) > 0)
            return send.json({ success: false, alert: "Profile already registered as rival." });
        const search = await DB.FindOne(null, { collection: "profile3", ddrCode });
        if (!search)
            return send.json({ success: false, alert: "Dancer not found." });
        else if (search['__refid'] === data.refid)
            return send.json({ success: false, alert: "You can't add yourself as rival." });
        await DB.Insert(data.refid, { collection: "rival3", slot: 0, rivalCode: ddrCode });
        send.json({
            success: true,
            alert: 'Success',
            search
        });
    });
    R.WebUIEvent("deleteRival", async (data, send) => {
        var _a;
        const ddrCode = (_a = parseInt(data === null || data === void 0 ? void 0 : data.ddrCode)) !== null && _a !== void 0 ? _a : '';
        if (!ddrCode)
            return send.json({ success: false, alert: "No DDR code." });
        await DB.Remove(data.refid, { collection: "rival3", rivalCode: ddrCode });
        send.json({
            success: true,
            alert: 'Rival removed.'
        });
    });
    R.WebUIEvent("updateRivalSlot", async (data, send) => {
        const ddrCode = parseInt(data.ddrCode);
        if (ddrCode === 0) {
            await DB.Update(data.refid, { collection: "rival3", slot: data.slot }, { $set: { slot: 0 } });
        }
        else {
            await DB.Update(data.refid, { collection: "rival3", rivalCode: ddrCode }, { $set: { slot: data.slot } });
        }
        send.json({
            success: true
        });
    });
    R.WebUIEvent("getMDB", async (data, send) => {
        let mdbData = [];
        if (IO.Exists('webui/uploads/mdb_limited.xml')) {
            let mdbLim = U.parseXML(U.DecodeString(await IO.ReadFile('webui/uploads/mdb_limited.xml'), "utf8"), false);
            mdbLim['mdb']['music'].forEach(music => {
                if (world_1.SONGS_WORLD.concat(world_1.SONGS_OVERRIDE_WORLD).findIndex(so => so.mcode === $(music).number('mcode')) < 0) {
                    mdbData.push({
                        mcode: $(music).number('mcode'),
                        title: $(music).str('title'),
                        diffLv: $(music).numbers('diffLv'),
                        series: $(music).number('series')
                    });
                }
            });
            let mdbTitle = (!IO.Exists('webui/uploads/mdb_title.xml')) ? mdbLim : U.parseXML(U.DecodeString(await IO.ReadFile('webui/uploads/mdb_title.xml'), "utf8"), false);
            world_1.SONGS_WORLD.concat(world_1.SONGS_OVERRIDE_WORLD).forEach(sw => {
                let musicInfo = mdbTitle['mdb']['music'].find(m => $(m).number('mcode') === sw.mcode);
                let songTitle = 'ID ' + sw.mcode;
                let series = 0;
                if (musicInfo) {
                    songTitle = $(musicInfo).str('title');
                    series = $(musicInfo).number('series');
                }
                mdbData.push({
                    mcode: sw.mcode,
                    title: songTitle,
                    diffLv: sw.diffLv,
                    series: series
                });
            });
        }
        send.json({ mdb: mdbData });
    });
}
async function updateWorldLeague() {
    for (const league of world_1.LEAGUE_WORLD) {
        for (const leagueClass of [1, 2, 3]) {
            let curLeagueRes = await DB.FindOne({ collection: 'leagueresult3', id: league.id, class: leagueClass });
            let ended = (curLeagueRes) ? curLeagueRes.ended : false;
            if (!ended) {
                let leagueAll = await DB.Find(null, { collection: 'league3', id: league.id, class: leagueClass });
                let joinNum = leagueAll.length;
                let promoteScore = 0;
                let promoteRank = 0;
                let demoteScore = 0;
                let demoteRank = 0;
                let leagueSorted = leagueAll.sort((a, b) => b.score - a.score);
                let leagueScores = leagueSorted.map(a => a.score);
                if (leagueScores[0] > 0) {
                    if (leagueClass === 1) {
                        promoteScore = Math.round(leagueScores[0] / 2);
                        leagueScores = leagueScores.concat([promoteScore]).sort((a, b) => b - a);
                        promoteRank = leagueScores.findIndex(s => s === promoteScore) + 1;
                        joinNum += ((joinNum < 2) ? 2 : 1);
                    }
                    else if (leagueClass === 2) {
                        promoteScore = Math.round(leagueScores[0] - (leagueScores[0] - (35 / 100 * leagueScores[0])));
                        demoteScore = Math.round(leagueScores[0] - (leagueScores[0] - (85 / 100 * leagueScores[0])));
                        leagueScores = leagueScores.concat([promoteScore, demoteScore]).sort((a, b) => b - a);
                        promoteRank = leagueScores.findIndex(s => s === promoteScore) + 1;
                        demoteScore = leagueScores.findIndex(s => s === demoteScore) + 1;
                        joinNum += 2;
                    }
                    else if (leagueClass === 3) {
                        demoteScore = Math.round(leagueScores[0] - (leagueScores[0] - (85 / 100 * leagueScores[0])));
                        leagueScores = leagueScores.concat([demoteScore]).sort((a, b) => b - a);
                        demoteRank = leagueScores.findIndex(s => s === demoteScore) + 1;
                        joinNum += ((joinNum < 2) ? 2 : 1);
                    }
                }
                await DB.Upsert({ collection: 'leagueresult3', id: league.id, class: leagueClass }, {
                    $set: {
                        promoteRank: promoteRank,
                        promoteScore: promoteScore,
                        demoteRank: demoteRank,
                        demoteScore: demoteScore,
                        joinNum: joinNum,
                        ended: BigInt(Date.now()) >= league.summary
                    }
                });
                // console.log("       class " + leagueClass)
                // console.log("promoteScore " + promoteScore)
                // console.log(" promoteRank " + promoteRank)
                // console.log(" demoteScore " + demoteScore)
                // console.log("  demoteRank " + demoteRank)
                // console.log("     joinNum " + joinNum)
                // console.log("")
                for (const lctr in leagueSorted) {
                    await DB.Upsert(leagueSorted[lctr]['__refid'], { collection: 'league3', id: league.id, class: leagueClass }, { $set: { rankNum: parseInt(lctr) + 1 } });
                    // console.log(leagueSorted[lctr]['__refid'] + ": " + (parseInt(lctr)+1) + " " + leagueSorted[lctr]['score'])
                }
            }
            else
                break;
        }
    }
}
// List missing songs in SONGS_WORLD/SONGS_OVERRIDE_WORLD
async function checkMissingSongs() {
    const excl = [38269, 38440];
    const worldIds = world_1.SONGS_WORLD.map(m => m.mcode);
    const mdb = U.parseXML(U.DecodeString(await IO.ReadFile('webui/uploads/mdb_title.xml'), "utf8"), false);
    const mFilt = mdb['mdb']['music'].filter(m => $(m).number('series') === 21);
    const worldOverrides = world_1.SONGS_OVERRIDE_WORLD.map(m => m.mcode);
    const mdba3 = U.parseXML(U.DecodeString(await IO.ReadFile('webui/uploads/mdb_limited.xml'), "utf8"), false);
    const ma3Filt = mdb['mdb']['music'].filter(m => $(m).number('series') < 21);
    console.log('missing songs: ');
    for (const m of mFilt) {
        const mcode = $(m).number('mcode');
        if (!worldIds.includes(mcode) && !excl.includes(mcode))
            console.log(mcode + " - " + $(m).str('title'));
    }
    console.log();
    console.log('new challenge charts');
    for (const a3info of mdba3['mdb']['music']) {
        const mcode = $(a3info).number('mcode');
        const m = ma3Filt.find(ma3 => $(ma3).number('mcode') === mcode);
        if (!m)
            continue;
        if ($(a3info).numbers('diffLv')[4] === 0 && $(m).numbers('limited_ary')[4] != -1 && !worldOverrides.includes(mcode))
            console.log(mcode + " - " + $(m).str('title'));
    }
}
updateWorldLeague();
setInterval(updateWorldLeague, 60000);
// checkMissingSongs()
