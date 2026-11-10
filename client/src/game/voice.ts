/**
 * Proximity voice: each remote player's stream is attenuated with distance and panned
 * according to where that player stands relative to the listener.
 */

/** Voices are inaudible beyond this distance (metres). */
export const VOICE_RANGE = 20;

/** Gain 0..1 for a speaker at `dist` metres: full up close, silent at VOICE_RANGE. */
export function voiceGain(dist: number): number {
  const k = Math.max(0, 1 - dist / VOICE_RANGE);
  return k * k;
}

/** Stereo pan -1 (left) .. 1 (right) of a speaker at offset (dx,dz) for a listener facing `yaw`. */
export function voicePan(dx: number, dz: number, yaw: number): number {
  const dist = Math.hypot(dx, dz);
  if (dist < 0.01) return 0;
  // Right vector of the listener is (cos yaw, -sin yaw).
  return Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / dist));
}

export class Voice {
  private nodes = new Map<string, { gain: GainNode; pan: StereoPannerNode; el: HTMLAudioElement }>();

  constructor(private ctx: AudioContext, private dest: AudioNode) {}

  add(pid: string, stream: MediaStream): void {
    this.remove(pid);
    // Chrome only lets Web Audio process a remote stream that is also attached to an element.
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    void el.play().catch(() => {});
    const gain = this.ctx.createGain(), pan = this.ctx.createStereoPanner();
    gain.gain.value = 0;
    this.ctx.createMediaStreamSource(stream).connect(gain).connect(pan).connect(this.dest);
    this.nodes.set(pid, { gain, pan, el });
  }

  remove(pid: string): void {
    const n = this.nodes.get(pid);
    if (!n) return;
    n.gain.disconnect();
    n.pan.disconnect();
    n.el.srcObject = null;
    this.nodes.delete(pid);
  }

  /** Update where a speaker is, relative to the listener. */
  place(pid: string, dx: number, dz: number, yaw: number): void {
    const n = this.nodes.get(pid);
    if (!n) return;
    const t = this.ctx.currentTime;
    n.gain.gain.setTargetAtTime(voiceGain(Math.hypot(dx, dz)) * 1.6, t, 0.08);
    n.pan.pan.setTargetAtTime(voicePan(dx, dz, yaw), t, 0.08);
  }

  clear(): void {
    for (const pid of [...this.nodes.keys()]) this.remove(pid);
  }
}
