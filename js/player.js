// ================================================================
// PLAYER SETUP
// ================================================================

import { scene, camera } from './scene.js';
import { state } from './state.js';
import { getTerrainHeight } from './world.js';
import { playNearMissSound, triggerShellShock } from './audio.js';

export const playerRoot   = new THREE.Group();
playerRoot.position.set(0, getTerrainHeight(0, -20), -20);
scene.add(playerRoot);

export const leanObject = new THREE.Group();
leanObject.position.y = 1.5;
playerRoot.add(leanObject);

export const pitchObject = new THREE.Group();
leanObject.add(pitchObject);
pitchObject.add(camera);

// Player entity (used by AI targeting and damage system)
export const playerAI = {
    isPlayer: true,
    hp: 10,
    dead: false,
    takeDamage: function(amt, attacker) {
        if (this.dead) return;
        playNearMissSound();
        triggerShellShock(1.0);
        state.playerHp -= amt;
        document.getElementById('healthbar').style.width = (state.playerHp * 10) + '%';
        document.getElementById('hurt-overlay').style.opacity = 0.5;
        if (state.playerHp <= 0) {
            this.dead = true;
            if (state.mountedTurret) {
                state.mountedTurret.user = null;
                state.mountedTurret = null;
                state.weaponContainer.visible = true;
            }
            document.getElementById('hurt-overlay').style.background = 'black';
            document.getElementById('hurt-overlay').style.opacity = 1.0;
            setTimeout(() => {
                if (document.pointerLockElement) document.exitPointerLock();
            }, 2000);
        }
    }
};
playerAI.mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.8, 0.8),
    new THREE.MeshBasicMaterial({ visible: false })
);
playerAI.mesh.userData.ai = playerAI;
playerAI.mesh.position.y  = 0.9;
playerRoot.add(playerAI.mesh);
