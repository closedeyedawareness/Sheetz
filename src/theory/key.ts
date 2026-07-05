import type { KeyInfo, NoteEvent } from '../types';

// Krumhansl-Schmuckler key profiles (relative perceived stability of each
// scale degree), indexed from the tonic.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Canonical spelling per pitch class, chosen to minimize accidental count
// (see keySignatures table in VexFlow's tables.ts for the exact spec strings).
const MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEY_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

const KEY_ACCIDENTALS: Record<string, { accidental: '#' | 'b' | null; num: number }> = {
  C: { accidental: null, num: 0 },
  F: { accidental: 'b', num: 1 },
  Bb: { accidental: 'b', num: 2 },
  Eb: { accidental: 'b', num: 3 },
  Ab: { accidental: 'b', num: 4 },
  Db: { accidental: 'b', num: 5 },
  G: { accidental: '#', num: 1 },
  D: { accidental: '#', num: 2 },
  A: { accidental: '#', num: 3 },
  E: { accidental: '#', num: 4 },
  B: { accidental: '#', num: 5 },
  'F#': { accidental: '#', num: 6 },
  Cm: { accidental: 'b', num: 3 },
  Fm: { accidental: 'b', num: 4 },
  Bbm: { accidental: 'b', num: 5 },
  Ebm: { accidental: 'b', num: 6 },
  Gm: { accidental: 'b', num: 2 },
  Dm: { accidental: 'b', num: 1 },
  Am: { accidental: null, num: 0 },
  Em: { accidental: '#', num: 1 },
  Bm: { accidental: '#', num: 2 },
  'F#m': { accidental: '#', num: 3 },
  'C#m': { accidental: '#', num: 4 },
  'G#m': { accidental: '#', num: 5 },
};

function correlation(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA * denomB);
  return denom === 0 ? 0 : num / denom;
}

function rotate(profile: number[], tonic: number): number[] {
  return Array.from({ length: 12 }, (_, i) => profile[(i - tonic + 12) % 12]);
}

/**
 * Detects the most likely key using the Krumhansl-Schmuckler algorithm: build a
 * duration-weighted pitch-class histogram, then correlate it against major/minor
 * key profiles rotated to all 12 tonics, and pick the best match.
 */
export function detectKey(notes: NoteEvent[]): KeyInfo {
  const pitchClassWeight = new Array(12).fill(0);
  for (const note of notes) {
    const pc = ((note.pitchMidi % 12) + 12) % 12;
    pitchClassWeight[pc] += note.durationSeconds * (0.3 + note.amplitude);
  }

  let best = { tonic: 0, mode: 'major' as 'major' | 'minor', correlation: -Infinity };
  for (let tonic = 0; tonic < 12; tonic++) {
    const majorScore = correlation(pitchClassWeight, rotate(MAJOR_PROFILE, tonic));
    const minorScore = correlation(pitchClassWeight, rotate(MINOR_PROFILE, tonic));
    if (majorScore > best.correlation) best = { tonic, mode: 'major', correlation: majorScore };
    if (minorScore > best.correlation) best = { tonic, mode: 'minor', correlation: minorScore };
  }

  const vexKey = best.mode === 'major' ? MAJOR_KEY_NAMES[best.tonic] : MINOR_KEY_NAMES[best.tonic];
  const spec = KEY_ACCIDENTALS[vexKey] ?? { accidental: null, num: 0 };

  return {
    tonic: best.tonic,
    mode: best.mode,
    vexKey,
    accidental: spec.accidental,
    correlation: best.correlation,
  };
}
