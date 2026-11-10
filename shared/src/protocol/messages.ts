/**
 * LIMINAL — wire protocol between a client and a game host.
 * CONTRACT FILE: changes must be validated by the technical director (see docs/AGENTS.md).
 *
 * The SAME messages are used in solo (in-memory, client ↔ local GameHost) and in multiplayer
 * (JSON over WebSocket, client ↔ server room). Messages are plain JSON-serialisable objects.
 *
 * Status: 'start', 'input', 'level', 'snap' are FROZEN (milestone 1). Lobby, actions and RTC
 * messages are DRAFT until milestones 2–3.
 */

import type { LevelId } from '../levels/types';
import type { EntityNet, GameEvent, PlayerInput, PlayerNet, PlayerSelf } from '../sim/types';
import type { WorldObjectDef } from '../world/types';

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export interface LobbyPlayer {
  id: number;
  name: string;
  ready: boolean;
  host: boolean;
}

export interface LobbyState {
  /** Room code to share (empty in solo). */
  code: string;
  phase: 'lobby' | 'playing' | 'ended';
  players: LobbyPlayer[];
  level: LevelId;
  /** Seed as typed by the host (hashed with hashString() to get the numeric seed). */
  seedText: string;
}

// ---------------------------------------------------------------------------
// Client → host
// ---------------------------------------------------------------------------

export type ClientAction =
  /** Press E on an object. */
  | { a: 'interact'; obj: string }
  | { a: 'flashlight' }
  | { a: 'useSlot'; slot: number }
  | { a: 'dropSlot'; slot: number }
  | { a: 'code'; obj: string; code: string }
  /** Leave a hiding spot. */
  | { a: 'unhide' }
  /** Chalk mark on a surface. */
  | { a: 'chalk'; x: number; y: number; z: number; yaw: number; shape: number };

export type ClientMsg =
  /** First message on a WebSocket: create or join a room. */
  | { t: 'hello'; v: number; name: string; room?: string }
  /** Host only: change lobby settings. */
  | { t: 'lobby'; level?: LevelId; seedText?: string; ready?: boolean }
  /** Host only: start the game with the given level and seed (text, hashed by the host). */
  | { t: 'start'; level: LevelId; seedText: string }
  /** One or more consecutive tick inputs (oldest first). */
  | { t: 'input'; inputs: PlayerInput[] }
  | { t: 'act'; action: ClientAction }
  /** WebRTC signalling, relayed verbatim to player `to`. */
  | { t: 'rtc'; to: number; data: unknown }
  | { t: 'ping'; c: number };

// ---------------------------------------------------------------------------
// Host → client
// ---------------------------------------------------------------------------

/** World state replicated 20 times per second. */
export interface Snapshot {
  tick: number;
  /** Level simulation time in seconds. */
  time: number;
  /** Sequence number of the last PlayerInput the host applied for the receiver. */
  ack: number;
  self: PlayerSelf;
  /** Every OTHER player. */
  players: PlayerNet[];
  entities: EntityNet[];
  /** Light power groups bitmask (bit g = group g powered). */
  power: number;
  /** One-shot events since the previous snapshot. */
  events: GameEvent[];
  /** Object states that changed since the previous snapshot: [id, state]; state -1 = removed. */
  objs?: Array<[string, number]>;
  /** Script flags that changed since the previous snapshot. */
  flags?: Array<[string, number]>;
}

export type ServerMsg =
  | { t: 'welcome'; v: number; id: number; lobby: LobbyState }
  | { t: 'lobby'; lobby: LobbyState }
  /** (Re)load a level: the client builds its World from (level, seed) and applies the overrides. */
  | {
      t: 'level';
      level: LevelId;
      seed: number;
      tick: number;
      time: number;
      power: number;
      /** Full list of object states that differ from their initial value. */
      objs: Array<[string, number]>;
      /** Dynamic objects that are not part of the generated world. */
      added: WorldObjectDef[];
      flags: Array<[string, number]>;
      objective: { key: string; args?: Record<string, string | number> } | null;
      self: PlayerSelf;
      players: PlayerNet[];
    }
  | { t: 'snap'; snap: Snapshot }
  /** Dynamic objects added after the level was loaded. */
  | { t: 'objects'; added: WorldObjectDef[] }
  | { t: 'rtc'; from: number; data: unknown }
  | { t: 'pong'; c: number; tick: number }
  | { t: 'error'; code: string; msg: string };
