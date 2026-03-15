// ================================================================
// WEAPON SYSTEM
// ================================================================

import { SNIPER_ZOOM_DEFAULT } from './config.js';
import { state } from './state.js';
import { camera } from './scene.js';
import { flashTexture } from './effects.js';

export const weaponContainer = new THREE.Group();
camera.add(weaponContainer);
weaponContainer.position.set(0.2, -0.2, -0.4);

// Store on state for cross-module access (e.g. player takeDamage)
state.weaponContainer = weaponContainer;

// --- Weapon data definitions ---
export const weaponsData = [
    { id: 'rifle',  name: '1: Rifle',        type: 'semi', fireRate: 250,  recoilPitch: 0.0066, recoilZ: 0.033, barrelLen: -0.8, soundPitch: 1.0, alignY: -0.06 },
    { id: 'mg',     name: '2: Machine Gun',  type: 'auto', fireRate: 100,  recoilPitch: 0.012,  recoilZ: 0.05,  barrelLen: -0.9, soundPitch: 1.1, alignY: -0.08 },
    { id: 'sniper', name: '3: Sniper Rifle', type: 'semi', fireRate: 1500, recoilPitch: 0.0198, recoilZ: 0.1,   barrelLen: -1.2, soundPitch: 0.7, alignY:  0    },
];

// --- Rifle model ---
export const modelRifle   = new THREE.Group();
const rBarrel      = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.9, 8), new THREE.MeshLambertMaterial({ color: 0x222222 }));
rBarrel.rotation.x = Math.PI / 2;
rBarrel.position.set(0, 0, -0.45);
const rReceiver    = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.25), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
rReceiver.position.set(0, 0.01, -0.15);
const rStock       = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.4), new THREE.MeshLambertMaterial({ color: 0x4a2e15 }));
rStock.position.set(0, -0.03, 0.1);
const rHandguard   = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.5), new THREE.MeshLambertMaterial({ color: 0x4a2e15 }));
rHandguard.position.set(0, -0.01, -0.4);
const rTriggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.04, 0.08), new THREE.MeshLambertMaterial({ color: 0x111111 }));
rTriggerGuard.position.set(0, -0.06, -0.05);
const rBoltHandle  = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.04), new THREE.MeshLambertMaterial({ color: 0x333333 }));
rBoltHandle.rotation.z = Math.PI / 2;
rBoltHandle.position.set(0.025, 0.02, -0.1);
const rFSight      = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.04, 0.01), new THREE.MeshLambertMaterial({ color: 0x111111 }));
rFSight.position.set(0, 0.04, -0.85);
const rRSightBase  = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.04), new THREE.MeshLambertMaterial({ color: 0x111111 }));
rRSightBase.position.set(0, 0.03, -0.25);
const rRSightL     = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.02), new THREE.MeshLambertMaterial({ color: 0x111111 }));
rRSightL.position.set(-0.015, 0.05, -0.25);
const rRSightR     = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.02), new THREE.MeshLambertMaterial({ color: 0x111111 }));
rRSightR.position.set(0.015, 0.05, -0.25);
const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.08), new THREE.MeshLambertMaterial({ color: 0x111111 }));
rMag.position.set(0, -0.08, -0.15);
const rNoseCap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.038), new THREE.MeshLambertMaterial({ color: 0x1e1e1e }));
rNoseCap.position.set(0, -0.005, -0.87);
modelRifle.add(rBarrel, rReceiver, rStock, rHandguard, rTriggerGuard, rBoltHandle, rFSight, rRSightBase, rRSightL, rRSightR, rMag, rNoseCap);

// --- Machine gun model: Lewis Gun ---
export const modelMG  = new THREE.Group();
const mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.9, 8), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
mgBarrel.rotation.x = Math.PI / 2;
mgBarrel.position.set(0, 0, -0.45);
const mgCoolJacket = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.72, 16), new THREE.MeshLambertMaterial({ color: 0x141414 }));
mgCoolJacket.rotation.x = Math.PI / 2;
mgCoolJacket.position.set(0, 0, -0.46);
const mgCoolTip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.034, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0x141414 }));
mgCoolTip.rotation.x = Math.PI / 2;
mgCoolTip.position.set(0, 0, -0.85);
const mgReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.35), new THREE.MeshLambertMaterial({ color: 0x111111 }));
mgReceiver.position.set(0, 0.01, -0.1);
const mgPanMag = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.022, 20), new THREE.MeshLambertMaterial({ color: 0x222222 }));
mgPanMag.position.set(0, 0.045, -0.15);
const mgStock  = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.3), new THREE.MeshLambertMaterial({ color: 0x3a2e15 }));
mgStock.position.set(0, -0.02, 0.15);
const mgBipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16), new THREE.MeshLambertMaterial({ color: 0x111111 }));
mgBipodL.position.set(-0.04, -0.07, -0.8);
mgBipodL.rotation.z = 0.2;
const mgBipodR = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16), new THREE.MeshLambertMaterial({ color: 0x111111 }));
mgBipodR.position.set(0.04, -0.07, -0.8);
mgBipodR.rotation.z = -0.2;
const mgFSightPost = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.048, 0.008), new THREE.MeshLambertMaterial({ color: 0x111111 }));
mgFSightPost.position.set(0, 0.058, -0.78);
const mgRSightL = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.032, 0.01), new THREE.MeshLambertMaterial({ color: 0x111111 }));
mgRSightL.position.set(-0.013, 0.066, 0.06);
const mgRSightR = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.032, 0.01), new THREE.MeshLambertMaterial({ color: 0x111111 }));
mgRSightR.position.set( 0.013, 0.066, 0.06);
modelMG.add(mgBarrel, mgCoolJacket, mgCoolTip, mgReceiver, mgPanMag, mgStock, mgBipodL, mgBipodR, mgFSightPost, mgRSightL, mgRSightR);

// --- Sniper rifle model ---
export const modelSniper  = new THREE.Group();
const snBarrel     = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 1.2, 8), new THREE.MeshLambertMaterial({ color: 0x222222 }));
snBarrel.rotation.x = Math.PI / 2;
snBarrel.position.set(0, 0, -0.6);
const snReceiver   = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.3), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
snReceiver.position.set(0, 0, -0.15);
const snStock      = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.5), new THREE.MeshLambertMaterial({ color: 0x4a2e15 }));
snStock.position.set(0, -0.03, 0.15);
const snHandguard  = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.04, 0.6), new THREE.MeshLambertMaterial({ color: 0x4a2e15 }));
snHandguard.position.set(0, -0.01, -0.45);
const snTriggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.06), new THREE.MeshLambertMaterial({ color: 0x111111 }));
snTriggerGuard.position.set(0, -0.05, -0.05);
const snScopeTube  = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 12), new THREE.MeshLambertMaterial({ color: 0x111111 }));
snScopeTube.rotation.x = Math.PI / 2;
snScopeTube.position.set(0, 0.06, -0.15);
const snScopeObj   = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 12), new THREE.MeshLambertMaterial({ color: 0x111111 }));
snScopeObj.rotation.x = Math.PI / 2;
snScopeObj.position.set(0, 0.06, -0.32);
const snScopeEye   = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 12), new THREE.MeshLambertMaterial({ color: 0x111111 }));
snScopeEye.rotation.x = Math.PI / 2;
snScopeEye.position.set(0, 0.06, 0.02);
const snScopeKnobT = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), new THREE.MeshLambertMaterial({ color: 0x222222 }));
snScopeKnobT.position.set(0, 0.08, -0.15);
const snScopeKnobR = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), new THREE.MeshLambertMaterial({ color: 0x222222 }));
snScopeKnobR.rotation.z = Math.PI / 2;
snScopeKnobR.position.set(0.02, 0.06, -0.15);
const snScopeMount1 = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.04, 0.01), new THREE.MeshLambertMaterial({ color: 0x111111 }));
snScopeMount1.position.set(0, 0.04, -0.05);
const snScopeMount2 = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.04, 0.01), new THREE.MeshLambertMaterial({ color: 0x111111 }));
snScopeMount2.position.set(0, 0.04, -0.25);

// Bolt action assembly
export const snBoltGroup = new THREE.Group();
snBoltGroup.position.set(0, 0.015, -0.05);
const snBoltBody   = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 8), new THREE.MeshLambertMaterial({ color: 0x555555 }));
snBoltBody.rotation.x = Math.PI / 2;
const snBoltHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.06), new THREE.MeshLambertMaterial({ color: 0x333333 }));
snBoltHandle.rotation.z = Math.PI / 2;
snBoltHandle.position.set(0.03, 0, 0.07);
const snBoltKnob   = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), new THREE.MeshLambertMaterial({ color: 0x111111 }));
snBoltKnob.position.set(0.06, 0, 0.07);
snBoltGroup.add(snBoltBody, snBoltHandle, snBoltKnob);

modelSniper.add(
    snBarrel, snReceiver, snStock, snHandguard, snTriggerGuard,
    snScopeTube, snScopeObj, snScopeEye, snScopeKnobT, snScopeKnobR,
    snScopeMount1, snScopeMount2, snBoltGroup
);

weaponContainer.add(modelRifle, modelMG, modelSniper);
modelMG.visible     = false;
modelSniper.visible = false;

export function switchWeapon(index) {
    if (index === state.currentWeaponIndex) return;
    state.currentWeaponIndex  = index;
    modelRifle.visible  = (index === 0);
    modelMG.visible     = (index === 1);
    modelSniper.visible = (index === 2);
    document.getElementById('weapon-indicator').innerText = weaponsData[index].name;
    fpFlashGroup.position.z  = weaponsData[index].barrelLen - 0.05;
    fpFlashLight.position.z  = weaponsData[index].barrelLen - 0.05;
    if (index === 2 && state.sniperNeedsRechamber) {
        state.sniperRechamberStartTime = performance.now();
    }
}

// --- First-person muzzle flash ---
export const fpFlashMaterial = new THREE.MeshBasicMaterial({
    map: flashTexture, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending
});
export const fpFlashGroup = new THREE.Group();
fpFlashGroup.add(
    new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), fpFlashMaterial),
    new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), fpFlashMaterial)
);
fpFlashGroup.children[0].rotation.z =  Math.PI / 4;
fpFlashGroup.children[1].rotation.z = -Math.PI / 4;
fpFlashGroup.position.set(0, 0, -0.85);
export const fpFlashLight = new THREE.PointLight(0xffddaa, 0, 5);
fpFlashLight.position.set(0, 0, -0.85);
weaponContainer.add(fpFlashGroup, fpFlashLight);
