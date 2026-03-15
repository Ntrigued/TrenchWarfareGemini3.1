// ================================================================
// SHARED MUTABLE GAME STATE
// ================================================================
// All mutable state that needs cross-module access lives here.
// Modules import `state` and read/write its properties.

import { PLAYER_HP_MAX, SNIPER_ZOOM_DEFAULT } from './config.js';

export const state = {
    // --- Input ---
    keys: {
        w: false, a: false, s: false, d: false,
        shift: false, z: false, c: false,
        q: false, e: false, space: false,
        lmb: false, rmb: false
    },
    lastQPress: 0,
    lastEPress: 0,
    qToggled: false,
    eToggled: false,
    lmbJustPressed: false,

    // --- Player ---
    isCrouched: false,
    isProne: false,
    slideTimer: 0,
    slideSpeed: 0,
    slideDir: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    playerHp: PLAYER_HP_MAX,
    initialized: false,

    // --- Weapons ---
    currentWeaponIndex: 0,
    sniperZoomLevel: SNIPER_ZOOM_DEFAULT,
    sniperNeedsRechamber: false,
    sniperRechamberStartTime: 0,
    mgHeat: 0,
    mgOverheated: false,

    // --- Game ---
    gameMode: 'endless',
    rollAngle: 0,
    activeRollDir: 0,
    rollCooldown: 0,
    playerKills: 0,
    allyReserves: 0,
    enemyReserves: 0,
    mountedTurret: null,

    // --- Game loop ---
    lastTime: 0,
    bobTime: 0,
    breathTime: 0,
    currentScreenShake: 0,
};

// --- Shared entity arrays ---
export const allies = [];
export const enemies = [];
export const turrets = [];
