// ================================================================
// VISUAL EFFECTS POOLS & ATMOSPHERIC VISUALS
// ================================================================

import { scene } from './scene.js';
import { TUNNEL_ROOF_Y } from './tunnelLayout.js';

// --- Procedural muzzle flash texture ---
const flashTexCanvas  = document.createElement('canvas');
flashTexCanvas.width  = 16;
flashTexCanvas.height = 16;
const fctx = flashTexCanvas.getContext('2d');
fctx.fillStyle = "rgba(200, 50, 0, 0.5)";
fctx.fillRect(6, 2, 4, 12);
fctx.fillRect(2, 6, 12, 4);
fctx.fillStyle = "rgba(255, 120, 0, 0.8)";
fctx.fillRect(7, 3, 2, 10);
fctx.fillRect(3, 7, 10, 2);
fctx.fillRect(5, 5, 6, 6);
fctx.fillStyle = "rgba(255, 220, 100, 1)";
fctx.fillRect(6, 6, 4, 4);
fctx.fillStyle = "rgba(255, 255, 255, 1)";
fctx.fillRect(7, 7, 2, 2);
export const flashTexture = new THREE.CanvasTexture(flashTexCanvas);
flashTexture.magFilter = THREE.NearestFilter;
flashTexture.minFilter = THREE.NearestFilter;

// --- World muzzle flashes ---
export const flashes = [];
for (let i = 0; i < 20; i++) {
    const f = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.5),
        new THREE.MeshBasicMaterial({ map: flashTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    );
    scene.add(f);
    flashes.push({ mesh: f, life: 0 });
}

export function showMuzzleFlash(pos, dir) {
    const f = flashes.find(fl => fl.life <= 0);
    if (f) {
        f.life = 0.05;
        f.mesh.position.copy(pos).add(dir.clone().multiplyScalar(0.4));
        f.mesh.lookAt(f.mesh.position.clone().add(dir));
        f.mesh.rotateZ(Math.random() * Math.PI * 2);
        const sx = (Math.random() > 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.6);
        const sy = (Math.random() > 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.6);
        f.mesh.scale.set(sx, sy, 1);
        f.mesh.material.opacity = 1;
    }
}

// --- Explosion pool ---
// The fireball grows to ~10 m across, far larger than the earth between the
// surface and the tunnels, so each one is clipped to its own layer at the
// top of the tunnel roof slab.
const SURFACE_CLIP     = new THREE.Plane(new THREE.Vector3(0,  1, 0), -TUNNEL_ROOF_Y);  // keeps y >= roof
const UNDERGROUND_CLIP = new THREE.Plane(new THREE.Vector3(0, -1, 0),  TUNNEL_ROOF_Y);  // keeps y <= roof
export const explosions = [];
const expGeo     = new THREE.SphereGeometry(1, 16, 16);
const expMat     = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
for (let i = 0; i < 15; i++) {
    const mat = expMat.clone();
    mat.clippingPlanes = [SURFACE_CLIP];
    const m = new THREE.Mesh(expGeo, mat);
    m.visible = false;
    const l = new THREE.PointLight(0xff6600, 0, 40);
    scene.add(m);
    scene.add(l);
    explosions.push({ mesh: m, light: l, life: 0, maxLife: 0.5, underground: false });
}

export function createExplosion(pos, underground = false) {
    const exp = explosions.find(e => e.life <= 0);
    if (exp) {
        exp.life = exp.maxLife;
        exp.underground = underground;
        // Same plane count as before, so swapping it needs no shader rebuild.
        exp.mesh.material.clippingPlanes[0] = underground ? UNDERGROUND_CLIP : SURFACE_CLIP;
        exp.mesh.position.copy(pos);
        exp.light.position.copy(pos);
        exp.visible = true;
        exp.mesh.visible = true;
        exp.mesh.scale.setScalar(0.5);
        exp.mesh.material.color.setHex(0xffffff);
        exp.mesh.material.opacity = 1;
        // Lit by the explosion update, which knows which layer the player sees.
        exp.light.intensity = 0;
    }
}

// --- Bullet impact pool ---
export const impacts   = [];
const impactGeo = new THREE.PlaneGeometry(0.3, 0.3);
const impactMat = new THREE.MeshBasicMaterial({ color: 0x887755, transparent: true, opacity: 1, depthWrite: false });
for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(impactGeo, impactMat.clone());
    m.visible = false;
    scene.add(m);
    impacts.push({ mesh: m, life: 0 });
}

export function createImpact(pos, normal) {
    const imp = impacts.find(i => i.life <= 0);
    if (imp) {
        imp.life = 0.2;
        imp.mesh.position.copy(pos).add(normal.clone().multiplyScalar(0.02));
        imp.mesh.lookAt(pos.clone().add(normal));
        imp.mesh.scale.set(0.1, 0.1, 0.1);
        imp.mesh.material.opacity = 1;
        imp.mesh.visible = true;
    }
}

// --- Tracer pool ---
// A tracer is a streak TRACER_LENGTH long whose tail starts at `start`. Its
// head leads the tail, so the streak shortens as it arrives and never pokes
// past `maxDist` (the surface the round struck).
export const TRACER_LENGTH = 8;
export const tracers   = [];
const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -TRACER_LENGTH)]);
for (let i = 0; i < 100; i++) {
    const t = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffcc88 }));
    t.visible = false;
    scene.add(t);
    tracers.push({ mesh: t, life: 0, dir: new THREE.Vector3(), traveled: 0, maxDist: 200 });
}

export function createTracer(start, dir, maxDist = 200) {
    const t = tracers.find(tr => tr.life <= 0);
    if (t) {
        t.life = 0.8;
        t.mesh.position.copy(start);
        t.dir.copy(dir);
        t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
        t.mesh.visible = true;
        t.traveled = 0;
        t.maxDist   = maxDist;
        setTracerLength(t);
    }
}

// Tracer from `start` that ends exactly at `end`.
export function createTracerTo(start, end) {
    const dir  = end.clone().sub(start);
    const dist = dir.length();
    if (dist < 0.01) return;
    createTracer(start, dir.divideScalar(dist), dist);
}

// Shortens the streak so its head stops at the tracer's end point.
export function setTracerLength(t) {
    const remaining = t.maxDist - t.traveled;
    t.mesh.scale.z = Math.max(0.001, Math.min(1, remaining / TRACER_LENGTH));
}

// --- Ash particle system ---
const ashGeo   = new THREE.BufferGeometry();
export const ashCount = 1000;
const ashPos   = new Float32Array(ashCount * 3);
for (let i = 0; i < ashCount * 3; i += 3) {
    ashPos[i]   = (Math.random() - 0.5) * 200;
    ashPos[i+1] = Math.random() * 10;
    ashPos[i+2] = (Math.random() - 0.5) * 100;
}
ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
const ashMat       = new THREE.PointsMaterial({ color: 0x666666, size: 0.15, transparent: true, opacity: 0.5 });
export const ashParticles = new THREE.Points(ashGeo, ashMat);
scene.add(ashParticles);

// --- Distant artillery flash lights ---
export const horizonLights = [];
for (let i = 0; i < 6; i++) {
    let l = new THREE.PointLight(0xffaa55, 0, 150);
    l.position.set(
        (Math.random() - 0.5) * 180,
        5,
        (i % 2 === 0 ? 1 : -1) * (40 + Math.random() * 20)
    );
    scene.add(l);
    horizonLights.push({ light: l, timer: 0 });
}
