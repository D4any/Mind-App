/* ═══════════════════════════════════════════════════════════
   GAME ENGINE — Core Dual N-Back Logic
   ═══════════════════════════════════════════════════════════ */

const Game = (() => {
    'use strict';

    const LETTERS = ['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T'];
    const TARGET_RATE = 0.30; // 30% match probability

    // ── D-Prime: Inverse Normal CDF (Abramowitz & Stegun rational approx) ──
    function normInv(p) {
        if (p <= 0) return -3.5;
        if (p >= 1) return 3.5;
        const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
        const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
        const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0, -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
        const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0];
        const p_low = 0.02425, p_high = 1 - p_low;
        let q, r;
        if (p < p_low) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
        } else if (p <= p_high) {
            q = p - 0.5; r = q * q;
            return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
        }
    }

    function computeDPrime(hits, misses, falseAlarms, correctRejects) {
        const totalSignal = hits + misses;
        const totalNoise = falseAlarms + correctRejects;
        if (totalSignal === 0 || totalNoise === 0) return null;
        let hitRate = hits / totalSignal;
        let faRate = falseAlarms / totalNoise;
        // Clamp to avoid ±infinity (log-linear correction)
        hitRate = Math.max(1/(2*totalSignal), Math.min(1 - 1/(2*totalSignal), hitRate));
        faRate = Math.max(1/(2*totalNoise), Math.min(1 - 1/(2*totalNoise), faRate));
        return Math.round((normInv(hitRate) - normInv(faRate)) * 100) / 100;
    }

    // ── State ───────────────────────────────────────────
    let state = {
        nLevel: 2,
        isRunning: false,
        trialIndex: 0,
        totalTrials: 25,
        intervalSpeed: 3000,
        mode: 'adaptive',     // 'adaptive' | 'manual'
        positionSequence: [],
        audioSequence: [],
        // Per-trial
        positionPressed: false,
        audioPressed: false,
        positionRT: null,
        audioRT: null,
        trialStartTime: 0,
        // Game timer
        timer: null,
        // Stats
        stats: null
    };

    function resetStats() {
        state.stats = {
            posHits: 0, posMisses: 0, posFalseAlarms: 0, posCorrectRejects: 0,
            audioHits: 0, audioMisses: 0, audioFalseAlarms: 0, audioCorrectRejects: 0,
            reactionTimes: [],
            trialDetails: []
        };
    }

    // ── Sequence Generation ─────────────────────────────
    function generateSequences(numTrials, n) {
        const positions = [];
        const audios = [];

        for (let i = 0; i < numTrials; i++) {
            if (i < n) {
                positions.push(Math.floor(Math.random() * 9));
                audios.push(LETTERS[Math.floor(Math.random() * LETTERS.length)]);
            } else {
                // Position
                if (Math.random() < TARGET_RATE) {
                    positions.push(positions[i - n]);
                } else {
                    let p;
                    do { p = Math.floor(Math.random() * 9); } while (p === positions[i - n]);
                    positions.push(p);
                }
                // Audio
                if (Math.random() < TARGET_RATE) {
                    audios.push(audios[i - n]);
                } else {
                    let l;
                    do { l = LETTERS[Math.floor(Math.random() * LETTERS.length)]; } while (l === audios[i - n]);
                    audios.push(l);
                }
            }
        }
        return { positions, audios };
    }

    // ── Start ───────────────────────────────────────────
    function start(config, callbacks) {
        AudioEngine.getCtx(); // init audio on user gesture

        state.nLevel = config.nLevel;
        state.totalTrials = config.trials;
        state.intervalSpeed = config.speed;
        state.mode = config.mode;
        state.trialIndex = 0;
        state.isRunning = true;

        const seq = generateSequences(state.totalTrials, state.nLevel);
        state.positionSequence = seq.positions;
        state.audioSequence = seq.audios;

        resetStats();
        state.positionPressed = false;
        state.audioPressed = false;

        state._callbacks = callbacks;
        runTrial();
    }

    // ── Stop ────────────────────────────────────────────
    function stop() {
        state.isRunning = false;
        clearTimeout(state.timer);
        state._callbacks = null;
    }

    // ── Run a single trial ──────────────────────────────
    function runTrial() {
        if (!state.isRunning || state.trialIndex >= state.totalTrials) {
            if (state.trialIndex >= state.totalTrials) endSession();
            return;
        }

        // Score previous trial
        if (state.trialIndex > 0) {
            scoreTrial(state.trialIndex - 1);
        }

        // Reset per-trial
        state.positionPressed = false;
        state.audioPressed = false;
        state.positionRT = null;
        state.audioRT = null;

        const pos = state.positionSequence[state.trialIndex];
        const letter = state.audioSequence[state.trialIndex];

        // Callbacks
        if (state._callbacks) {
            state._callbacks.onTrialStart({
                trial: state.trialIndex + 1,
                total: state.totalTrials,
                position: pos,
                letter: letter,
                canRespond: state.trialIndex >= state.nLevel
            });
        }

        AudioEngine.speakLetter(letter);
        state.trialStartTime = performance.now();
        state.trialIndex++;

        // Schedule clear + next
        const displayTime = state.intervalSpeed - 350;
        state.timer = setTimeout(() => {
            if (state._callbacks) state._callbacks.onTrialClear();
            state.timer = setTimeout(() => runTrial(), 350);
        }, displayTime);
    }

    // ── Score a trial ───────────────────────────────────
    function scoreTrial(idx) {
        if (idx < state.nLevel) return;

        const isPosMatch = state.positionSequence[idx] === state.positionSequence[idx - state.nLevel];
        const isAudioMatch = state.audioSequence[idx] === state.audioSequence[idx - state.nLevel];

        const s = state.stats;

        // Position
        if (isPosMatch && state.positionPressed) {
            s.posHits++;
            if (state.positionRT) s.reactionTimes.push(state.positionRT);
        } else if (isPosMatch && !state.positionPressed) {
            s.posMisses++;
        } else if (!isPosMatch && state.positionPressed) {
            s.posFalseAlarms++;
        } else {
            s.posCorrectRejects++;
        }

        // Audio
        if (isAudioMatch && state.audioPressed) {
            s.audioHits++;
            if (state.audioRT) s.reactionTimes.push(state.audioRT);
        } else if (isAudioMatch && !state.audioPressed) {
            s.audioMisses++;
        } else if (!isAudioMatch && state.audioPressed) {
            s.audioFalseAlarms++;
        } else {
            s.audioCorrectRejects++;
        }

        // Store trial detail
        s.trialDetails.push({
            idx,
            posMatch: isPosMatch, posPressed: state.positionPressed,
            audioMatch: isAudioMatch, audioPressed: state.audioPressed,
            posRT: state.positionRT, audioRT: state.audioRT
        });

        if (state._callbacks) state._callbacks.onStatsUpdate(getComputedStats());
    }

    // ── Match Response ──────────────────────────────────
    function respondPosition() {
        if (!state.isRunning || state.trialIndex <= state.nLevel) return null;
        if (state.positionPressed) return null;

        state.positionPressed = true;
        state.positionRT = performance.now() - state.trialStartTime;

        const idx = state.trialIndex - 1;
        const isMatch = state.positionSequence[idx] === state.positionSequence[idx - state.nLevel];
        AudioEngine.playFeedback(isMatch);
        return isMatch;
    }

    function respondAudio() {
        if (!state.isRunning || state.trialIndex <= state.nLevel) return null;
        if (state.audioPressed) return null;

        state.audioPressed = true;
        state.audioRT = performance.now() - state.trialStartTime;

        const idx = state.trialIndex - 1;
        const isMatch = state.audioSequence[idx] === state.audioSequence[idx - state.nLevel];
        AudioEngine.playFeedback(isMatch);
        return isMatch;
    }

    // ── Computed Stats ──────────────────────────────────
    function getComputedStats() {
        const s = state.stats;
        const posSignalTotal = s.posHits + s.posMisses;
        const audioSignalTotal = s.audioHits + s.audioMisses;

        const posStrictTotal = s.posHits + s.posMisses + s.posFalseAlarms;
        const audioStrictTotal = s.audioHits + s.audioMisses + s.audioFalseAlarms;

        const posAcc = posStrictTotal > 0 ? Math.round((s.posHits / posStrictTotal) * 100) : null;
        const audioAcc = audioStrictTotal > 0 ? Math.round((s.audioHits / audioStrictTotal) * 100) : null;

        const overallHits = s.posHits + s.audioHits;
        const overallStrictTotal = overallHits + s.posMisses + s.posFalseAlarms + s.audioMisses + s.audioFalseAlarms;
        const overallAcc = overallStrictTotal > 0 ? Math.round((overallHits / overallStrictTotal) * 100) : null;

        const avgRT = s.reactionTimes.length > 0
            ? Math.round(s.reactionTimes.reduce((a, b) => a + b, 0) / s.reactionTimes.length)
            : null;

        // D-prime (signal detection theory)
        const posDPrime = computeDPrime(s.posHits, s.posMisses, s.posFalseAlarms, s.posCorrectRejects);
        const audioDPrime = computeDPrime(s.audioHits, s.audioMisses, s.audioFalseAlarms, s.audioCorrectRejects);
        const overallDPrime = (posDPrime !== null && audioDPrime !== null)
            ? Math.round((posDPrime + audioDPrime) / 2 * 100) / 100
            : (posDPrime || audioDPrime);

        return {
            posHits: s.posHits, posMisses: s.posMisses,
            posTotal: posSignalTotal, posAcc,
            posFalseAlarms: s.posFalseAlarms,
            audioHits: s.audioHits, audioMisses: s.audioMisses,
            audioTotal: audioSignalTotal, audioAcc,
            audioFalseAlarms: s.audioFalseAlarms,
            overallAcc, avgRT,
            totalFalseAlarms: s.posFalseAlarms + s.audioFalseAlarms,
            totalMisses: s.posMisses + s.audioMisses,
            posDPrime, audioDPrime, overallDPrime
        };
    }

    // ── End Session ─────────────────────────────────────
    function endSession() {
        // Score final trial
        scoreTrial(state.trialIndex - 1);
        state.isRunning = false;
        clearTimeout(state.timer);

        const computed = getComputedStats();
        const posAcc = computed.posAcc || 0;
        const audioAcc = computed.audioAcc || 0;
        const overallAcc = computed.overallAcc ?? Math.round((posAcc + audioAcc) / 2);

        // Adaptive level change
        let adaptation = 'stay';
        let newN = state.nLevel;
        if (state.mode === 'adaptive') {
            if (overallAcc >= 80) {
                newN = state.nLevel + 1;
                adaptation = 'up';
            } else if (overallAcc < 50) {
                newN = Math.max(1, state.nLevel - 1);
                adaptation = 'down';
            }
        }

        // Save to storage
        const session = {
            nLevel: state.nLevel,
            trials: state.totalTrials,
            speed: state.intervalSpeed,
            positionAccuracy: posAcc,
            audioAccuracy: audioAcc,
            overallAccuracy: overallAcc,
            avgReactionTime: computed.avgRT || 0,
            posHits: state.stats.posHits,
            posMisses: state.stats.posMisses,
            posFalseAlarms: state.stats.posFalseAlarms,
            audioHits: state.stats.audioHits,
            audioMisses: state.stats.audioMisses,
            audioFalseAlarms: state.stats.audioFalseAlarms,
            posDPrime: computed.posDPrime,
            audioDPrime: computed.audioDPrime,
            overallDPrime: computed.overallDPrime,
            adaptation
        };

        Storage.saveSession(session);
        AudioEngine.playSessionEnd();

        if (state._callbacks) {
            state._callbacks.onSessionEnd({
                ...computed,
                overallAcc,
                posAcc,
                audioAcc,
                nLevel: state.nLevel,
                newN,
                adaptation
            });
        }
    }

    // ── Getters ─────────────────────────────────────────
    function isRunning() { return state.isRunning; }
    function getNLevel() { return state.nLevel; }
    function setNLevel(n) { if (!state.isRunning && n >= 1 && n <= 15) state.nLevel = n; }

    return {
        start, stop,
        respondPosition, respondAudio,
        isRunning, getNLevel, setNLevel,
        getComputedStats
    };
})();
