// ================================================================
// TUNNEL LAYOUT (pure data)
// ================================================================
// Two mine galleries run under No Man's Land, one on each flank. Each
// starts at a roofed dugout stairwell in a front trench, drops to the
// gallery floor, passes through a wider central chamber and climbs a
// matching stairwell into the opposing front trench.
//
// This module has no scene dependencies so world.js can cut the stairwell
// holes out of the trench floor before tunnels.js builds the geometry.

export const TRENCH_FLOOR_Y   = -1.2;
export const TUNNEL_FLOOR_Y   = -5.4;
export const TUNNEL_CEILING_Y = -2.7;
export const TUNNEL_ROOF_Y    = -1.3;   // top of the earth slab above the gallery
export const BUNKER_ROOF_Y    = 1.0;

// Distances from the map centre line (mirrored by x and z sign).
export const STAIR_TOP_X     = 26;      // stair entrance, faces the map centre
export const STAIR_BOTTOM_X  = 34;
export const STAIR_Z_INNER   = 19.8;    // walkway side of the stairwell
export const STAIR_Z_OUTER   = 21.6;    // parapet side of the stairwell
export const GALLERY_X_NEAR  = 34;
export const GALLERY_X_FAR   = 41;
export const CHAMBER_X_NEAR  = 30;
export const CHAMBER_X_FAR   = 45;
export const CHAMBER_HALF_Z  = 6;
export const TRENCH_WALKWAY_Z = 18.8;   // clear lane beside the dugout

function rect(x1, x2, z1, z2) {
    return {
        minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
        minZ: Math.min(z1, z2), maxZ: Math.max(z1, z2),
    };
}

function makeStairwell(xSign, zSign) {
    return {
        xSign,
        zSign,
        topX:    xSign * STAIR_TOP_X,
        bottomX: xSign * STAIR_BOTTOM_X,
        innerZ:  zSign * STAIR_Z_INNER,
        outerZ:  zSign * STAIR_Z_OUTER,
        centerZ: zSign * (STAIR_Z_INNER + STAIR_Z_OUTER) / 2,
        ...rect(xSign * STAIR_TOP_X, xSign * STAIR_BOTTOM_X, zSign * STAIR_Z_INNER, zSign * STAIR_Z_OUTER),
    };
}

// Cover inside each tunnel, for the xSign = +1 tunnel (mirrored for the other).
// Gallery obstacles hug alternate walls and leave a clear centre lane
// (x 36.2..38.8) so soldiers can always move along the route.
// [minX, maxX, minZ, maxZ, height, kind]
const OBSTACLE_TEMPLATE = [
    // Gallery, allied half (mirrored in z below)
    [34.2, 36.0, -16.9, -16.2, 1.2,  'sandbags'],
    [39.0, 40.5, -14.6, -13.4, 1.05, 'crates'],
    [34.2, 35.8, -11.6, -10.6, 1.1,  'timber'],
    [39.0, 40.8,  -8.9,  -8.2, 1.2,  'sandbags'],
    // Chamber
    [30.8, 33.4, -3.9, -3.2, 1.2,  'sandbags'],
    [41.6, 44.2,  3.2,  3.9, 1.2,  'sandbags'],
    [33.8, 35.0,  0.8,  2.0, 1.05, 'crates'],
    [40.0, 41.2, -2.0, -0.8, 1.05, 'crates'],
    [42.6, 44.2, -4.8, -3.8, 1.0,  'cart'],
    [30.8, 32.4,  3.8,  4.8, 1.0,  'cart'],
];
const MIRRORED_IN_Z = 4;   // first N entries are copied to the enemy half

function buildObstacles(xSign) {
    const rows = [...OBSTACLE_TEMPLATE];
    for (let i = 0; i < MIRRORED_IN_Z; i++) {
        const [x0, x1, z0, z1, h, kind] = OBSTACLE_TEMPLATE[i];
        rows.push([x0, x1, -z1, -z0, h, kind]);
    }
    return rows.map(([x0, x1, z0, z1, height, kind]) => ({ ...rect(xSign * x0, xSign * x1, z0, z1), height, kind }));
}

// Spots on either side of each obstacle along the gallery axis. The
// obstacle shields a soldier there from enemies further along that axis.
function buildCoverPoints(obstacles) {
    return obstacles.flatMap(o => {
        const x = (o.minX + o.maxX) / 2;
        const z = (o.minZ + o.maxZ) / 2;
        return [
            { x, z: o.minZ - 0.6, obstacleZ: z },
            { x, z: o.maxZ + 0.6, obstacleZ: z },
        ];
    });
}

export const TUNNELS = [-1, 1].map(xSign => {
    const allyStair  = makeStairwell(xSign, -1);
    const enemyStair = makeStairwell(xSign,  1);
    const gallery = rect(xSign * GALLERY_X_NEAR, xSign * GALLERY_X_FAR, -STAIR_Z_OUTER, STAIR_Z_OUTER);
    const chamber = rect(xSign * CHAMBER_X_NEAR, xSign * CHAMBER_X_FAR, -CHAMBER_HALF_Z, CHAMBER_HALF_Z);
    // Areas an underground soldier can stand in. The stair areas extend into
    // the gallery so the two overlap and movement between them is seamless.
    const obstacles = buildObstacles(xSign);
    const walkable = [
        rect(xSign * STAIR_TOP_X, xSign * GALLERY_X_FAR, allyStair.innerZ, allyStair.outerZ),
        rect(xSign * STAIR_TOP_X, xSign * GALLERY_X_FAR, enemyStair.innerZ, enemyStair.outerZ),
        gallery,
        chamber,
    ];
    return {
        xSign,
        galleryX: xSign * (GALLERY_X_NEAR + GALLERY_X_FAR) / 2,
        allyStair,
        enemyStair,
        gallery,
        chamber,
        walkable,
        obstacles,
        coverPoints: buildCoverPoints(obstacles),
    };
});

export const STAIRWELLS = TUNNELS.flatMap(t => [t.allyStair, t.enemyStair]);

// True if a trench x position is too close to a dugout for loose cover crates.
export function isNearTunnelEntrance(x) {
    return Math.abs(Math.abs(x) - (STAIR_TOP_X + STAIR_BOTTOM_X) / 2) < 7.5;
}
