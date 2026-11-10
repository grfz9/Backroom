/**
 * LIMINAL — composition root.
 * Renderer + VHS pass, player (fixed 60 Hz simulation, interpolated camera), world streaming,
 * entities (the Prowler and the Double), co-op with proximity voice, audio and UI.
 *
 * Solo: everything runs in this tab. Co-op: the host runs the entities and relays positions;
 * clients simulate only their own player (see game/net.ts).
 *
 * URL parameters (for tests): ?debug=1 exposes window.__LIMINAL__, ?nolock=1 plays without pointer lock.
 */

import * as THREE from 'three';
import { CELL, DT, PLAYER } from '@shared/constants';
import { createHalls, LIGHT_DYING, LIGHT_FLICKER, type Halls } from '@shared/levels/halls';
import { hashString } from '@shared/math/rng';
import { createMimic, stepMimic, type Mimic } from '@shared/sim/mimic';
import { createProwler, stepProwler, type Prowler } from '@shared/sim/prowler';
import type { ActionName } from './core/contracts';
import { createSettingsStore } from './core/settings';
import { GameAudio, type StepMode } from './game/audio';
import { Net, type EntitySnap, type PlayerSnap } from './game/net';
import { PeerRoom, randomRoomCode } from './game/peer';
import { POST_FRAG, POST_VERT } from './game/shaders';
import { flatTexture, suitTexture } from './game/textures';
import { GameUI } from './game/ui';
import { Voice } from './game/voice';
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
const SPAWN = CELL / 2;
let screen: Screen = 'title';
let seedText = 'liminal';
let depth = 0;
let halls: Halls = createHalls(hashString(seedText));
let world = new WorldView(halls);
scene.add(world.group);
let prowler: Prowler = createProwler(halls);
let mimic: Mimic = createMimic(halls);
let time = 0, runTime = 0, deaths = 0;
let glitch = 0, fade = 0, heart = 0, rustle = 0;
const floorName = (d: number): string => (d === 0 ? 'REZ-DE-COULOIR' : `ÉTAGE −${d}`);

const player = {
  x: SPAWN, z: SPAWN, px: SPAWN, pz: SPAWN, vx: 0, vz: 0, yaw: 0, pitch: 0,
  crouch: 0, stamina: PLAYER.staminaMax as number, exhausted: false, cooldown: 0,
  stepDist: 0, steps: 0, speed: 0, bob: 0, flashlight: false, noise: 0,
};
const moved = { x: 0, z: 0 };

function resetPlayer(): void {
  Object.assign(player, {
    x: SPAWN, z: SPAWN, px: SPAWN, pz: SPAWN, vx: 0, vz: 0, yaw: 0, pitch: 0, crouch: 0,
    stamina: PLAYER.staminaMax, exhausted: false, cooldown: 0, stepDist: 0, steps: 0, speed: 0, flashlight: false, noise: 0,
  });
}

// --- Co-op state ----------------------------------------------------------------

let net: Net | null = null;
let room: PeerRoom | null = null;
let voice: Voice | null = null;
let roomCode = '';
let micOn = false;
let syncTimer = 0, exitTimer = 0;
const isClient = (): boolean => net?.role === 'client';
/** Client only: entity states received from the host. */
let remoteEntities: EntitySnap[] = [];

// --- Actors (entities and other players) -----------------------------------------

const prowlerMesh = new THREE.Group();
const mimicMesh = new THREE.Group();
const avatars = new Map<number, THREE.Group>();
let avatarParts: { suit: THREE.Material; dark: THREE.Material; rec: THREE.Material };

function addBox(group: THREE.Group, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, tilt = 0): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.x = tilt;
  group.add(m);
}

/** A surveyor: grey coverall, shoulder camcorder. `recording` lights the red REC lamp. */
function buildSurveyor(group: THREE.Group, recording: boolean): void {
  group.clear();
  const { suit, dark, rec } = avatarParts;
  addBox(group, suit, 0.46, 0.7, 0.26, 0, 1.15, 0);              // torso
  addBox(group, suit, 0.24, 0.26, 0.24, 0, 1.65, 0);             // head
  addBox(group, suit, 0.17, 0.8, 0.19, -0.12, 0.4, 0);           // legs
  addBox(group, suit, 0.17, 0.8, 0.19, 0.12, 0.4, 0);
  addBox(group, suit, 0.12, 0.65, 0.14, -0.31, 1.15, 0);         // arms
  addBox(group, suit, 0.12, 0.65, 0.14, 0.31, 1.15, -0.08, -0.5);
  addBox(group, dark, 0.14, 0.16, 0.36, 0.2, 1.62, -0.1);        // camcorder on the shoulder
  addBox(group, recording ? rec : dark, 0.035, 0.035, 0.02, 0.2, 1.72, -0.285);   // REC lamp: the tell
  scene.add(group);
}

/** Rebuild every actor with the materials of the current level (they sample its light grid). */
function buildActors(): void {
  avatarParts = {
    suit: world.material(suitTexture(), 0),
    dark: world.material(flatTexture('#1b1b1b'), 0),
    rec: world.material(flatTexture('#ff1e1e'), 3),
  };
  // Le Rôdeur: a tall, stooped figure cut out of the level's own wallpaper.
  prowlerMesh.clear();
  const wp = world.wallMaterial;
  addBox(prowlerMesh, wp, 0.42, 1.25, 0.2, 0, 1.45, 0, 0.12);       // torso, leaning forward
  addBox(prowlerMesh, wp, 0.26, 0.34, 0.24, 0, 2.25, -0.16, 0.5);   // head pressed under the ceiling
  addBox(prowlerMesh, wp, 0.13, 0.9, 0.13, -0.12, 0.45, 0.05);      // legs
  addBox(prowlerMesh, wp, 0.13, 0.9, 0.13, 0.12, 0.45, 0.05);
  addBox(prowlerMesh, wp, 0.09, 1.7, 0.09, -0.3, 1.2, -0.1, 0.15);  // arms that reach the knees
  addBox(prowlerMesh, wp, 0.09, 1.7, 0.09, 0.3, 1.2, -0.1, 0.15);
  scene.add(prowlerMesh);
  // Le Double looks exactly like a teammate — except that its camcorder is not recording.
  buildSurveyor(mimicMesh, false);
  for (const g of avatars.values()) scene.remove(g);
  avatars.clear();
}
buildActors();

function loadLevel(text: string, floor: number): void {
  scene.remove(world.group);
  world.dispose();
  seedText = text;
  depth = floor;
  halls = createHalls((hashString(text) ^ Math.imul(floor, 0x9e3779b1)) >>> 0, floor);
  world = new WorldView(halls);
  scene.add(world.group);
  prowler = createProwler(halls);
  mimic = createMimic(halls);
  remoteEntities = [];
  buildActors();
  time = 0;
  fade = 1;
  resetPlayer();
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

// --- Run flow ---------------------------------------------------------------------

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

/** Enter a floor. In co-op the host announces it; solo runs are saved. */
function startFloor(text: string, floor: number): void {
  loadLevel(text, floor);
  if (!net) localStorage.setItem(SAVE_KEY, JSON.stringify({ seedText: text, depth: floor, runTime, deaths } satisfies Save));
  if (net?.role === 'host') net.setLevel(text, floor);
  setScreen('playing');
  lock();
  ui.message(floor === 0
    ? 'TROUVEZ LA PORTE DE SERVICE.\nL\'ÉQUIPE 7 A LAISSÉ DES FLÈCHES À LA CRAIE.'
    : `${floorName(floor)}\nPLUS SOMBRE. IL VOUS ENTEND.`);
}

function die(by: 'prowler' | 'mimic'): void {
  if (screen !== 'playing' && screen !== 'paused') return;
  deaths++;
  audio.death();
  glitch = 1;
  screen = 'dead';
  ui.show('dead', seedText, by === 'mimic'
    ? `Ce n'était pas un arpenteur — ${floorName(depth)}.\nSon caméscope n'enregistrait pas : pas de voyant rouge.`
    : `Le Rôdeur vous a trouvé — ${floorName(depth)}.\nIl voit ce qui est éclairé et entend ce qui court.`);
  keys.clear();
  if (!NOLOCK) document.exitPointerLock();
}

function showEnd(total: number, lost: number): void {
  localStorage.removeItem(SAVE_KEY);
  screen = 'end';
  const m = Math.floor(total / 60), sec = Math.floor(total % 60);
  ui.show('end', seedText, `BANDE N° 12 — FIN DE L'ENREGISTREMENT\n\nSeed : ${seedText}\nDurée : ${m} min ${String(sec).padStart(2, '0')} s — Signal perdu ${lost} fois\n\nLa bande a été retrouvée dans un bâtiment\noù l'équipe 12 n'est jamais entrée.`);
  keys.clear();
  if (!NOLOCK) document.exitPointerLock();
}

/** Someone walked into the exit door (solo or host). */
function reachExit(): void {
  audio.door();
  if (depth + 1 < FLOORS) return startFloor(seedText, depth + 1);
  net?.sendEnd(runTime, deaths);
  showEnd(runTime, deaths);
}

function leaveRoom(): void {
  net?.close();
  room?.destroy();
  voice?.clear();
  net = null;
  room = null;
  voice = null;
  roomCode = '';
  ui.room('');
}

/** Voice chat: ask for the microphone and route the others' voices by proximity. */
async function startVoice(): Promise<void> {
  const ctx = audio.context;
  if (!room || !ctx) return;
  voice = new Voice(ctx, audio.output);
  room.onStream = (pid, stream) => voice?.add(pid, stream);
  room.onStreamEnd = (pid) => voice?.remove(pid);
  micOn = await room.enableVoice(ctx.createMediaStreamDestination().stream);
}

const ui = new GameUI(document.getElementById('ui')!, settings, {
  onStart(text) {
    audio.start();
    leaveRoom();
    runTime = deaths = 0;
    startFloor(text, 0);
  },
  onContinue() {
    const save = loadSave();
    if (!save) return;
    audio.start();
    leaveRoom();
    runTime = save.runTime;
    deaths = save.deaths;
    startFloor(save.seedText, save.depth);
  },
  onRetry() {
    if (!net) return startFloor(seedText, depth);
    // Co-op: the floor goes on for the others; come back at its entrance.
    resetPlayer();
    fade = 1;
    setScreen('playing');
    lock();
  },
  onHost(text) {
    audio.start();
    leaveRoom();
    ui.status('Ouverture du salon…');
    const code = randomRoomCode();
    const hosting = new Net('host', {
      onLevel() {}, onWorld() {}, onDead() {}, onEnd() {}, onClosed() {},
      onExit: () => { if (net === hosting) reachExit(); },
    });
    PeerRoom.host(code, (link) => hosting.accept(link)).then(async (r) => {
      net = hosting;
      room = r;
      roomCode = code;
      await startVoice();
      ui.status('');
      runTime = deaths = 0;
      startFloor(text, 0);
      ui.message(`SALON ${code}\nDONNEZ CE CODE AUX AUTRES ARPENTEURS.`, 12);
    }).catch(() => ui.status('Impossible d\'ouvrir un salon (réseau ou service de mise en relation indisponible).'));
  },
  onJoin(code) {
    audio.start();
    leaveRoom();
    ui.status('Connexion au salon…');
    const joining = new Net('client', {
      onExit() {},
      onLevel: (text, floor) => { if (net === joining) startFloor(text, floor); },
      onWorld: (t, entities) => {
        time = t;
        remoteEntities = entities;
      },
      onDead: () => die(remoteEntities.some((e) => e.kind === 'mimic' && Math.hypot(e.x - player.x, e.z - player.z) < 2.5) ? 'mimic' : 'prowler'),
      onEnd: (total, lost) => showEnd(total, lost),
      onClosed: () => {
        if (net !== joining) return;
        leaveRoom();
        loadLevel('liminal', 0);
        setScreen('title');
        ui.status('L\'hôte a quitté le salon.');
      },
    });
    PeerRoom.join(code).then(async ({ room: r, link }) => {
      net = joining;
      room = r;
      roomCode = code;
      await startVoice();
      ui.status('');
      joining.join(link);
    }).catch(() => ui.status(`Salon ${code} introuvable.`));
  },
  onResume() {
    setScreen('playing');
    lock();
  },
  onQuit() {
    leaveRoom();
    loadLevel('liminal', 0);
    setScreen('title');
    refreshContinue();
  },
});
refreshContinue();

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
  if (isAction('radio', e.code) && !e.repeat && room) micOn = room.toggleMic();
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

const alive = (): boolean => screen === 'playing' || screen === 'paused';
const isLit = (): boolean => player.flashlight || world.lightAtCamera > 0.3;

/** The local player: movement, stamina, footsteps, exit. */
function tickPlayer(): void {
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

  // Footsteps: one per stride. The gait also sets how far the player can be heard.
  const mode: StepMode = crouching ? 'crouch' : p.speed > PLAYER.walkSpeed + 0.5 ? 'run' : 'walk';
  const stride = mode === 'run' ? 1.05 : mode === 'crouch' ? 0.5 : 0.75;
  if (p.stepDist >= stride) {
    p.stepDist -= stride;
    audio.step(mode, p.steps++ % 2 === 0);
  }
  p.noise = p.speed < 0.3 ? 0 : crouching ? 1.5 : mode === 'run' ? 15 : 6;
  runTime += DT;

  const ex = (halls.exitX + 0.5) * CELL, ez = (halls.exitZ + 0.5) * CELL;
  if (Math.hypot(p.x - ex, p.z - ez) < 1.1) {
    if (!isClient()) reachExit();
    else if ((exitTimer -= DT) <= 0) {
      exitTimer = 1;
      net!.sendExit();
    }
  }
}

/** Entities (solo and host only). Each one goes for the nearest living player. */
function tickWorld(): void {
  time += DT;
  type Target = { id: number; x: number; z: number; noise: number; lit: boolean };
  const candidates: Target[] = [];
  if (alive()) candidates.push({ id: net?.id ?? 0, x: player.x, z: player.z, noise: player.noise, lit: isLit() });
  if (net) for (const o of net.others.values()) if (o.alive) candidates.push(o);
  const nearest = (ex: number, ez: number): Target | null => {
    let best: Target | null = null, bestD = Infinity;
    for (const c of candidates) {
      const d = Math.hypot(c.x - ex, c.z - ez);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  };
  const target = nearest(prowler.x, prowler.z), mtarget = nearest(mimic.x, mimic.z);

  const kill = (id: number, by: 'prowler' | 'mimic'): void => {
    if (id === (net?.id ?? 0)) die(by);
    else net?.sendDead(id);
  };
  if (target) {
    const event = stepProwler(prowler, halls, { px: target.x, pz: target.z, noise: target.noise, lit: target.lit }, DT);
    if (event === 'spotted') audio.sting();
    if (event === 'caught') {
      kill(target.id, 'prowler');
      prowler.state = 'dormant';      // it withdraws, and will be back
      prowler.time = 25;
    }
  }
  if (mtarget && stepMimic(mimic, halls, mtarget.x, mtarget.z, DT)) {
    kill(mtarget.id, 'mimic');
    mimic.state = 'dormant';
    mimic.time = 30;
  }
}

function nearFlicker(): boolean {
  const cx = Math.floor(player.x / CELL), cz = Math.floor(player.z / CELL);
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const m = halls.light(cx + dx, cz + dz);
    if (m === LIGHT_FLICKER || m === LIGHT_DYING) return true;
  }
  return false;
}

/** Entity states to draw: simulated here (solo/host) or received (client). */
function entitySnaps(): EntitySnap[] {
  if (isClient()) return remoteEntities;
  const out: EntitySnap[] = [];
  if (prowler.state !== 'dormant') out.push({ kind: 'prowler', x: prowler.x, z: prowler.z, yaw: prowler.yaw, state: prowler.state, speed: prowler.speed });
  if (mimic.state !== 'dormant') out.push({ kind: 'mimic', x: mimic.x, z: mimic.z, yaw: mimic.yaw, state: mimic.state, speed: mimic.speed });
  return out;
}

/** Move a group toward a networked pose without popping. */
function ease(group: THREE.Group, x: number, z: number, yaw: number, k: number): void {
  if (Math.hypot(group.position.x - x, group.position.z - z) > 6) group.position.set(x, 0, z);
  group.position.x += (x - group.position.x) * k;
  group.position.z += (z - group.position.z) * k;
  const turn = Math.atan2(Math.sin(yaw - group.rotation.y), Math.cos(yaw - group.rotation.y));
  group.rotation.y += turn * k;
}

// --- Frame loop -----------------------------------------------------------------

let last = performance.now(), acc = 0, frames = 0, fps = 60, frameMs = 0, real = 0;

renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  real += dt;
  const t0 = performance.now();
  const p = player;

  // In co-op the world keeps running while this player is paused or dead.
  const running = screen === 'playing' || (net !== null && screen !== 'title' && screen !== 'end');
  if (running) {
    acc += dt;
    while (acc >= DT) {
      if (screen === 'playing') tickPlayer();
      if (!isClient()) tickWorld();
      else time += DT;
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

  // Entities: visuals, proximity sounds, picture breaking up.
  const snaps = screen === 'title' ? [] : entitySnaps();
  const k = Math.min(1, dt * 12);
  let danger = screen === 'dead' ? 1 : 0;
  prowlerMesh.visible = mimicMesh.visible = false;
  for (const e of snaps) {
    const mesh = e.kind === 'prowler' ? prowlerMesh : mimicMesh;
    mesh.visible = true;
    ease(mesh, e.x, e.z, e.yaw, isClient() ? k : 1);
    mesh.position.y = Math.abs(Math.sin(real * (e.kind === 'prowler' ? 5 : 6.5))) * 0.03 * e.speed;
    if (e.kind === 'prowler') mesh.rotation.z = Math.sin(real * 2.3) * 0.04;
    if (screen !== 'playing') continue;
    const dx = e.x - p.x, dz = e.z - p.z, dist = Math.hypot(dx, dz);
    if (e.kind === 'mimic') {
      danger = Math.max(danger, 1 - dist / 3.5);      // the picture only betrays it at the last moment
      continue;
    }
    const chasing = e.state === 'chase';
    danger = Math.max(danger, chasing ? 0.3 : 0, 1 - dist / 9);
    if ((rustle -= dt) <= 0 && dist < 24) {
      rustle = (chasing ? 0.16 : 0.4) + Math.random() * 0.3;
      audio.rustle(1 - dist / 24, Math.max(-1, Math.min(1, (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / (dist + 0.01))));
    }
    if ((chasing || dist < 12) && (heart -= dt) <= 0) {
      heart = chasing ? 0.5 : 0.95;
      audio.heartbeat(chasing ? 1 : 0.5);
    }
  }
  glitch += (danger - glitch) * Math.min(1, dt * 4);
  fade = Math.max(0, fade - dt * 0.7);
  postMaterial.uniforms.uGlitch.value = glitch;
  postMaterial.uniforms.uFade.value = screen === 'end' ? 1 : fade;

  // Co-op: other players' avatars and voices, and our own state sent ~15 times per second.
  if (net) {
    for (const [id, g] of avatars) {
      if (!net.others.get(id)?.alive) {
        scene.remove(g);
        avatars.delete(id);
      }
    }
    for (const o of net.others.values()) {
      if (o.pid) {
        room?.ensureCall(o.pid);
        voice?.place(o.pid, o.x - p.x, o.z - p.z, p.yaw);
      }
      if (!o.alive) continue;
      let g = avatars.get(o.id);
      if (!g) {
        g = new THREE.Group();
        buildSurveyor(g, true);
        g.position.set(o.x, 0, o.z);
        avatars.set(o.id, g);
      }
      ease(g, o.x, o.z, o.yaw, k);
      g.scale.y = 1 - o.cr * 0.38;
    }
    if ((syncTimer -= dt) <= 0) {
      syncTimer = 1 / 15;
      const snap: PlayerSnap = {
        id: net.id, x: p.x, z: p.z, yaw: p.yaw, cr: p.crouch, alive: alive(),
        noise: p.noise, lit: isLit(), fl: p.flashlight, pid: room?.pid ?? '',
      };
      net.sync(snap, time, net.role === 'host' ? entitySnaps() : []);
    }
    ui.room(`SALON ${roomCode}\n${net.playerCount} ARPENTEUR${net.playerCount > 1 ? 'S' : ''}\nMICRO ${micOn ? 'ON' : 'OFF'}`);
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
      prowler: prowler.state, prowlerDist: Math.hypot(prowler.x - player.x, prowler.z - player.z), mimic: mimic.state,
      frameMs, chunks: world.chunkCount, calls: renderer.info.render.calls, light: world.lightAtCamera, time,
    }),
    setInput: (o: typeof forced) => { forced = o; },
    setYaw: (yaw: number) => { player.yaw = yaw; },
    teleport: (x: number, z: number) => { player.x = player.px = x; player.z = player.pz = z; player.vx = player.vz = 0; },
    /** Put an entity right behind the player. */
    summon: (kind: 'prowler' | 'mimic' = 'prowler') => {
      const e = kind === 'prowler' ? prowler : mimic;
      e.state = kind === 'prowler' ? 'chase' : 'approach';
      e.x = player.x;
      e.z = player.z + 2.5;
      e.stateTime = 0;
      if (kind === 'prowler') prowler.lostFor = 0;
    },
  };
}
