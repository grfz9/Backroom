/**
 * Le Double — an entity disguised as a surveyor (it looks like a player).
 *
 * It appears out of sight and simply walks up to the nearest player, like a teammate coming
 * back. At arm's length it strikes. It walks slightly slower than a player and never runs, so
 * keeping your distance is enough — if you noticed that this "teammate" is not one: its
 * camcorder light is off, it never crouches, never lights a flashlight and never speaks.
 * After a while it gives up, walks away and comes back later.
 */

import { CELL } from '../constants';
import type { Halls } from '../levels/halls';
import { Rng } from '../math/rng';
import { findPath } from './prowler';

export type MimicState = 'dormant' | 'approach' | 'leave';

export interface Mimic {
  x: number;
  z: number;
  yaw: number;
  state: MimicState;
  time: number;
  stateTime: number;
  speed: number;
  path: number[];
  repath: number;
  rng: Rng;
  depth: number;
}

const FIRST_DELAY = 80;
const WALK = 2.25;
const STRIKE_DIST = 1.0;
const PATIENCE = 45;
const out = { x: 0, z: 0 };

export function createMimic(halls: Halls): Mimic {
  return {
    x: 0, z: 0, yaw: 0, state: 'dormant', time: 0, stateTime: 0, speed: 0, path: [], repath: 0,
    rng: new Rng(halls.seed ^ 0xd0b1e), depth: halls.depth,
  };
}

/** Advance by dt seconds toward the player at (px,pz). Returns true if it caught the player. */
export function stepMimic(m: Mimic, halls: Halls, px: number, pz: number, dt: number): boolean {
  m.time += dt;
  m.stateTime += dt;
  const dist = Math.hypot(px - m.x, pz - m.z);

  if (m.state === 'dormant') {
    if (m.time < Math.max(30, FIRST_DELAY - m.depth * 12)) return false;
    for (let i = 0; i < 12; i++) {
      const a = m.rng.next() * Math.PI * 2, d = 20 + m.rng.next() * 10;
      const cx = Math.floor((px + Math.cos(a) * d) / CELL), cz = Math.floor((pz + Math.sin(a) * d) / CELL);
      const x = (cx + 0.5) * CELL, z = (cz + 0.5) * CELL;
      if (halls.pillar(cx, cz) || halls.los(x, z, px, pz)) continue;
      m.x = x;
      m.z = z;
      m.state = 'approach';
      m.stateTime = 0;
      m.repath = 0;
      break;
    }
    return false;
  }

  if (m.state === 'approach' && m.stateTime > PATIENCE) {
    m.state = 'leave';
    m.stateTime = 0;
    m.repath = 0;
  }
  if (m.state === 'leave' && (m.stateTime > 20 || dist > 60)) {
    m.state = 'dormant';
    m.time = FIRST_DELAY - 35;       // comes back in about half a minute
    return false;
  }

  m.repath -= dt;
  if (m.repath <= 0) {
    m.repath = 0.5;
    const cx = Math.floor(m.x / CELL), cz = Math.floor(m.z / CELL);
    if (m.state === 'approach') m.path = findPath(halls, cx, cz, Math.floor(px / CELL), Math.floor(pz / CELL));
    else m.path = findPath(halls, cx, cz, cx + Math.round((m.x - px) / dist * 14), cz + Math.round((m.z - pz) / dist * 14));
  }

  m.speed += (WALK - m.speed) * Math.min(1, dt * 3);
  let tx = m.x, tz = m.z;
  if (m.state === 'approach' && dist < 3.5 && halls.los(m.x, m.z, px, pz)) {
    tx = px;
    tz = pz;
  } else if (m.path.length > 0) {
    tx = (m.path[0] + 0.5) * CELL;
    tz = (m.path[1] + 0.5) * CELL;
    if (Math.hypot(tx - m.x, tz - m.z) < 0.35) m.path.splice(0, 2);
  }
  const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
  if (d > 0.05) {
    const step = Math.min(d, m.speed * dt);
    halls.move(m.x, m.z, (dx / d) * step, (dz / d) * step, 0.3, out);
    m.x = out.x;
    m.z = out.z;
    let turn = Math.atan2(-dx, -dz) - m.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    m.yaw += turn * Math.min(1, dt * 6);
  }
  return m.state === 'approach' && Math.hypot(px - m.x, pz - m.z) < STRIKE_DIST;
}
