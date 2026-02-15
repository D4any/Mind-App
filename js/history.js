/* ═══════════════════════════════════════════════════════════
   HISTORY MODULE — Session History Table
   ═══════════════════════════════════════════════════════════ */

const History = (() => {
    'use strict';

    let sortColumn = 'date';
    let sortAsc = false;

    // ── Render ──────────────────────────────────────────
    function render() {
        const sessions = Storage.getSessions();
        const tbody = document.getElementById('historyBody');
        const empty = document.getElementById('historyEmpty');
        const content = document.getElementById('historyContent');

        if (sessions.length === 0) {
            if (content) content.classList.add('hidden');
            if (empty) empty.classList.remove('hidden');
            return;
        }

        if (content) content.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');

        // Sort
        const sorted = [...sessions].sort((a, b) => {
            let va = a[sortColumn], vb = b[sortColumn];
            if (sortColumn === 'date') { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
            if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
            return sortAsc ? va - vb : vb - va;
        });

        setText('historyCount', sessions.length);

        tbody.innerHTML = sorted.map((s, i) => {
            const d = new Date(s.date);
            const dateFormatted = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

            const accColor = s.overallAccuracy >= 80 ? 'color: var(--neon-green)'
                : s.overallAccuracy >= 50 ? 'color: var(--neon-yellow)'
                : 'color: var(--neon-red)';

            const adaptBadge = s.adaptation === 'up'
                ? '<span class="badge badge-green">▲ UP</span>'
                : s.adaptation === 'down'
                    ? '<span class="badge badge-red">▼ DOWN</span>'
                    : '<span class="badge badge-yellow">= STAY</span>';

            const rtDisplay = s.avgReactionTime > 0 ? s.avgReactionTime + 'ms' : '—';
            const dpDisplay = s.overallDPrime != null ? s.overallDPrime.toFixed(2) : '—';
            const dpColor = s.overallDPrime != null
                ? (s.overallDPrime >= 3 ? 'var(--neon-green)' : s.overallDPrime >= 1.5 ? '#00e5ff' : s.overallDPrime >= 0 ? 'var(--neon-yellow)' : 'var(--neon-red)')
                : 'var(--text-secondary)';

            return `<tr>
                <td style="color: var(--text-secondary)">${sortAsc ? i + 1 : sorted.length - i}</td>
                <td>${dateFormatted}</td>
                <td class="text-center"><span style="color: var(--neon-green); font-weight: 700">${s.nLevel}</span></td>
                <td class="text-center">${s.trials}</td>
                <td class="text-center">${s.positionAccuracy}%</td>
                <td class="text-center">${s.audioAccuracy}%</td>
                <td class="text-center" style="${accColor}; font-weight: 700">${s.overallAccuracy}%</td>
                <td class="text-center" style="color: var(--neon-purple)">${rtDisplay}</td>
                <td class="text-center" style="color: ${dpColor}; font-weight: 600">${dpDisplay}</td>
                <td class="text-center">${adaptBadge}</td>
                <td class="text-center">
                    <button onclick="History.deleteOne(${s.id})" class="btn btn-danger" style="padding: 3px 8px; font-size: 10px;" title="Supprimer">✕</button>
                </td>
            </tr>`;
        }).join('');
    }

    // ── Sort ────────────────────────────────────────────
    function setSort(column) {
        if (sortColumn === column) {
            sortAsc = !sortAsc;
        } else {
            sortColumn = column;
            sortAsc = column === 'date' ? false : true;
        }

        // Update header indicators
        document.querySelectorAll('.history-table th[data-sort]').forEach(th => {
            th.classList.remove('sorted');
            const arrow = th.querySelector('.sort-arrow');
            if (arrow) arrow.textContent = '';
        });
        const th = document.querySelector(`.history-table th[data-sort="${column}"]`);
        if (th) {
            th.classList.add('sorted');
            const arrow = th.querySelector('.sort-arrow');
            if (arrow) arrow.textContent = sortAsc ? ' ↑' : ' ↓';
        }

        render();
    }

    // ── Delete One ──────────────────────────────────────
    function deleteOne(id) {
        Storage.deleteSession(id);
        render();
    }

    // ── Clear All ───────────────────────────────────────
    function clearAll() {
        if (!confirm('Supprimer TOUT l\'historique ? Cette action est irréversible.')) return;
        Storage.clearAllSessions();
        render();
        Dashboard.render();
    }

    function setText(id, v) {
        const el = document.getElementById(id);
        if (el) el.textContent = v;
    }

    return { render, setSort, deleteOne, clearAll };
})();
