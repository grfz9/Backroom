import { describe, expect, it } from 'vitest';
import { CELL } from '../constants';
import { hashString } from '../math/rng';
import { createHalls, LIGHT_DEAD, LIGHT_NONE } from './halls';

const R = 0.3;

/** True if moving from a cell to its neighbour in direction (dx,dz) crosses a wall. */
function blocked(h: ReturnType<typeof createHalls>, ix: number, iz: number, dx: number, dz: number): boolean {
  if (dz === -1) return h.wallN(ix, iz);
  if (dz === 1) return h.wallN(ix, iz + 1);
  if (dx === -1) return h.wallW(ix, iz);
  return h.wallW(ix + 1, iz);
}

describe('halls generation', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = createHalls(hashString('test')), b = createHalls(hashString('test')), c = createHalls(hashString('other'));
    let same = 0, total = 0;
    for (let z = -40; z < 40; z++) for (let x = -40; x < 40; x++) {
      expect(a.wallN(x, z)).toBe(b.wallN(x, z));
      expect(a.wallW(x, z)).toBe(b.wallW(x, z));
      expect(a.light(x, z)).toBe(b.light(x, z));
      total++;
      if (a.wallN(x, z) === c.wallN(x, z)) same++;
    }
    expect(same).toBeLessThan(total);
  });

  it('keeps the maze connected around the spawn', () => {
    for (const s of ['a', 'b', 'liminal', '42']) {
      const h = createHalls(hashString(s));
      const N = 30, size = 2 * N + 1;
      const seen = new Uint8Array(size * size);
      const queue = [[0, 0]];
      seen[N * size + N] = 1;
      let count = 0;
      while (queue.length) {
        const [x, z] = queue.pop()!;
        count++;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (Math.abs(nx) > N || Math.abs(nz) > N || blocked(h, x, z, dx, dz)) continue;
          const i = (nz + N) * size + nx + N;
          if (!seen[i]) { seen[i] = 1; queue.push([nx, nz]); }
        }
      }
      expect(count / (size * size)).toBeGreaterThan(0.97);
    }
  });

  it('has walls, pillars, and a mix of light modes', () => {
    const h = createHalls(hashString('liminal'));
    let walls = 0, pillars = 0, lights = 0, dead = 0;
    for (let z = -60; z < 60; z++) for (let x = -60; x < 60; x++) {
      if (h.wallN(x, z)) walls++;
      if (h.pillar(x, z)) pillars++;
      const l = h.light(x, z);
      if (l !== LIGHT_NONE) lights++;
      if (l === LIGHT_DEAD) dead++;
    }
    expect(walls).toBeGreaterThan(1000);
    expect(pillars).toBeGreaterThan(10);
    expect(dead).toBeGreaterThan(0);
    expect(dead).toBeLessThan(lights / 2);
  });

  it('light levels stay in [0,1] and are pure functions of time', () => {
    const h = createHalls(7);
    for (let x = -20; x < 20; x += 2) for (let t = 0; t < 30; t += 0.37) {
      const v = h.lightLevel(x, 4, t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(h.lightLevel(x, 4, t)).toBe(v);
    }
  });
});

describe('halls collisions', () => {
  it('never lets the player cross a wall, whatever the direction and speed', () => {
    const h = createHalls(hashString('walls'));
    const out = { x: 0, z: 0 };
    let x = CELL / 2, z = CELL / 2;
    for (let i = 0; i < 4000; i++) {
      const ang = (i * 2.399963) % (Math.PI * 2);
      const step = 0.05 + (i % 7) * 0.12;
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      h.move(x, z, Math.cos(ang) * step, Math.sin(ang) * step, R, out);
      const nx = Math.floor(out.x / CELL), nz = Math.floor(out.z / CELL);
      // A single move of < 1 m changes cell by at most one step per axis, and never through a wall.
      if (nx !== cx && nz === cz) expect(blocked(h, cx, cz, nx - cx, 0)).toBe(false);
      if (nz !== cz && nx === cx) expect(blocked(h, cx, cz, 0, nz - cz)).toBe(false);
      x = out.x;
      z = out.z;
    }
  });

  it('slides along a wall instead of sticking', () => {
    const h = createHalls(hashString('slide'));
    // Find a north wall with free cells on both sides along x.
    for (let ix = 3; ix < 200; ix++) {
      if (h.wallN(ix, 5) && h.wallN(ix + 1, 5) && !h.wallW(ix + 1, 5) && !h.pillar(ix, 5) && !h.pillar(ix + 1, 5)) {
        const out = { x: 0, z: 0 };
        const x0 = ix * CELL + 0.6, z0 = 5 * CELL + 0.5;
        h.move(x0, z0, 0.5, -0.5, R, out);
        expect(out.x).toBeGreaterThan(x0 + 0.4);
        expect(out.z).toBeGreaterThanOrEqual(5 * CELL + R);
        return;
      }
    }
    throw new Error('no suitable wall found');
  });
});
