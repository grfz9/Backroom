/**
 * LIMINAL — global constants shared by client, server and simulation.
 * CONTRACT FILE: changes must be validated by the technical director (see docs/AGENTS.md).
 */

// ---------------------------------------------------------------------------
// World grid
// ---------------------------------------------------------------------------

/** Side of one grid cell, in metres. */
export const CELL = 2;
/** Cells per chunk side. */
export const CHUNK = 16;
/** Side of one chunk, in metres. */
export const CHUNK_SIZE = CELL * CHUNK;
/** Default thickness of an edge wall, in metres. */
export const WALL_THICKNESS = 0.16;

/** Edge / move directions. North is -Z, East is +X (Three.js right-handed, Y up). */
export const DIR_N = 0;
export const DIR_E = 1;
export const DIR_S = 2;
export const DIR_W = 3;
export type Dir = 0 | 1 | 2 | 3;
/** Cell delta per direction, indexed by Dir. */
export const DIR_DX: readonly number[] = [0, 1, 0, -1];
export const DIR_DZ: readonly number[] = [-1, 0, 1, 0];

// ---------------------------------------------------------------------------
// Simulation timing
// ---------------------------------------------------------------------------

/** Fixed simulation rate (player commands and world ticks). */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** The host sends one snapshot every N ticks (20 Hz). */
export const SNAPSHOT_EVERY = 3;
export const MAX_PLAYERS = 4;
/** Bump when the wire protocol changes in an incompatible way. */
export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// Player tuning (metres, seconds). Used by the shared movement code.
// ---------------------------------------------------------------------------

export const PLAYER = {
  radius: 0.3,
  heightStand: 1.8,
  heightCrouch: 1.1,
  eyeStand: 1.62,
  eyeCrouch: 0.95,
  walkSpeed: 2.5,
  runSpeed: 4.9,
  crouchSpeed: 1.2,
  /** Ground acceleration / deceleration (m/s²): slightly heavy, no ice-skating. */
  accel: 22,
  decel: 18,
  /** Seconds to go from standing to crouched. */
  crouchTime: 0.22,
  staminaMax: 100,
  /** Stamina per second while running (≈ 7 s of sprint). */
  staminaDrain: 14,
  staminaRegen: 9,
  /** Delay before stamina starts to regenerate after running. */
  staminaRegenDelay: 1.2,
  /** Once exhausted, running is locked until stamina is back above this value. */
  staminaRecover: 30,
  healthMax: 100,
  sanityMax: 100,
  /** Max distance (m) to interact with an object. */
  reach: 2.2,
} as const;

/**
 * Noise radius (metres) emitted by a player, by movement mode.
 * Entities that hear will perceive the player inside this radius (walls attenuate).
 */
export const NOISE = {
  idle: 0,
  crouch: 1.5,
  walk: 6,
  run: 15,
  /** Multiplier applied while wading through water. */
  waterMul: 1.8,
  /** Extra radius at full microphone level (voice is heard by entities). */
  voiceMax: 14,
} as const;

// ---------------------------------------------------------------------------
// Player input buttons (bitmask in PlayerInput.buttons)
// ---------------------------------------------------------------------------

export const BTN_RUN = 1;
export const BTN_CROUCH = 2;
/** Interact key currently held (for "hold to use" objects). */
export const BTN_USE = 4;
/** Radio push-to-talk currently held. */
export const BTN_RADIO = 8;
