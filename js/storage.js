/* ═══════════════════════════════════════════════════════════
   STORAGE MODULE — localStorage management
   ═══════════════════════════════════════════════════════════ */

const Storage = (() => {
    'use strict';

    const SESSIONS_KEY = 'dnb_sessions';
    const SETTINGS_KEY = 'dnb_settings';

    // ── Sessions ────────────────────────────────────────
    function getSessions() {
        try {
            return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
        } catch {
            return [];
        }
    }

    function saveSession(session) {
        const sessions = getSessions();
        session.id = Date.now();
        session.date = new Date().toISOString();
        sessions.push(session);
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
        return session;
    }

    function deleteSession(id) {
        const sessions = getSessions().filter(s => s.id !== id);
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    }

    function clearAllSessions() {
        localStorage.removeItem(SESSIONS_KEY);
    }

    // ── Settings ────────────────────────────────────────
    function getSettings() {
        try {
            return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        } catch {
            return {};
        }
    }

    function saveSetting(key, value) {
        const settings = getSettings();
        settings[key] = value;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    // ── Stats Computation ───────────────────────────────
    function getStats() {
        const sessions = getSessions();
        if (sessions.length === 0) return null;

        const totalSessions = sessions.length;
        const maxN = Math.max(...sessions.map(s => s.nLevel));
        const bestAcc = Math.max(...sessions.map(s => s.overallAccuracy));
        const rts = sessions.filter(s => s.avgReactionTime > 0).map(s => s.avgReactionTime);
        const bestRT = rts.length > 0 ? Math.min(...rts) : null;
        const avgRT = rts.length > 0 ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;

        // D-prime stats
        const dprimes = sessions.filter(s => s.overallDPrime != null).map(s => s.overallDPrime);
        const bestDPrime = dprimes.length > 0 ? Math.max(...dprimes) : null;
        const avgDPrime = dprimes.length > 0
            ? Math.round(dprimes.reduce((a, b) => a + b, 0) / dprimes.length * 100) / 100
            : null;

        // Total training time (approx: trials × speed per session)
        const totalTrials = sessions.reduce((sum, s) => sum + s.trials, 0);
        const avgSpeed = sessions.reduce((sum, s) => sum + (s.speed || 3000), 0) / sessions.length;
        const totalTimeMinutes = Math.round((totalTrials * avgSpeed) / 60000);

        // Streak
        const streak = computeStreak(sessions);

        // Today's sessions
        const today = new Date().toISOString().slice(0, 10);
        const todaySessions = sessions.filter(s => s.date.slice(0, 10) === today);
        const todayCount = todaySessions.length;
        const todayMaxN = todaySessions.length > 0 ? Math.max(...todaySessions.map(s => s.nLevel)) : 0;
        const todayAvgAcc = todaySessions.length > 0
            ? Math.round(todaySessions.reduce((s, x) => s + x.overallAccuracy, 0) / todaySessions.length)
            : 0;

        // Daily goal
        const dailyGoal = getSettings().dailyGoal || 5;

        // Last 7 days trend
        const last7 = getLast7DaysAccuracy(sessions);

        // Per-day aggregation
        const byDay = aggregateByDay(sessions);

        // Records
        const records = computeRecords(sessions);

        return {
            totalSessions, maxN, bestAcc, bestRT, avgRT,
            bestDPrime, avgDPrime,
            totalTrials, totalTimeMinutes, streak,
            todayCount, todayMaxN, todayAvgAcc, dailyGoal,
            last7, byDay, sessions, records
        };
    }

    // ── Records ─────────────────────────────────────────
    function computeRecords(sessions) {
        if (sessions.length === 0) return null;
        const rts = sessions.filter(s => s.avgReactionTime > 0);
        const dps = sessions.filter(s => s.overallDPrime != null);
        return {
            maxN: Math.max(...sessions.map(s => s.nLevel)),
            bestAcc: Math.max(...sessions.map(s => s.overallAccuracy)),
            bestRT: rts.length > 0 ? Math.min(...rts.map(s => s.avgReactionTime)) : null,
            bestDPrime: dps.length > 0 ? Math.max(...dps.map(s => s.overallDPrime)) : null,
            longestStreak: computeStreak(sessions),
            totalSessions: sessions.length
        };
    }

    function checkNewRecords(sessionData) {
        const sessions = getSessions();
        // Compare against all sessions EXCEPT the one just added (it's already in there)
        const previous = sessions.filter(s => s.id !== sessionData.id);
        if (previous.length === 0) return { isFirst: true };

        const records = {};
        const prevMaxN = Math.max(...previous.map(s => s.nLevel));
        const prevBestAcc = Math.max(...previous.map(s => s.overallAccuracy));
        const prevRTs = previous.filter(s => s.avgReactionTime > 0);
        const prevBestRT = prevRTs.length > 0 ? Math.min(...prevRTs.map(s => s.avgReactionTime)) : null;
        const prevDPs = previous.filter(s => s.overallDPrime != null);
        const prevBestDP = prevDPs.length > 0 ? Math.max(...prevDPs.map(s => s.overallDPrime)) : null;

        if (sessionData.nLevel > prevMaxN) records.maxN = true;
        if (sessionData.overallAccuracy > prevBestAcc) records.bestAcc = true;
        if (sessionData.avgReactionTime > 0 && (prevBestRT === null || sessionData.avgReactionTime < prevBestRT)) records.bestRT = true;
        if (sessionData.overallDPrime != null && (prevBestDP === null || sessionData.overallDPrime > prevBestDP)) records.bestDPrime = true;

        return records;
    }

    function computeStreak(sessions) {
        if (sessions.length === 0) return 0;

        const days = new Set(sessions.map(s => s.date.slice(0, 10)));
        const sortedDays = Array.from(days).sort().reverse();

        // Check if today or yesterday is in the list
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);

        if (!days.has(todayStr) && !days.has(yesterdayStr)) return 0;

        let streak = 0;
        let checkDate = new Date(sortedDays[0]);

        for (let i = 0; i < 365; i++) {
            const dateStr = checkDate.toISOString().slice(0, 10);
            if (days.has(dateStr)) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        return streak;
    }

    function getLast7DaysAccuracy(sessions) {
        const result = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const daySessions = sessions.filter(s => s.date.slice(0, 10) === dateStr);
            const avg = daySessions.length > 0
                ? Math.round(daySessions.reduce((s, x) => s + x.overallAccuracy, 0) / daySessions.length)
                : null;
            result.push({
                date: dateStr,
                label: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
                accuracy: avg,
                count: daySessions.length
            });
        }
        return result;
    }

    function aggregateByDay(sessions) {
        const map = {};
        sessions.forEach(s => {
            const day = s.date.slice(0, 10);
            if (!map[day]) {
                map[day] = { maxN: 0, rts: [], accs: [], posAccs: [], audioAccs: [], count: 0 };
            }
            map[day].maxN = Math.max(map[day].maxN, s.nLevel);
            if (s.avgReactionTime > 0) map[day].rts.push(s.avgReactionTime);
            map[day].accs.push(s.overallAccuracy);
            map[day].posAccs.push(s.positionAccuracy);
            map[day].audioAccs.push(s.audioAccuracy);
            map[day].count++;
        });
        return map;
    }

    // ── Heatmap Data (last 90 days) ─────────────────────
    function getHeatmapData() {
        const sessions = getSessions();
        const counts = {};
        sessions.forEach(s => {
            const day = s.date.slice(0, 10);
            counts[day] = (counts[day] || 0) + 1;
        });

        const days = [];
        const today = new Date();
        for (let i = 89; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            days.push({
                date: dateStr,
                count: counts[dateStr] || 0,
                label: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
            });
        }
        return days;
    }

    // ── Export ───────────────────────────────────────────
    function exportJSON() {
        const sessions = getSessions();
        if (sessions.length === 0) return alert('Aucune donnée à exporter.');
        const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `dual-n-back-${dateStr()}.json`);
    }

    function exportCSV() {
        const sessions = getSessions();
        if (sessions.length === 0) return alert('Aucune donnée à exporter.');
        const headers = [
            'date', 'nLevel', 'trials', 'speed',
            'positionAccuracy', 'audioAccuracy', 'overallAccuracy',
            'avgReactionTime', 'posHits', 'posMisses', 'posFalseAlarms',
            'audioHits', 'audioMisses', 'audioFalseAlarms',
            'posDPrime', 'audioDPrime', 'overallDPrime', 'adaptation'
        ];
        const rows = sessions.map(s => headers.map(h => s[h] ?? '').join(','));
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, `dual-n-back-${dateStr()}.csv`);
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function dateStr() {
        return new Date().toISOString().slice(0, 10);
    }

    // ── Generate Demo Data ──────────────────────────────
    function generateDemoData(numDays = 14) {
        const existing = getSessions();
        if (existing.length > 0 && !confirm('Cela ajoutera des données de démo. Continuer ?')) return;

        const sessions = [];
        let currentN = 2;

        for (let d = numDays - 1; d >= 0; d--) {
            const date = new Date();
            date.setDate(date.getDate() - d);
            const sessionsPerDay = 1 + Math.floor(Math.random() * 3);

            for (let s = 0; s < sessionsPerDay; s++) {
                date.setHours(9 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60));

                const posAcc = 40 + Math.floor(Math.random() * 55);
                const audioAcc = 40 + Math.floor(Math.random() * 55);
                const overallAcc = Math.round((posAcc + audioAcc) / 2);
                const rt = 400 + Math.floor(Math.random() * 800);

                let adaptation = 'stay';
                if (overallAcc >= 80) { adaptation = 'up'; currentN = Math.min(currentN + 1, 8); }
                else if (overallAcc < 50) { adaptation = 'down'; currentN = Math.max(currentN - 1, 1); }

                const posMatches = 5 + Math.floor(Math.random() * 4);
                const audioMatches = 5 + Math.floor(Math.random() * 4);
                const posNonMatches = 25 - posMatches;
                const audioNonMatches = 25 - audioMatches;
                const posHits = Math.round(posMatches * posAcc / 100);
                const posMisses = posMatches - posHits;
                const posFalseAlarms = Math.floor(Math.random() * 3);
                const audioHits = Math.round(audioMatches * audioAcc / 100);
                const audioMisses = audioMatches - audioHits;
                const audioFalseAlarms = Math.floor(Math.random() * 3);

                // Compute d-prime for demo data
                function demoDPrime(h, m, fa, total) {
                    const cr = total - fa;
                    const sig = h + m;
                    const noise = fa + cr;
                    if (sig === 0 || noise === 0) return null;
                    let hr = h / sig, far = fa / noise;
                    hr = Math.max(1/(2*sig), Math.min(1-1/(2*sig), hr));
                    far = Math.max(1/(2*noise), Math.min(1-1/(2*noise), far));
                    const normInvApprox = (p) => {
                        if (p<=0) return -3.5; if (p>=1) return 3.5;
                        const t = Math.sqrt(-2*Math.log(p<0.5?p:1-p));
                        const c0=2.515517,c1=0.802853,c2=0.010328,d1=1.432788,d2=0.189269,d3=0.001308;
                        const val = t-(c0+c1*t+c2*t*t)/(1+d1*t+d2*t*t+d3*t*t*t);
                        return p<0.5?-val:val;
                    };
                    return Math.round((normInvApprox(hr)-normInvApprox(far))*100)/100;
                }
                const posDPrime = demoDPrime(posHits, posMisses, posFalseAlarms, posNonMatches);
                const audioDPrime = demoDPrime(audioHits, audioMisses, audioFalseAlarms, audioNonMatches);
                const overallDPrime = (posDPrime != null && audioDPrime != null)
                    ? Math.round((posDPrime + audioDPrime) / 2 * 100) / 100 : null;

                sessions.push({
                    id: date.getTime() + s,
                    date: date.toISOString(),
                    nLevel: currentN,
                    trials: 25,
                    speed: 3000,
                    positionAccuracy: posAcc,
                    audioAccuracy: audioAcc,
                    overallAccuracy: overallAcc,
                    avgReactionTime: rt,
                    posHits, posMisses, posFalseAlarms,
                    audioHits, audioMisses, audioFalseAlarms,
                    posDPrime, audioDPrime, overallDPrime,
                    adaptation
                });
            }
        }

        const all = [...existing, ...sessions].sort((a, b) => a.id - b.id);
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
    }

    // ── Public API ──────────────────────────────────────
    return {
        getSessions, saveSession, deleteSession, clearAllSessions,
        getSettings, saveSetting,
        getStats, getHeatmapData, checkNewRecords,
        exportJSON, exportCSV, generateDemoData
    };
})();
