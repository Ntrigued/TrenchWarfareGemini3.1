// ================================================================
// AI SYSTEM
// ================================================================

import { AI_MOVE_SPEED, AI_DAMAGE_FROM_AI, AI_PEER_SEPARATION,
         AI_MEMORY_DURATION, AI_SEARCH_DURATION, AI_BLIND_FIRE_CHANCE,
         AI_COMMAND_PUSH_DURATION, AI_COMMAND_HOLD_DURATION, AI_COMMAND_FLANK_DURATION,
         AI_SUPPRESSION_DECAY, AI_SUPPRESSION_FROM_HIT, AI_SUPPRESSION_FROM_NEAR,
         AI_MORALE_RECOVERY, AI_MORALE_HIT_PENALTY, AI_MORALE_CASUALTY_PENALTY,
         AI_PERCEPTION_INTERVAL, AI_EXPOSURE_CACHE_TTL, AI_TARGET_CANDIDATES,
         AI_ATTACKER_MEMORY, AI_FRIENDLY_FIRE_CLEARANCE,
         AI_TUNNEL_MAX_ACTIVE, AI_TUNNEL_SPEED_FACTOR, AI_TUNNEL_CHECK_INTERVAL, AI_TUNNEL_LAUNCH_CHANCE, AI_TUNNEL_ENGAGE_RANGE, AI_TUNNEL_COVER_RANGE,
         AI_TUNNEL_SIGHT_RANGE, AI_TUNNEL_REAR_SIGHT,
         TURRET_EXPLOSION_RADIUS } from './config.js';
import { state, allies, enemies } from './state.js';
import { scene, camera } from './scene.js';
import { playPositionalSound, playSoundFile, playNearMissSound } from './audio.js';
import { getTerrainHeight,
         allyCoversFront, allyCoversBack, enemyCoversFront, enemyCoversBack,
         allyPathCovers, enemyPathCovers, midCoversAlly, midCoversEnemy } from './world.js';
import { playerRoot, playerAI } from './player.js';
import { raycaster, createRicochet } from './raycast.js';
import { isSpotVisibleToPlayer } from './raycast.js';
import { showMuzzleFlash, createImpact, createTracerTo } from './effects.js';
import { shootTurret } from './turretShooting.js';
import { resolveMovement, updateLayer, getGroundHeight, canPerceive, getOcclusionMeshes, getBulletMeshes } from './tunnels.js';
import { TUNNELS, STAIR_TOP_X, STAIR_BOTTOM_X, CHAMBER_HALF_Z, TRENCH_WALKWAY_Z } from './tunnelLayout.js';

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

const ROLE_KEYS = ['hold', 'suppress', 'flank', 'push'];

// --- Reusable scratch objects (avoid per-frame allocations) ---
const UP_AXIS      = new THREE.Vector3(0, 1, 0);
const _eye         = new THREE.Vector3();
const _probe       = new THREE.Vector3();
const _dir         = new THREE.Vector3();
const _forward     = new THREE.Vector3();
const _toTarget    = new THREE.Vector3();
const _friendPos   = new THREE.Vector3();
const _closest     = new THREE.Vector3();
const _fireRay     = new THREE.Ray();

// --- Pose targets for weapon/arm blending ---
const IDLE_GUN_POS     = new THREE.Vector3(0.05, -0.15, 0.35);
const IDLE_GUN_ROT     = new THREE.Euler(0.4, 0.5, -0.1);
const AIM_GUN_POS      = new THREE.Vector3(0.12, 0.15, -0.05);
const AIM_GUN_ROT      = new THREE.Euler(0, 0, 0);
const IDLE_R_ARM       = new THREE.Euler(-0.4, -0.2,  0.1);
const AIM_R_ARM        = new THREE.Euler(-1.2, -0.2,  0.3);
const IDLE_R_FOREARM   = new THREE.Euler(-0.6,  0,    0);
const AIM_R_FOREARM    = new THREE.Euler(-2.4,  0,    0);
const IDLE_L_ARM       = new THREE.Euler(-0.3,  0.4, -0.2);
const AIM_L_ARM        = new THREE.Euler(-1.4,  0.8,  0);
const IDLE_L_FOREARM   = new THREE.Euler(-1.2,  0,    0);
const AIM_L_FOREARM    = new THREE.Euler(-0.2,  0,    0);
const DEATH_GUN_POS    = new THREE.Vector3(0.2, -0.4, 0.1);

function nowSeconds() {
    return performance.now() * 0.001;
}

function wrapAngle(angle) {
    while (angle < -Math.PI) angle += Math.PI * 2;
    while (angle >  Math.PI) angle -= Math.PI * 2;
    return angle;
}

function getEntityPosition(entity) {
    return entity.isPlayer ? playerRoot.position : entity.mesh.position;
}

function getBodyCenter(entity, out) {
    if (entity.isPlayer) {
        out.copy(playerRoot.position);
        out.y += (state.isProne || state.slideTimer > 0) ? 0.15 : (state.isCrouched ? 0.4 : 1.0);
    } else {
        out.copy(entity.mesh.position);
        out.y += 1.0 - (entity.crouchT * 0.45);
    }
    return out;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getCommander(isEnemy) {
    return isEnemy ? state.aiCommanders.enemy : state.aiCommanders.ally;
}

function getTeamMembers(unit) {
    return unit.isEnemy ? enemies : allies;
}

function getEnemyMembers(unit) {
    return unit.isEnemy ? allies : enemies;
}

function isHostile(attacker, defender) {
    if (!attacker || attacker.dead) return false;
    if (attacker.isPlayer) return defender.isEnemy;
    return attacker.isEnemy !== defender.isEnemy;
}

function spreadCasualtyShock(victim, attacker) {
    const team = getTeamMembers(victim);
    for (let i = 0; i < team.length; i++) {
        const ally = team[i];
        if (ally === victim || ally.dead) continue;
        const dist = ally.mesh.position.distanceTo(victim.mesh.position);
        if (dist > 18) continue;
        ally.onNearbyCasualty(dist, attacker, victim);
    }
}

function clampRoleQuotas(quotas, livingCount) {
    let total = ROLE_KEYS.reduce((sum, role) => sum + quotas[role], 0);
    if (livingCount <= 0) {
        ROLE_KEYS.forEach(role => { quotas[role] = 0; });
        return;
    }

    while (total > livingCount) {
        if (quotas.hold > 0) quotas.hold--;
        else if (quotas.push > 1) quotas.push--;
        else if (quotas.suppress > 1) quotas.suppress--;
        else if (quotas.flank > 0) quotas.flank--;
        total = ROLE_KEYS.reduce((sum, role) => sum + quotas[role], 0);
    }

    while (total < livingCount) {
        quotas.hold++;
        total++;
    }
}

function chooseCommanderMode(commander, livingCount, advancingCount, opposingCount, avgMorale) {
    const pressure = opposingCount > 0 ? (livingCount / opposingCount) : 1.0;
    const advancingRatio = livingCount > 0 ? (advancingCount / livingCount) : 0;

    // A shaken team regroups before committing to another attack.
    if (livingCount <= 3 || pressure < 0.75 || avgMorale < 0.55) return 'hold';
    if (commander.mode === 'hold') {
        if (pressure > 1.1 || advancingRatio < 0.2) return 'push';
        return Math.random() < 0.35 ? 'flank' : 'hold';
    }
    if (commander.mode === 'push') {
        if (pressure < 0.95) return 'hold';
        return Math.random() < 0.4 ? 'flank' : 'push';
    }
    if (pressure > 1.0) return 'push';
    return 'hold';
}

function setCommanderPhase(commander, livingCount, mode) {
    commander.mode = mode;
    commander.phaseId++;
    commander.flankSide = Math.random() < 0.5 ? -1 : 1;
    commander.flankAssignments = 0;

    if (mode === 'push') {
        commander.phaseTimer = AI_COMMAND_PUSH_DURATION * (0.85 + Math.random() * 0.3);
        commander.rolePriority = ['push', 'flank', 'suppress', 'hold'];
        commander.defaultRole = 'push';
    } else if (mode === 'flank') {
        commander.phaseTimer = AI_COMMAND_FLANK_DURATION * (0.85 + Math.random() * 0.3);
        commander.rolePriority = ['flank', 'suppress', 'push', 'hold'];
        commander.defaultRole = 'flank';
    } else {
        commander.phaseTimer = AI_COMMAND_HOLD_DURATION * (0.85 + Math.random() * 0.3);
        commander.rolePriority = ['suppress', 'hold', 'push', 'flank'];
        commander.defaultRole = 'hold';
    }

    const quotas = {
        hold: Math.max(0, Math.round(livingCount * (mode === 'hold' ? 0.35 : 0.15))),
        suppress: Math.max(livingCount > 0 ? 1 : 0, Math.round(livingCount * (mode === 'hold' ? 0.35 : 0.25))),
        flank: Math.max(mode === 'flank' && livingCount > 4 ? 1 : 0, Math.round(livingCount * (mode === 'flank' ? 0.3 : 0.15))),
        push: Math.max(mode === 'push' && livingCount > 0 ? 1 : 0, Math.round(livingCount * (mode === 'push' ? 0.4 : 0.2))),
    };
    clampRoleQuotas(quotas, livingCount);
    commander.roleQuotas = quotas;
    commander.roleCounts = { hold: 0, suppress: 0, flank: 0, push: 0 };

    // Volunteers sent through the mine tunnels to raid the enemy trench.
    if (livingCount < 6) commander.tunnelQuota = 0;
    else if (mode === 'hold') commander.tunnelQuota = 1;
    else commander.tunnelQuota = livingCount >= 20 ? 4 : 3;
    commander.tunnelLaunched = 0;
}

function initCommander(commander, mode = 'hold') {
    commander.mode = mode;
    commander.phaseId = 0;
    commander.phaseTimer = 0;
    commander.flankSide = Math.random() < 0.5 ? -1 : 1;
    commander.flankAssignments = 0;
    commander.roleQuotas = { hold: 0, suppress: 0, flank: 0, push: 0 };
    commander.roleCounts = { hold: 0, suppress: 0, flank: 0, push: 0 };
    commander.rolePriority = ['hold', 'suppress', 'flank', 'push'];
    commander.defaultRole = 'hold';
    commander.tunnelQuota = 0;
    commander.tunnelLaunched = 0;
}

function updateCommanderState(commander, team, opposingTeam, dt) {
    const living = team.filter(soldier => !soldier.dead);
    const livingCount = living.length;
    const advancingCount = living.filter(soldier => soldier.isAdvancing).length;
    const opposingCount = opposingTeam.filter(soldier => !soldier.dead).length;
    const avgMorale = livingCount > 0
        ? living.reduce((sum, soldier) => sum + soldier.morale, 0) / livingCount
        : 1.0;

    commander.phaseTimer -= dt;
    if (commander.phaseTimer <= 0) {
        const nextMode = chooseCommanderMode(commander, livingCount, advancingCount, opposingCount, avgMorale);
        setCommanderPhase(commander, livingCount, nextMode);
    }
}

export function resetTeamCommanders() {
    initCommander(state.aiCommanders.ally, 'hold');
    initCommander(state.aiCommanders.enemy, 'hold');
}

export function updateTeamCommanders(dt) {
    updateCommanderState(state.aiCommanders.ally, allies, enemies, dt);
    updateCommanderState(state.aiCommanders.enemy, enemies, [...allies, playerAI], dt);
}

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
        this.role      = 'hold';
        this.commandPhaseId = -1;
        this.flankSide = 1;
        this.suppression = 0;
        this.morale      = 1;
        this.exposureCache = new Map();
        this.exposureTTL   = AI_EXPOSURE_CACHE_TTL * (0.8 + Math.random() * 0.4);

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
        const chooseBestCover = (covers) => {
            const scored = covers.map(c => ({
                cover: c,
                score: this.scoreCover(c) + (Math.random() * 0.35)
            }));
            scored.sort((a, b) => b.score - a.score);
            return scored[0].cover;
        };

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
                    this.targetCover = chooseBestCover(safeTurrets);
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
                    this.targetCover = chooseBestCover(available);
                    return true;
                }

                if (level === 'back') return tryTrench('front');
                this.isAdvancing = true;
                this.coverTier   = 0;
                return false;
            };

            const preferredLevel = (this.role === 'push' || this.role === 'flank') ? 'front' : 'back';
            if (tryTrench(preferredLevel)) return;
            if (preferredLevel !== 'back' && tryTrench('back')) return;
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

        this.targetCover = chooseBestCover(available);
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
        this.recentAttacker     = null;
        this.recentAttackerTime = -Infinity;
        this.perceptionTimer    = Math.random() * AI_PERCEPTION_INTERVAL;
        this.blockedShots       = 0;
        this.exposureCache.clear();
        this.tunnelMission      = null;
        this.underground        = false;
        this.inStairwell        = false;
        this.tunnelCheckTimer   = Math.random() * AI_TUNNEL_CHECK_INTERVAL;
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
        this.suppression    = 0;
        this.morale         = 0.95 + (Math.random() * 0.1);
        this.assignRoleFromCommander(true);

        this.pickCover(true);
        this.mesh.position.set(
            this.targetCover.x,
            getTerrainHeight(this.targetCover.x, this.targetCover.z),
            this.targetCover.z
        );
    }

    alert(attacker, severity = AI_SUPPRESSION_FROM_NEAR) {
        if (this.dead || !attacker || attacker.dead) return;
        const isFriendlyFire      = !attacker.isPlayer && (attacker.isEnemy === this.isEnemy);
        const isPlayerShootingAlly = attacker.isPlayer && !this.isEnemy;
        const isHostileThreat = !isFriendlyFire && !isPlayerShootingAlly;

        // Raiders heading for a tunnel keep their heads down rather than trade fire at range.
        if (isHostileThreat && this.isRaidDistraction(attacker)) {
            if (severity > 0) this.applySuppression(severity);
            return;
        }

        if (isHostileThreat) {
            this.recentAttacker     = attacker;
            this.recentAttackerTime = nowSeconds();
        }

        if (!this.target || Math.random() < 0.8) {
            if (isHostileThreat) {
                this.target = attacker;
                this.rememberTarget(attacker, 1.0);
                const targetPos = this.getTargetAimPosition(attacker);
                this.scanBaseYaw = Math.atan2(targetPos.x - this.mesh.position.x, targetPos.z - this.mesh.position.z);
            }
        }
        if (isHostileThreat && severity > 0) this.applySuppression(severity, attacker);

        if (this.state === 'moving' || this.state === 'tunneling') {
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

    takeDamage(amount, attacker, hitInfo = null) {
        if (this.dead || this.hp <= 0) return;

        if (attacker && !attacker.isPlayer) {
            amount = this.resolveAIDamage(attacker, amount, hitInfo);
        }

        const impactSuppression = AI_SUPPRESSION_FROM_HIT + ((hitInfo && hitInfo.weaponType === 'turret') ? 0.35 : 0);
        if (isHostile(attacker, this)) {
            this.applySuppression(impactSuppression, attacker);
            this.adjustMorale(-AI_MORALE_HIT_PENALTY);
        }

        this.hp -= amount;

        if (this.hp <= 0) {
            this.dead = true;
            this.releaseRole();
            if (this.targetCover && this.targetCover.isTurret && this.targetCover.turret.user === this) {
                this.targetCover.turret.user = null;
            }
            this.deathAnimT  = 0.0;
            this.corpseDelay = 2.0;
            this.timer       = 3 + Math.random() * 2;
            spreadCasualtyShock(this, attacker);
            if (attacker === playerAI && this.isEnemy) {
                state.playerKills++;
                document.getElementById('kill-count-indicator').innerText = `Kills: ${state.playerKills}`;
            }
        } else if (attacker && !attacker.dead) {
            const isFriendlyFire      = !attacker.isPlayer && (attacker.isEnemy === this.isEnemy);
            const isPlayerShootingAlly = attacker.isPlayer && !this.isEnemy;
            if (!isFriendlyFire && !isPlayerShootingAlly) {
                this.alert(attacker, 0);
            }
            if (this.state === 'aiming' || this.state === 'popping') this.timer += 0.2;
        }
    }

    update(dt) {
        this.assignRoleFromCommander();

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
                this.weaponGroup.position.lerp(DEATH_GUN_POS, 10 * dt);
                this.weaponGroup.rotation.x += (Math.PI/2 - this.weaponGroup.rotation.x) * 10 * dt;
                this.leftLeg.rotation.x   += (0 - this.leftLeg.rotation.x)   * 10 * dt;
                this.rightLeg.rotation.x  += (0 - this.rightLeg.rotation.x)  * 10 * dt;
                this.leftCalf.rotation.x  += (0 - this.leftCalf.rotation.x)  * 10 * dt;
                this.rightCalf.rotation.x += (0 - this.rightCalf.rotation.x) * 10 * dt;
                this.crouchT += (0 - this.crouchT) * 5 * dt;
                this.torso.rotation.x    = this.crouchT * 0.4;
                this.headGroup.rotation.x = -this.torso.rotation.x;
                this.mesh.position.y = getGroundHeight(this.mesh.position.x, this.mesh.position.z, this.underground);
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
        this.suppression    = Math.max(0, this.suppression - (AI_SUPPRESSION_DECAY * (this.state === 'hidden' ? 1.35 : 1.0) * dt));
        const moraleTarget = this.role === 'push' ? 1.02 : (this.role === 'hold' ? 0.94 : 0.98);
        const moraleRate   = AI_MORALE_RECOVERY * (this.state === 'hidden' ? 1.35 : 1.0) * (this.suppression > 0.75 ? 0.45 : 1.0);
        this.morale += (moraleTarget - this.morale) * moraleRate * dt;
        this.morale = clamp(this.morale, 0.2, 1.15);

        if (this.lastSeenTarget && this.lastSeenTarget.dead) {
            this.lastSeenTarget = null;
        }
        if (this.target && this.target.dead) {
            this.target = null;
        }
        if (this.suspicionTimer <= 0 && this.hasLastSeenPos) {
            this.clearMemory();
        }

        if (this.suppression > 0.95 && this.state !== 'hidden' && this.state !== 'using_turret' && this.state !== 'moving') {
            this.state = 'hidden';
            this.timer = 0.45 + Math.random() * 0.35;
        } else if (this.suppression > 1.15 && this.state === 'moving') {
            if (this.coverTier > 0 && Math.random() < 0.45) this.coverTier--;
            this.pickCover();
        }

        // Periodic threat scan. Throttling it gives soldiers a human reaction
        // delay and keeps raycast cost flat as the number of soldiers grows.
        this.perceptionTimer -= dt;
        if (this.perceptionTimer <= 0) {
            this.perceptionTimer = AI_PERCEPTION_INTERVAL * (0.75 + Math.random() * 0.5);
            this.scanForThreats();
        }

        const targetVisible = this.target && !this.target.dead
            ? this.calculateExposure(this.target)
            : 0;
        if (targetVisible > 0) {
            this.rememberTarget(this.target, targetVisible);
        } else if (this.target && !this.target.dead && this.lastSeenTarget !== this.target) {
            this.rememberTarget(this.target, 0.35);
        }

        this.tunnelCheckTimer -= dt;
        if (this.tunnelCheckTimer <= 0) {
            this.tunnelCheckTimer = AI_TUNNEL_CHECK_INTERVAL * (0.75 + Math.random() * 0.5);
            this.considerTunnelMission();
        }

        // Raiders keep following their tunnel route instead of seeking cover,
        // only stopping to fight enemies close by or met underground.
        if (this.tunnelMission) {
            const mission = this.tunnelMission;
            const engaged = this.target && !this.target.dead && !this.isRaidDistraction(this.target);
            if (!engaged) {
                this.target = null;
                this.isBlindFiring = false;
                mission.coverPoint = null;
                if (this.state === 'hidden') {
                    if (this.timer <= 0) this.state = 'tunneling';
                } else if (this.state !== 'tunneling') {
                    this.state = 'tunneling';
                }
            } else if (this.state === 'moving') {
                this.state = 'tunneling';
            } else if (!mission.coverPoint && this.state !== 'shooting' && this.state !== 'tunneling' &&
                       nowSeconds() - mission.coverSeekTime > 1.0 && this.seekTunnelCover(this.target)) {
                // In a firefight out in the open: break for the nearest cover.
            } else if (this.state === 'hidden' && this.timer <= 0) {
                if (mission.coverPoint) {
                    // Fighting from cover: pop up again, or sometimes rush the next cover forward.
                    const rushChance = 0.3 * this.getNerve();
                    const rushing = Math.random() < rushChance && this.seekTunnelCover(this.target, true);
                    this.state = rushing ? 'tunneling' : 'popping';
                } else {
                    this.state = this.checkLOS(this.target) ? 'popping' : 'tunneling';
                }
                this.timer = 0.2;
            }
        }

        let targetCrouch = 0.0;
        let targetAim    = 0.0;

        switch (this.state) {

            case 'tunneling': {
                targetCrouch = 0.55;
                if (this.tunnelMission.coverPoint) {
                    this.moveToTunnelCover(dt);
                    break;
                }
                if (this.target && !this.target.dead && this.checkLOS(this.target)) {
                    // Contact: dash for cover if there is any nearby, else fight where we stand.
                    if (this.seekTunnelCover(this.target)) break;
                    this.state           = 'aiming';
                    this.timer           = 0.6;
                    this.shootDelay      = 0.12 + Math.random() * 0.15;
                    this.interruptedMove = true;
                    break;
                }
                this.followTunnelRoute(dt);
                break;
            }

            case 'moving': {
                targetCrouch = 0.5;
                const moveSpeed = AI_MOVE_SPEED * (1.0 - (this.suppression * 0.18));
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
                    } else if (this.shouldAdvanceFromCover() && this.coverTier < this.getAdvanceCap() && !this.findTarget()) {
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
                } else {
                    // Only engage targets inside the gun's traverse arc that
                    // can be shelled without hitting our own men.
                    const engageable = (target) => this.canTurretEngage(t, this.getTurretAimPosition(target));
                    if (!this.target || this.target.dead || !this.checkLOS(this.target) || !engageable(this.target)) {
                        this.target = this.findTarget(engageable);
                        if (this.target) this.rememberTarget(this.target, 1.0);
                    } else {
                        this.rememberTarget(this.target, this.calculateExposure(this.target));
                    }

                    if (this.target) {
                        const yawError = this.traverseTurret(t, this.getTurretAimPosition(this.target), 5, dt);
                        if (this.shootDelay <= 0) {
                            if (Math.abs(yawError) < 0.2) {
                                shootTurret(t, this);
                                this.shootDelay = 1.8 + Math.random() * 0.4;
                            }
                        } else {
                            this.shootDelay -= dt;
                        }
                    } else if (this.hasSuspicion()) {
                        const memoryPos = this.getSearchAimPosition();
                        const yawError  = this.traverseTurret(t, memoryPos, 3, dt);
                        if (this.shootDelay <= 0 && Math.abs(yawError) < 0.12 &&
                            Math.random() < AI_BLIND_FIRE_CHANCE * 0.4 && this.canTurretEngage(t, memoryPos)) {
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
                }
                this.mesh.rotation.y = t.swivel.rotation.y + Math.PI;
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
                        if (this.isLineOfFireBlocked(this.getEyePosition(_eye), this.getTargetAimPosition(this.target))) {
                            this.handleBlockedShot();
                        } else {
                            this.state       = 'shooting';
                            this.shotsFired  = 0;
                            this.shotsToFire = 3 + Math.floor(Math.random() * 4);
                            this.isBlindFiring = false;
                            this.blockedShots  = 0;
                            this.timer       = 0.1;
                        }
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
                            if (this.shouldAdvanceFromCover() && this.coverTier < this.getAdvanceCap()) {
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
                    if (this.shouldAdvanceAfterSearch() && this.coverTier < this.getAdvanceCap()) {
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
                    const blindAim = this.isBlindFiring ? this.getBlindFireAimPosition() : null;
                    const aimPoint = blindAim || this.getTargetAimPosition(this.target);
                    if (this.isLineOfFireBlocked(this.getEyePosition(_eye), aimPoint)) {
                        // Check fire: a teammate is in the way, so break off the burst.
                        this.isBlindFiring = false;
                        this.state = 'aiming';
                        this.timer = 0.4 + Math.random() * 0.4;
                        this.handleBlockedShot();
                        break;
                    }
                    this.shoot(blindAim, this.isBlindFiring ? 2.5 : 1.0);
                    this.shotsFired++;
                    this.timer = 0.15 + Math.random() * 0.15;
                    if (this.shotsFired >= this.shotsToFire) {
                        this.isBlindFiring = false;
                        if (this.interruptedMove) {
                            this.interruptedMove = false;
                            this.state = 'moving';
                        } else if (this.coverTier < this.getAdvanceCap() && Math.random() < this.getBurstAdvanceChance()) {
                            this.coverTier++;
                            this.pickCover();
                            this.state = 'moving';
                        } else if (Math.random() < this.getRepositionChance()) {
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
        const isWalking = this.state === 'moving' || this.state === 'tunneling';
        if (isWalking) {
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
        this.weaponGroup.position.lerpVectors(IDLE_GUN_POS, AIM_GUN_POS, this.aimT);
        this.weaponGroup.rotation.set(
            IDLE_GUN_ROT.x + (AIM_GUN_ROT.x - IDLE_GUN_ROT.x) * this.aimT,
            IDLE_GUN_ROT.y + (AIM_GUN_ROT.y - IDLE_GUN_ROT.y) * this.aimT,
            IDLE_GUN_ROT.z + (AIM_GUN_ROT.z - IDLE_GUN_ROT.z) * this.aimT
        );
        if (isWalking) {
            this.weaponGroup.position.y += Math.sin(this.walkTime * 2) * 0.02;
            this.weaponGroup.rotation.x += Math.sin(this.walkTime) * 0.05;
        }

        this.rightArm.rotation.set(
            IDLE_R_ARM.x + (AIM_R_ARM.x - IDLE_R_ARM.x) * this.aimT + (armSwing * (1 - this.aimT)),
            IDLE_R_ARM.y + (AIM_R_ARM.y - IDLE_R_ARM.y) * this.aimT,
            IDLE_R_ARM.z + (AIM_R_ARM.z - IDLE_R_ARM.z) * this.aimT
        );
        this.rightForearm.rotation.x = IDLE_R_FOREARM.x + (AIM_R_FOREARM.x - IDLE_R_FOREARM.x) * this.aimT;

        this.leftArm.rotation.set(
            IDLE_L_ARM.x + (AIM_L_ARM.x - IDLE_L_ARM.x) * this.aimT - (armSwing * (1 - this.aimT)),
            IDLE_L_ARM.y + (AIM_L_ARM.y - IDLE_L_ARM.y) * this.aimT,
            IDLE_L_ARM.z + (AIM_L_ARM.z - IDLE_L_ARM.z) * this.aimT
        );
        this.leftForearm.rotation.x = IDLE_L_FOREARM.x + (AIM_L_FOREARM.x - IDLE_L_FOREARM.x) * this.aimT;

        // Peer separation
        const peers = this.isEnemy ? enemies : allies;
        const separationSq = AI_PEER_SEPARATION * AI_PEER_SEPARATION;
        peers.forEach(peer => {
            if (peer !== this && !peer.dead && peer.underground === this.underground) {
                const cdx = this.mesh.position.x - peer.mesh.position.x;
                const cdz = this.mesh.position.z - peer.mesh.position.z;
                const distSq = cdx*cdx + cdz*cdz;
                if (distSq < separationSq && distSq > 0.0001) {
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

        // Obstacle collision (per layer) and stairwell layer changes
        let aiPos2D = { x: this.mesh.position.x, z: this.mesh.position.z };
        resolveMovement(aiPos2D, 0.4, this.underground, !!this.tunnelMission);
        this.mesh.position.x = aiPos2D.x;
        this.mesh.position.z = aiPos2D.z;
        const layer = updateLayer(aiPos2D.x, aiPos2D.z, this.underground);
        this.underground = layer.underground;
        this.inStairwell = layer.inStairwell;

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
        if (!this.tunnelMission && !this.underground) {
            this.mesh.position.z = Math.max(minZ, Math.min(maxZ, this.mesh.position.z));
        }

        // Stay tucked in behind tunnel cover while fighting from it
        const tunnelCover = this.tunnelMission && this.tunnelMission.coverPoint;
        if (tunnelCover && this.state !== 'tunneling') {
            this.mesh.position.x += (tunnelCover.x - this.mesh.position.x) * 2 * dt;
            this.mesh.position.z += (tunnelCover.z - this.mesh.position.z) * 2 * dt;
        }

        // Snap to cover when stationary
        if (this.state !== 'moving' && this.state !== 'using_turret' && !this.tunnelMission &&
            this.targetCover && !this.targetCover.isTurret) {
            this.mesh.position.x += (this.targetCover.x - this.mesh.position.x) * 2 * dt;
            this.mesh.position.z += (this.targetCover.z - this.mesh.position.z) * 2 * dt;
        }

        this.mesh.position.y = getGroundHeight(this.mesh.position.x, this.mesh.position.z, this.underground);
    }

    // Fraction (0..1) of the target's head/torso/legs visible from our eyes.
    // Results are cached briefly per target: several states query the same
    // target every frame, and each check costs three raycasts.
    calculateExposure(target) {
        if (!canPerceive(this, target)) return 0;
        const eyeHeight = 1.55 - (this.crouchT * 0.45);
        const now = nowSeconds();
        const cached = this.exposureCache.get(target);
        if (cached && (now - cached.time) < this.exposureTTL && Math.abs(cached.eyeHeight - eyeHeight) < 0.15) {
            return cached.value;
        }
        const value = this.computeExposure(target, eyeHeight);
        if (cached) {
            cached.value = value;
            cached.time = now;
            cached.eyeHeight = eyeHeight;
        } else {
            this.exposureCache.set(target, { value, time: now, eyeHeight });
        }
        return value;
    }

    computeExposure(target, eyeHeight) {
        _eye.copy(this.mesh.position);
        _eye.y += eyeHeight;

        let probeHeights;
        if (target.isPlayer) {
            const pProne = state.isProne || state.slideTimer > 0;
            probeHeights = [
                pProne ? 0.3  : (state.isCrouched ? 0.8 : 1.5),
                pProne ? 0.15 : (state.isCrouched ? 0.4 : 1.0),
                0.2,
            ];
        } else {
            const cOffset = target.crouchT * 0.45;
            probeHeights = [1.55 - cOffset, 1.0 - (cOffset * 0.5), 0.3];
        }

        const base = getEntityPosition(target);
        const occluders = getOcclusionMeshes(this, target);
        let hits = 0;
        for (let i = 0; i < probeHeights.length; i++) {
            _probe.copy(base);
            _probe.y += probeHeights[i];
            const dist = _eye.distanceTo(_probe);
            _dir.subVectors(_probe, _eye).divideScalar(dist);
            raycaster.set(_eye, _dir);
            raycaster.far = dist;
            const intersects = raycaster.intersectObjects(occluders, false);
            if (intersects.length === 0) hits++;
        }
        raycaster.far = Infinity;
        return hits / probeHeights.length;
    }

    checkLOS(target) {
        return this.calculateExposure(target) > 0;
    }

    // Visits living hostiles this soldier could possibly see (same layer or via a stairwell).
    forEachHostile(fn) {
        const opposing = getEnemyMembers(this);
        for (let i = 0; i < opposing.length; i++) {
            if (!opposing[i].dead && canPerceive(this, opposing[i])) fn(opposing[i]);
        }
        if (this.isEnemy && !playerAI.dead && canPerceive(this, playerAI)) fn(playerAI);
    }

    // Notices nearby hostiles, weighting those in front of us or standing exposed.
    scanForThreats() {
        if (this.underground || this.inStairwell) {
            this.scanTunnelThreats();
            return;
        }
        let closestThreat = null;
        let closestDistSq = 25;
        const myPos = this.mesh.position;
        _forward.set(0, 0, 1).applyAxisAngle(UP_AXIS, this.mesh.rotation.y);

        this.forEachHostile(threat => {
            if (this.isRaidDistraction(threat)) return;
            const tPos = getEntityPosition(threat);
            let perceivedDistSq = myPos.distanceToSquared(tPos);
            _toTarget.subVectors(tPos, myPos).normalize();
            const isExposed = threat.isPlayer ? !state.isCrouched : (threat.state === 'moving' || threat.crouchT < 0.5);
            if (_forward.dot(_toTarget) > 0.5) perceivedDistSq *= 0.4;
            if (isExposed) perceivedDistSq *= 0.4;
            if (perceivedDistSq < closestDistSq) {
                closestDistSq = perceivedDistSq;
                closestThreat = threat;
            }
        });

        if (!closestThreat || this.target === closestThreat) return;
        const exposure = this.calculateExposure(closestThreat);
        if (exposure <= 0) return;

        this.target = closestThreat;
        this.rememberTarget(closestThreat, exposure);
        if (this.state === 'moving') this.interruptedMove = true;
        if (this.state !== 'using_turret') {
            this.state      = 'aiming';
            this.shootDelay = 0.2 + Math.random() * 0.2;
        }
    }

    // Underground the galleries are lit and straight, so anyone in line of
    // sight ahead is seen at long range; to the sides and behind, less so.
    scanTunnelThreats() {
        const myPos = this.mesh.position;
        _forward.set(0, 0, 1).applyAxisAngle(UP_AXIS, this.mesh.rotation.y);
        let best = null;
        let bestScore = Infinity;
        this.forEachHostile(threat => {
            const tPos = getEntityPosition(threat);
            _toTarget.subVectors(tPos, myPos);
            _toTarget.y = 0;
            const dist = _toTarget.length();
            if (dist > 0.001) _toTarget.divideScalar(dist);
            const facing = _forward.dot(_toTarget);
            const range = facing > 0.3 ? AI_TUNNEL_SIGHT_RANGE
                        : facing > -0.3 ? AI_TUNNEL_SIGHT_RANGE * 0.6
                        : AI_TUNNEL_REAR_SIGHT;
            if (dist > range) return;
            const exposure = this.calculateExposure(threat);
            if (exposure <= 0) return;
            const score = dist / exposure;
            if (score < bestScore) { bestScore = score; best = threat; }
        });

        if (!best || this.target === best) return;
        this.target = best;
        this.rememberTarget(best, this.calculateExposure(best));
        if (this.state === 'moving' || this.state === 'tunneling') this.interruptedMove = true;
        if (this.state !== 'using_turret') {
            this.state      = 'aiming';
            this.timer      = 0.6;
            this.shootDelay = 0.12 + Math.random() * 0.15;
        }
    }

    // Lower is more attractive: multiplies a target's distance-based score.
    getTargetPriority(target) {
        let priority = 1.0;
        if (target === this.recentAttacker && (nowSeconds() - this.recentAttackerTime) < AI_ATTACKER_MEMORY) {
            priority *= 0.55;   // return fire on whoever is shooting at us
        }
        if (target === this.target) priority *= 0.75;   // stay on target instead of flicking between men
        if (target.isPlayer ? !!state.mountedTurret : target.state === 'using_turret') {
            priority *= 0.7;    // silence machine guns first
        }
        if (target.state === 'moving') priority *= 0.85; // catch men crossing open ground
        return priority;
    }

    findTarget(filter = null) {
        const myPos = this.mesh.position;
        _forward.set(0, 0, 1).applyAxisAngle(UP_AXIS, this.mesh.rotation.y);

        // Cheap pre-pass ranks every hostile by facing-weighted distance so the
        // expensive LOS raycasts only run on the most likely few.
        const candidates = [];
        this.forEachHostile(target => {
            if (target.hp <= 0) return;
            const tPos = getEntityPosition(target);
            let score = tPos.distanceToSquared(myPos);
            if (score > 10000) return;
            _toTarget.subVectors(tPos, myPos).normalize();
            const dot = _forward.dot(_toTarget);
            if (dot > 0.5)  score *= 0.3;
            else if (dot < 0) score *= 2.5;
            score *= this.getTargetPriority(target);
            candidates.push({ target, score });
        });
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.score - b.score);

        let bestTarget = null;
        let bestScore  = Infinity;
        const maxChecks = AI_TARGET_CANDIDATES * 2;
        for (let i = 0, checked = 0; i < candidates.length && checked < maxChecks; i++) {
            // Once something is found, stop after the first batch of candidates.
            if (bestTarget && checked >= AI_TARGET_CANDIDATES) break;
            const { target } = candidates[i];
            if (filter && !filter(target)) continue;
            checked++;
            const exposure = this.calculateExposure(target);
            if (exposure === 0) continue;
            const score = (candidates[i].score / exposure) * (0.8 + Math.random() * 0.4);
            if (score < bestScore) { bestScore = score; bestTarget = target; }
        }
        return bestTarget;
    }

    getEyePosition(out) {
        out.copy(this.mesh.position);
        out.y += 1.55 - (this.crouchT * 0.45);
        return out;
    }

    // True if any living teammate (or the player, for allies) satisfies `predicate`.
    anyFriendly(predicate) {
        const team = getTeamMembers(this);
        for (let i = 0; i < team.length; i++) {
            const friend = team[i];
            if (friend === this || friend.dead || !canPerceive(this, friend)) continue;
            if (predicate(getBodyCenter(friend, _friendPos))) return true;
        }
        if (!this.isEnemy && !playerAI.dead && canPerceive(this, playerAI)) {
            return predicate(getBodyCenter(playerAI, _friendPos));
        }
        return false;
    }

    // True if a teammate stands between `from` and `to` close to the bullet path.
    isLineOfFireBlocked(from, to) {
        const dist = from.distanceTo(to);
        if (dist < 0.01) return false;
        _fireRay.origin.copy(from);
        _fireRay.direction.subVectors(to, from).divideScalar(dist);
        const clearanceSq = AI_FRIENDLY_FIRE_CLEARANCE * AI_FRIENDLY_FIRE_CLEARANCE;
        return this.anyFriendly(friendPos => {
            const along = _toTarget.subVectors(friendPos, from).dot(_fireRay.direction);
            if (along <= 0.3 || along >= dist - 0.5) return false;
            _fireRay.closestPointToPoint(friendPos, _closest);
            return _closest.distanceToSquared(friendPos) < clearanceSq;
        });
    }

    handleBlockedShot() {
        this.blockedShots++;
        this.shootDelay = 0.25 + Math.random() * 0.25;
        if (this.blockedShots >= 3 && !(this.targetCover && this.targetCover.isTurret)) {
            // Shift position rather than wait for a teammate to clear the line.
            this.blockedShots = 0;
            this.pickCover();
            this.state = 'moving';
        }
    }

    getTurretAimPosition(target) {
        if (target.isPlayer) return camera.getWorldPosition(new THREE.Vector3());
        return target.mesh.position.clone();
    }

    isInTurretArc(t, aimPos) {
        const yaw = Math.atan2(aimPos.x - t.mesh.position.x, aimPos.z - t.mesh.position.z) + Math.PI;
        return Math.abs(wrapAngle(yaw - t.baseYaw)) <= Math.PI / 2;
    }

    // A turret shell is only fired if the target is within traverse, no
    // teammate is in the line of fire, and none is inside the blast radius.
    canTurretEngage(t, aimPos) {
        if (!this.isInTurretArc(t, aimPos)) return false;
        const dangerCloseSq = (TURRET_EXPLOSION_RADIUS + 0.5) * (TURRET_EXPLOSION_RADIUS + 0.5);
        if (this.anyFriendly(friendPos => friendPos.distanceToSquared(aimPos) < dangerCloseSq)) return false;
        _probe.copy(t.mesh.position);
        _probe.y += 0.3;
        return !this.isLineOfFireBlocked(_probe, aimPos);
    }

    // Swings the turret toward `aimPos` (clamped to its traverse arc) and
    // returns the remaining yaw error, or PI when the aim point is out of arc.
    traverseTurret(t, aimPos, rate, dt) {
        const tx = aimPos.x - t.mesh.position.x;
        const tz = aimPos.z - t.mesh.position.z;
        let targetYaw = Math.atan2(tx, tz) + Math.PI;

        const arcDiff = wrapAngle(targetYaw - t.baseYaw);
        const outOfArc = Math.abs(arcDiff) > Math.PI / 2;
        if (arcDiff >  Math.PI / 2) targetYaw = t.baseYaw + Math.PI / 2;
        if (arcDiff < -Math.PI / 2) targetYaw = t.baseYaw - Math.PI / 2;

        const yawDiff = wrapAngle(targetYaw - t.swivel.rotation.y);
        t.swivel.rotation.y += yawDiff * rate * dt;

        const dist2d = Math.sqrt(tx * tx + tz * tz);
        const targetPitch = Math.atan2(aimPos.y - (t.mesh.position.y + 0.3), dist2d);
        t.pitchGroup.rotation.x += (targetPitch - t.pitchGroup.rotation.x) * rate * dt;

        return outOfArc ? Math.PI : yawDiff;
    }

    // ------------------------------------------------------------
    // Tunnel raids
    // ------------------------------------------------------------

    isInOwnFrontTrench() {
        const depth = (this.isEnemy ? 1 : -1) * this.mesh.position.z;
        return depth > 17.8 && depth < 22.0 && !this.underground && !this.inStairwell;
    }

    considerTunnelMission() {
        if (this.tunnelMission || this.state === 'using_turret' || !this.isInOwnFrontTrench()) return;
        if (this.getNerve() < 0.5 || Math.random() > AI_TUNNEL_LAUNCH_CHANCE) return;
        const commander = getCommander(this.isEnemy);
        if (commander.tunnelLaunched >= commander.tunnelQuota) return;
        const activeRaiders = getTeamMembers(this).filter(s => !s.dead && s.tunnelMission).length;
        if (activeRaiders >= AI_TUNNEL_MAX_ACTIVE) return;

        // Usually take the nearest tunnel, sometimes the far one.
        const nearest = this.mesh.position.x < 0 ? TUNNELS[0] : TUNNELS[1];
        const tunnel = Math.random() < 0.75 ? nearest : TUNNELS.find(t => t !== nearest);
        commander.tunnelLaunched++;
        this.startTunnelMission(tunnel);
    }

    // True for surface enemies a raider should ignore while making for the tunnel.
    isRaidDistraction(target) {
        if (!this.tunnelMission || !target || this.underground || this.inStairwell) return false;
        const range = AI_TUNNEL_ENGAGE_RANGE;
        return getEntityPosition(target).distanceToSquared(this.mesh.position) > range * range;
    }

    startTunnelMission(tunnel) {
        this.tunnelMission = {
            tunnel,
            waypoints: this.buildTunnelRoute(tunnel),
            index: 0,
            bestDist: Infinity,
            stallTimer: 0,
            coverPoint: null,
            coverTimer: 0,
            coverSeekTime: -Infinity,
        };
        this.isAdvancing = true;
        if (this.targetCover && this.targetCover.isTurret && this.targetCover.turret.user === this) {
            this.targetCover.turret.user = null;
        }
        this.target = null;
        this.isBlindFiring = false;
        this.clearMemory();
        this.state = 'tunneling';
    }

    // Walk along our trench to the dugout, down through the gallery and
    // chamber, and up the far stairwell into the enemy front trench.
    buildTunnelRoute(tunnel) {
        const s = tunnel.xSign;
        const own = this.isEnemy ? tunnel.enemyStair : tunnel.allyStair;
        const far = this.isEnemy ? tunnel.allyStair : tunnel.enemyStair;
        const ownZ = this.isEnemy ? 1 : -1;
        const walkwayZ = ownZ * TRENCH_WALKWAY_Z;
        const gx = tunnel.galleryX;
        const x = this.mesh.position.x;
        const entryX = s * (STAIR_TOP_X - 1.5);
        const rearZ = ownZ * 21.0;   // lane behind the cover crates, along the parapet
        const route = [];

        // Step back from the crate line, then follow the rear lane. Dugouts
        // block that lane, so pass them on the walkway side instead.
        const dir = Math.sign(entryX - x) || 1;
        const besideDugout = Math.abs(x) > STAIR_TOP_X - 1.5 && Math.abs(x) < STAIR_BOTTOM_X + 1.5;
        if (Math.abs(entryX - x) > 3 && !besideDugout) route.push({ x, z: rearZ });
        const pathMin = Math.min(x, entryX), pathMax = Math.max(x, entryX);
        [-1, 1].map(side => [side * (STAIR_TOP_X - 1.5), side * (STAIR_BOTTOM_X + 1.5)])
            .filter(([a, b]) => Math.max(a, b) > pathMin && Math.min(a, b) < pathMax)
            .map(ends => ends.sort((a, b) => (a - b) * dir))
            .sort((a, b) => (a[0] - b[0]) * dir)
            .forEach(([nearEnd, farEnd]) => {
                if ((nearEnd - x) * dir > 0) route.push({ x: nearEnd, z: rearZ }, { x: nearEnd, z: walkwayZ });
                route.push({ x: farEnd, z: walkwayZ });
                if (farEnd !== entryX) route.push({ x: farEnd, z: rearZ });
            });

        route.push(
            { x: entryX,                   z: own.centerZ },
            { x: own.topX,                 z: own.centerZ },
            { x: own.bottomX,              z: own.centerZ },
            { x: gx,                       z: own.centerZ },
            { x: gx,                       z: ownZ * (CHAMBER_HALF_Z - 0.5) },
            { x: gx,                       z: 0 },
            { x: gx,                       z: -ownZ * (CHAMBER_HALF_Z - 0.5) },
            { x: gx,                       z: far.centerZ },
            { x: far.bottomX,              z: far.centerZ },
            { x: far.topX,                 z: far.centerZ },
            { x: s * (STAIR_TOP_X - 2.5),  z: far.centerZ },
        );
        return route;
    }

    followTunnelRoute(dt) {
        const mission = this.tunnelMission;
        const wp = mission.waypoints[mission.index];
        const dx = wp.x - this.mesh.position.x;
        const dz = wp.z - this.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.35) {
            mission.index++;
            mission.bestDist = Infinity;
            mission.stallTimer = 0;
            if (mission.index >= mission.waypoints.length) this.completeTunnelMission();
            return;
        }

        // If blocked for a while, skip ahead underground or give up on the surface.
        if (dist < mission.bestDist - 0.25) {
            mission.bestDist = dist;
            mission.stallTimer = 0;
        } else if ((mission.stallTimer += dt) > 3.5) {
            mission.stallTimer = 0;
            mission.bestDist = Infinity;
            if (this.underground || this.inStairwell) {
                mission.index = Math.min(mission.index + 1, mission.waypoints.length - 1);
            } else {
                this.abortTunnelMission();
            }
            return;
        }

        const speed = AI_MOVE_SPEED * AI_TUNNEL_SPEED_FACTOR * (1.0 - (this.suppression * 0.18));
        const step = Math.min(speed * dt, dist);
        this.mesh.position.x += (dx / dist) * step;
        this.mesh.position.z += (dz / dist) * step;
        const diff = wrapAngle(Math.atan2(dx, dz) - this.mesh.rotation.y);
        this.mesh.rotation.y += diff * 10 * dt;
    }

    // Picks tunnel cover near us that puts an obstacle between us and `threat`.
    // With `advance`, only cover at least 2 m closer to the threat counts.
    seekTunnelCover(threat, advance = false) {
        const mission = this.tunnelMission;
        if (!mission || !this.underground || this.inStairwell || !threat) return false;
        mission.coverSeekTime = nowSeconds();
        const myPos = this.mesh.position;
        const tPos = getEntityPosition(threat);
        const myThreatDist = Math.abs(tPos.z - myPos.z);
        const teammates = getTeamMembers(this);
        let best = null;
        let bestScore = Infinity;

        for (const point of mission.tunnel.coverPoints) {
            const dist = Math.hypot(point.x - myPos.x, point.z - myPos.z);
            if (dist > AI_TUNNEL_COVER_RANGE || point === mission.coverPoint) continue;
            const threatDist = Math.abs(tPos.z - point.z);
            // The obstacle must lie between the spot and the threat, not too close to it.
            if ((point.obstacleZ - point.z) * (tPos.z - point.z) <= 0 || threatDist < 2.5) continue;
            if (advance && threatDist > myThreatDist - 2) continue;
            const taken = teammates.some(s => s !== this && !s.dead && s.tunnelMission &&
                                              s.tunnelMission.coverPoint === point);
            if (taken) continue;
            const score = dist + (advance ? threatDist * 0.3 : 0);
            if (score < bestScore) { bestScore = score; best = point; }
        }

        if (!best) return false;
        mission.coverPoint = best;
        mission.coverTimer = 0;
        // Time spent fighting shouldn't count as being stuck on the route.
        mission.bestDist = Infinity;
        mission.stallTimer = 0;
        this.state = 'tunneling';
        return true;
    }

    moveToTunnelCover(dt) {
        const mission = this.tunnelMission;
        const point = mission.coverPoint;
        const dx = point.x - this.mesh.position.x;
        const dz = point.z - this.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        mission.coverTimer += dt;
        if (dist < 0.3 || mission.coverTimer > 4) {
            if (dist >= 0.3) mission.coverPoint = null;   // couldn't get there
            this.state = 'hidden';
            this.timer = 0.3 + Math.random() * 0.4;
            return;
        }
        // Dash between cover, faster than the careful creep along the route.
        const speed = AI_MOVE_SPEED * 1.1 * (1.0 - (this.suppression * 0.18));
        const step = Math.min(speed * dt, dist);
        this.mesh.position.x += (dx / dist) * step;
        this.mesh.position.z += (dz / dist) * step;
        const diff = wrapAngle(Math.atan2(dx, dz) - this.mesh.rotation.y);
        this.mesh.rotation.y += diff * 10 * dt;
    }

    completeTunnelMission() {
        // Out in the enemy front trench: fight from their cover positions.
        this.tunnelMission = null;
        this.isAdvancing   = true;
        this.coverTier     = 3;
        this.pickCover();
        this.state = 'moving';
    }

    abortTunnelMission() {
        this.tunnelMission = null;
        this.pickCover();
        this.state = 'moving';
    }

    releaseRole() {
        const commander = getCommander(this.isEnemy);
        if (this.commandPhaseId === commander.phaseId && commander.roleCounts[this.role] > 0) {
            commander.roleCounts[this.role]--;
        }
        // Mark as unassigned so a respawn never double-releases.
        this.commandPhaseId = -1;
    }

    assignRoleFromCommander(force = false) {
        if (this.dead && !force) return;
        const commander = getCommander(this.isEnemy);
        if (!force && this.commandPhaseId === commander.phaseId) return;

        let nextRole = commander.defaultRole;
        for (const role of commander.rolePriority) {
            if (commander.roleCounts[role] < commander.roleQuotas[role]) {
                nextRole = role;
                break;
            }
        }

        commander.roleCounts[nextRole]++;
        this.role = nextRole;
        this.commandPhaseId = commander.phaseId;

        if (this.role === 'flank') {
            this.flankSide = (commander.flankAssignments % 2 === 0) ? commander.flankSide : -commander.flankSide;
            commander.flankAssignments++;
        } else {
            this.flankSide = commander.flankSide;
        }

        this.isAdvancing = this.role === 'push' || this.role === 'flank' ||
            (commander.mode === 'push' && this.role === 'suppress');

        if (!this.isAdvancing) this.coverTier = 0;
    }

    getAdvanceCap() {
        const nerve = this.getNerve();
        if (this.role === 'hold') return nerve < 0.45 ? 0 : 1;
        if (this.role === 'suppress') return nerve < 0.4 ? 1 : 2;
        return 4;
    }

    shouldAdvanceFromCover() {
        const nerve = this.getNerve();
        if (!this.isAdvancing || nerve < 0.22) return false;
        if (this.role === 'push') return Math.random() < clamp(0.45 + (nerve * 0.6), 0.2, 0.95);
        if (this.role === 'flank') return Math.random() < clamp(0.35 + (nerve * 0.55), 0.15, 0.9);
        if (this.role === 'suppress') return Math.random() < clamp(0.08 + (nerve * 0.35), 0.05, 0.45);
        return Math.random() < clamp(0.03 + (nerve * 0.18), 0.02, 0.2);
    }

    shouldAdvanceAfterSearch() {
        const nerve = this.getNerve();
        if (!this.isAdvancing || nerve < 0.24) return false;
        if (this.role === 'push') return Math.random() < clamp(0.35 + (nerve * 0.45), 0.15, 0.8);
        if (this.role === 'flank') return Math.random() < clamp(0.45 + (nerve * 0.45), 0.2, 0.95);
        if (this.role === 'suppress') return Math.random() < clamp(0.05 + (nerve * 0.3), 0.03, 0.35);
        return Math.random() < clamp(0.03 + (nerve * 0.2), 0.02, 0.2);
    }

    getBurstAdvanceChance() {
        const nerve = this.getNerve();
        if (!this.isAdvancing) return 0.04;
        if (this.role === 'push') return clamp(0.2 + (nerve * 0.7), 0.08, 0.95);
        if (this.role === 'flank') return clamp(0.18 + (nerve * 0.65), 0.08, 0.9);
        if (this.role === 'suppress') return clamp(0.05 + (nerve * 0.35), 0.04, 0.45);
        return clamp(0.02 + (nerve * 0.2), 0.02, 0.2);
    }

    getRepositionChance() {
        const stress = this.getStress();
        if (this.role === 'flank') return clamp(0.25 + (stress * 0.25), 0.18, 0.5);
        if (this.role === 'push') return clamp(0.12 + (stress * 0.25), 0.08, 0.35);
        if (this.role === 'suppress') return clamp(0.12 + (stress * 0.2), 0.08, 0.28);
        return clamp(0.06 + (stress * 0.18), 0.04, 0.18);
    }

    scoreCover(cover) {
        const progress = this.isEnemy ? -cover.z : cover.z;
        const homeDepth = this.isEnemy ? cover.z : -cover.z;
        const flankBias = this.flankSide === 0 ? 0 : (Math.sign(cover.x || 0) === this.flankSide ? 1.5 : -0.4);
        const sideLaneBias = Math.abs(cover.x || 0) / 35;
        const stress = this.getStress();
        let score = 0;

        if (cover.isTurret) {
            if (this.role === 'suppress') score += 5;
            else if (this.role === 'hold') score += 2;
            else score -= 2;
        }

        if (this.role === 'push') {
            score += progress / 10;
            score -= homeDepth / 24;
        } else if (this.role === 'flank') {
            score += sideLaneBias * 2.5;
            score += flankBias;
            score += progress / 14;
            if (cover.isTurret) score -= 4;
        } else if (this.role === 'suppress') {
            score += (progress / 18);
            score += (cover.isTurret ? 1.5 : 0);
            score -= Math.abs(this.mesh.position.x - cover.x) / 40;
        } else {
            score += homeDepth / 10;
            score -= progress / 16;
            score -= Math.abs(this.mesh.position.x - cover.x) / 45;
        }

        if (this.coverTier === 0 && this.role === 'hold' && this.trenchLevel === 'back' && Math.abs(cover.z) > 25) score += 1.5;
        if (this.coverTier > 0 && this.role === 'flank') score += sideLaneBias;
        score += homeDepth * stress * 0.08;
        score -= progress * stress * 0.05;
        return score;
    }

    getStress() {
        return clamp((this.suppression * 0.7) + ((1 - this.morale) * 0.8), 0, 1.25);
    }

    getNerve() {
        return clamp((this.morale * 1.05) - (this.suppression * 0.7), 0, 1.2);
    }

    getCombatEfficiency() {
        let efficiency = this.morale * (1.1 - (this.suppression * 0.55));
        if (this.role === 'suppress') efficiency *= 0.92;
        if (this.role === 'push') efficiency *= 1.04;
        if (this.state === 'aiming' || this.state === 'shooting' || this.state === 'using_turret') efficiency *= 1.04;
        return clamp(efficiency, 0.25, 1.25);
    }

    getExposureForIncomingFire() {
        let exposure = this.state === 'moving' ? 1.0 : (this.state === 'using_turret' ? 0.9 : 0.62);
        exposure *= (1.0 - (this.crouchT * 0.3));
        if (this.role === 'hold') exposure *= 0.9;
        if (this.role === 'push') exposure *= 1.05;
        return clamp(exposure, 0.2, 1.2);
    }

    adjustMorale(delta) {
        this.morale = clamp(this.morale + delta, 0.2, 1.15);
    }

    applySuppression(amount, attacker = null) {
        this.suppression = clamp(this.suppression + amount, 0, 1.4);
        if (attacker && isHostile(attacker, this) && Math.random() < 0.65) {
            this.rememberTarget(attacker, 0.45);
        }
    }

    onNearbyCasualty(distance, attacker) {
        const shock = (1 - clamp(distance / 18, 0, 1));
        this.applySuppression(0.22 + (shock * 0.35), attacker);
        this.adjustMorale(-(AI_MORALE_CASUALTY_PENALTY * (0.45 + shock)));
        if (this.state === 'moving' && shock > 0.4 && Math.random() < 0.6) {
            if (this.coverTier > 0) this.coverTier--;
            this.pickCover();
        }
    }

    resolveAIDamage(attacker, amount, hitInfo = null) {
        if (!isHostile(attacker, this)) return AI_DAMAGE_FROM_AI;
        if (hitInfo && hitInfo.headshot) return Math.max(this.hp, 1);

        const weaponType = hitInfo && hitInfo.weaponType ? hitInfo.weaponType : 'rifle';
        const distance = hitInfo && hitInfo.distance
            ? hitInfo.distance
            : attacker.mesh.position.distanceTo(this.mesh.position);
        const distanceFactor = 1 - clamp(distance / (weaponType === 'turret' ? 75 : 55), 0, 1);
        const attackerEfficiency = attacker.getCombatEfficiency ? attacker.getCombatEfficiency() : 0.8;
        const targetExposure = this.getExposureForIncomingFire();
        const fragility = clamp((1 - this.getNerve()) + (this.suppression * 0.3), 0, 1.2);

        let lethalChance = 0.04
            + (distanceFactor * 0.22)
            + ((attackerEfficiency - 0.5) * 0.22)
            + (targetExposure * 0.18)
            + (fragility * 0.16);
        if (weaponType === 'turret') lethalChance += 0.2;
        if (attacker.role === 'push') lethalChance += 0.04;
        if (attacker.role === 'suppress') lethalChance -= 0.03;
        lethalChance = clamp(lethalChance, 0.03, weaponType === 'turret' ? 0.88 : 0.72);

        const woundChance = clamp(lethalChance + 0.38 + (distanceFactor * 0.12), 0.25, 0.97);
        const roll = Math.random();
        if (roll < lethalChance) return Math.max(this.hp, weaponType === 'turret' ? 1.5 : 1);
        if (roll < woundChance) return weaponType === 'turret'
            ? 0.9 + (Math.random() * 0.8)
            : 0.55 + (Math.random() * 0.55);
        return AI_DAMAGE_FROM_AI;
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
        if (this.target && !this.target.isPlayer && !aimPos) {
            const accuracy = this.getCombatEfficiency();
            const distancePenalty = 1.0 + clamp(dist / 55, 0, 1.2);
            const targetPenalty = this.target.state === 'moving' ? 1.15 : 0.95;
            spread *= clamp((4.8 - (accuracy * 2.2)) * distancePenalty * targetPenalty, 1.6, 7.0);
        }
        dir.x += (Math.random() - 0.5) * spread;
        dir.y += (Math.random() - 0.5) * spread;
        dir.z += (Math.random() - 0.5) * spread;
        dir.normalize();

        showMuzzleFlash(visualStart, dir);
        raycaster.set(eyeStart, dir);

        if (this.shotsFired % 4 === 0) {
            playPositionalSound(visualStart, 'gunshot');
        }

        const hitTargets = canPerceive(this, playerAI) ? [playerAI.mesh] : [];
        for (const soldier of [...allies, ...enemies]) {
            if (soldier !== this && soldier.mesh.visible && canPerceive(this, soldier)) hitTargets.push(soldier.mesh);
        }
        const intersects = raycaster.intersectObjects([...getBulletMeshes(), ...hitTargets], true);

        let hitDistance = 200;
        if (intersects.length > 0) {
            const hit   = intersects[0];
            hitDistance = hit.distance;
            playPositionalSound(hit.point, 'impact');
            if (hit.object.userData.ai) {
                const hitAI = hit.object.userData.ai;
                if (hitAI.isPlayer) hitAI.takeDamage(1, this);
                else hitAI.takeDamage(hit.object.name === "head" ? 99 : 1, this, {
                    weaponType: 'rifle',
                    headshot: hit.object.name === "head",
                    distance: hit.distance,
                });
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
                    createRicochet(hit.point, normal, reflection);
                    if (camera.getWorldPosition(new THREE.Vector3()).distanceToSquared(hit.point) < 64.0) {
                        playSoundFile('whiz', 1.5 + Math.random() * 0.5, 0.2);
                    }
                }
            }
        }

        // The round flies from the eye; draw its tracer from the muzzle to where it landed.
        if (Math.random() < 0.25) createTracerTo(visualStart, eyeStart.clone().addScaledVector(dir, hitDistance));

        const bulletRay = new THREE.Ray(eyeStart, dir);
        const hitPool   = [...allies, ...enemies, playerAI];
        let closestPt   = new THREE.Vector3();
        hitPool.forEach(t => {
            if (!t.dead && canPerceive(this, t)) {
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
                        if (distSq < 16.0) {
                            const proximity = 1.0 - clamp(Math.sqrt(distSq) / 4.0, 0, 1);
                            t.alert(this, AI_SUPPRESSION_FROM_NEAR + (proximity * 0.18));
                        }
                    } else {
                        if (distSq < 2.0) playNearMissSound();
                    }
                }
            }
        });
    }
}

export function spawnSoldiers(count) {
    resetTeamCommanders();
    allies.forEach(a => scene.remove(a.mesh));
    enemies.forEach(e => scene.remove(e.mesh));
    allies.length  = 0;
    enemies.length = 0;
    for (let i = 0; i < count; i++) {
        allies.push(new AI(false));
        enemies.push(new AI(true));
    }
}
