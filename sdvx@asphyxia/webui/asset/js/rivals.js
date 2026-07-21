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
        if(!songData && music_db['omni']) songData = music_db['omni']['music'].filter((m => parseInt(m['id']) === yourScore[ind].mid))[0]
        if(!songData) continue; // Skip if song data is completely missing
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

    rivals_data = JSON.parse(document.getElementById("rivals-pass").textContent);

    your_profile_data = JSON.parse(document.getElementById("profile-pass").textContent);
    urlParams = new URLSearchParams(window.location.search);
    currentVersion = (urlParams.has('version') && urlParams.get('version') !== "") ? parseInt(urlParams.get('version')) : your_profile_data[your_profile_data.length - 1].version
    currentProfile = your_profile_data.find(p => p.version === currentVersion)

    for (var p of your_profile_data.filter(p => p.version >= 3).sort((a,b) => a.version - b.version)) {
        $('#version_select').append($('<option>', {
            value: p.version,
            text: versionText[p.version],
            selected: (p.version === currentVersion)
        }));
    }

    let current_rivals = rivals_data.filter(r => r.version === currentVersion);
    for(let ind in current_rivals) {
        $('#rivallist').append($('<option>', {
            value: current_rivals[ind].refid,
            text: current_rivals[ind].name,
        }));
        $('#rivallist_manage').append($('<option>', {
            value: current_rivals[ind].refid,
            text: current_rivals[ind].name,
        }));
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

    $('#addrival').click(async function() {
        let inputId = $('#rival_sdvxid').val();
        if(inputId !== '') {
            await emit('addRival', {sdvxId: inputId, refid: refid, version: currentVersion}).then(
                function(response){
                    alert(response.data.msg)
                    location.reload()
                }
            )
        }
    })

    $('#deleterival').click(async function() {
        let rivalId = $('#rivallist_manage').val();
        if(rivalId !== '0') {
            await emit('removeRival', {rivalId: rivalId, refid: refid, version: currentVersion}).then(
                function(response){
                    alert(response.data.msg)
                    location.reload()
                }
            )
        }
    })

    $('#search_button').click(async function() {
        let query = $('#search_name').val();
        if(query !== '') {
            $('#search_button').addClass('is-loading');
            await emit('searchPlayer', {query: query, version: currentVersion}).then(
                function(response){
                    $('#search_button').removeClass('is-loading');
                    let tbody = $('#search_results_body');
                    tbody.empty();
                    let results = response.data.results.filter(p => p.refid !== refid);
                    if(results.length > 0) {
                        results.forEach(player => {
                            let tr = $('<tr>');
                            tr.append($('<td>').text(player.name));
                            let sdvxIdStr = player.sdvxId.toString().padStart(8, '0');
                            let formattedId = sdvxIdStr.slice(0,4) + '-' + sdvxIdStr.slice(4);
                            tr.append($('<td>').text(formattedId));
                            let addBtn = $('<button>').addClass('button is-small is-primary').text('Add');
                            addBtn.click(async function() {
                                await emit('addRival', {sdvxId: player.sdvxId.toString(), refid: refid, version: currentVersion}).then(
                                    function(addRes){
                                        alert(addRes.data.msg);
                                        location.reload();
                                    }
                                )
                            });
                            tr.append($('<td>').append(addBtn));
                            tbody.append(tr);
                        });
                        $('#search_results_container').show();
                    } else {
                        let tr = $('<tr>').append($('<td colspan="3" class="has-text-centered">').text('No players found.'));
                        tbody.append(tr);
                        $('#search_results_container').show();
                    }
                }
            ).catch(err => {
                $('#search_button').removeClass('is-loading');
            });
        }
    });

    $('#version_select').change(function() {
        const urlParams = new URLSearchParams(location.search);
        urlParams.set('version', $('#version_select').val());
        location.search = urlParams;
    });
})