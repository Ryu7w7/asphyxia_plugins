import { AchievementsUsaneko } from "../models/achievements";
import { ExtraData, Phase } from "../models/common";
import * as utils from "./utils";

export const setRoutes = () => {
    R.Route(`info24.common`, getInfo);
    R.Route(`info.common`, getInfo);
    R.Route(`player24.new`, newPlayer);
    R.Route(`player.new`, newPlayer);
    R.Route(`player24.read`, read);
    R.Route(`player.read`, read);
    R.Route(`player24.start`, start);
    R.Route(`player.start`, start);
    R.Route(`player24.buy`, buy);
    R.Route(`player.buy`, buy);
    R.Route(`player24.read_score`, readScore);
    R.Route(`player.read_score`, readScore);
    R.Route(`player.read_option`, readOption);
    R.Route(`player24.write_music`, writeScore);
    R.Route(`player.write_music`, writeScore);
    R.Route(`player24.write`, write);
    R.Route(`player.write`, write);
    R.Route(`player24.friend`, friend);
    R.Route(`player.friend`, friend);
}

/**
 * Return current state of the game (phase, good prices, etc...)
 */
const getInfoCommon = (req: EamuseInfo) => {
    const result: any = {
        phase: [],
        choco: [],
        goods: [],
        area: [],
    };

    // Phase
    const version = getVersion(req);
    const phaseData = getPhase(version);

    for (const phase of phaseData) {
        result.phase.push({
            event_id: K.ITEM('s16', phase.id),
            phase: K.ITEM('s16', phase.p),
        });
    }

    // Choco
    for (let i = 0; i < 5; ++i) {
        result.choco.push({
            choco_id: K.ITEM('s16', i),
            param: K.ITEM('s32', -1),
        });
    }

    // Goods
    for (let i = 0; i < GAME_MAX_DECO_ID[version]; ++i) {
        let price = 250;
        if (i < 15) {
            price = 30;
        } else if (i < 30) {
            price = 40;
        } else if (i < 45) {
            price = 60;
        } else if (i < 60) {
            price = 80;
        } else if (i < 98) {
            price = 200;
        }

        result.goods.push({
            item_id: K.ITEM('s32', i + 1),
            item_type: K.ITEM('s16', 3),
            price: K.ITEM('s32', price),
            goods_type: K.ITEM('s16', 0),
        });
    }

    // Area
    if(version == 'v24') {
        for (let i = 0; i < 16; ++i) {
            result.area.push({
                area_id: K.ITEM('s16', i),
                end_date: K.ITEM('u64', BigInt(0)),
                medal_id: K.ITEM('s16', i),
                is_limit: K.ITEM('bool', 0),
            });
        }
    }

    // TODO : Course ranking
    // TODO : Most popular characters
    // TODO : Most popular music

    return result;
}

const getInfo = async (req: EamuseInfo, data: any, send: EamuseSend): Promise<any> => {
    return send.object(getInfoCommon(req));
}

const start = async (req: EamuseInfo, data: any, send: EamuseSend): Promise<any> => {
    const result = {
        play_id: K.ITEM('s32', 1),
        ...getInfoCommon(req),
    };
    await send.object(result);
};

/**
 * Handler for new profile
 */
const newPlayer = async (req: EamuseInfo, data: any, send: EamuseSend): Promise<any> => {
    const refid = $(data).str('ref_id');
    if (!refid) return send.deny();

    const name = $(data).str('name');

    send.object(await getProfile(refid, getVersion(req), name));
};

/**
 * Handler for existing profile
 */
const read = async (req: EamuseInfo, data: any, send: EamuseSend): Promise<any> => {
    const refid = $(data).str('ref_id');
    if (!refid) return send.deny();

    send.object(await getProfile(refid, getVersion(req)));
};

/**
 * Handler fo buying goods with lumina
 */
const buy = async (req: EamuseInfo, data: any, send: EamuseSend): Promise<any> => {
    const refid = $(data).str('ref_id');
    if (!refid) return send.deny();

    const type = $(data).number('type', -1);
    const id = $(data).number('id', -1);
    const param = $(data).number('param', 0);
    const price = $(data).number('price', 0);
    const lumina = $(data).number('lumina', 0);

    if (type < 0 || id < 0) {
        return send.deny();
    }

    if (lumina >= price) {
        const version = getVersion(req);

        const params = await utils.readParams(refid, version);
        params.params.player_point = lumina - price;
        await utils.writeParams(refid, version, params);

        const achievements = <AchievementsUsaneko>await utils.readAchievements(refid, version, { ...defaultAchievements, version });
        achievements.items[`${type}:${id}`] = param;
        await utils.writeAchievements(refid, version, achievements);
    }
    send.success();
};

/**
 * Handler for getting the user scores
 */
const readScore = async (req: EamuseInfo, data: any, send: EamuseSend): Promise<any> => {
    const refid = $(data).str('ref_id');
    const version = getVersion(req);
    if (!refid) return send.deny();

    send.object({ music: await getScores(refid, version) });
};

/**
 * High Cheers requests the saved play options for the selected chart before
 * entering a game. Returning CORE's empty success response resets them.
 */
const readOption = async (req: EamuseInfo, data: any, send: EamuseSend): Promise<any> => {
    const refid = $(data).str('ref_id');
    if (!refid) return send.deny();

    const version = getVersion(req);
    const music = $(data).number('music_num');
    const sheet = $(data).number('sheet_num');
    const scores = await utils.readScores(refid, version, true);
    const params = await utils.readParams(refid, version);
    const options = scores.scores[`${music}:${sheet}`]?.options || params.params;
    const value = (name: string, fallback: number) => options[name] ?? fallback;

    return send.object({
        hispeed: K.ITEM('s16', value('hispeed', 10)),
        popkun: K.ITEM('u8', value('popkun', 0)),
        hidden: K.ITEM('bool', value('hidden', 0)),
        hidden_rate: K.ITEM('s16', value('hidden_rate', -1)),
        sudden: K.ITEM('bool', value('sudden', 0)),
        sudden_rate: K.ITEM('s16', value('sudden_rate', -1)),
        randmir: K.ITEM('s8', value('randmir', 0)),
        gauge_type: K.ITEM('s8', value('gauge_type', 0)),
        ojama_0: K.ITEM('u8', value('ojama_0', 0)),
        ojama_1: K.ITEM('u8', value('ojama_1', 0)),
        forever_0: K.ITEM('bool', value('forever_0', 0)),
        forever_1: K.ITEM('bool', value('forever_1', 0)),
        full_setting: K.ITEM('bool', value('full_setting', 1)),
        guide_se: K.ITEM('s8', value('guide_se', 0)),
        guide_se_vol: K.ITEM('u8', value('guide_se_vol', 3)),
        lift: K.ITEM('bool', value('lift', 0)),
        lift_rate: K.ITEM('s16', value('lift_rate', 0)),
        judge_ad: K.ITEM('s8', value('judge_ad', 0)),
        roof: K.ITEM('s16', value('roof', 0)),
        long_pop: K.ITEM('s8', value('long_pop', 1)),
        judge: K.ITEM('u8', value('judge', 1)),
    });
};

/**
 * Read the user scores and format them (profile/friend)
 * @param refid ID of the user
 * @param forFriend If true, format the output for friend request.
 */
const getScores = async (refid: string, version: string, forFriend: boolean = false) => {
    const scoresData = await utils.readScores(refid, version);
    const result = [];

    for (const key in scoresData.scores) {
        const keyData = key.split(':');
        const score = scoresData.scores[key];
        const music = parseInt(keyData[0], 10);
        const sheet = parseInt(keyData[1], 10);
        const clearType = {
            100: 1,
            200: 2,
            300: 3,
            400: 4,
            500: 5,
            600: 6,
            700: 7,
            800: 8,
            900: 9,
            1000: 10,
            1100: 11,
        }[score.clear_type] || 0;

        if (!isOmni && (music > GAME_MAX_MUSIC_ID[version])) {
            continue;
        }
        if ([0, 1, 2, 3].indexOf(sheet) == -1) {
            continue;
        }

        if (forFriend) {
            result.push(K.ATTR({
                music_num: music.toString(),
                sheet_num: sheet.toString(),
                score: score.score.toString(),
                cleartype: clearType.toString(),
                clearrank: getRank(score.score).toString()
            }));
        } else {
            const musicData: any = {
                music_num: K.ITEM('s16', music),
                sheet_num: K.ITEM('u8', sheet),
                score: K.ITEM('s32', score.score),
                clear_type: K.ITEM('u8', clearType),
                clear_rank: K.ITEM('u8', version == 'v29' && score.clear_rank !== undefined ? score.clear_rank : getRank(score.score)),
                cnt: K.ITEM('s16', score.cnt),
            };
            if (version == 'v29') {
                const opts = score.options || {};
                Object.assign(musicData, {
                    cool: K.ITEM('s16', score.cool || 0),
                    great: K.ITEM('s16', score.great || 0),
                    good: K.ITEM('s16', score.good || 0),
                    bad: K.ITEM('s16', score.bad || 0),
                    combo: K.ITEM('s16', score.combo || 0),
                    highlight: K.ITEM('s16', score.highlight || 0),
                    gauge: K.ITEM('s16', score.gauge || 0),
                    gauge_type: K.ITEM('s8', score.gauge_type || 0),
                    slow: K.ITEM('s16', score.slow || 0),
                    fast: K.ITEM('s16', score.fast || 0),
                    ex_gauge_lv: K.ITEM('s8', score.ex_gauge_lv || -1),
                    hidden: K.ITEM('bool', opts.hidden || 0),
                    hidden_rate: K.ITEM('s16', opts.hidden_rate || -1),
                    sudden: K.ITEM('bool', opts.sudden || 0),
                    sudden_rate: K.ITEM('s16', opts.sudden_rate || -1),
                    hispeed: K.ITEM('s16', opts.hispeed || 10),
                    lift: K.ITEM('bool', opts.lift || 0),
                    lift_rate: K.ITEM('s16', opts.lift_rate || 0),
                });
            }
            result.push(musicData);
        }
    }

    return result;
};

/**
 * Return the rank based on the given score
 */
const getRank = (score: number): number => {
    if (score < 50000) {
        return 1
    } else if (score < 62000) {
        return 2
    } else if (score < 72000) {
        return 3
    } else if (score < 82000) {
        return 4
    } else if (score < 90000) {
        return 5
    } else if (score < 95000) {
        return 6
    } else if (score < 98000) {
        return 7
    }
    return 8
}

/**
 * Handler for saving the scores
 */
const writeScore = async (req: EamuseInfo, data: any, send: EamuseSend): Promise<any> => {
    const version = getVersion(req);
    const refid = $(data).str('ref_id');
    if (!refid) return send.deny();

    const music = $(data).number('music_num');
    const sheet = $(data).number('sheet_num');
    const clear_type = {
        1: 100,
        2: 200,
        3: 300,
        4: 400,
        5: 500,
        6: 600,
        7: 700,
        8: 800,
        9: 900,
        10: 1000,
        11: 1100,
    }[$(data).number('clear_type')];
    const score = $(data).number('score');
    const isOptionSave = $(data).bool('is_option_save');
    const options = {
        hispeed: $(data).number('hispeed'),
        popkun: $(data).number('popkun'),
        hidden: $(data).bool('hidden') ? 1 : 0,
        hidden_rate: $(data).number('hidden_rate'),
        sudden: $(data).bool('sudden') ? 1 : 0,
        sudden_rate: $(data).number('sudden_rate'),
        randmir: $(data).number('randmir'),
        gauge_type: $(data).number('gauge_type'),
        lift: $(data).bool('lift') ? 1 : 0,
        lift_rate: $(data).number('lift_rate'),
        judge_ad: $(data).number('judge_ad'),
        roof: $(data).number('roof'),
        long_pop: $(data).number('long_pop'),
        judge: $(data).number('judge'),
    };
    const detail = {
        clear_rank: $(data).number('clear_rank'),
        cool: $(data).number('cool'),
        great: $(data).number('great'),
        good: $(data).number('good'),
        bad: $(data).number('bad'),
        combo: $(data).number('combo'),
        highlight: $(data).number('highlight'),
        gauge: $(data).number('gauge'),
        gauge_type: $(data).number('gauge_type'),
        slow: $(data).number('slow'),
        fast: $(data).number('fast'),
        ex_gauge_lv: $(data).number('ex_gauge_lv'),
        options,
    };

    const key = `${music}:${sheet}`;

    const scoresData = await utils.readScores(refid, version, true);
    if (!scoresData.scores[key]) {
        scoresData.scores[key] = {
            score,
            cnt: 1,
            clear_type,
            ...detail,
        };
    } else {
        const isNewBest = score >= scoresData.scores[key].score;
        scoresData.scores[key] = {
            ...scoresData.scores[key],
            score: Math.max(score, scoresData.scores[key].score),
            cnt: scoresData.scores[key].cnt + 1,
            clear_type: Math.max(clear_type, scoresData.scores[key].clear_type || 0),
            // Result details describe the best score, but chart options are
            // the player's latest selection and must survive every play.
            ...(isNewBest ? detail : { options }),
        };
    }

    await utils.writeScores(refid, version, scoresData);

    // M39 sets this when the player asks the cabinet to retain the selected
    // options. Save immediately rather than relying only on player.write.
    if (version == 'v29' && isOptionSave) {
        const params = await utils.readParams(refid, version);
        Object.assign(params.params, options);
        await utils.writeParams(refid, version, params);
    }

    send.success();
};

/**
 * Get/create the profile based on refid
 * @param refid the profile refid
 * @param name if defined, create/update the profile with the given name
 */
const getProfile = async (refid: string, version: string, name?: string) => {
    const profile = await utils.readProfile(refid);
    const rivals = await utils.readRivals(refid);

    if (name && name.length > 0) {
        profile.name = name;
        await utils.writeProfile(refid, profile);
    }

    let myBest = Array(10).fill(-1);
    const scores = await utils.readScores(refid, version, true);
    if (Object.entries(scores.scores).length > 0) {
        const playCount = new Map();
        for (const key in scores.scores) {
            const keyData = key.split(':');
            const music = parseInt(keyData[0], 10);
            playCount.set(music, (playCount.get(music) || 0) + scores.scores[key].cnt);
        }

        const sortedPlayCount = new Map([...playCount.entries()].sort((a, b) => b[1] - a[1]));
        let i = 0;
        for (const value of sortedPlayCount.keys()) {
            if (i >= 10) {
                break;
            }
            myBest[i] = value;
            i++;
        }
    }

    let player: any = {
        result: K.ITEM('s8', 0),
        account: {
            name: K.ITEM('str', profile.name),
            g_pm_id: K.ITEM('str', profile.friendId),
            staff: K.ITEM('s8', 0),
            item_type: K.ITEM('s16', 0),
            item_id: K.ITEM('s16', 0),
            is_conv: K.ITEM('s8', 0),
            license_data: K.ARRAY('s16', Array(20).fill(-1)),
            my_best: K.ARRAY('s16', myBest),
            active_fr_num: K.ITEM('u8', rivals.rivals.length),

            // TODO: replace with real data
            total_play_cnt: K.ITEM('s16', 100),
            today_play_cnt: K.ITEM('s16', 50),
            consecutive_days: K.ITEM('s16', 365),
            total_days: K.ITEM('s16', 366),
            interval_day: K.ITEM('s16', 1),
            latest_music: K.ARRAY('s16', [-1, -1, -1, -1, -1]),
        },
        netvs: {
            record: K.ARRAY('s16', [0, 0, 0, 0, 0, 0]),
            dialog: [
                K.ITEM('str', 'dialog'),
                K.ITEM('str', 'dialog'),
                K.ITEM('str', 'dialog'),
                K.ITEM('str', 'dialog'),
                K.ITEM('str', 'dialog'),
                K.ITEM('str', 'dialog'),
            ],
            ojama_condition: K.ARRAY('s8', Array(74).fill(0)),
            set_ojama: K.ARRAY('s8', [0, 0, 0]),
            set_recommend: K.ARRAY('s8', [0, 0, 0]),
            netvs_play_cnt: K.ITEM('u32', 0),
        },
        eaappli: {
            relation: K.ITEM('s8', -1),
        },
        custom_cate: {
            valid: K.ITEM('s8', 0),
            lv_min: K.ITEM('s8', -1),
            lv_max: K.ITEM('s8', -1),
            medal_min: K.ITEM('s8', -1),
            medal_max: K.ITEM('s8', -1),
            friend_no: K.ITEM('s8', -1),
            score_flg: K.ITEM('s8', -1),
        },
        // TODO: Navi data ??
        navi_data: {
            raisePoint: K.ARRAY('s32', [-1, -1, -1, -1, -1]),
            navi_param: {
                navi_id: K.ITEM('u16', 0),
                friendship: K.ITEM('s32', 0),
            },
        },
        music: await getScores(refid, version),
        mission: [],
        area: [],
        course_data: [],
        fes: [],
        item: [],
        chara_param: [],
        stamp: [],
    };

    // Add version specific datas
    let params = await utils.readParams(refid, version);
    utils.addExtraData(player, params, getExtraData(version));

    // High Cheers adds an empty event container even on a newly-created
    // profile. The settings themselves are scalar siblings in `config`.
    if (version == 'v29') {
        player.event_p29 = {};
    }

    const achievements = <AchievementsUsaneko>await utils.readAchievements(refid, version, { ...defaultAchievements, version });

    const profileCharas = achievements.charas || {};
    for (const chara_id in profileCharas) {
        player.chara_param.push({
            chara_id: K.ITEM('u16', parseInt(chara_id, 10)),
            friendship: K.ITEM('u16', profileCharas[chara_id]),
        });
    }

    let profileStamps = achievements.stamps;
    if (Object.entries(profileStamps).length == 0) {
        profileStamps = { "0": 0 };
    }
    for (const stamp_id in profileStamps) {
        player.stamp.push({
            stamp_id: K.ITEM('s16', parseInt(stamp_id, 10)),
            cnt: K.ITEM('s16', profileStamps[stamp_id]),
        });
    }

    const profileAreas = achievements.areas || {};
    for (const area_id in profileAreas) {
        const area = profileAreas[area_id];
        player.area.push({
            area_id: K.ITEM('u32', parseInt(area_id, 10)),
            chapter_index: K.ITEM('u8', area.chapter_index),
            gauge_point: K.ITEM('u16', area.gauge_point),
            is_cleared: K.ITEM('bool', area.is_cleared),
            diary: K.ITEM('u32', area.diary),
        });
    }

    const profileCourses = achievements.courses || {};
    for (const course_id in profileCourses) {
        const course = profileCourses[course_id];
        player.course_data.push({
            course_id: K.ITEM('s16', parseInt(course_id, 10)),
            clear_type: K.ITEM('u8', course.clear_type),
            clear_rank: K.ITEM('u8', course.clear_rank),
            total_score: K.ITEM('s32', course.total_score),
            update_count: K.ITEM('s32', course.update_count),
            sheet_num: K.ITEM('u8', course.sheet_num),
        });
    }

    const profileFes = achievements.fes || {};
    for (const fes_id in profileFes) {
        const fesElt = profileFes[fes_id];
        player.fes.push({
            fes_id: K.ITEM('u32', parseInt(fes_id, 10)),
            chapter_index: K.ITEM('u8', fesElt.chapter_index),
            gauge_point: K.ITEM('u16', fesElt.gauge_point),
            is_cleared: K.ITEM('bool', fesElt.is_cleared),
        });
    }

    const profileItems = achievements.items || {};
    for (const key in profileItems) {
        const keyData = key.split(':');
        const type = parseInt(keyData[0], 10);
        const id = parseInt(keyData[1], 10);


        player.item.push({
            type: K.ITEM('u8', type),
            id: K.ITEM('u16', id),
            param: K.ITEM('u16', profileItems[key]),
            is_new: K.ITEM('bool', 0),
            get_time: K.ITEM('u64', BigInt(0)),
        });
    }

    if(U.GetConfig("enable_force_unlock")) {
        for(let i = 1; i <= GAME_MAX_MUSIC_ID[version]; i++) {
            player.item.push({
                type: K.ITEM('u8', 0),
                id: K.ITEM('u16', i),
                param: K.ITEM('u16', 15),
                is_new: K.ITEM('bool', 0),
                get_time: K.ITEM('u64', BigInt(0)),
            });
        }
    }

    // Usaneko
    if (version == 'v24') {        
        const date = new Date();
        const currentDate = date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();

        if (!params.params.mission_date) {
            params.params.mission_date = currentDate;
        }

        // Daily missions
        const missions = achievements.missions || { 1: {}, 2: {}, 3: {} };
        let maxId = parseInt(_.max(Object.keys(missions)), 10);

        for (const id in missions) {
            const mission = missions[id];

            if (currentDate != params.params.mission_date) {
                // New day => Check completion
                if(mission.mission_comp == 1) {
                    // Mission completed => New mission
                    _.max(Object.keys(missions)) + 1
                    player.mission.push({
                        mission_id: K.ITEM('u32', ++maxId),
                        gauge_point: K.ITEM('u32', 0),
                        mission_comp: K.ITEM('u32', 0),
                    });
                } else {
                    // Mission not completed => Reset counter
                    player.mission.push({
                        mission_id: K.ITEM('u32', parseInt(id, 10)),
                        gauge_point: K.ITEM('u32', 0),
                        mission_comp: K.ITEM('u32', 0),
                    });
                }
            } else {
                player.mission.push({
                    mission_id: K.ITEM('u32', parseInt(id, 10)),
                    gauge_point: K.ITEM('u32', mission.gauge_point || 0),
                    mission_comp: K.ITEM('u32', mission.mission_comp || 0),
                });
            }
        }
    }

    // Kaimei Riddles
    if (version == 'v26') {
        // Kaimei! MN tanteisha
        player.riddles_data = {
            sp_riddles: [],
            sh_riddles: []
        }
        player.riddles_data.sp_riddles = [];

        const riddles = achievements.riddles || {};

        let i = 0;
        while (riddles[i] != undefined) {
            const riddle = riddles[i];
            player.riddles_data.sp_riddles.push({
                kaimei_gauge: K.ITEM('u16', riddle.kaimei_gauge || 0),
                is_cleared: K.ITEM('bool', riddle.is_cleared || false),
                riddles_cleared: K.ITEM('bool', riddle.riddles_cleared || false),
                select_count: K.ITEM('u8', riddle.select_count || 0),
                other_count: K.ITEM('u32', riddle.other_count || 0),
            });
            i++;
        };

        // riddle id : 1 to 20
        let randomRiddles = [];
        for (let i = 0; i < 3; i++) {
            let riddle = 0;
            do {
                riddle = Math.floor(Math.random() * 20) + 1;
            } while (randomRiddles.indexOf(riddle) >= 0);

            player.riddles_data.sh_riddles.push({ sh_riddles_id: K.ITEM('u32', riddle) });
        }
    }

    // Unilab
    if (version == 'v27') {
        const teams = achievements.team || [];
        const batteries = achievements.battery || [];

        player.event_p27.first_play = K.ITEM('bool', teams.length == 0);
        player.event_p27.elem_first_play = K.ITEM('bool', batteries.length == 0);

        player.event_p27.team = [];        
        for (const team of teams) {
            player.event_p27.team.push({
                team_id: K.ITEM('s16', team.team_id || 0),
                ex_no: K.ITEM('s16', team.ex_no || 0),
                point: K.ITEM('u32', team.point || 0),
                is_cleared: K.ITEM('bool', team.is_cleared || false),
            });
        };

        player.event_p27.battery = [];
        for (const battery of batteries) {
            player.event_p27.battery.push({
                battery_id: K.ITEM('s16', battery.battery_id || 0),
                energy: K.ITEM('u32', battery.energy || 0),
                is_cleared: K.ITEM('bool', battery.is_cleared || false),
            });
        };
    }

    // Jam&Fizz
    if (version == 'v28') {
        const orders = achievements.order || [];
        const lamps = achievements.neon_lamp || [];
        const stamps = achievements.neko_stamp || [];

        player.event_p28.burger_first_play = K.ITEM('bool', orders.length == 0);

        player.event_p28.order = [];
        for (const order of orders) {
            player.event_p28.order.push({
                id: K.ITEM('s16', order.id || 0),
                point: K.ITEM('u32', order.point || 0),
                patties: K.ARRAY('s16', order.patties || Array(40).fill(-1)),
                is_cleared: K.ITEM('bool', order.is_cleared || false),
            });
        };

        player.event_p28.neon_lamp = [];
        for (const lamp of lamps) {
            player.event_p28.neon_lamp.push({
                id: K.ITEM('s16', lamp.id || 0),
                point: K.ITEM('u32', lamp.point || 0),
                is_cleared: K.ITEM('bool', lamp.is_cleared || false),
            });
        };

        player.event_p28.neko_stamp = [];
        for (const stamp of stamps) {
            player.event_p28.neko_stamp.push({
                id: K.ITEM('s16', stamp.id || 0),
                point: K.ITEM('u32', stamp.point || 0),
                is_cleared: K.ITEM('bool', stamp.is_cleared || false),
            });
        };
    }

    // High Cheers: Pop'n Basket event.
    if (version == 'v29') {
        const baskets = achievements.baskets || [];
        player.event_p29.basket_id = K.ITEM('s16', achievements.basket_id || 0);
        player.event_p29.basket = [];
        for (const basket of baskets) {
            player.event_p29.basket.push({
                id: K.ITEM('s16', basket.id || 0),
                point: K.ITEM('u32', basket.point || 0),
                is_cleared: K.ITEM('bool', basket.is_cleared || false),
            });
        }
    }

    return player;
}

/**
 * Handler for saving the profile
 */
const write = async (req: EamuseInfo, data: any, send: EamuseSend): Promise<any> => {
    const refid = $(data).str('ref_id');
    if (!refid) return send.deny();

    const version = getVersion(req);

    const params = await utils.readParams(refid, version);
    const achievements = <AchievementsUsaneko>await utils.readAchievements(refid, version, { ...defaultAchievements, version });

    utils.getExtraData(data, params, getExtraData(version, true));

    // areas
    if (!achievements.areas) {
        achievements.areas = {};
    }

    for (const area of getNodesAsArray(data, 'area')) {
        const id = $(area).number('area_id');
        const chapter_index = $(area).number('chapter_index');
        const gauge_point = $(area).number('gauge_point');
        const is_cleared = $(area).bool('is_cleared');
        const diary = $(area).number('diary');

        achievements.areas[id] = {
            chapter_index,
            gauge_point,
            is_cleared,
            diary,
        };
    }

    // courses
    if (!achievements.courses) {
        achievements.courses = {};
    }

    for (const course of getNodesAsArray(data, 'course_data')) {
        const id = $(course).number('course_id');
        const clear_type = $(course).number('clear_type');
        const clear_rank = $(course).number('clear_rank');
        const total_score = $(course).number('total_score');
        const update_count = $(course).number('update_count');
        const sheet_num = $(course).number('sheet_num');

        achievements.courses[id] = {
            clear_type,
            clear_rank,
            total_score,
            update_count,
            sheet_num,
        };
    }

    // fes
    if (!achievements.fes) {
        achievements.fes = {};
    }

    for (const fesElt of getNodesAsArray(data, 'fes')) {
        const id = $(fesElt).number('fes_id');
        const chapter_index = $(fesElt).number('chapter_index');
        const gauge_point = $(fesElt).number('gauge_point');
        const is_cleared = $(fesElt).bool('is_cleared');

        achievements.fes[id] = {
            chapter_index,
            gauge_point,
            is_cleared,
        };
    }

    // items
    if (!achievements.items) {
        achievements.items = {};
    }

    for (const item of getNodesAsArray(data, 'item')) {
        const type = $(item).number('type');
        const id = $(item).number('id');
        const param = $(item).number('param');

        const key = `${type}:${id}`;

        achievements.items[key] = param;
    }

    // charas
    if (!achievements.charas) {
        achievements.charas = {};
    }

    for (const chara of getNodesAsArray(data, 'chara_param')) {
        const id = $(chara).number('chara_id');
        const param = $(chara).number('friendship');

        achievements.charas[id] = param;
    }

    // stamps
    if (!achievements.stamps) {
        achievements.stamps = { '0': 0 };
    }

    for (const stamp of getNodesAsArray(data, 'stamp')) {
        const id = $(stamp).number('stamp_id');
        const cnt = $(stamp).number('cnt');

        achievements.stamps[id] = cnt;
    }

    // Usaneko
    if (version == 'v24') {
        // Daily missions
        const date = new Date();
        params.params.mission_date = date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();

        achievements.missions = {};
        for (const mission of getNodesAsArray(data, 'mission')) {
            const id = $(mission).number('mission_id');
            const gauge_point = $(mission).number('gauge_point');
            const mission_comp = $(mission).number('mission_comp');

            achievements.missions[id] = {
                gauge_point,
                mission_comp,
            };
        }
    }

    // Kamei Riddles
    if (version == 'v26') {
        const playedRiddle = <number>params.params.sp_riddles_id;
        let riddlesData = _.get(data, 'riddles_data', []);
        if (!achievements.riddles) {
            achievements.riddles = {};
        }

        let i = 0;
        for (const riddle of getNodesAsArray(riddlesData, 'sp_riddles')) {
            const kaimei_gauge = $(riddle).number('kaimei_gauge', 0);
            const is_cleared = $(riddle).bool('is_cleared');
            const riddles_cleared = $(riddle).bool('riddles_cleared');
            let select_count = $(riddle).number('select_count', 0);
            const other_count = $(riddle).number('other_count', 0);

            if (riddles_cleared || select_count >= 3) {
                // Show all hint if riddle cleared.
                select_count = 3
            } else if (playedRiddle == i) {
                // Add a hint if riddle is select. 
                select_count++;
            }

            achievements.riddles[i] = {
                kaimei_gauge,
                is_cleared,
                riddles_cleared,
                select_count,
                other_count,
            };
            i++;
        }
    }

    // Unilab
    if (version == 'v27') {
        let eventData = _.get(data, 'event_p27', []);

        if (_.isNil(achievements.team)) {
            achievements.team = [];
        }
        for (const team of getNodesAsArray(eventData, 'team')) {
            const team_id = $(team).number('team_id');
            const ex_no = $(team).number('ex_no');
            const point = $(team).number('point');
            const is_cleared = $(team).bool('is_cleared');

            let savedTeam = _.find(achievements.team, {'team_id': team_id});
            if(_.isUndefined(savedTeam)) {
                achievements.team.push({
                    team_id,
                    ex_no,
                    point,
                    is_cleared
                });
            } else {
                savedTeam.ex_no = ex_no;
                savedTeam.point = point;
                savedTeam.is_cleared = is_cleared;
            }
        }

        if (_.isNil(achievements.battery)) {
            achievements.battery = [];
        }
        for (const battery of getNodesAsArray(eventData, 'battery')) {
            const battery_id = $(battery).number('battery_id');
            const energy = $(battery).number('energy');
            const is_cleared = $(battery).bool('is_cleared');

            let savedBattery = _.find(achievements.battery, {'battery_id': battery_id});
            if(_.isUndefined(savedBattery)) {
                achievements.battery.push({
                    battery_id,
                    energy,
                    is_cleared
                });
            } else {
                savedBattery.energy = energy;
                savedBattery.is_cleared = is_cleared;
            }
        }
    }

    // Jam&Fizz
    if (version == 'v28') {
        let eventData = _.get(data, 'event_p28', []);

        if (_.isNil(achievements.order)) {
            achievements.order = [];
        }
        for (const order of getNodesAsArray(eventData, 'order')) {
            const id = $(order).number('id');
            const point = $(order).number('point');
            const patties = $(order).numbers('patties');
            const is_cleared = $(order).bool('is_cleared');

            let savedOrder = _.find(achievements.order, {'id': id});
            if(_.isUndefined(savedOrder)) {
                achievements.order.push({
                    id,
                    point,
                    patties,
                    is_cleared
                });
            } else {
                savedOrder.point = point;
                savedOrder.patties = patties;
                savedOrder.is_cleared = is_cleared;
            }
        }

        if (_.isNil(achievements.neon_lamp)) {
            achievements.neon_lamp = [];
        }
        for (const lamp of getNodesAsArray(eventData, 'neon_lamp')) {
            const id = $(lamp).number('id');
            const point = $(lamp).number('point');
            const is_cleared = $(lamp).bool('is_cleared');

            let savedLamp = _.find(achievements.neon_lamp, {'id': id});
            if(_.isUndefined(savedLamp)) {
                achievements.neon_lamp.push({
                    id,
                    point,
                    is_cleared
                });
            } else {
                savedLamp.point = point;
                savedLamp.is_cleared = is_cleared;
            }
        }

        if (_.isNil(achievements.neko_stamp)) {
            achievements.neko_stamp = [];
        }
        for (const stamp of getNodesAsArray(eventData, 'neko_stamp')) {
            const id = $(stamp).number('id');
            const point = $(stamp).number('point');
            const is_cleared = $(stamp).bool('is_cleared');

            let savedStamp = _.find(achievements.neko_stamp, {'id': id});
            if(_.isUndefined(savedStamp)) {
                achievements.neko_stamp.push({
                    id,
                    point,
                    is_cleared
                });
            } else {
                savedStamp.point = point;
                savedStamp.is_cleared = is_cleared;
            }
        }
    }

    // High Cheers: Pop'n Basket event.
    if (version == 'v29') {
        const eventData = _.get(data, 'event_p29', []);
        achievements.basket_id = $(eventData).number('basket_id', achievements.basket_id || 0);

        if (_.isNil(achievements.baskets)) {
            achievements.baskets = [];
        }
        for (const basket of getNodesAsArray(eventData, 'basket')) {
            const id = $(basket).number('id');
            const point = $(basket).number('point');
            const is_cleared = $(basket).bool('is_cleared');
            const savedBasket = _.find(achievements.baskets, { id });
            if (_.isUndefined(savedBasket)) {
                achievements.baskets.push({ id, point, is_cleared });
            } else {
                savedBasket.point = point;
                savedBasket.is_cleared = is_cleared;
            }
        }
    }

    await utils.writeParams(refid, version, params);
    await utils.writeAchievements(refid, version, achievements);

    send.success();
};

/**
 * Handler for sending rivals
 */
const friend = async (req: EamuseInfo, data: any, send: EamuseSend): Promise<any> => {
    const refid = $(data).attr()['ref_id'];
    const no = parseInt($(data).attr()['no'], 10);
    const version = getVersion(req);

    const rivals = await utils.readRivals(refid);

    if (no < 0 || no >= rivals.rivals.length) {
        send.object({ result: K.ITEM('s8', 2) });
        return;
    }

    const profile = await utils.readProfile(rivals.rivals[no]);
    const params = await utils.readParams(rivals.rivals[no], version);

    const friend = {
        friend: {
            no: K.ITEM('s16', no),
            g_pm_id: K.ITEM('str', profile.friendId),
            name: K.ITEM('str', profile.name),
            chara: K.ITEM('s16', params.params.chara || -1),
            is_open: K.ITEM('s8', 1),
            music: await getScores(rivals.rivals[no], version, true),
        }
    }

    send.object(friend);
}
const getPhase = (version: String): Phase[] => {
    let phase = [];
    switch(version) {
        // High Cheers currently reuses the established phase table. Its
        // profile/event data is deliberately kept separate from Jam&Fiz.
        case 'v29':
        case 'v28':
            phase = PHASE['v28'];
        case 'v27':
            phase = _.unionBy(phase, PHASE['v27'], 'id');
            break;
        case 'v26':
            phase = PHASE['v26'];
        case 'v25':
            phase = _.unionBy(phase, PHASE['v25'], 'id');
        case 'v24':
            phase = _.unionBy(phase, PHASE['v24'], 'id');
    }
    return _.sortBy(phase, 'id');
}

const getExtraData = (version: String, full: boolean = false): ExtraData => {
    // _.merge mutates its first argument. Use a new object so loading a newer
    // profile cannot accidentally inherit an older game's event_p28 fields.
    let extraData = _.cloneDeep(EXTRA_DATA_COMMON);
    if (full) {
        extraData = _.merge(extraData, EXTRA_DATA_V29, EXTRA_DATA_V28, EXTRA_DATA_V27, EXTRA_DATA_V26);
    } else {
        switch(version) {
            case 'v29':
                extraData = _.merge(extraData, EXTRA_DATA_V29);
                break;
            case 'v28':
                extraData = _.merge(extraData, EXTRA_DATA_V28);
                break;
            case 'v27':
                extraData = _.merge(extraData, EXTRA_DATA_V27);
                break;
            case 'v26':
                extraData = _.merge(extraData, EXTRA_DATA_V26);
                break;
        }
    }
    return extraData;
}

const getNodesAsArray = (data: any, nodeName: string): any[] => {
    let elements = _.get(data, nodeName, []);
    if (!_.isArray(elements)) {
        elements = [elements];
    }

    return elements;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let isOmni = false;

const getVersion = (req: EamuseInfo): string => {
    if (req.model.indexOf('J:A:X') >= 0 || req.model.indexOf('J:B:X') >= 0 || req.model.indexOf('J:C:X') >= 0|| req.model.indexOf('J:D:X') >= 0) {
        isOmni = true;
    }

    // M39 is pop'n music High Cheers. It uses the new `player.*` protocol and
    // must not receive the Jam&Fiz event_p28 profile structure.
    if (req.model.startsWith('M39:')) {
        return 'v29';
    }

    const date: number = parseInt(req.model.match(/:(\d*)$/)[1]);
    if (date >= 2025121500) {
        return 'v29';
    }else if (date >= 2024092500) {
        return 'v28';
    } else if (date >= 2022091300 && date < 2024092500) {
        return 'v27';
    } else if (date >= 2021042600 && date < 2022091300) {
        return 'v26';
    } else if (date >= 2018101700 && date < 2021042600 ) {
        return 'v25';
    } else {
        return 'v24';
    }
}

const GAME_MAX_MUSIC_ID = {
    v24: 1704,
    v25: 1877,
    v26: 2019,
    v27: 2188,
    v28: 2259,
    // Confirmed from M39's built-in Music Checker.
    v29: 2373
}

const GAME_MAX_DECO_ID = {
    v24: 97,
    v25: 133,
    v26: 133,
    v27: 81,
    v28: 81, // Need correct value
    v29: 81 // Need correct value
}

const defaultAchievements: AchievementsUsaneko = {
    collection: 'achievements',
    version: null,
    areas: {},
    courses: {},
    fes: {},
    items: {},
    charas: {},
    stamps: {},
    riddles: {},
    missions: {},
    team: [],
    battery: [],
    order: [],
    neon_lamp: [],
    neko_stamp: [],
    basket_id: 0,
    baskets: []
}

const PHASE = {
    v24: [
        { id: 0, p: 11 },  // Default song phase availability (0-11)
        { id: 1, p: 2 },   // Unknown event (0-2)
        { id: 2, p: 2 },   // Holiday Greeting (0-2)
        { id: 3, p: 4 },   // Unknown event (0-2)
        { id: 4, p: 1 },   // Unknown event (0-1)
        { id: 5, p: 0 },   // Enable Net Taisen (0-1)
        { id: 6, p: 1 },   // Enable NAVI-kun shunkyoku toujou, allows song 1608 to be unlocked (0-1)
        { id: 7, p: 1 },   // Unknown event (0-1)
        { id: 8, p: 2 },   // Unknown event (0-2)
        { id: 9, p: 2 },   // Daily Mission (0-2)
        { id: 10, p: 15 }, // NAVI-kun Song phase availability (0-15)
        { id: 11, p: 1 },  // Unknown event (0-1)
        { id: 12, p: 2 },  // Unknown event (0-2)
        { id: 13, p: 1 },  // Enable Pop'n Peace preview song (0-1)
    ],
    v25: [
        { id: 0, p: 23 },  // Default song phase availability (0-23)
        { id: 1, p: 4 },   // Unknown event (0-4)
        { id: 10, p: 30 }, // NAVI-kun Song phase availability (0-30)
        { id: 14, p: 39 }, // Stamp Card Rally (0-39)
        { id: 15, p: 2 },  // Unknown event (0-2)
        { id: 16, p: 3 },  // Unknown event (0-3)
        { id: 17, p: 8 },  // Unknown event (0-8)
        { id: 18, p: 1 },  // FLOOR INFECTION event (0-1)
        { id: 19, p: 1 },  // Pop'n music × NOSTALGIA kyouenkai (0-1)
        { id: 20, p: 13 }, // Event archive (0-13)
        { id: 21, p: 20 }, // Pop'n event archive (0-20)
        { id: 22, p: 2 },  // バンめし♪ ふるさとグランプリ (0-2)
        { id: 23, p: 1 },  // いちかのBEMANI投票選抜戦2019 (0-1)
        { id: 24, p: 1 },  // ダンキラ!!! × pop'n music (0-1)
    ],
    v26: [
        { id: 0, p: 30 },  // Music phase (0: No unlock, 1-30: steps)
        { id: 25, p: 62 }, // M&N event (0: disable, 62: all characters)
        { id: 26, p: 3 },  // Unknown event (0-3)
        { id: 27, p: 2 },  // peace soundtrack hatsubai kinen SP (0: not started, 1: enabled, 2: ended)
        { id: 28, p: 2 },  // MZD no kimagure tanteisha joshu (0: not started, 1: enabled, 2: ended)
        { id: 29, p: 5 },  // Shutchou! pop'n quest Lively (0: not started, 1-4: step enabled, 5: ended)
        { id: 30, p: 6 },  // Shutchou! pop'n quest Lively II (0: not started, 1-5: step enabled, 6: ended)
    ],
    v27: [
        { id: 0, p: 6 },  // Music phase (0: No unlock, 1-6: steps)
        { id: 1, p: 6 },  // Permanent song unlocks (0-6)
        { id: 2, p: 4 },  // KAC 2023 (0/2/4: disabled, 1: Caldwell 99, 3: Hexer / mathematical good-bye)
        { id: 3, p: 0 },  // Net Taisen (0: diabled, 1: enabled, 2: enabled + local)
        { id: 4, p: 7 },  // Paseli Festival Attract mode ads (1/5/7: disabled, others : show specific ad)
        { id: 5, p: 48 }, // Narunaru♪ UniLab jikkenshitsu! event (0: not started, 1-47: steps, 48: ended)
        { id: 6, p: 2 },  // Super Unilab BOOST! (0: disabled, 1: enabled, 2: ended)
        { id: 7, p: 6 },  // Shutchou! pop'n quest Lively II ~nostalgia~ (0: disabled, 1-5: steps, 6: ended)
        { id: 8, p: 2 },  // Attract mode ad campaign (0: disabled, 1: enabled, 2: ended)
        { id: 9, p: 44 }, // Kakusei no Elem event (0: not started, 1-44: steps)
        { id: 10, p: 1 }, // Awakening Elem (0: disabled, 1: enabled)
        { id: 11, p: 2 }, // CanCan's Super Awakening Boost (0: disabled, 1: enabled, 2: ended)
        { id: 12, p: 2 }, // BEMANI Pro League 3 ad in attract mode (0: disabled, 1: enabled, 2: ended)
        { id: 13, p: 2 }, // Unknown event (0-2)
    ],
    v28: [
        { id: 0, p: 12 },  // Music phase (0: No unlock, 1-12: steps)
        { id: 1, p: 9 },   // Permanent song unlocks (0-9)
        { id: 4, p: 9 },   // Paseli Festival Attract mode ads (1/5/7/9: disabled, others : show specific ad)
        { id: 14, p: 4 },  // Unknown event (0-4)
        { id: 15, p: 33 }, // Poppin' Burger (0: disabled, 1-33: steps)
        { id: 16, p: 2 },  // Unknown event (0-2)
        { id: 17, p: 1 },  // Unknown event (0-1)
        { id: 18, p: 3 },  // Unknown event (0-3)
    ]
}

const EXTRA_DATA_COMMON: ExtraData = {
    play_id: { type: 's32', path: 'account', default: 0 },
    start_type: { type: 's8', path: 'account', default: 0 },
    tutorial: { type: 's16', path: 'account', default: -1 },
    area_id: { type: 's16', path: 'account', default: 51 },
    read_news: { type: 's16', path: 'account', default: 0 },
    nice: { type: 's16', path: 'account', default: Array(30).fill(-1), isArray: true },
    favorite_chara: { type: 's16', path: 'account', default: Array(20).fill(-1), isArray: true },
    special_area: { type: 's16', path: 'account', default: Array(8).fill(-1), isArray: true },
    chocolate_charalist: { type: 's16', path: 'account', default: Array(5).fill(-1), isArray: true },
    chocolate_sp_chara: { type: 's32', path: 'account', default: 0 },
    chocolate_pass_cnt: { type: 's32', path: 'account', default: 0 },
    chocolate_hon_cnt: { type: 's32', path: 'account', default: 0 },
    chocolate_giri_cnt: { type: 's32', path: 'account', default: 0 },
    chocolate_kokyu_cnt: { type: 's32', path: 'account', default: 0 },
    teacher_setting: { type: 's16', path: 'account', default: Array(10).fill(-1), isArray: true },
    welcom_pack: { type: 'bool', path: 'account', default: 0 },
    use_navi: { type: 's16', path: 'account', default: 0 },
    ranking_node: { type: 's32', path: 'account', default: 0 },
    chara_ranking_kind_id: { type: 's32', path: 'account', default: 0 },
    navi_evolution_flg: { type: 's8', path: 'account', default: 0 },
    ranking_news_last_no: { type: 's32', path: 'account', default: 0 },
    power_point: { type: 's32', path: 'account', default: 0 },
    player_point: { type: 's32', path: 'account', default: 300 },
    power_point_list: { type: 's32', path: 'account', default: [0], isArray: true },

    mode: { type: 'u8', path: 'config', default: 0 },
    chara: { type: 's16', path: 'config', default: 0 },
    music: { type: 's16', path: 'config', default: 0 },
    sheet: { type: 'u8', path: 'config', default: 0 },
    category: { type: 's8', path: 'config', default: 0 },
    sub_category: { type: 's8', path: 'config', default: 0 },
    chara_category: { type: 's8', path: 'config', default: 0 },
    course_id: { type: 's16', path: 'config', default: 0 },
    course_folder: { type: 's8', path: 'config', default: 0 },
    ms_banner_disp: { type: 's8', path: 'config', default: 0 },
    ms_down_info: { type: 's8', path: 'config', default: 0 },
    ms_side_info: { type: 's8', path: 'config', default: 0 },
    ms_raise_type: { type: 's8', path: 'config', default: 0 },
    ms_rnd_type: { type: 's8', path: 'config', default: 0 },
    banner_sort: { type: 's8', path: 'config', default: 0 },

    hispeed: { type: 's16', path: 'option', default: 10 },
    popkun: { type: 'u8', path: 'option', default: 0 },
    hidden: { type: 'bool', path: 'option', default: 0 },
    hidden_rate: { type: 's16', path: 'option', default: -1 },
    sudden: { type: 'bool', path: 'option', default: 0 },
    sudden_rate: { type: 's16', path: 'option', default: -1 },
    randmir: { type: 's8', path: 'option', default: 0 },
    gauge_type: { type: 's8', path: 'option', default: 0 },
    ojama_0: { type: 'u8', path: 'option', default: 0 },
    ojama_1: { type: 'u8', path: 'option', default: 0 },
    forever_0: { type: 'bool', path: 'option', default: 0 },
    forever_1: { type: 'bool', path: 'option', default: 0 },
    full_setting: { type: 'bool', path: 'option', default: 0 },
    judge: { type: 'u8', path: 'option', default: 0 },
    guide_se: { type: 's8', path: 'option', default: 0 },

    ep: { type: 'u16', path: 'info', default: 0 },

    effect_left: { type: 'u16', path: 'customize', default: 0 },
    effect_center: { type: 'u16', path: 'customize', default: 0 },
    effect_right: { type: 'u16', path: 'customize', default: 0 },
    hukidashi: { type: 'u16', path: 'customize', default: 0 },
    comment_1: { type: 'u16', path: 'customize', default: 0 },
    comment_2: { type: 'u16', path: 'customize', default: 0 },
}

const EXTRA_DATA_V26: ExtraData = {
    card_again_count: { type: 's16', path: 'account', default: 0 },
    sp_riddles_id: { type: 's16', path: 'account', default: -1 },
    point: { type: 'u32', path: 'event2021', default: 0 }, // for peace soundtrack hatsubai kinen SP
    step: { type: 'u8', path: 'event2021', default: 0 }, // for Shutchou! pop'n quest Lively
    quest_point: { type: 'u32', path: 'event2021', default: Array(8).fill(0), isArray: true }, // for Shutchou! pop'n quest Lively
    step_nos: { type: 'u8', path: 'event2021', default: 0 }, // for Shutchou! pop'n quest Lively II
    quest_point_nos: { type: 'u32', path: 'event2021', default: Array(13).fill(0), isArray: true }, // for Shutchou! pop'n quest Lively II
}

const EXTRA_DATA_V27: ExtraData = {
    lift: { type: 'bool', path: 'option', default: 0 },
    lift_rate: { type: 's16', path: 'option', default: 0 },
    team_id: { type: 's16', path: 'event_p27', default: 0 },
    select_battery_id: { type: 's16', path: 'event_p27', default: 1 },
    today_first_play: { type: 'bool', path: 'event_p27', default: 1 },
}

const EXTRA_DATA_V28: ExtraData = {
    sc_news_no: { type: 's32', path: 'account', default: 0 },
    guide_se_vol: { type: 'u8', path: 'option', default: 0 },
    lift: { type: 'bool', path: 'option', default: 0 },
    lift_rate: { type: 's16', path: 'option', default: 0 },
    burger_daily_bonus: { type: 'bool', path: 'event_p28', default: true },
    current_order: { type: 's16', path: 'event_p28', default: Array(3).fill(-1), isArray: true },
    neko_daily_bonus: { type: 'bool', path: 'event_p28', default: true },
}

// Fields observed in High Cheers (M39) player.write requests.
const EXTRA_DATA_V29: ExtraData = {
    // Carried forward settings which M39 still requires, excluding the
    // Jam&Fiz-only event_p28 data.
    sc_news_no: { type: 's32', path: 'account', default: 0 },
    latest_music: { type: 's16', path: 'account', default: Array(30).fill(-1), isArray: true },
    popn_class: { type: 's8', path: 'account', default: 1 },
    read_policy: { type: 's16', path: 'account', default: 0 },
    language: { type: 's8', path: 'account', default: -1 },
    guide_se_vol: { type: 'u8', path: 'option', default: 3 },
    lift: { type: 'bool', path: 'option', default: 0 },
    lift_rate: { type: 's16', path: 'option', default: 0 },
    disp_setting: { type: 's8', path: 'config', default: 0 },
    h_vol: { type: 's8', path: 'config', default: 1 },
    hiscore_disp: { type: 'bool', path: 'config', default: 0 },
    lane_type: { type: 's8', path: 'config', default: 0 },
    brightness: { type: 's8', path: 'config', default: 32 },
    key_beam: { type: 's8', path: 'config', default: 5 },
    lane_line: { type: 's8', path: 'config', default: 1 },
    judge_ad: { type: 's8', path: 'option', default: 0 },
    roof: { type: 's16', path: 'option', default: 0 },
    long_pop: { type: 's8', path: 'option', default: 1 },
    seal_0: { type: 'u16', path: 'customize', default: 0 },
    seal_1: { type: 'u16', path: 'customize', default: 0 },
    seal_2: { type: 'u16', path: 'customize', default: 0 },
    seal_3: { type: 'u16', path: 'customize', default: 0 },
    seal_4: { type: 'u16', path: 'customize', default: 0 },
    seal_5: { type: 'u16', path: 'customize', default: 0 },
    seal_6: { type: 'u16', path: 'customize', default: 0 },
    seat: { type: 'u16', path: 'customize', default: 0 },
    touch_th: { type: 'u16', path: 'customize', default: 0 },
    lane_cover: { type: 'u16', path: 'customize', default: 0 },
    stage_bk: { type: 'u16', path: 'customize', default: 0 },
    highlight: { type: 'u16', path: 'customize', default: 0 },
}
