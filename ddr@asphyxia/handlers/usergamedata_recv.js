"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usergamedata_recv = void 0;
const usergamedata_recv = async (info, data, send) => {
    const refId = $(data).str("data.refid");
    const profile = await DB.FindOne(refId, { collection: "profile" });
    let recordNum = 0;
    const record = [];
    const d = [];
    const types = $(data).str("data.recv_csv").split(",").filter((_, i) => (i % 2 === 0));
    for (const type of types) {
        let strdata = "<NODATA>";
        let bindata = "<NODATA>";
        if (profile) {
            strdata = profile.usergamedata[type]["strdata"];
            bindata = profile.usergamedata[type]["bindata"];
            if (type === "OPTION") {
                const split = strdata.split(",");
                split[0] = U.GetConfig("save_option") ? "1" : "0";
                strdata = split.join(",");
            }
        }
        d.push(Object.assign(Object.assign({}, K.ITEM("str", !profile ? strdata : Buffer.from(strdata).toString("base64"))), profile && { bin1: K.ITEM("str", Buffer.from(bindata).toString("base64")) }));
        recordNum++;
    }
    record.push({ d });
    return send.object({
        result: K.ITEM("s32", 0),
        player: {
            record,
            record_num: K.ITEM("u32", recordNum)
        }
    });
};
exports.usergamedata_recv = usergamedata_recv;
