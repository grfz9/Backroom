/**
 * LIMINAL — level definition format.
 * CONTRACT FILE: changes must be validated by the technical director (see docs/AGENTS.md).
 *
 * A level is a "content pack" made of:
 *   - shared/src/levels/<id>/   : LevelDef (palettes, generator, script, spawn rules) — pure logic,
 *   - client/src/themes/<id>/   : Theme (materials, models, post-processing mood),
 *   - client/src/audio/ambiences/<id>.ts : ambience preset.
 * Only the first part is described here.
 */

import type { CellType, ChunkData, LightType, PropType, RGB, WallType, WorldObjectDef } from '../world/types';
import type { World } from '../world/api';
import type { EntityKind, EntityNet, GameEvent, ItemId, PlayerNet, SoundId } from '../sim/types';

export type LevelId =
  | 'l0_halls'
  | 'l1_parking'
  | 'l2_pools'
  | 'l3_offices'
  | 'l4_warehouse'
  | 'l5_hotel'
  | 'l6_outside'
  | 'l7_threshold';

/** Produces chunks. MUST be a pure function of (seed, cx, cz), independent of call order. */
export interface ChunkGenerator {
  generate(cx: number, cz: number): ChunkData;
}

export interface LevelDef {
  id: LevelId;
  /** Order in the progression, 0..7. */
  index: number;
  /** i18n key of the level name. */
  nameKey: string;

  // --- Palettes: chunk bytes index these arrays. Index 0 of walls/props/lights means "none"
  // (use NO_WALL / NO_PROP / NO_LIGHT as placeholders). cells[0] must be the default solid block.
  cells: readonly CellType[];
  walls: readonly WallType[];
  props: readonly PropType[];
  lights: readonly LightType[];

  /** Base illumination present everywhere, even far from any fixture. */
  ambient: { color: RGB; level: number };
  /** Distance fog (linear RGB colour, metres). Nothing is visible beyond `far`. */
  fog: { color: RGB; near: number; far: number };
  /** Hints for the audio system. */
  audio: {
    /** Ambience preset key (client/src/audio/ambiences). */
    ambience: string;
    /** Reverb send 0..1 and tail length in seconds. */
    reverb: number;
    reverbTime: number;
  };

  createGenerator(seed: number): ChunkGenerator;
  /** Where players appear. Must be an open, safe cell. */
  spawn(seed: number): { x: number; z: number; yaw: number };

  /** Level rules and puzzles — DRAFT, used from milestone 2. */
  createScript?(): LevelScript;
  /** Ambient entity population rules — DRAFT, used from milestone 2. */
  director?: readonly DirectorRule[];
}

// ---------------------------------------------------------------------------
// Scripts — DRAFT (frozen at milestone 2 for the basics, milestone 4 for puzzles)
// ---------------------------------------------------------------------------

/** Keeps `count` entities of a kind alive around the players. */
export interface DirectorRule {
  kind: EntityKind;
  /** Seconds after level start before the first spawn. */
  after: number;
  /** Target number of live entities of this kind. */
  count: number;
  /** Spawn ring around a random player, in metres (never in line of sight). */
  minDist: number;
  maxDist: number;
  /** Despawn when farther than this from every player. */
  despawnDist: number;
}

/** What a level script can see and do. Implemented by the simulation. */
export interface ScriptCtx {
  readonly world: World;
  readonly seed: number;
  /** Simulation time in seconds since the level started. */
  readonly time: number;
  readonly players: readonly PlayerNet[];
  readonly entities: readonly EntityNet[];
  /** Deterministic random float in [0,1) from the simulation stream. */
  random(): number;

  getFlag(name: string): number;
  setFlag(name: string, value: number): void;
  /** Turn a light power group (1..15) on or off. */
  setPower(group: number, on: boolean): void;

  getObject(id: string): WorldObjectDef | undefined;
  getObjectState(id: string): number;
  setObjectState(id: string, state: number): void;
  /** Add a dynamic object (dropped item, scripted prop). */
  addObject(def: WorldObjectDef): void;
  removeObject(id: string): void;

  hasItem(playerId: number, item: ItemId, tag?: string): boolean;
  takeItem(playerId: number, item: ItemId, tag?: string): boolean;
  giveItem(playerId: number, item: ItemId, tag?: string): boolean;

  spawnEntity(kind: EntityKind, x: number, z: number): number;
  removeEntity(id: number): void;

  damage(playerId: number, amount: number): void;
  addSanity(playerId: number, amount: number): void;
  teleport(playerId: number, x: number, z: number, yaw?: number): void;

  /** Emit a one-shot event to clients. */
  emit(event: GameEvent): void;
  sound(id: SoundId, x: number, y: number, z: number, vol?: number): void;
  /** A noise entities can hear (radius in metres). */
  noise(x: number, z: number, radius: number): void;
  setObjective(key: string, args?: Record<string, string | number>): void;
  /** Finish the level and move every player to the next one. */
  completeLevel(): void;
}

export interface LevelScript {
  /** Called once when the level starts (choose codes, place scripted things, set the objective). */
  init?(ctx: ScriptCtx): void;
  /** Called every simulation tick. Keep it cheap. */
  tick?(ctx: ScriptCtx, dt: number): void;
  /**
   * A player interacted with an object. Return true if the script handled it (this suppresses
   * the default behaviour of the object kind).
   */
  interact?(ctx: ScriptCtx, playerId: number, obj: WorldObjectDef, state: number): boolean;
  /** A keypad code was submitted. Return true if accepted. */
  code?(ctx: ScriptCtx, playerId: number, obj: WorldObjectDef, code: string): boolean;
  /** A player entered a trigger volume. */
  trigger?(ctx: ScriptCtx, playerId: number, obj: WorldObjectDef): void;
  /** May the exit be used right now? (default: yes) */
  canExit?(ctx: ScriptCtx, obj: WorldObjectDef): boolean;
}
