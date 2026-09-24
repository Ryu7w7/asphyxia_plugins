"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convcardnumber = exports.eventLog = void 0;
const eventLog = (info, data, send) => {
    return send.object({
        gamesession: K.ITEM("s64", BigInt(1)),
        logsendflg: K.ITEM("s32", 0),
        logerrlevel: K.ITEM("s32", 0),
        evtidnosendflg: K.ITEM("s32", 0)
    });
};
exports.eventLog = eventLog;
const convcardnumber = (info, data, send) => {
    return send.object({
        result: K.ITEM("s32", 0),
        data: {
            card_number: K.ITEM("str", $(data).str("data.card_id").split("|")[0])
        }
    });
};
exports.convcardnumber = convcardnumber;
