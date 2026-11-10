import { describe, expect, it } from 'vitest';
import { CELL } from '../constants';
import { createHalls } from '../levels/halls';
import { hashString } from '../math/rng';
import { createProwler, findPath, stepProwler, type ProwlerEvent } from './prowler';

const DT = 1 / 60;

describe('level goal', () => {
  it('the exit is reachable from the spawn on every floor', () => {
    for (const seed of ['a', 'liminal', 'test-417']) for (let depth = 0; depth < 5; depth++) {
      const h = createHalls(hashString(seed) ^ depth, depth);
      // Walk the path in hops, since findPath searches a bounded window.
      let x = 0, z = 0;
      for (let hop = 0; hop < 30 && (x !== h.exitX || z !== h.exitZ); hop++) {
        const path = findPath(h, x, z, h.exitX, h.exitZ);
        expect(path.length).toBeGreaterThan(0);
        x = path[path.length - 2];
        z = path[path.length - 1];
      }
      expect([x, z]).toEqual([h.exitX, h.exitZ]);
    }
  });

  it('arrows exist and point roughly toward the exit', () => {
    const h = createHalls(hashString('arrows'));
    let count = 0;
    for (let z = -30; z < 30; z++) for (let x = -30; x < 30; x++) {
      const a = h.arrow(x, z);
      if (a === null) continue;
      count++;
      let diff = a - Math.atan2(h.exitZ - z, h.exitX - x);
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      expect(Math.abs(diff)).toBeLessThan(0.3);
    }
    expect(count).toBeGreaterThan(40);
    expect(h.arrow(0, -1)).not.toBeNull();
  });

  it('line of sight is blocked by walls and symmetric enough', () => {
    const h = createHalls(hashString('los'));
    for (let ix = 2; ix < 300; ix++) {
      if (h.wallN(ix, 4)) {
        const x = (ix + 0.5) * CELL;
        expect(h.los(x, 4 * CELL - 0.8, x, 4 * CELL + 0.8)).toBe(false);
        expect(h.los(x, 4 * CELL + 0.2, x, 4 * CELL + 1.5)).toBe(true);
        return;
      }
    }
    throw new Error('no wall found');
  });
});

describe('prowler', () => {
  function run(seconds: number, senses: (t: number) => { noise: number; lit: boolean }) {
    const h = createHalls(hashString('hunt'));
    const p = createProwler(h);
    const events: ProwlerEvent[] = [];
    const px = CELL / 2, pz = CELL / 2;
    for (let t = 0; t < seconds; t += DT) {
      const e = stepProwler(p, h, { px, pz, ...senses(t) }, DT);
      if (e !== 'none') events.push(e);
      if (e === 'caught') break;
    }
    return { p, events, px, pz };
  }

  it('stays dormant at first, then spawns far from the player and out of sight', () => {
    const early = run(15, () => ({ noise: 0, lit: true }));
    expect(early.p.state).toBe('dormant');
    const h = createHalls(hashString('hunt'));
    const p = createProwler(h);
    let spawned = false;
    for (let t = 0; t < 120 && !spawned; t += DT) spawned = stepProwler(p, h, { px: 1, pz: 1, noise: 0, lit: true }, DT) === 'spawned';
    expect(spawned).toBe(true);
    expect(Math.hypot(p.x - 1, p.z - 1)).toBeGreaterThan(25);
    expect(h.los(p.x, p.z, 1, 1)).toBe(false);
  });

  it('hunts down a player who keeps making noise', () => {
    const { events } = run(400, () => ({ noise: 15, lit: true }));
    expect(events).toContain('spotted');
    expect(events[events.length - 1]).toBe('caught');
  });

  it('is deterministic', () => {
    const a = run(120, () => ({ noise: 6, lit: true })), b = run(120, () => ({ noise: 6, lit: true }));
    expect([a.p.x, a.p.z, a.p.state]).toEqual([b.p.x, b.p.z, b.p.state]);
  });

  it('never walks through walls', () => {
    const h = createHalls(hashString('hunt'));
    const p = createProwler(h);
    let cx = 0, cz = 0, active = false;
    for (let t = 0; t < 200; t += DT) {
      const e = stepProwler(p, h, { px: 1, pz: 1, noise: 15, lit: true }, DT);
      const nx = Math.floor(p.x / CELL), nz = Math.floor(p.z / CELL);
      if (active && (nx !== cx || nz !== cz) && Math.abs(nx - cx) + Math.abs(nz - cz) === 1) {
        expect(h.open(cx, cz, nx - cx, nz - cz)).toBe(true);
      }
      active = p.state !== 'dormant' && e !== 'spawned';
      cx = nx;
      cz = nz;
      if (e === 'caught') break;
    }
  });
});
