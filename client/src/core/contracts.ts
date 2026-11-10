/**
 * LIMINAL — client-side contracts between subsystems.
 * CONTRACT FILE: changes must be validated by the technical director (see docs/AGENTS.md).
 *
 * The client is a set of independent subsystems orchestrated by core/Game:
 *
 *   InputSystem ─┐
 *   Session ─────┤→ Game (core) ── builds one FrameState per frame ──→ RenderSystem
 *   (local/remote)                                                  ├→ AudioSystem
 *                                                                   └→ UISystem
 *
 * Subsystems never import each other. They only read FrameState / LevelRuntime / Settings and,
 * for the UI, emit UIIntent. This is what lets one agent own one directory.
 */

import type { LevelDef, LevelId } from '@shared/levels/types';
import type { ClientMsg, ServerMsg } from '@shared/protocol/messages';
import type { DeathCause, EntityKind, GameEvent, ItemId, ItemStack, MoveMode, SoundId } from '@shared/sim/types';
import type { World } from '@shared/world/api';
import type { WorldObjectDef } from '@shared/world/types';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type ActionName =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'run'
  | 'crouch'
  | 'interact'
  | 'flashlight'
  | 'map'
  | 'radio'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'drop'
  | 'pause'
  | 'fps';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  /** Radians per pixel of mouse movement = mouseSensitivity * 0.0022. Range 0.1..3, default 1. */
  mouseSensitivity: number;
  invertY: boolean;
  /** Vertical field of view in degrees (60..100). */
  fov: number;
  /** Head bob amount 0..1. */
  headBob: number;
  volumeMaster: number;
  volumeAmbience: number;
  volumeSfx: number;
  volumeVoice: number;
  /** VHS effect strength 0..1 (0 disables grain/aberration/scanlines, keeps tone mapping). */
  vhsIntensity: number;
  quality: Quality;
  /** Internal resolution multiplier 0.5..1. */
  renderScale: number;
  subtitles: boolean;
  showFps: boolean;
  /**
   * Key bindings as KeyboardEvent.code values (physical keys), so the default WASD cluster is
   * automatically ZQSD on an AZERTY keyboard. Several codes may be bound to one action.
   */
  keymap: Record<ActionName, string[]>;
  micEnabled: boolean;
  pushToTalk: boolean;
  playerName: string;
}

export interface SettingsStore {
  get(): Readonly<Settings>;
  set(patch: Partial<Settings>): void;
  /** Called after every change. Returns an unsubscribe function. */
  subscribe(cb: (s: Readonly<Settings>) => void): () => void;
  reset(): void;
}

// ---------------------------------------------------------------------------
// Level runtime (client view of the level being played)
// ---------------------------------------------------------------------------

export interface LevelRuntime {
  readonly def: LevelDef;
  /** Numeric seed. */
  readonly seed: number;
  /** Seed as typed by the player (for display). */
  readonly seedText: string;
  /** Client-side world: same generation as the host, used for prediction, rendering and audio. */
  readonly world: World;
  /** Light power groups bitmask (live value from the last snapshot). */
  readonly power: number;
  /** Current state of an object: host override, else its initial value. -1 = removed. */
  objectState(id: string): number;
  /** Dynamic objects that are not part of the generated chunks (dropped items, chalk marks…). */
  readonly added: readonly WorldObjectDef[];
  /** Incremented whenever any object state or the `added` list changes. */
  readonly objectsVersion: number;
  flag(name: string): number;
  readonly objective: { key: string; args?: Record<string, string | number> } | null;
}

// ---------------------------------------------------------------------------
// Frame state (rebuilt by core/Game every frame; read-only for subsystems)
// ---------------------------------------------------------------------------

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  /** Same convention as PlayerInput: yaw 0 looks toward -Z, positive yaw turns left. */
  yaw: number;
  pitch: number;
  /** Roll in radians (head bob sway, scares). */
  roll: number;
  /** Vertical FOV in degrees (settings.fov plus sprint kick). */
  fov: number;
}

export interface LocalPlayerView {
  id: number;
  /** Feet position, interpolated for the current frame. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Horizontal speed in m/s. */
  speed: number;
  mode: MoveMode;
  /** 0 standing … 1 crouched. */
  crouch: number;
  /** 0..1 */
  stamina: number;
  exhausted: boolean;
  /** 0..1 */
  health: number;
  /** 0..1 */
  sanity: number;
  alive: boolean;
  respawnIn: number;
  flashlight: boolean;
  /** 0..1 */
  battery: number;
  /** Water depth at the feet, in metres. */
  water: number;
  hidden: boolean;
  slots: readonly (ItemStack | null)[];
  tools: readonly ItemId[];
  /** Object the player is looking at and can interact with, if any. */
  target: { id: string; kind: WorldObjectDef['kind']; hold: number; progress: number } | null;
}

export interface RemotePlayerView {
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
  voice: number;
  radio: boolean;
}

export interface EntityView {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  st: number;
  anim: number;
  tgt: number;
  fx: number;
}

export interface PerfStats {
  fps: number;
  /** Average CPU frame time in ms. */
  frameMs: number;
  drawCalls: number;
  triangles: number;
  /** Chunks currently meshed. */
  chunks: number;
}

export interface FrameState {
  /** Real seconds since the previous frame (clamped to 0.1). */
  dt: number;
  /** Seconds since the app started (keeps running in menus). */
  realTime: number;
  /** Level simulation time in seconds, smooth (0 when no level). Drives flicker, water, etc. */
  time: number;
  /** True while the pause menu is open (in solo the simulation is frozen). */
  paused: boolean;
  level: LevelRuntime | null;
  /** Final camera pose (eye position + head bob + shakes). */
  camera: CameraPose;
  local: LocalPlayerView | null;
  players: readonly RemotePlayerView[];
  entities: readonly EntityView[];
  /** One-shot events to handle this frame (host events + locally synthesised footsteps). */
  events: readonly GameEvent[];
  perf: PerfStats;
}

// ---------------------------------------------------------------------------
// Subsystems
// ---------------------------------------------------------------------------

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  chunks: number;
}

export interface RenderSystem {
  /** Create the WebGL renderer on the given canvas. */
  init(canvas: HTMLCanvasElement, settings: SettingsStore): void;
  /** Build everything needed to draw this level (theme, world view, lighting). */
  loadLevel(level: LevelRuntime): void;
  unloadLevel(): void;
  /** Update the scene from the frame (camera, chunk streaming, lights, entities, post) and draw. */
  render(frame: FrameState): void;
  /** Canvas CSS size changed. */
  resize(width: number, height: number): void;
  getStats(): RenderStats;
  dispose(): void;
}

/**
 * An audible cue the player should be able to read as a subtitle. `key` is the SoundId of the cue;
 * the game turns it into a `{ e: 'subtitle', key: 'sub.' + key }` event for the UI.
 */
export interface AudioCue {
  key: SoundId;
  x: number;
  z: number;
}

export interface AudioSystem {
  init(settings: SettingsStore): void;
  /** Must be called from a user gesture (click on « Entrer ») to start the AudioContext. */
  unlock(): Promise<void>;
  loadLevel(level: LevelRuntime): void;
  unloadLevel(): void;
  /** Listener pose, ambience, hum of nearby fixtures, footsteps and one-shots from frame.events. */
  update(frame: FrameState): void;
  /** Play a non-positional one-shot (menus, camcorder noises). Unknown ids warn, never throw. */
  play(id: SoundId, vol?: number): void;
  /** Be told when the audio system itself starts an important ambient sound (for subtitles). */
  onCue(cb: (cue: AudioCue) => void): void;
  dispose(): void;
}

export type AppScreen = 'title' | 'loading' | 'playing' | 'paused' | 'dead' | 'ended';

/** Optional context shown by a screen (level being loaded, cause of death…). */
export interface ScreenInfo {
  level?: LevelId;
  seedText?: string;
  cause?: DeathCause;
  /** Seconds before respawn (dead screen). */
  respawnIn?: number;
}

/** What the UI asks the game to do. */
export type UIIntent =
  | { type: 'startSolo'; seedText: string; level?: LevelId }
  | { type: 'resume' }
  | { type: 'restart' }
  | { type: 'quitToTitle' }
  /** The UI wants a menu sound (hover, click). The game forwards it to AudioSystem.play(). */
  | { type: 'sound'; id: SoundId };

export interface UISystem {
  /** Build the DOM overlay inside `root` (a full-screen element above the canvas). */
  init(root: HTMLElement, settings: SettingsStore): void;
  setScreen(screen: AppScreen, info?: ScreenInfo): void;
  /** HUD: REC timestamp, stamina, prompts, subtitles, FPS counter… */
  update(frame: FrameState): void;
  /**
   * Register the intent handler. It is invoked synchronously inside the DOM event handler of the
   * click/keypress, so that the game may call requestPointerLock() and AudioContext.resume().
   */
  onIntent(cb: (intent: UIIntent) => void): void;
  dispose(): void;
}

export interface InputSystem {
  init(target: HTMLElement, settings: SettingsStore): void;
  readonly locked: boolean;
  /** Must be called from a user gesture. */
  requestLock(): void;
  exitLock(): void;
  onLockChange(cb: (locked: boolean) => void): void;
  /**
   * Mouse look accumulated since the last call, in radians, with sensitivity and invertY applied.
   * yaw > 0 turns left, pitch > 0 looks up.
   */
  consumeLook(): { yaw: number; pitch: number };
  /** Move intent in view space (-1..1, normalised so diagonals are not faster). */
  readonly moveX: number;
  readonly moveZ: number;
  /** Bitmask of BTN_* currently held. */
  readonly buttons: number;
  /** Actions pressed since the last call (edge-triggered), in order. */
  consumeActions(): ActionName[];
  dispose(): void;
}

/** Transport to a game host: in-memory (solo) or WebSocket (multiplayer). */
export interface Session {
  readonly kind: 'local' | 'remote';
  send(msg: ClientMsg): void;
  /** Messages received since the last call, in order. */
  poll(): ServerMsg[];
  /**
   * Called once per frame with the real elapsed seconds. A local session advances its GameHost
   * by the right number of fixed ticks here (and does nothing while `paused`).
   */
  update(dt: number, paused: boolean): void;
  close(): void;
}
