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
import { createProwler, stepProwler, type Prowler } from '@shared/sim/prowler';
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
  uniforms: {
    tScene: { value: target.texture }, uTime: { value: 0 }, uVhs: { value: 0 }, uRes: { value: new THREE.Vector2() },
    uGlitch: { value: 0 }, uFade: { value: 0 },
  },
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

type Screen = 'title' | 'playing' | 'paused' | 'dead' | 'end';
/** Number of floors to go down before the tape ends. */
const FLOORS = 5;
const SAVE_KEY = 'liminal.run.v1';
let screen: Screen = 'title';
let seedText = 'liminal';
let depth = 0;
let halls: Halls = createHalls(hashString(seedText));
let world = new WorldView(halls);
scene.add(world.group);
let prowler: Prowler = createProwler(halls);
let time = 0, runTime = 0, deaths = 0;
let glitch = 0, fade = 0, heart = 0, rustle = 0;
const floorName = (d: number): string => (d === 0 ? 'REZ-DE-COULOIR' : `ÉTAGE −${d}`);

/** Le Rôdeur: a tall, stooped figure cut out of the level's own wallpaper. */
const entity = new THREE.Group();
function buildEntity(): void {
  entity.clear();
  const part = (w: number, h: number, d: number, x: number, y: number, z: number, tilt = 0): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), world.wallMaterial);
    m.position.set(x, y, z);
    m.rotation.x = tilt;
    entity.add(m);
  };
  part(0.42, 1.25, 0.2, 0, 1.45, 0, 0.12);        // torso, leaning forward
  part(0.26, 0.34, 0.24, 0, 2.25, -0.16, 0.5);    // head pressed under the ceiling
  part(0.13, 0.9, 0.13, -0.12, 0.45, 0.05);       // legs
  part(0.13, 0.9, 0.13, 0.12, 0.45, 0.05);
  part(0.09, 1.7, 0.09, -0.3, 1.2, -0.1, 0.15);   // arms that reach the knees
  part(0.09, 1.7, 0.09, 0.3, 1.2, -0.1, 0.15);
  scene.add(entity);
}
buildEntity();

const player = {
  x: CELL / 2, z: CELL / 2, px: CELL / 2, pz: CELL / 2,
  vx: 0, vz: 0, yaw: 0, pitch: 0,
  crouch: 0, stamina: PLAYER.staminaMax as number, exhausted: false, cooldown: 0,
  stepDist: 0, steps: 0, speed: 0, bob: 0, flashlight: false,
};
const moved = { x: 0, z: 0 };

function loadLevel(text: string, floor: number): void {
  scene.remove(world.group);
  world.dispose();
  seedText = text;
  depth = floor;
  halls = createHalls((hashString(text) ^ Math.imul(floor, 0x9e3779b1)) >>> 0, floor);
  world = new WorldView(halls);
  scene.add(world.group);
  prowler = createProwler(halls);
  buildEntity();
  time = 0;
  fade = 1;
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
  ui.show(next, seedText, floorName(depth));
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
    runTime = deaths = 0;
    startFloor(text, 0);
  },
  onContinue() {
    const save = loadSave();
    if (!save) return;
    audio.start();
    runTime = save.runTime;
    deaths = save.deaths;
    startFloor(save.seedText, save.depth);
  },
  onRetry() {
    startFloor(seedText, depth);
  },
  onResume() {
    setScreen('playing');
    lock();
  },
  onQuit() {
    loadLevel('liminal', 0);
    setScreen('title');
    refreshContinue();
  },
});

interface Save { seedText: string; depth: number; runTime: number; deaths: number }
function loadSave(): Save | null {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Save | null;
  } catch {
    return null;
  }
}
function refreshContinue(): void {
  const save = loadSave();
  ui.setContinue(save && save.depth > 0 ? `CONTINUER — ${floorName(save.depth)}` : null);
}
refreshContinue();

function startFloor(text: string, floor: number): void {
  loadLevel(text, floor);
  localStorage.setItem(SAVE_KEY, JSON.stringify({ seedText: text, depth: floor, runTime, deaths } satisfies Save));
  setScreen('playing');
  lock();
  ui.message(floor === 0
    ? 'TROUVEZ LA PORTE DE SERVICE.\nL\'ÉQUIPE 7 A LAISSÉ DES FLÈCHES À LA CRAIE.'
    : `${floorName(floor)}\nPLUS SOMBRE. IL VOUS ENTEND.`);
}

function die(): void {
  deaths++;
  audio.death();
  glitch = 1;
  screen = 'dead';
  ui.show('dead', seedText, `Le Rôdeur vous a trouvé — ${floorName(depth)}.\nIl voit ce qui est éclairé et entend ce qui court.`);
  keys.clear();
  if (!NOLOCK) document.exitPointerLock();
}

function reachExit(): void {
  audio.door();
  if (depth + 1 < FLOORS) {
    startFloor(seedText, depth + 1);
    return;
  }
  localStorage.removeItem(SAVE_KEY);
  screen = 'end';
  const m = Math.floor(runTime / 60), sec = Math.floor(runTime % 60);
  ui.show('end', seedText, `BANDE N° 12 — FIN DE L'ENREGISTREMENT\n\nSeed : ${seedText}\nDurée : ${m} min ${String(sec).padStart(2, '0')} s — Signal perdu ${deaths} fois\n\nLa bande a été retrouvée dans un bâtiment\noù l'équipe 12 n'est jamais entrée.`);
  keys.clear();
  if (!NOLOCK) document.exitPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  if (screen === 'playing' && !locked()) setScreen('paused');
});
window.addEventListener('blur', () => keys.clear());
window.addEventListener('beforeunload', (e) => { if (screen === 'playing' || screen === 'paused') e.preventDefault(); });
window.addEventListener('pointerdown', () => audio.start(), { once: true });

document.addEventListener('keydown', (e) => {
  if (isAction('fps', e.code)) {
    e.preventDefault();
    settings.set({ showFps: !settings.get().showFps });
    return;
  }
  if (screen !== 'playing' && screen !== 'paused') return;
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
  runTime += DT;

  // The entity perceives noise (by gait) and light.
  const noise = p.speed < 0.3 ? 0 : crouching ? 1.5 : mode === 'run' ? 15 : 6;
  const event = stepProwler(prowler, halls, { px: p.x, pz: p.z, noise, lit: p.flashlight || world.lightAtCamera > 0.3 }, DT);
  if (event === 'spotted') audio.sting();
  if (event === 'caught') return die();

  const ex = (halls.exitX + 0.5) * CELL, ez = (halls.exitZ + 0.5) * CELL;
  if (Math.hypot(p.x - ex, p.z - ez) < 1.1) reachExit();
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
    while (acc >= DT && screen === 'playing') {
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

  // Entity: visuals, proximity sounds, picture breaking up.
  const active = prowler.state !== 'dormant' && screen !== 'title';
  entity.visible = active;
  let danger = screen === 'dead' ? 1 : 0;
  if (active) {
    entity.position.set(prowler.x, Math.abs(Math.sin(real * 5)) * 0.03 * prowler.speed, prowler.z);
    entity.rotation.set(0, prowler.yaw, Math.sin(real * 2.3) * 0.04);
    const dx = prowler.x - p.x, dz = prowler.z - p.z, dist = Math.hypot(dx, dz);
    const chasing = prowler.state === 'chase';
    if (screen === 'playing') {
      danger = Math.max(chasing ? 0.3 : 0, 1 - dist / 9);
      if ((rustle -= dt) <= 0 && dist < 24) {
        rustle = (chasing ? 0.16 : 0.4) + Math.random() * 0.3;
        // Pan: project the direction to the entity on the camera's right vector.
        audio.rustle(1 - dist / 24, Math.max(-1, Math.min(1, (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / (dist + 0.01))));
      }
      if ((chasing || dist < 12) && (heart -= dt) <= 0) {
        heart = chasing ? 0.5 : 0.95;
        audio.heartbeat(chasing ? 1 : 0.5);
      }
    }
  }
  glitch += (danger - glitch) * Math.min(1, dt * 4);
  fade = Math.max(0, fade - dt * 0.7);
  postMaterial.uniforms.uGlitch.value = glitch;
  postMaterial.uniforms.uFade.value = screen === 'end' ? 1 : fade;

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
  if (screen === 'playing' || screen === 'paused') {
    ui.updateHud(halls.seed, time, p.stamina / PLAYER.staminaMax, p.exhausted,
      `${fps.toFixed(0)} FPS  ${frameMs.toFixed(1)} ms\n${calls} appels  ${(tris / 1000).toFixed(1)}k tris\n${world.chunkCount} chunks\nx ${p.x.toFixed(1)}  z ${p.z.toFixed(1)}\nseed ${seedText}  ${floorName(depth)}\nsortie ${Math.hypot(p.x - (halls.exitX + 0.5) * CELL, p.z - (halls.exitZ + 0.5) * CELL).toFixed(0)} m`);
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
      depth, exitX: (halls.exitX + 0.5) * CELL, exitZ: (halls.exitZ + 0.5) * CELL,
      prowler: prowler.state, prowlerDist: Math.hypot(prowler.x - player.x, prowler.z - player.z),
      chunks: world.chunkCount, calls: renderer.info.render.calls, light: world.lightAtCamera, time,
    }),
    setInput: (o: typeof forced) => { forced = o; },
    setYaw: (yaw: number) => { player.yaw = yaw; },
    teleport: (x: number, z: number) => { player.x = player.px = x; player.z = player.pz = z; player.vx = player.vz = 0; },
    /** Put the entity right behind the player, already chasing. */
    summon: () => { prowler.state = 'chase'; prowler.x = player.x; prowler.z = player.z + 2.5; prowler.lostFor = 0; },
  };
}
