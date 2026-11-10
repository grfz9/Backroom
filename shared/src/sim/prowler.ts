/**
 * Le Rôdeur — the entity of Level 0. Pure simulation (no rendering), deterministic for a seed.
 *
 *   dormant → wander ⇄ investigate (heard something) → chase (saw the player) → search → wander
 *
 * It HEARS the player's noise radius (crouch < walk < run) and SEES along clear lines of sight,
 * farther when the player is lit or uses the flashlight. Counter-play: break line of sight,
 * crouch, stay in the dark with the flashlight off.
 */

import { CELL } from '../constants';
import type { Halls } from '../levels/halls';
import { Rng } from '../math/rng';

export type ProwlerState = 'dormant' | 'wander' | 'investigate' | 'chase' | 'search';
export type ProwlerEvent = 'none' | 'spawned' | 'spotted' | 'lost' | 'caught';

export interface Prowler {
  x: number;
  z: number;
  yaw: number;
  state: ProwlerState;
  /** Seconds since the level started. */
  time: number;
  speed: number;
  goalX: number;
  goalZ: number;
  path: number[];        // flat list of cell coordinates still to visit
  repath: number;
  lostFor: number;
  stateTime: number;
  rng: Rng;
  depth: number;
}

export interface ProwlerSenses {
  px: number;
  pz: number;
  /** Noise radius of the player, in metres. */
  noise: number;
  /** True if the player stands in light or has the flashlight on. */
  lit: boolean;
}

const SPAWN_DELAY = 50;
const RADIUS = 0.3;
const CATCH_DIST = 0.95;
const out = { x: 0, z: 0 };

export function createProwler(halls: Halls): Prowler {
  return {
    x: 0, z: 0, yaw: 0, state: 'dormant', time: 0, speed: 0, goalX: 0, goalZ: 0, path: [],
    repath: 0, lostFor: 0, stateTime: 0, rng: new Rng(halls.seed ^ 0x5eed), depth: halls.depth,
  };
}

/** Breadth-first search on the cell grid. Returns the cells to walk through (flat x,z pairs). */
export function findPath(halls: Halls, sx: number, sz: number, tx: number, tz: number, radius = 24): number[] {
  const size = radius * 2 + 1, prev = new Int32Array(size * size).fill(-1);
  const queue = new Int32Array(size * size);
  const start = radius * size + radius;
  let head = 0, tail = 0, best = start, bestD = Infinity;
  prev[start] = start;
  queue[tail++] = start;
  while (head < tail) {
    const cur = queue[head++], lx = cur % size, lz = (cur - lx) / size;
    const ix = sx + lx - radius, iz = sz + lz - radius;
    const d = Math.abs(ix - tx) + Math.abs(iz - tz);
    if (d < bestD) { bestD = d; best = cur; }
    if (d === 0) break;
    for (let k = 0; k < 4; k++) {
      const dx = k === 0 ? 1 : k === 1 ? -1 : 0, dz = k === 2 ? 1 : k === 3 ? -1 : 0;
      const nx = lx + dx, nz = lz + dz;
      if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
      const ni = nz * size + nx;
      if (prev[ni] !== -1 || !halls.open(ix, iz, dx, dz)) continue;
      prev[ni] = cur;
      queue[tail++] = ni;
    }
  }
  const path: number[] = [];
  for (let cur = best; cur !== start; cur = prev[cur]) {
    const lx = cur % size;
    path.unshift(sx + lx - radius, sz + (cur - lx) / size - radius);
  }
  return path;
}

function setState(p: Prowler, state: ProwlerState): void {
  p.state = state;
  p.stateTime = 0;
  p.repath = 0;
}

function goTo(p: Prowler, halls: Halls, x: number, z: number): void {
  p.goalX = x;
  p.goalZ = z;
  p.path = findPath(halls, Math.floor(p.x / CELL), Math.floor(p.z / CELL), Math.floor(x / CELL), Math.floor(z / CELL));
}

/** Advance the entity by dt seconds. Returns what happened this step. */
export function stepProwler(p: Prowler, halls: Halls, s: ProwlerSenses, dt: number): ProwlerEvent {
  p.time += dt;
  p.stateTime += dt;
  const dist = Math.hypot(s.px - p.x, s.pz - p.z);

  if (p.state === 'dormant') {
    if (p.time < Math.max(20, SPAWN_DELAY - p.depth * 8)) return 'none';
    // Appear 30–40 m away, out of sight.
    for (let i = 0; i < 12; i++) {
      const a = p.rng.next() * Math.PI * 2, d = 30 + p.rng.next() * 10;
      const cx = Math.floor((s.px + Math.cos(a) * d) / CELL), cz = Math.floor((s.pz + Math.sin(a) * d) / CELL);
      const x = (cx + 0.5) * CELL, z = (cz + 0.5) * CELL;
      if (halls.pillar(cx, cz) || halls.los(x, z, s.px, s.pz)) continue;
      p.x = x;
      p.z = z;
      setState(p, 'wander');
      return 'spawned';
    }
    return 'none';
  }
  if (dist > 90) {            // the player left it far behind: it will reappear elsewhere
    setState(p, 'dormant');
    p.time = SPAWN_DELAY - 12;
    return 'none';
  }

  // --- Perception ---
  let event: ProwlerEvent = 'none';
  const sees = dist < (s.lit ? 22 : 9) && halls.los(p.x, p.z, s.px, s.pz);
  const hears = s.noise > 0 && dist < s.noise * 1.6;
  if (sees) {
    p.lostFor = 0;
    if (p.state !== 'chase') {
      setState(p, 'chase');
      event = 'spotted';
    }
  } else if (p.state === 'chase') {
    p.lostFor += dt;
    if (p.lostFor > 3.5) {
      setState(p, 'search');
      event = 'lost';
    }
  } else if (hears && p.state !== 'investigate') {
    setState(p, 'investigate');
    goTo(p, halls, s.px, s.pz);
  }

  // --- Decide where to go ---
  p.repath -= dt;
  if (p.state === 'chase') {
    if (p.repath <= 0) {
      p.repath = 0.3;
      goTo(p, halls, s.px, s.pz);
    }
  } else if (p.state === 'investigate') {
    if (hears && p.repath <= 0) {
      p.repath = 1;
      goTo(p, halls, s.px, s.pz);
    }
    if (p.path.length === 0) setState(p, 'search');
  } else if (p.path.length === 0 || p.stateTime > 25) {
    if (p.state === 'search' && p.stateTime > 14) setState(p, 'wander');
    // Wander: drift loosely toward the player so it never stays out of the game for long.
    const reach = p.state === 'search' ? 5 : 12;
    const bias = p.state === 'wander' ? 0.35 : 0;
    const a = p.rng.next() * Math.PI * 2;
    goTo(p, halls,
      p.x + Math.cos(a) * reach * CELL * p.rng.next() + (s.px - p.x) * bias,
      p.z + Math.sin(a) * reach * CELL * p.rng.next() + (s.pz - p.z) * bias);
    p.stateTime = Math.min(p.stateTime, 14.5);
  }

  // --- Move ---
  const max = p.state === 'chase' ? 4.2 + p.depth * 0.12 : p.state === 'investigate' ? 2.6 : p.state === 'search' ? 1.8 : 1.2;
  p.speed += (max - p.speed) * Math.min(1, dt * 3);
  let tx = p.x, tz = p.z;
  if (p.state === 'chase' && sees && dist < 4) {
    tx = s.px;
    tz = s.pz;
  } else if (p.path.length > 0) {
    tx = (p.path[0] + 0.5) * CELL;
    tz = (p.path[1] + 0.5) * CELL;
    if (Math.hypot(tx - p.x, tz - p.z) < 0.35) p.path.splice(0, 2);
  }
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d > 0.05) {
    const step = Math.min(d, p.speed * dt);
    halls.move(p.x, p.z, (dx / d) * step, (dz / d) * step, RADIUS, out);
    p.x = out.x;
    p.z = out.z;
    // Turn smoothly toward the direction of travel (yaw 0 faces -Z, positive turns left).
    let turn = Math.atan2(-dx, -dz) - p.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    p.yaw += turn * Math.min(1, dt * 8);
  }
  return Math.hypot(s.px - p.x, s.pz - p.z) < CATCH_DIST ? 'caught' : event;
}
