/**
 * LIMINAL — simulation state types (players, entities, items, events).
 * CONTRACT FILE: changes must be validated by the technical director (see docs/AGENTS.md).
 *
 * Status of the sections:
 *   - Player input / movement / events used by milestone 1: FROZEN.
 *   - Items, entities, objects: DRAFT until the start of milestones 2 and 4 (the director
 *     freezes them in the briefs of those milestones).
 */

import type { SurfaceKind } from '../world/types';

// ---------------------------------------------------------------------------
// Player input & movement (deterministic, predicted on the client)
// ---------------------------------------------------------------------------

/** One command per simulation tick, produced by the client, consumed by the host. */
export interface PlayerInput {
  /** Monotonic sequence number (starts at 1). */
  seq: number;
  /** Move intent in view space: mx = strafe right (+1) / left (-1), mz = forward (+1) / back (-1). */
  mx: number;
  mz: number;
  /** Absolute view angles in radians. yaw 0 looks toward -Z (north), positive yaw turns LEFT (toward -X). */
  yaw: number;
  /** Positive pitch looks up. Clamped to ±1.5. */
  pitch: number;
  /** Bitmask of BTN_* (constants.ts). */
  buttons: number;
  /** Microphone level 0..1 (0 when muted): entities can hear players talk. */
  voice: number;
}

export type MoveMode = 'idle' | 'walk' | 'run' | 'crouch';

/**
 * The part of the player state that is a pure function of (previous state, input, world).
 * stepPlayerMove() (shared/src/sim/playerMove.ts) advances it; the client predicts it and the
 * host is authoritative.
 */
export interface PlayerMove {
  /** Feet position in metres. y follows the floor. */
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  pitch: number;
  /** 0 = standing … 1 = fully crouched. */
  crouch: number;
  stamina: number;
  exhausted: boolean;
  /** Seconds left before stamina regeneration starts. */
  staminaCooldown: number;
  mode: MoveMode;
  /** Total horizontal distance walked (m). Drives footsteps and head bob. */
  stepDist: number;
}

/** Modifiers imposed by the simulation on a player's movement for the current tick. */
export interface MoveEnv {
  /** Global speed multiplier (1 = normal; injuries, scripted slowdowns…). */
  speedMul: number;
  /** False forbids running (e.g. carrying something heavy). */
  canRun: boolean;
  /** True ignores move intent (dead, hidden, cutscene); view angles still update. */
  frozen: boolean;
}

// ---------------------------------------------------------------------------
// Items — DRAFT (frozen at milestone 4)
// ---------------------------------------------------------------------------

export type ItemId =
  | 'flashlight'
  | 'battery'
  | 'almond_water'
  | 'walkie'
  | 'map'
  | 'chalk'
  | 'fuse'
  | 'key'
  | 'keycard'
  | 'cassette';

export interface ItemStack {
  item: ItemId;
  n: number;
  /** Variant, e.g. which door a key opens. */
  tag?: string;
}

// ---------------------------------------------------------------------------
// Entities — DRAFT (frozen at milestone 2)
// ---------------------------------------------------------------------------

export type EntityKind =
  /** Le Rôdeur — baseline hunter (sight + sound), level 0. */
  | 'prowler'
  /** L'Écouteuse — blind, hunts by sound. */
  | 'listener'
  /** Les Baigneurs — only move when nobody looks at them. */
  | 'bather'
  /** L'Éteint — hunts in the dark, repelled by light. */
  | 'unlit'
  /** L'Écho — imitates players' voices to lure them. */
  | 'echo'
  /** Le Veilleur — sight-based patroller; hide to survive. */
  | 'watchman'
  /** Le Brouillon — slow, relentless, walks through walls. */
  | 'draft';

/** Entity state as replicated to clients. */
export interface EntityNet {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Behaviour state id (meaning is per kind; 0 is always "dormant/idle"). */
  st: number;
  /** Animation parameter (usually the horizontal speed in m/s). */
  anim: number;
  /** Target player id or -1. */
  tgt: number;
  /** Bit flags for visuals (per kind). */
  fx: number;
}

// ---------------------------------------------------------------------------
// Replicated player state
// ---------------------------------------------------------------------------

/** Public state of a player, sent to every client. */
export interface PlayerNet {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouch: number;
  mode: MoveMode;
  alive: boolean;
  flashlight: boolean;
  hidden: boolean;
  /** Microphone level 0..1. */
  voice: number;
  /** True while transmitting on the walkie-talkie. */
  radio: boolean;
}

/** Private authoritative state of the receiving player. */
export interface PlayerSelf {
  id: number;
  move: PlayerMove;
  health: number;
  sanity: number;
  alive: boolean;
  /** Seconds before respawn when dead (0 if alive or no respawn pending). */
  respawnIn: number;
  flashlight: boolean;
  /** Flashlight battery 0..1. */
  battery: number;
  /** Consumable / quest item slots (null = empty). */
  slots: (ItemStack | null)[];
  /** Permanent tools owned (flashlight, walkie, map, chalk). */
  tools: ItemId[];
  /** Id of the hiding spot the player is in, or null. */
  hidden: string | null;
}

// ---------------------------------------------------------------------------
// One-shot events
// ---------------------------------------------------------------------------

/**
 * Sound identifiers are free strings with the convention `domain.name`
 * (e.g. 'door.open', 'prowler.scream', 'amb.knock'). The audio system keeps the registry;
 * unknown ids must log a warning and play a generic fallback, never throw.
 */
export type SoundId = string;

export type DeathCause = EntityKind | 'sanity' | 'world';

/**
 * Events flow host → clients inside snapshots, and a few are synthesised locally by the client
 * engine (footsteps). Every subsystem (audio, UI, render) reads them from FrameState.events.
 */
export type GameEvent =
  /** Positional one-shot sound. `ent`/`pl` attach it to an entity/player if present. */
  | { e: 'sound'; id: SoundId; x: number; y: number; z: number; vol?: number; ent?: number; pl?: number }
  /** A footstep (client-synthesised from movement, for local and remote players). */
  | { e: 'step'; pl: number; x: number; y: number; z: number; surface: SurfaceKind; mode: MoveMode; wet: number }
  | { e: 'damage'; pl: number; amount: number; by: DeathCause }
  | { e: 'death'; pl: number; by: DeathCause; x: number; z: number }
  | { e: 'respawn'; pl: number }
  | { e: 'pickup'; pl: number; item: ItemId }
  /** A player opened a lore note (the UI shows it to that player only). */
  | { e: 'note'; pl: number; note: string }
  /** Short message for one player or everyone (pl = -1). `key` is an i18n key. */
  | { e: 'toast'; pl: number; key: string; args?: Record<string, string | number> }
  /** Subtitle for an important sound, optionally with a source position for the direction hint. */
  | { e: 'subtitle'; key: string; x?: number; z?: number }
  /** The current objective changed (`key` is an i18n key, '' clears it). */
  | { e: 'objective'; key: string; args?: Record<string, string | number> }
  /** A mimic entity speaks with the voice of player `pl`. */
  | { e: 'mimic'; ent: number; pl: number }
  /** Scripted scare / camera effect for one player (pl = -1 for everyone). */
  | { e: 'scare'; pl: number; kind: string; x?: number; z?: number }
  /** The level is finished; `next` is the level that follows (null = end of the game). */
  | { e: 'levelComplete'; next: string | null; time: number };
