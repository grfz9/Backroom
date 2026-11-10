/**
 * Settings store (localStorage-backed). Minimal reference implementation from the foundation;
 * the Interface agent owns this file from milestone 1 on.
 */

import type { Settings, SettingsStore } from './contracts';

const STORAGE_KEY = 'liminal.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  mouseSensitivity: 1,
  invertY: false,
  fov: 72,
  headBob: 1,
  volumeMaster: 0.8,
  volumeAmbience: 1,
  volumeSfx: 1,
  volumeVoice: 1,
  vhsIntensity: 0.7,
  quality: 'medium',
  renderScale: 1,
  subtitles: true,
  showFps: false,
  keymap: {
    // KeyboardEvent.code = physical position: KeyW/KeyA are Z/Q on an AZERTY keyboard.
    forward: ['KeyW', 'ArrowUp'],
    back: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    run: ['ShiftLeft', 'ShiftRight'],
    // Ctrl is the documented key, but Ctrl+W closes the tab on QWERTY: KeyC is the safe twin.
    crouch: ['ControlLeft', 'KeyC'],
    interact: ['KeyE'],
    flashlight: ['KeyF'],
    map: ['KeyM'],
    radio: ['KeyV'],
    slot1: ['Digit1'],
    slot2: ['Digit2'],
    slot3: ['Digit3'],
    slot4: ['Digit4'],
    drop: ['KeyG'],
    pause: ['Escape'],
    fps: ['F3'],
  },
  micEnabled: false,
  pushToTalk: false,
  playerName: 'Arpenteur',
};

function load(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      keymap: { ...structuredClone(DEFAULT_SETTINGS.keymap), ...(parsed.keymap ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function createSettingsStore(): SettingsStore {
  let current = load();
  const listeners = new Set<(s: Readonly<Settings>) => void>();

  const persist = (): void => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Storage may be unavailable (private mode): settings then live for the session only.
    }
  };

  return {
    get: () => current,
    set(patch) {
      current = { ...current, ...patch };
      persist();
      for (const cb of listeners) cb(current);
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    reset() {
      current = structuredClone(DEFAULT_SETTINGS);
      persist();
      for (const cb of listeners) cb(current);
    },
  };
}
