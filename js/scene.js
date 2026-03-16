// ================================================================
// THREE.JS SCENE SETUP
// ================================================================

import { FOG_COLOR, FOG_DENSITY } from './config.js';

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
scene.background = new THREE.Color(FOG_COLOR);

export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
export const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
