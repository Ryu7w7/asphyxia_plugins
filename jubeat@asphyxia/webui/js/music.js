document.addEventListener('DOMContentLoaded', function(){
    fetch('static/resources/music_info.json').then(async r => {
        const musicData = await r.json();
        if(!musicData) return;

        document.querySelectorAll('tr').forEach(tr => {
            const nameElement = tr.querySelector('td.song-name');
            if(!nameElement) return;

            const musicId = tr.dataset.musicId;
            const musicInfo = musicData[musicId] || {};
            if(!musicInfo.name){
                nameElement.textContent = `미등록 곡(${musicId})`;
                tr.dataset.song = nameElement.textContent;
                return;
            }

            let name = musicInfo.name;
            if(tr.dataset.seq != null && musicInfo.level?.[tr.dataset.seq] != null){
                name += ` (${musicInfo.level[tr.dataset.seq]})`;
            }
            nameElement.textContent = name;
            tr.dataset.song = name;
        });

        document.dispatchEvent(new CustomEvent('music-data-loaded'));
    });
});
