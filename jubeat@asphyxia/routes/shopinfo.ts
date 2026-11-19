import {getGameInfo} from "../templates/gameInfo";

export const shopInfoRoute = (info: EamuseInfo, data: any, send: EamuseSend) => {
    const locId = $(data).element("shop").content("locationid");
    return send.object(
        {
            data: {
                cabid: K.ITEM("u32", 1),
                locationid: K.ITEM("str", locId),
                tax_phase: K.ITEM("u8", 0),
                facility: {
                    exist: K.ITEM("u32", 0),
                },
                ...getGameInfo(info),
            },
        },
        {compress: true}
    );
};