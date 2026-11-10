/**
 * LIMINAL — world query API (interface only; implemented in shared/src/world/ by the World agent).
 * CONTRACT FILE: changes must be validated by the technical director (see docs/AGENTS.md).
 *
 * A `World` wraps a level definition + a seed, generates chunks on demand (deterministically),
 * caches them, and answers every spatial question the game asks: collisions, line of sight,
 * floor height, lighting. The SAME implementation runs on the client (prediction, rendering,
 * audio) and on the host (authoritative simulation).
 */

import type { Dir } from '../constants';
import type { LevelDef } from '../levels/types';
import type {
  CellType,
  ChunkData,
  EdgeRef,
  Fixture,
  MoveResult,
  PropType,
  RayHit,
  SurfaceKind,
  WallType,
  WorldObjectDef,
} from './types';

export interface World {
  readonly level: LevelDef;
  /** Numeric seed (uint32) — use hashString() to derive it from the text typed by the player. */
  readonly seed: number;

  // --- Chunks --------------------------------------------------------------

  /** Generated on first access, then cached. Never returns null: the world is infinite. */
  getChunk(cx: number, cz: number): ChunkData;
  /**
   * Drop cached chunks farther than `radius` chunks (Chebyshev) from every given centre.
   * Call it occasionally to bound memory; generation is deterministic so nothing is lost.
   */
  prune(centres: ReadonlyArray<{ cx: number; cz: number }>, radius: number): void;

  // --- Cell queries (world cell coordinates, any integer) -------------------

  cellAt(ix: number, iz: number): CellType;
  /** Static wall type on that edge of the cell (any of the 4 directions), or null. */
  wallAt(ix: number, iz: number, dir: Dir): WallType | null;
  propAt(ix: number, iz: number): PropType | null;
  variantAt(ix: number, iz: number): number;
  zoneAt(ix: number, iz: number): number;
  /**
   * True if a player-sized body cannot cross from cell (ix,iz) to its neighbour in `dir`:
   * solid neighbour, blocking wall without opening, closed door, or a floor step higher than 0.6 m.
   * (Used by pathfinding and generation tests; precise collisions use moveCircle.)
   */
  edgeBlocked(ix: number, iz: number, dir: Dir): boolean;

  // --- Continuous queries (world metres) ------------------------------------

  floorYAt(x: number, z: number): number;
  /** Ceiling height at this position, or null under open sky. */
  ceilYAt(x: number, z: number): number | null;
  /** Depth of water above the floor at this position (0 if dry). */
  waterDepthAt(x: number, z: number): number;
  surfaceAt(x: number, z: number): SurfaceKind;

  // --- Dynamic blockers ------------------------------------------------------

  /** Close/open the door sitting in the opening of an edge. Closed doors block movement and sight. */
  setDoor(edge: EdgeRef, closed: boolean): void;
  isDoorClosed(edge: EdgeRef): boolean;

  // --- Physics ---------------------------------------------------------------

  /**
   * Move a vertical cylinder of given radius from (x,z) by (dx,dz), sliding along obstacles
   * (walls, solid cells, prop colliders, closed doors, floor steps higher than 0.6 m).
   * Must be deterministic and tunnelling-free for |d| up to 1 m per call. Writes into `out`.
   */
  moveCircle(x: number, z: number, radius: number, dx: number, dz: number, out: MoveResult): MoveResult;

  /**
   * Cast a segment from A to B (world metres, Y included so that half-height walls and props
   * only block rays passing below their top). Returns the first blocking hit or null if clear.
   *  - 'sight': stops on anything with blocksSight (walls, solid cells, tall props, closed doors).
   *  - 'move' : stops on anything that blocks movement.
   */
  raycast(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    mode: 'sight' | 'move',
  ): RayHit | null;

  /** Shorthand for raycast(..., 'sight') === null. */
  hasLineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean;

  // --- Lights ----------------------------------------------------------------

  /** Fixtures located in a chunk (cached). */
  fixturesInChunk(cx: number, cz: number): readonly Fixture[];
  /** Append to `out` (after clearing it) every fixture within `radius` metres of (x,z). */
  fixturesNear(x: number, z: number, radius: number, out: Fixture[]): Fixture[];
  /**
   * Current brightness 0..1 of a fixture at simulation time `time` (seconds), including its
   * deterministic flicker pattern and the power state of its group.
   * `power` is a bitmask: bit g set = power group g is on (group 0 is always on).
   */
  fixtureLevel(f: Fixture, time: number, power: number): number;
  /**
   * Scalar illumination at a position: level ambient + nearby fixtures (with falloff and wall
   * occlusion). ~0 = pitch black, ~1 = comfortably lit. Used by gameplay (darkness rules, AI).
   */
  lightAt(x: number, z: number, time: number, power: number): number;

  // --- Objects ---------------------------------------------------------------

  /** Static object definitions of a chunk (same array as getChunk(cx,cz).objects). */
  objectsInChunk(cx: number, cz: number): readonly WorldObjectDef[];
}

/**
 * Per-cell illumination grid centred on a moving point, used by the renderer (uploaded as a
 * texture and sampled by every surface shader) and available to any system that wants a cheap
 * "how bright is it around here" map. Light spreads from fixtures cell to cell and is stopped by
 * sight-blocking walls, so a lit room does not leak through its walls.
 */
export interface LightField {
  /** Side of the square grid, in cells. */
  readonly size: number;
  /** World cell coordinates of grid texel (0,0) after the last update(). */
  readonly originIx: number;
  readonly originIz: number;
  /** RGB illumination per cell, row-major (index = (gz*size + gx)*3), linear, may exceed 1. */
  readonly data: Float32Array;
  /**
   * Recompute the grid so that it is centred on the cell containing (x,z).
   * Cheap enough to be called 15–20 times per second for a 96×96 grid.
   */
  update(x: number, z: number, time: number, power: number): void;
  /** Bilinear sample of the luminance at a world position (0 outside the grid). */
  sample(x: number, z: number): number;
}
