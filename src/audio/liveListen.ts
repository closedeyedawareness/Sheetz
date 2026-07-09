import { chordLabel } from '../theory/chordSubstitutions';
import { detectChord } from '../theory/chords';
import { detectKeyFromPitchWeights } from '../theory/key';
import type { KeyInfo } from '../types';

// Large enough for reasonable pitch resolution through most of the piano's
// range without making each analysis frame expensive.
const FFT_SIZE = 16384;
const MIN_FREQ_HZ = 40; // just below E1
const MAX_FREQ_HZ = 5000; // just above the piano's top note, catches some overtone energy
const CHROMA_SMOOTHING = 0.72; // exponential decay so the chord guess doesn't flicker frame to frame
const CHORD_PEAK_THRESHOLD = 0.45; // fraction of the smoothed frame's peak a pitch class must clear to count as "sounding"
const BASS_ACTIVE_DB = -55; // magnitude floor for picking out a fundamental as the likely bass note
const ANALYSIS_INTERVAL_MS = 650;

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

  const recordedChunks: Blob[] = [];
  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.addEventListener('dataavailable', (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  });
  recorder.start();

  const tick = () => {
    analyser.getFloatFrequencyData(freqData);
    const frameChroma = new Array(12).fill(0);
    let bassBin: number | undefined;

    for (let i = minBin; i <= maxBin; i++) {
      const db = freqData[i];
      if (!Number.isFinite(db)) continue;
      const magnitude = 10 ** (db / 20);
      const pc = pitchClassOf(freqToMidi(i * binHz));
      frameChroma[pc] += magnitude;
      if (bassBin === undefined && db > BASS_ACTIVE_DB) bassBin = i;
    }

    const peak = Math.max(...frameChroma, 1e-9);
    for (let pc = 0; pc < 12; pc++) {
      const normalized = frameChroma[pc] / peak;
      smoothedChroma[pc] = smoothedChroma[pc] * CHROMA_SMOOTHING + normalized * (1 - CHROMA_SMOOTHING);
      cumulativeWeights[pc] += normalized;
    }

    const smoothedPeak = Math.max(...smoothedChroma, 1e-9);
    const observed = new Set<number>();
    for (let pc = 0; pc < 12; pc++) {
      if (smoothedChroma[pc] / smoothedPeak >= CHORD_PEAK_THRESHOLD) observed.add(pc);
    }

    const bassPc = bassBin !== undefined ? pitchClassOf(freqToMidi(bassBin * binHz)) : undefined;
    const key = detectKeyFromPitchWeights(cumulativeWeights);
    const chord = observed.size >= 2 ? detectChord(observed, bassPc) : undefined;

    onUpdate({
      key,
      chordLabel: chord ? chordLabel(chord.root, chord.suffix, key) : undefined,
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
