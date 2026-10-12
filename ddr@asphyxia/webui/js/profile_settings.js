$('#change-name').on('click', () => {
  const name = $('#dancer_name').val().toUpperCase();

  emit('updateName', { refid, name }).then(() => location.reload());
});

$('#change-weight').on('click', () => {
  const weight1 = $('#weight_1').val();
  const weight2 = $('#weight_2').val();
  const weight = weight1 + '.' + weight2;

  emit('updateWeight', { refid, weight }).then(() => location.reload());
});

$('#change-display-calories').on('click', () => {
  const selected = $('#display_calories option:selected').val();

  emit('updateDisplayCalories', { refid, selected }).then(() => location.reload());
});

$('#change-arrow-skin').on('click', () => {
  const selected = $('#arrow_skin option:selected').val();

  emit('updateArrowSkin', { refid, selected }).then(() => location.reload());
});

$('#change-guideline').on('click', () => {
  const selected = $('#guideline option:selected').val();

  emit('updateGuideline', { refid, selected }).then(() => location.reload());
});

$('#change-filter').on('click', () => {
  const selected = $('#filter option:selected').val();

  emit('updateFilter', { refid, selected }).then(() => location.reload());
});

$('#change-judgment-priority').on('click', () => {
  const selected = $('#judgment_priority option:selected').val();

  emit('updateJudgmentPriority', { refid, selected }).then(() => location.reload());
});

$('#change-display-timing').on('click', () => {
  const selected = $('#display_timing option:selected').val();

  emit('updateDisplayTiming', { refid, selected }).then(() => location.reload());
});


$('#change-name3').on('click', () => {
  const name = $('#name3').val().toUpperCase();

  emit('updateName3', { refid, name }).then(() => location.reload());
});

$('#change-weight3').on('click', () => {
  const weight1 = $('#weight31').val();
  const weight2 = $('#weight32').val();
  const weight = parseInt(weight1 + '.' + weight2);

  emit('updateWeight3', { refid, weight }).then(() => location.reload());
});

$('#change-display-calories3').on('click', () => {
  const selected = parseInt($('#display_calories3 option:selected').val()) !== 0

  emit('updateDisplayCalories3', { refid, selected }).then(() => location.reload());
});

$('#change-platinum').on('click', () => {
  const selected = parseInt($('#platinum option:selected').val()) !== 0
  let currentSub = document.getElementById("platinum-data").innerText === "true"

  emit('updatePlatinum', { refid, selected, currentSub }).then(() => location.reload());
});

$('#customsave').on('click', () => {
  let selected = []
  
  for(const elem of customList) {
    selected.push([elem[1], parseInt($(`#${elem[0]} option:selected`).val()), elem[2], []])
  }
  console.log(selected)

  emit('playerCustomize', { refid, selected }).then(() => location.reload());
});

var customJson
var customizeData = document.getElementById("customize-data") !== null ? JSON.parse(document.getElementById("customize-data").innerText) : [];
const customList = [
  ['appeal', 1, 1, 'appealBoard'],
  ['character-left', 2, 1, 'character'],
  ['character-right', 2, 2, 'character'],
  ['bg-system', 3, 1, 'gameBG'],
  ['bg-play', 3, 2, 'gameBG'],
  ['lanebg-s', 4, 1, 'laneBgSingle'],
  ['lanebg-d', 5, 1, 'laneBgDouble'],
  ['lanecv-s', 6, 1, 'laneCoverSingle'],
  ['lanecv-d', 7, 1, 'laneCoverDouble'],
  ['bg-vid', 8, 1, 'songVid']
]

$(document).ready(function(){
  $.when(
    $.getJSON("static/json/customize.json", function(json) {
      customJson = json;
    }),
  ).then(function() {
    let custInd

    for(const cust of customList) {
      custInd = customizeData.findIndex(c => c.category === cust[1] && c.pattern === cust[2])
      if(cust[1] === 8) {
        for(const item of customJson[cust[3]])
          $(`#${cust[0]}`).append('<option value=' + item.id + ((custInd >= 0 && item.id === customizeData[custInd].key) ? " selected" : " ") + ">" + item.name + "</option>")
      } else {
        for(const ap of customJson[cust[3]]) {
          $(`#${cust[0]}`).append('<optgroup label="' + customJson['optgroup'][ap['optgroup']] + '">')
          for(const item of ap['items'])
            $(`#${cust[0]}`).append('<option value=' + item.id + ((custInd >= 0 && item.id === customizeData[custInd].key) ? " selected" : " ") + ">" + item.name + "</option>")
        }
      }
    }
    updateCustomizationPreviews();
  })

  $('#appeal, #character-left, #character-right, #bg-system, #bg-play, #lanebg-s, #lanebg-d, #lanecv-s, #lanecv-d').on('change', function() {
    updateCustomizationPreviews();
  })
})

function updateCustomizationPreviews() {
  const getVal = (id) => {
    const v = parseInt($(`#${id} option:selected`).val() || $(`#${id}`).val());
    return isNaN(v) ? null : v;
  };

  const setImg = (elemId, path) => {
    const $img = $(elemId);
    if (!path) {
      $img.hide().removeAttr('src');
    } else {
      $img.off('error').on('error', function() {
        $(this).hide().removeAttr('src');
      });
      $img.attr('src', path).show();
    }
  };

  const updateBgMedia = (videoSelector, imgSelector, bgId) => {
    const $video = $(videoSelector);
    const $img = $(imgSelector);
    if (!bgId || bgId === 9999) {
      $video.hide().removeAttr('src');
      $img.hide().removeAttr('src');
      return;
    }
    const mp4Url = `static/images/customize/backgrounds/${bgId}.mp4`;
    const pngUrl = `static/images/customize/backgrounds/${bgId}.png`;

    $img.off('error').on('error', function() {
      $(this).hide().removeAttr('src');
    });

    $video.off('loadeddata canplay').on('loadeddata canplay', function() {
      $img.hide().removeAttr('src');
      $(this).show();
      const playPromise = this.play();
      if (playPromise !== undefined) {
        playPromise.catch(function() {});
      }
    });

    $video.off('error').on('error', function() {
      $(this).hide().removeAttr('src');
      $img.attr('src', pngUrl).show();
    });

    $video.attr('src', mp4Url);
  };

  // 1. Appeal Board
  const appealId = getVal('appeal');
  setImg('#preview-appeal-img', (appealId && appealId !== 9999) ? `static/images/customize/appeal_boards/${appealId}.png` : null);

  // 2. System Preview
  const sysBgId = getVal('bg-system');
  const charLId = getVal('character-left');
  const charRId = getVal('character-right');
  updateBgMedia('#preview-system-bg-video', '#preview-system-bg', sysBgId);
  setImg('#preview-system-char-left', (charLId && charLId !== 9999) ? `static/images/customize/characters/${charLId}_left.png` : null);
  setImg('#preview-system-char-right', (charRId && charRId !== 9999) ? `static/images/customize/characters/${charRId}_right.png` : null);

  // 3. Game Play Preview
  const playBgId = getVal('bg-play');
  updateBgMedia('#preview-gameplay-bg-single-video', '#preview-gameplay-bg-single', playBgId);
  updateBgMedia('#preview-gameplay-bg-double-video', '#preview-gameplay-bg-double', playBgId);

  const laneBgSId = getVal('lanebg-s');
  const laneCvSId = getVal('lanecv-s');
  setImg('#preview-lanebg-single', (laneBgSId && laneBgSId !== 9999) ? `static/images/customize/lane_backgrounds_sp/${laneBgSId}.png` : null);
  setImg('#preview-lanecv-single', (laneCvSId && laneCvSId !== 9999) ? `static/images/customize/lane_covers_sp/${laneCvSId}.png` : null);

  const laneBgDId = getVal('lanebg-d');
  const laneCvDId = getVal('lanecv-d');
  setImg('#preview-lanebg-double', (laneBgDId && laneBgDId !== 9999) ? `static/images/customize/lane_backgrounds_dp/${laneBgDId}.png` : null);
  setImg('#preview-lanecv-double', (laneCvDId && laneCvDId !== 9999) ? `static/images/customize/lane_covers_dp/${laneCvDId}.png` : null);
}