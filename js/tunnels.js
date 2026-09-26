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

// --- Lighting ---
// Scene lights have no shadows, so surface explosions and battle flashes
// would light the tunnels through the ground. Underground geometry is
// therefore unlit and instead carries lantern light baked into its vertex
// colours once the tunnels are built.
const bakeQueue = [];
const bakeLights = [];
const AMBIENT = [0.34, 0.3, 0.26];
const LANTERN_LIGHT  = { color: [1.0, 0.72, 0.42], strength: 1.9, range: 14 };
const DAYLIGHT_LIGHT = { color: [0.75, 0.8, 0.9],  strength: 1.6, range: 8 };

function bakedMaterial(color) {
    const mat = new THREE.MeshBasicMaterial({ color, vertexColors: true });
    mat.userData.baked = true;
    return mat;
}

// --- Materials ---
const earthMat   = bakedMaterial(0x2b2218);
const floorMat   = bakedMaterial(0x241c14);
const timberMat  = bakedMaterial(0x4a3520);
const sandbagMat = bakedMaterial(0x6b5f45);
const crateMat   = bakedMaterial(0x5c4326);
const cartMat    = bakedMaterial(0x3b3b38);
const darkMat    = bakedMaterial(0x1c1c1a);
const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
// Above-ground parts of the dugouts use normal scene lighting.
const surfaceEarthMat   = new THREE.MeshLambertMaterial({ color: 0x4a3c2b });
const surfaceTimberMat  = new THREE.MeshLambertMaterial({ color: 0x4a3520 });
const surfaceSandbagMat = new THREE.MeshLambertMaterial({ color: 0x6b5f45 });

const WALL_T = 0.3;
const WALL_BOTTOM_Y = TUNNEL_FLOOR_Y - 0.2;

function addBox(minX, maxX, minY, maxY, minZ, maxZ, mat, lists = []) {
    const w = maxX - minX, h = maxY - minY, d = maxZ - minZ;
    let geometry;
    if (mat.userData.baked) {
        // Subdivide so baked lighting can vary across long walls.
        const segs = len => Math.max(1, Math.min(48, Math.ceil(len / 1.2)));
        geometry = new THREE.BoxGeometry(w, h, d, segs(w), segs(h), segs(d));
    } else {
        geometry = new THREE.BoxGeometry(w, h, d);
    }
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    scene.add(mesh);
    lists.forEach(list => list.push(mesh));
    if (mat.userData.baked) bakeQueue.push(mesh);
    return mesh;
}

// Writes lantern and daylight into the vertex colours of every tunnel mesh.
function bakeTunnelLighting() {
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    bakeQueue.forEach(mesh => {
        const pos = mesh.geometry.attributes.position;
        const nor = mesh.geometry.attributes.normal;
        const colors = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).add(mesh.position);
            n.fromBufferAttribute(nor, i);
            let r = AMBIENT[0], g = AMBIENT[1], b = AMBIENT[2];
            for (const light of bakeLights) {
                const dx = light.x - v.x, dy = light.y - v.y, dz = light.z - v.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist >= light.range) continue;
                const facing = dist > 0.001 ? Math.max(0, (n.x * dx + n.y * dy + n.z * dz) / dist) : 1;
                const f = light.strength * Math.pow(1 - dist / light.range, 1.5) * (0.3 + 0.7 * facing);
                r += light.color[0] * f;
                g += light.color[1] * f;
                b += light.color[2] * f;
            }
            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
        }
        mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    });
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
function wallAlongZ(x, outward, zFrom, zTo, gaps, minY, maxY, lists, mat = earthMat) {
    const x0 = outward > 0 ? x : x - WALL_T;
    solidSpans(zFrom, zTo, gaps).forEach(([z0, z1]) =>
        addBox(x0, x0 + WALL_T, minY, maxY, z0, z1, mat, lists));
}

function wallAlongX(z, outward, xFrom, xTo, gaps, minY, maxY, lists, mat = earthMat) {
    const z0 = outward > 0 ? z : z - WALL_T;
    solidSpans(xFrom, xTo, gaps).forEach(([x0, x1]) =>
        addBox(x0, x1, minY, maxY, z0, z0 + WALL_T, mat, lists));
}

function addLantern(x, y, z) {
    addBox(x - 0.08, x + 0.08, y - 0.12, y + 0.12, z - 0.08, z + 0.08, lanternMat);
    bakeLights.push({ x, y, z, ...LANTERN_LIGHT });
}

// Builds one piece of tunnel cover; it blocks movement, sight and bullets.
function buildObstacle(o) {
    const lists = [tunnelMeshes];
    const y0 = TUNNEL_FLOOR_Y;
    const y1 = TUNNEL_FLOOR_Y + o.height;
    const w = o.maxX - o.minX;
    if (o.kind === 'sandbags') {
        // Two courses of bags, the top one slightly narrower.
        addBox(o.minX, o.maxX, y0, y0 + o.height * 0.55, o.minZ, o.maxZ, sandbagMat, lists);
        addBox(o.minX + 0.08, o.maxX - 0.08, y0 + o.height * 0.55, y1, o.minZ + 0.05, o.maxZ - 0.05, sandbagMat, lists);
    } else if (o.kind === 'crates') {
        // A stack of two crates beside a taller one.
        const split = o.minX + w * 0.55;
        addBox(o.minX, split, y0, y1, o.minZ, o.maxZ, timberMat, lists);
        addBox(split + 0.04, o.maxX, y0, y0 + o.height * 0.7, o.minZ + 0.1, o.maxZ - 0.1, crateMat, lists);
    } else if (o.kind === 'timber') {
        // Pile of spare shoring beams.
        const layers = 4;
        for (let i = 0; i < layers; i++) {
            const inset = i * 0.06;
            addBox(o.minX + inset, o.maxX - inset, y0 + (o.height / layers) * i, y0 + (o.height / layers) * (i + 1),
                   o.minZ + inset, o.maxZ - inset, i % 2 ? crateMat : timberMat, lists);
        }
    } else {
        // Overturned mine cart on its side.
        addBox(o.minX, o.maxX, y0 + 0.15, y1, o.minZ, o.maxZ, cartMat, lists);
        addBox(o.minX + 0.1, o.minX + 0.3, y0, y0 + 0.3, o.minZ - 0.05, o.maxZ + 0.05, darkMat, lists);
        addBox(o.maxX - 0.3, o.maxX - 0.1, y0, y0 + 0.3, o.minZ - 0.05, o.maxZ + 0.05, darkMat, lists);
    }
    tunnelObstacles.push({ minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ });
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

    // Side walls run from the gallery floor up to the dugout roof; the part
    // above the trench floor is lit like the rest of the surface.
    const zSign = stair.zSign;
    [[stair.innerZ, -zSign], [stair.outerZ, zSign]].forEach(([z, outward]) => {
        wallAlongX(z, outward, stair.minX, stair.maxX, [], WALL_BOTTOM_Y, TRENCH_FLOOR_Y, both);
        wallAlongX(z, outward, stair.minX, stair.maxX, [], TRENCH_FLOOR_Y, BUNKER_ROOF_Y, both, surfaceEarthMat);
    });
    // Back wall above the gallery opening.
    const wallMinZ = Math.min(stair.innerZ - zSign * WALL_T, stair.outerZ + zSign * WALL_T);
    const wallMaxZ = Math.max(stair.innerZ - zSign * WALL_T, stair.outerZ + zSign * WALL_T);
    const endX0 = dir > 0 ? stair.bottomX : stair.bottomX - WALL_T;
    addBox(endX0, endX0 + WALL_T, TUNNEL_CEILING_Y, TRENCH_FLOOR_Y, wallMinZ, wallMaxZ, earthMat, both);
    addBox(endX0, endX0 + WALL_T, TRENCH_FLOOR_Y, BUNKER_ROOF_Y, wallMinZ, wallMaxZ, surfaceEarthMat, both);

    // Dugout roof, sandbags and entrance lintel.
    const roofMinX = Math.min(stair.topX - dir * 0.3, stair.bottomX + dir * WALL_T);
    const roofMaxX = Math.max(stair.topX - dir * 0.3, stair.bottomX + dir * WALL_T);
    addBox(roofMinX, roofMaxX, BUNKER_ROOF_Y, BUNKER_ROOF_Y + 0.2, wallMinZ, wallMaxZ, surfaceTimberMat, [worldMeshes]);
    addBox(roofMinX + 0.3, roofMaxX - 0.3, BUNKER_ROOF_Y + 0.2, BUNKER_ROOF_Y + 0.5,
           wallMinZ + 0.15, wallMaxZ - 0.15, surfaceSandbagMat, [worldMeshes]);
    addBox(stair.topX - 0.1, stair.topX + 0.1, BUNKER_ROOF_Y - 0.25, BUNKER_ROOF_Y, wallMinZ, wallMaxZ, surfaceTimberMat, both);
    addLantern((stair.topX + stair.bottomX) / 2, TRENCH_FLOOR_Y - 0.4, stair.innerZ + zSign * 0.2);
    // Daylight spilling down the stairs from the entrance.
    bakeLights.push({ x: stair.topX - dir * 0.5, y: TRENCH_FLOOR_Y + 0.8, z: stair.centerZ, ...DAYLIGHT_LIGHT });

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

    // Timber shoring frames along the gallery (they stop bullets but are too
    // thin to need movement collision).
    for (let z = gallery.minZ + 2; z < gallery.maxZ - 1; z += 3.5) {
        if (Math.abs(z) < chamber.maxZ + 0.5) continue;
        addBox(gallery.minX, gallery.minX + 0.15, TUNNEL_FLOOR_Y, TUNNEL_CEILING_Y, z - 0.08, z + 0.08, timberMat, lists);
        addBox(gallery.maxX - 0.15, gallery.maxX, TUNNEL_FLOOR_Y, TUNNEL_CEILING_Y, z - 0.08, z + 0.08, timberMat, lists);
        addBox(gallery.minX, gallery.maxX, TUNNEL_CEILING_Y - 0.15, TUNNEL_CEILING_Y, z - 0.08, z + 0.08, timberMat, lists);
    }

    // Cover for the underground firefights.
    tunnel.obstacles.forEach(buildObstacle);

    addLantern(tunnel.galleryX, TUNNEL_CEILING_Y - 0.35, 0);
    addLantern(tunnel.galleryX, TUNNEL_CEILING_Y - 0.35, allyStair.centerZ + 3);
    addLantern(tunnel.galleryX, TUNNEL_CEILING_Y - 0.35, enemyStair.centerZ - 3);
    [-11, 11].forEach(z => addLantern(tunnel.galleryX, TUNNEL_CEILING_Y - 0.35, z));

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

// Geometry on both layers. The galleries lie wholly below the surface, so a
// ray from one layer only reaches the other's geometry through a stairwell.
// Bullets, shells and ricochets test against this so they always stop at
// the first solid surface, whichever layer it belongs to.
export function getBulletMeshes() {
    const key = worldMeshes.length * 100000 + tunnelMeshes.length;
    if (key !== allMeshesKey) {
        allMeshes = [...new Set([...worldMeshes, ...tunnelMeshes])];
        allMeshesKey = key;
    }
    return allMeshes;
}

// Geometry that can block a line between `a` and `b` (b may be null).
export function getOcclusionMeshes(a, b = null) {
    const stairwell = isInStairwell(a) || (b && isInStairwell(b));
    if (!stairwell) return isUnderground(a) ? tunnelMeshes : worldMeshes;
    return getBulletMeshes();
}

// True for a world-space point in the tunnel layer (below the trench floor).
export function isUndergroundPoint(p) {
    return p.y < TRENCH_FLOOR_Y - 0.5;
}

TUNNELS.forEach(buildTunnel);
bakeTunnelLighting();
