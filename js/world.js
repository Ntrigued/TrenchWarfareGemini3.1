// ================================================================
// WORLD GEOMETRY & TERRAIN
// ================================================================

import { scene } from './scene.js';

// --- Shared state ---
export const worldMeshes        = [];
export const collisionObstacles = [];

// --- Battlefield layout constants ---
export const LOW_GROUND_Y          = -1.2;
export const RAISED_GROUND_Y       = 1.0;
export const TRENCH_HEIGHT_DELTA   = RAISED_GROUND_Y - LOW_GROUND_Y;
export const PLAYABLE_HALF_WIDTH   = 95;
export const PLAYABLE_HALF_DEPTH   = 48.3;
export const OUTER_BOUNDARY_WALL_Z = 48.75;
export const SIDE_WALL_HALF_DEPTH  = 52;

export const WALL_GAP_CENTERS  = [-40, 40];
export const RAMP_GAP_CENTERS  = [-60, -20, 20, 60];
export const blockCenters      = [-82, -40, 0, 40, 82];
export const blockWidths       = [36, 32, 32, 32, 36];
export const HOME_TRENCH_LEVELS = ['back', 'middle', 'front'];

export const FRONT_TRENCH = {
    wallAbsZ: 17.75,
    coverAbsZ: 18.5,
    minAbsZ: 18.2,
    maxAbsZ: 21.8,
};

export const FRONT_LIP_BAND = {
    startAbsZ: 22.0,
    endAbsZ: 26.0,
    centerAbsZ: 24.0,
};

export const MIDDLE_ENTRY_BAND = {
    startAbsZ: 28.0,
    endAbsZ: 30.0,
    centerAbsZ: 29.0,
};

export const MIDDLE_TRENCH = {
    wallAbsZ: 29.75,
    coverAbsZ: 30.6,
    minAbsZ: 30.2,
    maxAbsZ: 33.8,
};

export const MIDDLE_EXIT_BAND = {
    startAbsZ: 34.0,
    endAbsZ: 38.0,
    centerAbsZ: 36.0,
};

export const BACK_TRENCH = {
    wallAbsZ: 42.25,
    coverAbsZ: 43.45,
    minAbsZ: 42.8,
    maxAbsZ: 48.2,
};

export const CONNECTOR_PLATEAU = {
    startAbsZ: FRONT_LIP_BAND.endAbsZ,
    endAbsZ: MIDDLE_ENTRY_BAND.startAbsZ,
    centerAbsZ: (FRONT_LIP_BAND.endAbsZ + MIDDLE_ENTRY_BAND.startAbsZ) / 2,
    depth: MIDDLE_ENTRY_BAND.startAbsZ - FRONT_LIP_BAND.endAbsZ,
};

export const REAR_PLATEAU = {
    startAbsZ: MIDDLE_EXIT_BAND.endAbsZ,
    endAbsZ: OUTER_BOUNDARY_WALL_Z,
    centerAbsZ: (MIDDLE_EXIT_BAND.endAbsZ + OUTER_BOUNDARY_WALL_Z) / 2,
    depth: OUTER_BOUNDARY_WALL_Z - MIDDLE_EXIT_BAND.endAbsZ,
};

const TRENCH_DATA = {
    front: FRONT_TRENCH,
    middle: MIDDLE_TRENCH,
    back: BACK_TRENCH,
};

function isRampGap(x) {
    return RAMP_GAP_CENTERS.some(center => Math.abs(x - center) < 4.2);
}

export function getSignedZ(absZ, isEnemy) {
    return isEnemy ? absZ : -absZ;
}

export function getArenaBounds() {
    return {
        minX: -PLAYABLE_HALF_WIDTH,
        maxX: PLAYABLE_HALF_WIDTH,
        minZ: -PLAYABLE_HALF_DEPTH,
        maxZ: PLAYABLE_HALF_DEPTH,
    };
}

export function getHomeTrenchBounds(trenchLevel, isEnemy) {
    const trench = TRENCH_DATA[trenchLevel];
    if (!trench) throw new Error(`Unknown trench level: ${trenchLevel}`);
    return isEnemy
        ? { minZ: trench.minAbsZ, maxZ: trench.maxAbsZ }
        : { minZ: -trench.maxAbsZ, maxZ: -trench.minAbsZ };
}

export function getHomeTrenchData(trenchLevel) {
    return TRENCH_DATA[trenchLevel];
}

// --- Terrain height function ---
export function getTerrainHeight(x, z) {
    const absZ = Math.abs(z);

    if (absZ < FRONT_LIP_BAND.startAbsZ) return LOW_GROUND_Y;

    if (absZ < FRONT_LIP_BAND.endAbsZ) {
        if (!isRampGap(x)) return RAISED_GROUND_Y;
        const t = (absZ - FRONT_LIP_BAND.startAbsZ) / (FRONT_LIP_BAND.endAbsZ - FRONT_LIP_BAND.startAbsZ);
        return LOW_GROUND_Y + (TRENCH_HEIGHT_DELTA * t);
    }

    if (absZ < MIDDLE_ENTRY_BAND.startAbsZ) return RAISED_GROUND_Y;

    if (absZ < MIDDLE_ENTRY_BAND.endAbsZ) {
        if (!isRampGap(x)) return RAISED_GROUND_Y;
        const t = (absZ - MIDDLE_ENTRY_BAND.startAbsZ) / (MIDDLE_ENTRY_BAND.endAbsZ - MIDDLE_ENTRY_BAND.startAbsZ);
        return RAISED_GROUND_Y - (TRENCH_HEIGHT_DELTA * t);
    }

    if (absZ < MIDDLE_EXIT_BAND.startAbsZ) return LOW_GROUND_Y;

    if (absZ < MIDDLE_EXIT_BAND.endAbsZ) {
        if (!isRampGap(x)) return RAISED_GROUND_Y;
        const t = (absZ - MIDDLE_EXIT_BAND.startAbsZ) / (MIDDLE_EXIT_BAND.endAbsZ - MIDDLE_EXIT_BAND.startAbsZ);
        return LOW_GROUND_Y + (TRENCH_HEIGHT_DELTA * t);
    }

    return RAISED_GROUND_Y;
}

// --- Collision resolution ---
export function resolveObstacles(pos, radius) {
    for (let obs of collisionObstacles) {
        let closestX = Math.max(obs.minX, Math.min(pos.x, obs.maxX));
        let closestZ = Math.max(obs.minZ, Math.min(pos.z, obs.maxZ));
        if (pos.x >= obs.minX && pos.x <= obs.maxX && pos.z >= obs.minZ && pos.z <= obs.maxZ) {
            let dLeft   = pos.x - obs.minX;
            let dRight  = obs.maxX - pos.x;
            let dTop    = pos.z - obs.minZ;
            let dBottom = obs.maxZ - pos.z;
            let minD = Math.min(dLeft, dRight, dTop, dBottom);
            if (minD === dLeft) pos.x = obs.minX - radius;
            else if (minD === dRight) pos.x = obs.maxX + radius;
            else if (minD === dTop) pos.z = obs.minZ - radius;
            else if (minD === dBottom) pos.z = obs.maxZ + radius;
        } else {
            let dx = pos.x - closestX;
            let dz = pos.z - closestZ;
            let distSq = dx * dx + dz * dz;
            if (distSq < radius * radius && distSq > 0.0001) {
                let dist = Math.sqrt(distSq);
                let overlap = radius - dist;
                pos.x += (dx / dist) * overlap;
                pos.z += (dz / dist) * overlap;
            }
        }
    }
}

// --- Materials ---
export const groundMat = new THREE.MeshLambertMaterial({ color: 0x3a4530 });
export const wallMat   = new THREE.MeshLambertMaterial({ color: 0x4a3c2b });
export const woodMat   = new THREE.MeshLambertMaterial({ color: 0x3d2817 });

// --- Cover position arrays ---
export const allyCoversFront   = [];
export const allyCoversMiddle  = [];
export const allyCoversBack    = [];
export const enemyCoversFront  = [];
export const enemyCoversMiddle = [];
export const enemyCoversBack   = [];
export const allyPathCovers    = [];
export const enemyPathCovers   = [];
export const midCoversAlly     = [];
export const midCoversEnemy    = [];

export function getHomeTrenchCovers(isEnemy, trenchLevel) {
    if (trenchLevel === 'front') return isEnemy ? enemyCoversFront : allyCoversFront;
    if (trenchLevel === 'middle') return isEnemy ? enemyCoversMiddle : allyCoversMiddle;
    return isEnemy ? enemyCoversBack : allyCoversBack;
}

// --- Base ground plane ---
const baseFloor = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), groundMat);
baseFloor.rotation.x = -Math.PI / 2;
baseFloor.position.set(0, LOW_GROUND_Y, 0);
scene.add(baseFloor);
worldMeshes.push(baseFloor);

// --- No Man's Land raised platform regions ---
const nmlRegions = [
    { x: -71.5, w: 57, z: -9.75, d: 15.5 },
    { x: 0, w: 74, z: -9.75, d: 15.5 },
    { x: 71.5, w: 57, z: -9.75, d: 15.5 },
    { x: -71.5, w: 57, z: 9.75, d: 15.5 },
    { x: 0, w: 74, z: 9.75, d: 15.5 },
    { x: 71.5, w: 57, z: 9.75, d: 15.5 },
];
nmlRegions.forEach(reg => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(reg.w, 1.2, reg.d), groundMat);
    b.position.set(reg.x, LOW_GROUND_Y / 2, reg.z);
    scene.add(b);
    worldMeshes.push(b);
    collisionObstacles.push({
        minX: reg.x - reg.w / 2,
        maxX: reg.x + reg.w / 2,
        minZ: reg.z - reg.d / 2,
        maxZ: reg.z + reg.d / 2,
    });
});

function addRaisedFloorPlane(absCenterZ, depth) {
    const allyPlane = new THREE.Mesh(new THREE.PlaneGeometry(200, depth), wallMat);
    allyPlane.rotation.x = -Math.PI / 2;
    allyPlane.position.set(0, RAISED_GROUND_Y, -absCenterZ);

    const enemyPlane = new THREE.Mesh(new THREE.PlaneGeometry(200, depth), wallMat);
    enemyPlane.rotation.x = -Math.PI / 2;
    enemyPlane.position.set(0, RAISED_GROUND_Y, absCenterZ);

    scene.add(allyPlane, enemyPlane);
    worldMeshes.push(allyPlane, enemyPlane);
}

// --- Raised battlefield floor planes ---
addRaisedFloorPlane(CONNECTOR_PLATEAU.centerAbsZ, CONNECTOR_PLATEAU.depth);
addRaisedFloorPlane(REAR_PLATEAU.centerAbsZ, REAR_PLATEAU.depth);

function getRampRotation(isEnemy, risesOutward, angle) {
    const side = isEnemy ? 1 : -1;
    const slopeDir = risesOutward ? -1 : 1;
    return -Math.PI / 2 + (side * slopeDir * angle);
}

function addTransitionBand(centerAbsZ, depth, risesOutward) {
    const rampGeo = new THREE.PlaneGeometry(8, Math.sqrt((depth * depth) + (TRENCH_HEIGHT_DELTA * TRENCH_HEIGHT_DELTA)));
    const rampAngle = Math.atan2(TRENCH_HEIGHT_DELTA, depth);

    for (let i = 0; i < blockCenters.length; i++) {
        const cx = blockCenters[i];
        const w  = blockWidths[i];

        const allyBlock = new THREE.Mesh(new THREE.BoxGeometry(w, TRENCH_HEIGHT_DELTA, depth), groundMat);
        allyBlock.position.set(cx, LOW_GROUND_Y + (TRENCH_HEIGHT_DELTA / 2), -centerAbsZ);
        scene.add(allyBlock);
        worldMeshes.push(allyBlock);
        collisionObstacles.push({ minX: cx - (w / 2), maxX: cx + (w / 2), minZ: -centerAbsZ - (depth / 2), maxZ: -centerAbsZ + (depth / 2) });

        const enemyBlock = new THREE.Mesh(new THREE.BoxGeometry(w, TRENCH_HEIGHT_DELTA, depth), groundMat);
        enemyBlock.position.set(cx, LOW_GROUND_Y + (TRENCH_HEIGHT_DELTA / 2), centerAbsZ);
        scene.add(enemyBlock);
        worldMeshes.push(enemyBlock);
        collisionObstacles.push({ minX: cx - (w / 2), maxX: cx + (w / 2), minZ: centerAbsZ - (depth / 2), maxZ: centerAbsZ + (depth / 2) });
    }

    for (let i = 0; i < RAMP_GAP_CENTERS.length; i++) {
        const gapX = RAMP_GAP_CENTERS[i];

        const allyRamp = new THREE.Mesh(rampGeo, groundMat);
        allyRamp.rotation.x = getRampRotation(false, risesOutward, rampAngle);
        allyRamp.position.set(gapX, LOW_GROUND_Y + (TRENCH_HEIGHT_DELTA / 2), -centerAbsZ);
        scene.add(allyRamp);
        worldMeshes.push(allyRamp);

        const enemyRamp = new THREE.Mesh(rampGeo, groundMat);
        enemyRamp.rotation.x = getRampRotation(true, risesOutward, rampAngle);
        enemyRamp.position.set(gapX, LOW_GROUND_Y + (TRENCH_HEIGHT_DELTA / 2), centerAbsZ);
        scene.add(enemyRamp);
        worldMeshes.push(enemyRamp);
    }
}

// --- Trench lip blocks and transitions ---
addTransitionBand(FRONT_LIP_BAND.centerAbsZ, FRONT_LIP_BAND.endAbsZ - FRONT_LIP_BAND.startAbsZ, true);
addTransitionBand(MIDDLE_ENTRY_BAND.centerAbsZ, MIDDLE_ENTRY_BAND.endAbsZ - MIDDLE_ENTRY_BAND.startAbsZ, false);
addTransitionBand(MIDDLE_EXIT_BAND.centerAbsZ, MIDDLE_EXIT_BAND.endAbsZ - MIDDLE_EXIT_BAND.startAbsZ, true);

// --- Trench wall builder ---
export function createWall(x, z, w, h, yCenter) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), wallMat);
    mesh.position.set(x, yCenter, z);
    scene.add(mesh);
    worldMeshes.push(mesh);
    collisionObstacles.push({ minX: x - (w / 2), maxX: x + (w / 2), minZ: z - 0.25, maxZ: z + 0.25 });
}

function createSegmentedTrenchWall(absZ) {
    createWall(-71.5, -absZ, 57, 1.4, -0.5);
    createWall(0, -absZ, 74, 1.4, -0.5);
    createWall(71.5, -absZ, 57, 1.4, -0.5);

    createWall(-71.5, absZ, 57, 1.4, -0.5);
    createWall(0, absZ, 74, 1.4, -0.5);
    createWall(71.5, absZ, 57, 1.4, -0.5);
}

// --- Inner trench walls ---
createSegmentedTrenchWall(FRONT_TRENCH.wallAbsZ);
createSegmentedTrenchWall(MIDDLE_TRENCH.wallAbsZ);

// --- Outer boundary walls ---
createWall(0, -OUTER_BOUNDARY_WALL_Z, 200, 2.0, 2.0);
createWall(0, OUTER_BOUNDARY_WALL_Z, 200, 2.0, 2.0);

// --- Random jagged buttresses along front trench walls ---
for (let i = 0; i < 50; i++) {
    let bx = (Math.random() - 0.5) * 190;
    let bz = Math.random() > 0.5
        ? (-FRONT_TRENCH.wallAbsZ + (Math.random() * 1.5))
        : (FRONT_TRENCH.wallAbsZ - (Math.random() * 1.5));
    if (WALL_GAP_CENTERS.some(gapX => Math.abs(bx - gapX) < 5)) continue;
    let bw = 1.0 + Math.random() * 4.0;
    let bh = 1.0 + Math.random() * 1.5;
    let bm = new THREE.Mesh(
        new THREE.BoxGeometry(bw, bh, 0.8 + Math.random()),
        Math.random() > 0.5 ? wallMat : groundMat
    );
    bm.position.set(bx, LOW_GROUND_Y + (bh / 2), bz);
    bm.rotation.y = (Math.random() - 0.5) * 0.4;
    scene.add(bm);
    worldMeshes.push(bm);
    collisionObstacles.push({ minX: bx - (bw / 2), maxX: bx + (bw / 2), minZ: bz - 0.6, maxZ: bz + 0.6 });
}

// --- Side boundary walls ---
const sideWallGeo = new THREE.BoxGeometry(2, 10, SIDE_WALL_HALF_DEPTH * 2);
const sw1 = new THREE.Mesh(sideWallGeo, wallMat);
sw1.position.set(-100, 0, 0);
const sw2 = new THREE.Mesh(sideWallGeo, wallMat);
sw2.position.set(100, 0, 0);
scene.add(sw1, sw2);
worldMeshes.push(sw1, sw2);
collisionObstacles.push({ minX: -101, maxX: -99, minZ: -SIDE_WALL_HALF_DEPTH, maxZ: SIDE_WALL_HALF_DEPTH });
collisionObstacles.push({ minX: 99, maxX: 101, minZ: -SIDE_WALL_HALF_DEPTH, maxZ: SIDE_WALL_HALF_DEPTH });

// --- Cover box builder ---
export function addCover(x, z, arr, dirZ, meta = {}) {
    const bw   = 1.2 + Math.random() * 0.8;
    const bd   = 0.8 + Math.random() * 0.4;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, 1.2 + Math.random() * 0.5, bd), woodMat);
    mesh.position.set(x, LOW_GROUND_Y + 0.6, z);
    mesh.rotation.y = (Math.random() - 0.5) * 1.5;
    scene.add(mesh);
    worldMeshes.push(mesh);
    const maxR = Math.max(bw, bd) / 1.5;
    collisionObstacles.push({ minX: x - maxR, maxX: x + maxR, minZ: z - maxR, maxZ: z + maxR });

    const coverZ = z + dirZ;
    arr.push({
        x,
        z: coverZ,
        y: getTerrainHeight(x, coverZ),
        ...meta,
    });
}

// Path covers (jittered)
addCover(-41.5 + (Math.random() * 2), -12 + ((Math.random() - 0.5) * 3), allyPathCovers, -1.2, { zone: 'path' });
addCover(-38.5 - (Math.random() * 2), -6 + ((Math.random() - 0.5) * 3), allyPathCovers, -1.2, { zone: 'path' });
addCover(41.5 + (Math.random() * 2), -12 + ((Math.random() - 0.5) * 3), allyPathCovers, -1.2, { zone: 'path' });
addCover(38.5 - (Math.random() * 2), -6 + ((Math.random() - 0.5) * 3), allyPathCovers, -1.2, { zone: 'path' });
addCover(-41.5 + (Math.random() * 2), 12 + ((Math.random() - 0.5) * 3), enemyPathCovers, 1.2, { zone: 'path' });
addCover(-38.5 - (Math.random() * 2), 6 + ((Math.random() - 0.5) * 3), enemyPathCovers, 1.2, { zone: 'path' });
addCover(41.5 + (Math.random() * 2), 12 + ((Math.random() - 0.5) * 3), enemyPathCovers, 1.2, { zone: 'path' });
addCover(38.5 - (Math.random() * 2), 6 + ((Math.random() - 0.5) * 3), enemyPathCovers, 1.2, { zone: 'path' });

// Randomized mid-field skirmish covers
for (let x = -90; x <= 90; x += 5 + (Math.random() * 6)) {
    if (WALL_GAP_CENTERS.some(gapX => Math.abs(x - gapX) < 5)) continue;
    let zOff = (Math.random() - 0.5) * 12;
    if (Math.random() > 0.5) addCover(x, -2.5 + zOff, midCoversAlly, -1.2, { zone: 'midfield' });
    else addCover(x, 2.5 + zOff, midCoversEnemy, 1.2, { zone: 'midfield' });
}

// --- Random chaotic debris ---
for (let i = 0; i < 75; i++) {
    const x = (Math.random() - 0.5) * 180;
    const z = (Math.random() - 0.5) * (PLAYABLE_HALF_DEPTH * 1.8);
    if (WALL_GAP_CENTERS.some(gapX => Math.abs(x - gapX) < 4)) continue;
    let bw = 0.8 + Math.random();
    let bh = 0.5 + Math.random();
    let bd = 0.8 + Math.random();
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(bw, bh, bd),
        Math.random() > 0.5 ? woodMat : wallMat
    );
    mesh.position.set(x, getTerrainHeight(x, z) + 0.2, z);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(mesh);
    worldMeshes.push(mesh);
    const maxR = Math.max(bw, bh, bd) / 1.8;
    collisionObstacles.push({ minX: x - maxR, maxX: x + maxR, minZ: z - maxR, maxZ: z + maxR });
}

// --- Ground craters / scorch marks ---
const craterGeo = new THREE.PlaneGeometry(3, 3);
const craterMat = new THREE.MeshBasicMaterial({ color: 0x1a1c14, depthWrite: false, transparent: true, opacity: 0.8 });
for (let i = 0; i < 140; i++) {
    let cr = new THREE.Mesh(craterGeo, craterMat);
    let cx = (Math.random() - 0.5) * 190;
    let cz = (Math.random() - 0.5) * (PLAYABLE_HALF_DEPTH * 1.85);
    let s  = 0.5 + Math.random() * 2;
    cr.scale.set(s, s, s);
    cr.rotation.x = -Math.PI / 2;
    cr.rotation.z = Math.random() * Math.PI;
    cr.position.set(cx, getTerrainHeight(cx, cz) + 0.02, cz);
    scene.add(cr);
}

// --- Lighting ---
const ambient  = new THREE.AmbientLight(0x404040, 1.5);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffddbb, 0.8);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);
