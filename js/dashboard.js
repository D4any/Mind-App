/* ═══════════════════════════════════════════════════════════
   DASHBOARD MODULE — Charts & Analytics
   ═══════════════════════════════════════════════════════════ */

const Dashboard = (() => {
    'use strict';

    let charts = {};

    // Chart.js global defaults
    function setChartDefaults() {
        Chart.defaults.font.family = "'JetBrains Mono', monospace";
        Chart.defaults.font.size = 11;
        Chart.defaults.color = '#6b7d8e';
        Chart.defaults.borderColor = 'rgba(30,45,61,0.5)';
    }

    // ── Render Full Dashboard ───────────────────────────
    function render() {
        setChartDefaults();
        const stats = Storage.getStats();

        if (!stats) {
            showEmptyDashboard();
            return;
        }

        hideEmptyDashboard();
        renderSummaryCards(stats);
        renderStreak(stats);
        renderDailyGoal(stats);
        renderRecords(stats);
        renderHeatmap();
        renderNLevelChart(stats);
        renderRTChart(stats);
        renderAccuracyChart(stats);
        renderWeeklyMini(stats);
    }

    // ── Empty State ─────────────────────────────────────
    function showEmptyDashboard() {
        document.getElementById('dashContent').classList.add('hidden');
        document.getElementById('dashEmpty').classList.remove('hidden');
    }

    function hideEmptyDashboard() {
        document.getElementById('dashContent').classList.remove('hidden');
        document.getElementById('dashEmpty').classList.add('hidden');
    }

    // ── Summary Cards ───────────────────────────────────
    function renderSummaryCards(stats) {
        setText('dashTotalSessions', stats.totalSessions);
        setText('dashMaxN', stats.maxN);
        setText('dashBestAcc', stats.bestAcc + '%');
        setText('dashBestRT', stats.bestRT ? stats.bestRT + 'ms' : '—');
        setText('dashBestDPrime', stats.bestDPrime != null ? stats.bestDPrime.toFixed(2) : '—');
        setText('dashTotalTrials', stats.totalTrials.toLocaleString());
        setText('dashTotalTime', formatDuration(stats.totalTimeMinutes));
        setText('dashAvgRT', stats.avgRT ? stats.avgRT + 'ms' : '—');

        // Today's stats
        setText('dashTodayCount', stats.todayCount);
        setText('dashTodayMaxN', stats.todayMaxN || '—');
        setText('dashTodayAvgAcc', stats.todayCount > 0 ? stats.todayAvgAcc + '%' : '—');
    }

    function formatDuration(minutes) {
        if (minutes < 60) return minutes + 'min';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return h + 'h ' + m + 'min';
    }

    // ── Streak ──────────────────────────────────────────
    function renderStreak(stats) {
        setText('streakCount', stats.streak);
        const el = document.getElementById('streakContainer');
        if (stats.streak > 0) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    }

    // ── Daily Goal ──────────────────────────────────────
    function renderDailyGoal(stats) {
        const goal = stats.dailyGoal || 5;
        const count = stats.todayCount;
        const pct = Math.min(100, Math.round(count / goal * 100));

        setText('dailyGoalValue', goal);
        setText('dailyGoalText', `${count} / ${goal}`);

        const fill = document.getElementById('dailyGoalFill');
        if (fill) {
            fill.style.width = pct + '%';
            if (count >= goal) {
                fill.style.background = 'linear-gradient(90deg, #00ff41, #00e5ff)';
                fill.style.boxShadow = '0 0 12px rgba(0,255,65,0.5)';
            } else {
                fill.style.background = '';
                fill.style.boxShadow = '';
            }
        }

        const status = document.getElementById('dailyGoalStatus');
        if (status) {
            if (count >= goal) {
                status.textContent = '✓ Objectif atteint !';
                status.style.color = 'var(--neon-green)';
            } else {
                const remaining = goal - count;
                status.textContent = `${remaining} restante${remaining > 1 ? 's' : ''}`;
                status.style.color = 'var(--text-secondary)';
            }
        }
    }

    function adjustGoal(delta) {
        const settings = Storage.getSettings();
        const current = settings.dailyGoal || 5;
        const newGoal = Math.max(1, Math.min(20, current + delta));
        Storage.saveSetting('dailyGoal', newGoal);
        render();
    }

    // ── Records ─────────────────────────────────────────
    function renderRecords(stats) {
        const r = stats.records;
        if (!r) return;
        setText('recMaxN', r.maxN);
        setText('recBestAcc', r.bestAcc + '%');
        setText('recBestRT', r.bestRT ? r.bestRT + 'ms' : '—');
        setText('recBestDP', r.bestDPrime != null ? r.bestDPrime.toFixed(2) : '—');
        setText('recStreak', r.longestStreak);
    }

    // ── Heatmap (90 days) ───────────────────────────────
    function renderHeatmap() {
        const data = Storage.getHeatmapData();
        const container = document.getElementById('heatmapGrid');
        container.innerHTML = '';

        data.forEach(day => {
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            const lvl = Math.min(day.count, 5);
            if (lvl > 0) cell.setAttribute('data-count', lvl);

            const tooltip = document.createElement('span');
            tooltip.className = 'heatmap-tooltip';
            tooltip.textContent = `${day.label}: ${day.count} session${day.count !== 1 ? 's' : ''}`;
            cell.appendChild(tooltip);

            container.appendChild(cell);
        });
    }

    // ── N-Level Over Time ───────────────────────────────
    function renderNLevelChart(stats) {
        const byDay = stats.byDay;
        const days = Object.keys(byDay).sort();
        if (days.length === 0) return;

        const labels = days.map(d => formatLabel(d));
        const data = days.map(d => byDay[d].maxN);

        destroyChart('nLevel');
        charts.nLevel = new Chart(document.getElementById('chartNLevel'), {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Max N-Level',
                    data,
                    borderColor: '#00ff41',
                    backgroundColor: createGradient('chartNLevel', '#00ff41'),
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#00ff41',
                    pointBorderColor: '#0a0e17',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2
                }]
            },
            options: {
                ...baseOptions(),
                scales: {
                    x: gridScale(),
                    y: { ...gridScale(), beginAtZero: true, ticks: { ...gridScale().ticks, stepSize: 1 } }
                },
                plugins: {
                    ...baseOptions().plugins,
                    tooltip: tooltipConfig('N-Level')
                }
            }
        });
    }

    // ── Reaction Time ───────────────────────────────────
    function renderRTChart(stats) {
        const byDay = stats.byDay;
        const days = Object.keys(byDay).sort();
        if (days.length === 0) return;

        const labels = days.map(d => formatLabel(d));
        const data = days.map(d => {
            const rts = byDay[d].rts;
            return rts.length > 0 ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;
        });

        destroyChart('rt');
        charts.rt = new Chart(document.getElementById('chartRT'), {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Avg RT (ms)',
                    data,
                    borderColor: '#b44aff',
                    backgroundColor: createGradient('chartRT', '#b44aff'),
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#b44aff',
                    pointBorderColor: '#0a0e17',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2,
                    spanGaps: true
                }]
            },
            options: {
                ...baseOptions(),
                scales: { x: gridScale(), y: gridScale() },
                plugins: {
                    ...baseOptions().plugins,
                    tooltip: tooltipConfig('ms')
                }
            }
        });
    }

    // ── Accuracy Over Time ──────────────────────────────
    function renderAccuracyChart(stats) {
        const byDay = stats.byDay;
        const days = Object.keys(byDay).sort();
        if (days.length === 0) return;

        const labels = days.map(d => formatLabel(d));
        const posData = days.map(d => avg(byDay[d].posAccs));
        const audioData = days.map(d => avg(byDay[d].audioAccs));
        const overallData = days.map(d => avg(byDay[d].accs));

        destroyChart('accuracy');
        charts.accuracy = new Chart(document.getElementById('chartAccuracy'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Overall',
                        data: overallData,
                        borderColor: '#ffaf00',
                        backgroundColor: 'transparent',
                        borderWidth: 2.5,
                        tension: 0.35,
                        pointRadius: 3,
                        pointBackgroundColor: '#ffaf00',
                        pointBorderColor: '#0a0e17',
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Position',
                        data: posData,
                        borderColor: '#00ff41',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        borderDash: [5, 3],
                        tension: 0.35,
                        pointRadius: 2,
                        pointBackgroundColor: '#00ff41'
                    },
                    {
                        label: 'Audio',
                        data: audioData,
                        borderColor: '#00d4ff',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        borderDash: [5, 3],
                        tension: 0.35,
                        pointRadius: 2,
                        pointBackgroundColor: '#00d4ff'
                    }
                ]
            },
            options: {
                ...baseOptions(),
                scales: {
                    x: gridScale(),
                    y: { ...gridScale(), beginAtZero: true, max: 100 }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#6b7d8e',
                            font: { family: "'JetBrains Mono'", size: 10 },
                            boxWidth: 12, boxHeight: 2,
                            padding: 15
                        }
                    },
                    tooltip: tooltipConfig('%')
                }
            }
        });
    }

    // ── Weekly Mini Bars ────────────────────────────────
    function renderWeeklyMini(stats) {
        const container = document.getElementById('weeklyBars');
        if (!container) return;
        container.innerHTML = '';

        stats.last7.forEach(day => {
            const col = document.createElement('div');
            col.className = 'flex flex-col items-center gap-1';
            col.style.flex = '1';

            const bar = document.createElement('div');
            bar.className = 'w-full rounded-sm transition-all';
            bar.style.height = '60px';
            bar.style.position = 'relative';

            const fill = document.createElement('div');
            fill.style.position = 'absolute';
            fill.style.bottom = '0';
            fill.style.left = '0';
            fill.style.right = '0';
            fill.style.borderRadius = '2px';
            const h = day.accuracy !== null ? Math.max(4, day.accuracy * 0.6) : 0;
            fill.style.height = h + 'px';

            if (day.accuracy === null) {
                fill.style.background = 'rgba(30,45,61,0.3)';
                fill.style.height = '4px';
            } else if (day.accuracy >= 80) {
                fill.style.background = 'rgba(0,255,65,0.5)';
                fill.style.boxShadow = '0 0 6px rgba(0,255,65,0.2)';
            } else if (day.accuracy >= 50) {
                fill.style.background = 'rgba(255,175,0,0.5)';
            } else {
                fill.style.background = 'rgba(255,62,62,0.5)';
            }

            bar.appendChild(fill);

            const label = document.createElement('span');
            label.className = 'text-text-s';
            label.style.fontSize = '9px';
            label.textContent = day.label;

            const val = document.createElement('span');
            val.style.fontSize = '9px';
            val.style.color = day.accuracy !== null ? '#c5d1de' : '#3d4f5f';
            val.textContent = day.accuracy !== null ? day.accuracy + '%' : '—';

            col.appendChild(val);
            col.appendChild(bar);
            col.appendChild(label);
            container.appendChild(col);
        });
    }

    // ── Helpers ─────────────────────────────────────────
    function setText(id, v) {
        const el = document.getElementById(id);
        if (el) el.textContent = v;
    }

    function avg(arr) {
        if (!arr || arr.length === 0) return null;
        return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    }

    function formatLabel(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }

    function destroyChart(name) {
        if (charts[name]) { charts[name].destroy(); charts[name] = null; }
    }

    function baseOptions() {
        return {
            responsive: true,
            maintainAspectRatio: true,
            animation: { duration: 600, easing: 'easeOutQuart' },
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } }
        };
    }

    function gridScale() {
        return {
            grid: { color: 'rgba(30,45,61,0.4)', drawBorder: false },
            ticks: { color: '#6b7d8e', font: { family: "'JetBrains Mono'", size: 10 }, padding: 6 }
        };
    }

    function tooltipConfig(suffix) {
        return {
            backgroundColor: '#111927',
            borderColor: '#1e2d3d',
            borderWidth: 1,
            titleFont: { family: "'JetBrains Mono'", size: 11 },
            bodyFont: { family: "'JetBrains Mono'", size: 11 },
            padding: 10,
            cornerRadius: 4,
            callbacks: {
                label: ctx => `${ctx.dataset.label || ''}: ${ctx.parsed.y}${suffix}`
            }
        };
    }

    function createGradient(canvasId, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return 'transparent';
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 280);
        // Parse hex to rgba
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        gradient.addColorStop(0, `rgba(${r},${g},${b},0.2)`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0.01)`);
        return gradient;
    }

    return { render, adjustGoal };
})();
