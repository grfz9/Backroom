import { describe, expect, it } from 'vitest';
import { Rng, hash2, hash3, hashString, rand2 } from './rng';

describe('rng', () => {
  it('hashString is stable (changing it would change every world)', () => {
    expect(hashString('liminal')).toBe(hashString('liminal'));
    expect(hashString('liminal')).not.toBe(hashString('liminaL'));
    expect(hashString('')).toBeTypeOf('number');
    // Golden values: if these change, every seed generates a different world.
    expect([hashString('liminal'), hashString('bande-12'), hash2(1234, -5, 7), hash3(1, 2, 3, 4)]).toMatchInlineSnapshot(`
      [
        1208661681,
        2607688786,
        60928881,
        1429868778,
      ]
    `);
  });

  it('hash2 handles negative coordinates and spreads values', () => {
    const seen = new Set<number>();
    for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) seen.add(hash2(42, x, z));
    expect(seen.size).toBe(41 * 41);
    for (let i = 0; i < 100; i++) {
      const r = rand2(7, i - 50, i * 3);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });

  it('Rng is deterministic and roughly uniform', () => {
    const a = new Rng(99);
    const b = new Rng(99);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);

    const r = new Rng(5);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += r.next();
    expect(sum / n).toBeGreaterThan(0.48);
    expect(sum / n).toBeLessThan(0.52);
  });

  it('helpers stay in range', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.intRange(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      expect(r.int(4)).toBeLessThan(4);
      expect(r.weighted([0, 1, 0])).toBe(1);
    }
    expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
