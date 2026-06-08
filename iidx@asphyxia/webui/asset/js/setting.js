function safeSet(selector, val) {
  if (val === undefined || val === null) return;
  var el = $(selector);
  if (el.is("select") && el.find("option[value='" + val + "']").length === 0) {
    el.append($("<option></option>").attr("value", val).text("Unknown (" + val + ")"));
  }
  el.val(val);
}

$(document).ready(function() {
  // Auto-load settings for the currently selected version on page load
  var currentVersion = $("#version").val();
  if (currentVersion) {
    $.ajax({
      type: "post",
      url: "/emit/iidxGetSetting",
      data: {
        refid: refid,
        version: currentVersion,
      },
      dataType: "text",
      success: function (result) {
        var data = JSON.parse(result);
        if (data["custom"] == null) return;
        populateFields(data);
      }
    });
  }
});

$("#version").on("change", function () {
  $.ajax({
    type: "post",
    url: "/emit/iidxGetSetting",
    data: {
      refid: refid,
      version: this.value,
    },
    dataType: "text",
    success: function (result) {
      let data = JSON.parse(result);

      if (data["custom"] == null) {
        alert("Theres no customize data available on this version!");
        return;
      }

      populateFields(data);
    },
    error: function () {
      alert("Unable to process data");
    }
  });
});

function populateFields(data) {
  safeSet("#frame", data["custom"].frame);
  safeSet("#turntable", data["custom"].turntable);
  safeSet("#note_burst", data["custom"].note_burst);
  safeSet("#menu_music", data["custom"].menu_music);
  safeSet("#lane_cover", data["custom"].lane_cover);
  safeSet("#category_vox", data["custom"].category_vox);
  safeSet("#note_skin", data["custom"].note_skin);
  safeSet("#full_combo_splash", data["custom"].full_combo_splash);
  safeSet("#note_beam", data["custom"].note_beam);
  safeSet("#judge_font", data["custom"].judge_font);
  $("#disable_musicpreview").prop("checked", data["custom"].disable_musicpreview);
  safeSet("#pacemaker_cover", data["custom"].pacemaker_cover);
  $("#vefx_lock").prop("checked", data["custom"].vefx_lock);
  safeSet("#effect", data["custom"].effect);
  safeSet("#bomb_size", data["custom"].bomb_size);
  $("#disable_hcn_color").prop("checked", data["custom"].disable_hcn_color);
  safeSet("#first_note_preview", data["custom"].first_note_preview);

  if (data["custom"].note_size == undefined) safeSet("#note_size", 0);
  else safeSet("#note_size", data["custom"].note_size);
  if (data["custom"].lift_cover == undefined) safeSet("#lift_cover", 0);
  else safeSet("#lift_cover", data["custom"].lift_cover);
  if (data["custom"].note_beam_size == undefined) safeSet("#note_beam_size", 0);
  else safeSet("#note_beam_size", data["custom"].note_beam_size);
  if (data["custom"].cn_color == undefined) safeSet("#cn_color", 0);
  else safeSet("#cn_color", data["custom"].cn_color);
  if (data["custom"].cn_size == undefined) safeSet("#cn_size", 0);
  else safeSet("#cn_size", data["custom"].cn_size);

  $("#rank_folder").prop("checked", data["custom"].rank_folder);
  $("#clear_folder").prop("checked", data["custom"].clear_folder);
  $("#diff_folder").prop("checked", data["custom"].diff_folder);
  $("#alpha_folder").prop("checked", data["custom"].alpha_folder);
  $("#rival_folder").prop("checked", data["custom"].rival_folder);
  $("#rival_battle_folder").prop("checked", data["custom"].rival_battle_folder);
  $("#rival_info").prop("checked", data["custom"].rival_info);
  $("#hide_playcount").prop("checked", data["custom"].hide_playcount);
  $("#disable_graph_cutin").prop("checked", data["custom"].disable_graph_cutin);
  $("#classic_hispeed").prop("checked", data["custom"].classic_hispeed);
  $("#rival_played_folder").prop("checked", data["custom"].rival_played_folder);
  $("#hide_iidxid").prop("checked", data["custom"].hide_iidxid);

  if (data["custom"].disable_beginner_option == undefined) $("#disable_beginner_option").prop("checked", false);
  else $("#disable_beginner_option").prop("checked", data["custom"].disable_beginner_option);

  safeSet("#qpro_head", data["custom"].qpro_head);
  safeSet("#qpro_hair", data["custom"].qpro_hair);
  safeSet("#qpro_hand", data["custom"].qpro_hand);
  safeSet("#qpro_face", data["custom"].qpro_face);
  safeSet("#qpro_body", data["custom"].qpro_body);

  if (data["custom"].qpro_back == undefined) safeSet("#qpro_back", 0);
  else safeSet("#qpro_back", data["custom"].qpro_back);

  if (data["lm_custom"] == null) {
    safeSet("#lm_skin", 0);
    safeSet("#lm_bg", 0);
    safeSet("#lm_bg_2", 0);
    safeSet("#lm_entry_bg", 0);
    safeSet("#lm_entry_bg_bright", 0);
  } else {
    safeSet("#lm_skin", data["lm_custom"].premium_skin);
    safeSet("#lm_bg", data["lm_custom"].premium_bg);

    if (data["lm_custom"].premium_bg_concent == undefined) safeSet("#lm_bg_2", 0);
    else safeSet("#lm_bg_2", data["lm_custom"].premium_bg_concent);
    if (data["lm_custom"].entry_bg == undefined) safeSet("#lm_entry_bg", 0);
    else safeSet("#lm_entry_bg", data["lm_custom"].entry_bg);
    if (data["lm_custom"].entry_bg_brightness == undefined) safeSet("#lm_entry_bg_bright", 0);
    else safeSet("#lm_entry_bg_bright", data["lm_custom"].entry_bg_brightness);
  }
}
