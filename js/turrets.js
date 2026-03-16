// ================================================================
// TURRET CLASS & PLACEMENT
// ================================================================

import { scene } from './scene.js';
import { turrets } from './state.js';
import { wallMat, worldMeshes, collisionObstacles, allyCoversBack, enemyCoversBack,
         allyCoversFront, allyCoversMiddle, enemyCoversFront, enemyCoversMiddle,
         createWall, addCover, blockCenters, blockWidths,
         MIDDLE_TRENCH_Z, REAR_TRENCH_Z } from './world.js';

export class Turret {
    constructor(x, y, z, isEnemy, coverArr = null) {
        this.isEnemy = isEnemy;
        this.mesh    = new THREE.Group();
        this.mesh.position.set(x, y, z);

        // Ammo state
        this.ammo       = 5;
        this.maxAmmo    = 5;
        this.isReloading = false;
        this.reloadTimer = 0;

        // --- Geometry ---
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.6, 8), wallMat);
        base.position.y = -0.3;
        this.mesh.add(base);

        this.swivel = new THREE.Group();
        this.swivel.position.y = 0.1;
        this.baseYaw = isEnemy ? 0 : Math.PI;
        this.swivel.rotation.y = this.baseYaw;
        this.mesh.add(this.swivel);

        this.pitchGroup = new THREE.Group();
        this.swivel.add(this.pitchGroup);

        const receiver = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.2, 0.5),
            new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
        );
        this.pitchGroup.add(receiver);

        const waterJacket = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.8, 12),
            new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
        );
        waterJacket.rotation.x = Math.PI / 2;
        waterJacket.position.set(0, 0, -0.65);
        this.pitchGroup.add(waterJacket);

        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.03, 0.2, 8),
            new THREE.MeshLambertMaterial({ color: 0x111111 })
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = -1.15;
        this.pitchGroup.add(barrel);

        const gripBar = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.02, 0.02),
            new THREE.MeshLambertMaterial({ color: 0x111111 })
        );
        gripBar.position.set(0, 0, 0.26);

        const lGrip = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.015, 0.1),
            new THREE.MeshLambertMaterial({ color: 0x3a2e15 })
        );
        lGrip.rotation.x = Math.PI / 2;
        lGrip.position.set(-0.09, 0, 0.3);

        const rGrip = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.015, 0.1),
            new THREE.MeshLambertMaterial({ color: 0x3a2e15 })
        );
        rGrip.rotation.x = Math.PI / 2;
        rGrip.position.set(0.09, 0, 0.3);

        const triggerThumb = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.02, 0.02),
            new THREE.MeshLambertMaterial({ color: 0x555555 })
        );
        triggerThumb.position.set(0, 0, 0.28);
        this.pitchGroup.add(gripBar, lGrip, rGrip, triggerThumb);

        const ammoBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.2, 0.25),
            new THREE.MeshLambertMaterial({ color: 0x3a4530 })
        );
        ammoBox.position.set(-0.18, -0.05, 0);
        this.pitchGroup.add(ammoBox);

        for (let b = 0; b < 4; b++) {
            let bullet = new THREE.Mesh(
                new THREE.CylinderGeometry(0.008, 0.008, 0.04, 6),
                new THREE.MeshLambertMaterial({ color: 0xccaa44 })
            );
            bullet.rotation.z = Math.PI / 2;
            bullet.position.set(-0.12 + (b * 0.02), 0.05, 0);
            this.pitchGroup.add(bullet);
        }

        const shieldL = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.5, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x3a4530 })
        );
        shieldL.position.set(-0.25, -0.15, -0.2);

        const shieldR = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.5, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x3a4530 })
        );
        shieldR.position.set(0.25, -0.15, -0.2);

        const shieldB = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.2, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x3a4530 })
        );
        shieldB.position.set(0, -0.3, -0.2);
        this.pitchGroup.add(shieldL, shieldR, shieldB);

        const tRSightBase = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.02, 0.04),
            new THREE.MeshLambertMaterial({ color: 0x111111 })
        );
        tRSightBase.position.set(0, 0.11, 0.15);

        const tRSightL = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.04, 0.04),
            new THREE.MeshLambertMaterial({ color: 0x111111 })
        );
        tRSightL.position.set(-0.04, 0.14, 0.15);

        const tRSightR = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.04, 0.04),
            new THREE.MeshLambertMaterial({ color: 0x111111 })
        );
        tRSightR.position.set(0.04, 0.14, 0.15);

        const tFSight = new THREE.Mesh(
            new THREE.BoxGeometry(0.01, 0.08, 0.02),
            new THREE.MeshLambertMaterial({ color: 0x111111 })
        );
        tFSight.position.set(0, 0.12, -1.0);
        this.pitchGroup.add(tRSightBase, tRSightL, tRSightR, tFSight);

        this.dummyShell = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.015, 0.1, 8),
            new THREE.MeshLambertMaterial({ color: 0xccaa44 })
        );
        this.dummyShell.rotation.x = Math.PI / 2;
        this.dummyShell.visible = false;
        this.pitchGroup.add(this.dummyShell);

        scene.add(this.mesh);
        worldMeshes.push(base, shieldL, shieldR, shieldB, receiver, waterJacket, ammoBox);
        collisionObstacles.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
        turrets.push(this);

        this.user     = null;
        this.lastShot = 0;

        const zOffset = this.isEnemy ? 1.0 : -1.0;
        this.coverPos = { x: this.mesh.position.x, z: this.mesh.position.z + zOffset, isTurret: true, turret: this };
        const targetCoverArray = coverArr || (this.isEnemy ? enemyCoversBack : allyCoversBack);
        targetCoverArray.push(this.coverPos);
    }
}

export function buildElevatedWallAndCovers(zPos, isEnemy, coverArr, turretConfig = null) {
    const leftBlock  = 1;
    const rightBlock = 3;
    const turretBlocks = [leftBlock, rightBlock];
    const turretCounts = {};
    turretBlocks.forEach(b => {
        const possibleCounts = [1, 3, 5, 7];
        turretCounts[b] = possibleCounts[Math.floor(Math.random() * possibleCounts.length)];
    });

    for (let i = 0; i < blockCenters.length; i++) {
        const cx = blockCenters[i];
        const w  = blockWidths[i];
        createWall(cx, zPos, w, 0.8, 1.4);
        let startX = cx - w/2 + 2;
        let endX   = cx + w/2 - 2;
        let count  = 0;
        for (let x = startX; x <= endX; x += 4) {
            if (count % 2 === 0) {
                createWall(x, zPos, 3.5, 1.8, 1.9);
            } else {
                const targetZ = isEnemy ? zPos + 1.2 : zPos - 1.2;
                const shouldPlaceTurret = turretConfig
                    ? (i === turretConfig.blockIndex && count === turretConfig.countIndex)
                    : (turretCounts[i] === count);
                if (shouldPlaceTurret) {
                    new Turret(x, 2.0, zPos, isEnemy, coverArr);
                } else {
                    coverArr.push({ x: x, z: targetZ, y: 1.0 });
                }
            }
            count++;
        }
    }
}

// --- Build the two elevated walls ---
buildElevatedWallAndCovers(-REAR_TRENCH_Z, false, allyCoversBack);
buildElevatedWallAndCovers( REAR_TRENCH_Z, true, enemyCoversBack);

// --- Build middle trench walls and one staggered turret per side ---
buildElevatedWallAndCovers(-MIDDLE_TRENCH_Z, false, allyCoversMiddle, { blockIndex: 2, countIndex: 3 });
buildElevatedWallAndCovers( MIDDLE_TRENCH_Z, true, enemyCoversMiddle, { blockIndex: 2, countIndex: 5 });

// --- Scattered front-line cover ---
for (let x = -96; x <= 96; x += 4 + Math.random() * 3) {
    if (Math.abs(x + 60) < 5 || Math.abs(x + 20) < 5 || Math.abs(x - 20) < 5 || Math.abs(x - 60) < 5) continue;
    if (Math.abs(x + 40) < 4 || Math.abs(x - 40) < 4) continue;
    let oxA = x + (Math.random() - 0.5) * 2;
    addCover(oxA, -18.5 + (Math.random() - 0.5), allyCoversFront, -1.2);
    let oxE = x + (Math.random() - 0.5) * 2;
    addCover(oxE,  18.5 + (Math.random() - 0.5), enemyCoversFront, 1.2);
}
