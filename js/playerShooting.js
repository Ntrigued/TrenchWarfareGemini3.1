// ================================================================
// PLAYER SHOOTING
// ================================================================

import { MG_HEAT_PER_SHOT, MG_OVERHEAT_CAP } from './config.js';
import { state, allies, enemies } from './state.js';
import { camera } from './scene.js';
import { playSoundFile, playPositionalSound } from './audio.js';
import { worldMeshes } from './world.js';
import { playerAI } from './player.js';
import { weaponsData, weaponContainer, fpFlashMaterial, fpFlashLight, fpFlashGroup } from './weapons.js';
import { raycaster } from './raycast.js';
import { createImpact, createTracer } from './effects.js';
import { pitchObject } from './player.js';
import { playerRoot } from './player.js';

const lastShotTimes = [0, 0, 0];

export function shootPlayer() {
    if (playerAI.dead) return;
    if (state.currentWeaponIndex === 1 && state.mgOverheated) return;
    const now = performance.now();
    const wep = weaponsData[state.currentWeaponIndex];

    if (state.currentWeaponIndex === 2) {
        if (state.sniperNeedsRechamber) return;
    } else {
        if (now - lastShotTimes[state.currentWeaponIndex] < wep.fireRate) return;
    }

    lastShotTimes[state.currentWeaponIndex] = now;

    if (state.currentWeaponIndex === 1) {
        state.mgHeat += MG_HEAT_PER_SHOT;
        if (state.mgHeat >= MG_OVERHEAT_CAP) { state.mgHeat = MG_OVERHEAT_CAP; state.mgOverheated = true; }
    }

    if (state.currentWeaponIndex === 2) {
        state.sniperNeedsRechamber     = true;
        state.sniperRechamberStartTime = now;
    }

    playSoundFile('gunshot', wep.soundPitch, wep.id === 'sniper' ? 1.5 : 1.0);

    const barrelPos = new THREE.Vector3(0, 0, wep.barrelLen).applyMatrix4(weaponContainer.matrixWorld);
    const camDir    = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));

    if (wep.type === 'auto') {
        let stanceMult = 1.0;
        if (state.isProne)        stanceMult = 0.25;
        else if (state.isCrouched) stanceMult = 0.6;
        if (state.keys.w || state.keys.a || state.keys.s || state.keys.d) stanceMult *= 1.5;
        let currentSpread = (0.005 + (state.mgHeat / 100) * 0.05) * stanceMult;
        camDir.x += (Math.random() - 0.5) * currentSpread;
        camDir.y += (Math.random() - 0.5) * currentSpread;
        camDir.normalize();
    }

    fpFlashMaterial.opacity = 1.0;
    fpFlashLight.intensity  = 2.0;
    fpFlashGroup.rotation.z = Math.random() * Math.PI;
    let fsx = (Math.random() > 0.5 ? 1 : -1) * (0.8 + Math.random() * 0.4);
    let fsy = (Math.random() > 0.5 ? 1 : -1) * (0.8 + Math.random() * 0.4);
    fpFlashGroup.scale.set(fsx, fsy, 1);

    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    if (wep.type === 'auto') raycaster.set(camera.getWorldPosition(new THREE.Vector3()), camDir);

    const allAIMeshes = [...enemies.map(e => e.mesh), ...allies.map(a => a.mesh)];
    const intersects  = raycaster.intersectObjects([...worldMeshes, ...allAIMeshes], true);

    let hitDistance = 200;
    if (intersects.length > 0) {
        const hit    = intersects[0];
        hitDistance  = hit.distance;
        const hitObj = hit.object;

        if (hitObj.userData.ai) {
            const isHead = hitObj.name === "head";
            hitObj.userData.ai.takeDamage(isHead ? 99 : (1 * (state.currentWeaponIndex === 2 ? 5 : 1)), playerAI);
            const marker = document.getElementById('hit-marker');
            marker.style.opacity     = 1;
            marker.style.borderColor = isHead ? 'red' : 'white';
            setTimeout(() => marker.style.opacity = 0, 100);
            playPositionalSound(hit.point, 'impact');
        } else {
            let normal = new THREE.Vector3(0, 1, 0);
            if (hit.face) normal.copy(hit.face.normal).applyMatrix3(new THREE.Matrix3().getNormalMatrix(hitObj.matrixWorld)).normalize();
            createImpact(hit.point, normal);
            playPositionalSound(hit.point, 'impact');
            if (Math.random() < 0.3) {
                let reflection = camDir.clone().sub(normal.clone().multiplyScalar(2 * camDir.dot(normal))).normalize();
                reflection.x += (Math.random() - 0.5) * 0.3;
                reflection.y += Math.random() * 0.4;
                reflection.z += (Math.random() - 0.5) * 0.3;
                reflection.normalize();
                createTracer(hit.point, reflection, 60);
                if (camera.getWorldPosition(new THREE.Vector3()).distanceToSquared(hit.point) < 64.0) {
                    playSoundFile('whiz', 1.5 + Math.random() * 0.5, 0.2);
                }
            }
        }
    }

    if (Math.random() < 0.25) createTracer(barrelPos, camDir, hitDistance);

    const bulletRay  = new THREE.Ray(barrelPos, camDir);
    let closestPt    = new THREE.Vector3();
    [...enemies, ...allies].forEach(e => {
        if (!e.dead) {
            const ePos = e.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0));
            bulletRay.closestPointToPoint(ePos, closestPt);
            if (barrelPos.distanceTo(closestPt) < hitDistance + 1.0) {
                if (closestPt.distanceToSquared(ePos) < 16.0) e.alert(playerAI);
            }
        }
    });

    // Recoil
    let actualRecoil = wep.recoilPitch * (0.8 + Math.random() * 0.4);
    state.pitch += actualRecoil;
    state.pitch  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.pitch));
    pitchObject.rotation.x = state.pitch;

    if (wep.type === 'auto') {
        state.yaw += (Math.random() - 0.5) * actualRecoil * 1.5;
        playerRoot.rotation.y = state.yaw;
        weaponContainer.rotation.z += (Math.random() - 0.5) * 0.15;
        weaponContainer.rotation.x -= Math.random() * 0.05;
        weaponContainer.rotation.y += (Math.random() - 0.5) * 0.05;
    }

    weaponContainer.position.z += wep.recoilZ;
}
