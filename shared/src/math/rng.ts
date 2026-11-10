/**
 * Deterministic random primitives. EVERYTHING procedural in LIMINAL (world, loot, AI rolls,
 * flicker patterns) must derive from these — never from Math.random() — so that the same seed
 * yields the same world on every client and on the server.
 *
 * CONTRACT FILE: do not change the numeric output of these functions (it would change every world).
 */

/** Turn any string (the seed typed by the player) into a uint32. FNV-1a + avalanche. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h);
}

/** Final avalanche of a 32-bit integer (murmur3 fmix). Returns uint32. */
export function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash of (seed, a) → uint32. */
export function hash1(seed: number, a: number): number {
  return mix32((seed ^ Math.imul(a | 0, 0x9e3779b1)) >>> 0);
}

/** Hash of (seed, a, b) → uint32. Works for negative integers. */
export function hash2(seed: number, a: number, b: number): number {
  let h = (seed ^ Math.imul(a | 0, 0x9e3779b1)) >>> 0;
  h = mix32(h);
  h = (h ^ Math.imul(b | 0, 0x85ebca77)) >>> 0;
  return mix32(h);
}

/** Hash of (seed, a, b, c) → uint32. */
export function hash3(seed: number, a: number, b: number, c: number): number {
  return hash2(hash2(seed, a, b), c, 0x51ed270b);
}

/** uint32 → float in [0, 1). */
export function toUnit(h: number): number {
  return (h >>> 0) / 4294967296;
}

/** Convenience: hashed float in [0,1) for integer coordinates. */
export function rand2(seed: number, a: number, b: number): number {
  return toUnit(hash2(seed, a, b));
}

/**
 * Small, fast, seedable PRNG (mulberry32). Create one per generation unit (per region, per chunk,
 * per entity…) from a hash, never share one across units whose order of evaluation may vary.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Next uint32. */
  nextU32(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Integer in [min, max] (inclusive). */
  intRange(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Random element of a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** Index chosen according to weights (all >= 0, at least one > 0). */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** In-place Fisher–Yates shuffle. Returns the same array. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /** Derive an independent generator (e.g. one per sub-task) without disturbing this one's stream much. */
  fork(salt: number): Rng {
    return new Rng(hash2(this.nextU32(), salt, 0x2545f491));
  }
}
