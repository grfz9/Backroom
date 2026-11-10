/**
 * Level registry. Each level module calls registerLevel() from shared/src/levels/index.ts.
 */

import type { LevelDef, LevelId } from './types';

const LEVELS = new Map<LevelId, LevelDef>();

export function registerLevel(def: LevelDef): void {
  LEVELS.set(def.id, def);
}

export function getLevel(id: LevelId): LevelDef {
  const def = LEVELS.get(id);
  if (!def) throw new Error(`Unknown level: ${id}`);
  return def;
}

export function hasLevel(id: LevelId): boolean {
  return LEVELS.has(id);
}

/** All registered levels, in progression order. */
export function listLevels(): LevelDef[] {
  return [...LEVELS.values()].sort((a, b) => a.index - b.index);
}
