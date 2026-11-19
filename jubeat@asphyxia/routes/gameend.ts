import {Score, ScoreHistory} from "../models/score"
import Profile               from "../models/profile";
import {Course}              from "../models/course";
import {COURSE_STATUS}       from "../static/course";

export const handleRegistEndRoute = async (_: EamuseInfo, {data}: any, send: EamuseSend) => {
    const refId = $(data).str("player.refid");
    if(!refId) return send.deny();

    const profile = await DB.FindOne<Profile>(refId, {collection: "profile"});
    if(!profile) return send.deny();

    const courses = $(data).elements("player.course_list.course");
    const tunes = $(data).elements("result.tune");
    const select_course = $(data).elements("player.select_course");
    const course_cleared: {[courseId: number]: boolean} = {};

    if(select_course){
        for(const course of select_course){
            course_cleared[course.attr("").id] = course.bool("is_cleared");
        }
    }

    for(const course of courses){
        const courseID = course.attr("").id;
        await updateCourse(refId, {
            courseID,
            seen: (course.number("status") & COURSE_STATUS.SEEN) != 0,
            played: (course.number("status") & COURSE_STATUS.PLAYED) != 0,
            cleared: course_cleared[courseID] || (course.number("status") & COURSE_STATUS.CLEARED) != 0,
        });
    }

    for(const tune of tunes){
        profile.musicId = tune.number("music");
        profile.seqId = parseInt(tune.attr("player.score").seq);
        await updateScore(refId, tune);
    }

    profile.eventFlag = Number($(data).bigint("player.event_flag"));
    profile.rankSort = $(data).number("player.last.settings.rank_sort");
    profile.comboDisp = $(data).number("player.last.settings.combo_disp");

    profile.lastPlayTime = Number($(data).bigint("info.play_time"));
    profile.lastShopname = $(data).str("info.shopname");
    profile.lastAreaname = $(data).str("info.areaname");

    profile.tuneCount = $(data).number("player.info.tune_cnt");
    profile.saveCount = $(data).number("player.info.save_cnt");
    profile.savedCount = $(data).number("player.info.saved_cnt");
    profile.fcCount = $(data).number("player.info.fc_cnt");
    profile.exCount = $(data).number("player.info.ex_cnt");
    profile.clearCount = $(data).number("player.info.clear_cnt");
    profile.matchCount = $(data).number("player.info.match_cnt");
    profile.expertOption = $(data).number("player.last.expert_option");
    profile.matching = $(data).number("player.last.settings.matching");
    profile.hazard = $(data).number("player.last.settings.hazard");
    profile.hard = $(data).number("player.last.settings.hard");
    profile.targetType = $(data).number("player.last.settings.target_type");
    profile.randomOption = $(data).number("player.last.settings.random_option");
    profile.judgeDisp = $(data).number("player.last.settings.judge_disp");
    profile.bonusPoints = 1000 //$(data).number("player.info.bonus_tune_points"); // 무조건 1000되게
    profile.isBonusPlayed = $(data).bool("player.info.is_bonus_tune_played");
    profile.totalBestScore = $(data).number("player.info.total_best_score.normal");
    profile.clearMaxLevel = $(data).number("player.info.clear_max_level");
    profile.fcMaxLevel = $(data).number("player.info.fc_max_level");
    profile.exMaxLevel = $(data).number("player.info.ex_max_level");
    profile.navi = Number($(data).bigint("player.navi.flag"));
    profile.isFirst = $(data).bool("player.free_first_play.is_applied");
    profile.marker = $(data).number("player.last.settings.marker");
    profile.theme = $(data).number("player.last.settings.theme");
    profile.title = $(data).number("player.last.settings.title");
    profile.parts = $(data).number("player.last.settings.parts");
    profile.sort = $(data).number("player.last.sort");
    profile.category = $(data).number("player.last.category");

    profile.commuList = $(data).numbers("player.item.commu_list");
    profile.secretList = $(data).numbers("player.item.secret_list");
    profile.themeList = $(data).number("player.item.theme_list");
    profile.markerList = $(data).numbers("player.item.marker_list");
    profile.titleList = $(data).numbers("player.item.title_list");
    profile.partsList = $(data).numbers("player.item.parts_list");
    profile.secretListNew = $(data).numbers("player.item.new.secret_list");
    profile.themeListNew = $(data).numbers("player.item.new.theme_list");
    profile.markerListNew = $(data).numbers("player.item.new.marker_list");

    try{
        await DB.Update<Profile>(refId, {collection: "profile"}, profile);
        return send.object({
            data: {
                player: {session_id: K.ITEM("s32", 1)},
                collabo: {deller: K.ITEM("s32", 0)}
            }
        }, {compress: true});
    }catch(e: any){
        console.error(e.stack);
        console.error(`Profile save failed: ${e.message}`);
        return send.deny();
    }
}

const updateScore = async (refId: string, tuneData: KDataReader): Promise<boolean> => {
    try{
        const data = {
            bestmusicRate: tuneData.number("player.best_music_rate"),
            musicRate: tuneData.number("player.music_rate"),
            musicId: tuneData.number("music"),
            seq: parseInt(tuneData.attr("player.score").seq),
            score: tuneData.number("player.score"),
            clear: parseInt(tuneData.attr("player.score").clear),
            isHardMode: tuneData.bool("player.is_hard_mode"),
            bestScore: tuneData.number("player.best_score"),
            bestClear: tuneData.number("player.best_clear"),
            playCount: tuneData.number("player.play_cnt"),
            clearCount: tuneData.number("player.clear_cnt"),
            perfect: tuneData.number('player.nr_perfect'),
            great: tuneData.number('player.nr_great'),
            good: tuneData.number('player.nr_good'),
            poor: tuneData.number('player.nr_poor'),
            miss: tuneData.number('player.nr_miss'),
            fullcomboCount: tuneData.number("player.fc_cnt"),
            excellentCount: tuneData.number("player.ex_cnt"),
            play_mbar: tuneData.numbers("player.play_mbar"),
            ...tuneData.element("player.mbar") && {mbar: tuneData.numbers("player.mbar")}
        }
        await DB.Upsert<Score>(
            refId,
            {
                collection: "score",
                musicId: data.musicId,
                seq: data.seq,
                isHardMode: +data.isHardMode,
            },
            {
                $set: {
                    musicId: data.musicId,
                    seq: data.seq,
                    score: data.bestScore,
                    clear: data.bestClear,
                    musicRate: data.musicRate > data.bestmusicRate ? data.musicRate : data.bestmusicRate,
                    ...data.mbar && {bar: data.mbar},
                    playCount: data.playCount,
                    clearCount: data.clearCount,
                    fullcomboCount: data.fullcomboCount,
                    excellentCount: data.excellentCount,
                    isHardMode: +data.isHardMode
                }
            }
        );
        DB.Insert<ScoreHistory>(
            refId,
            {
                collection: "score.history",
                musicId: data.musicId,
                seq: data.seq,
                score: data.score,
                musicRate: data.musicRate,
                bar: data.play_mbar,
                perfect: data.perfect,
                great: data.great,
                good: data.good,
                poor: data.poor,
                miss: data.miss,
                fullcombo: +(data.poor + data.miss < 1),
                isHardMode: +data.isHardMode
            }
        ).then().catch(e => {console.error("Score history saving failed: "); console.dir(e)});
        /*{
            '@attr': { id: '1' },
            music: { '@attr': [Object], '@content': [Array] },
            timestamp: { '@attr': [Object], '@content': [Array] },
            player: {
                '@attr': [Object],
                score: [Object],
                music_rate: [Object],
                marker: [Object],
                theme: [Object],
                category: [Object],
                is_recommend: [Object],
                elapsed_time: [Object],
                is_timeout: [Object],
                is_hard_mode: [Object],
                is_hazard_end: [Object],
                is_consumed_ex_option: [Object],
                nr_perfect: [Object],
                nr_great: [Object],
                nr_good: [Object],
                nr_poor: [Object],
                nr_miss: [Object],
                is_first_play: [Object],
                is_first_clear: [Object],
                is_first_fullcombo: [Object],
                is_first_excellent: [Object],
                is_first_nogray: [Object],
                is_first_all_yellow: [Object],
                best_score: [Object],
                best_music_rate: [Object],
                best_clear: [Object],
                play_cnt: [Object],
                clear_cnt: [Object],
                fc_cnt: [Object],
                ex_cnt: [Object],
                play_mbar: [Object]
            },
            meeting: { single: [Object] }
        }*/
        return true;
    }catch(e: any){
        console.error("Score saving failed: ", e.stack);
        return false;
    }
};

const updateCourse = async (refId: string, data: any): Promise<boolean> => {
    try{
        await DB.Upsert<Course>(refId, {
            collection: "course",
            courseId: data.courseID,
        }, {
            $set: {
                courseId: data.courseID,
                seen: data.seen,
                played: data.played,
                cleared: data.cleared
            }
        });
        return true;
    }catch(e: any){
        console.error("Course saving failed: ", e.stack);
        return false;
    }
};
