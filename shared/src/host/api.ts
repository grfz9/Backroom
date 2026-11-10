/**
 * LIMINAL — game host API (interface only; implemented in shared/src/host/ by the Engine agent).
 * CONTRACT FILE: changes must be validated by the technical director (see docs/AGENTS.md).
 *
 * A GameHost is "one room": it owns the authoritative simulation, consumes ClientMsg from its
 * players and produces ServerMsg for each of them. It has no notion of sockets or timers:
 *   - in solo, the client instantiates one in the tab (LocalSession) and calls tick() itself;
 *   - in multiplayer, the Node server wraps one per room and forwards WebSocket traffic.
 * This is what makes the server authoritative while keeping solo play serverless.
 */

import type { ClientMsg, ServerMsg } from '../protocol/messages';

export interface HostOptions {
  /** Room code shown in the lobby ('' in solo). */
  code?: string;
  /** Optional logger. */
  log?: (line: string) => void;
}

export interface GameHost {
  readonly phase: 'lobby' | 'playing' | 'ended';
  /** Number of connected players. */
  readonly playerCount: number;

  /**
   * Add a player. `send` delivers messages to that player (in order).
   * Returns the player id (0..MAX_PLAYERS-1), or -1 if the room is full.
   * The first connected player is the host of the room.
   */
  connect(name: string, send: (msg: ServerMsg) => void): number;
  disconnect(playerId: number): void;
  /** Handle one message from a player. Never throws on malformed input. */
  receive(playerId: number, msg: ClientMsg): void;
  /** Advance the simulation by exactly one tick (DT seconds). The caller owns the clock. */
  tick(): void;
}
