import { chordLabel } from '../theory/chordSubstitutions';
import { detectChord } from '../theory/chords';
import { detectKeyFromPitchWeights } from '../theory/key';
import type { KeyInfo } from '../types';

// Large enough for reasonable pitch resolution through most of the piano's
// range without making each analysis frame expensive.
const FFT_SIZE = 16384;
const MIN_FREQ_HZ = 40; // just below E1
// Summing all the way up to the piano's top note pulls in several octaves of
// overtone energy per played note, which smears roughly evenly across most of
// the 12 pitch classes and drowns out the actual chord tones (verified by
// dumping raw chroma vectors: values ended up nearly flat across all 12 bins).
// Restricting to roughly the bottom half of the keyboard keeps mostly
// fundamentals plus a couple of harmonics for bass notes.
const MAX_FREQ_HZ = 1200;
const CHROMA_SMOOTHING = 0.75; // exponential decay applied to the chroma vector each analysis frame
const CHORD_PEAK_THRESHOLD = 0.6; // fraction of the smoothed frame's peak a pitch class must clear to count as "sounding"
const MAX_OBSERVED_PITCH_CLASSES = 4; // real chords are rarely more than 4 distinct notes; caps how many "sounding" pitch classes feed the chord matcher
const ANALYSIS_INTERVAL_MS = 650;
const BASS_ACTIVE_DB = -55; // magnitude floor for picking out a fundamental as the likely bass note

// A fixed silence floor tuned against a clean line-level test signal doesn't
// transfer well to a real phone mic (AGC and room noise shift the usable dB
// range device to device). Instead we track how loud things have recently
// gotten and only treat a frame as "something is sounding" relative to that,
// so quiet mics and noisy rooms both self-calibrate rather than either
// hallucinating a chord out of background hiss or the gate never opening.
const ABSOLUTE_SILENCE_FLOOR_DB = -85; // nothing has ever been this quiet AND real, even on a bad mic
const ACTIVE_RANGE_DB = 25; // a frame counts as "something is sounding" within this many dB of the recent peak
const RUNNING_PEAK_DECAY_DB_PER_TICK = 0.3; // how fast the "recent peak" forgets a loud moment

export interface LiveListenUpdate {
  key: KeyInfo;
  chordLabel: string | undefined;
  elapsedSeconds: number;
}

export interface LiveListenSession {
  deviceLabel: string | undefined;
  /** Stops capture and resolves with the full recorded take, ready for full transcription. */
  stop: () => Promise<Blob>;
}

function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

function pitchClassOf(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

/**
 * Starts listening to the microphone: analyzes a live FFT-derived chroma
 * vector every ~650ms to guess the currently-sounding chord and the
 * session's overall key, while simultaneously recording the raw audio so
 * the full take can be run through the existing basic-pitch transcription
 * pipeline once the user stops. This real-time guess is a much lighter-weight
 * (and less precise) analysis than that offline pipeline — it exists purely
 * for instant feedback while playing.
 */
export async function startLiveListen(onUpdate: (update: LiveListenUpdate) => void): Promise<LiveListenSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support microphone capture.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  source.connect(analyser);

  const freqData = new Float32Array(analyser.frequencyBinCount);
  const binHz = audioCtx.sampleRate / FFT_SIZE;
  const minBin = Math.max(1, Math.floor(MIN_FREQ_HZ / binHz));
  const maxBin = Math.min(freqData.length - 1, Math.ceil(MAX_FREQ_HZ / binHz));

  const smoothedChroma = new Array(12).fill(0);
  const cumulativeWeights = new Array(12).fill(0);
  const sessionStart = performance.now();
  let runningPeakDb = -100;
  let lastChordLabel: string | undefined;

  const recordedChunks: Blob[] = [];
  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.addEventListener('dataavailable', (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  });
  // Requesting periodic chunks (rather than one big blob assembled at stop())
  // is the more broadly-reliable MediaRecorder pattern across mobile browsers.
  recorder.start(250);

  const tick = () => {
    analyser.getFloatFrequencyData(freqData);
    const frameChroma = new Array(12).fill(0);
    let frameLoudestDb = -Infinity;
    let bassBin: number | undefined;

    for (let i = minBin; i <= maxBin; i++) {
      const db = freqData[i];
      if (!Number.isFinite(db)) continue;
      const magnitude = 10 ** (db / 20);
      const pc = pitchClassOf(freqToMidi(i * binHz));
      frameChroma[pc] += magnitude;
      if (db > frameLoudestDb) frameLoudestDb = db;
      if (bassBin === undefined && db > BASS_ACTIVE_DB) bassBin = i;
    }

    runningPeakDb = Math.max(frameLoudestDb, runningPeakDb - RUNNING_PEAK_DECAY_DB_PER_TICK);
    const isActive = frameLoudestDb > ABSOLUTE_SILENCE_FLOOR_DB && frameLoudestDb > runningPeakDb - ACTIVE_RANGE_DB;

    // The chord-matching smoothing below runs on raw magnitude, not
    // per-frame-normalized magnitude: normalizing each frame to its own peak
    // *before* blending would give a quiet, transitional frame (finger still
    // moving between chords) just as much weight in the running average as a
    // loud, clearly-sounding one. The key histogram is the opposite case — it
    // should accumulate roughly one "vote" per tick regardless of how loud
    // that particular moment was (raw magnitude spans orders of magnitude
    // across dB, which would let one loud chord dominate the whole session's
    // key estimate), so it keeps the older per-frame-normalized weighting.
    const framePeak = Math.max(...frameChroma, 1e-9);
    for (let pc = 0; pc < 12; pc++) {
      smoothedChroma[pc] = smoothedChroma[pc] * CHROMA_SMOOTHING + frameChroma[pc] * (1 - CHROMA_SMOOTHING);
      if (isActive) cumulativeWeights[pc] += frameChroma[pc] / framePeak;
    }

    const key = detectKeyFromPitchWeights(cumulativeWeights);

    if (isActive) {
      const smoothedPeak = Math.max(...smoothedChroma, 1e-9);
      // A real chord's decay/reverb tail overlaps the next chord's attack, so the
      // chroma vector during a transition genuinely contains the union of both —
      // more pitch classes than any one chord actually has. Matching against that
      // whole union favors odd templates that happen to cover it. Keeping only
      // the strongest few (real chords are rarely more than 4 notes) biases the
      // match toward whichever chord currently dominates the mix.
      const observed = new Set(
        Array.from({ length: 12 }, (_, pc) => pc)
          .filter((pc) => smoothedChroma[pc] / smoothedPeak >= CHORD_PEAK_THRESHOLD)
          .sort((a, b) => smoothedChroma[b] - smoothedChroma[a])
          .slice(0, MAX_OBSERVED_PITCH_CLASSES)
      );
      const bassPc = bassBin !== undefined ? pitchClassOf(freqToMidi(bassBin * binHz)) : undefined;
      const chord = observed.size >= 2 ? detectChord(observed, bassPc) : undefined;
      if (chord) lastChordLabel = chordLabel(chord.root, chord.suffix, key);
    }

    onUpdate({
      key,
      chordLabel: lastChordLabel,
      elapsedSeconds: (performance.now() - sessionStart) / 1000,
    });
  };

  const intervalId = window.setInterval(tick, ANALYSIS_INTERVAL_MS);

  return {
    deviceLabel: stream.getAudioTracks()[0]?.label || undefined,
    stop: () =>
      new Promise<Blob>((resolve) => {
        window.clearInterval(intervalId);
        recorder.addEventListener('stop', () => {
          stream.getTracks().forEach((t) => t.stop());
          void audioCtx.close();
          resolve(new Blob(recordedChunks, { type: recorder.mimeType || 'audio/webm' }));
        });
        recorder.stop();
      }),
  };
}
