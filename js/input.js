// ================================================================
// INPUT & CONTROLS
// ================================================================

import { SLIDE_DURATION, SLIDE_INITIAL_SPEED, TURRET_MOUNT_RANGE,
         SNIPER_ZOOM_MAX, SNIPER_ZOOM_MIN } from './config.js';
import { state, turrets } from './state.js';
import { playerRoot, pitchObject, playerAI } from './player.js';
import { weaponsData, switchWeapon, weaponContainer, modelSniper } from './weapons.js';

// --- Slider UI listeners ---
document.getElementById('soldier-count').addEventListener('input', (e) => {
    document.getElementById('soldier-count-display').innerText = e.target.value;
});
document.getElementById('active-count').addEventListener('input', (e) => {
    document.getElementById('active-count-display').innerText = e.target.value;
});

// --- Mouse move ---
document.addEventListener('mousemove', (e) => {
    if (!document.pointerLockElement || playerAI.dead) return;
    state.yaw   -= e.movementX * 0.002;
    state.pitch -= e.movementY * 0.002;
    state.pitch  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.pitch));

    if (state.mountedTurret) {
        let diff = state.yaw - state.mountedTurret.baseYaw;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        if (diff >  Math.PI / 2) diff =  Math.PI / 2;
        if (diff < -Math.PI / 2) diff = -Math.PI / 2;
        state.yaw = state.mountedTurret.baseYaw + diff;
    }

    playerRoot.rotation.y = state.yaw;
    pitchObject.rotation.x = state.pitch;
});

// --- Key down ---
document.addEventListener('keydown', e => {
    const code = e.code;
    const keys = state.keys;
    if (code === 'KeyW') keys.w = true;
    if (code === 'KeyA') keys.a = true;
    if (code === 'KeyS') keys.s = true;
    if (code === 'KeyD') keys.d = true;
    if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = true;

    if (code === 'KeyQ') {
        if (!keys.q) {
            const now = performance.now();
            if (state.qToggled) state.qToggled = false;
            else if (now - state.lastQPress < 300) { state.qToggled = true; state.lastQPress = 0; }
            else state.lastQPress = now;
        }
        keys.q = true;
        state.eToggled = false;
    }
    if (code === 'KeyE') {
        if (!keys.e) {
            const now = performance.now();
            if (state.eToggled) state.eToggled = false;
            else if (now - state.lastEPress < 300) { state.eToggled = true; state.lastEPress = 0; }
            else state.lastEPress = now;
        }
        keys.e = true;
        state.qToggled = false;
    }
    if (code === 'Space') keys.space = true;

    if (code === 'KeyC') {
        if (!keys.c) {
            let isSprintMoving = (keys.w || keys.a || keys.s || keys.d) && keys.shift && !state.isProne && !state.isCrouched && !state.mountedTurret;
            if (state.slideTimer > 0) {
                state.slideTimer = 0;
                state.isCrouched = false;
            } else if (isSprintMoving) {
                state.isCrouched = true;
                state.isProne    = false;
                state.qToggled   = false;
                state.eToggled   = false;
                state.slideTimer = SLIDE_DURATION;
                state.slideSpeed = SLIDE_INITIAL_SPEED;
                let mDir = new THREE.Vector3();
                if (keys.w) mDir.z -= 1;
                if (keys.s) mDir.z += 1;
                if (keys.a) mDir.x -= 1;
                if (keys.d) mDir.x += 1;
                if (mDir.lengthSq() > 0) mDir.normalize();
                mDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);
                state.slideDir.copy(mDir);
            } else {
                if (state.isProne)        { state.isProne = false; state.isCrouched = true; }
                else if (state.isCrouched) { state.isCrouched = false; }
                else                       { state.isCrouched = !state.isCrouched; }
            }
        }
        keys.c = true;
    }

    if (code === 'KeyZ') {
        if (!keys.z) {
            state.slideTimer = 0;
            if (state.isProne) { state.isProne = false; state.isCrouched = true; }
            else               { state.isProne = true; state.isCrouched = false; state.qToggled = false; state.eToggled = false; }
        }
        keys.z = true;
    }

    if (code === 'Digit1') switchWeapon(0);
    if (code === 'Digit2') switchWeapon(1);
    if (code === 'Digit3') switchWeapon(2);

    if (code === 'KeyF' && state.currentWeaponIndex === 2 && (keys.rmb || keys.space)) {
        state.sniperZoomLevel = Math.min(SNIPER_ZOOM_MAX, state.sniperZoomLevel + 1);
    }
    if (code === 'KeyG' && state.currentWeaponIndex === 2 && (keys.rmb || keys.space)) {
        state.sniperZoomLevel = Math.max(SNIPER_ZOOM_MIN, state.sniperZoomLevel - 1);
    }

    if (code === 'KeyR') {
        if (state.mountedTurret && !state.mountedTurret.isReloading && state.mountedTurret.ammo < state.mountedTurret.maxAmmo) {
            state.mountedTurret.isReloading = true;
            state.mountedTurret.reloadTimer = 0.6;
        }
    }

    if (code === 'KeyT' && !playerAI.dead) {
        if (state.mountedTurret) {
            state.mountedTurret.user = null;
            state.mountedTurret = null;
            if (state.currentWeaponIndex === 2) modelSniper.visible = true;
            weaponContainer.visible = true;
        } else {
            let nearest = null;
            let minDist = TURRET_MOUNT_RANGE;
            turrets.forEach(t => {
                const canClaim = !t.user || (t.user && !t.user.isEnemy && t.user !== playerAI);
                if (canClaim && playerRoot.position.distanceTo(t.mesh.position) < minDist) {
                    nearest = t;
                    minDist = playerRoot.position.distanceTo(t.mesh.position);
                }
            });
            if (nearest) {
                state.mountedTurret = nearest;
                nearest.user  = playerAI;
                weaponContainer.visible = false;
                state.isCrouched  = false;
                state.isProne     = false;
                state.slideTimer  = 0;
                state.yaw   = nearest.swivel.rotation.y;
                state.pitch = nearest.pitchGroup.rotation.x;
            }
        }
    }
});

// --- Key up ---
document.addEventListener('keyup', e => {
    const code = e.code;
    const keys = state.keys;
    if (code === 'KeyW') keys.w = false;
    if (code === 'KeyA') keys.a = false;
    if (code === 'KeyS') keys.s = false;
    if (code === 'KeyD') keys.d = false;
    if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = false;
    if (code === 'KeyQ')    keys.q     = false;
    if (code === 'KeyE')    keys.e     = false;
    if (code === 'Space')   keys.space = false;
    if (code === 'KeyZ')    keys.z     = false;
    if (code === 'KeyC')    keys.c     = false;
});

// --- Mouse buttons ---
document.addEventListener('mousedown', e => {
    if (!document.pointerLockElement) return;
    if (e.button === 2) state.keys.rmb = true;
    if (e.button === 0) { state.keys.lmb = true; state.lmbJustPressed = true; }
});
document.addEventListener('mouseup', e => {
    if (e.button === 2) state.keys.rmb = false;
    if (e.button === 0) state.keys.lmb = false;
});
document.addEventListener('contextmenu', e => e.preventDefault());
