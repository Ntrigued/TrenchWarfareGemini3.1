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
export const TUNNEL_CEILING_Y = -3.0;
export const TUNNEL_ROOF_Y    = -1.3;   // top of the earth slab above the gallery
export const BUNKER_ROOF_Y    = 1.0;

// Distances from the map centre line (mirrored by x and z sign).
export const STAIR_TOP_X     = 26;      // stair entrance, faces the map centre
export const STAIR_BOTTOM_X  = 34;
export const STAIR_Z_INNER   = 19.8;    // walkway side of the stairwell
export const STAIR_Z_OUTER   = 21.6;    // parapet side of the stairwell
export const GALLERY_X_NEAR  = 34;
export const GALLERY_X_FAR   = 36.4;
export const CHAMBER_X_NEAR  = 31.5;
export const CHAMBER_X_FAR   = 39;
export const CHAMBER_HALF_Z  = 3.5;
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

export const TUNNELS = [-1, 1].map(xSign => {
    const allyStair  = makeStairwell(xSign, -1);
    const enemyStair = makeStairwell(xSign,  1);
    const gallery = rect(xSign * GALLERY_X_NEAR, xSign * GALLERY_X_FAR, -STAIR_Z_OUTER, STAIR_Z_OUTER);
    const chamber = rect(xSign * CHAMBER_X_NEAR, xSign * CHAMBER_X_FAR, -CHAMBER_HALF_Z, CHAMBER_HALF_Z);
    // Areas an underground soldier can stand in. The stair areas extend into
    // the gallery so the two overlap and movement between them is seamless.
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
    };
});

export const STAIRWELLS = TUNNELS.flatMap(t => [t.allyStair, t.enemyStair]);

// True if a trench x position is too close to a dugout for loose cover crates.
export function isNearTunnelEntrance(x) {
    return Math.abs(Math.abs(x) - (STAIR_TOP_X + STAIR_BOTTOM_X) / 2) < 7.5;
}
