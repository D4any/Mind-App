/* ═══════════════════════════════════════════════════════════
   AUDIO ENGINE — Web Audio API + Speech Synthesis
   ═══════════════════════════════════════════════════════════ */

const AudioEngine = (() => {
    'use strict';

    let ctx = null;

    function getCtx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    // Each letter mapped to a unique frequency pair for tonal fallback
    const LETTER_TONES = {
        'C': { f1: 523.25, f2: 659.25, type: 'sine' },
        'H': { f1: 587.33, f2: 739.99, type: 'sine' },
        'K': { f1: 440.00, f2: 554.37, type: 'triangle' },
        'L': { f1: 493.88, f2: 622.25, type: 'sine' },
        'Q': { f1: 392.00, f2: 493.88, type: 'triangle' },
        'R': { f1: 349.23, f2: 440.00, type: 'sine' },
        'S': { f1: 329.63, f2: 415.30, type: 'sawtooth' },
        'T': { f1: 293.66, f2: 369.99, type: 'triangle' }
    };

    /**
     * Speak a letter using SpeechSynthesis (natural) or tonal fallback.
     */
    function speakLetter(letter) {
        // Always init audio context (keeps it alive)
        getCtx();

        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(letter);
            utter.rate = 1.3;
            utter.pitch = 1.0;
            utter.volume = 0.85;
            utter.lang = 'en-US';
            window.speechSynthesis.speak(utter);
        } else {
            playLetterTone(letter);
        }
    }

    /**
     * Play a unique musical tone for a letter.
     */
    function playLetterTone(letter) {
        const c = getCtx();
        const tone = LETTER_TONES[letter] || { f1: 440, f2: 550, type: 'sine' };
        const now = c.currentTime;
        const dur = 0.22;

        [tone.f1, tone.f2].forEach(freq => {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = tone.type;
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
            osc.connect(gain).connect(c.destination);
            osc.start(now);
            osc.stop(now + dur);
        });
    }

    /**
     * Feedback sound for correct/wrong responses.
     */
    function playFeedback(correct) {
        const c = getCtx();
        const now = c.currentTime;

        if (correct) {
            // Rising chime
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(660, now);
            osc.frequency.linearRampToValueAtTime(880, now + 0.08);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.connect(gain).connect(c.destination);
            osc.start(now);
            osc.stop(now + 0.15);
        } else {
            // Low buzz
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(180, now);
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.connect(gain).connect(c.destination);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    }

    /**
     * Play a session-end sound (completion jingle).
     */
    function playSessionEnd() {
        const c = getCtx();
        const now = c.currentTime;
        const notes = [523, 659, 784, 1047];

        notes.forEach((freq, i) => {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.12);
            gain.gain.setValueAtTime(0.07, now + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
            osc.connect(gain).connect(c.destination);
            osc.start(now + i * 0.12);
            osc.stop(now + i * 0.12 + 0.3);
        });
    }

    /**
     * Play a countdown tick.
     */
    function playTick() {
        const c = getCtx();
        const now = c.currentTime;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, now);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain).connect(c.destination);
        osc.start(now);
        osc.stop(now + 0.05);
    }

    return { speakLetter, playFeedback, playSessionEnd, playTick, getCtx };
})();
