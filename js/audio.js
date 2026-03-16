// ================================================================
// AUDIO SYSTEM
// ================================================================

import { AUDIO_PROXIMITY_RANGE, NEAR_MISS_THROTTLE } from './config.js';
import { state } from './state.js';
import { camera } from './scene.js';

// --- Audio state ---
let audioCtx;
let masterFilter;
let masterGain;
const audioBuffers = {};
let lastNearMissTime = 0;

// Expose audio state for shell shock effects in game loop
export function getAudioState() {
    return { audioCtx, masterFilter, masterGain };
}

export function triggerShellShock(duration) {
    state.shellShockTimer = Math.max(state.shellShockTimer || 0, duration);
}

// Add shellShockTimer to state if not present
if (!('shellShockTimer' in state)) state.shellShockTimer = 0;

function createRealisticGunshot(ctx) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        const crack = (Math.random() * 2 - 1) * Math.exp(-t * 50) * 1.5;
        const boomFreq = 40 + 140 * Math.exp(-t * 35);
        const boom = Math.sin(2 * Math.PI * boomFreq * t) * Math.exp(-t * 12) * 4.0;
        const sub = Math.sin(2 * Math.PI * 35 * t) * Math.exp(-t * 6) * 1.5;
        const noise = (Math.random() * 2 - 1) * Math.exp(-t * 18) * 0.8;
        let sample = crack + boom + sub + noise;
        lastOut = lastOut + 0.45 * (sample - lastOut);
        let saturated = Math.tanh(lastOut * 1.3);
        const tail = (Math.random() * 2 - 1) * Math.exp(-t * 2.5) * 0.12;
        data[i] = saturated + tail;
    }
    return buffer;
}

function createRealisticExplosion(ctx) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        const noise = Math.random() * 2 - 1;
        const attack = Math.min(1.0, t * 20);
        const decay = Math.exp(-t * 1.5);
        const rumble = Math.sin(2 * Math.PI * (20 + 30 * Math.random()) * t);
        let sample = (noise * 0.6 + rumble * 0.4) * attack * decay;
        lastOut = lastOut + 0.05 * (sample - lastOut);
        data[i] = lastOut * 3.0;
    }
    return buffer;
}

function createBulletWhiz(ctx) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        const freq = 1200 - 800 * (t / 0.3);
        const tone = Math.sin(2 * Math.PI * freq * t);
        const noise = Math.random() * 2 - 1;
        const env = t < 0.1 ? (t / 0.1) : 1.0 - ((t - 0.1) / 0.2);
        let sample = (tone * 0.6 + noise * 0.4) * env;
        lastOut = lastOut + 0.4 * (sample - lastOut);
        data[i] = lastOut * 0.8;
    }
    return buffer;
}

export function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        masterFilter = audioCtx.createBiquadFilter();
        masterFilter.type = 'lowpass';
        masterFilter.frequency.value = 22000;

        masterGain = audioCtx.createGain();
        masterGain.gain.value = 1.0;

        masterFilter.connect(masterGain);
        masterGain.connect(audioCtx.destination);

        audioBuffers['gunshot']   = createRealisticGunshot(audioCtx);
        audioBuffers['artillery'] = createRealisticExplosion(audioCtx);
        audioBuffers['whiz']      = createBulletWhiz(audioCtx);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

export function playSoundFile(name, pitchShift = 1.0, volume = 1.0, isDistant = false) {
    if (!audioCtx || !audioBuffers[name]) return;
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffers[name];
    source.playbackRate.value = pitchShift * (0.95 + Math.random() * 0.1);
    const gain = audioCtx.createGain();
    gain.gain.value = volume;
    if (isDistant) {
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300 + Math.random() * 500;
        source.connect(filter);
        filter.connect(gain);
    } else {
        source.connect(gain);
    }
    gain.connect(masterFilter);
    source.start(0);
}

export function playPositionalSound(pos, type = 'gunshot') {
    if (!audioCtx) return;
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const dist = camPos.distanceTo(pos);
    if (dist > AUDIO_PROXIMITY_RANGE) return;
    let vol = 2.0 / (2.0 + dist);
    if (type === 'impact') {
        playSoundFile('gunshot', 1.5 + Math.random() * 0.5, vol * 0.3);
    } else if (type === 'artillery') {
        playSoundFile('artillery', 1.2 + Math.random() * 0.3, vol * 1.5);
    } else {
        playSoundFile('gunshot', 0.9 + Math.random() * 0.2, vol * 0.525);
    }
}

export function playNearMissSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    if (now - lastNearMissTime < NEAR_MISS_THROTTLE) return;
    lastNearMissTime = now;
    playSoundFile('whiz', 0.9 + Math.random() * 0.2, 0.8);
}

export function startAmbientBattle(horizonLights) {
    setInterval(() => {
        if (Math.random() > 0.5) {
            const isCloseHit = Math.random() < 0.15;
            playSoundFile('artillery', 0.6 + Math.random() * 0.4, isCloseHit ? 1.5 : 0.7, !isCloseHit);
            let hl = horizonLights[Math.floor(Math.random() * horizonLights.length)];
            hl.light.intensity = 5.0 + Math.random() * 15.0;
            hl.timer = 0.2 + Math.random() * 0.4;
            if (isCloseHit) triggerShellShock(2.5);
        }
    }, 2500);

    setInterval(() => {
        if (Math.random() > 0.3) playSoundFile('gunshot', 0.25 + Math.random() * 0.2, 0.1125, true);
    }, 150);
}
