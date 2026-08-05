var urlParams;
var currentVersion;
var currentProfile;
var versionText = ['', 'BOOTH', 'INFINTE INFECTION', 'GRAVITY WARS', 'HEAVENLY HAVEN', 'VIVIDWAVE', 'EXCEED GEAR', '∇']

function getDifficulty(songData, difficultyNum) {
    switch(difficultyNum) {
        case 0:
            return 'NOV'
        case 1:
            return 'ADV'
        case 2:
            return 'EXH'
        case 3:
            switch(songData['info']['inf_ver']) {
                case "2":
                    return "INF"
                case "3":
                    return "GRV"
                case "4":
                    return "HVN"
                case "5":
                    return "VVD"
                case "6":
                    return "XCD"
                case "7":
                    return "NBL"
            }
        case 4:
            return 'MXM'
        case 5:
            return 'ULT'
    }
}

function populateTable(yourScore, rivalScore, music_db) {
    let table_data = []
    for(let ind in yourScore) {
        let songData = music_db['mdb']['music'].filter((m => parseInt(m['id']) === yourScore[ind].mid))[0]
        if(!songData) songData = music_db['omni']['music'].filter((m => parseInt(m['id']) === yourScore[ind].mid))[0]
        let difficulty = getDifficulty(songData, yourScore[ind].type)
        let rivalInd = rivalScore.findIndex((s => s.mid === yourScore[ind].mid && s.type === yourScore[ind].type))
        table_data.push({
            mid: yourScore[ind].mid,
            songname: songData['info']['title_name'],
            difficulty: difficulty,
            yourScore: yourScore[ind].score,
            rivalScore: rivalInd >= 0 ? rivalScore[rivalInd].score : 0,
            time: Date.parse(yourScore[ind]['updatedAt'])
        })
    }

    $('#scorecompare').DataTable({
        searching: false,
        data: table_data,
        columns: [
            { data: 'mid' },
            { data: 'songname' },
            { data: 'difficulty' },
            { data: 'yourScore', },
            { data: 'rivalScore' },
            { data: 'time' },
        ],
        columnDefs: [
            {
                targets: [0,1,2,3,4,5],
                orderable: false
            },
            {
                targets: [5],
                visible: false
            },

        ],
        order: [[5, 'desc']],
        responsive: {
            details: {
                display: $.fn.dataTable.Responsive.display.modal({
                    header: function(row) {
                        var data = row.data();
                        return 'Details for ' + data.songname;
                    }
                })
            }
        },
    });
}

$(document).ready(async function() {
    var music_db
    $.getJSON("static/asset/json/music_db.json", function(json) {
        music_db = json;
    })

    rivals_data = JSON.parse(document.getElementById("rivals-pass").innerText);
    profiles_data = JSON.parse(document.getElementById("profiles-pass").innerText);

    your_profile_data = JSON.parse(document.getElementById("profile-pass").innerText);
    urlParams = new URLSearchParams(window.location.search);
    currentVersion = (urlParams.has('version') && urlParams.get('version') !== "") ? parseInt(urlParams.get('version')) : your_profile_data[your_profile_data.length - 1].version
    currentProfile = your_profile_data.find(p => p.version === currentVersion)

    profiles_data_filtered = profiles_data.filter((p => p.__refid !== refid && p.version === currentVersion && rivals_data.filter((r => refid === p.__refid && r.version === currentVersion)).length === 0))
    for (var p of your_profile_data.filter(p => p.version >= 3).sort((a,b) => a.version - b.version)) {
        $('#version_select').append($('<option>', {
            value: p.version,
            text: versionText[p.version],
            selected: (p.version === currentVersion)
        }));
    }

    // Initialize rival selection dropdown for score comparison
    for(let ind in rivals_data) {
        if (rivals_data[ind].version !== currentVersion) continue;
        
        let rivalProfile = profiles_data.find(p => p.__refid === rivals_data[ind].refid);
        if (rivalProfile) {
            $('#rivallist').append($('<option>', {
                value: rivals_data[ind].refid,
                text: rivalProfile.name,
            }));
        }
    }

    $('#rivallist').change(async function() {
        $('#scorecompare').DataTable().clear().destroy()
        if($('#rivallist').val() !== "0") {
            await emit('getRivalScores', {rivalId: $('#rivallist').val(), refid: refid, version: currentVersion}).then(
                function(response){
                    populateTable(response.data.yourScores, response.data.rivalScores, music_db)
                }
            )
        }
    })

    // Search functionality
    function renderSearchResults(query) {
        $('#search-results').empty();
        query = query.toLowerCase().trim();
        if (query.length === 0) return;

        // Filter profiles that match query, are not the current user, have played SDVX (packets), and match the current version.
        let results = profiles_data.filter(p => {
            if (p.__refid === refid || p.version !== currentVersion || p.packets === undefined) return false;
            let nameMatch = (p.name || '').toLowerCase().includes(query);
            let idMatch = (p.id || '').toString().toLowerCase().includes(query);
            return nameMatch || idMatch;
        });

        if (results.length === 0) {
            $('#search-results').append('<p class="has-text-grey">No players found.</p>');
            return;
        }

        results.forEach(p => {
            let isRival = rivals_data.some(r => r.refid === p.__refid && r.version === currentVersion);
            
            let html = `
                <div class="box p-3 mb-2 is-flex is-justify-content-space-between is-align-items-center">
                    <div>
                        <strong>${p.name || 'Unknown'}</strong><br>
                        <span class="is-size-7 has-text-grey">ID: ${p.id || 'N/A'}</span>
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

    function renderCurrentRivals() {
        $('#current-rivals-list').empty();
        
        let currentRivals = rivals_data.filter(r => r.version === currentVersion);
        
        if (currentRivals.length === 0) {
            $('#current-rivals-list').append('<p class="has-text-grey">You have no rivals for this version.</p>');
            return;
        }

        currentRivals.forEach(r => {
            let rivalProfile = profiles_data.find(p => p.__refid === r.refid);
            let name = rivalProfile ? rivalProfile.name : r.name;
            let id = rivalProfile ? rivalProfile.id : r.sdvxID;
            
            let html = `
                <div class="box p-3 mb-2 is-flex is-justify-content-space-between is-align-items-center">
                    <div>
                        <strong>${name || 'Unknown'}</strong><br>
                        <span class="is-size-7 has-text-grey">ID: ${id || 'N/A'}</span>
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

    $('#rival-search').on('input', function() {
        renderSearchResults($(this).val());
    });
    
    $('#search-btn').click(function() {
        renderSearchResults($('#rival-search').val());
    });

    $(document).on('click', '.toggle-rival-btn', async function() {
        let rivalId = $(this).data('id');
        let action = $(this).data('action'); // 'add' or 'remove'
        
        // Disable button while processing
        $(this).addClass('is-loading');

        try {
            await emit('addRival', {rivalId: rivalId, refid: refid, version: currentVersion});
            // Reload page to reflect changes
            location.reload();
        } catch (e) {
            console.error(e);
            $(this).removeClass('is-loading');
        }
    });

    $('#delete-all-rivals').click(async function() {
        if (confirm('Are you sure you want to delete all rivals for this version?')) {
            $(this).addClass('is-loading');
            try {
                await emit('deleteAllRivals', {refid: refid, version: currentVersion});
                location.reload();
            } catch (e) {
                console.error(e);
                $(this).removeClass('is-loading');
            }
        }
    });

    $('#version_select').change(function() {
        const urlParams = new URLSearchParams(location.search);
        urlParams.set('version', $('#version_select').val());
        location.search = urlParams;
    });
})