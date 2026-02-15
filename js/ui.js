/* ═══════════════════════════════════════════════════════════
   UI MODULE — Main Application Controller
   ═══════════════════════════════════════════════════════════ */

const UI = (() => {
    'use strict';

    // ── Tab System ──────────────────────────────────────
    function switchTab(tab) {
        const tabs = ['game', 'dashboard', 'history', 'help'];
        tabs.forEach(t => {
            const panel = document.getElementById('panel-' + t);
            const btn = document.getElementById('tab-' + t);
            if (panel) panel.classList.add('hidden');
            if (btn) btn.classList.remove('active');
        });

        const activePanel = document.getElementById('panel-' + tab);
        const activeBtn = document.getElementById('tab-' + tab);
        if (activePanel) activePanel.classList.remove('hidden');
        if (activeBtn) activeBtn.classList.add('active');

        // Refresh data when switching to these tabs
        if (tab === 'dashboard') Dashboard.render();
        if (tab === 'history') History.render();
    }

    // ── Game UI Bindings ────────────────────────────────
    let nLevel = 2;

    function initGame() {
        // Load last N-level
        const sessions = Storage.getSessions();
        if (sessions.length > 0) {
            const last = sessions[sessions.length - 1];
            if (last.adaptation === 'up') nLevel = last.nLevel + 1;
            else if (last.adaptation === 'down') nLevel = Math.max(1, last.nLevel - 1);
            else nLevel = last.nLevel;
        }
        updateNDisplay();
    }

    function adjustN(delta) {
        if (Game.isRunning()) return;
        const newN = nLevel + delta;
        if (newN >= 1 && newN <= 15) {
            nLevel = newN;
            updateNDisplay();
        }
    }

    function updateNDisplay() {
        const el = document.getElementById('nLevelDisplay');
        if (el) el.textContent = nLevel;
    }

    function getConfig() {
        return {
            nLevel,
            trials: parseInt(document.getElementById('trialsSelect').value),
            speed: parseInt(document.getElementById('speedSelect').value),
            mode: document.getElementById('modeSelect').value
        };
    }

    // ── Focus Mode ──────────────────────────────────────
    function enterFocusMode() {
        document.body.classList.add('focus-mode');
        // Update focus N-level badge
        const badge = document.getElementById('focusNLevel');
        if (badge) badge.textContent = `N = ${nLevel}`;
    }

    function exitFocusMode() {
        document.body.classList.remove('focus-mode');
    }

    // ── Start / Stop ────────────────────────────────────
    function toggleGame() {
        if (Game.isRunning()) {
            Game.stop();
            resetGameUI();
            exitFocusMode();
        } else {
            startGame();
        }
    }

    function startGame() {
        // Clear previous results
        document.getElementById('resultOverlay').classList.remove('show');

        const config = getConfig();
        enterFocusMode();
        updateStartButton(true);
        setText('sessionStatus', 'ACTIVE');
        setClass('sessionStatus', 'stat-value', 'text-neon-green');
        setText('trialTotal', config.trials);

        Game.start(config, {
            onTrialStart: handleTrialStart,
            onTrialClear: handleTrialClear,
            onStatsUpdate: handleStatsUpdate,
            onSessionEnd: handleSessionEnd
        });
    }

    function resetGameUI() {
        clearGrid();
        setText('letterDisplay', '—');
        setText('sessionStatus', 'READY');
        setClass('sessionStatus', 'stat-value', 'text-neon-green');
        updateStartButton(false);
        resetMatchButtons();
        document.getElementById('progressFill').style.width = '0%';
    }

    function updateStartButton(running) {
        const btn = document.getElementById('btnStart');
        if (running) {
            btn.innerHTML = '<i data-lucide="square" class="w-4 h-4"></i> ABORT';
        } else {
            btn.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i> START SESSION';
        }
        lucide.createIcons();
    }

    // ── Trial Handlers ──────────────────────────────────
    function handleTrialStart(data) {
        clearGrid();
        resetMatchButtons();

        // Highlight position
        const cells = document.querySelectorAll('.grid-cell');
        if (cells[data.position]) cells[data.position].classList.add('active');

        // Letter display: show audio icon in focus mode, letter text otherwise
        const letterEl = document.getElementById('letterDisplay');
        if (document.body.classList.contains('focus-mode')) {
            letterEl.textContent = '🔊';
        } else {
            letterEl.textContent = data.letter;
        }
        letterEl.classList.add('flash');
        setTimeout(() => letterEl.classList.remove('flash'), 300);

        // Progress
        setText('trialCurrent', data.trial);
        const pct = (data.trial / data.total * 100).toFixed(0);
        document.getElementById('progressFill').style.width = pct + '%';
    }

    function handleTrialClear() {
        clearGrid();
        setText('letterDisplay', '—');
    }

    function handleStatsUpdate(stats) {
        setText('statPosHits', `${stats.posHits}/${stats.posTotal}`);
        setText('statAudioHits', `${stats.audioHits}/${stats.audioTotal}`);
        setText('statPosAcc', stats.posAcc !== null ? stats.posAcc + '%' : '—');
        setText('statAudioAcc', stats.audioAcc !== null ? stats.audioAcc + '%' : '—');
        setText('statOverallAcc', stats.overallAcc !== null ? stats.overallAcc + '%' : '—');
        setText('statAvgRT', stats.avgRT !== null ? stats.avgRT + 'ms' : '—');
        setText('statFalseAlarms', stats.totalFalseAlarms);
        setText('statMisses', stats.totalMisses);
        setText('statDPrime', stats.overallDPrime != null ? stats.overallDPrime.toFixed(2) : '—');
    }

    function handleSessionEnd(result) {
        resetGameUI();
        exitFocusMode();

        // Update N-level
        nLevel = result.newN;
        updateNDisplay();

        // Check for new records
        const lastSessions = Storage.getSessions();
        const lastSession = lastSessions[lastSessions.length - 1];
        const newRecords = Storage.checkNewRecords(lastSession);

        // Build record badges
        let recordsHTML = '';
        if (newRecords.isFirst) {
            recordsHTML = `<div class="text-center mb-3"><div class="badge badge-green" style="font-size:11px; padding:5px 12px;">🎉 Première session !</div></div>`;
        } else {
            const badges = [];
            if (newRecords.maxN) badges.push('🧠 Nouveau Max N-Level !');
            if (newRecords.bestAcc) badges.push('🎯 Record de Précision !');
            if (newRecords.bestRT) badges.push('⚡ Record de Vitesse !');
            if (newRecords.bestDPrime) badges.push('📊 Record d′ !');
            if (badges.length > 0) {
                recordsHTML = `<div class="text-center mb-3 space-y-1">${badges.map(b => 
                    `<div class="badge badge-green" style="font-size:11px; padding:5px 12px; display:inline-block; animation: pulse 1s ease infinite;">${b}</div>`
                ).join(' ')}</div>`;
            }
        }

        // Check daily goal
        const settings = Storage.getSettings();
        const dailyGoal = settings.dailyGoal || 5;
        const today = new Date().toISOString().slice(0, 10);
        const todayCount = lastSessions.filter(s => s.date.slice(0, 10) === today).length;
        let goalHTML = '';
        if (todayCount === dailyGoal) {
            goalHTML = `<div class="text-center mb-3"><div class="badge" style="font-size:11px; padding:5px 12px; background: rgba(0,229,255,0.15); color: #00e5ff; border: 1px solid rgba(0,229,255,0.3);">🎯 Objectif quotidien atteint !</div></div>`;
        } else if (todayCount < dailyGoal) {
            const remaining = dailyGoal - todayCount;
            goalHTML = `<div class="text-center mb-2 text-[10px] text-text-s">🎯 ${remaining} session${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''} pour l'objectif</div>`;
        }

        // Show result overlay
        const overlay = document.getElementById('resultOverlay');
        const accClass = result.overallAcc >= 80 ? 'text-neon-green glow-green'
            : result.overallAcc >= 50 ? 'text-neon-yellow glow-yellow'
            : 'text-neon-red glow-red';

        const adaptHTML = result.adaptation === 'up'
            ? `<div class="badge badge-green" style="font-size:12px; padding:6px 14px;">▲ N-Level → ${result.newN}</div>`
            : result.adaptation === 'down'
                ? `<div class="badge badge-red" style="font-size:12px; padding:6px 14px;">▼ N-Level → ${result.newN}</div>`
                : `<div class="badge badge-yellow" style="font-size:12px; padding:6px 14px;">= N-Level inchangé</div>`;

        const dpDisplay = result.overallDPrime != null ? result.overallDPrime.toFixed(2) : '—';
        const dpColor = result.overallDPrime != null
            ? (result.overallDPrime >= 3 ? '#00ff41' : result.overallDPrime >= 1.5 ? '#00e5ff' : result.overallDPrime >= 0 ? '#ffaf00' : '#ff3e3e')
            : '#6b7d8e';

        document.getElementById('resultContent').innerHTML = `
            <div class="text-center mb-4">
                <div class="font-orbitron text-xs text-text-s uppercase tracking-wider mb-2">Session Terminée</div>
                <div class="font-orbitron text-4xl font-bold ${accClass}">${result.overallAcc}%</div>
                <div class="text-text-s text-xs mt-1">Précision Globale</div>
            </div>

            ${recordsHTML}

            <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="card card-alt p-3 text-center">
                    <div class="text-xs text-text-s mb-1">Position</div>
                    <div class="font-bold text-neon-green">${result.posAcc}%</div>
                </div>
                <div class="card card-alt p-3 text-center">
                    <div class="text-xs text-text-s mb-1">Audio</div>
                    <div class="font-bold text-neon-blue">${result.audioAcc}%</div>
                </div>
                <div class="card card-alt p-3 text-center">
                    <div class="text-xs text-text-s mb-1">Temps de Réaction</div>
                    <div class="font-bold text-neon-purple">${result.avgRT || 0}ms</div>
                </div>
                <div class="card card-alt p-3 text-center">
                    <div class="text-xs text-text-s mb-1">d′ Score</div>
                    <div class="font-bold" style="color: ${dpColor};">${dpDisplay}</div>
                </div>
            </div>

            <div class="text-center mb-3">${adaptHTML}</div>
            ${goalHTML}

            <div class="flex gap-2 justify-center">
                <button onclick="UI.closeResult(); UI.toggleGame();" class="btn btn-primary" style="padding:10px 24px;">
                    <i data-lucide="refresh-cw" class="w-4 h-4"></i> REJOUER
                </button>
                <button onclick="UI.closeResult();" class="btn" style="padding:10px 24px;">
                    FERMER
                </button>
            </div>
        `;

        overlay.classList.add('show');
        lucide.createIcons();

        // Also update status
        setText('sessionStatus', 'TERMINÉ');
        setClass('sessionStatus', 'stat-value', 'text-neon-yellow');
    }

    function closeResult() {
        document.getElementById('resultOverlay').classList.remove('show');
    }

    // ── Match Buttons ───────────────────────────────────
    function matchPosition() {
        const result = Game.respondPosition();
        if (result === null) return;

        const btn = document.getElementById('btnPosition');
        btn.classList.add(result ? 'correct' : 'wrong');
        showFeedbackFlash(result);
    }

    function matchAudio() {
        const result = Game.respondAudio();
        if (result === null) return;

        const btn = document.getElementById('btnAudio');
        btn.classList.add(result ? 'correct' : 'wrong');
        showFeedbackFlash(result);
    }

    function resetMatchButtons() {
        const btnP = document.getElementById('btnPosition');
        const btnA = document.getElementById('btnAudio');
        if (btnP) { btnP.classList.remove('correct', 'wrong'); }
        if (btnA) { btnA.classList.remove('correct', 'wrong'); }
    }

    function showFeedbackFlash(correct) {
        const el = document.getElementById('feedbackFlash');
        el.textContent = correct ? '✓' : '✗';
        el.style.color = correct ? 'var(--neon-green)' : 'var(--neon-red)';
        el.style.textShadow = correct
            ? '0 0 40px rgba(0,255,65,0.8)' : '0 0 40px rgba(255,62,62,0.8)';
        el.className = 'feedback-flash show';
        setTimeout(() => el.className = 'feedback-flash', 600);
    }

    // ── Grid ────────────────────────────────────────────
    function clearGrid() {
        document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('active'));
    }

    // ── Utilities ───────────────────────────────────────
    function setText(id, v) {
        const el = document.getElementById(id);
        if (el) el.textContent = v;
    }

    function setClass(id, ...classes) {
        const el = document.getElementById(id);
        if (el) el.className = classes.join(' ');
    }

    // ── Keyboard ────────────────────────────────────────
    function initKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Don't intercept when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

            const key = e.key;
            if (key === 'ArrowLeft' && Game.isRunning()) { e.preventDefault(); matchPosition(); }
            if (key === 'ArrowRight' && Game.isRunning()) { e.preventDefault(); matchAudio(); }
            if (key === ' ' && !Game.isRunning()) { e.preventDefault(); toggleGame(); }
        });
    }

    // ── Init ────────────────────────────────────────────
    function init() {
        initGame();
        initKeyboard();
        lucide.createIcons();
    }

    return {
        init, switchTab, adjustN, toggleGame,
        matchPosition, matchAudio, closeResult
    };
})();

// ── Bootstrap ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => UI.init());
