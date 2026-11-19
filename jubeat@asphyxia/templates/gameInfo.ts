import {emoList, shopList} from "../static/course"

function initializeArray(numberSize: number, disableArray: (number | [number, number])[]): number[] {
    if (numberSize <= 0 || !Number.isInteger(numberSize)) {
        throw new Error('numberSize must be a positive integer')
    }
    if (!Array.isArray(disableArray)) {
        throw new Error('disableArray must be an array')
    }

    // Initialize array with all bits set to 1
    const resultArray = new Array(numberSize).fill(-1)

    for (let i = 0; i < disableArray.length; i++) {
        const item = disableArray[i]
        if (Array.isArray(item)) {
            const [start, end] = item
            if (start < 0 || end >= numberSize * 32 || start > end) {
                throw new Error(`Invalid range in disableArray: [${start}, ${end}]`)
            }
            for (let j = start; j < end; j++) {
                const arrayIndex = Math.floor(j / 32)
                const bitPosition = j % 32
                resultArray[arrayIndex] &= ~(1 << bitPosition)
            }
        } else {
            if (item < 1 || item >= numberSize * 32) {
                throw new Error(`Invalid item in disableArray: ${item}`)
            }
            const arrayIndex = Math.floor(item / 32)
            const bitPosition = item % 32
            resultArray[arrayIndex] &= ~(1 << bitPosition)
        }
    }

    return resultArray
}

// >=1508 all ave songs
var pick_up_array = initializeArray(64, [[0, 1508]])
var theme_array = initializeArray(16, [9, 10])
var marker_array = initializeArray(16, [41, 43])

// Release code from the model string ("L44:J:A:A:2026061602"); unknown -> newest rules.
function releaseCode(info?: EamuseInfo): number {
    const code = Number(String(info?.model ?? "").split(":").pop())
    return Number.isFinite(code) && code > 0 ? code : Number.MAX_SAFE_INTEGER
}

// Songs removed from later builds stay listed in the music data, so their
// bits must be cleared or the client shows broken entries.
function disabledSongs(version: number): number[] {
    const songs = [1262, 1675]  // 90000048, 11001007
    if (version >= 2024073000) songs.push(1621)  // 11000113 (やっぱり雨は降るんだね - ツユ)
    if (version >= 2025090200) songs.push(1532, 1533)  // 11000025 (一途), 11000026 (ミックスナッツ)
    if (version >= 2025102900) songs.push(1565)  // 11000058 (エジソン - 水曜日のカンパネラ)
    return songs
}

/*
var pick_up_array = Array(64).fill(-1);
for(var i=0; i<=46; i++){
  pick_up_array[i] = 0;
}
pick_up_array[47] = 17592186044415;
*/
/*
non-avaliable
song
90000048 1262
11000113 1621
11001007 1675

theme
0042 41
0044 43

background
09 8
10 9csde
*/

export const getGameInfo = (info?: EamuseInfo) => {
    const open_music_array = initializeArray(64, disabledSongs(releaseCode(info)))
    return {
    info: {
        white_music_list: K.ARRAY("s32", open_music_array),
        white_marker_list: K.ARRAY("s32", marker_array),
        white_theme_list: K.ARRAY("s32", theme_array),
        open_music_list: K.ARRAY("s32", open_music_array),
        add_default_music_list: K.ARRAY("s32", open_music_array),
        hot_music_list: K.ARRAY("s32", pick_up_array),

        judge_disp: {
            is_available: K.ITEM("bool", true),
        },

        random_option: {
            is_available: K.ITEM("bool", true),
        },

        expert_option: {
            is_available: K.ITEM("bool", true),
        },

        konami_logo_50th: {
            is_available: K.ITEM("bool", true),
        },

        all_music_matching: {
            is_available: K.ITEM("bool", false),
        },

        tsumtsum: {
            is_available: K.ITEM("bool", false),
        },

        nagatanien: {
            is_available: K.ITEM("bool", false),
        },

        digdig: {
            stage_list: {
                stage: [
                    K.ATTR({number: "1"}, {state: K.ITEM("u8", 1)}),
                    K.ATTR({number: "2"}, {state: K.ITEM("u8", 1)}),
                    K.ATTR({number: "3"}, {state: K.ITEM("u8", 1)}),
                    K.ATTR({number: "4"}, {state: K.ITEM("u8", 1)}),
                    K.ATTR({number: "5"}, {state: K.ITEM("u8", 1)}),
                    K.ATTR({number: "6"}, {state: K.ITEM("u8", 1)}),
                    K.ATTR({number: "7"}, {state: K.ITEM("u8", 1)}),
                ],
            },
        },

        department: {
            shop_list: {
                shop: shopList.map((shop, i) =>
                    K.ATTR(
                        {id: String(i + 1)},
                        {
                            tex_id: K.ITEM("s32", shop.tex_id),
                            type: K.ITEM("s8", shop.type),
                            emo_id: K.ITEM("s32", shop.emo_id),
                            priority: K.ITEM("s32", shop.priority),
                            etime: K.ITEM("u64", BigInt(0)),
                            item_list: {item: []},
                        },
                    ),
                ),
            },
        },
        official_news: {
            news_list: {
                news: K.ATTR({id: "1"}, {
                    is_checked: K.ITEM("bool", false),
                }),
            },
        },
        mynews: {},
        /*course_list: {
            course: FESTO_COURSE.map((course, i) =>
                K.ATTR(
                    {
                        release_code: "2022000000",
                        version_id: "0",
                        id: String(i + 1),
                        course_type: String(course.course_type),
                    },
                    {
                        difficulty: K.ITEM("s32", course.difficulty),
                        etime: K.ITEM("u64", BigInt(course.etime)),
                        name: K.ITEM("str", course.name),

                        tune_list: {
                            tune: course.tune_list.map((tune, i) =>
                                K.ATTR(
                                    {no: String(i + 1)},
                                    {
                                        seq_list: {
                                            seq: tune.map((seq) => ({
                                                music_id: K.ITEM("s32", seq[0]),
                                                difficulty: K.ITEM("s32", seq[1]),
                                                is_secret: K.ITEM("bool", seq[2]),
                                            })),
                                        },
                                    }
                                )
                            ),
                        },
                        clear: K.ATTR({type: String(course.clear_type)}, {
                            ex_option: {
                                is_hard: K.ITEM("bool", course.is_hard),
                                hazard_type: K.ITEM("s32", course.hazard_type),
                            },
                            score: K.ITEM("s32", course.score),
                            reward_list: [],
                        })
                    }
                )
            ),
        },*/
        emo_list: {
            emo: emoList.map((emo, i) =>
                K.ATTR(
                    {id: String(i + 1)},
                    {
                        tex_id: K.ITEM("s32", emo.tex_id),
                        is_exchange: K.ITEM("bool", emo.is_exchange),
                    },
                ),
            ),
        },

        lightchat: {
            map_list: {
                map: K.ATTR({id: String(99)}, {
                    event_list: {
                        event: K.ATTR({id: "1"}, {
                            event_type: K.ITEM("s32", 1),
                            stime: K.ITEM("u64", BigInt(1672667089)),
                            etime: K.ITEM("u64", BigInt(1735796677)),
                            is_open: K.ITEM("bool", true),
                            hint: K.ITEM("str", "len=64"),
                            unlock_text: K.ITEM("str", "len=128"),
                            condition_list: {},
                            section_list: {
                                section: K.ATTR({id: "1"}, {
                                    tube_text: K.ITEM("str", "len=12"),
                                    required_jwatt: K.ITEM("s32", 2147483647),
                                    reward_type: K.ITEM("s32", 1),
                                    reward_param: K.ITEM("s32", 100),
                                    dialogue: K.ITEM("str", "len=64"),
                                    mission_list: {},
                                }),
                            },
                        }),
                    },
                }),
            },
        },

    },
    }
}