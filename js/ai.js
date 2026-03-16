// ================================================================
// AI SYSTEM
// ================================================================

import { AI_MOVE_SPEED, AI_DAMAGE_FROM_AI, AI_PEER_SEPARATION } from './config.js';
import { state, allies, enemies } from './state.js';
import { scene, camera } from './scene.js';
import { playPositionalSound, playSoundFile, playNearMissSound } from './audio.js';
import { worldMeshes, getTerrainHeight, resolveObstacles,
         allyCoversFront, allyCoversMiddle, allyCoversBack,
         enemyCoversFront, enemyCoversMiddle, enemyCoversBack,
         allyPathCovers, enemyPathCovers, midCoversAlly, midCoversEnemy,
         HOME_TRENCH_LEVELS, FRONT_TRENCH, FRONT_LIP_BAND, MIDDLE_TRENCH, MIDDLE_EXIT_BAND,
         BACK_TRENCH, CONNECTOR_PLATEAU,
         PLAYABLE_HALF_DEPTH, WALL_GAP_CENTERS, RAMP_GAP_CENTERS,
         getHomeTrenchBounds, getHomeTrenchCovers } from './world.js';
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

    getHomeCovers(level) {
        return getHomeTrenchCovers(this.isEnemy, level);
    }

    getEnemyHomeCovers(level) {
        return getHomeTrenchCovers(!this.isEnemy, level);
    }

    chooseDefensiveTrenchLevel() {
        const peers = this.isEnemy ? enemies : allies;
        const occupancy = HOME_TRENCH_LEVELS.map(level => ({
            level,
            count: peers.filter(peer => {
                if (peer === this || peer.dead || peer.isAdvancing) return false;
                return (peer.homeAssignment || peer.trenchLevel) === level;
            }).length,
        }));

        const minCount = Math.min(...occupancy.map(entry => entry.count));
        const choices = occupancy.filter(entry => entry.count === minCount).map(entry => entry.level);
        return choices[Math.floor(Math.random() * choices.length)];
    }

    getNextHomeTrenchLevel() {
        if (this.trenchLevel === 'back') return 'middle';
        if (this.trenchLevel === 'middle') return 'front';
        return null;
    }

    advanceToNextCover() {
        if (this.coverTier === 0) {
            const nextHomeLevel = this.getNextHomeTrenchLevel();
            if (nextHomeLevel) {
                this.trenchLevel = nextHomeLevel;
            } else {
                this.coverTier = 1;
            }
        } else if (this.coverTier < 5) {
            this.coverTier++;
        } else {
            return false;
        }

        this.pickCover();
        this.state = 'moving';
        return true;
    }

    getDesiredCovers() {
        if (this.isEnemy) {
            if (this.coverTier === 1) return enemyPathCovers;
            if (this.coverTier === 2) return midCoversEnemy;
            if (this.coverTier === 3) return allyCoversFront;
            if (this.coverTier === 4) return allyCoversMiddle;
            if (this.coverTier === 5) return allyCoversBack;
            return this.getHomeCovers(this.trenchLevel);
        } else {
            if (this.coverTier === 1) return allyPathCovers;
            if (this.coverTier === 2) return midCoversAlly;
            if (this.coverTier === 3) return enemyCoversFront;
            if (this.coverTier === 4) return enemyCoversMiddle;
            if (this.coverTier === 5) return enemyCoversBack;
            return this.getHomeCovers(this.trenchLevel);
        }
    }

    pickCover(isSpawning = false) {
        const peers = this.isEnemy ? enemies : allies;
        const isFriendlyTurretUser = (turretUser) => (
            turretUser &&
            !turretUser.dead &&
            (this.isEnemy ? turretUser.isEnemy : !turretUser.isEnemy)
        );

        const isCoverClaimed = (cover) => {
            if (cover.isTurret && cover.turret.user && cover.turret.user !== this && !cover.turret.user.dead) return true;
            return peers.some(peer => peer !== this && !peer.dead && peer.targetCover === cover);
        };

        const chooseCover = (covers, preferHidden = false) => {
            let available = covers.filter(cover => !isCoverClaimed(cover));
            if (available.length === 0) return null;

            if (preferHidden) {
                const hidden = available.filter(cover => !isSpotVisibleToPlayer(cover));
                if (hidden.length > 0) available = hidden;
            }

            return available[Math.floor(Math.random() * available.length)];
        };

        const chooseLeastOccupied = (covers, preferHidden = false) => {
            let pool = covers.filter(cover => !(cover.isTurret && cover.turret.user && cover.turret.user !== this && !cover.turret.user.dead));
            if (pool.length === 0) return null;

            if (preferHidden) {
                const hidden = pool.filter(cover => !isSpotVisibleToPlayer(cover));
                if (hidden.length > 0) pool = hidden;
            }

            const occupancy = pool.map(cover => ({
                cover,
                count: peers.filter(peer => peer !== this && !peer.dead && peer.targetCover === cover).length,
            }));
            const minCount = Math.min(...occupancy.map(entry => entry.count));
            const best = occupancy.filter(entry => entry.count === minCount).map(entry => entry.cover);
            return best[Math.floor(Math.random() * best.length)];
        };

        const setChosenCover = (cover, trenchLevelOverride = null) => {
            if (!cover) return false;
            this.targetCover = cover;
            if (trenchLevelOverride) this.trenchLevel = trenchLevelOverride;
            else if (cover.trenchLevel) this.trenchLevel = cover.trenchLevel;
            return true;
        };

        if (!this.isAdvancing) {
            if (!this.homeAssignment) this.homeAssignment = this.chooseDefensiveTrenchLevel();

            const turretLevels = isSpawning ? ['back'] : ['back', 'middle'];
            const homeTurrets = turretLevels.flatMap(level => this.getHomeCovers(level).filter(cover => cover.isTurret));
            const friendlyOnTurret = homeTurrets.some(cover => (
                isFriendlyTurretUser(cover.turret.user) ||
                peers.some(peer => peer !== this && !peer.dead && peer.targetCover === cover)
            ));

            if (!friendlyOnTurret) {
                const turretChoice = chooseCover(homeTurrets, isSpawning);
                if (setChosenCover(turretChoice)) {
                    this.coverTier = 0;
                    return;
                }
            }

            const spawnOrder = this.homeAssignment === 'front'
                ? ['front', 'back', 'middle']
                : (this.homeAssignment === 'back' ? ['back', 'front', 'middle'] : ['back', 'front', 'middle']);

            if (isSpawning) {
                for (const level of spawnOrder) {
                    const choice = chooseCover(this.getHomeCovers(level), true);
                    if (setChosenCover(choice, level)) {
                        this.coverTier = 0;
                        return;
                    }
                }

                const fallbackSpawn = chooseLeastOccupied(
                    spawnOrder.flatMap(level => this.getHomeCovers(level)),
                    true
                );
                if (setChosenCover(fallbackSpawn)) {
                    this.coverTier = 0;
                    return;
                }
            } else {
                const preferredLevels = [this.homeAssignment, ...HOME_TRENCH_LEVELS.filter(level => level !== this.homeAssignment)];
                for (const level of preferredLevels) {
                    const choice = chooseCover(this.getHomeCovers(level));
                    if (setChosenCover(choice, level)) {
                        this.coverTier = 0;
                        return;
                    }
                }

                const fallbackHome = chooseLeastOccupied(
                    preferredLevels.flatMap(level => this.getHomeCovers(level))
                );
                if (setChosenCover(fallbackHome)) {
                    this.coverTier = 0;
                    return;
                }
            }

            this.isAdvancing   = true;
            this.homeAssignment = null;
            this.coverTier     = 0;
        }

        if (isSpawning && this.coverTier === 0) {
            const preferredSpawnLevels = this.trenchLevel === 'front'
                ? ['front', 'back', 'middle']
                : ['back', 'front', 'middle'];

            for (const level of preferredSpawnLevels) {
                const choice = chooseCover(this.getHomeCovers(level), true);
                if (setChosenCover(choice, level)) return;
            }

            const fallbackSpawn = chooseLeastOccupied(
                preferredSpawnLevels.flatMap(level => this.getHomeCovers(level)),
                true
            );
            if (setChosenCover(fallbackSpawn)) return;
        }

        const covers = this.getDesiredCovers();
        const choice = chooseCover(covers, isSpawning);
        if (setChosenCover(choice)) return;

        setChosenCover(chooseLeastOccupied(covers, isSpawning));
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
        this.trenchLevel  = Math.random() > 0.5 ? 'front' : 'back';
        this.homeAssignment = null;
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
        if (!this.isAdvancing) this.homeAssignment = this.chooseDefensiveTrenchLevel();

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
                let targetPos = attacker.isPlayer
                    ? camera.getWorldPosition(new THREE.Vector3())
                    : attacker.mesh.position.clone();
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
            if (this.calculateExposure(closestThreat) > 0) {
                this.target = closestThreat;
                const tPos = closestThreat.isPlayer
                    ? camera.getWorldPosition(new THREE.Vector3())
                    : closestThreat.mesh.position.clone();
                this.scanBaseYaw = Math.atan2(tPos.x - this.mesh.position.x, tPos.z - this.mesh.position.z);
                if (this.state === 'moving') this.interruptedMove = true;
                if (this.state !== 'using_turret') {
                    this.state      = 'aiming';
                    this.shootDelay = 0.2 + Math.random() * 0.2;
                }
            }
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

                const absCurZ = Math.abs(curZ);
                const absDestZ = Math.abs(destZ);
                const currentSide = curZ >= 0 ? 1 : -1;
                const destSide = destZ >= 0 ? 1 : -1;
                const nearestWallGapX = WALL_GAP_CENTERS.reduce((best, gapX) => (
                    Math.abs(curX - gapX) < Math.abs(curX - best) ? gapX : best
                ), WALL_GAP_CENTERS[0]);
                const nearestRampGapX = RAMP_GAP_CENTERS.reduce((best, gapX) => (
                    Math.abs(curX - gapX) < Math.abs(curX - best) ? gapX : best
                ), RAMP_GAP_CENTERS[0]);
                const isHome  = (z) => Math.abs(z) >= FRONT_TRENCH.wallAbsZ;
                const isMid   = (z) => Math.abs(z) <= 5;
                const isPath  = (z) => Math.abs(z) > 5 && Math.abs(z) < FRONT_TRENCH.wallAbsZ;
                const targetZone = this.targetCover.zone || (this.targetCover.trenchLevel ? 'home' : null);

                if (targetZone === 'home' && currentSide === destSide && absCurZ >= FRONT_TRENCH.wallAbsZ - 0.5) {
                    const side = destSide;
                    const targetLevel = this.targetCover.trenchLevel || this.trenchLevel;

                    if (targetLevel === 'front') {
                        if (absCurZ >= BACK_TRENCH.minAbsZ - 0.6) {
                            if (Math.abs(curX - nearestRampGapX) > 1.0) { tempX = nearestRampGapX; tempZ = curZ; }
                            else                                         { tempX = nearestRampGapX; tempZ = side * (MIDDLE_TRENCH.maxAbsZ - 0.4); }
                        } else if (absCurZ >= MIDDLE_TRENCH.minAbsZ - 0.6) {
                            if (Math.abs(curX - nearestRampGapX) > 1.0) { tempX = nearestRampGapX; tempZ = curZ; }
                            else                                         { tempX = nearestRampGapX; tempZ = side * CONNECTOR_PLATEAU.centerAbsZ; }
                        } else if (absCurZ > FRONT_TRENCH.maxAbsZ + 0.3) {
                            if (Math.abs(curX - nearestRampGapX) > 1.0) { tempX = nearestRampGapX; tempZ = curZ; }
                            else                                         { tempX = nearestRampGapX; tempZ = side * FRONT_TRENCH.coverAbsZ; }
                        }
                    } else if (targetLevel === 'middle') {
                        if (absCurZ <= FRONT_TRENCH.maxAbsZ + 0.3) {
                            if (Math.abs(curX - nearestRampGapX) > 1.0) { tempX = nearestRampGapX; tempZ = curZ; }
                            else                                         { tempX = nearestRampGapX; tempZ = side * CONNECTOR_PLATEAU.centerAbsZ; }
                        } else if (absCurZ < MIDDLE_TRENCH.minAbsZ - 0.3) {
                            if (Math.abs(curX - nearestRampGapX) > 1.0) { tempX = nearestRampGapX; tempZ = curZ; }
                            else                                         { tempX = nearestRampGapX; tempZ = side * MIDDLE_TRENCH.coverAbsZ; }
                        } else if (absCurZ >= BACK_TRENCH.minAbsZ - 0.6) {
                            if (Math.abs(curX - nearestRampGapX) > 1.0) { tempX = nearestRampGapX; tempZ = curZ; }
                            else                                         { tempX = nearestRampGapX; tempZ = side * (MIDDLE_TRENCH.maxAbsZ - 0.4); }
                        }
                    } else if (targetLevel === 'back') {
                        if (absCurZ <= FRONT_TRENCH.maxAbsZ + 0.3) {
                            if (Math.abs(curX - nearestRampGapX) > 1.0) { tempX = nearestRampGapX; tempZ = curZ; }
                            else                                         { tempX = nearestRampGapX; tempZ = side * CONNECTOR_PLATEAU.centerAbsZ; }
                        } else if (absCurZ < MIDDLE_TRENCH.minAbsZ - 0.3) {
                            if (Math.abs(curX - nearestRampGapX) > 1.0) { tempX = nearestRampGapX; tempZ = curZ; }
                            else                                         { tempX = nearestRampGapX; tempZ = side * MIDDLE_TRENCH.coverAbsZ; }
                        } else if (absCurZ <= MIDDLE_TRENCH.maxAbsZ + 0.6) {
                            if (Math.abs(curX - nearestRampGapX) > 1.0) { tempX = nearestRampGapX; tempZ = curZ; }
                            else                                         { tempX = nearestRampGapX; tempZ = side * (MIDDLE_EXIT_BAND.endAbsZ + 0.2); }
                        }
                    }
                } else if (isHome(curZ) && !isHome(destZ)) {
                    if (Math.abs(curX - nearestWallGapX) > 1.0) { tempX = nearestWallGapX; tempZ = curZ; }
                    else                                         { tempX = nearestWallGapX; tempZ = destZ; }
                } else if (isMid(curZ) && !isMid(destZ)) {
                    if (Math.abs(curX - nearestWallGapX) > 1.0) { tempX = nearestWallGapX; tempZ = curZ; }
                    else                                         { tempX = nearestWallGapX; tempZ = destZ; }
                } else if (isPath(curZ)) {
                    if (isHome(destZ)) {
                        const safeZ = destZ > 0 ? FRONT_TRENCH.coverAbsZ + 1.0 : -(FRONT_TRENCH.coverAbsZ + 1.0);
                        if (Math.abs(curZ - safeZ) > 1.0) { tempX = curX; tempZ = safeZ; }
                        else                              { tempX = destX; tempZ = destZ; }
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
                    } else if (!this.isAdvancing && this.homeAssignment && this.trenchLevel !== this.homeAssignment) {
                        this.trenchLevel = this.homeAssignment;
                        this.pickCover();
                        this.state = 'moving';
                    } else if (this.isAdvancing && !this.findTarget() && this.advanceToNextCover()) {
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
                    this.target     = this.findTarget();
                    this.shootDelay = 0.5 + Math.random() * 0.5;
                    t.swivel.rotation.y    += (this.scanBaseYaw - t.swivel.rotation.y) * 2 * dt;
                    t.pitchGroup.rotation.x += (0 - t.pitchGroup.rotation.x) * 2 * dt;
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
                    } else {
                        this.shootDelay = 0.1 + Math.random() * 0.2;
                    }
                }
                break;

            case 'aiming':
                targetCrouch = 0.0;
                targetAim    = 1.0;
                if (this.target && !this.target.dead && this.checkLOS(this.target)) {
                    this.aimAtTarget(dt);
                    if (this.shootDelay <= 0) {
                        this.state       = 'shooting';
                        this.shotsFired  = 0;
                        this.shotsToFire = 3 + Math.floor(Math.random() * 4);
                        this.timer       = 0.1;
                    } else {
                        this.shootDelay -= dt;
                    }
                } else {
                    this.target     = this.findTarget();
                    this.shootDelay = 0.1 + Math.random() * 0.2;
                    this.mesh.rotation.y = this.scanBaseYaw + Math.sin(performance.now() * 0.002 + this.mesh.id) * 0.5;
                    if (this.timer <= 0) {
                        if (this.isAdvancing && this.advanceToNextCover()) {
                        } else {
                            this.state = 'hidden';
                            this.timer = 0.5 + Math.random();
                        }
                    }
                }
                break;

            case 'shooting':
                targetCrouch = 0.0;
                targetAim    = 1.0;
                if (!this.target || this.target.dead || !this.checkLOS(this.target)) {
                    this.state = 'hidden';
                    this.timer = 0.5 + Math.random();
                    break;
                }
                this.aimAtTarget(dt);
                if (this.timer <= 0) {
                    this.shoot();
                    this.shotsFired++;
                    this.timer = 0.15 + Math.random() * 0.15;
                    if (this.shotsFired >= this.shotsToFire) {
                        if (this.interruptedMove) {
                            this.interruptedMove = false;
                            this.state = 'moving';
                        } else if (this.isAdvancing && Math.random() < 0.95 && this.advanceToNextCover()) {
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
                            this.state = 'hidden';
                            this.timer = 0.5 + Math.random() * 1.0;
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
        const currentHomeSide = this.mesh.position.z >= 0 ? 1 : -1;
        const targetHomeSide = (this.targetCover && this.targetCover.z >= 0) ? 1 : -1;
        if (
            this.state === 'moving' &&
            this.targetCover &&
            this.targetCover.zone === 'home' &&
            currentHomeSide === targetHomeSide
        ) {
            if (targetHomeSide > 0) {
                minZ = FRONT_TRENCH.wallAbsZ - 0.5;
                maxZ = PLAYABLE_HALF_DEPTH;
            } else {
                minZ = -PLAYABLE_HALF_DEPTH;
                maxZ = -(FRONT_TRENCH.wallAbsZ - 0.5);
            }
        } else if (this.isEnemy) {
            if (this.coverTier >= 5)           { minZ = -PLAYABLE_HALF_DEPTH; maxZ = PLAYABLE_HALF_DEPTH; }
            else if (this.coverTier === 4)     { minZ = -MIDDLE_TRENCH.maxAbsZ; maxZ = PLAYABLE_HALF_DEPTH; }
            else if (this.coverTier === 3)     { minZ = -FRONT_LIP_BAND.startAbsZ; maxZ = PLAYABLE_HALF_DEPTH; }
            else if (this.coverTier > 0)       { minZ = -5.0; maxZ = PLAYABLE_HALF_DEPTH; }
            else                               ({ minZ, maxZ } = getHomeTrenchBounds(this.trenchLevel, true));
        } else {
            if (this.coverTier >= 5)           { minZ = -PLAYABLE_HALF_DEPTH; maxZ = PLAYABLE_HALF_DEPTH; }
            else if (this.coverTier === 4)     { minZ = -PLAYABLE_HALF_DEPTH; maxZ = MIDDLE_TRENCH.maxAbsZ; }
            else if (this.coverTier === 3)     { minZ = -PLAYABLE_HALF_DEPTH; maxZ = FRONT_LIP_BAND.startAbsZ; }
            else if (this.coverTier > 0)       { minZ = -PLAYABLE_HALF_DEPTH; maxZ = 5.0; }
            else                               ({ minZ, maxZ } = getHomeTrenchBounds(this.trenchLevel, false));
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

    aimAtTarget(dt) {
        if (!this.target) return;
        let targetPos = new THREE.Vector3();
        if (this.target.isPlayer) camera.getWorldPosition(targetPos);
        else targetPos.copy(this.target.mesh.position);
        const targetYaw = Math.atan2(targetPos.x - this.mesh.position.x, targetPos.z - this.mesh.position.z);
        let diff = targetYaw - this.mesh.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        this.mesh.rotation.y += diff * 8 * dt;
    }

    shoot() {
        if (!this.target || this.target.dead) return;
        const heightOffset = 1.55 - (this.crouchT * 0.45);
        const eyeStart     = this.mesh.position.clone().add(new THREE.Vector3(0, heightOffset, 0));

        this.weaponGroup.updateMatrixWorld(true);
        const visualStart = new THREE.Vector3(0, 0, 0.9).applyMatrix4(this.weaponGroup.matrixWorld);

        let targetPos = new THREE.Vector3();
        if (this.target.isPlayer) {
            camera.getWorldPosition(targetPos);
            targetPos.y -= 0.2;
        } else {
            const targetHeightOffset = 1.55 - (this.target.crouchT * 0.45);
            targetPos.copy(this.target.mesh.position).add(new THREE.Vector3(0, targetHeightOffset, 0));
        }

        const dir  = targetPos.clone().sub(eyeStart).normalize();
        const dist = eyeStart.distanceTo(targetPos);

        let spread = 0.05 + (dist * 0.002);
        if (!this.target.isPlayer) spread *= 8.0;
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
