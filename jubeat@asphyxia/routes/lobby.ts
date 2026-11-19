export const lobbyCheckRoute = (req: EamuseInfo, {data}: any, send: EamuseSend) => {
    //const enter = $(data).content("enter");
    const time = $(data).content("time");
    return send.object(
        {
            data: {
                entrant_nr: K.ITEM("u32", 0, {time}),
                interval: K.ITEM("s16", 0),
                entry_timeout: K.ITEM("s16", 15),
                waitlist: K.ATTR({count: "0"}, {music: {}}),
            },
        },
        {compress: true}
    );
};

export const lobbyEntryRoute = (_: EamuseInfo, {data: music}: any, send: EamuseSend) => {
    const musicId = $(music).content("id");
    const musicSeq = $(music).content("seq");
    return send.object(
        {
            data: {
                roomid: K.ITEM("s64", BigInt(1), {master: "1"}),
                refresh_intr: K.ITEM("s16", 0),
                music: {
                    id: K.ITEM("u32", musicId),
                    seq: K.ITEM("u8", musicSeq),
                },
            },
        },
        {compress: true}
    );
};

export const refreshRoute = (_: EamuseInfo, __: any, send: EamuseSend) => {
    return send.object(
        {
            data: {
                refresh_intr: K.ITEM("s16", 0),
                start: K.ITEM("bool", true)
            },
        },
        {compress: true}
    );
};

export const reportRoute = (_: EamuseInfo, __: any, send: EamuseSend) => {
    return send.object(
        {
            data: {
                refresh_intr: K.ITEM("s16", 0)
            },
        },
        {compress: true}
    );
}

