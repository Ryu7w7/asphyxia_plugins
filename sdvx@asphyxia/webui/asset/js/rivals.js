var urlParams;
var currentVersion;
var currentProfile;
var versionText = ['', 'BOOTH', 'INFINITE INFECTION', 'GRAVITY WARS', 'HEAVENLY HAVEN', 'VIVID WAVE', 'EXCEED GEAR', '∇'];

function getDifficulty(songData, difficultyNum) {
    switch(difficultyNum) {
        case 0:
            return 'NOV';
        case 1:
            return 'ADV';
        case 2:
            return 'EXH';
        case 3:
            if (songData && songData['info'] && songData['info']['inf_ver']) {
                switch(songData['info']['inf_ver']) {
                    case "2":
                        return "INF";
                    case "3":
                        return "GRV";
                    case "4":
                        return "HVN";
                    case "5":
                        return "VVD";
                    case "6":
                        return "XCD";
                    case "7":
                        return "NBL";
                }
            }
            return 'INF';
        case 4:
            return 'MXM';
        case 5:
            return 'ULT';
        default:
            return 'UNK';
    }
}

function getGrade(name, grade) {
    if (name) { 
        switch (grade) {
            case 0:
                return "No Grade";
            case 1:
                return "D";
            case 2:
                return "C";
            case 3:
                return "B";
            case 4:
                return "A";
            case 5:
                return currentVersion >= 4 ? "A+" : "AA";
            case 6:
                return currentVersion >= 4 ? "AAA" : "AA";
            case 7:
                return "AA+";
            case 8:
                return "AAA";
            case 9:
                return "AAA+";
            case 10:
                return "S";
            default:
                return "No Grade";
        }
    }
    return "No Grade";
}

function getMedal(name, clear, ver) {
    let targetVer = ver || currentVersion;
    if (name) {
        let verLabels = [];
        switch(targetVer) {
            case 1:
                verLabels = ["No Data", "PLAYED", "CLEAR", "ULTIMATE CHAIN", "PERFECT ULTIMATE CHAIN"];
                break;
            case 2:
                verLabels = ["No Data", "PLAYED", "EFFECTIVE CLEAR", "ULTIMATE CHAIN", "PERFECT ULTIMATE CHAIN", "EXCESSIVE CLEAR"];
                break;
            case 3:
            case 4:
                verLabels = ["No Data", "PLAYED", "EFFECTIVE CLEAR", "EXCESSIVE CLEAR", "ULTIMATE CHAIN", "PERFECT ULTIMATE CHAIN"];
                break;
            case 5:
            case 6:
            case 7:
            default:
                verLabels = ["No Data", "PLAYED", "EFFECTIVE CLEAR", "EXCESSIVE CLEAR", "MAXXIVE CLEAR", "ULTIMATE CHAIN", "PERFECT ULTIMATE CHAIN"];
                break;
        }
        return verLabels[clear] || "PLAYED";
    }
    return "PLAYED";
}

function formatSdvxId(id) {
    if (id == null || id === '' || isNaN(Number(id))) return 'N/A';
    let str = String(id).padStart(8, '0');
    return `${str.slice(0, 4)}-${str.slice(4)}`;
}

function escapeHtml(text) {
    if (!text) return '';
    return $('<div>').text(text).html();
}

function populateTable(yourScore, rivalScore, music_db) {
    let table_data = [];

    for (let ind in yourScore) {
        let mid = yourScore[ind].mid;
        let songData = null;
        if (music_db && music_db['mdb'] && music_db['mdb']['music']) {
            songData = music_db['mdb']['music'].find(m => parseInt(m['id']) === mid);
        }
        if (!songData && music_db && music_db['omni'] && music_db['omni']['music']) {
            songData = music_db['omni']['music'].find(m => parseInt(m['id']) === mid);
        }

        let songTitle = songData && songData['info'] && songData['info']['title_name'] ? songData['info']['title_name'] : ('Music ID: ' + mid);
        let difficulty = getDifficulty(songData, yourScore[ind].type);
        let rivalInd = rivalScore ? rivalScore.findIndex(s => s.mid === mid && s.type === yourScore[ind].type) : -1;
        let rScore = rivalInd >= 0 ? rivalScore[rivalInd].score : 0;

        table_data.push({
            mid: mid,
            songname: songTitle,
            difficulty: difficulty,
            yourScore: yourScore[ind].score,
            rivalScore: rScore,
            time: Date.parse(yourScore[ind]['updatedAt']) || 0,
            exscore: yourScore[ind].exscore || 0,
            grade: yourScore[ind].grade,
            clear: yourScore[ind].clear,
            maxChain: yourScore[ind].maxChain || 0,
            critical: yourScore[ind].critical || 0,
            s_critical: yourScore[ind].s_critical || 0,
            near: yourScore[ind].near || 0,
            error: yourScore[ind].error || 0,
            early: yourScore[ind].early || 0,
            late: yourScore[ind].late || 0
        });
    }

    if ($.fn.DataTable.isDataTable('#scorecompare')) {
        $('#scorecompare').DataTable().clear().destroy();
    }

    var table = $('#scorecompare').DataTable({
        searching: false,
        data: table_data,
        columns: [
            { data: 'mid' },
            { data: 'songname' },
            { data: 'difficulty' },
            { data: 'yourScore' },
            { data: 'rivalScore' },
            { data: 'time' },
        ],
        columnDefs: [
            {
                targets: [0, 1, 2, 3, 4, 5],
                orderable: false
            },
            {
                targets: [5],
                visible: false
            },
        ],
        order: [[5, 'desc']],
        responsive: true
    });

    $('#scorecompare tbody').off('click', 'tr').on('click', 'tr', function () {
        var data = table.row(this).data();
        if (data) {
            $('#modal-songname').text(data.songname);
            $('#modal-diff').text(data.difficulty);
            
            let gradeStr = getGrade(true, data.grade) || "S";
            let medalStr = getMedal(true, data.clear, currentVersion) || "PLAYED";

            var rankEl = $('#modal-rank');
            rankEl.text(gradeStr);
            rankEl.attr('data-grade', gradeStr);
            $('#modal-score').text(Number(data.yourScore || 0).toLocaleString());
            $('#modal-exscore').text(Number(data.exscore || 0).toLocaleString());
            $('#modal-maxchain').text(Number(data.maxChain || 0).toLocaleString());
            $('#modal-scrit').text(Number(data.s_critical || 0).toLocaleString());
            $('#modal-crit').text(Number(data.critical || 0).toLocaleString());
            $('#modal-near').text(Number(data.near || 0).toLocaleString());
            $('#modal-early').text(Number(data.early || 0).toLocaleString());
            $('#modal-late').text(Number(data.late || 0).toLocaleString());
            $('#modal-error').text(Number(data.error || 0).toLocaleString());
            $('#modal-medal').text(medalStr);

            $('#score-detail-modal').addClass('is-active');
        }
    });
}

window.closeScoreModal = function() {
    $('#score-detail-modal').removeClass('is-active');
};

$(document).ready(async function() {
    var music_db = null;
    $.getJSON("static/asset/json/music_db.json", function(json) {
        music_db = json;
    });

    var rivals_data_el = document.getElementById("rivals-pass");
    var profiles_data_el = document.getElementById("profiles-pass");
    var profile_data_el = document.getElementById("profile-pass");

    var rivals_data = rivals_data_el ? JSON.parse(rivals_data_el.innerText || "[]") : [];
    var profiles_data = profiles_data_el ? JSON.parse(profiles_data_el.innerText || "[]") : [];
    var your_profile_data = profile_data_el ? JSON.parse(profile_data_el.innerText || "[]") : [];

    urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('version') && urlParams.get('version') !== "") {
        currentVersion = parseInt(urlParams.get('version'));
    } else if (your_profile_data.length > 0) {
        currentVersion = your_profile_data[your_profile_data.length - 1].version;
    } else {
        currentVersion = 6;
    }
    currentProfile = your_profile_data.find(p => p.version === currentVersion);

    // Version dropdown
    var availableVersions = your_profile_data.filter(p => p.version >= 3).sort((a,b) => a.version - b.version);
    if (availableVersions.length === 0) {
        for (let v = 3; v <= 7; v++) {
            $('#version_select').append($('<option>', {
                value: v,
                text: versionText[v] || ('SDVX ' + v),
                selected: (v === currentVersion)
            }));
        }
    } else {
        for (var p of availableVersions) {
            $('#version_select').append($('<option>', {
                value: p.version,
                text: versionText[p.version] || ('SDVX ' + p.version),
                selected: (p.version === currentVersion)
            }));
        }
    }

    // Populate rival select for score comparison
    for (let r of rivals_data) {
        if (r.version !== currentVersion) continue;
        let rivalProfile = profiles_data.find(p => p.__refid === r.refid && p.version === currentVersion)
            || profiles_data.find(p => p.__refid === r.refid);
        let name = rivalProfile ? rivalProfile.name : r.name;
        if (name) {
            $('#rivallist').append($('<option>', {
                value: r.refid,
                text: name,
            }));
        }
    }

    $('#rivallist').change(async function() {
        if ($.fn.DataTable.isDataTable('#scorecompare')) {
            $('#scorecompare').DataTable().clear().destroy();
        }
        $('#scorecompare tbody').empty();

        let rivalVal = $('#rivallist').val();
        if (rivalVal && rivalVal !== "0") {
            try {
                let response = await emit('getRivalScores', {rivalId: rivalVal, refid: refid, version: currentVersion});
                if (response && response.data) {
                    populateTable(response.data.yourScores || [], response.data.rivalScores || [], music_db);
                }
            } catch (err) {
                console.error("Error fetching rival scores:", err);
            }
        }
    });

    // Render Search Results
    function renderSearchResults(query) {
        $('#search-results').empty();
        query = (query || '').trim().toLowerCase();
        if (query.length === 0) return;

        let cleanQueryId = query.replace(/[^0-9]/g, '');

        // Deduplicate profiles by __refid, prioritizing profile for currentVersion, then latest version
        let profileMap = new Map();
        for (let p of profiles_data) {
            if (!p || !p.__refid || p.__refid === refid) continue;
            let existing = profileMap.get(p.__refid);
            if (!existing) {
                profileMap.set(p.__refid, p);
            } else if (p.version === currentVersion) {
                profileMap.set(p.__refid, p);
            } else if (existing.version !== currentVersion && (p.version || 0) > (existing.version || 0)) {
                profileMap.set(p.__refid, p);
            }
        }

        let candidates = Array.from(profileMap.values());

        let results = candidates.filter(p => {
            let nameMatch = (p.name || '').toLowerCase().includes(query);
            let rawIdStr = (p.id != null ? String(p.id).toLowerCase() : '');
            let formattedId = formatSdvxId(p.id).toLowerCase();
            let idMatch = rawIdStr.includes(query) ||
                          formattedId.includes(query) ||
                          (cleanQueryId.length > 0 && rawIdStr.includes(cleanQueryId));
            return nameMatch || idMatch;
        });

        if (results.length === 0) {
            $('#search-results').append('<p class="has-text-grey p-2">No players found.</p>');
            return;
        }

        results.forEach(p => {
            let isRival = rivals_data.some(r => r.refid === p.__refid && r.version === currentVersion);
            let formattedId = formatSdvxId(p.id);

            let html = `
                <div class="box p-3 mb-2 is-flex is-justify-content-space-between is-align-items-center">
                    <div>
                        <strong>${escapeHtml(p.name || 'Unknown')}</strong><br>
                        <span class="is-size-7 has-text-grey">SDVX ID: ${formattedId}</span>
                    </div>
                    <div>
                        <button class="button is-small toggle-rival-btn ${isRival ? 'is-danger' : 'is-primary'}" data-id="${p.__refid}" data-action="${isRival ? 'remove' : 'add'}">
                            ${isRival ? 'Remove' : 'Add Rival'}
                        </button>
                    </div>
                </div>
            `;
            $('#search-results').append(html);
        });
    }

    // Render Current Rivals
    function renderCurrentRivals() {
        $('#current-rivals-list').empty();
        
        let currentRivals = rivals_data.filter(r => r.version === currentVersion);
        
        if (currentRivals.length === 0) {
            $('#current-rivals-list').append('<p class="has-text-grey p-2">You have no rivals for this version.</p>');
            return;
        }

        currentRivals.forEach(r => {
            let rivalProfile = profiles_data.find(p => p.__refid === r.refid && p.version === currentVersion)
                || profiles_data.find(p => p.__refid === r.refid);
            let name = rivalProfile ? rivalProfile.name : r.name;
            let rawId = (rivalProfile && rivalProfile.id) ? rivalProfile.id : r.sdvxID;
            let formattedId = formatSdvxId(rawId);
            let mutualBadge = r.mutual ? '<span class="tag is-success is-light ml-2">Mutual</span>' : '';
            
            let html = `
                <div class="box p-3 mb-2 is-flex is-justify-content-space-between is-align-items-center">
                    <div>
                        <strong>${escapeHtml(name || 'Unknown')}</strong>${mutualBadge}<br>
                        <span class="is-size-7 has-text-grey">SDVX ID: ${formattedId}</span>
                    </div>
                    <div>
                        <button class="button is-small toggle-rival-btn is-danger" data-id="${r.refid}" data-action="remove">
                            Remove
                        </button>
                    </div>
                </div>
            `;
            $('#current-rivals-list').append(html);
        });
    }

    // Initial render of current rivals
    renderCurrentRivals();

    // Check if there was a saved search query before page reload
    let savedSearch = sessionStorage.getItem('rival_search_query');
    if (savedSearch) {
        $('#rival-search').val(savedSearch);
        renderSearchResults(savedSearch);
        sessionStorage.removeItem('rival_search_query');
    }

    $('#rival-search').on('input', function() {
        renderSearchResults($(this).val());
    });
    
    $('#search-btn').click(function() {
        renderSearchResults($('#rival-search').val());
    });

    $(document).on('click', '.toggle-rival-btn', async function() {
        let rivalId = $(this).data('id');
        if (!rivalId) return;

        let $btn = $(this);
        $btn.addClass('is-loading').prop('disabled', true);

        // Save current search query so it is restored after reload
        let currentQuery = $('#rival-search').val();
        if (currentQuery) {
            sessionStorage.setItem('rival_search_query', currentQuery);
        }

        try {
            await emit('addRival', {rivalId: rivalId, refid: refid, version: currentVersion});
            location.reload();
        } catch (e) {
            console.error(e);
            alert("Error updating rival: " + (e.message || e));
            $btn.removeClass('is-loading').prop('disabled', false);
        }
    });

    $('#delete-all-rivals').click(async function() {
        if (confirm('Are you sure you want to delete all rivals for this version?')) {
            let $btn = $(this);
            $btn.addClass('is-loading').prop('disabled', true);
            try {
                await emit('deleteAllRivals', {refid: refid, version: currentVersion});
                location.reload();
            } catch (e) {
                console.error(e);
                alert("Error deleting all rivals: " + (e.message || e));
                $btn.removeClass('is-loading').prop('disabled', false);
            }
        }
    });

    $('#version_select').change(function() {
        const urlParams = new URLSearchParams(location.search);
        urlParams.set('version', $('#version_select').val());
        location.search = urlParams;
    });
});