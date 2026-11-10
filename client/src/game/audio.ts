/**
 * Audio — everything is synthesised with the Web Audio API, no sound file.
 *  - electrical hum (50 Hz + harmonics + filtered hiss) whose level follows nearby neons,
 *  - crackle when a nearby tube stutters,
 *  - footsteps on carpet (walk / run / crouch),
 *  - rare, distant, unexplained sounds, panned and muffled.
 */

export type StepMode = 'walk' | 'run' | 'crouch';

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private humGain!: GainNode;
  private hissGain!: GainNode;
  private droneGain!: GainNode;
  private noise!: AudioBuffer;
  private nextDistant = 20;
  private lastDistant = -1;
  private lastHum = 1;
  private volume = 0.8;
  /** Where one-shots are routed: `master` (close, dry) or `far` (distant, reverberated). */
  private dest!: AudioNode;
  private far!: GainNode;
  private dreadGain!: GainNode;
  private dark = 0;

  /** Must be called from a user gesture. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 12;
    this.master.connect(limiter).connect(ctx.destination);

    // Distant sounds go through a long, dark reverb (generated impulse response).
    const ir = ctx.createBuffer(2, ctx.sampleRate * 3.2, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        lp += (Math.random() * 2 - 1 - lp) * 0.25;                 // darker tail
        d[i] = lp * Math.pow(1 - i / d.length, 2.4);
      }
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 1.4;
    this.far = ctx.createGain();
    this.far.connect(this.master);
    this.far.connect(reverb).connect(wet).connect(this.master);
    this.dest = this.master;

    // Dread: a dissonant cluster (minor second) that rises in the dark, with a slow tremolo.
    this.dreadGain = ctx.createGain();
    this.dreadGain.gain.value = 0;
    const trem = ctx.createGain();
    const tremLfo = ctx.createOscillator();
    tremLfo.frequency.value = 0.31;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.35;
    tremLfo.connect(tremDepth).connect(trem.gain);
    tremLfo.start();
    for (const f of [110, 116.6, 55.2, 233.5]) {
      const o = ctx.createOscillator();
      o.type = f > 200 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f > 200 ? 0.05 : 0.2;
      o.connect(g).connect(trem);
      o.start();
    }
    trem.connect(this.dreadGain).connect(this.far);

    // Shared white-noise buffer.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Hum: slightly detuned mains harmonics that beat slowly against each other.
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humGain.connect(this.master);
    for (const [freq, gain] of [[50, 0.5], [100.3, 0.32], [149.6, 0.12], [200.9, 0.08], [301, 0.03]]) {
      const osc = ctx.createOscillator();
      osc.type = freq < 120 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain * 0.22;
      osc.connect(g).connect(this.humGain);
      osc.start();
    }
    // Ballast hiss.
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    const hiss = this.noiseSource(true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.6;
    hiss.connect(bp).connect(this.hissGain).connect(this.master);
    // Low drone that remains when the neons are gone.
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const drone = ctx.createOscillator();
    drone.frequency.value = 38;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain).connect(drone.frequency);
    drone.connect(this.droneGain).connect(this.master);
    drone.start();
    lfo.start();
  }

  /** Audio context and output bus, for the proximity voice chat (null before start()). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  get output(): AudioNode {
    return this.master;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private noiseSource(loop: boolean): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = loop;
    src.start(0, Math.random());
    return src;
  }

  /** Short filtered noise burst — the building block of most sounds here. */
  private burst(freq: number, q: number, dur: number, vol: number, pan = 0, type: BiquadFilterType = 'lowpass', delay = 0): void {
    const ctx = this.ctx!, t = ctx.currentTime + delay;
    const src = this.noiseSource(false);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.dest);
    src.stop(t + dur + 0.05);
  }

  /** Low sine thump (body of a footstep, distant knock). */
  private thump(freq: number, dur: number, vol: number, pan = 0, delay = 0): void {
    const ctx = this.ctx!, t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    osc.connect(g).connect(p).connect(this.dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  step(mode: StepMode, left: boolean): void {
    if (!this.ctx) return;
    const pan = left ? -0.12 : 0.12, vary = 0.85 + Math.random() * 0.3;
    if (mode === 'crouch') {
      this.burst(500 * vary, 0.7, 0.12, 0.035, pan);
    } else if (mode === 'walk') {
      this.burst(750 * vary, 0.8, 0.11, 0.11, pan);
      this.thump(70 * vary, 0.09, 0.14, pan);
    } else {
      this.burst(1300 * vary, 0.9, 0.09, 0.2, pan);
      this.thump(85 * vary, 0.1, 0.3, pan);
    }
  }

  /** A pitched voice-like tone: sine with vibrato, sliding from f0 to f1. */
  private wail(f0: number, f1: number, dur: number, vol: number, pan: number): void {
    const ctx = this.ctx!, t = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    const vib = ctx.createOscillator(), vibGain = ctx.createGain();
    vib.frequency.value = 5.5;
    vibGain.gain.value = f0 * 0.03;
    vib.connect(vibGain).connect(osc.frequency);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    p.pan.value = pan;
    osc.connect(g).connect(p).connect(this.dest);
    osc.start(t);
    vib.start(t);
    osc.stop(t + dur + 0.1);
    vib.stop(t + dur + 0.1);
  }

  private distant(): void {
    // In the dark the repertoire widens to the truly unpleasant sounds (kinds 4–8).
    const kinds = this.dark > 0.5 ? 9 : 6;
    let kind = Math.floor(Math.random() * kinds);
    if (kind === this.lastDistant) kind = (kind + 1) % kinds;
    this.lastDistant = kind;
    this.dest = this.far;
    this.playDistant(kind);
    this.dest = this.master;
  }

  private playDistant(kind: number): void {
    const pan = Math.random() * 1.8 - 0.9, vol = 0.1 + Math.random() * 0.12;
    if (kind === 0) {
      // Dull knocks.
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        this.thump(55, 0.25, vol * 2.2, pan, i * 0.42);
        this.burst(220, 1, 0.2, vol, pan, 'lowpass', i * 0.42);
      }
    } else if (kind === 1) {
      // Long metallic creak: narrow resonances sliding slowly.
      const ctx = this.ctx!, t = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180 + Math.random() * 80, t);
      osc.frequency.linearRampToValueAtTime(120 + Math.random() * 200, t + 2.2);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 600;
      f.Q.value = 9;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * 0.5, t + 0.6);
      g.gain.linearRampToValueAtTime(0, t + 2.3);
      p.pan.value = pan;
      osc.connect(f).connect(g).connect(p).connect(this.dest);
      osc.start(t);
      osc.stop(t + 2.4);
    } else if (kind === 2) {
      // A door slams somewhere.
      this.thump(48, 0.5, vol * 3, pan);
      this.burst(400, 0.7, 0.35, vol * 1.5, pan);
    } else if (kind === 3) {
      // Something heavy being dragged.
      for (let i = 0; i < 3; i++) this.burst(140, 2, 0.8, vol * 1.3, pan, 'bandpass', i * 1.1);
    } else if (kind === 4) {
      // Slow, heavy footsteps that are not yours, coming closer.
      for (let i = 0; i < 6; i++) this.thump(62, 0.22, vol * (1 + i * 0.35), pan * (1 - i * 0.12), i * 0.95);
    } else if (kind === 5) {
      // A metal impact, far away, with a long tail.
      this.burst(2400, 6, 1.4, vol * 1.6, pan, 'bandpass');
      this.thump(90, 0.9, vol * 2.5, pan);
    } else if (kind === 6) {
      // A long wail, almost human, falling.
      this.wail(520 + Math.random() * 120, 230, 3.5, vol * 0.55, pan);
      this.wail(790, 340, 3.2, vol * 0.18, pan);
    } else if (kind === 7) {
      // Whispering: syllables of breathy noise, wandering across the stereo field.
      for (let i = 0; i < 9; i++) {
        this.burst(1800 + Math.random() * 2200, 3, 0.12 + Math.random() * 0.14, vol * 0.9, pan * Math.cos(i), 'bandpass', i * 0.2 + Math.random() * 0.08);
      }
    } else {
      // A breath, close, right behind you. Not reverberated: it is here.
      this.dest = this.master;
      this.burst(700, 0.8, 1.3, 0.16, 0, 'bandpass');
      this.burst(500, 0.8, 1.6, 0.13, 0, 'bandpass', 1.5);
    }
  }

  /** The entity has seen the player: a tearing shriek. */
  sting(): void {
    if (!this.ctx) return;
    this.burst(2600, 4, 0.9, 0.5, 0, 'bandpass');
    this.burst(900, 2, 1.2, 0.4, 0, 'bandpass', 0.05);
    this.thump(60, 0.8, 0.5);
  }

  /** Paper rustling: the entity is moving nearby. `near` 0..1, `pan` -1..1. */
  rustle(near: number, pan: number): void {
    if (this.ctx) this.burst(3000 + Math.random() * 2500, 1.5, 0.12 + Math.random() * 0.15, 0.03 + near * 0.16, pan, 'highpass');
  }

  heartbeat(strength: number): void {
    if (!this.ctx) return;
    this.thump(52, 0.14, 0.35 * strength);
    this.thump(46, 0.16, 0.25 * strength, 0, 0.17);
  }

  /** Caught: the signal dies. */
  death(): void {
    if (!this.ctx) return;
    this.burst(1800, 0.5, 1.6, 0.7, 0, 'bandpass');
    this.thump(40, 1.5, 0.8);
  }

  /** Heavy door: the way out of the floor. */
  door(): void {
    if (!this.ctx) return;
    this.thump(55, 0.6, 0.6);
    this.burst(500, 0.8, 0.5, 0.3, 0, 'lowpass', 0.05);
  }

  /**
   * @param light  illumination at the listener (0 = dark zone, ~1 = under the neons)
   * @param flickering true while a nearby tube is stuttering
   */
  update(dt: number, light: number, flickering: boolean, paused: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime, hum = Math.min(1, light);
    const duck = paused ? 0.3 : 1;
    this.humGain.gain.setTargetAtTime(hum * 0.55 * duck, t, 0.08);
    this.hissGain.gain.setTargetAtTime(hum * 0.02 * duck, t, 0.08);
    this.droneGain.gain.setTargetAtTime((1 - hum) * 0.3 * duck, t, 0.6);
    this.dark += (1 - hum - this.dark) * Math.min(1, dt * 0.4);       // darkness sinks in slowly
    this.dreadGain.gain.setTargetAtTime(this.dark * this.dark * 0.16 * duck, t, 1.5);
    if (paused) return;
    // Tube stutter: a dry tick each time the level around us jumps.
    if (flickering && Math.abs(light - this.lastHum) > 0.04) this.burst(4200, 3, 0.03, 0.05, Math.random() - 0.5, 'bandpass');
    this.lastHum = light;
    this.nextDistant -= dt * (1 + this.dark * 2.5);                   // the dark is busier
    if (this.nextDistant <= 0) {
      this.nextDistant = 25 + Math.random() * 60;
      this.distant();
    }
  }
}
