/**
 * World module entry point.
 * Foundation stub: the World agent replaces these two factories with the real implementation.
 */

import type { LevelDef } from '../levels/types';
import type { LightField, World } from './api';

export type * from './api';
export * from './types';

export function createWorld(_level: LevelDef, _seed: number): World {
  throw new Error('createWorld: not implemented yet (World agent, milestone 1)');
}

export function createLightField(_world: World, _size: number): LightField {
  throw new Error('createLightField: not implemented yet (World agent, milestone 1)');
}
