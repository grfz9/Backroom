/**
 * Level 0 — "Les Couloirs". Infinite, deterministic, defined as PURE FUNCTIONS of (seed, cell):
 * no state, no generation order, so a client and a server always agree.
 *
 * Layout: thin walls on cell edges. Along every grid line, walls come in segments of 3–6 cells;
 * each segment either exists or not (probability driven by a low-frequency density noise) and
 * always keeps one doorway, which keeps the maze connected. Low-density areas become large
 * empty halls with aligned pillars. Neon panels sit on a regular ceiling grid.
 */

import { CELL } from '../constants';
import { hash1, hash2, mix32, toUnit } from '../math/rng';

export const CEILING = 2.6;
export const WALL_T = 0.16;
export const PILLAR_HALF = 0.3;

export const LIGHT_NONE = 0;
export const LIGHT_STEADY = 1;
export const LIGHT_FLICKER = 2;
export const LIGHT_DYING = 3;
export const LIGHT_DEAD = 4;

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export interface Halls {
  readonly seed: number;
  /** Floor number, 0 = first. Deeper floors are darker and their exit is farther. */
  readonly depth: number;
  /** Cell of the exit door. */
  readonly exitX: number;
  readonly exitZ: number;
  /** Direction (radians, atan2(dz, dx)) of a chalk arrow drawn on the floor of this cell, or null. */
  arrow(ix: number, iz: number): number | null;
  /** True if a body can step from cell (ix,iz) to the adjacent cell (ix+dx, iz+dz). */
  open(ix: number, iz: number, dx: number, dz: number): boolean;
  /** True if no wall stands between two points (pillars are ignored). */
  los(ax: number, az: number, bx: number, bz: number): boolean;
  /** Wall on the north edge of cell (ix,iz): along z = iz*CELL. */
  wallN(ix: number, iz: number): boolean;
  /** Wall on the west edge of cell (ix,iz): along x = ix*CELL. */
  wallW(ix: number, iz: number): boolean;
  pillar(ix: number, iz: number): boolean;
  /** LIGHT_* mode of the ceiling panel of this cell (LIGHT_NONE if no panel). */
  light(ix: number, iz: number): number;
  /** Brightness 0..1 of the panel of this cell at time t (seconds). Pure function. */
  lightLevel(ix: number, iz: number, t: number): number;
  /** Move a circle with wall sliding. Returns the new position in `out`. */
  move(x: number, z: number, dx: number, dz: number, r: number, out: { x: number; z: number }): void;
}

export function createHalls(seed: number, depth = 0): Halls {
  const sA = mix32(seed ^ 0x1111), sB = mix32(seed ^ 0x2222), sC = mix32(seed ^ 0x3333);
  const sD = mix32(seed ^ 0x4444), sL = mix32(seed ^ 0x5555), sK = mix32(seed ^ 0x6666);

  /** Smooth value noise in [0,1]. */
  function noise(s: number, x: number, z: number): number {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    let fx = x - x0, fz = z - z0;
    fx = fx * fx * (3 - 2 * fx);
    fz = fz * fz * (3 - 2 * fz);
    const a = toUnit(hash2(s, x0, z0)), b = toUnit(hash2(s, x0 + 1, z0));
    const c = toUnit(hash2(s, x0, z0 + 1)), d = toUnit(hash2(s, x0 + 1, z0 + 1));
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }
  const density = (ix: number, iz: number): number => noise(sD, ix / 11, iz / 11);
  const openHall = (ix: number, iz: number): boolean => density(ix, iz) < 0.27;

  /** Generic segmented wall line. `line` is the grid line index, `along` the cell index on it. */
  function segWall(s: number, line: number, along: number, dens: number): boolean {
    if (dens < 0.27) return false;
    const len = 3 + (hash1(s, line) % 4);
    const off = hash1(s ^ 0x77, line) % len;
    const seg = Math.floor((along + off) / len);
    const h = hash2(s, seg, line);
    if (mod(along + off, len) === h % len) return false; // guaranteed doorway
    return toUnit(mix32(h ^ 0x9e3779b1)) < 0.12 + 0.6 * dens;
  }

  // The exit lies in a seed-dependent direction, farther away on deeper floors.
  const exitAngle = toUnit(hash1(seed, 91)) * Math.PI * 2;
  const exitDist = 34 + depth * 7;
  const exitX = Math.round(Math.cos(exitAngle) * exitDist), exitZ = Math.round(Math.sin(exitAngle) * exitDist);

  // Keep the spawn cell (0,0), the exit cell and their surroundings free of surprises.
  const nearSpawn = (ix: number, iz: number): boolean =>
    (Math.abs(ix) <= 1 && Math.abs(iz) <= 1) || (Math.abs(ix - exitX) <= 1 && Math.abs(iz - exitZ) <= 1);

  const rawN = (ix: number, iz: number): boolean =>
    !(nearSpawn(ix, iz) && nearSpawn(ix, iz - 1)) && segWall(sA, iz, ix, density(ix, iz));
  const rawW = (ix: number, iz: number): boolean =>
    !(nearSpawn(ix, iz) && nearSpawn(ix - 1, iz)) && segWall(sB, ix, iz, density(ix, iz));
  // Connectivity rule: a cell never has both its north and west edges walled (as in a
  // "binary tree" maze), so from any cell one can always keep going north or west.
  const dropN = (ix: number, iz: number): boolean => (hash2(sC ^ 0x51, ix, iz) & 1) === 0;
  const wallN = (ix: number, iz: number): boolean => rawN(ix, iz) && !(rawW(ix, iz) && dropN(ix, iz));
  const wallW = (ix: number, iz: number): boolean => rawW(ix, iz) && !(rawN(ix, iz) && !dropN(ix, iz));

  const pillar = (ix: number, iz: number): boolean =>
    mod(ix, 3) === 1 && mod(iz, 3) === 1 && !nearSpawn(ix, iz) && openHall(ix, iz) &&
    toUnit(hash2(sC, ix, iz)) < 0.85;

  function light(ix: number, iz: number): number {
    if (mod(ix, 2) !== 0 || mod(iz, 2) !== 0) return LIGHT_NONE;
    if (nearSpawn(ix, iz)) return LIGHT_STEADY;
    const r = toUnit(hash2(sL, ix, iz));
    if (noise(sK, ix / 9, iz / 9) > 0.7 - depth * 0.05) return r < 0.72 ? LIGHT_DEAD : r < 0.86 ? LIGHT_DYING : LIGHT_FLICKER;
    return r < 0.76 ? LIGHT_STEADY : r < 0.9 ? LIGHT_FLICKER : r < 0.94 ? LIGHT_DYING : LIGHT_DEAD;
  }

  function lightLevel(ix: number, iz: number, t: number): number {
    const mode = light(ix, iz);
    if (mode === LIGHT_NONE || mode === LIGHT_DEAD) return 0;
    if (mode === LIGHT_STEADY) return 1;
    const id = hash2(sL ^ 0xabc, ix, iz);
    if (mode === LIGHT_DYING) return toUnit(hash2(id, Math.floor(t * 11), 3)) > 0.93 ? 0.9 : 0.03;
    // Flicker: mostly on, with irregular stuttering episodes.
    const period = 2.5 + (id % 5);
    const episode = toUnit(hash2(id, Math.floor(t / period), 1));
    const phase = (t / period) % 1;
    if (episode < 0.6 && phase < 0.08 + episode * 0.4) {
      return toUnit(hash2(id, Math.floor(t * 17), 2)) > 0.45 ? 1 : 0.06;
    }
    return 1;
  }

  /** Push a circle out of an axis-aligned box. */
  function pushOut(p: { x: number; z: number }, r: number, x0: number, z0: number, x1: number, z1: number): void {
    const cx = Math.max(x0, Math.min(p.x, x1)), cz = Math.max(z0, Math.min(p.z, z1));
    let dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r;
      p.z = cz + (dz / d) * r;
    } else {
      // Centre inside the box: leave through the nearest face.
      dx = Math.min(p.x - x0, x1 - p.x);
      dz = Math.min(p.z - z0, z1 - p.z);
      if (dx < dz) p.x = p.x - x0 < x1 - p.x ? x0 - r : x1 + r;
      else p.z = p.z - z0 < z1 - p.z ? z0 - r : z1 + r;
    }
  }

  function resolve(p: { x: number; z: number }, r: number): void {
    const h = WALL_T / 2;
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    for (let pass = 0; pass < 2; pass++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        for (let ix = cx - 1; ix <= cx + 1; ix++) {
          const x = ix * CELL, z = iz * CELL;
          if (wallN(ix, iz)) pushOut(p, r, x - h, z - h, x + CELL + h, z + h);
          if (wallW(ix, iz)) pushOut(p, r, x - h, z - h, x + h, z + CELL + h);
          if (pillar(ix, iz)) {
            const mx = x + CELL / 2, mz = z + CELL / 2;
            pushOut(p, r, mx - PILLAR_HALF, mz - PILLAR_HALF, mx + PILLAR_HALF, mz + PILLAR_HALF);
          }
        }
      }
    }
  }

  function move(x: number, z: number, dx: number, dz: number, r: number, out: { x: number; z: number }): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
    out.x = x;
    out.z = z;
    for (let i = 0; i < steps; i++) {
      out.x += dx / steps;
      out.z += dz / steps;
      resolve(out, r);
    }
  }

  function arrow(ix: number, iz: number): number | null {
    if (toUnit(hash2(sK ^ 0x77, ix, iz)) > 0.04 || nearSpawn(ix, iz) || pillar(ix, iz)) {
      // Always leave one arrow next to the spawn so the player learns what to look for.
      if (ix !== 0 || iz !== -1) return null;
    }
    const jitter = (toUnit(hash2(sK ^ 0x99, ix, iz)) - 0.5) * 0.5;
    return Math.atan2(exitZ - iz, exitX - ix) + jitter;
  }

  function open(ix: number, iz: number, dx: number, dz: number): boolean {
    if (pillar(ix + dx, iz + dz)) return false;
    if (dz === -1) return !wallN(ix, iz);
    if (dz === 1) return !wallN(ix, iz + 1);
    if (dx === -1) return !wallW(ix, iz);
    return !wallW(ix + 1, iz);
  }

  function los(ax: number, az: number, bx: number, bz: number): boolean {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
    let cx = Math.floor(ax / CELL), cz = Math.floor(az / CELL);
    for (let i = 1; i <= n; i++) {
      const nx = Math.floor((ax + ((bx - ax) * i) / n) / CELL), nz = Math.floor((az + ((bz - az) * i) / n) / CELL);
      if (nx !== cx && nz !== cz) {
        // Diagonal step: blocked unless one of the two L-shaped ways is free.
        const viaX = wallFree(cx, cz, nx - cx, 0) && wallFree(nx, cz, 0, nz - cz);
        const viaZ = wallFree(cx, cz, 0, nz - cz) && wallFree(cx, nz, nx - cx, 0);
        if (!viaX && !viaZ) return false;
      } else if (nx !== cx) {
        if (!wallFree(cx, cz, nx - cx, 0)) return false;
      } else if (nz !== cz && !wallFree(cx, cz, 0, nz - cz)) return false;
      cx = nx;
      cz = nz;
    }
    return true;
  }
  function wallFree(ix: number, iz: number, dx: number, dz: number): boolean {
    if (dz === -1) return !wallN(ix, iz);
    if (dz === 1) return !wallN(ix, iz + 1);
    if (dx === -1) return !wallW(ix, iz);
    return !wallW(ix + 1, iz);
  }

  return { seed, depth, exitX, exitZ, wallN, wallW, pillar, light, lightLevel, move, arrow, open, los };
}
