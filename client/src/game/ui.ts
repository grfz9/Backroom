/**
 * DOM interface: title screen (seed + « Entrer »), pause menu (sensitivity, volume, VHS),
 * camcorder HUD (REC, timestamp, stamina) and the F3 performance counter.
 */

import type { SettingsStore } from '../core/contracts';

const CSS = `
#ui { font-family: 'Courier New', monospace; color: #e8e2c4; user-select: none; }
#ui .screen { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 18px; background: rgba(8,7,3,.62); }
#ui .screen.on { display: flex; }
#ui h1 { font-size: clamp(40px, 9vw, 110px); letter-spacing: .45em; margin: 0 0 0 .45em; font-weight: 400;
  text-shadow: 3px 0 rgba(255,60,60,.55), -3px 0 rgba(60,200,255,.45); animation: jitter 3.7s infinite steps(1); }
#ui .sub { letter-spacing: .3em; font-size: 12px; opacity: .65; margin-bottom: 28px; text-align: center; }
#ui label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; letter-spacing: .15em; width: min(340px, 80vw); }
#ui input[type=text] { background: rgba(0,0,0,.5); border: 1px solid #8a8256; color: #f2ecc8; font: inherit; font-size: 18px; padding: 10px 12px; letter-spacing: .1em; outline: none; }
#ui input[type=text]:focus { border-color: #e8e2c4; }
#ui input[type=range] { accent-color: #cfc58a; }
#ui button { background: none; border: 1px solid #8a8256; color: inherit; font: inherit; font-size: 16px; letter-spacing: .3em; padding: 12px 34px; cursor: pointer; width: min(340px, 80vw); }
#ui button:hover, #ui button:focus-visible { background: #e8e2c4; color: #14120a; outline: none; }
#ui .hint { position: absolute; bottom: 22px; font-size: 12px; opacity: .55; letter-spacing: .08em; text-align: center; line-height: 1.7; padding: 0 16px; }
#ui .hud { position: absolute; inset: 0; display: none; pointer-events: none; font-size: clamp(14px, 1.7vw, 22px); font-weight: 700; text-shadow: 2px 0 rgba(255,40,40,.5), -2px 0 rgba(40,180,255,.4), 0 0 6px rgba(255,255,255,.35); }
#ui .hud.on { display: block; }
#ui .rec { position: absolute; top: 5%; left: 5%; letter-spacing: .15em; }
#ui .rec i { display: inline-block; width: .7em; height: .7em; border-radius: 50%; background: #ff2a2a; margin-left: .4em; animation: blink 1.2s infinite steps(1); }
#ui .stamp { position: absolute; bottom: 6%; left: 5%; letter-spacing: .12em; white-space: pre; }
#ui .tape { position: absolute; top: 5%; right: 5%; letter-spacing: .12em; text-align: right; }
#ui .stamina { position: absolute; bottom: 4%; left: 35%; width: 30%; height: 3px; background: rgba(255,255,255,.15); opacity: 0; transition: opacity .5s; }
#ui .stamina b { display: block; height: 100%; background: #e8e2c4; }
#ui .stamina.low b { background: #ff5a4a; }
#ui .fps { position: absolute; top: 12%; left: 5%; font-size: 12px; font-weight: 400; white-space: pre; text-shadow: none; background: rgba(0,0,0,.55); padding: 6px 8px; display: none; }
@keyframes blink { 50% { opacity: 0; } }
@keyframes jitter { 0%,100% { transform: none; } 92% { transform: translateX(2px) skewX(-2deg); } 94% { transform: translateX(-3px); } 96% { transform: none; } }
`;

const MONTHS = ['JAN.', 'FÉV.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'];
const WORDS = ['moquette', 'couloir', 'neon', 'bande', 'seuil', 'dalle', 'plinthe', 'palier', 'archive', 'arpenteur'];
const pad = (n: number): string => String(Math.floor(n)).padStart(2, '0');

/** Camcorder timestamp: starts at a time derived from the seed and runs with game time. */
export function formatStamp(seed: number, time: number): string {
  const t = (seed % 86400) + time;
  const day = 1 + (seed % 28), month = MONTHS[(seed >>> 8) % 12];
  return `${pad((t / 3600) % 24)}:${pad((t / 60) % 60)}:${pad(t % 60)}\n${day} ${month} 1991`;
}

export function randomSeedText(): string {
  return `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${100 + Math.floor(Math.random() * 900)}`;
}

export interface UIHandlers {
  onStart(seedText: string): void;
  onResume(): void;
  onQuit(): void;
}

export class GameUI {
  private title: HTMLElement;
  private pause: HTMLElement;
  private hud: HTMLElement;
  private stamp: HTMLElement;
  private stamina: HTMLElement;
  private staminaBar: HTMLElement;
  private fps: HTMLElement;
  private seedInput: HTMLInputElement;
  private pauseSeed: HTMLElement;
  private lastStamp = '';

  constructor(root: HTMLElement, private settings: SettingsStore, handlers: UIHandlers) {
    const s = settings.get();
    root.innerHTML = `<style>${CSS}</style>
      <div class="hud">
        <div class="rec">REC<i></i></div>
        <div class="tape">SP<br>BANDE 12</div>
        <div class="stamp"></div>
        <div class="stamina"><b></b></div>
        <div class="fps"></div>
      </div>
      <form class="screen title on">
        <h1>LIMINAL</h1>
        <div class="sub">BUREAU DE CARTOGRAPHIE INTÉRIEURE — ÉQUIPE 12</div>
        <label>SEED<input type="text" name="seed" maxlength="40" autocomplete="off" spellcheck="false"></label>
        <button type="submit">ENTRER</button>
        <div class="hint">ZQSD / WASD : se déplacer · Maj : courir · Ctrl ou C : s'accroupir · F : lampe<br>Échap : pause · F3 : compteur FPS</div>
      </form>
      <div class="screen pause">
        <h1 style="font-size:48px">PAUSE</h1>
        <div class="sub pause-seed"></div>
        <label>SENSIBILITÉ SOURIS<input type="range" name="mouseSensitivity" min="0.2" max="3" step="0.05" value="${s.mouseSensitivity}"></label>
        <label>VOLUME<input type="range" name="volumeMaster" min="0" max="1" step="0.01" value="${s.volumeMaster}"></label>
        <label>INTENSITÉ VHS<input type="range" name="vhsIntensity" min="0" max="1" step="0.01" value="${s.vhsIntensity}"></label>
        <button type="button" class="resume">REPRENDRE</button>
        <button type="button" class="quit">QUITTER</button>
      </div>`;
    const q = <T extends HTMLElement>(sel: string): T => root.querySelector(sel) as T;
    this.title = q('.title');
    this.pause = q('.pause');
    this.hud = q('.hud');
    this.stamp = q('.stamp');
    this.stamina = q('.stamina');
    this.staminaBar = q('.stamina b');
    this.fps = q('.fps');
    this.pauseSeed = q('.pause-seed');
    this.seedInput = q('input[name=seed]');
    this.seedInput.value = localStorage.getItem('liminal.lastSeed') ?? randomSeedText();

    this.title.addEventListener('submit', (e) => {
      e.preventDefault();
      const seed = this.seedInput.value.trim() || randomSeedText();
      localStorage.setItem('liminal.lastSeed', seed);
      handlers.onStart(seed);
    });
    q('.resume').addEventListener('click', () => handlers.onResume());
    q('.quit').addEventListener('click', () => handlers.onQuit());
    for (const input of this.pause.querySelectorAll<HTMLInputElement>('input[type=range]')) {
      input.addEventListener('input', () => settings.set({ [input.name]: Number(input.value) }));
    }
  }

  show(screen: 'title' | 'playing' | 'paused', seedText = ''): void {
    this.title.classList.toggle('on', screen === 'title');
    this.pause.classList.toggle('on', screen === 'paused');
    this.hud.classList.toggle('on', screen !== 'title');
    if (screen === 'paused') this.pauseSeed.textContent = `LES COULOIRS — SEED : ${seedText}`;
    if (screen === 'title') this.seedInput.focus();
  }

  /** Called every frame while a level is loaded. Touches the DOM only when something changed. */
  updateHud(seed: number, time: number, stamina: number, exhausted: boolean, stats: string): void {
    const stamp = formatStamp(seed, time);
    if (stamp !== this.lastStamp) this.stamp.textContent = this.lastStamp = stamp;
    this.stamina.style.opacity = stamina < 0.995 ? '1' : '0';
    this.stamina.classList.toggle('low', exhausted);
    this.staminaBar.style.width = `${Math.round(stamina * 100)}%`;
    const show = this.settings.get().showFps;
    this.fps.style.display = show ? 'block' : 'none';
    if (show) this.fps.textContent = stats;
  }
}
