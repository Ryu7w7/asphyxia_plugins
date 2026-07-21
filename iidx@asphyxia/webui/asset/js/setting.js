function safeSet(selector, val) {
  if (val === undefined || val === null) return;
  var el = $(selector);
  if (el.is("select") && el.find("option[value='" + val + "']").length === 0) {
    el.append($("<option></option>").attr("value", val).text("Unknown (" + val + ")"));
  }
  el.val(val);
}

$(document).ready(function() {
  var currentVersion = $("#version").val();
  if (currentVersion) {
    $.ajax({
      type: "post",
      url: "/emit/iidxGetSetting",
      data: { refid: refid, version: currentVersion },
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
    data: { refid: refid, version: this.value },
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

  safeSet("#note_size",      data["custom"].note_size      ?? 0);
  safeSet("#lift_cover",     data["custom"].lift_cover     ?? 0);
  safeSet("#note_beam_size", data["custom"].note_beam_size ?? 0);
  safeSet("#cn_color",       data["custom"].cn_color       ?? 0);
  safeSet("#cn_size",        data["custom"].cn_size        ?? 0);

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
  $("#disable_beginner_option").prop("checked", data["custom"].disable_beginner_option ?? false);

  safeSet("#qpro_head", data["custom"].qpro_head);
  safeSet("#qpro_hair", data["custom"].qpro_hair);
  safeSet("#qpro_hand", data["custom"].qpro_hand);
  safeSet("#qpro_face", data["custom"].qpro_face);
  safeSet("#qpro_body", data["custom"].qpro_body);
  safeSet("#qpro_back", data["custom"].qpro_back ?? 0);

  updateQproPreview();

  if (data["lm_custom"] == null) {
    safeSet("#lm_skin", 0); safeSet("#lm_bg", 0);
    safeSet("#lm_bg_2", 0); safeSet("#lm_entry_bg", 0);
    safeSet("#lm_entry_bg_bright", 0);
  } else {
    safeSet("#lm_skin", data["lm_custom"].premium_skin);
    safeSet("#lm_bg",   data["lm_custom"].premium_bg);
    safeSet("#lm_bg_2",           data["lm_custom"].premium_bg_concent   ?? 0);
    safeSet("#lm_entry_bg",       data["lm_custom"].entry_bg             ?? 0);
    safeSet("#lm_entry_bg_bright",data["lm_custom"].entry_bg_brightness  ?? 0);
  }
}

// ── Q-Pro Preview ──────────────────────────────────────────────────────────────

/**
 * Load an image into an <img> element, silently clearing it on 404.
 * Removes stacked onerror handlers that would fire on every change.
 */
function _qproImg(id, src) {
  var el = document.getElementById(id);
  if (!el) return;
  el.onerror = function () { this.src = ""; this.onerror = null; };
  el.src = src;
}

function _qproImgClear(id) {
  var el = document.getElementById(id);
  if (el) { el.onerror = null; el.src = ""; }
}

function updateQproPreview() {
  var head = $("#qpro_head option:selected").val();   // use index, not text
  var hair = $("#qpro_hair option:selected").val();
  var face = $("#qpro_face option:selected").val();
  var hand = $("#qpro_hand option:selected").val();
  var body = $("#qpro_body option:selected").val();
  var bgIdx= parseInt($("#qpro_back option:selected").val()) || 0;

  // Helper: name from index via the select text (already populated from customData)
  function nameOf(sel) { return $(sel + " option:selected").text(); }

  var headName = nameOf("#qpro_head");
  var hairName = nameOf("#qpro_hair");
  var faceName = nameOf("#qpro_face");
  var handName = nameOf("#qpro_hand");
  var bodyName = nameOf("#qpro_body");
  var bgName   = nameOf("#qpro_back");

  var base = "static/asset/qpro/";

  // Background
  if (bgIdx > 0 && bgName && !bgName.startsWith("Unknown")) {
    _qproImg("qpro-preview-bg", base + "bg/" + bgName + "/qp_bg.png");
  } else {
    _qproImgClear("qpro-preview-bg");
  }

  // Head
  if (headName && !headName.startsWith("Unknown")) {
    _qproImg("qpro-preview-head-b", base + "head/" + headName + "/qp_head_b.png");
    _qproImg("qpro-preview-head-f", base + "head/" + headName + "/qp_head_f.png");
  } else {
    _qproImgClear("qpro-preview-head-b");
    _qproImgClear("qpro-preview-head-f");
  }

  // Hair
  if (hairName && !hairName.startsWith("Unknown")) {
    _qproImg("qpro-preview-hair-b", base + "hair/" + hairName + "/qp_hair_b.png");
    _qproImg("qpro-preview-hair-f", base + "hair/" + hairName + "/qp_hair_f.png");
  } else {
    _qproImgClear("qpro-preview-hair-b");
    _qproImgClear("qpro-preview-hair-f");
  }

  // Face
  if (faceName && !faceName.startsWith("Unknown")) {
    _qproImg("qpro-preview-face", base + "face/" + faceName + "/qp_face_neutral.png");
  } else {
    _qproImgClear("qpro-preview-face");
  }

  // Body
  if (bodyName && !bodyName.startsWith("Unknown")) {
    _qproImg("qpro-preview-body-b",      base + "body/" + bodyName + "/qp_body_b.png");
    _qproImg("qpro-preview-body-f",      base + "body/" + bodyName + "/qp_body_f.png");
    _qproImg("qpro-preview-arm-r-upper", base + "body/" + bodyName + "/qp_arm_r_upper.png");
    _qproImg("qpro-preview-arm-r-lower", base + "body/" + bodyName + "/qp_arm_r_lower.png");
    _qproImg("qpro-preview-arm-l-upper", base + "body/" + bodyName + "/qp_arm_l_upper.png");
    _qproImg("qpro-preview-arm-l-lower", base + "body/" + bodyName + "/qp_arm_l_lower.png");
    _qproImg("qpro-preview-leg-r-upper", base + "body/" + bodyName + "/qp_leg_r_upper.png");
    _qproImg("qpro-preview-leg-r-lower", base + "body/" + bodyName + "/qp_leg_r_lower.png");
    _qproImg("qpro-preview-leg-l-upper", base + "body/" + bodyName + "/qp_leg_l_upper.png");
    _qproImg("qpro-preview-leg-l-lower", base + "body/" + bodyName + "/qp_leg_l_lower.png");
  } else {
    _qproImgClear("qpro-preview-body-b");
    _qproImgClear("qpro-preview-body-f");
    _qproImgClear("qpro-preview-arm-r-upper");
    _qproImgClear("qpro-preview-arm-r-lower");
    _qproImgClear("qpro-preview-arm-l-upper");
    _qproImgClear("qpro-preview-arm-l-lower");
    _qproImgClear("qpro-preview-leg-r-upper");
    _qproImgClear("qpro-preview-leg-r-lower");
    _qproImgClear("qpro-preview-leg-l-upper");
    _qproImgClear("qpro-preview-leg-l-lower");
  }

  // Hand
  if (handName && !handName.startsWith("Unknown")) {
    _qproImg("qpro-preview-hand-r", base + "hand/" + handName + "/qp_hand_r.png");
    _qproImg("qpro-preview-hand-l", base + "hand/" + handName + "/qp_hand_l.png");
  } else {
    _qproImgClear("qpro-preview-hand-r");
    _qproImgClear("qpro-preview-hand-l");
  }
}

$(document).on("change", "#qpro_head, #qpro_hair, #qpro_face, #qpro_hand, #qpro_body, #qpro_back", function () {
  updateQproPreview();
});
