var diffNames = ['', 'NOV', 'ADV', 'EXH', 'MXM'];
var diffClasses = ['', 'chip-nov', 'chip-adv', 'chip-exh', 'chip-mxm'];
var chartPreviewAudio = null;
var allCustomCharts = [];

function filterCustomCharts(songs, query) {
  var q = (query || '').trim().toLowerCase();
  if (!q) return songs;
  return songs.filter(function (s) {
    if ((s.title || '').toLowerCase().indexOf(q) !== -1) return true;
    if ((s.artist || '').toLowerCase().indexOf(q) !== -1) return true;
    var charts = s.charts || [];
    for (var i = 0; i < charts.length; i++) {
      if ((charts[i].effector || '').toLowerCase().indexOf(q) !== -1) return true;
    }
    return false;
  });
}

function renderCustomCharts(songs, totalCount) {
  var container = document.getElementById('custom-charts-list');
  if (songs.length === 0) {
    container.innerHTML = '<p class="has-text-grey">No matching custom charts.</p>';
    return;
  }

  var countLabel = totalCount != null && totalCount !== songs.length
    ? '<strong>' + songs.length + '</strong> of <strong>' + totalCount + '</strong> chart' + (totalCount !== 1 ? 's' : '')
    : '<strong>' + songs.length + '</strong> curated chart' + (songs.length !== 1 ? 's' : '') + ' available';
  var html = '<p class="mb-3">' + countLabel + '</p>';
  html += '<div class="charts-grid">';

  for (var i = 0; i < songs.length; i++) {
    var s = songs[i];
    var chipHtml = '';
    for (var j = 0; j < (s.charts || []).length; j++) {
      var c = s.charts[j];
      var d = c.difficulty || 0;
      chipHtml += '<span class="chip ' + (diffClasses[d] || 'chip-exh') + '">' +
        (diffNames[d] || '?') + ' ' + (c.level || '?') + '</span>';
    }

    html += '<div class="chart-card">' +
      '<img class="jacket" src="' + (s.jacketUrl || '') + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
      '<div class="card-body">' +
      '<div class="info">' +
        '<div class="title" title="' + escapeAttr(s.title || '') + '">' + escapeHtml(s.title || 'Untitled') +
          ' <a href="https://ksm.dev/songs/' + s.nauticaId + '" target="_blank" style="color:#666;text-decoration:none" title="View on ksm.dev"><i class="mdi mdi-open-in-new" style="font-size:0.75em"></i></a></div>' +
        '<div class="artist">' + escapeHtml(s.artist || 'Unknown') + '</div>' +
        (function() {
          var eff = (s.charts || []).map(function(c) { return c.effector; }).filter(Boolean);
          var unique = eff.filter(function(v, i, a) { return a.indexOf(v) === i; });
          return unique.length > 0 ? '<div style="font-size:0.8em;color:#aaa;margin-top:0.25rem"><i class="mdi mdi-account" style="font-size:0.9em"></i> ' + escapeHtml(unique.join(', ')) + '</div>' : '';
        })() +
        '<div class="id-badge">ID: ' + s.mid + '</div>' +
      '</div>' +
      '<div class="charts">' + chipHtml + '</div>' +
      '<div class="actions">' +
        '<button class="button is-small is-info chart-preview-btn" data-id="' + s.nauticaId + '">' +
          '<span class="icon"><i class="mdi mdi-play"></i></span>' +
        '</button> ' +
        '<a class="button is-small is-link" href="/api/nautica/download/' + s.mid + '" target="_blank">' +
          '<span class="icon"><i class="mdi mdi-download"></i></span>' +
          '<span>Download</span>' +
        '</a>' +
      '</div>' +
      '</div>' +
    '</div>';
  }

  html += '</div>';
  container.innerHTML = html;

  var previewBtns = container.querySelectorAll('.chart-preview-btn');
  for (var k = 0; k < previewBtns.length; k++) {
    previewBtns[k].addEventListener('click', handleChartPreview);
  }
}

function refreshCustomChartsView() {
  var input = document.getElementById('custom-charts-search');
  var query = input ? input.value : '';
  var filtered = filterCustomCharts(allCustomCharts, query);
  renderCustomCharts(filtered, allCustomCharts.length);
}

function loadCustomCharts() {
  emit('nauticaList', {}).then(function (response) {
    var result = response.data;
    var container = document.getElementById('custom-charts-list');
    if (!result || result.error) {
      container.innerHTML = '<div class="notification is-danger is-light">' + escapeHtml(result ? result.error : 'No response') + '</div>';
      return;
    }

    allCustomCharts = (result.songs || []).filter(function (s) { return s.status === 'ready'; });
    if (allCustomCharts.length === 0) {
      container.innerHTML = '<p class="has-text-grey">No custom charts available yet.</p>';
      return;
    }

    refreshCustomChartsView();
  });
}

(function () {
  var input = document.getElementById('custom-charts-search');
  if (!input) return;
  var debounceTimer = null;
  input.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refreshCustomChartsView, 150);
  });
})();

function handleChartPreview(e) {
  var btn = e.currentTarget;
  var nauticaId = btn.getAttribute('data-id');
  var url = 'https://near.sfo2.cdn.digitaloceanspaces.com/ksm.dev/songs/' + nauticaId + '/preview.mp3';
  var icon = btn.querySelector('i');

  if (chartPreviewAudio && !chartPreviewAudio.paused) {
    chartPreviewAudio.pause();
    chartPreviewAudio = null;
    var allBtns = document.querySelectorAll('.chart-preview-btn i');
    for (var i = 0; i < allBtns.length; i++) {
      allBtns[i].className = 'mdi mdi-play';
    }
    if (btn._playing) { btn._playing = false; return; }
  }

  chartPreviewAudio = new Audio(url);
  chartPreviewAudio.volume = 0.5;
  chartPreviewAudio.play();
  icon.className = 'mdi mdi-stop';
  btn._playing = true;
  chartPreviewAudio.addEventListener('ended', function () {
    icon.className = 'mdi mdi-play';
    btn._playing = false;
  });
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

loadCustomCharts();

// ─── Curated list Export / Import (admin-only) ──────────────────────────────
//
// The buttons live on the user-facing Custom Charts tab so an admin running
// the page also gets a one-click way to copy the curated list to another
// server, but the underlying WebUI events (nauticaExportList /
// nauticaImportList) are admin-gated server-side. We hide the controls for
// non-admins via /api/me to avoid showing buttons that only emit 403s.

(function () {
  fetch('/api/me', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
    .then(function (r) { return r.json(); })
    .then(function (me) {
      if (!me || !me.admin) return;
      var slots = document.querySelectorAll('.is-admin-only');
      for (var i = 0; i < slots.length; i++) slots[i].style.display = '';
      wireCuratedExportImport();
    })
    .catch(function () { /* not logged in / endpoint unavailable — leave hidden */ });
})();

function wireCuratedExportImport() {
  var exportBtn = document.getElementById('curated-export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      exportBtn.disabled = true;
      exportBtn.classList.add('is-loading');
      emit('nauticaExportList', {}).then(function (response) {
        exportBtn.disabled = false;
        exportBtn.classList.remove('is-loading');
        var result = response && response.data;
        if (!result || result.error) {
          alert((result && result.error) || 'Export failed.');
          return;
        }
        var blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var d = new Date(result.exportedAt || Date.now());
        var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') +
                    '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
        a.href = url;
        a.download = 'asphyxia-curated-' + stamp + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }).catch(function () {
        exportBtn.disabled = false;
        exportBtn.classList.remove('is-loading');
        alert('Export failed.');
      });
    });
  }

  var importBtn = document.getElementById('curated-import-btn');
  var importInput = document.getElementById('curated-import-file');
  if (importBtn && importInput) {
    importBtn.addEventListener('click', function () { importInput.click(); });

    importInput.addEventListener('change', function () {
      var file = importInput.files && importInput.files[0];
      importInput.value = '';
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function () {
        var payload;
        try { payload = JSON.parse(reader.result); }
        catch (e) { alert('Could not parse file as JSON: ' + e.message); return; }

        if (!payload || !Array.isArray(payload.songs)) {
          alert('File does not look like an exported curated-chart list (missing "songs" array).');
          return;
        }
        if (!confirm('Import ' + payload.songs.length + ' chart entr(ies)? Existing charts with the same nauticaId will be left untouched. New entries land as "pending" and need Reconvert All on the Custom Charts Admin page to actually build audio.')) {
          return;
        }

        importBtn.disabled = true;
        importBtn.classList.add('is-loading');
        emit('nauticaImportList', { songs: payload.songs }).then(function (response) {
          importBtn.disabled = false;
          importBtn.classList.remove('is-loading');
          var result = response && response.data;
          if (!result || result.error) {
            alert((result && result.error) || 'Import failed.');
            return;
          }
          alert('Import done: ' + result.added + ' new, ' +
                result.skippedExisting + ' already existed, ' +
                result.skippedInvalid + ' invalid.');
          if (typeof loadCustomCharts === 'function') loadCustomCharts();
        }).catch(function () {
          importBtn.disabled = false;
          importBtn.classList.remove('is-loading');
          alert('Import failed.');
        });
      };
      reader.onerror = function () { alert('Could not read file.'); };
      reader.readAsText(file);
    });
  }
}
