/**
 * Foundation placeholder (phase 0). It only proves that the toolchain works end to end:
 * Vite + TypeScript + Three.js + the @shared alias + WebGL. The Engine agent replaces this file
 * with the real composition root in milestone 1.
 */

import * as THREE from 'three';
import { CELL, CHUNK } from '@shared/constants';
import { hashString } from '@shared/math/rng';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a06);
scene.fog = new THREE.Fog(0x0b0a06, 4, 22);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 100);
camera.position.set(0, 1.62, 0);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(CELL * CHUNK, CELL * CHUNK),
  new THREE.MeshBasicMaterial({ color: 0x8f8448 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.6, 0.6), new THREE.MeshBasicMaterial({ color: 0xb9ac5e }));
pillar.position.set(0, 1.3, -5);
scene.add(pillar);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

ui.innerHTML =
  '<div style="position:absolute;left:24px;bottom:24px;letter-spacing:.3em">LIMINAL — socle technique<br>' +
  `<span style="opacity:.6;letter-spacing:.05em">seed test: ${hashString('liminal')}</span></div>`;

let frames = 0;
renderer.setAnimationLoop((t) => {
  camera.rotation.y = Math.sin(t / 4000) * 0.4;
  renderer.render(scene, camera);
  frames++;
});

// Minimal debug handle so the e2e smoke test can check that frames are being rendered.
(window as unknown as { __LIMINAL__: unknown }).__LIMINAL__ = {
  phase: 'foundation',
  get frames() {
    return frames;
  },
};
