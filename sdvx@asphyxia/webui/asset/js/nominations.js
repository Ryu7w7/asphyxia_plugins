// ─── Nomination Search ──────────────────────────────────────────────────────

var nomPage = 1;
var nomTotalPages = 1;
var nomDebounce = null;
var existingNauticaIds = new Set();
var nomPreviewAudio = null;

var diffNames = ['', 'NOV', 'ADV', 'EXH', 'MXM'];
var diffClasses = ['', 'chip-nov', 'chip-adv', 'chip-exh', 'chip-mxm'];

// Load all existing nautica song IDs so we can hide them from search
function loadExistingIds() {
  emit('nauticaList', {}).then(function (response) {
    var result = response.data;
    if (result && result.songs) {
      existingNauticaIds = new Set(result.songs.map(function (s) { return s.nauticaId; }));
    }
  });
}
loadExistingIds();

document.getElementById('nominate-search').addEventListener('input', function () {
  clearTimeout(nomDebounce);
  nomDebounce = setTimeout(function () {
    nomPage = 1;
    document.getElementById('nom-page-input').value = 1;
    browseForNomination(1);
  }, 500);
});

document.getElementById('nom-prev-btn').addEventListener('click', function () {
  if (nomPage > 1) browseForNomination(nomPage - 1);
});

document.getElementById('nom-next-btn').addEventListener('click', function () {
  if (nomPage < nomTotalPages) browseForNomination(nomPage + 1);
});

document.getElementById('nom-page-input').addEventListener('change', function () {
  var p = parseInt(this.value) || 1;
  p = Math.max(1, Math.min(p, nomTotalPages));
  this.value = p;
  browseForNomination(p);
});

function browseForNomination(page) {
  var searchText = document.getElementById('nominate-search').value || '';

  var resultsEl = document.getElementById('nominate-results');
  var h = resultsEl.offsetHeight;
  if (h > 0) {
    resultsEl.style.minHeight = h + 'px';
  }
  resultsEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:' + (h || 200) + 'px"><span class="icon is-large" style="color:#555"><i class="mdi mdi-loading mdi-spin mdi-48px"></i></span></div>';
  emit('nauticaBrowse', { page: page, search: searchText.trim() }).then(function (response) {
    var result = response.data;
    if (!result || result.error) {
      document.getElementById('nominate-results').innerHTML =
        '<div class="notification is-danger is-light">' + (result ? result.error : 'No response') + '</div>';
      return;
    }

    var songs = result.data || [];
    var meta = result.meta || {};
    nomPage = meta.current_page || page;
    nomTotalPages = meta.last_page || 1;

    var filtered = songs.filter(function (s) { return !existingNauticaIds.has(s.id); });
    renderNominationResults(filtered);
    updateNomPagination();
  });
}

function renderNominationResults(songs) {
  var container = document.getElementById('nominate-results');
  if (!songs || songs.length === 0) {
    container.innerHTML = '<p class="has-text-grey mt-3">No results found.</p>';
    return;
  }

  var html = '<div class="nautica-grid mt-3">';
  for (var i = 0; i < songs.length; i++) {
    var s = songs[i];
    var charts = s.charts || [];
    var chipHtml = '';
    for (var j = 0; j < charts.length; j++) {
      var c = charts[j];
      var d = c.difficulty || 0;
      chipHtml += '<span class="chip ' + (diffClasses[d] || 'chip-exh') + '">' +
        (diffNames[d] || '?') + ' ' + (c.level || '?') + '</span>';
    }

    var tags = (s.tags || []).map(function (t) { return t.value || t; }).slice(0, 3);

    var effectors = charts.map(function (c) { return c.effector; }).filter(Boolean);
    var uniqueEffectors = effectors.filter(function (v, i, a) { return a.indexOf(v) === i; });
    var effectorHtml = uniqueEffectors.length > 0
      ? '<div class="effector" style="font-size:0.8em;color:#aaa;padding:0 0.5rem"><i class="mdi mdi-account" style="font-size:0.9em"></i> ' + escapeHtml(uniqueEffectors.join(', ')) + '</div>'
      : '';

    html += '<div class="nautica-card" data-id="' + s.id + '">' +
      '<img class="jacket" src="' + (s.jacket_url || '') + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
      '<div class="card-body">' +
      '<div class="info">' +
        '<div class="title" title="' + escapeAttr(s.title || '') + '">' + escapeHtml(s.title || 'Untitled') + '</div>' +
        '<div class="artist">' + escapeHtml(s.artist || 'Unknown') + '</div>' +
      '</div>' +
      effectorHtml +
      '<div class="charts">' + chipHtml + '</div>' +
      '<div class="actions">' +
        (s.preview_url ?
          '<button class="button is-small is-info nom-preview-btn" data-url="' + escapeAttr(s.preview_url) + '">' +
            '<span class="icon"><i class="mdi mdi-play"></i></span>' +
          '</button> ' : '') +
        '<button class="button is-small is-warning nominate-btn" ' +
          'data-song=\'' + escapeAttr(JSON.stringify({
            nauticaId: s.id,
            title: s.title,
            artist: s.artist,
            jacketUrl: s.jacket_url,
            downloadUrl: s.cdn_download_url,
            charts: charts.map(function (c) { return { difficulty: c.difficulty, level: c.level, effector: c.effector || '' }; }),
            tags: tags,
          })) + '\'>' +
          '<span class="icon is-small"><i class="mdi mdi-star"></i></span>' +
          '<span>Nominate</span>' +
        '</button>' +
      '</div>' +
      '</div>' +
    '</div>';
  }
  html += '</div>';
  container.innerHTML = html;
  container.style.minHeight = '';

  var btns = container.querySelectorAll('.nominate-btn');
  for (var k = 0; k < btns.length; k++) {
    btns[k].addEventListener('click', handleNominate);
  }

  var previewBtns = container.querySelectorAll('.nom-preview-btn');
  for (var p = 0; p < previewBtns.length; p++) {
    previewBtns[p].addEventListener('click', handleNomPreview);
  }
}

function handleNomPreview(e) {
  var btn = e.currentTarget;
  var url = btn.getAttribute('data-url');
  var icon = btn.querySelector('i');

  if (nomPreviewAudio && !nomPreviewAudio.paused) {
    nomPreviewAudio.pause();
    nomPreviewAudio = null;
    // Reset all preview buttons
    var allBtns = document.querySelectorAll('.nom-preview-btn i');
    for (var i = 0; i < allBtns.length; i++) {
      allBtns[i].className = 'mdi mdi-play';
    }
    if (btn._playing) { btn._playing = false; return; }
  }

  nomPreviewAudio = new Audio(url);
  nomPreviewAudio.volume = 0.5;
  nomPreviewAudio.play();
  icon.className = 'mdi mdi-stop';
  btn._playing = true;
  nomPreviewAudio.addEventListener('ended', function () {
    icon.className = 'mdi mdi-play';
    btn._playing = false;
  });
}

function handleNominate(e) {
  var btn = e.currentTarget;
  var songData = JSON.parse(btn.getAttribute('data-song'));

  var note = prompt('Optional: Add a note about why you\'re nominating this chart (or leave empty):');
  if (note === null) return; // User cancelled

  btn.classList.add('is-loading');
  btn.disabled = true;

  songData.nominationNote = note || '';

  emit('nauticaNominate', songData).then(function (response) {
    var result = response.data;
    btn.classList.remove('is-loading');
    if (result.error) {
      btn.classList.remove('is-warning');
      btn.classList.add('is-danger', 'is-light');
      btn.innerHTML = '<span>' + escapeHtml(result.error) + '</span>';
    } else {
      btn.classList.remove('is-warning');
      btn.classList.add('is-success');
      btn.innerHTML = '<span class="icon"><i class="mdi mdi-check"></i></span><span>Nominated!</span>';
      loadExistingIds();
      loadMyNominations();
    }
  });
}

function updateNomPagination() {
  document.getElementById('nom-page-input').value = nomPage;
  document.getElementById('nom-page-total').textContent = '/ ' + nomTotalPages;
  document.getElementById('nom-prev-btn').disabled = (nomPage <= 1);
  document.getElementById('nom-next-btn').disabled = (nomPage >= nomTotalPages);
}

// ─── My Nominations ─────────────────────────────────────────────────────────

function loadMyNominations() {
  emit('nauticaMyNominations', {}).then(function (response) {
    var result = response.data;
    var container = document.getElementById('my-nominations');
    if (!result || result.error) {
      container.innerHTML = '<p class="has-text-grey">' + (result ? result.error : 'Failed to load') + '</p>';
      return;
    }

    var songs = result.songs || [];
    if (songs.length === 0) {
      container.innerHTML = '<p class="has-text-grey">You haven\'t nominated any charts yet.</p>';
      return;
    }

    var html = '<table class="table is-fullwidth is-striped"><thead><tr>' +
      '<th>Title</th><th>Artist</th><th>Charts</th><th>Status</th><th>Note</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < songs.length; i++) {
      var s = songs[i];
      var chipHtml = '';
      for (var j = 0; j < (s.charts || []).length; j++) {
        var c = s.charts[j];
        var d = c.difficulty || 0;
        chipHtml += '<span class="chip ' + (diffClasses[d] || '') + '">' +
          (diffNames[d] || '?') + ' ' + (c.level || '?') + '</span> ';
      }

      var statusClass = 'status-' + (s.status || 'nominated');
      var statusText = s.status || 'nominated';
      if (s.status === 'rejected' && s.rejectedReason) {
        statusText += ': ' + s.rejectedReason;
      }

      html += '<tr>' +
        '<td>' + escapeHtml(s.title) + '</td>' +
        '<td>' + escapeHtml(s.artist) + '</td>' +
        '<td>' + chipHtml + '</td>' +
        '<td><span class="curated-status ' + statusClass + '">' + escapeHtml(statusText) + '</span></td>' +
        '<td>' + escapeHtml(s.nominationNote || '') + '</td>' +
        '</tr>';
    }

    html += '</tbody></table>';
    container.innerHTML = html;
  });
}

// ─── Testing Charts + Feedback ──────────────────────────────────────────────

function loadTestingCharts() {
  emit('nauticaList', { status: 'testing' }).then(function (response) {
    var result = response.data;
    var section = document.getElementById('testing-feedback-section');
    var container = document.getElementById('testing-charts-list');

    if (!result || result.error) return;

    var songs = result.songs || [];
    if (songs.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';
    var html = '';

    for (var i = 0; i < songs.length; i++) {
      var s = songs[i];
      var chipHtml = '';
      for (var j = 0; j < (s.charts || []).length; j++) {
        var c = s.charts[j];
        var d = c.difficulty || 0;
        chipHtml += '<span class="chip ' + (diffClasses[d] || '') + '">' +
          (diffNames[d] || '?') + ' ' + (c.level || '?') + '</span> ';
      }

      html += '<div class="box">' +
        '<div class="columns is-vcentered">' +
          '<div class="column is-narrow">' +
            '<img src="' + (s.jacketUrl || '') + '" style="width:64px;height:64px;border-radius:4px;object-fit:cover" onerror="this.style.display=\'none\'">' +
          '</div>' +
          '<div class="column">' +
            '<strong>' + escapeHtml(s.title) + '</strong><br>' +
            '<span class="has-text-grey">' + escapeHtml(s.artist) + '</span><br>' +
            chipHtml +
          '</div>' +
          '<div class="column is-narrow">' +
            '<div class="buttons">' +
              '<button class="button is-small is-success feedback-vote-btn" data-id="' + s.nauticaId + '" data-vote="up">' +
                '<span class="icon"><i class="mdi mdi-thumb-up"></i></span>' +
              '</button>' +
              '<button class="button is-small is-danger feedback-vote-btn" data-id="' + s.nauticaId + '" data-vote="down">' +
                '<span class="icon"><i class="mdi mdi-thumb-down"></i></span>' +
              '</button>' +
            '</div>' +
            '<input class="input is-small feedback-comment" data-id="' + s.nauticaId + '" type="text" placeholder="Comment (optional)" maxlength="200" style="margin-top:0.25rem">' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    container.innerHTML = html;

    // Bind vote buttons
    var voteBtns = container.querySelectorAll('.feedback-vote-btn');
    for (var k = 0; k < voteBtns.length; k++) {
      voteBtns[k].addEventListener('click', function () {
        var nauticaId = this.getAttribute('data-id');
        var vote = this.getAttribute('data-vote');
        var commentInput = container.querySelector('.feedback-comment[data-id="' + nauticaId + '"]');
        var comment = commentInput ? commentInput.value : '';

        var btn = this;
        btn.classList.add('is-loading');

        emit('nauticaSubmitFeedback', { nauticaId: nauticaId, vote: vote, comment: comment }).then(function (response) {
          btn.classList.remove('is-loading');
          var result = response.data;
          if (result && result.success) {
            btn.classList.add('is-outlined');
            btn.disabled = true;
          }
        });
      });
    }
  });
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Init ───────────────────────────────────────────────────────────────────

loadMyNominations();
loadTestingCharts();
browseForNomination(1);
