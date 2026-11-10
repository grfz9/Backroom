import { describe, expect, it } from 'vitest';
import { createHalls } from '../levels/halls';
import { hashString } from '../math/rng';
import { createMimic, stepMimic } from './mimic';

const DT = 1 / 60;

describe('mimic', () => {
  it('appears late, out of sight, at a distance', () => {
    const h = createHalls(hashString('double')), m = createMimic(h);
    for (let t = 0; t < 25; t += DT) stepMimic(m, h, 1, 1, DT);
    expect(m.state).toBe('dormant');
    while (m.state === 'dormant' && m.time < 200) stepMimic(m, h, 1, 1, DT);
    expect(m.state).toBe('approach');
    expect(Math.hypot(m.x - 1, m.z - 1)).toBeGreaterThan(17);
  });

  it('walks up to a player who does not move and strikes', () => {
    const h = createHalls(hashString('double')), m = createMimic(h);
    let caught = false;
    for (let t = 0; t < 400 && !caught; t += DT) caught = stepMimic(m, h, 1, 1, DT);
    expect(caught).toBe(true);
  });

  it('never moves faster than a walking player and gives up on one who keeps away', () => {
    const h = createHalls(hashString('double')), m = createMimic(h);
    let px = 1, left = false, caught = false, lx = 0, lz = 0;
    for (let t = 0; t < 300; t += DT) {
      if (m.state !== 'dormant') px = m.x + 12;          // the player always stays 12 m away
      caught ||= stepMimic(m, h, px, m.z, DT);
      if (m.state !== 'dormant' && lx !== 0) expect(Math.hypot(m.x - lx, m.z - lz) / DT).toBeLessThan(2.5);
      lx = m.state === 'dormant' ? 0 : m.x;
      lz = m.z;
      left ||= m.state === 'leave';
    }
    expect(caught).toBe(false);
    expect(left).toBe(true);
  });
});
