import type { QuantizedNote, TimeSignatureInfo } from '../types';
import { TICKS_PER_WHOLE } from './durations';

export function makeTimeSignature(numerator: number, denominator: number): TimeSignatureInfo {
  return { numerator, denominator, ticksPerMeasure: Math.round((numerator * TICKS_PER_WHOLE) / denominator) };
}

const FOUR_FOUR = makeTimeSignature(4, 4);

// A true 4/4 passage's onset pattern is, by construction, also somewhat
// self-similar every 8 ticks (half the measure) and every 4 (a beat) — 8 and
// 4 are sub-harmonics of 16. So raw autocorrelation at the shorter candidate
// lags will trivially score at least as well as the true period, biasing a
// naive "pick the highest score" comparison toward the shortest candidate
// almost regardless of input. 2/4 (or 3/4 vs 6/8's compound reading) is only
// accepted when it explains the accent pattern CLEARLY better than 4/4, not
// merely somewhat better; ambiguous cases default to 4/4, by far the most
// common piano meter.
const SUBHARMONIC_MARGIN = 1.2;
const MIN_CONFIDENCE = 0.12;

function buildOnsetStrength(notes: QuantizedNote[], totalTicks: number): number[] {
  const strength = new Array(totalTicks).fill(0);
  for (const note of notes) {
    if (note.startTick < totalTicks) strength[note.startTick] += note.amplitude;
  }
  return strength;
}

/**
 * Mean-centered, variance-normalized autocorrelation at a given lag: how
 * strongly the signal's deviations from its own average repeat after `lag`
 * ticks, roughly bounded to [-1, 1] so scores at different lags are actually
 * comparable (unlike a raw un-normalized product average).
 */
function normalizedAutocorrelation(strength: number[], lag: number): number {
  const n = strength.length;
  if (lag <= 0 || lag >= n) return 0;

  const mean = strength.reduce((s, v) => s + v, 0) / n;
  let variance = 0;
  for (const v of strength) variance += (v - mean) ** 2;
  if (variance === 0) return 0;

  let covariance = 0;
  for (let i = 0; i + lag < n; i++) covariance += (strength[i] - mean) * (strength[i + lag] - mean);
  return covariance / variance;
}

/**
 * Guesses a time signature from how note onsets group rhythmically, using
 * onset-strength autocorrelation at candidate measure lengths. This is a
 * coarse heuristic (real meter detection is a hard MIR problem) restricted
 * to the meters this app can notate: 2/4, 3/4, 4/4, 6/8, and it's biased
 * toward 4/4 unless another meter clearly fits better.
 */
export function detectTimeSignature(notes: QuantizedNote[]): TimeSignatureInfo {
  if (notes.length < 8) return FOUR_FOUR;

  const totalTicks = Math.max(...notes.map((n) => n.startTick + n.durationTicks));
  const strength = buildOnsetStrength(notes, totalTicks);

  const score8 = normalizedAutocorrelation(strength, 8);
  const score12 = normalizedAutocorrelation(strength, 12);
  const score16 = normalizedAutocorrelation(strength, 16);

  if (score8 > MIN_CONFIDENCE && score8 > score16 * SUBHARMONIC_MARGIN) {
    return makeTimeSignature(2, 4);
  }
  if (score12 > MIN_CONFIDENCE && score12 > score16) {
    // 12-tick measure: simple triple (3/4) accents every quarter (4 ticks);
    // compound duple (6/8) accents every dotted quarter (6 ticks).
    const simpleFeel = normalizedAutocorrelation(strength, 4);
    const compoundFeel = normalizedAutocorrelation(strength, 6);
    return compoundFeel > simpleFeel ? makeTimeSignature(6, 8) : makeTimeSignature(3, 4);
  }
  return FOUR_FOUR;
}
