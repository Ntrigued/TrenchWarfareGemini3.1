// ================================================================
// RAYCASTER UTILITIES
// ================================================================

import { camera } from './scene.js';
import { worldMeshes } from './world.js';
import { getBulletMeshes } from './tunnels.js';
import { createTracer } from './effects.js';

export const raycaster = new THREE.Raycaster();
const bulletRaycaster  = new THREE.Raycaster();

// Distance a round travels from `origin` along `dir` before striking any
// solid surface on either layer, capped at `maxDist`.
function getBulletTravel(origin, dir, maxDist) {
    bulletRaycaster.set(origin, dir);
    bulletRaycaster.far = maxDist;
    const hits = bulletRaycaster.intersectObjects(getBulletMeshes(), false);
    return hits.length > 0 ? hits[0].distance : maxDist;
}

// Ricochet streak leaving a surface at `point`; it stops at the next wall,
// floor or ceiling instead of flying on through the ground.
export function createRicochet(point, normal, dir, maxDist = 60) {
    const start = point.clone().add(normal.clone().multiplyScalar(0.03));
    createTracer(start, dir, getBulletTravel(start, dir, maxDist));
}

// Returns true if a world-space spot is visible from the player's camera
export function isSpotVisibleToPlayer(spot) {
    const camPos  = camera.getWorldPosition(new THREE.Vector3());
    const spotPos = new THREE.Vector3(spot.x, spot.y + 1.0, spot.z);
    const dir     = spotPos.clone().sub(camPos).normalize();
    const dist    = camPos.distanceTo(spotPos);
    const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    if (camForward.dot(dir) < 0.2) return false;
    const tempRaycaster = new THREE.Raycaster(camPos, dir);
    const intersects    = tempRaycaster.intersectObjects(worldMeshes, false);
    return !(intersects.length > 0 && intersects[0].distance < dist);
}
