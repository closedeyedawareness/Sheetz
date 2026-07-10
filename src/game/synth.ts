// Tiny WebAudio synth: plays the song as a soft guide track and blips the
// player's own hits a little brighter. Not a sampler — just shaped oscillators.

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Synth {
  readonly ctx: AudioContext;
  private master: GainNode;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
  }

  now() {
    return this.ctx.currentTime;
  }

  resume() {
    if (this.ctx.state === 'suspended') return this.ctx.resume();
    return Promise.resolve();
  }

  /** One shaped note at an absolute AudioContext time. */
  play(midi: number, at: number, dur = 0.35, gain = 0.25, type: OscillatorType = 'triangle') {
    const t = Math.max(at, this.ctx.currentTime);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = midiToFreq(midi);
    const peak = gain;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Brighter blip for the player's shot (used only when there's no real instrument). */
  blip(midi: number, gain = 0.35) {
    this.play(midi, this.ctx.currentTime, 0.22, gain, 'sawtooth');
  }

  // ---- Game SFX (always on, independent of the melodic guide) ----
  private noiseBuffer?: AudioBuffer;
  private noise() {
    if (!this.noiseBuffer) {
      const len = Math.floor(this.ctx.sampleRate * 0.4);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  /** Short filtered-noise pop when an enemy is destroyed. */
  explosion(gain = 0.18) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.22);
  }

  /** Bright rising two-note chime for a PERFECT hit. */
  perfect() {
    const t = this.ctx.currentTime;
    this.play(88, t, 0.14, 0.16, 'triangle');       // E6
    this.play(93, t + 0.07, 0.18, 0.16, 'triangle'); // A6
  }

  /** Quick descending buzz for a miss / shield hit. */
  ouch() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t); osc.frequency.exponentialRampToValueAtTime(70, t + 0.22);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.26);
  }
}
