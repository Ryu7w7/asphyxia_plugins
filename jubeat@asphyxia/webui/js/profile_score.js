let scores = [];
let musicData = {};
let sortedScores = [];

const compare = (a, b, asc) => {
    const direction = asc ? 1 : -1;
    if(a < b){
        return -1 * direction;
    }
    if(a > b){
        return 1 * direction;
    }
    return 0;
};

function renderTable(){
    const body = document.querySelector('.table-container table tbody');
    let tableHtml = '';
    for(const index in sortedScores){
        const scoreData = sortedScores[index];
        const musicId = (scoreData[0] || scoreData[1] || scoreData[2]).musicId;
        const html = `
            <tr class="paginated-content">
                <td class="song-name">${musicData[musicId]?.name || `알 수 없음(${musicId})`}</td>
                <td class="cell-bsc">${scoreData[0]?.score.toLocaleString('ko-KR') || '-'}</td>
                <td class="cell-adv">${scoreData[1]?.score.toLocaleString('ko-KR') || '-'}</td>
                <td class="cell-ext">${scoreData[2]?.score.toLocaleString('ko-KR') || '-'}</td>
            </tr>`
        tableHtml += html;
    }
    body.innerHTML = tableHtml;
}

document.addEventListener('DOMContentLoaded', async () => {
    let r = await emit('get_scores', {refid});
    scores = r.data.normal;
    sortedScores = [...scores]
    r = await fetch('static/resources/music_info.json')
    musicData = await r.json();

    renderTable();
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            let isAsc = true;
            if(th.classList.contains('asc')){
                isAsc = false;
                th.classList.add('desc');
                th.classList.remove('asc');
            }else if(th.classList.contains('desc')){
                th.classList.remove('desc');
                sortedScores = scores;
                renderTable()
                return;
            }else{
                th.classList.add('asc');
            }
            switch(th.dataset.sortType){
                case 'musicId':
                    sortedScores = [...scores].sort((a, b) => compare(
                        (a[0] || a[1] || a[2]).musicId,
                        (b[0] || b[1] || b[2]).musicId,
                        isAsc
                    ))
                    break;
                case 'name':
                    sortedScores = [...scores].sort((a, b) => new Intl.Collator('en', {sensitivity: 'base'}).compare(
                        (a[0] || a[1] || a[2]).name,
                        (b[0] || b[1] || b[2]).name,
                    ) * (isAsc ? 1 : -1));
                    break;
                case 'bsc':
                    sortedScores = [...scores].sort((a, b) => compare(a[0]?.score || 0, b[0]?.score || 0, isAsc))
                    break;
                case 'adv':
                    sortedScores = [...scores].sort((a, b) => compare(a[1]?.score || 0, b[1]?.score || 0, isAsc))
                    break;
                case 'ext':
                    sortedScores = [...scores].sort((a, b) => compare(a[2]?.score || 0, b[2]?.score || 0, isAsc))
                    break;
            }
            renderTable()
        });
    });
});