// ================================================================
// TUNNEL SYSTEM
// ================================================================
// Builds the mine galleries described in tunnelLayout.js and provides the
// two-layer movement rules used by the player and AI. Every entity is either
// on the surface or underground; it can only switch layer by walking through
// a dugout stairwell, where the ground height follows the stairs.

import { scene } from './scene.js';
import { state } from './state.js';
import { worldMeshes, collisionObstacles, resolveObstacles, getTerrainHeight } from './world.js';
import { TUNNELS, STAIRWELLS, TRENCH_FLOOR_Y, TUNNEL_FLOOR_Y, TUNNEL_CEILING_Y,
         TUNNEL_ROOF_Y, BUNKER_ROOF_Y } from './tunnelLayout.js';

// Meshes that block sight and bullets underground. Stairwell meshes are in
// both this list and worldMeshes since they sit between the two layers.
export const tunnelMeshes = [];
const tunnelObstacles = [];   // props inside the galleries
// Soldiers not ordered through a tunnel treat each stairwell as solid.
const stairObstacles = STAIRWELLS.map(s => ({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ }));
const WALKABLE = TUNNELS.flatMap(t => t.walkable);

// --- Materials ---
const earthMat   = new THREE.MeshLambertMaterial({ color: 0x2b2218 });
const floorMat   = new THREE.MeshLambertMaterial({ color: 0x241c14 });
const timberMat  = new THREE.MeshLambertMaterial({ color: 0x4a3520 });
const sandbagMat = new THREE.MeshLambertMaterial({ color: 0x6b5f45 });
const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });

const WALL_T = 0.3;
const WALL_BOTTOM_Y = TUNNEL_FLOOR_Y - 0.2;

function addBox(minX, maxX, minY, maxY, minZ, maxZ, mat, lists = []) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ), mat);
    mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    scene.add(mesh);
    lists.forEach(list => list.push(mesh));
    return mesh;
}

// Splits [from, to] into solid pieces around the given gaps.
function solidSpans(from, to, gaps) {
    const spans = [];
    let cursor = from;
    [...gaps].sort((a, b) => a[0] - b[0]).forEach(([g0, g1]) => {
        if (g0 > cursor) spans.push([cursor, g0]);
        cursor = Math.max(cursor, g1);
    });
    if (cursor < to) spans.push([cursor, to]);
    return spans;
}

// Wall running along z at a fixed x; `outward` is the side (+1/-1) it thickens toward.
function wallAlongZ(x, outward, zFrom, zTo, gaps, minY, maxY, lists) {
    const x0 = outward > 0 ? x : x - WALL_T;
    solidSpans(zFrom, zTo, gaps).forEach(([z0, z1]) =>
        addBox(x0, x0 + WALL_T, minY, maxY, z0, z1, earthMat, lists));
}

function wallAlongX(z, outward, xFrom, xTo, gaps, minY, maxY, lists) {
    const z0 = outward > 0 ? z : z - WALL_T;
    solidSpans(xFrom, xTo, gaps).forEach(([x0, x1]) =>
        addBox(x0, x1, minY, maxY, z0, z0 + WALL_T, earthMat, lists));
}

function addLantern(x, y, z) {
    addBox(x - 0.08, x + 0.08, y - 0.12, y + 0.12, z - 0.08, z + 0.08, lanternMat);
    const light = new THREE.PointLight(0xffb060, 1.4, 13, 1.5);
    light.position.set(x, y, z);
    scene.add(light);
}

function buildStairwell(stair) {
    const both = [worldMeshes, tunnelMeshes];
    const dir = Math.sign(stair.bottomX - stair.topX);
    const steps = 10;
    const stepLen = Math.abs(stair.bottomX - stair.topX) / steps;
    for (let i = 0; i < steps; i++) {
        const xa = stair.topX + dir * i * stepLen;
        const xb = xa + dir * stepLen;
        const topY = getStairHeight(stair, (xa + xb) / 2);
        // Steps sit below the trench floor, so only sight lines that pass
        // through the stairwell (which use tunnelMeshes) can touch them.
        addBox(Math.min(xa, xb), Math.max(xa, xb), WALL_BOTTOM_Y, topY, stair.minZ, stair.maxZ, floorMat, [tunnelMeshes]);
    }

    // Side walls run from the gallery floor up to the dugout roof.
    const zSign = stair.zSign;
    wallAlongX(stair.innerZ, -zSign, stair.minX, stair.maxX, [], WALL_BOTTOM_Y, BUNKER_ROOF_Y, both);
    wallAlongX(stair.outerZ,  zSign, stair.minX, stair.maxX, [], WALL_BOTTOM_Y, BUNKER_ROOF_Y, both);
    // Back wall above the gallery opening.
    const wallMinZ = Math.min(stair.innerZ - zSign * WALL_T, stair.outerZ + zSign * WALL_T);
    const wallMaxZ = Math.max(stair.innerZ - zSign * WALL_T, stair.outerZ + zSign * WALL_T);
    const endX0 = dir > 0 ? stair.bottomX : stair.bottomX - WALL_T;
    addBox(endX0, endX0 + WALL_T, TUNNEL_CEILING_Y, BUNKER_ROOF_Y, wallMinZ, wallMaxZ, earthMat, both);

    // Dugout roof, sandbags and entrance lintel.
    const roofMinX = Math.min(stair.topX - dir * 0.3, stair.bottomX + dir * WALL_T);
    const roofMaxX = Math.max(stair.topX - dir * 0.3, stair.bottomX + dir * WALL_T);
    addBox(roofMinX, roofMaxX, BUNKER_ROOF_Y, BUNKER_ROOF_Y + 0.2, wallMinZ, wallMaxZ, timberMat, [worldMeshes]);
    addBox(roofMinX + 0.3, roofMaxX - 0.3, BUNKER_ROOF_Y + 0.2, BUNKER_ROOF_Y + 0.5,
           wallMinZ + 0.15, wallMaxZ - 0.15, sandbagMat, [worldMeshes]);
    addBox(stair.topX - 0.1, stair.topX + 0.1, BUNKER_ROOF_Y - 0.25, BUNKER_ROOF_Y, wallMinZ, wallMaxZ, timberMat);
    addLantern((stair.topX + stair.bottomX) / 2, TRENCH_FLOOR_Y - 0.4, stair.innerZ + zSign * 0.2);

    // Surface collision: the dugout walls (the entrance end stays open).
    const wallRects = [
        [stair.minX, stair.maxX, Math.min(stair.innerZ, stair.innerZ - zSign * WALL_T), Math.max(stair.innerZ, stair.innerZ - zSign * WALL_T)],
        [stair.minX, stair.maxX, Math.min(stair.outerZ, stair.outerZ + zSign * WALL_T), Math.max(stair.outerZ, stair.outerZ + zSign * WALL_T)],
        [endX0, endX0 + WALL_T, wallMinZ, wallMaxZ],
    ];
    wallRects.forEach(([minX, maxX, minZ, maxZ]) => collisionObstacles.push({ minX, maxX, minZ, maxZ }));
}

function buildTunnel(tunnel) {
    const { xSign, gallery, chamber, allyStair, enemyStair } = tunnel;
    const lists = [tunnelMeshes];

    // Floor and ceiling slabs.
    [gallery, chamber].forEach(r => {
        addBox(r.minX, r.maxX, WALL_BOTTOM_Y, TUNNEL_FLOOR_Y, r.minZ, r.maxZ, floorMat, lists);
        addBox(r.minX, r.maxX, TUNNEL_CEILING_Y, TUNNEL_ROOF_Y, r.minZ, r.maxZ, earthMat, lists);
    });

    // Gallery walls, open where the stairwells and chamber join.
    const nearX = xSign > 0 ? gallery.minX : gallery.maxX;
    const farX  = xSign > 0 ? gallery.maxX : gallery.minX;
    const stairGap = s => [s.minZ, s.maxZ];
    const chamberGap = [chamber.minZ, chamber.maxZ];
    wallAlongZ(nearX, -xSign, gallery.minZ, gallery.maxZ,
               [stairGap(allyStair), stairGap(enemyStair), chamberGap], WALL_BOTTOM_Y, TUNNEL_ROOF_Y, lists);
    wallAlongZ(farX, xSign, gallery.minZ, gallery.maxZ, [chamberGap], WALL_BOTTOM_Y, TUNNEL_ROOF_Y, lists);
    wallAlongX(gallery.minZ, -1, gallery.minX - WALL_T, gallery.maxX + WALL_T, [], WALL_BOTTOM_Y, TUNNEL_ROOF_Y, lists);
    wallAlongX(gallery.maxZ,  1, gallery.minX - WALL_T, gallery.maxX + WALL_T, [], WALL_BOTTOM_Y, TUNNEL_ROOF_Y, lists);

    // Chamber walls, open to the gallery.
    const galleryGap = [gallery.minX, gallery.maxX];
    wallAlongX(chamber.minZ, -1, chamber.minX - WALL_T, chamber.maxX + WALL_T, [galleryGap], WALL_BOTTOM_Y, TUNNEL_ROOF_Y, lists);
    wallAlongX(chamber.maxZ,  1, chamber.minX - WALL_T, chamber.maxX + WALL_T, [galleryGap], WALL_BOTTOM_Y, TUNNEL_ROOF_Y, lists);
    wallAlongZ(chamber.minX, -1, chamber.minZ, chamber.maxZ, [], WALL_BOTTOM_Y, TUNNEL_ROOF_Y, lists);
    wallAlongZ(chamber.maxX,  1, chamber.minZ, chamber.maxZ, [], WALL_BOTTOM_Y, TUNNEL_ROOF_Y, lists);

    // Timber shoring frames along the gallery (visual only).
    for (let z = gallery.minZ + 2; z < gallery.maxZ - 1; z += 3.5) {
        if (Math.abs(z) < chamber.maxZ + 0.5) continue;
        addBox(gallery.minX, gallery.minX + 0.15, TUNNEL_FLOOR_Y, TUNNEL_CEILING_Y, z - 0.08, z + 0.08, timberMat);
        addBox(gallery.maxX - 0.15, gallery.maxX, TUNNEL_FLOOR_Y, TUNNEL_CEILING_Y, z - 0.08, z + 0.08, timberMat);
        addBox(gallery.minX, gallery.maxX, TUNNEL_CEILING_Y - 0.15, TUNNEL_CEILING_Y, z - 0.08, z + 0.08, timberMat);
    }

    // Crates in the chamber give the underground fights some cover.
    const chamberCenterX = (chamber.minX + chamber.maxX) / 2;
    [[chamberCenterX - 2.2, -1.6], [chamberCenterX + 2.2, 1.6]].forEach(([x, z]) => {
        const half = 0.5;
        addBox(x - half, x + half, TUNNEL_FLOOR_Y, TUNNEL_FLOOR_Y + 0.9, z - half, z + half, timberMat, lists);
        tunnelObstacles.push({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half });
    });

    addLantern(tunnel.galleryX, TUNNEL_CEILING_Y - 0.35, 0);
    addLantern(tunnel.galleryX, TUNNEL_CEILING_Y - 0.35, allyStair.centerZ + 3);
    addLantern(tunnel.galleryX, TUNNEL_CEILING_Y - 0.35, enemyStair.centerZ - 3);

    buildStairwell(allyStair);
    buildStairwell(enemyStair);
}

// ================================================================
// LAYER-AWARE MOVEMENT
// ================================================================

function getStairAt(x, z) {
    for (let i = 0; i < STAIRWELLS.length; i++) {
        const s = STAIRWELLS[i];
        if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return s;
    }
    return null;
}

function getStairProgress(stair, x) {
    const t = (x - stair.topX) / (stair.bottomX - stair.topX);
    return Math.max(0, Math.min(1, t));
}

function getStairHeight(stair, x) {
    return TRENCH_FLOOR_Y + (TUNNEL_FLOOR_Y - TRENCH_FLOOR_Y) * getStairProgress(stair, x);
}

export function getGroundHeight(x, z, underground) {
    const stair = getStairAt(x, z);
    if (stair) return getStairHeight(stair, x);
    return underground ? TUNNEL_FLOOR_Y : getTerrainHeight(x, z);
}

// Stairwells are the only place the layer changes: past the halfway point
// of the stairs an entity counts as underground.
export function updateLayer(x, z, underground) {
    const stair = getStairAt(x, z);
    if (!stair) return { underground, inStairwell: false };
    return { underground: getStairProgress(stair, x) > 0.5, inStairwell: true };
}

function clampToTunnel(pos, radius) {
    let bestX = pos.x, bestZ = pos.z, bestDistSq = Infinity;
    for (let i = 0; i < WALKABLE.length; i++) {
        const r = WALKABLE[i];
        const cx = Math.max(r.minX + radius, Math.min(pos.x, r.maxX - radius));
        const cz = Math.max(r.minZ + radius, Math.min(pos.z, r.maxZ - radius));
        const dSq = (cx - pos.x) * (cx - pos.x) + (cz - pos.z) * (cz - pos.z);
        if (dSq === 0) return;
        if (dSq < bestDistSq) { bestDistSq = dSq; bestX = cx; bestZ = cz; }
    }
    pos.x = bestX;
    pos.z = bestZ;
}

// Collision for one layer. `canUseTunnels` lets the entity step into stairwells.
export function resolveMovement(pos, radius, underground, canUseTunnels) {
    if (underground) {
        clampToTunnel(pos, radius);
        resolveObstacles(pos, radius, tunnelObstacles);
        return;
    }
    resolveObstacles(pos, radius);
    if (!canUseTunnels) resolveObstacles(pos, radius, stairObstacles);
}

// ================================================================
// PERCEPTION ACROSS LAYERS
// ================================================================

export function isUnderground(entity) {
    return entity.isPlayer ? state.playerUnderground : !!entity.underground;
}

export function isInStairwell(entity) {
    return entity.isPlayer ? state.playerInStairwell : !!entity.inStairwell;
}

// Soldiers on different layers can only see or hit each other through a stairwell.
export function canPerceive(a, b) {
    return isUnderground(a) === isUnderground(b) || isInStairwell(a) || isInStairwell(b);
}

let allMeshes = [];
let allMeshesKey = -1;

// Geometry that can block a line between `a` and `b` (b may be null).
export function getOcclusionMeshes(a, b = null) {
    const stairwell = isInStairwell(a) || (b && isInStairwell(b));
    if (!stairwell) return isUnderground(a) ? tunnelMeshes : worldMeshes;
    const key = worldMeshes.length * 100000 + tunnelMeshes.length;
    if (key !== allMeshesKey) {
        allMeshes = [...new Set([...worldMeshes, ...tunnelMeshes])];
        allMeshesKey = key;
    }
    return allMeshes;
}

TUNNELS.forEach(buildTunnel);
