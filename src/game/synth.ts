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

  /** Brighter blip for the player's shot. */
  blip(midi: number, gain = 0.35) {
    this.play(midi, this.ctx.currentTime, 0.22, gain, 'sawtooth');
  }
}
