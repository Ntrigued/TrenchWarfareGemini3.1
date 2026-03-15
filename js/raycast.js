// ================================================================
// RAYCASTER UTILITIES
// ================================================================

import { camera } from './scene.js';
import { worldMeshes } from './world.js';

export const raycaster = new THREE.Raycaster();

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
