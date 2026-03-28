// ================================================================
// TURRET SHOOTING
// ================================================================

import { TURRET_PLAYER_FIRE_COOLDOWN, TURRET_AI_FIRE_COOLDOWN,
         TURRET_EXPLOSION_RADIUS, TURRET_EXPLOSION_DAMAGE } from './config.js';
import { state, allies, enemies } from './state.js';
import { camera } from './scene.js';
import { playPositionalSound, playNearMissSound, triggerShellShock } from './audio.js';
import { worldMeshes } from './world.js';
import { playerRoot, playerAI } from './player.js';
import { raycaster } from './raycast.js';
import { showMuzzleFlash, createExplosion, createImpact, createTracer } from './effects.js';

export function shootTurret(turret, shooter) {
    if (turret.isReloading || turret.ammo <= 0) return;
    const now      = performance.now();
    const cooldown = (shooter && shooter.isPlayer) ? TURRET_PLAYER_FIRE_COOLDOWN : TURRET_AI_FIRE_COOLDOWN;
    if (now - turret.lastShot < cooldown) return;
    turret.lastShot = now;
    turret.ammo--;

    const barrelPos = new THREE.Vector3(0, 0, -1.1).applyMatrix4(turret.pitchGroup.matrixWorld);
    const dir       = new THREE.Vector3(0, 0, -1).applyQuaternion(turret.pitchGroup.getWorldQuaternion(new THREE.Quaternion()));

    let spread = 0.02;
    if (shooter && !shooter.isPlayer) {
        const efficiency = shooter.getCombatEfficiency ? shooter.getCombatEfficiency() : 0.8;
        // Keep AI artillery threatening, but not so accurate that near-direct hits
        // constantly one-shot the player.
        spread = 0.21 - (efficiency * 0.04);
    }
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    showMuzzleFlash(barrelPos, dir);
    playPositionalSound(barrelPos, 'gunshot');
    turret.pitchGroup.position.z += 0.3;

    raycaster.set(barrelPos, dir);
    const allAIMeshes = [...enemies.map(e => e.mesh), ...allies.map(a => a.mesh), playerAI.mesh];
    const intersects  = raycaster.intersectObjects([...worldMeshes, ...allAIMeshes], true);

    let hitDistance = 200;
    if (intersects.length > 0) {
        const hit    = intersects[0];
        hitDistance  = hit.distance;
        let normal   = hit.face
            ? hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()
            : new THREE.Vector3(0, 1, 0);

        createImpact(hit.point, normal);
        for (let i = 0; i < 8; i++) {
            let debrisOffset = new THREE.Vector3(
                (Math.random()-0.5)*5, Math.random()*4, (Math.random()-0.5)*5
            );
            createImpact(hit.point.clone().add(debrisOffset), normal);
        }

        createExplosion(hit.point);
        playPositionalSound(hit.point, 'artillery');

        const distToPlayer = camera.getWorldPosition(new THREE.Vector3()).distanceTo(hit.point);
        if (distToPlayer < 50) {
            const shakeAmt = 1.0 - (distToPlayer / 50);
            state.currentScreenShake = Math.max(state.currentScreenShake, shakeAmt * 0.6);
        }

        // AoE damage
        const hitPool = [...allies, ...enemies, playerAI];
        hitPool.forEach(t => {
            if (!t.dead) {
                const posOffset = t.isPlayer
                    ? ((state.isProne || state.slideTimer > 0) ? 0.15 : (state.isCrouched ? 0.4 : 1.0))
                    : (1.0 - (t.crouchT * 0.45));
                const pos = t.isPlayer ? playerRoot.position.clone() : t.mesh.position.clone();
                pos.y += posOffset;
                const distToBlast = pos.distanceTo(hit.point);
                if (distToBlast < TURRET_EXPLOSION_RADIUS) {
                    let damageScale = 1.0 - ((distToBlast / TURRET_EXPLOSION_RADIUS) * 0.85);
                    damageScale = Math.max(0.2, damageScale);
                    let damage = TURRET_EXPLOSION_DAMAGE * damageScale;

                    if (t.isPlayer && shooter && !shooter.isPlayer) {
                        damage *= 0.6;
                        damage = Math.min(damage, 6.5);
                    }

                    t.takeDamage(damage, shooter, {
                        weaponType: 'turret',
                        explosive: true,
                        distance: distToBlast,
                    });
                }
            }
        });

        if (camera.getWorldPosition(new THREE.Vector3()).distanceTo(hit.point) < 8.0) {
            triggerShellShock(1.5);
        }
    }

    createTracer(barrelPos, dir, hitDistance);

    // Whiz / suppression check
    const bulletRay = new THREE.Ray(barrelPos, dir);
    const hitPool   = [...allies, ...enemies, playerAI];
    let closestPt   = new THREE.Vector3();
    hitPool.forEach(t => {
        if (!t.dead) {
            const posOffset = t.isPlayer
                ? ((state.isProne || state.slideTimer > 0) ? 0.15 : (state.isCrouched ? 0.4 : 1.0))
                : (1.0 - (t.crouchT * 0.45));
            const pos = t.isPlayer ? playerRoot.position.clone() : t.mesh.position.clone();
            pos.y += posOffset;
            bulletRay.closestPointToPoint(pos, closestPt);
            const distAlongRay = barrelPos.distanceTo(closestPt);
            if (distAlongRay < hitDistance + 1.0) {
                const distSq = closestPt.distanceToSquared(pos);
                if (!t.isPlayer) {
                    if (distSq < 16.0) {
                        const proximity = 1.0 - Math.min(Math.sqrt(distSq) / 4.0, 1.0);
                        t.alert(shooter, 0.28 + (proximity * 0.25));
                    }
                } else {
                    if (distSq < 2.0) playNearMissSound();
                }
            }
        }
    });
}
