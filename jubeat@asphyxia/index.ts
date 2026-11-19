import {shopInfoRoute}                                                                                                                 from "./routes/shopinfo";
import {handleRegistRoute, handleGetInfoRoute, handleGetMDataRoute, handleGetMeetingRoute, handleGetJboxListRoute, handleGetNewsRoute} from "./routes/gametop";
import {handleRegistEndRoute}                                                                                                          from "./routes/gameend";
import {lobbyCheckRoute, lobbyEntryRoute, refreshRoute, reportRoute}                                            from "./routes/lobby";
import {addRival, removeRival, searchRival} from "./handlers/rival";
import {getScoreRoute}                                                                              from "./handlers/score";

export async function register() {
    if(CORE_VERSION_MAJOR <= 1 && CORE_VERSION_MINOR < 31){
        console.error("The current version of Asphyxia Core is not supported. Requires version '1.31' or later.");
        return;
    }

    R.GameCode("L44");
    R.Contributor("yuanqiuye", "https://github.com/yuanqiuye")
    R.Contributor("Chara_", "https://github.com/ItsCharaHere")
    R.Contributor("asesidaa", "https://github.com/asesidaa")

    R.Route("gametop.regist", handleRegistRoute);
    R.Route("gametop.get_info", handleGetInfoRoute);
    R.Route("gametop.get_pdata", handleRegistRoute);
    R.Route("gametop.get_mdata", handleGetMDataRoute);
    R.Route("gametop.get_meeting", handleGetMeetingRoute);

    // ave routes 
    R.Route("gametop_ave2.regist", handleRegistRoute);
    R.Route("gametop_ave2.get_info", handleGetInfoRoute);
    R.Route("demodata_ave2.get_info", handleGetInfoRoute);
    R.Route("gametop_ave2.get_pdata", handleRegistRoute);
    R.Route("gametop_ave2.get_mdata", handleGetMDataRoute);
    R.Route("gametop_ave2.get_meeting", handleGetMeetingRoute);
    R.Route("data_ave2.get_jbox_list", handleGetJboxListRoute);
    R.Route("data_ave2.get_news", handleGetNewsRoute);
    R.Route("recommend_ave2.get_recommend", false)
    R.Route("jbox_ave2.get_image", false)

    R.Route("gameend.final", true);
    R.Route("gameend.regist", handleRegistEndRoute);

    // ave routes
    R.Route("gameend_ave2.final", true);
    R.Route("gameend_ave2.regist", handleRegistEndRoute);

    R.Route("shopinfo.regist", shopInfoRoute);
    R.Route("lobby.check", lobbyCheckRoute);
    R.Route("lobby.entry", lobbyEntryRoute);
    R.Route("lobby.refresh", refreshRoute);
    R.Route("lobby.report", reportRoute);

    // ave routes
    R.Route("shopinfo_ave2.regist", shopInfoRoute);
    R.Route("lobby_ave2.check", lobbyCheckRoute);
    R.Route("lobby_ave2.entry", lobbyEntryRoute);
    R.Route("lobby_ave2.refresh", refreshRoute);
    R.Route("lobby_ave2.report", reportRoute);

    R.Route("netlog.send", true);
    R.Route("logger.report", true);
    R.Route("netlog_ave2.send", true);
    R.Route("logger_ave2.report", true);

    // 라이벌 추가/삭제 WebUI 이벤트
    R.WebUIEvent('rival_add', addRival);
    R.WebUIEvent('rival_remove', removeRival);
    R.WebUIEvent('rival_search', searchRival);

    R.WebUIEvent('get_scores', getScoreRoute);

    R.Unhandled();
}