/**
 * LIMINAL — playable milestone 1: alone in the infinite Level 0.
 * Composition root: renderer + VHS pass, player (fixed 60 Hz simulation, interpolated camera),
 * world streaming, audio and UI.
 *
 * URL parameters (for tests): ?debug=1 exposes window.__LIMINAL__, ?nolock=1 plays without pointer lock.
 */

import * as THREE from 'three';
import { CELL, DT, PLAYER } from '@shared/constants';
import { createHalls, LIGHT_DYING, LIGHT_FLICKER, type Halls } from '@shared/levels/halls';
import { hashString } from '@shared/math/rng';
import type { ActionName } from './core/contracts';
import { createSettingsStore } from './core/settings';
import { GameAudio, type StepMode } from './game/audio';
import { POST_FRAG, POST_VERT } from './game/shaders';
import { GameUI } from './game/ui';
import { WorldView } from './game/world';

const params = new URLSearchParams(location.search);
const NOLOCK = params.has('nolock');
const canvas = document.getElementById('game') as HTMLCanvasElement;
const settings = createSettingsStore();
const audio = new GameAudio();

// --- Renderer and VHS post-processing ---------------------------------------

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.get().fov, 1, 0.05, 90);
camera.rotation.order = 'YXZ';
const target = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true });
const postMaterial = new THREE.ShaderMaterial({
  vertexShader: POST_VERT,
  fragmentShader: POST_FRAG,
  uniforms: { tScene: { value: target.texture }, uTime: { value: 0 }, uVhs: { value: 0 }, uRes: { value: new THREE.Vector2() } },
  depthTest: false,
});
const postScene = new THREE.Scene();
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(w, h, false);
  // The scene is rendered at reduced resolution: cheaper, and softer like a tape.
  const scale = renderer.getPixelRatio() * 0.8;
  target.setSize(Math.round(w * scale), Math.round(h * scale));
  postMaterial.uniforms.uRes.value.set(target.width, target.height);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Game state ---------------------------------------------------------------

type Screen = 'title' | 'playing' | 'paused';
let screen: Screen = 'title';
let seedText = 'liminal';
let halls: Halls = createHalls(hashString(seedText));
let world = new WorldView(halls);
scene.add(world.group);
let time = 0;

const player = {
  x: CELL / 2, z: CELL / 2, px: CELL / 2, pz: CELL / 2,
  vx: 0, vz: 0, yaw: 0, pitch: 0,
  crouch: 0, stamina: PLAYER.staminaMax as number, exhausted: false, cooldown: 0,
  stepDist: 0, steps: 0, speed: 0, bob: 0, flashlight: false,
};
const moved = { x: 0, z: 0 };

function loadLevel(text: string): void {
  scene.remove(world.group);
  world.dispose();
  seedText = text;
  halls = createHalls(hashString(text));
  world = new WorldView(halls);
  scene.add(world.group);
  time = 0;
  Object.assign(player, {
    x: CELL / 2, z: CELL / 2, px: CELL / 2, pz: CELL / 2, vx: 0, vz: 0, yaw: 0, pitch: 0,
    crouch: 0, stamina: PLAYER.staminaMax, exhausted: false, cooldown: 0, stepDist: 0, steps: 0, speed: 0, flashlight: false,
  });
}

// --- Input --------------------------------------------------------------------

const keys = new Set<string>();
let forced: { mx: number; mz: number; run: boolean; crouch: boolean } | null = null;   // test hook
const down = (action: ActionName): boolean => settings.get().keymap[action].some((code) => keys.has(code));
const isAction = (action: ActionName, code: string): boolean => settings.get().keymap[action].includes(code);
const locked = (): boolean => NOLOCK || document.pointerLockElement === canvas;

function setScreen(next: Screen): void {
  screen = next;
  ui.show(next, seedText);
  if (next !== 'playing') keys.clear();
}

function lock(): void {
  if (NOLOCK) return;
  // The browser refuses to re-lock for about a second after Esc: stay paused if it fails.
  const result = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
  result?.catch?.(() => { if (screen === 'playing') setScreen('paused'); });
}

const ui = new GameUI(document.getElementById('ui')!, settings, {
  onStart(text) {
    audio.start();
    loadLevel(text);
    setScreen('playing');
    lock();
  },
  onResume() {
    setScreen('playing');
    lock();
  },
  onQuit() {
    loadLevel('liminal');
    setScreen('title');
  },
});

document.addEventListener('pointerlockchange', () => {
  if (screen === 'playing' && !locked()) setScreen('paused');
});
window.addEventListener('blur', () => keys.clear());
window.addEventListener('beforeunload', (e) => { if (screen !== 'title') e.preventDefault(); });
window.addEventListener('pointerdown', () => audio.start(), { once: true });

document.addEventListener('keydown', (e) => {
  if (isAction('fps', e.code)) {
    e.preventDefault();
    settings.set({ showFps: !settings.get().showFps });
    return;
  }
  if (screen === 'title') return;
  if (NOLOCK && isAction('pause', e.code)) setScreen(screen === 'playing' ? 'paused' : 'playing');
  if (screen !== 'playing') return;
  if (isAction('flashlight', e.code) && !e.repeat) player.flashlight = !player.flashlight;
  keys.add(e.code);
  e.preventDefault();   // keep browser shortcuts (Ctrl+S, Ctrl+D…) out of the game
});
document.addEventListener('keyup', (e) => keys.delete(e.code));
document.addEventListener('mousemove', (e) => {
  if (screen !== 'playing' || !locked()) return;
  if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;   // spurious jumps on lock
  const k = settings.get().mouseSensitivity * 0.0022;
  player.yaw -= e.movementX * k;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - e.movementY * k * (settings.get().invertY ? -1 : 1)));
});

settings.subscribe((s) => audio.setVolume(s.volumeMaster));

// --- Simulation (fixed step) ----------------------------------------------------

function tick(): void {
  const p = player;
  let mx = forced ? forced.mx : (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
  let mz = forced ? forced.mz : (down('forward') ? 1 : 0) - (down('back') ? 1 : 0);
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const crouching = forced ? forced.crouch : down('crouch');
  const running = (forced ? forced.run : down('run')) && mz > 0 && !crouching && !p.exhausted;
  const max = crouching ? PLAYER.crouchSpeed : running ? PLAYER.runSpeed : PLAYER.walkSpeed;

  // Wish velocity in world space (yaw 0 looks toward -Z, positive yaw turns left).
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  const wx = (cos * mx - sin * mz) * max, wz = (-sin * mx - cos * mz) * max;
  const dvx = wx - p.vx, dvz = wz - p.vz, dv = Math.hypot(dvx, dvz);
  if (dv > 0) {
    const k = Math.min(1, ((len > 0 ? PLAYER.accel : PLAYER.decel) * DT) / dv);
    p.vx += dvx * k;
    p.vz += dvz * k;
  }
  p.px = p.x;
  p.pz = p.z;
  halls.move(p.x, p.z, p.vx * DT, p.vz * DT, PLAYER.radius, moved);
  const dist = Math.hypot(moved.x - p.x, moved.z - p.z);
  p.vx = (moved.x - p.x) / DT;   // velocity into a wall is lost: no sticking, no jitter
  p.vz = (moved.z - p.z) / DT;
  p.x = moved.x;
  p.z = moved.z;
  p.speed = dist / DT;
  p.stepDist += dist;
  p.crouch += Math.max(-1, Math.min(1, ((crouching ? 1 : 0) - p.crouch) / (DT / PLAYER.crouchTime))) * (DT / PLAYER.crouchTime);

  // Stamina.
  if (running && p.speed > PLAYER.walkSpeed) {
    p.stamina = Math.max(0, p.stamina - PLAYER.staminaDrain * DT);
    p.cooldown = PLAYER.staminaRegenDelay;
    if (p.stamina === 0) p.exhausted = true;
  } else if ((p.cooldown -= DT) <= 0) {
    p.stamina = Math.min(PLAYER.staminaMax, p.stamina + PLAYER.staminaRegen * DT);
    if (p.stamina >= PLAYER.staminaRecover) p.exhausted = false;
  }

  // Footsteps: one per stride.
  const mode: StepMode = crouching ? 'crouch' : p.speed > PLAYER.walkSpeed + 0.5 ? 'run' : 'walk';
  const stride = mode === 'run' ? 1.05 : mode === 'crouch' ? 0.5 : 0.75;
  if (p.stepDist >= stride) {
    p.stepDist -= stride;
    audio.step(mode, p.steps++ % 2 === 0);
  }
  time += DT;
}

function nearFlicker(): boolean {
  const cx = Math.floor(player.x / CELL), cz = Math.floor(player.z / CELL);
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const m = halls.light(cx + dx, cz + dz);
    if (m === LIGHT_FLICKER || m === LIGHT_DYING) return true;
  }
  return false;
}

// --- Frame loop -----------------------------------------------------------------

let last = performance.now(), acc = 0, frames = 0, fps = 60, frameMs = 0, real = 0;

renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  real += dt;
  const t0 = performance.now();
  const p = player;

  if (screen === 'playing') {
    acc += dt;
    while (acc >= DT) {
      tick();
      acc -= DT;
    }
  }
  if (screen === 'title') {
    // Attract mode: the camera slowly looks around the spawn room.
    time += dt;
    p.yaw = real * 0.05;
    p.pitch = Math.sin(real * 0.2) * 0.04;
  }

  // Camera: interpolated position, eye height, head bob.
  const a = screen === 'playing' ? acc / DT : 1;
  const bobAmount = settings.get().headBob * Math.min(1, p.speed / PLAYER.walkSpeed);
  p.bob += (bobAmount - p.bob) * Math.min(1, dt * 8);
  const stride = p.speed > PLAYER.walkSpeed + 0.5 ? 1.05 : 0.75;
  const phase = (p.steps + p.stepDist / stride) * Math.PI;
  const eye = PLAYER.eyeStand + (PLAYER.eyeCrouch - PLAYER.eyeStand) * p.crouch;
  camera.position.set(
    p.px + (p.x - p.px) * a,
    eye - Math.abs(Math.sin(phase)) * 0.045 * p.bob + Math.sin(real * 1.3) * 0.004,
    p.pz + (p.z - p.pz) * a,
  );
  camera.rotation.set(p.pitch, p.yaw, Math.cos(phase) * 0.006 * p.bob);
  const fov = settings.get().fov + (p.speed > PLAYER.walkSpeed + 0.5 ? 5 : 0);
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 6);
    camera.updateProjectionMatrix();
  }

  world.update(dt, time, camera, p.flashlight ? 1 : 0);
  audio.update(dt, world.lightAtCamera, nearFlicker(), screen !== 'playing');

  postMaterial.uniforms.uTime.value = real;
  postMaterial.uniforms.uVhs.value = settings.get().vhsIntensity;
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const info = renderer.info.render;
  const calls = info.calls, tris = info.triangles;
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCamera);

  frameMs += (performance.now() - t0 - frameMs) * 0.05;
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;
  if (screen !== 'title') {
    ui.updateHud(halls.seed, time, p.stamina / PLAYER.staminaMax, p.exhausted,
      `${fps.toFixed(0)} FPS  ${frameMs.toFixed(1)} ms\n${calls} appels  ${(tris / 1000).toFixed(1)}k tris\n${world.chunkCount} chunks\nx ${p.x.toFixed(1)}  z ${p.z.toFixed(1)}\nseed ${seedText}`);
  }
  frames++;
});

// --- Debug handle for automated tests ---------------------------------------------

if (params.has('debug')) {
  (window as unknown as { __LIMINAL__: unknown }).__LIMINAL__ = {
    get frames() { return frames; },
    state: () => ({
      screen, seedText, x: player.x, z: player.z, yaw: player.yaw, eyeY: camera.position.y,
      stamina: player.stamina, exhausted: player.exhausted, speed: player.speed,
      chunks: world.chunkCount, calls: renderer.info.render.calls, light: world.lightAtCamera, time,
    }),
    setInput: (o: typeof forced) => { forced = o; },
    setYaw: (yaw: number) => { player.yaw = yaw; },
  };
}
