// ================================================================
// AI SYSTEM
// ================================================================

import { AI_MOVE_SPEED, AI_DAMAGE_FROM_AI, AI_PEER_SEPARATION,
         AI_MEMORY_DURATION, AI_SEARCH_DURATION, AI_BLIND_FIRE_CHANCE } from './config.js';
import { state, allies, enemies } from './state.js';
import { scene, camera } from './scene.js';
import { playPositionalSound, playSoundFile, playNearMissSound } from './audio.js';
import { worldMeshes, getTerrainHeight, resolveObstacles,
         allyCoversFront, allyCoversBack, enemyCoversFront, enemyCoversBack,
         allyPathCovers, enemyPathCovers, midCoversAlly, midCoversEnemy } from './world.js';
import { playerRoot, playerAI } from './player.js';
import { raycaster } from './raycast.js';
import { isSpotVisibleToPlayer } from './raycast.js';
import { showMuzzleFlash, createImpact, createTracer } from './effects.js';
import { shootTurret } from './turretShooting.js';

// --- AI materials ---
const allyMat        = new THREE.MeshLambertMaterial({ color: 0x7a6845 });
const enemyMat       = new THREE.MeshLambertMaterial({ color: 0x5a5d48 });
const skinMat        = new THREE.MeshLambertMaterial({ color: 0xdcb897 });
const helmetMatEnemy = new THREE.MeshLambertMaterial({ color: 0x4a4d45 });
const helmetMatAlly  = new THREE.MeshLambertMaterial({ color: 0x828060 });
const allyBeltMat    = new THREE.MeshLambertMaterial({ color: 0x4a3825 });
const enemyBeltMat   = new THREE.MeshLambertMaterial({ color: 0x35352a });
const allyPutteeMat  = new THREE.MeshLambertMaterial({ color: 0x8a7e65 });
const enemyPutteeMat = new THREE.MeshLambertMaterial({ color: 0x4e5040 });
const bootMatAlly    = new THREE.MeshLambertMaterial({ color: 0x2a1e10 });
const bootMatEnemy   = new THREE.MeshLambertMaterial({ color: 0x1a1a18 });

export class AI {
    constructor(isEnemy) {
        this.isEnemy = isEnemy;
        this.mesh    = new THREE.Group();

        const uniformMat = isEnemy ? enemyMat : allyMat;
        const helmetMat  = isEnemy ? helmetMatEnemy : helmetMatAlly;

        this.bodyRoot = new THREE.Group();
        this.mesh.add(this.bodyRoot);

        this.torso = new THREE.Group();
        this.torso.position.y = 0.3;
        this.bodyRoot.add(this.torso);

        const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.25), uniformMat);
        torsoMesh.userData.ai = this;
        this.torso.add(torsoMesh);

        const beltMat = isEnemy ? enemyBeltMat : allyBeltMat;
        const belt = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.27), beltMat);
        belt.position.set(0, -0.1, 0);
        belt.userData.ai = this;
        this.torso.add(belt);

        const ammoPouchMat = new THREE.MeshLambertMaterial({ color: isEnemy ? 0x3a3a28 : 0x5a4e38 });
        const lPouch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.06), ammoPouchMat);
        lPouch.position.set(-0.12, -0.12, 0.15);
        lPouch.userData.ai = this;
        this.torso.add(lPouch);
        const rPouch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.06), ammoPouchMat);
        rPouch.position.set(0.12, -0.12, 0.15);
        rPouch.userData.ai = this;
        this.torso.add(rPouch);

        this.headGroup = new THREE.Group();
        this.headGroup.position.y = 0.35;
        this.torso.add(this.headGroup);

        const head    = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.2), skinMat);
        head.position.y = 0.125;
        head.name = "head";
        head.userData.ai = this;

        let helmetBowl, helmetBrim, helmetLug;
        if (!isEnemy) {
            helmetBowl = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.1, 0.27), helmetMat);
            helmetBowl.position.y = 0.295;
            helmetBowl.name = "head";
            helmetBowl.userData.ai = this;
            helmetBrim = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.025, 0.38), helmetMat);
            helmetBrim.position.y = 0.265;
            helmetBrim.name = "head";
            helmetBrim.userData.ai = this;
        } else {
            helmetBowl = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.17, 0.27), helmetMat);
            helmetBowl.position.y = 0.31;
            helmetBowl.name = "head";
            helmetBowl.userData.ai = this;
            helmetLug = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.055, 0.09), helmetMat);
            helmetLug.position.y = 0.42;
            helmetLug.name = "head";
            helmetLug.userData.ai = this;
            helmetBrim = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.025, 0.30), helmetMat);
            helmetBrim.position.y = 0.265;
            helmetBrim.name = "head";
            helmetBrim.userData.ai = this;
        }

        const eyeMat  = new THREE.MeshLambertMaterial({ color: 0x111111 });
        const lEye    = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), eyeMat);
        lEye.position.set(-0.04, 0.16, 0.101);
        lEye.name = "head"; lEye.userData.ai = this;
        const rEye    = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), eyeMat);
        rEye.position.set(0.04, 0.16, 0.101);
        rEye.name = "head"; rEye.userData.ai = this;

        const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.04), new THREE.MeshLambertMaterial({ color: 0x221100 }));
        mustache.position.set(0, 0.10, 0.115);
        mustache.name = "head"; mustache.userData.ai = this;

        const mouth   = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), new THREE.MeshLambertMaterial({ color: 0x3a0505 }));
        mouth.position.set(0, 0.06, 0.101);
        mouth.name = "head"; mouth.userData.ai = this;

        const helmetParts = isEnemy ? [helmetBowl, helmetLug, helmetBrim] : [helmetBowl, helmetBrim];
        this.headGroup.add(head, ...helmetParts, lEye, rEye, mustache, mouth);

        // Left arm
        this.leftArm = new THREE.Group();
        this.leftArm.position.set(-0.25, 0.2, 0);
        this.torso.add(this.leftArm);
        const lUArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.12), uniformMat);
        lUArmMesh.position.y = -0.14; lUArmMesh.userData.ai = this;
        this.leftArm.add(lUArmMesh);
        this.leftForearm = new THREE.Group();
        this.leftForearm.position.set(0, -0.28, 0);
        this.leftArm.add(this.leftForearm);
        const lLArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.1), uniformMat);
        lLArmMesh.position.y = -0.125; lLArmMesh.userData.ai = this;
        this.leftForearm.add(lLArmMesh);
        const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), skinMat);
        lHand.position.set(0, -0.3, 0);
        this.leftForearm.add(lHand);

        // Right arm
        this.rightArm = new THREE.Group();
        this.rightArm.position.set(0.25, 0.2, 0);
        this.torso.add(this.rightArm);
        const rUArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.12), uniformMat);
        rUArmMesh.position.y = -0.14; rUArmMesh.userData.ai = this;
        this.rightArm.add(rUArmMesh);
        this.rightForearm = new THREE.Group();
        this.rightForearm.position.set(0, -0.28, 0);
        this.rightArm.add(this.rightForearm);
        const rLArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.1), uniformMat);
        rLArmMesh.position.y = -0.125; rLArmMesh.userData.ai = this;
        this.rightForearm.add(rLArmMesh);
        const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), skinMat);
        rHand.position.set(0, -0.3, 0);
        this.rightForearm.add(rHand);

        // Weapon
        this.weaponGroup = new THREE.Group();
        const aiWoodColor  = isEnemy ? 0x3d2a12 : 0x5a3618;
        const aiSteelColor = isEnemy ? 0x2e2e2e : 0x1e1e1e;
        const aiBarrel   = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 1.05, 8), new THREE.MeshLambertMaterial({ color: aiSteelColor }));
        aiBarrel.rotation.x = Math.PI / 2; aiBarrel.position.set(0, 0, 0.525);
        const aiReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.062, 0.26), new THREE.MeshLambertMaterial({ color: aiSteelColor }));
        aiReceiver.position.set(0, 0.01, 0.15);
        const aiMag      = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.09, 0.08), new THREE.MeshLambertMaterial({ color: aiSteelColor }));
        aiMag.position.set(0, -0.055, 0.15);
        const aiStock    = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: aiWoodColor }));
        aiStock.position.set(0, -0.03, -0.1);
        const aiHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.52), new THREE.MeshLambertMaterial({ color: aiWoodColor }));
        aiHandguard.position.set(0, -0.005, 0.4);
        const aiBolt     = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.042), new THREE.MeshLambertMaterial({ color: 0x555555 }));
        aiBolt.rotation.z = Math.PI / 2; aiBolt.position.set(0.026, 0.022, 0.1);
        const aiNoseCap  = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.056, 0.04), new THREE.MeshLambertMaterial({ color: aiSteelColor }));
        aiNoseCap.position.set(0, -0.004, 0.97);
        this.weaponGroup.add(aiBarrel, aiReceiver, aiMag, aiStock, aiHandguard, aiBolt, aiNoseCap);
        this.torso.add(this.weaponGroup);

        // Left leg
        this.leftLeg = new THREE.Group();
        this.leftLeg.position.set(-0.12, 0, 0);
        this.bodyRoot.add(this.leftLeg);
        const lThighMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), uniformMat);
        lThighMesh.position.y = -0.2; lThighMesh.userData.ai = this;
        this.leftLeg.add(lThighMesh);
        this.leftCalf = new THREE.Group();
        this.leftCalf.position.set(0, -0.4, 0);
        this.leftLeg.add(this.leftCalf);
        const lCalfMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.45, 0.13), uniformMat);
        lCalfMesh.position.y = -0.2; lCalfMesh.userData.ai = this;
        this.leftCalf.add(lCalfMesh);

        const putteeMat = isEnemy ? enemyPutteeMat : allyPutteeMat;
        const bootMat   = isEnemy ? bootMatEnemy   : bootMatAlly;
        const lPuttee = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.26, 0.145), putteeMat);
        lPuttee.position.y = -0.04; lPuttee.userData.ai = this;
        this.leftCalf.add(lPuttee);
        const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.13, 0.20), bootMat);
        lBoot.position.set(0, -0.38, 0.035); lBoot.userData.ai = this;
        this.leftCalf.add(lBoot);

        // Right leg
        this.rightLeg = new THREE.Group();
        this.rightLeg.position.set(0.12, 0, 0);
        this.bodyRoot.add(this.rightLeg);
        const rThighMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), uniformMat);
        rThighMesh.position.y = -0.2; rThighMesh.userData.ai = this;
        this.rightLeg.add(rThighMesh);
        this.rightCalf = new THREE.Group();
        this.rightCalf.position.set(0, -0.4, 0);
        this.rightLeg.add(this.rightCalf);
        const rCalfMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.45, 0.13), uniformMat);
        rCalfMesh.position.y = -0.2; rCalfMesh.userData.ai = this;
        this.rightCalf.add(rCalfMesh);

        const rPuttee = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.26, 0.145), putteeMat);
        rPuttee.position.y = -0.04; rPuttee.userData.ai = this;
        this.rightCalf.add(rPuttee);
        const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.13, 0.20), bootMat);
        rBoot.position.set(0, -0.38, 0.035); rBoot.userData.ai = this;
        this.rightCalf.add(rBoot);

        scene.add(this.mesh);

        this.dead      = true;
        this.timer     = Math.random() * 2;
        this.crouchT   = 1.0;
        this.aimT      = 0.0;
        this.walkTime  = Math.random() * 10;

        this.respawn();
    }

    getDesiredCovers() {
        if (this.isEnemy) {
            if (this.coverTier === 1) return enemyPathCovers;
            if (this.coverTier === 2) return midCoversEnemy;
            if (this.coverTier === 3) return allyCoversFront;
            if (this.coverTier === 4) return allyCoversBack;
            return this.trenchLevel === 'front' ? enemyCoversFront : enemyCoversBack;
        } else {
            if (this.coverTier === 1) return allyPathCovers;
            if (this.coverTier === 2) return midCoversAlly;
            if (this.coverTier === 3) return enemyCoversFront;
            if (this.coverTier === 4) return enemyCoversBack;
            return this.trenchLevel === 'front' ? allyCoversFront : allyCoversBack;
        }
    }

    pickCover(isSpawning = false) {
        const peers = this.isEnemy ? enemies : allies;

        if (!this.isAdvancing) {
            const backCovers = this.isEnemy ? enemyCoversBack : allyCoversBack;

            let friendlyOnTurret = backCovers.some(c => {
                if (!c.isTurret) return false;
                if (c.turret.user && !c.turret.user.dead && (this.isEnemy ? c.turret.user.isEnemy : !c.turret.user.isEnemy)) return true;
                if (peers.some(p => p !== this && !p.dead && p.targetCover === c)) return true;
                return false;
            });

            if (!friendlyOnTurret) {
                let emptyTurrets = backCovers.filter(c => {
                    if (!c.isTurret) return false;
                    if (c.turret.user && c.turret.user !== this && !c.turret.user.dead) return false;
                    if (peers.some(p => p !== this && !p.dead && p.targetCover === c)) return false;
                    return true;
                });

                if (emptyTurrets.length > 0) {
                    let safeTurrets = emptyTurrets;
                    if (isSpawning) {
                        let hiddenTurrets = emptyTurrets.filter(c => !isSpotVisibleToPlayer(c));
                        if (hiddenTurrets.length > 0) safeTurrets = hiddenTurrets;
                    }
                    this.targetCover = safeTurrets[Math.floor(Math.random() * safeTurrets.length)];
                    this.trenchLevel = 'back';
                    this.coverTier   = 0;
                    return;
                }
            }

            const tryTrench = (level) => {
                const covers = level === 'back'
                    ? (this.isEnemy ? enemyCoversBack  : allyCoversBack)
                    : (this.isEnemy ? enemyCoversFront : allyCoversFront);

                let available = covers.filter(c => {
                    if (c.isTurret && c.turret.user && c.turret.user !== this) return false;
                    return !peers.some(p => p !== this && !p.dead && p.targetCover === c);
                });

                if (available.length > 0) {
                    this.trenchLevel = level;
                    this.coverTier   = 0;
                    if (isSpawning) {
                        let safe = available.filter(c => !isSpotVisibleToPlayer(c));
                        if (safe.length > 0) available = safe;
                    }
                    this.targetCover = available[Math.floor(Math.random() * available.length)];
                    return true;
                }

                if (level === 'back') return tryTrench('front');
                this.isAdvancing = true;
                this.coverTier   = 0;
                return false;
            };

            if (tryTrench('back')) return;
        }

        let covers = this.getDesiredCovers();
        let available = covers.filter(c => {
            if (c.isTurret && c.turret.user && c.turret.user !== this) return false;
            return !peers.some(p => p !== this && !p.dead && p.targetCover === c);
        });

        if (available.length === 0) {
            const occupancy = covers.map(c => ({
                cover: c,
                count: peers.filter(p => p !== this && !p.dead && p.targetCover === c).length
            }));
            const minCount = Math.min(...occupancy.map(o => o.count));
            available = occupancy.filter(o => o.count === minCount).map(o => o.cover);
        }

        if (isSpawning) {
            let safeAvailable = available.filter(c => !isSpotVisibleToPlayer(c));
            if (safeAvailable.length > 0) available = safeAvailable;
        }

        this.targetCover = available[Math.floor(Math.random() * available.length)];
    }

    respawn() {
        this.hp           = Math.floor(Math.random() * 2) + 1;
        this.dead         = false;
        this.mesh.visible = true;
        this.state        = 'hidden';
        this.mesh.rotation.x = 0;
        this.deathAnimT   = 0;

        if (this.targetCover && this.targetCover.isTurret && this.targetCover.turret.user === this) {
            this.targetCover.turret.user = null;
        }

        this.timer        = 0.5 + Math.random();
        this.target       = null;
        this.targetCover  = null;
        this.scanBaseYaw  = this.isEnemy ? Math.PI : 0;
        this.shootDelay   = 0;
        this.searchTimer  = 0;
        this.suspicionTimer = 0;
        this.hasLastSeenPos = false;
        this.lastSeenPos    = new THREE.Vector3();
        this.lastSeenTarget = null;
        this.isBlindFiring  = false;
        this.trenchLevel  = Math.random() > 0.5 ? 'front' : 'back';
        this.crouchT      = 1.0;
        this.aimT         = 0.0;

        const team = this.isEnemy ? enemies : allies;
        let livingCount = 0;
        let advancers   = 0;
        for (let i = 0; i < team.length; i++) {
            if (!team[i].dead && team[i] !== this) {
                livingCount++;
                if (team[i].isAdvancing) advancers++;
            }
        }
        livingCount++;
        this.isAdvancing    = (advancers / livingCount) < 0.5;
        this.coverTier      = 0;
        this.interruptedMove = false;

        this.pickCover(true);
        this.mesh.position.set(
            this.targetCover.x,
            getTerrainHeight(this.targetCover.x, this.targetCover.z),
            this.targetCover.z
        );
    }

    alert(attacker) {
        if (this.dead || !attacker || attacker.dead) return;

        if (!this.target || Math.random() < 0.8) {
            const isFriendlyFire      = !attacker.isPlayer && (attacker.isEnemy === this.isEnemy);
            const isPlayerShootingAlly = attacker.isPlayer && !this.isEnemy;
            if (!isFriendlyFire && !isPlayerShootingAlly) {
                this.target = attacker;
                this.rememberTarget(attacker, 1.0);
                const targetPos = this.getTargetAimPosition(attacker);
                this.scanBaseYaw = Math.atan2(targetPos.x - this.mesh.position.x, targetPos.z - this.mesh.position.z);
            }
        }

        if (this.state === 'moving') {
            this.state           = 'aiming';
            this.timer           = 0.4 + Math.random() * 0.4;
            this.shootDelay      = 0;
            this.interruptedMove = true;
        } else if (this.state === 'hidden' && Math.random() < 0.8) {
            this.state = 'popping';
            this.timer = 0.2;
        } else if (this.state === 'aiming' || this.state === 'shooting') {
            this.state = 'aiming';
            this.timer = 0.5 + Math.random();
        }
    }

    takeDamage(amount, attacker) {
        if (this.dead || this.hp <= 0) return;

        if (attacker && !attacker.isPlayer) {
            amount = AI_DAMAGE_FROM_AI;
        }

        this.hp -= amount;

        if (this.hp <= 0) {
            this.dead = true;
            if (this.targetCover && this.targetCover.isTurret && this.targetCover.turret.user === this) {
                this.targetCover.turret.user = null;
            }
            this.deathAnimT  = 0.0;
            this.corpseDelay = 2.0;
            this.timer       = 3 + Math.random() * 2;
            if (attacker === playerAI && this.isEnemy) {
                state.playerKills++;
                document.getElementById('kill-count-indicator').innerText = `Kills: ${state.playerKills}`;
            }
        } else if (attacker && !attacker.dead) {
            const isFriendlyFire      = !attacker.isPlayer && (attacker.isEnemy === this.isEnemy);
            const isPlayerShootingAlly = attacker.isPlayer && !this.isEnemy;
            if (!isFriendlyFire && !isPlayerShootingAlly) {
                this.alert(attacker);
            }
            if (this.state === 'aiming' || this.state === 'popping') this.timer += 0.2;
        }
    }

    update(dt) {
        if (this.dead) {
            if (this.deathAnimT < 1.0) {
                this.deathAnimT += dt * 3.0;
                if (this.deathAnimT > 1.0) this.deathAnimT = 1.0;
                this.mesh.rotation.x = this.deathAnimT * (-Math.PI / 2 + 0.1);
                this.bodyRoot.position.y = 0.85 - (this.crouchT * 0.45) - (this.deathAnimT * 0.6);
                this.rightArm.rotation.x += (0.1  - this.rightArm.rotation.x) * 10 * dt;
                this.leftArm.rotation.x  += (0.1  - this.leftArm.rotation.x)  * 10 * dt;
                this.rightArm.rotation.z += (0.2  - this.rightArm.rotation.z) * 10 * dt;
                this.leftArm.rotation.z  += (-0.2 - this.leftArm.rotation.z)  * 10 * dt;
                this.rightArm.rotation.y += (0    - this.rightArm.rotation.y) * 10 * dt;
                this.leftArm.rotation.y  += (0    - this.leftArm.rotation.y)  * 10 * dt;
                this.rightForearm.rotation.x += (0 - this.rightForearm.rotation.x) * 10 * dt;
                this.leftForearm.rotation.x  += (0 - this.leftForearm.rotation.x)  * 10 * dt;
                this.weaponGroup.position.lerp(new THREE.Vector3(0.2, -0.4, 0.1), 10 * dt);
                this.weaponGroup.rotation.x += (Math.PI/2 - this.weaponGroup.rotation.x) * 10 * dt;
                this.leftLeg.rotation.x   += (0 - this.leftLeg.rotation.x)   * 10 * dt;
                this.rightLeg.rotation.x  += (0 - this.rightLeg.rotation.x)  * 10 * dt;
                this.leftCalf.rotation.x  += (0 - this.leftCalf.rotation.x)  * 10 * dt;
                this.rightCalf.rotation.x += (0 - this.rightCalf.rotation.x) * 10 * dt;
                this.crouchT += (0 - this.crouchT) * 5 * dt;
                this.torso.rotation.x    = this.crouchT * 0.4;
                this.headGroup.rotation.x = -this.torso.rotation.x;
                this.mesh.position.y = getTerrainHeight(this.mesh.position.x, this.mesh.position.z);
            } else if (this.corpseDelay > 0) {
                this.corpseDelay -= dt;
            } else {
                if (this.mesh.visible) this.mesh.visible = false;
                this.timer -= dt;
                if (this.timer <= 0) {
                    if (state.gameMode === 'endless') {
                        this.respawn();
                    } else if (state.gameMode === 'elimination') {
                        if (this.isEnemy && state.enemyReserves > 0) {
                            state.enemyReserves--;
                            this.respawn();
                        } else if (!this.isEnemy && state.allyReserves > 0) {
                            state.allyReserves--;
                            this.respawn();
                        }
                    }
                }
            }
            return;
        }

        this.timer -= dt;
        this.suspicionTimer = Math.max(0, this.suspicionTimer - dt);
        this.searchTimer    = Math.max(0, this.searchTimer - dt);

        if (this.lastSeenTarget && this.lastSeenTarget.dead) {
            this.lastSeenTarget = null;
        }
        if (this.target && this.target.dead) {
            this.target = null;
        }
        if (this.suspicionTimer <= 0 && this.hasLastSeenPos) {
            this.clearMemory();
        }

        // Threat detection
        let closestThreat  = null;
        let closestDistSq  = 25;
        const myForward    = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mesh.rotation.y);
        const opposingForce = this.isEnemy ? [...allies, playerAI] : enemies;

        for (let i = 0; i < opposingForce.length; i++) {
            const threat = opposingForce[i];
            if (!threat.dead) {
                const tPos = threat.isPlayer ? playerRoot.position : threat.mesh.position;
                let perceivedDistSq = this.mesh.position.distanceToSquared(tPos);
                const toThreat = tPos.clone().sub(this.mesh.position).normalize();
                const dot      = myForward.dot(toThreat);
                const isExposed = threat.isPlayer ? !state.isCrouched : (threat.state === 'moving' || threat.crouchT < 0.5);
                if (dot > 0.5) perceivedDistSq *= 0.4;
                if (isExposed)  perceivedDistSq *= 0.4;
                if (perceivedDistSq < closestDistSq) {
                    closestDistSq = perceivedDistSq;
                    closestThreat = threat;
                }
            }
        }

        if (closestThreat && this.target !== closestThreat) {
            const exposure = this.calculateExposure(closestThreat);
            if (exposure > 0) {
                this.target = closestThreat;
                this.rememberTarget(closestThreat, exposure);
                const tPos = this.getTargetAimPosition(closestThreat);
                this.scanBaseYaw = Math.atan2(tPos.x - this.mesh.position.x, tPos.z - this.mesh.position.z);
                if (this.state === 'moving') this.interruptedMove = true;
                if (this.state !== 'using_turret') {
                    this.state      = 'aiming';
                    this.shootDelay = 0.2 + Math.random() * 0.2;
                }
            }
        }

        const targetVisible = this.target && !this.target.dead
            ? this.calculateExposure(this.target)
            : 0;
        if (targetVisible > 0) {
            this.rememberTarget(this.target, targetVisible);
        } else if (this.target && !this.target.dead && this.lastSeenTarget !== this.target) {
            this.rememberTarget(this.target, 0.35);
        }

        let targetCrouch = 0.0;
        let targetAim    = 0.0;

        switch (this.state) {

            case 'moving': {
                targetCrouch = 0.5;
                const moveSpeed = AI_MOVE_SPEED;
                let destX = this.targetCover.x;
                let destZ = this.targetCover.z;
                let curX  = this.mesh.position.x;
                let curZ  = this.mesh.position.z;
                let tempX = destX;
                let tempZ = destZ;

                const isHome  = (z) => Math.abs(z) >= 17;
                const isMid   = (z) => Math.abs(z) <= 5;
                const isPath  = (z) => Math.abs(z) > 5 && Math.abs(z) < 17;
                const getPathX = (x) => (Math.abs(x - (-40)) < Math.abs(x - 40)) ? -40 : 40;

                if (isHome(curZ) && !isHome(destZ)) {
                    let px = getPathX(curX);
                    if (Math.abs(curX - px) > 1.0) { tempX = px; tempZ = curZ; }
                    else                            { tempX = px; tempZ = destZ; }
                } else if (isMid(curZ) && !isMid(destZ)) {
                    let px = getPathX(curX);
                    if (Math.abs(curX - px) > 1.0) { tempX = px; tempZ = curZ; }
                    else                            { tempX = px; tempZ = destZ; }
                } else if (isPath(curZ)) {
                    if (isHome(destZ)) {
                        let safeZ = destZ > 0 ? 19.5 : -19.5;
                        if (Math.abs(destZ) > 26) safeZ = destZ > 0 ? 28 : -28;
                        if (Math.abs(curZ - safeZ) > 1.0) { tempX = curX; tempZ = safeZ; }
                        else                               { tempX = destX; tempZ = destZ; }
                    } else if (isMid(destZ)) {
                        if (Math.abs(curZ) > 1.0) { tempX = curX; tempZ = 0; }
                        else                      { tempX = destX; tempZ = destZ; }
                    }
                }

                let dx   = tempX - curX;
                let dz   = tempZ - curZ;
                let dist = Math.sqrt(dx*dx + dz*dz);
                let finalDx   = destX - curX;
                let finalDz   = destZ - curZ;
                let finalDist = Math.sqrt(finalDx*finalDx + finalDz*finalDz);

                if (finalDist < 0.2) {
                    if (this.targetCover && this.targetCover.isTurret) {
                        this.state = 'hidden';
                        this.timer = 0.1;
                    } else {
                        this.state = 'hidden';
                        this.timer = 0.2 + Math.random() * 0.3;
                    }
                } else {
                    if (dist < 0.1) { dx = finalDx; dz = finalDz; dist = finalDist; }
                    this.mesh.position.x += (dx/dist) * moveSpeed * dt;
                    this.mesh.position.z += (dz/dist) * moveSpeed * dt;
                    const targetYaw = Math.atan2(dx, dz);
                    let diff = targetYaw - this.mesh.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff >  Math.PI) diff -= Math.PI * 2;
                    this.mesh.rotation.y += diff * 10 * dt;
                }
                break;
            }

            case 'hidden':
                targetCrouch = 1.0;
                if (this.timer <= 0) {
                    if (this.targetCover && this.targetCover.isTurret) {
                        if (!this.targetCover.turret.user || this.targetCover.turret.user === this) {
                            this.state = 'using_turret';
                        } else {
                            this.pickCover();
                            this.state = 'moving';
                        }
                    } else if (this.hasSuspicion()) {
                        this.state = 'searching';
                        this.timer = AI_SEARCH_DURATION * (0.6 + Math.random() * 0.5);
                    } else if (this.isAdvancing && this.coverTier < 4 && !this.findTarget()) {
                        this.coverTier++;
                        this.pickCover();
                        this.state = 'moving';
                    } else {
                        this.state = 'popping';
                        this.timer = 0.3;
                    }
                }
                break;

            case 'using_turret': {
                targetCrouch = 0.0;
                targetAim    = 0.0;
                const t = this.targetCover.turret;
                if (!t || (t.user && t.user !== this)) {
                    this.state = 'hidden';
                    break;
                }
                t.user = this;

                this.mesh.position.x = t.mesh.position.x;
                this.mesh.position.z = t.mesh.position.z + (this.isEnemy ? 1.0 : -1.0);
                this.mesh.position.y = getTerrainHeight(this.mesh.position.x, this.mesh.position.z);

                if (t.isReloading || t.ammo <= 0) {
                    this.shootDelay = 0.5 + Math.random() * 0.5;
                    t.swivel.rotation.y    += (this.scanBaseYaw - t.swivel.rotation.y) * 2 * dt;
                    t.pitchGroup.rotation.x += (0 - t.pitchGroup.rotation.x) * 2 * dt;
                    this.mesh.rotation.y = t.swivel.rotation.y + Math.PI;
                } else if (this.target && !this.target.dead && this.checkLOS(this.target)) {
                    this.rememberTarget(this.target, this.calculateExposure(this.target));
                    let targetPos = new THREE.Vector3();
                    if (this.target.isPlayer) camera.getWorldPosition(targetPos);
                    else targetPos.copy(this.target.mesh.position);

                    const tx = targetPos.x - t.mesh.position.x;
                    const tz = targetPos.z - t.mesh.position.z;
                    let targetTurretYaw = Math.atan2(tx, tz) + Math.PI;

                    let aiYawDiff = targetTurretYaw - t.baseYaw;
                    while (aiYawDiff < -Math.PI) aiYawDiff += Math.PI * 2;
                    while (aiYawDiff >  Math.PI) aiYawDiff -= Math.PI * 2;
                    if (aiYawDiff >  Math.PI / 2) targetTurretYaw = t.baseYaw + Math.PI / 2;
                    if (aiYawDiff < -Math.PI / 2) targetTurretYaw = t.baseYaw - Math.PI / 2;

                    let tDiff = targetTurretYaw - t.swivel.rotation.y;
                    while (tDiff < -Math.PI) tDiff += Math.PI * 2;
                    while (tDiff >  Math.PI) tDiff -= Math.PI * 2;
                    t.swivel.rotation.y += tDiff * 5 * dt;

                    const tDist2d = Math.sqrt(tx*tx + tz*tz);
                    const ty      = targetPos.y - (t.mesh.position.y + 0.3);
                    const targetTurretPitch = Math.atan2(ty, tDist2d);
                    t.pitchGroup.rotation.x += (targetTurretPitch - t.pitchGroup.rotation.x) * 5 * dt;

                    this.mesh.rotation.y = t.swivel.rotation.y + Math.PI;

                    if (this.shootDelay <= 0) {
                        if (Math.abs(tDiff) < 0.2) {
                            shootTurret(t, this);
                            this.shootDelay = 1.8 + Math.random() * 0.4;
                        }
                    } else {
                        this.shootDelay -= dt;
                    }
                } else {
                    this.target = this.findTarget();
                    if (this.target) {
                        this.rememberTarget(this.target, 1.0);
                        const targetPos = this.getTargetAimPosition(this.target);
                        const tx = targetPos.x - t.mesh.position.x;
                        const tz = targetPos.z - t.mesh.position.z;
                        let targetTurretYaw = Math.atan2(tx, tz) + Math.PI;

                        let aiYawDiff = targetTurretYaw - t.baseYaw;
                        while (aiYawDiff < -Math.PI) aiYawDiff += Math.PI * 2;
                        while (aiYawDiff >  Math.PI) aiYawDiff -= Math.PI * 2;
                        if (aiYawDiff >  Math.PI / 2) targetTurretYaw = t.baseYaw + Math.PI / 2;
                        if (aiYawDiff < -Math.PI / 2) targetTurretYaw = t.baseYaw - Math.PI / 2;

                        let tDiff = targetTurretYaw - t.swivel.rotation.y;
                        while (tDiff < -Math.PI) tDiff += Math.PI * 2;
                        while (tDiff >  Math.PI) tDiff -= Math.PI * 2;
                        t.swivel.rotation.y += tDiff * 4 * dt;

                        const tDist2d = Math.sqrt(tx * tx + tz * tz);
                        const ty      = targetPos.y - (t.mesh.position.y + 0.3);
                        const targetTurretPitch = Math.atan2(ty, tDist2d);
                        t.pitchGroup.rotation.x += (targetTurretPitch - t.pitchGroup.rotation.x) * 4 * dt;

                        if (this.shootDelay <= 0) {
                            if (Math.abs(tDiff) < 0.2) {
                                shootTurret(t, this);
                                this.shootDelay = 1.8 + Math.random() * 0.4;
                            }
                        } else {
                            this.shootDelay -= dt;
                        }
                    } else if (this.hasSuspicion()) {
                        const memoryPos = this.getSearchAimPosition();
                        const tx = memoryPos.x - t.mesh.position.x;
                        const tz = memoryPos.z - t.mesh.position.z;
                        let targetTurretYaw = Math.atan2(tx, tz) + Math.PI;

                        let aiYawDiff = targetTurretYaw - t.baseYaw;
                        while (aiYawDiff < -Math.PI) aiYawDiff += Math.PI * 2;
                        while (aiYawDiff >  Math.PI) aiYawDiff -= Math.PI * 2;
                        if (aiYawDiff >  Math.PI / 2) targetTurretYaw = t.baseYaw + Math.PI / 2;
                        if (aiYawDiff < -Math.PI / 2) targetTurretYaw = t.baseYaw - Math.PI / 2;

                        let tDiff = targetTurretYaw - t.swivel.rotation.y;
                        while (tDiff < -Math.PI) tDiff += Math.PI * 2;
                        while (tDiff >  Math.PI) tDiff -= Math.PI * 2;
                        t.swivel.rotation.y += tDiff * 3 * dt;

                        const tDist2d = Math.sqrt(tx * tx + tz * tz);
                        const ty      = memoryPos.y - (t.mesh.position.y + 0.3);
                        const targetTurretPitch = Math.atan2(ty, tDist2d);
                        t.pitchGroup.rotation.x += (targetTurretPitch - t.pitchGroup.rotation.x) * 3 * dt;

                        if (this.shootDelay <= 0 && Math.abs(tDiff) < 0.12 && Math.random() < AI_BLIND_FIRE_CHANCE * 0.4) {
                            shootTurret(t, this);
                            this.shootDelay = 1.8 + Math.random() * 0.4;
                        } else if (this.shootDelay > 0) {
                            this.shootDelay -= dt;
                        }
                    } else {
                        if (this.shootDelay <= 0) this.shootDelay = 0.5 + Math.random() * 0.5;
                        else this.shootDelay -= dt;
                        t.swivel.rotation.y    += (this.scanBaseYaw - t.swivel.rotation.y) * 2 * dt;
                        t.pitchGroup.rotation.x += (0 - t.pitchGroup.rotation.x) * 2 * dt;
                    }

                    this.mesh.rotation.y = t.swivel.rotation.y + Math.PI;
                }
                break;
            }

            case 'popping':
                targetCrouch = 0.0;
                targetAim    = 1.0;
                if (this.target) this.aimAtTarget(dt);
                if (this.timer <= 0) {
                    this.state = 'aiming';
                    this.timer = 0.5 + Math.random() * 1.0;
                    if (!this.target || this.target.dead || !this.checkLOS(this.target)) {
                        this.target = this.findTarget();
                        if (this.target) this.rememberTarget(this.target, 1.0);
                    } else {
                        this.rememberTarget(this.target, this.calculateExposure(this.target));
                        this.shootDelay = 0.1 + Math.random() * 0.2;
                    }
                }
                break;

            case 'aiming':
                targetCrouch = 0.0;
                targetAim    = 1.0;
                if (this.target && !this.target.dead && this.checkLOS(this.target)) {
                    this.rememberTarget(this.target, this.calculateExposure(this.target));
                    this.aimAtTarget(dt);
                    if (this.shootDelay <= 0) {
                        this.state       = 'shooting';
                        this.shotsFired  = 0;
                        this.shotsToFire = 3 + Math.floor(Math.random() * 4);
                        this.isBlindFiring = false;
                        this.timer       = 0.1;
                    } else {
                        this.shootDelay -= dt;
                    }
                } else {
                    this.target     = this.findTarget();
                    if (this.target) {
                        this.rememberTarget(this.target, 1.0);
                        this.shootDelay = 0.1 + Math.random() * 0.2;
                    } else if (this.hasSuspicion()) {
                        this.aimAtPosition(this.getSearchAimPosition(), dt, 6.0);
                        if (this.timer <= 0) {
                            this.state = 'searching';
                            this.timer = AI_SEARCH_DURATION * (0.7 + Math.random() * 0.4);
                        }
                    } else {
                        this.shootDelay = 0.1 + Math.random() * 0.2;
                        this.mesh.rotation.y = this.scanBaseYaw + Math.sin(performance.now() * 0.002 + this.mesh.id) * 0.5;
                        if (this.timer <= 0) {
                            if (this.isAdvancing && this.coverTier < 4) {
                                this.coverTier++;
                                this.pickCover();
                                this.state = 'moving';
                            } else {
                                this.state = 'hidden';
                                this.timer = 0.5 + Math.random();
                            }
                        }
                    }
                }
                break;

            case 'searching':
                targetCrouch = 0.0;
                targetAim    = 1.0;
                this.target = this.findTarget();
                if (this.target) {
                    this.rememberTarget(this.target, 1.0);
                    this.state = 'aiming';
                    this.timer = 0.4 + Math.random() * 0.5;
                    this.shootDelay = 0.1 + Math.random() * 0.2;
                    break;
                }

                if (this.hasSuspicion()) {
                    this.aimAtPosition(this.getSearchAimPosition(), dt, 5.0);
                    if (this.timer <= 0) {
                        if (Math.random() < AI_BLIND_FIRE_CHANCE) {
                            this.state = 'shooting';
                            this.isBlindFiring = true;
                            this.shotsFired = 0;
                            this.shotsToFire = 1 + Math.floor(Math.random() * 2);
                            this.timer = 0.08 + Math.random() * 0.08;
                        } else {
                            this.timer = 0.25 + Math.random() * 0.35;
                        }
                    }
                } else {
                    this.isBlindFiring = false;
                    this.target = null;
                    if (this.isAdvancing && this.coverTier < 4 && Math.random() < 0.6) {
                        this.coverTier++;
                        this.pickCover();
                        this.state = 'moving';
                    } else {
                        this.state = 'hidden';
                        this.timer = 0.4 + Math.random() * 0.4;
                    }
                }
                break;

            case 'shooting':
                targetCrouch = 0.0;
                targetAim    = 1.0;
                if (!this.isBlindFiring && (!this.target || this.target.dead || !this.checkLOS(this.target))) {
                    if (!this.hasSuspicion()) {
                        this.state = 'hidden';
                        this.timer = 0.5 + Math.random();
                        break;
                    }
                    this.isBlindFiring = true;
                }

                if (this.isBlindFiring) {
                    if (!this.hasSuspicion()) {
                        this.isBlindFiring = false;
                        this.state = 'hidden';
                        this.timer = 0.5 + Math.random();
                        break;
                    }
                    this.aimAtPosition(this.getSearchAimPosition(), dt, 6.0);
                } else {
                    this.rememberTarget(this.target, this.calculateExposure(this.target));
                    this.aimAtTarget(dt);
                }

                if (this.timer <= 0) {
                    if (this.isBlindFiring) this.shoot(this.getBlindFireAimPosition(), 2.5);
                    else this.shoot();
                    this.shotsFired++;
                    this.timer = 0.15 + Math.random() * 0.15;
                    if (this.shotsFired >= this.shotsToFire) {
                        this.isBlindFiring = false;
                        if (this.interruptedMove) {
                            this.interruptedMove = false;
                            this.state = 'moving';
                        } else if (this.isAdvancing && this.coverTier < 4 && Math.random() < 0.95) {
                            this.coverTier++;
                            this.pickCover();
                            this.state = 'moving';
                        } else if (this.isAdvancing && Math.random() < 0.2) {
                            this.pickCover();
                            this.state = 'moving';
                        } else {
                            if (!this.isAdvancing) {
                                const team = this.isEnemy ? enemies : allies;
                                let living = 0, adv = 0;
                                team.forEach(s => { if (!s.dead) { living++; if (s.isAdvancing) adv++; } });
                                if (adv / living < 0.5) this.isAdvancing = true;
                            }
                            if (this.hasSuspicion()) {
                                this.state = 'searching';
                                this.timer = 0.35 + Math.random() * 0.4;
                            } else {
                                this.state = 'hidden';
                                this.timer = 0.5 + Math.random() * 1.0;
                            }
                        }
                    }
                }
                break;
        }

        // Crouch/aim blend
        this.crouchT += (targetCrouch - this.crouchT) * 10 * dt;
        this.aimT    += (targetAim    - this.aimT)    * 12 * dt;

        this.bodyRoot.position.y  = 0.85 - (this.crouchT * 0.45);
        this.torso.rotation.x     = this.crouchT * 0.4;
        this.headGroup.rotation.x = -this.torso.rotation.x;

        // Walk animation
        let legSwing = 0;
        let armSwing = 0;
        if (this.state === 'moving') {
            this.walkTime += dt * 10;
            legSwing = Math.sin(this.walkTime) * 0.6;
            armSwing = Math.sin(this.walkTime) * 0.3;
        } else {
            this.walkTime = 0;
        }

        const squatThighRot = -1.2 * this.crouchT;
        const squatCalfRot  =  2.0 * this.crouchT;
        this.leftLeg.rotation.z  =  0.15 * this.crouchT;
        this.rightLeg.rotation.z = -0.15 * this.crouchT;
        this.leftLeg.rotation.x  = squatThighRot + legSwing;
        this.leftCalf.rotation.x = squatCalfRot;
        if (legSwing < 0) this.leftCalf.rotation.x += legSwing * -0.5;
        this.rightLeg.rotation.x  = squatThighRot - legSwing;
        this.rightCalf.rotation.x = squatCalfRot;
        if (legSwing > 0) this.rightCalf.rotation.x += -legSwing * -0.5;

        // Weapon & arm kinematics
        const idleGunPos = new THREE.Vector3(0.05, -0.15, 0.35);
        const idleGunRot = new THREE.Euler(0.4, 0.5, -0.1);
        const aimGunPos  = new THREE.Vector3(0.12, 0.15, -0.05);
        const aimGunRot  = new THREE.Euler(0, 0, 0);

        this.weaponGroup.position.lerpVectors(idleGunPos, aimGunPos, this.aimT);
        this.weaponGroup.rotation.set(
            idleGunRot.x + (aimGunRot.x - idleGunRot.x) * this.aimT,
            idleGunRot.y + (aimGunRot.y - idleGunRot.y) * this.aimT,
            idleGunRot.z + (aimGunRot.z - idleGunRot.z) * this.aimT
        );
        if (this.state === 'moving') {
            this.weaponGroup.position.y += Math.sin(this.walkTime * 2) * 0.02;
            this.weaponGroup.rotation.x += Math.sin(this.walkTime) * 0.05;
        }

        const idleRArm    = new THREE.Euler(-0.4, -0.2,  0.1);
        const aimRArm     = new THREE.Euler(-1.2, -0.2,  0.3);
        const idleRForearm = new THREE.Euler(-0.6,  0,    0);
        const aimRForearm  = new THREE.Euler(-2.4,  0,    0);
        const idleLArm    = new THREE.Euler(-0.3,  0.4, -0.2);
        const aimLArm     = new THREE.Euler(-1.4,  0.8,  0);
        const idleLForearm = new THREE.Euler(-1.2,  0,    0);
        const aimLForearm  = new THREE.Euler(-0.2,  0,    0);

        this.rightArm.rotation.set(
            idleRArm.x + (aimRArm.x - idleRArm.x) * this.aimT + (armSwing * (1 - this.aimT)),
            idleRArm.y + (aimRArm.y - idleRArm.y) * this.aimT,
            idleRArm.z + (aimRArm.z - idleRArm.z) * this.aimT
        );
        this.rightForearm.rotation.x = idleRForearm.x + (aimRForearm.x - idleRForearm.x) * this.aimT;

        this.leftArm.rotation.set(
            idleLArm.x + (aimLArm.x - idleLArm.x) * this.aimT - (armSwing * (1 - this.aimT)),
            idleLArm.y + (aimLArm.y - idleLArm.y) * this.aimT,
            idleLArm.z + (aimLArm.z - idleLArm.z) * this.aimT
        );
        this.leftForearm.rotation.x = idleLForearm.x + (aimLForearm.x - idleLForearm.x) * this.aimT;

        // Peer separation
        const peers = this.isEnemy ? enemies : allies;
        peers.forEach(peer => {
            if (peer !== this && !peer.dead) {
                const cdx = this.mesh.position.x - peer.mesh.position.x;
                const cdz = this.mesh.position.z - peer.mesh.position.z;
                const distSq = cdx*cdx + cdz*cdz;
                if (distSq < 0.64 && distSq > 0.0001) {
                    const cDist   = Math.sqrt(distSq);
                    const overlap = AI_PEER_SEPARATION - cDist;
                    let nx = cdx / cDist;
                    let nz = cdz / cDist;
                    let tx = -nz;
                    let tz = nx;
                    this.mesh.position.x += (nx * 0.6 + tx * 0.8) * overlap * 5 * dt;
                    this.mesh.position.z += (nz * 0.6 + tz * 0.8) * overlap * 5 * dt;
                }
            }
        });

        // Obstacle collision
        let aiPos2D = { x: this.mesh.position.x, z: this.mesh.position.z };
        resolveObstacles(aiPos2D, 0.4);
        this.mesh.position.x = aiPos2D.x;
        this.mesh.position.z = aiPos2D.z;

        // Z-axis bounds by tier
        let minZ, maxZ;
        if (this.isEnemy) {
            if (this.coverTier === 4)          { minZ = -36.2; maxZ = 36.2; }
            else if (this.coverTier === 3)     { minZ = -22.0; maxZ = 36.2; }
            else if (this.coverTier > 0)       { minZ =  -5.0; maxZ = 36.2; }
            else if (this.trenchLevel === 'front') { minZ = 18.2; maxZ = 21.8; }
            else                               { minZ = 26.8;  maxZ = 36.2; }
        } else {
            if (this.coverTier === 4)          { minZ = -36.2; maxZ = 36.2; }
            else if (this.coverTier === 3)     { minZ = -36.2; maxZ = 22.0; }
            else if (this.coverTier > 0)       { minZ = -36.2; maxZ =  5.0; }
            else if (this.trenchLevel === 'front') { minZ = -21.8; maxZ = -18.2; }
            else                               { minZ = -36.2; maxZ = -26.8; }
        }
        this.mesh.position.z = Math.max(minZ, Math.min(maxZ, this.mesh.position.z));

        // Snap to cover when stationary
        if (this.state !== 'moving' && this.state !== 'using_turret' && this.targetCover && !this.targetCover.isTurret) {
            this.mesh.position.x += (this.targetCover.x - this.mesh.position.x) * 2 * dt;
            this.mesh.position.z += (this.targetCover.z - this.mesh.position.z) * 2 * dt;
        }

        this.mesh.position.y = getTerrainHeight(this.mesh.position.x, this.mesh.position.z);
    }

    calculateExposure(target) {
        const heightOffset  = 1.55 - (this.crouchT * 0.45);
        const eyeStart      = this.mesh.position.clone().add(new THREE.Vector3(0, heightOffset, 0));
        const pointsToCheck = [];

        if (target.isPlayer) {
            const base   = playerRoot.position.clone();
            const pProne = state.isProne || state.slideTimer > 0;
            pointsToCheck.push(base.clone().add(new THREE.Vector3(0, pProne ? 0.3  : (state.isCrouched ? 0.8 : 1.5), 0)));
            pointsToCheck.push(base.clone().add(new THREE.Vector3(0, pProne ? 0.15 : (state.isCrouched ? 0.4 : 1.0), 0)));
            pointsToCheck.push(base.clone().add(new THREE.Vector3(0, 0.2, 0)));
        } else {
            const base    = target.mesh.position.clone();
            const cOffset = target.crouchT * 0.45;
            pointsToCheck.push(base.clone().add(new THREE.Vector3(0, 1.55 - cOffset, 0)));
            pointsToCheck.push(base.clone().add(new THREE.Vector3(0, 1.0  - (cOffset * 0.5), 0)));
            pointsToCheck.push(base.clone().add(new THREE.Vector3(0, 0.3, 0)));
        }

        let hits = 0;
        for (let pt of pointsToCheck) {
            const dir  = pt.clone().sub(eyeStart).normalize();
            const dist = eyeStart.distanceTo(pt);
            raycaster.set(eyeStart, dir);
            const intersects = raycaster.intersectObjects(worldMeshes, false);
            if (!(intersects.length > 0 && intersects[0].distance < dist)) hits++;
        }
        return hits / pointsToCheck.length;
    }

    checkLOS(target) {
        return this.calculateExposure(target) > 0;
    }

    findTarget() {
        let targets = this.isEnemy ? [...allies, playerAI] : enemies;
        targets = targets.filter(t => !t.dead && t.hp > 0);
        if (targets.length === 0) return null;

        const myPos     = this.mesh.position;
        const myForward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mesh.rotation.y);
        let bestTarget  = null;
        let bestScore   = Infinity;

        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            const tPos   = target.isPlayer ? playerRoot.position : target.mesh.position;
            let score    = tPos.distanceToSquared(myPos);
            if (score > 10000) continue;
            const exposure = this.calculateExposure(target);
            if (exposure === 0) continue;
            const toTarget = tPos.clone().sub(myPos).normalize();
            const dot      = myForward.dot(toTarget);
            if (dot > 0.5)  score *= 0.3;
            else if (dot < 0) score *= 2.5;
            score /= exposure;
            score *= (0.8 + Math.random() * 0.4);
            if (score < bestScore) { bestScore = score; bestTarget = target; }
        }
        return bestTarget;
    }

    getTargetAimPosition(target) {
        const targetPos = new THREE.Vector3();
        if (target.isPlayer) {
            camera.getWorldPosition(targetPos);
            targetPos.y -= 0.2;
        } else {
            const targetHeightOffset = 1.55 - (target.crouchT * 0.45);
            targetPos.copy(target.mesh.position).add(new THREE.Vector3(0, targetHeightOffset, 0));
        }
        return targetPos;
    }

    rememberTarget(target, exposure = 1.0) {
        if (!target || target.dead) return;
        this.lastSeenPos.copy(this.getTargetAimPosition(target));
        this.hasLastSeenPos = true;
        this.lastSeenTarget = target;
        this.suspicionTimer = Math.max(this.suspicionTimer, AI_MEMORY_DURATION * (0.65 + (exposure * 0.5)));
        this.searchTimer    = Math.max(this.searchTimer, AI_SEARCH_DURATION * (0.6 + Math.random() * 0.5));
        this.scanBaseYaw = Math.atan2(this.lastSeenPos.x - this.mesh.position.x, this.lastSeenPos.z - this.mesh.position.z);
    }

    clearMemory() {
        this.hasLastSeenPos = false;
        this.suspicionTimer = 0;
        this.searchTimer    = 0;
        this.lastSeenTarget = null;
        if (this.target && (!this.target.dead) && this.checkLOS(this.target)) return;
        this.target = null;
    }

    hasSuspicion() {
        return this.hasLastSeenPos && this.suspicionTimer > 0;
    }

    getSearchAimPosition() {
        if (!this.hasSuspicion()) return null;
        const scanPos = this.lastSeenPos.clone();
        const sweep = Math.sin(performance.now() * 0.004 + this.mesh.id * 0.37);
        scanPos.x += sweep * 0.8;
        scanPos.z += Math.cos(performance.now() * 0.003 + this.mesh.id * 0.19) * 0.35;
        scanPos.y += Math.sin(performance.now() * 0.003 + this.mesh.id * 0.11) * 0.1;
        return scanPos;
    }

    getBlindFireAimPosition() {
        const blindPos = this.getSearchAimPosition();
        if (!blindPos) return null;
        blindPos.x += (Math.random() - 0.5) * 1.4;
        blindPos.y += (Math.random() - 0.5) * 0.3;
        blindPos.z += (Math.random() - 0.5) * 1.0;
        return blindPos;
    }

    aimAtPosition(targetPos, dt, turnSpeed = 8.0) {
        if (!targetPos) return;
        const targetYaw = Math.atan2(targetPos.x - this.mesh.position.x, targetPos.z - this.mesh.position.z);
        let diff = targetYaw - this.mesh.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        this.mesh.rotation.y += diff * turnSpeed * dt;
    }

    aimAtTarget(dt) {
        if (!this.target) return;
        this.aimAtPosition(this.getTargetAimPosition(this.target), dt);
    }

    shoot(aimPos = null, spreadMultiplier = 1.0) {
        if (!aimPos && (!this.target || this.target.dead)) return;
        const heightOffset = 1.55 - (this.crouchT * 0.45);
        const eyeStart     = this.mesh.position.clone().add(new THREE.Vector3(0, heightOffset, 0));

        this.weaponGroup.updateMatrixWorld(true);
        const visualStart = new THREE.Vector3(0, 0, 0.9).applyMatrix4(this.weaponGroup.matrixWorld);

        const targetPos = aimPos ? aimPos.clone() : this.getTargetAimPosition(this.target);

        const dir  = targetPos.clone().sub(eyeStart).normalize();
        const dist = eyeStart.distanceTo(targetPos);

        let spread = (0.05 + (dist * 0.002)) * spreadMultiplier;
        if (this.target && !this.target.isPlayer && !aimPos) spread *= 8.0;
        dir.x += (Math.random() - 0.5) * spread;
        dir.y += (Math.random() - 0.5) * spread;
        dir.z += (Math.random() - 0.5) * spread;
        dir.normalize();

        showMuzzleFlash(visualStart, dir);
        raycaster.set(eyeStart, dir);

        if (this.shotsFired % 4 === 0) {
            playPositionalSound(visualStart, 'gunshot');
        }

        const hitTargets = [playerAI.mesh, ...allies.map(a => a.mesh), ...enemies.map(e => e.mesh)];
        const intersects = raycaster.intersectObjects([...worldMeshes, ...hitTargets], true);

        let hitDistance = 200;
        if (intersects.length > 0) {
            const hit   = intersects[0];
            hitDistance = hit.distance;
            playPositionalSound(hit.point, 'impact');
            if (hit.object.userData.ai) {
                const hitAI = hit.object.userData.ai;
                if (hitAI.isPlayer) hitAI.takeDamage(1, this);
                else hitAI.takeDamage(hit.object.name === "head" ? 99 : 1, this);
            } else {
                let normal = new THREE.Vector3(0, 1, 0);
                if (hit.face) normal.copy(hit.face.normal).applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
                createImpact(hit.point, normal);
                if (Math.random() < 0.3) {
                    let reflection = dir.clone().sub(normal.clone().multiplyScalar(2 * dir.dot(normal))).normalize();
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

        if (Math.random() < 0.25) createTracer(visualStart, dir, hitDistance);

        const bulletRay = new THREE.Ray(eyeStart, dir);
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
                const distAlongRay = eyeStart.distanceTo(closestPt);
                if (distAlongRay < hitDistance + 1.0) {
                    const distSq = closestPt.distanceToSquared(pos);
                    if (!t.isPlayer) {
                        if (distSq < 16.0) t.alert(this);
                    } else {
                        if (distSq < 2.0) playNearMissSound();
                    }
                }
            }
        });
    }
}

export function spawnSoldiers(count) {
    allies.forEach(a => scene.remove(a.mesh));
    enemies.forEach(e => scene.remove(e.mesh));
    allies.length  = 0;
    enemies.length = 0;
    for (let i = 0; i < count; i++) {
        allies.push(new AI(false));
        enemies.push(new AI(true));
    }
}
