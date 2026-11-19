document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.paginated-container');
    if(!container) return;

    const tbody = container.querySelector('tbody');
    const allRows = Array.from(tbody.querySelectorAll('tr.history-row'));
    let currentRows = [...allRows];
    let focusedMusicId = null;

    const inputs = {
        player: document.getElementById('filter-player'),
        difficulty: document.getElementById('filter-difficulty'),
        mode: document.getElementById('filter-mode'),
        rateMin: document.getElementById('filter-rate-min'),
        rateMax: document.getElementById('filter-rate-max'),
        dateFrom: document.getElementById('filter-date-from'),
        dateTo: document.getElementById('filter-date-to'),
        reset: document.getElementById('filter-reset'),
    };

    const sortableHeaders = Array.from(container.querySelectorAll('th.sortable'));
    const sortState = {key: 'time', order: 'desc'};

    const modal = document.getElementById('history-detail-modal');
    const detailElements = {
        player: document.getElementById('detail-player'),
        song: document.getElementById('detail-song'),
        seq: document.getElementById('detail-seq'),
        score: document.getElementById('detail-score'),
        rate: document.getElementById('detail-rate'),
        mode: document.getElementById('detail-mode'),
        time: document.getElementById('detail-time'),
    };

    const closeModal = () => modal.classList.remove('is-active');
    modal.querySelectorAll('.modal-background, .delete, .js-close-modal').forEach(el => {
        el.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', (event) => {
        if(event.key === 'Escape' && modal.classList.contains('is-active')){
            closeModal();
        }
    });

    const toDateStart = (value) => value ? new Date(`${value}T00:00:00`).getTime() : null;
    const toDateEnd = (value) => value ? new Date(`${value}T23:59:59`).getTime() : null;

    const parseNum = (value) => {
        if(value == null || value === '') return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    };

    const applyRows = (rows) => {
        allRows.forEach(row => row.classList.remove('paginated-content'));
        tbody.innerHTML = '';
        rows.forEach(row => {
            row.classList.add('paginated-content');
            tbody.appendChild(row);
        });
    };

    const compare = (a, b) => {
        if(sortState.key === 'time' || sortState.key === 'score' || sortState.key === 'rate' || sortState.key === 'seq'){
            const x = Number(a.dataset[sortState.key]);
            const y = Number(b.dataset[sortState.key]);
            return x - y;
        }
        const x = (a.dataset[sortState.key] || '').toLowerCase();
        const y = (b.dataset[sortState.key] || '').toLowerCase();
        return x.localeCompare(y, 'ko');
    };

    const updateSortUI = () => {
        sortableHeaders.forEach(th => {
            th.classList.remove('asc', 'desc');
            if(th.dataset.sortKey === sortState.key){
                th.classList.add(sortState.order);
            }
        });
    };

    const run = () => {
        const player = inputs.player.value.trim().toLowerCase();
        const difficulty = inputs.difficulty.value;
        const mode = inputs.mode.value;
        const rateMin = parseNum(inputs.rateMin.value);
        const rateMax = parseNum(inputs.rateMax.value);
        const dateFrom = toDateStart(inputs.dateFrom.value);
        const dateTo = toDateEnd(inputs.dateTo.value);

        let rows = [...allRows].filter(row => {
            const okPlayer = !player || row.dataset.player.toLowerCase().includes(player);
            const okSongFocus = !focusedMusicId || row.dataset.musicId === focusedMusicId;
            const okDifficulty = !difficulty || row.dataset.seq === difficulty;
            const okMode = mode !== 'hard' || row.dataset.isHard === '1';

            const rate = Number(row.dataset.rate);
            const okRateMin = rateMin == null || rate >= rateMin;
            const okRateMax = rateMax == null || rate <= rateMax;

            const timestamp = Number(row.dataset.timestamp);
            const okFrom = dateFrom == null || timestamp >= dateFrom;
            const okTo = dateTo == null || timestamp <= dateTo;

            return okPlayer && okSongFocus && okDifficulty && okMode && okRateMin && okRateMax && okFrom && okTo;
        });

        rows.sort((a, b) => {
            const result = compare(a, b);
            return sortState.order === 'asc' ? result : -result;
        });

        currentRows = rows;
        applyRows(currentRows);
    };

    sortableHeaders.forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.sortKey;
            if(sortState.key === key){
                sortState.order = sortState.order === 'asc' ? 'desc' : 'asc';
            }else{
                sortState.key = key;
                sortState.order = key === 'time' ? 'desc' : 'asc';
            }
            updateSortUI();
            run();
        });
    });

    Object.values(inputs).forEach(input => {
        if(!input || input === inputs.reset) return;
        input.addEventListener('input', run);
        input.addEventListener('change', run);
    });

    inputs.reset.addEventListener('click', () => {
        inputs.player.value = '';
        inputs.difficulty.value = '';
        inputs.mode.value = '';
        inputs.rateMin.value = '';
        inputs.rateMax.value = '';
        inputs.dateFrom.value = '';
        inputs.dateTo.value = '';
        focusedMusicId = null;
        sortState.key = 'time';
        sortState.order = 'desc';
        updateSortUI();
        run();
    });

    tbody.addEventListener('click', (event) => {
        const trigger = event.target.closest('.detail-trigger, tr.history-row');
        if(!trigger) return;

        const row = event.target.closest('tr.history-row') || trigger;
        if(!row) return;

        detailElements.player.textContent = row.dataset.player || '-';
        detailElements.song.textContent = row.dataset.song || row.querySelector('.song-name')?.textContent || '-';
        detailElements.seq.textContent = row.querySelector('.difficulty-tag')?.textContent || '-';
        detailElements.score.textContent = Number(row.dataset.score).toLocaleString('ko-KR');
        detailElements.rate.textContent = `${row.dataset.rate}%`;
        detailElements.mode.textContent = row.dataset.isHard === '1' ? 'HARD' : 'NORMAL';
        detailElements.time.textContent = row.dataset.time || '-';

        document.getElementById('detail-filter-song').onclick = () => {
            focusedMusicId = row.dataset.musicId || null;
            inputs.player.value = '';
            inputs.difficulty.value = row.dataset.seq || '';
            inputs.mode.value = row.dataset.isHard === '1' ? 'hard' : '';
            run();
            closeModal();
        };

        document.getElementById('detail-filter-player').onclick = () => {
            inputs.player.value = row.dataset.player || '';
            run();
            closeModal();
        };

        modal.classList.add('is-active');
    });

    const refreshSongDataset = () => {
        allRows.forEach(row => {
            row.dataset.song = row.querySelector('.song-name')?.textContent?.trim() || '';
        });
        run();
    };

    document.addEventListener('music-data-loaded', refreshSongDataset);

    updateSortUI();
    run();
    refreshSongDataset();
});
