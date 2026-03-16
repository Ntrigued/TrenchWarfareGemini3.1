// ================================================================
// GAME LOOP & INITIALIZATION
// ================================================================

import { PLAYER_RADIUS, PLAYER_HP_MAX, EYE_HEIGHT_STAND, EYE_HEIGHT_CROUCH, EYE_HEIGHT_PRONE,
         SPEED_STAND_WALK, SPEED_STAND_SPRINT, SPEED_CROUCH_WALK, SPEED_CROUCH_SPRINT,
         SPEED_PRONE, SPEED_PRONE_SPRINT, SPEED_PRONE_ROLL, SLIDE_FRICTION,
         MG_COOL_NORMAL, MG_COOL_OVERHEAT, MG_OVERHEAT_CAP,
         SNIPER_PRE_BOLT_DELAY, SNIPER_ZOOM_DEFAULT,
         TURRET_MOUNT_RANGE, AI_PEER_SEPARATION } from './config.js';
import { state, allies, enemies, turrets } from './state.js';
import { scene, camera, renderer } from './scene.js';
import { initAudio, startAmbientBattle, playSoundFile, getAudioState } from './audio.js';
import { getTerrainHeight, resolveObstacles, FRONT_TRENCH, BACK_TRENCH,
         PLAYABLE_HALF_DEPTH, PLAYABLE_HALF_WIDTH } from './world.js';
import './turrets.js';  // side-effect: builds turrets and covers
import { flashes, explosions, impacts, tracers, ashParticles, ashCount, horizonLights } from './effects.js';
import { playerRoot, leanObject, pitchObject, playerAI } from './player.js';
import { weaponsData, weaponContainer, modelSniper, fpFlashMaterial, fpFlashLight, snBoltGroup } from './weapons.js';
import './input.js';  // side-effect: registers event handlers
import { shootPlayer } from './playerShooting.js';
import { shootTurret } from './turretShooting.js';
import { AI, spawnSoldiers } from './ai.js';

// ================================================================
// GAME MANAGEMENT
// ================================================================

function startGame(mode) {
    state.gameMode = mode;
    if (!state.initialized) {
        initAudio();
        startAmbientBattle(horizonLights);
        state.initialized = true;
    }

    // Reset player state
    state.playerHp      = PLAYER_HP_MAX;
    playerAI.dead = false;
    playerAI.hp   = PLAYER_HP_MAX;
    document.getElementById('healthbar').style.width   = '100%';
    document.getElementById('hurt-overlay').style.opacity    = 0;
    document.getElementById('hurt-overlay').style.background = 'red';
    document.getElementById('victory-screen').style.display  = 'none';

    // Randomize spawn position
    const spawnX = (Math.random() - 0.5) * 132;
    let spawnZ;
    if (Math.random() > 0.5) {
        spawnZ = -(FRONT_TRENCH.minAbsZ + (Math.random() * (FRONT_TRENCH.maxAbsZ - FRONT_TRENCH.minAbsZ)));
    } else {
        spawnZ = -(BACK_TRENCH.minAbsZ + (Math.random() * (BACK_TRENCH.maxAbsZ - BACK_TRENCH.minAbsZ)));
    }
    let spawnPos2D = { x: spawnX, z: spawnZ };
    resolveObstacles(spawnPos2D, 0.4);
    playerRoot.position.set(spawnPos2D.x, getTerrainHeight(spawnPos2D.x, spawnPos2D.z), spawnPos2D.z);

    // Reset player controls
    state.yaw          = Math.PI;
    state.pitch        = 0;
    state.isCrouched   = false;
    state.isProne      = false;
    state.slideTimer   = 0;
    state.mgHeat       = 0;
    state.mgOverheated = false;
    state.qToggled     = false;
    state.eToggled     = false;
    state.rollAngle    = 0;
    state.activeRollDir = 0;
    state.rollCooldown  = 0;

    state.playerKills = 0;
    document.getElementById('kill-count-indicator').innerText = 'Kills: 0';
    state.sniperNeedsRechamber = false;
    state.sniperZoomLevel      = SNIPER_ZOOM_DEFAULT;

    if (state.mountedTurret) {
        state.mountedTurret.user = null;
        state.mountedTurret      = null;
        weaponContainer.visible = true;
    }
    turrets.forEach(t => t.user = null);

    const totalCount  = parseInt(document.getElementById('soldier-count').value, 10) || 500;
    const activeCount = parseInt(document.getElementById('active-count').value, 10) || 25;

    if (mode === 'elimination') {
        const initialSpawn = Math.min(totalCount, activeCount);
        state.allyReserves  = totalCount - initialSpawn;
        state.enemyReserves = totalCount - initialSpawn;
        spawnSoldiers(initialSpawn);
        document.getElementById('reserves-indicator').style.display = 'block';
    } else {
        spawnSoldiers(activeCount);
        document.getElementById('reserves-indicator').style.display = 'none';
    }

    if (!document.pointerLockElement) {
        document.body.requestPointerLock().catch(err => console.warn(err));
    }
}

// --- Button listeners ---
document.getElementById('btn-endless').addEventListener('click', () => startGame('endless'));
document.getElementById('btn-elimination').addEventListener('click', () => startGame('elimination'));
document.getElementById('btn-victory-menu').addEventListener('click', () => {
    document.getElementById('victory-screen').style.display  = 'none';
    document.getElementById('instructions').style.display    = 'flex';
});
document.addEventListener('pointerlockchange', () => {
    if (document.getElementById('victory-screen').style.display === 'flex') return;
    document.getElementById('instructions').style.display = document.pointerLockElement ? 'none' : 'flex';
});

// Initial preview spawn
spawnSoldiers(25);


// ================================================================
// GAME LOOP
// ================================================================

state.lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    let dt = (now - state.lastTime) / 1000;
    state.lastTime = now;
    if (dt > 0.1) dt = 0.1;
    state.breathTime += dt * 1.5;

    if (!playerAI.dead && document.pointerLockElement) {

        // Elimination victory check
        if (state.gameMode === 'elimination') {
            const aliveEnemies = enemies.filter(e => !e.dead).length;
            document.getElementById('reserves-indicator').innerText = `Enemies Remaining: ${state.enemyReserves + aliveEnemies}`;
            if (aliveEnemies === 0 && state.enemyReserves <= 0) {
                document.exitPointerLock();
                document.getElementById('victory-screen').style.display = 'flex';
                playerAI.dead = true;
                return;
            }
        }

        // MG heat
        if (state.mgHeat > 0) {
            state.mgHeat -= (state.mgOverheated ? MG_COOL_OVERHEAT : MG_COOL_NORMAL) * dt;
            if (state.mgHeat <= 0) { state.mgHeat = 0; state.mgOverheated = false; }
        }
        const heatContainer = document.getElementById('heatbar-container');
        if (state.currentWeaponIndex === 1 && !state.mountedTurret) {
            heatContainer.style.display = 'block';
            document.getElementById('heatbar').style.width      = state.mgHeat + '%';
            document.getElementById('heatbar').style.background = state.mgOverheated ? '#ff0000' : '#ff8800';
        } else {
            heatContainer.style.display = 'none';
        }

        // Shooting
        const wep = weaponsData[state.currentWeaponIndex];
        if (state.keys.lmb) {
            if (state.mountedTurret) shootTurret(state.mountedTurret, playerAI);
            else if (wep.type === 'auto' || state.lmbJustPressed) shootPlayer();
        }
        state.lmbJustPressed = false;

        // Sniper bolt rechamber
        let isRechambering    = false;
        let isActivelyBolting = false;
        let boltProgress      = 0;

        if (state.currentWeaponIndex === 2 && state.sniperNeedsRechamber && !state.mountedTurret) {
            isRechambering = true;
            const timeSinceBoltStart = now - state.sniperRechamberStartTime;
            if (timeSinceBoltStart >= wep.fireRate) {
                state.sniperNeedsRechamber = false;
                isRechambering       = false;
            } else if (timeSinceBoltStart >= SNIPER_PRE_BOLT_DELAY) {
                isActivelyBolting = true;
                boltProgress      = (timeSinceBoltStart - SNIPER_PRE_BOLT_DELAY) / (wep.fireRate - SNIPER_PRE_BOLT_DELAY);
            }
        }

        // Aim state & scope
        const isAiming = (state.keys.rmb || state.keys.space) && !isActivelyBolting;
        document.getElementById('scope-overlay').style.display =
            (isAiming && state.currentWeaponIndex === 2 && !state.mountedTurret) ? 'flex' : 'none';

        // Crosshair
        let hideCrosshair = false;
        if (state.mountedTurret) {
            hideCrosshair = isAiming;
        } else {
            hideCrosshair = isAiming || state.currentWeaponIndex === 2;
        }
        document.getElementById('crosshair').style.display = hideCrosshair ? 'none' : 'block';

        // Action prompt
        const promptEl = document.getElementById('action-prompt');
        let canMount   = false;
        if (!state.mountedTurret) {
            turrets.forEach(t => {
                const canClaim = !t.user || (t.user && !t.user.isEnemy && t.user !== playerAI);
                if (canClaim && playerRoot.position.distanceTo(t.mesh.position) < TURRET_MOUNT_RANGE) canMount = true;
            });
        }
        if (state.mountedTurret) {
            promptEl.style.display = 'block';
            promptEl.innerText     = "Press T to leave turret";
        } else if (canMount) {
            promptEl.style.display = 'block';
            promptEl.innerText     = "Press T to use turret";
        } else {
            promptEl.style.display = 'none';
        }

        // Weapon bob & sway
        let bobOffsetX       = 0;
        let bobOffsetY       = 0;
        let targetWeaponRotY = 0;
        let targetWeaponRotZ = 0;
        let targetWeaponRotX = 0;
        let targetBoltRotZ   = 0;
        let targetBoltPosZ   = -0.05;

        const isMovingInput = (state.keys.w || state.keys.s || state.keys.a || state.keys.d) && document.pointerLockElement && !state.mountedTurret;

        if (state.slideTimer > 0 && !isAiming) {
            targetWeaponRotX -= 0.15;
            targetWeaponRotZ += 0.15;
            bobOffsetX = Math.cos(state.bobTime) * 0.01;
            bobOffsetY = Math.sin(state.bobTime) * 0.01;
        } else if (isMovingInput && !isAiming) {
            let moveMult = 1.0;
            if (state.isProne)                        moveMult = 0.3;
            else if (state.isCrouched && state.keys.shift) moveMult = 1.5;
            else if (state.isCrouched)                moveMult = 0.5;
            else if (state.keys.shift)                moveMult = 2.5;
            bobOffsetX      = Math.cos(state.bobTime * 0.5) * 0.015 * moveMult;
            bobOffsetY      = Math.sin(state.bobTime)       * 0.015 * moveMult;
            targetWeaponRotZ += Math.cos(state.bobTime * 0.5) * -0.05 * moveMult;
            targetWeaponRotX += Math.sin(state.bobTime)       *  0.02 * moveMult;
            targetWeaponRotY += Math.cos(state.bobTime * 0.5) *  0.04 * moveMult;
        } else if (!isAiming && !state.mountedTurret) {
            bobOffsetY      = Math.sin(state.breathTime) * 0.004;
            targetWeaponRotX += Math.sin(state.breathTime) * 0.005;
        }

        // Aim / scope FOV
        let targetFov = 75;
        if (isAiming && !state.mountedTurret) {
            if (state.currentWeaponIndex === 2) {
                targetFov = 75 / state.sniperZoomLevel;
                modelSniper.visible = false;
            } else {
                targetFov = 40;
                weaponContainer.position.lerp(new THREE.Vector3(0, wep.alignY, -0.25), 15 * dt);
            }
        } else if (!state.mountedTurret) {
            if (state.currentWeaponIndex === 2) modelSniper.visible = true;
            weaponContainer.position.lerp(new THREE.Vector3(0.2 + bobOffsetX, -0.2 + bobOffsetY, -0.4), 15 * dt);
        } else if (state.mountedTurret) {
            targetFov = isAiming ? 40 : 75;
        }

        // Sniper bolt animation
        if (isActivelyBolting && !state.mountedTurret) {
            targetWeaponRotZ += Math.sin(boltProgress * Math.PI) * 0.25;
            targetWeaponRotX += Math.sin(boltProgress * Math.PI) * -0.05;
            if (boltProgress < 0.15) {
                targetBoltRotZ = (boltProgress / 0.15) * (-Math.PI / 3);
            } else if (boltProgress < 0.4) {
                targetBoltRotZ = -Math.PI / 3;
                targetBoltPosZ = -0.05 + ((boltProgress - 0.15) / 0.25) * 0.15;
            } else if (boltProgress < 0.65) {
                targetBoltRotZ = -Math.PI / 3;
                targetBoltPosZ = 0.10 - ((boltProgress - 0.4) / 0.25) * 0.15;
            } else if (boltProgress < 0.8) {
                targetBoltRotZ = -Math.PI / 3 + ((boltProgress - 0.65) / 0.15) * (Math.PI / 3);
            }
        }

        weaponContainer.rotation.z += (targetWeaponRotZ - weaponContainer.rotation.z) * 10 * dt;
        weaponContainer.rotation.x += (targetWeaponRotX - weaponContainer.rotation.x) * 10 * dt;
        weaponContainer.rotation.y += (targetWeaponRotY - (weaponContainer.rotation.y || 0)) * 10 * dt;

        snBoltGroup.rotation.z += (targetBoltRotZ - snBoltGroup.rotation.z) * 25 * dt;
        snBoltGroup.position.z += (targetBoltPosZ - snBoltGroup.position.z) * 25 * dt;

        weaponContainer.position.z += (-0.4 - weaponContainer.position.z) * 10 * dt;

        camera.fov += (targetFov - camera.fov) * 15 * dt;
        camera.updateProjectionMatrix();

        // Lean & roll
        const isLeaningLeft  = (state.keys.q || state.qToggled) && !state.mountedTurret && !state.isProne;
        const isLeaningRight = (state.keys.e || state.eToggled) && !state.mountedTurret && !isLeaningLeft && !state.isProne;

        if (state.rollCooldown > 0) state.rollCooldown -= dt;

        if (state.isProne && !state.mountedTurret) {
            if (state.activeRollDir === 0 && state.rollCooldown <= 0) {
                if (state.keys.q)      state.activeRollDir =  1;
                else if (state.keys.e) state.activeRollDir = -1;
            }
        } else {
            state.activeRollDir = 0;
        }

        const isRollingLeft  = state.activeRollDir ===  1;
        const isRollingRight = state.activeRollDir === -1;

        if (!state.isProne) {
            const targetLeanZ = isLeaningLeft  ?  0.25 : (isLeaningRight ? -0.25 : 0);
            const targetLeanX = isLeaningLeft  ? -0.5  : (isLeaningRight ?  0.5  : 0);
            leanObject.rotation.z += (targetLeanZ - leanObject.rotation.z) * 10 * dt;
            if (typeof leanObject.userData.baseLocalX === 'undefined') leanObject.userData.baseLocalX = 0;
            leanObject.userData.baseLocalX += (targetLeanX - leanObject.userData.baseLocalX) * 10 * dt;
            state.rollAngle = leanObject.rotation.z;
        } else {
            if (isRollingLeft) {
                state.rollAngle += Math.PI * 3 * dt;
                if (state.rollAngle >= Math.PI * 2) { state.rollAngle = 0; state.activeRollDir = 0; state.rollCooldown = 0.4; }
            } else if (isRollingRight) {
                state.rollAngle -= Math.PI * 3 * dt;
                if (state.rollAngle <= -Math.PI * 2) { state.rollAngle = 0; state.activeRollDir = 0; state.rollCooldown = 0.4; }
            } else {
                state.rollAngle = state.rollAngle % (Math.PI * 2);
                if (state.rollAngle >  Math.PI) state.rollAngle -= Math.PI * 2;
                if (state.rollAngle < -Math.PI) state.rollAngle += Math.PI * 2;
                state.rollAngle += (0 - state.rollAngle) * 12 * dt;
            }
            leanObject.rotation.z = state.rollAngle;
            if (typeof leanObject.userData.baseLocalX === 'undefined') leanObject.userData.baseLocalX = 0;
            leanObject.userData.baseLocalX += (0 - leanObject.userData.baseLocalX) * 10 * dt;
        }

        // Camera lean position
        if (!state.mountedTurret) {
            let leanLocalVec = new THREE.Vector3(leanObject.userData.baseLocalX, 0, 0);
            leanLocalVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);
            let leanPos2D = { x: playerRoot.position.x + leanLocalVec.x, z: playerRoot.position.z + leanLocalVec.z };
            resolveObstacles(leanPos2D, 0.3);
            let resolvedLocalVec = new THREE.Vector3(leanPos2D.x - playerRoot.position.x, 0, leanPos2D.z - playerRoot.position.z);
            resolvedLocalVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), -state.yaw);
            leanObject.position.x = resolvedLocalVec.x;
            leanObject.position.z = resolvedLocalVec.z;

            // Player eye height
            const effProne   = state.isProne || state.slideTimer > 0;
            let targetEyeY   = effProne ? EYE_HEIGHT_PRONE : (state.isCrouched ? EYE_HEIGHT_CROUCH : EYE_HEIGHT_STAND);
            if (state.isProne && (isRollingLeft || isRollingRight)) targetEyeY = 0.2;
            leanObject.position.y += (targetEyeY - leanObject.position.y) * 10 * dt;

            pitchObject.position.z += (0 - pitchObject.position.z) * 15 * dt;

            playerAI.mesh.scale.y    = effProne ? 0.2 : (state.isCrouched ? 0.5 : 1.0);
            playerAI.mesh.position.y = effProne ? 0.18 : (state.isCrouched ? 0.45 : 0.9);
            playerAI.mesh.position.x = leanObject.position.x;
            playerAI.mesh.position.z = leanObject.position.z;

            // Player movement
            const moveDir = new THREE.Vector3();
            if (isRollingLeft) {
                moveDir.x -= 1;
            } else if (isRollingRight) {
                moveDir.x += 1;
            } else {
                if (state.keys.w) moveDir.z -= 1;
                if (state.keys.s) moveDir.z += 1;
                if (state.keys.a) moveDir.x -= 1;
                if (state.keys.d) moveDir.x += 1;
            }
            if (moveDir.lengthSq() > 0) moveDir.normalize();
            moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);

            let speed   = SPEED_STAND_WALK;
            let bobSpeed = 8;
            let bobAmp   = 0.05;
            let slideVelocity = new THREE.Vector3(0, 0, 0);

            if (state.slideTimer > 0) {
                state.slideTimer -= dt;
                state.slideSpeed = Math.max(0, state.slideSpeed - SLIDE_FRICTION * dt);
                slideVelocity.copy(state.slideDir).multiplyScalar(state.slideSpeed * dt);
                speed    = 1.5;
                bobSpeed = 0;
                bobAmp   = 0;
            } else if (state.isProne) {
                if (isRollingLeft || isRollingRight) {
                    speed = SPEED_PRONE_ROLL; bobSpeed = 0; bobAmp = 0;
                } else if (state.keys.shift && !isAiming) {
                    speed = SPEED_PRONE_SPRINT; bobSpeed = 6; bobAmp = 0.025;
                } else {
                    speed = SPEED_PRONE; bobSpeed = 4; bobAmp = 0.015;
                }
            } else if (state.isCrouched) {
                if (state.keys.shift && !isAiming) { speed = SPEED_CROUCH_SPRINT; bobSpeed = 10; bobAmp = 0.035; }
                else                                { speed = SPEED_CROUCH_WALK;  bobSpeed =  6; bobAmp = 0.02; }
            } else {
                if (state.keys.shift && !isAiming) { speed = SPEED_STAND_SPRINT; bobSpeed = 12; bobAmp = 0.05; }
                else                                { speed = SPEED_STAND_WALK;  bobSpeed =  8; bobAmp = 0.05; }
            }

            const velocity = moveDir.multiplyScalar(speed * dt).add(slideVelocity);

            if (moveDir.lengthSq() > 0 && document.pointerLockElement) {
                state.bobTime += dt * bobSpeed;
                pitchObject.position.y = Math.sin(state.bobTime) * bobAmp;
            } else if (document.pointerLockElement) {
                pitchObject.position.y += (Math.sin(state.breathTime) * 0.015 - pitchObject.position.y) * 5 * dt;
            } else {
                pitchObject.position.y += (0 - pitchObject.position.y) * 10 * dt;
            }

            // Move player root
            let nextPos = playerRoot.position.clone().add(velocity);
            const pr    = PLAYER_RADIUS;
            if (nextPos.z < -PLAYABLE_HALF_DEPTH + pr) nextPos.z = -PLAYABLE_HALF_DEPTH + pr;
            if (nextPos.z >  PLAYABLE_HALF_DEPTH - pr) nextPos.z =  PLAYABLE_HALF_DEPTH - pr;
            if (nextPos.x < -PLAYABLE_HALF_WIDTH + pr) nextPos.x = -PLAYABLE_HALF_WIDTH + pr;
            if (nextPos.x >  PLAYABLE_HALF_WIDTH - pr) nextPos.x =  PLAYABLE_HALF_WIDTH - pr;

            let pPos2D = { x: nextPos.x, z: nextPos.z };
            resolveObstacles(pPos2D, pr);
            nextPos.x = pPos2D.x;
            nextPos.z = pPos2D.z;

            // Player-AI crowd separation
            const allLivingAI = [...allies, ...enemies].filter(a => !a.dead);
            allLivingAI.forEach(ai => {
                let dx = nextPos.x - ai.mesh.position.x;
                let dz = nextPos.z - ai.mesh.position.z;
                let distSq  = dx * dx + dz * dz;
                let minDist = AI_PEER_SEPARATION;
                if (distSq < minDist * minDist && distSq > 0.0001) {
                    let dist = Math.sqrt(distSq);
                    let overlap = minDist - dist;
                    nextPos.x += (dx / dist) * overlap;
                    nextPos.z += (dz / dist) * overlap;
                }
            });

            playerRoot.position.copy(nextPos);
            playerRoot.position.y = getTerrainHeight(playerRoot.position.x, playerRoot.position.z);

        } else {
            // Turret mount
            leanObject.position.x += (0   - leanObject.position.x) * 15 * dt;
            leanObject.position.z += (0   - leanObject.position.z) * 15 * dt;
            leanObject.position.y += (0.1 - leanObject.position.y) * 15 * dt;
            pitchObject.position.z += (0 - pitchObject.position.z) * 15 * dt;
            pitchObject.position.y += (0 - pitchObject.position.y) * 15 * dt;

            const targetCamZ = isAiming ? 0.25 : 0.8;
            const targetCamY = isAiming ? 0.14 : 0.35;
            camera.position.y += (targetCamY - camera.position.y) * 15 * dt;
            camera.position.z += (targetCamZ - camera.position.z) * 15 * dt;

            playerRoot.position.copy(state.mountedTurret.mesh.position);
            state.mountedTurret.swivel.rotation.y    = state.yaw;
            state.mountedTurret.pitchGroup.rotation.x = state.pitch;
        }

        // Weapon indicator UI
        const weaponInd = document.getElementById('weapon-indicator');
        if (state.mountedTurret) {
            if (state.mountedTurret.isReloading) {
                weaponInd.innerText   = `Turret [RELOADING...] (${state.mountedTurret.ammo}/${state.mountedTurret.maxAmmo})`;
                weaponInd.style.color = '#ffffaa';
            } else {
                weaponInd.innerText   = `Turret (${state.mountedTurret.ammo}/${state.mountedTurret.maxAmmo})`;
                weaponInd.style.color = state.mountedTurret.ammo === 0 ? '#ff5555' : 'white';
            }
        } else {
            weaponInd.innerText   = weaponsData[state.currentWeaponIndex].name;
            weaponInd.style.color = 'white';
        }

        // Turret reload animation
        turrets.forEach(t => {
            t.pitchGroup.position.z += (0 - t.pitchGroup.position.z) * 10 * dt;

            if (t.isReloading) {
                if (t.user) {
                    t.reloadTimer -= dt;
                    t.dummyShell.visible = true;
                    let loadProgress = 1.0 - (t.reloadTimer / 0.6);
                    if (loadProgress > 1) loadProgress = 1;
                    if (loadProgress < 0) loadProgress = 0;
                    t.dummyShell.position.set(0, 0.4 - (loadProgress * 0.3), 0.1);

                    if (t.reloadTimer <= 0) {
                        t.ammo++;
                        playSoundFile('gunshot', 3.0, 0.05);
                        t.pitchGroup.rotation.z = (Math.random() - 0.5) * 0.15;
                        if (t.ammo >= t.maxAmmo) {
                            t.isReloading = false;
                            t.dummyShell.visible = false;
                        } else {
                            t.reloadTimer = 0.6;
                        }
                    }
                } else {
                    t.dummyShell.visible = false;
                }
                t.pitchGroup.rotation.z += (0 - t.pitchGroup.rotation.z) * 10 * dt;
            } else {
                t.dummyShell.visible = false;
                t.pitchGroup.rotation.z += (0 - t.pitchGroup.rotation.z) * 10 * dt;
                if (t.ammo <= 0 && t.user) {
                    t.isReloading = true;
                    t.reloadTimer = 0.6;
                }
            }
        });

    } // end player frame

    // Hurt overlay fade
    const hurtEl = document.getElementById('hurt-overlay');
    if (!playerAI.dead && parseFloat(hurtEl.style.opacity) > 0) {
        hurtEl.style.opacity = Math.max(0, parseFloat(hurtEl.style.opacity) - dt);
    }

    // FP muzzle flash fade
    if (fpFlashMaterial.opacity > 0) {
        fpFlashMaterial.opacity = Math.max(0, fpFlashMaterial.opacity - dt * 20);
        fpFlashLight.intensity  = Math.max(0, fpFlashLight.intensity - dt * 40);
    }

    // Explosion pool update
    explosions.forEach(exp => {
        if (exp.life > 0) {
            exp.life -= dt;
            let t = 1.0 - (exp.life / exp.maxLife);
            if (t > 1) t = 1;
            const scale = 0.5 + (Math.pow(t, 0.4) * 9.0);
            exp.mesh.scale.set(scale, scale, scale);
            if (t < 0.15)      exp.mesh.material.color.setHex(0xffffff);
            else if (t < 0.4)  exp.mesh.material.color.setHex(0xff8800);
            else               exp.mesh.material.color.setHex(0x330800);
            exp.mesh.material.opacity = (1.0 - t) * 0.9;
            exp.light.intensity = Math.max(0, 20.0 * (1.0 - (t * 1.5)));
            if (exp.life <= 0) {
                exp.mesh.visible    = false;
                exp.light.intensity = 0;
            }
        }
    });

    // Impact pool update
    impacts.forEach(imp => {
        if (imp.life > 0) {
            imp.life -= dt;
            imp.mesh.scale.addScalar(dt * 10);
            imp.mesh.material.opacity = (imp.life / 0.2);
            if (imp.life <= 0) imp.mesh.visible = false;
        }
    });

    // AI update
    allies.forEach(a => a.update(dt));
    enemies.forEach(e => e.update(dt));

    // World flash pool update
    flashes.forEach(f => {
        if (f.life > 0) {
            f.life -= dt;
            if (f.life <= 0) f.mesh.material.opacity = 0;
        }
    });

    // Tracer pool update
    tracers.forEach(t => {
        if (t.life > 0) {
            t.life -= dt;
            const moveDist = 150 * dt;
            t.traveled += moveDist;
            if (t.traveled >= t.maxDist) {
                t.life = 0;
                t.mesh.visible = false;
            } else {
                t.mesh.position.add(t.dir.clone().multiplyScalar(moveDist));
            }
        }
    });

    // Ash particles update
    const positions = ashParticles.geometry.attributes.position.array;
    for (let i = 0; i < ashCount * 3; i += 3) {
        positions[i]   -= dt * 1.5;
        positions[i+1] -= dt * 0.8;
        if (positions[i]   < -100) positions[i]   = 100;
        if (positions[i+1] <   -2) positions[i+1] = 10 + Math.random() * 5;
    }
    ashParticles.geometry.attributes.position.needsUpdate = true;

    // Horizon lights decay
    horizonLights.forEach(hl => {
        if (hl.timer > 0) {
            hl.timer -= dt;
            if (hl.timer <= 0) hl.light.intensity = 0;
        } else {
            hl.light.intensity = Math.max(0, hl.light.intensity - dt * 20);
        }
    });

    // Shell shock audio effects
    const audio = getAudioState();
    if (audio.audioCtx && audio.masterFilter) {
        if (state.shellShockTimer > 0) {
            state.shellShockTimer -= dt;
            audio.masterFilter.frequency.setTargetAtTime(300,   audio.audioCtx.currentTime, 0.1);
            audio.masterGain.gain.setTargetAtTime(0.4,          audio.audioCtx.currentTime, 0.1);
        } else {
            audio.masterFilter.frequency.setTargetAtTime(22000, audio.audioCtx.currentTime, 2.0);
            audio.masterGain.gain.setTargetAtTime(1.0,          audio.audioCtx.currentTime, 2.0);
        }
    }

    // Screen shake & render
    let sx = 0, sy = 0, sz = 0;
    if (state.currentScreenShake > 0) {
        state.currentScreenShake -= dt;
        sx = (Math.random() - 0.5) * state.currentScreenShake;
        sy = (Math.random() - 0.5) * state.currentScreenShake;
        sz = (Math.random() - 0.5) * state.currentScreenShake;
        camera.position.x += sx;
        camera.position.y += sy;
        camera.position.z += sz;
    }

    renderer.render(scene, camera);

    if (sx !== 0 || sy !== 0 || sz !== 0) {
        camera.position.x -= sx;
        camera.position.y -= sy;
        camera.position.z -= sz;
    }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
