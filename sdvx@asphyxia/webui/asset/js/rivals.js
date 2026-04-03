var urlParams;
var currentVersion;
var currentProfile;
var allProfiles = [];
var currentRivals = [];
var userRefId = "";
var versionText = ['', 'BOOTH', 'INFINITE INFECTION', 'GRAVITY WARS', 'HEAVENLY HAVEN', 'VIVIDWAVE', 'EXCEED GEAR', '∇'];

function getDifficulty(songData, difficultyNum) {
    if (!songData) return '???';
    switch (difficultyNum) {
        case 0: return 'NOV';
        case 1: return 'ADV';
        case 2: return 'EXH';
        case 3:
            switch (songData['info']['inf_ver']) {
                case "2": return "INF";
                case "3": return "GRV";
                case "4": return "HVN";
                case "5": return "VVD";
                case "6": return "XCD";
                default: return "INF";
            }
        case 4: return 'MXM';
        default: return '???';
    }
}

function populateScoreComparison(yourScore, rivalScore, music_db) {
    if (!music_db) return;
    const translate_table = {
        '龕': '€', '釁': '🍄', '驩': 'Ø', '曦': 'à', '齷': 'é', '骭': 'ü', '齶': '♡', '彜': 'ū', '罇': 'ê', '雋': 'Ǜ', '鬻': '♃', '鬥': 'Ã', '鬆': 'Ý', '曩': 'è', '驫': 'ā', '齲': '♥', '騫': 'á', '趁': 'Ǣ', '鬮': '¡', '盥': '⚙︎', '隍': '︎Ü', '頽': 'ä', '餮': 'Ƶ', '黻': '*', '蔕': 'ũ', '闃': 'Ā', '饌': '²', '煢': 'ø', '鑷': 'ゔ', '墸': '͟͟͞ ', '鹹': 'Ĥ', '瀑': 'À', '疉': 'Ö', '鑒': '₩'
    };
    let table_data = [];
    for (let ind in yourScore) {
        let songData = (music_db['mdb'] && music_db['mdb']['music']) ? music_db['mdb']['music'].find(m => parseInt(m.id) === yourScore[ind].mid) : null;
        if (!songData && music_db['omni']) songData = music_db['omni']['music'].find(m => parseInt(m.id) === yourScore[ind].mid);
        if (!songData) continue;
        let songName = songData['info']['title_name'] || 'Unknown';
        let difficulty = getDifficulty(songData, yourScore[ind].type);
        let rivalIndivScore = rivalScore.filter(s => s.mid === yourScore[ind].mid && s.type === yourScore[ind].type);
        if (rivalIndivScore.length > 0) {
            table_data.push({
                mid: yourScore[ind].mid,
                songname: songName.replace(/[龕釁驩曦齷骭齶彜罇雋鬻鬥鬆曩驫齲騫趁鬮盥隍頽餮黻蔕闃饌煢鑷墸鹹瀑疉鑒]/g, m => translate_table[m]),
                difficulty: difficulty,
                yourScore: yourScore[ind].score.toLocaleString(),
                rivalScore: rivalIndivScore[0].score.toLocaleString(),
                time: Date.parse(yourScore[ind]['updatedAt'])
            });
        }
    }
    $('#scorecompare').DataTable({
        destroy: true,
        searching: true,
        data: table_data,
        columns: [
            { data: 'mid' },
            { data: 'songname' },
            { data: 'difficulty' },
            { data: 'yourScore' },
            { data: 'rivalScore' },
            { data: 'time' },
        ],
        columnDefs: [{ targets: [5], visible: false }],
        order: [[5, 'desc']],
        responsive: true
    });
}

function renderPlayerTable() {
    try {
        const table_data = allProfiles
            .filter(p => {
                const p_refid = p.refid || p.__refid;
                return p_refid !== userRefId && p.version === currentVersion;
            })
            .map(p => {
                const p_refid = p.refid || p.__refid;
                const isRival = currentRivals.some(r => r.refid === p_refid && r.version === currentVersion);
                return {
                    name: p.name,
                    refid: p_refid,
                    isRival: isRival
                };
            });

        $('#player-table').DataTable({
            destroy: true,
            searching: true,
            data: table_data,
            columns: [
                { data: 'name', className: 'has-text-weight-bold' },
                {
                    data: null,
                    orderable: false,
                    className: 'has-text-centered',
                    render: function (data) {
                        const btnClass = data.isRival ? 'is-danger is-light' : 'is-primary';
                        const btnText = data.isRival ? 'Delete' : 'Add';
                        const btnIcon = data.isRival ? 'mdi-account-remove' : 'mdi-account-plus';
                        return `<button class="button is-small action-btn ${btnClass}" onclick="handleRivalAction('${data.refid}', ${data.isRival})">
                            <span class="icon is-small"><i class="mdi ${btnIcon}"></i></span>
                            <span>${btnText} Rival</span>
                        </button>`;
                    }
                }
            ],
            language: {
                search: "_INPUT_",
                searchPlaceholder: "Search by player name..."
            },
            responsive: true,
            order: [[0, 'asc']]
        });
    } catch (err) {
        console.error("renderPlayerTable failed:", err);
    }
}

async function handleRivalAction(targetRefid, isRemoving) {
    try {
        const response = await emit('addRival', { rivalId: targetRefid, refid: userRefId, version: currentVersion });
        if (response.data.status === 'error') {
            alert("Error: " + response.data.msg);
        } else {
            if (isRemoving) {
                currentRivals = currentRivals.filter(r => !(r.refid === targetRefid && r.version === currentVersion));
            } else {
                currentRivals.push({ refid: targetRefid, version: currentVersion });
            }
            renderPlayerTable();
            updateRivalComparisonList();
        }
    } catch (e) {
        console.error("handleRivalAction failed:", e);
    }
}

function updateRivalComparisonList() {
    const list = $('#rivallist');
    list.empty().append('<option value="0">Compete with...</option>');
    currentRivals.filter(r => r.version === currentVersion).forEach(r => {
        const profile = allProfiles.find(p => (p.refid || p.__refid) === r.refid && p.version === currentVersion);
        if (profile) {
            list.append($('<option>', { value: r.refid, text: profile.name }));
        }
    });
}

$(document).ready(async function () {
    var music_db = null;
    try {
        const mdbResponse = await fetch("static/asset/json/music_db.json");
        if (mdbResponse.ok) music_db = await mdbResponse.json();
        const customMdbResp = await fetch("static/asset/json/custom_music_db.json");
        if (customMdbResp.ok) {
            const custom = await customMdbResp.json();
            if (custom && custom.mdb && custom.mdb.music) {
                if (!music_db) music_db = { mdb: { music: [] } };
                music_db.mdb.music = music_db.mdb.music.concat(custom.mdb.music);
            }
        }
    } catch (e) {
        console.warn("DB load issue:", e);
    }

    try {
        const passElements = {
            rivals: document.getElementById("rivals-pass"),
            profiles: document.getElementById("profiles-pass"),
            yourProfile: document.getElementById("profile-pass"),
            userRefId: document.getElementById("refid-pass")
        };
        if (passElements.userRefId) userRefId = passElements.userRefId.innerText.trim();
        currentRivals = passElements.rivals ? JSON.parse(passElements.rivals.innerText) : [];
        allProfiles = passElements.profiles ? JSON.parse(passElements.profiles.innerText) : [];
        const your_profile_data = passElements.yourProfile ? JSON.parse(passElements.yourProfile.innerText) : [];

        urlParams = new URLSearchParams(window.location.search);
        currentVersion = (urlParams.has('version') && urlParams.get('version') !== "") ? parseInt(urlParams.get('version')) : (your_profile_data.length > 0 ? your_profile_data[your_profile_data.length - 1].version : 6);
        currentProfile = your_profile_data.find(p => p.version === currentVersion);

        your_profile_data.forEach(p => {
            $('#version_select').append($('<option>', { value: p.version, text: versionText[p.version], selected: (p.version === currentVersion) }));
        });

        renderPlayerTable();
        updateRivalComparisonList();
    } catch (err) {
        console.error("Init failed:", err);
    }

    $('#version_select').change(function () {
        const urlParams = new URLSearchParams(location.search);
        urlParams.set('version', $(this).val());
        location.search = urlParams;
    });

    $('#rivallist').change(async function () {
        const targetId = $(this).val();
        $('#scorecompare').DataTable().clear().destroy();
        if (targetId !== "0") {
            const response = await emit('getRivalScores', { rivalId: targetId, refid: userRefId, version: currentVersion });
            if (response.data.status === 'ok') {
                populateScoreComparison(response.data.yourScores, response.data.rivalScores, music_db);
            } else {
                alert(response.data.msg);
            }
        }
    });
});