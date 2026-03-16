// ================================================================
// WORLD GEOMETRY & TERRAIN
// ================================================================

import { scene } from './scene.js';

// --- Shared state ---
export const worldMeshes        = [];
export const collisionObstacles = [];

// --- Terrain height function ---
export function getTerrainHeight(x, z) {
    const absZ = Math.abs(z);
    if (absZ < 22.0) return -1.2;
    if (absZ >= 22.0 && absZ < 26.0) {
        const inGap = (Math.abs(x + 60) < 4.2) || (Math.abs(x + 20) < 4.2) ||
                      (Math.abs(x - 20) < 4.2) || (Math.abs(x - 60) < 4.2);
        if (inGap) {
            return -1.2 + (2.2 * ((absZ - 22.0) / 4.0));
        } else {
            return 1.0;
        }
    }
    if (absZ >= 30.0 && absZ < 34.0) return -1.2;
    if (absZ >= 34.0 && absZ < 38.0) {
        const inGap = (Math.abs(x + 60) < 4.2) || (Math.abs(x + 20) < 4.2) ||
                      (Math.abs(x - 20) < 4.2) || (Math.abs(x - 60) < 4.2);
        if (inGap) {
            return -1.2 + (2.2 * ((absZ - 34.0) / 4.0));
        }
    }
    return 1.0;
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
            if (minD === dLeft)   pos.x = obs.minX - radius;
            else if (minD === dRight)  pos.x = obs.maxX + radius;
            else if (minD === dTop)    pos.z = obs.minZ - radius;
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

// --- Base ground plane ---
const baseFloor = new THREE.Mesh(new THREE.PlaneGeometry(200, 128), groundMat);
baseFloor.rotation.x = -Math.PI / 2;
baseFloor.position.set(0, -1.2, 0);
scene.add(baseFloor);
worldMeshes.push(baseFloor);

// --- No Man's Land raised platform regions ---
const nmlRegions = [
    { x: -71.5, w: 57, z: -9.75, d: 15.5 },
    { x:    0,  w: 74, z: -9.75, d: 15.5 },
    { x:  71.5, w: 57, z: -9.75, d: 15.5 },
    { x: -71.5, w: 57, z:  9.75, d: 15.5 },
    { x:    0,  w: 74, z:  9.75, d: 15.5 },
    { x:  71.5, w: 57, z:  9.75, d: 15.5 },
];
nmlRegions.forEach(reg => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(reg.w, 1.2, reg.d), groundMat);
    b.position.set(reg.x, -0.6, reg.z);
    scene.add(b);
    worldMeshes.push(b);
    collisionObstacles.push({ minX: reg.x - reg.w/2, maxX: reg.x + reg.w/2, minZ: reg.z - reg.d/2, maxZ: reg.z + reg.d/2 });
});

// --- Battlefield floor planes ---
const bfA = new THREE.Mesh(new THREE.PlaneGeometry(200, 4), wallMat);
bfA.rotation.x = -Math.PI / 2;
bfA.position.set(0, 1.0, -28);
const bfARear = new THREE.Mesh(new THREE.PlaneGeometry(200, 12.75), wallMat);
bfARear.rotation.x = -Math.PI / 2;
bfARear.position.set(0, 1.0, -44.375);
const bfE = new THREE.Mesh(new THREE.PlaneGeometry(200, 4), wallMat);
bfE.rotation.x = -Math.PI / 2;
bfE.position.set(0, 1.0, 28);
const bfERear = new THREE.Mesh(new THREE.PlaneGeometry(200, 12.75), wallMat);
bfERear.rotation.x = -Math.PI / 2;
bfERear.position.set(0, 1.0, 44.375);
scene.add(bfA, bfARear, bfE, bfERear);
worldMeshes.push(bfA, bfARear, bfE, bfERear);

// --- Ramps and trench-lip blocks ---
const rampGeo     = new THREE.PlaneGeometry(8, 4.565);
const gapCenters  = [-60, -20, 20, 60];
export const blockCenters = [-82, -40, 0, 40, 82];
export const blockWidths  = [36, 32, 32, 32, 36];

for (let i = 0; i < blockCenters.length; i++) {
    let cx = blockCenters[i];
    let w  = blockWidths[i];

    let bA = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, 4.0), groundMat);
    bA.position.set(cx, -0.1, -24.0);
    scene.add(bA);
    worldMeshes.push(bA);
    collisionObstacles.push({ minX: cx - w/2, maxX: cx + w/2, minZ: -26.0, maxZ: -22.0 });

    let bE = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, 4.0), groundMat);
    bE.position.set(cx, -0.1, 24.0);
    scene.add(bE);
    worldMeshes.push(bE);
    collisionObstacles.push({ minX: cx - w/2, maxX: cx + w/2, minZ: 22.0, maxZ: 26.0 });
}

for (let i = 0; i < blockCenters.length; i++) {
    let cx = blockCenters[i];
    let w  = blockWidths[i];

    let bA1 = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, 4.0), groundMat);
    bA1.position.set(cx, -0.1, -32.0);
    scene.add(bA1);
    worldMeshes.push(bA1);
    collisionObstacles.push({ minX: cx - w/2, maxX: cx + w/2, minZ: -34.0, maxZ: -30.0 });

    let bE1 = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, 4.0), groundMat);
    bE1.position.set(cx, -0.1, 32.0);
    scene.add(bE1);
    worldMeshes.push(bE1);
    collisionObstacles.push({ minX: cx - w/2, maxX: cx + w/2, minZ: 30.0, maxZ: 34.0 });

    let bA2 = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, 4.0), groundMat);
    bA2.position.set(cx, -0.1, -36.0);
    scene.add(bA2);
    worldMeshes.push(bA2);
    collisionObstacles.push({ minX: cx - w/2, maxX: cx + w/2, minZ: -38.0, maxZ: -34.0 });

    let bE2 = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, 4.0), groundMat);
    bE2.position.set(cx, -0.1, 36.0);
    scene.add(bE2);
    worldMeshes.push(bE2);
    collisionObstacles.push({ minX: cx - w/2, maxX: cx + w/2, minZ: 34.0, maxZ: 38.0 });
}

for (let i = 0; i < gapCenters.length; i++) {
    let rA = new THREE.Mesh(rampGeo, groundMat);
    rA.rotation.x = -Math.PI / 2 + 0.5028;
    rA.position.set(gapCenters[i], -0.1, -24.0);
    scene.add(rA);
    worldMeshes.push(rA);

    let rE = new THREE.Mesh(rampGeo, groundMat);
    rE.rotation.x = -Math.PI / 2 - 0.5028;
    rE.position.set(gapCenters[i], -0.1, 24.0);
    scene.add(rE);
    worldMeshes.push(rE);
}

for (let i = 0; i < gapCenters.length; i++) {
    let rA1 = new THREE.Mesh(rampGeo, groundMat);
    rA1.rotation.x = -Math.PI / 2 - 0.5028;
    rA1.position.set(gapCenters[i], -0.1, -32.0);
    scene.add(rA1);
    worldMeshes.push(rA1);

    let rE1 = new THREE.Mesh(rampGeo, groundMat);
    rE1.rotation.x = -Math.PI / 2 + 0.5028;
    rE1.position.set(gapCenters[i], -0.1, 32.0);
    scene.add(rE1);
    worldMeshes.push(rE1);

    let rA2 = new THREE.Mesh(rampGeo, groundMat);
    rA2.rotation.x = -Math.PI / 2 + 0.5028;
    rA2.position.set(gapCenters[i], -0.1, -36.0);
    scene.add(rA2);
    worldMeshes.push(rA2);

    let rE2 = new THREE.Mesh(rampGeo, groundMat);
    rE2.rotation.x = -Math.PI / 2 - 0.5028;
    rE2.position.set(gapCenters[i], -0.1, 36.0);
    scene.add(rE2);
    worldMeshes.push(rE2);
}

// --- Trench wall builder ---
export function createWall(x, z, w, h, yCenter) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), wallMat);
    mesh.position.set(x, yCenter, z);
    scene.add(mesh);
    worldMeshes.push(mesh);
    collisionObstacles.push({ minX: x - w/2, maxX: x + w/2, minZ: z - 0.25, maxZ: z + 0.25 });
}

// Inner trench walls (front)
createWall(-71.5, -17.75, 57, 1.4, -0.5);
createWall(   0,  -17.75, 74, 1.4, -0.5);
createWall( 71.5, -17.75, 57, 1.4, -0.5);
// Inner trench walls (back)
createWall(-71.5,  17.75, 57, 1.4, -0.5);
createWall(   0,   17.75, 74, 1.4, -0.5);
createWall( 71.5,  17.75, 57, 1.4, -0.5);
// Inner trench walls (middle)
createWall(-71.5, -29.75, 57, 1.4, -0.5);
createWall(   0,  -29.75, 74, 1.4, -0.5);
createWall( 71.5, -29.75, 57, 1.4, -0.5);
createWall(-71.5,  29.75, 57, 1.4, -0.5);
createWall(   0,   29.75, 74, 1.4, -0.5);
createWall( 71.5,  29.75, 57, 1.4, -0.5);
// Outer boundary walls
createWall(0, -50.75, 200, 2.0, 2.0);
createWall(0,  50.75, 200, 2.0, 2.0);

// --- Random jagged buttresses along trench walls ---
for (let i = 0; i < 50; i++) {
    let bx = (Math.random() - 0.5) * 190;
    let bz = Math.random() > 0.5 ? (-17.5 + (Math.random() * 1.5)) : (17.5 - (Math.random() * 1.5));
    if (Math.abs(bx + 60) < 5 || Math.abs(bx + 20) < 5 || Math.abs(bx - 20) < 5 || Math.abs(bx - 60) < 5) continue;
    let bw = 1.0 + Math.random() * 4.0;
    let bh = 1.0 + Math.random() * 1.5;
    let bm = new THREE.Mesh(
        new THREE.BoxGeometry(bw, bh, 0.8 + Math.random()),
        Math.random() > 0.5 ? wallMat : groundMat
    );
    bm.position.set(bx, -1.2 + bh / 2, bz);
    bm.rotation.y = (Math.random() - 0.5) * 0.4;
    scene.add(bm);
    worldMeshes.push(bm);
    collisionObstacles.push({ minX: bx - bw/2, maxX: bx + bw/2, minZ: bz - 0.6, maxZ: bz + 0.6 });
}

// --- Side boundary walls ---
const sideWallGeo = new THREE.BoxGeometry(2, 10, 108);
const sw1 = new THREE.Mesh(sideWallGeo, wallMat); sw1.position.set(-100, 0, 0);
const sw2 = new THREE.Mesh(sideWallGeo, wallMat); sw2.position.set( 100, 0, 0);
scene.add(sw1, sw2);
worldMeshes.push(sw1, sw2);
collisionObstacles.push({ minX: -101, maxX:  -99, minZ: -54, maxZ: 54 });
collisionObstacles.push({ minX:   99, maxX:  101, minZ: -54, maxZ: 54 });

// --- Cover position arrays ---
export const allyCoversFront  = [];
export const allyCoversMiddle = [];
export const allyCoversBack   = [];
export const enemyCoversFront = [];
export const enemyCoversMiddle = [];
export const enemyCoversBack  = [];
export const allyPathCovers   = [];
export const enemyPathCovers  = [];
export const midCoversAlly    = [];
export const midCoversEnemy   = [];

// --- Cover box builder ---
export function addCover(x, z, arr, dirZ) {
    let bw   = 1.2 + Math.random() * 0.8;
    let bd   = 0.8 + Math.random() * 0.4;
    let mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, 1.2 + Math.random() * 0.5, bd), woodMat);
    mesh.position.set(x, -0.6, z);
    mesh.rotation.y = (Math.random() - 0.5) * 1.5;
    scene.add(mesh);
    worldMeshes.push(mesh);
    let maxR = Math.max(bw, bd) / 1.5;
    collisionObstacles.push({ minX: x - maxR, maxX: x + maxR, minZ: z - maxR, maxZ: z + maxR });
    arr.push({ x: x, z: z + dirZ, y: -1.2 });
}

// Path covers (jittered)
addCover(-41.5 + Math.random()*2, -12 + (Math.random()-0.5)*3, allyPathCovers, -1.2);
addCover(-38.5 - Math.random()*2,  -6 + (Math.random()-0.5)*3, allyPathCovers, -1.2);
addCover( 41.5 + Math.random()*2, -12 + (Math.random()-0.5)*3, allyPathCovers, -1.2);
addCover( 38.5 - Math.random()*2,  -6 + (Math.random()-0.5)*3, allyPathCovers, -1.2);
addCover(-41.5 + Math.random()*2,  12 + (Math.random()-0.5)*3, enemyPathCovers, 1.2);
addCover(-38.5 - Math.random()*2,   6 + (Math.random()-0.5)*3, enemyPathCovers, 1.2);
addCover( 41.5 + Math.random()*2,  12 + (Math.random()-0.5)*3, enemyPathCovers, 1.2);
addCover( 38.5 - Math.random()*2,   6 + (Math.random()-0.5)*3, enemyPathCovers, 1.2);

// Randomized mid-field skirmish covers
for (let x = -90; x <= 90; x += 5 + Math.random() * 6) {
    if (Math.abs(x + 40) < 5 || Math.abs(x - 40) < 5) continue;
    let zOff = (Math.random() - 0.5) * 12;
    if (Math.random() > 0.5) addCover(x, -2.5 + zOff, midCoversAlly,  -1.2);
    else                     addCover(x,  2.5 + zOff, midCoversEnemy,  1.2);
}

// --- Random chaotic debris ---
for (let i = 0; i < 60; i++) {
    const x = (Math.random() - 0.5) * 180;
    const z = (Math.random() - 0.5) * 100;
    if (Math.abs(x + 40) < 4 || Math.abs(x - 40) < 4) continue;
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
    let maxR = Math.max(bw, bh, bd) / 1.8;
    collisionObstacles.push({ minX: x - maxR, maxX: x + maxR, minZ: z - maxR, maxZ: z + maxR });
}

// --- Ground craters / scorch marks ---
const craterGeo = new THREE.PlaneGeometry(3, 3);
const craterMat = new THREE.MeshBasicMaterial({ color: 0x1a1c14, depthWrite: false, transparent: true, opacity: 0.8 });
for (let i = 0; i < 120; i++) {
    let cr = new THREE.Mesh(craterGeo, craterMat);
    let cx = (Math.random() - 0.5) * 190;
    let cz = (Math.random() - 0.5) * 100;
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
