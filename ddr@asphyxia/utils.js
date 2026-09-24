"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVersion = getVersion;
exports.formatCode = formatCode;
function getVersion(info) {
    const dateCode = parseInt(info.model.split(":")[4]);
    if (dateCode >= 2019022600 && dateCode <= 2020020300)
        return 10;
    return 0;
}
function formatCode(ddrCode) {
    const pad = (ddrCode + "").padStart(8, "0");
    return pad.replace(/^([0-9]{4})([0-9]{4})$/, "$1-$2");
}
