import type { NoteEvent } from '../types';

const MIN_INTERVAL = 0.2; // seconds, ~300 BPM
const MAX_INTERVAL = 1.2; // seconds, ~50 BPM
const BIN_SIZE = 0.02; // seconds

/**
 * Estimates a single "beat" tempo from note onset spacing. This is a coarse
 * histogram-of-inter-onset-intervals approach: it does not do full beat
 * tracking (no swing/meter detection), but is good enough to pick a sensible
 * default BPM that the user can override.
 */
export function estimateTempo(notes: NoteEvent[]): number {
  if (notes.length < 2) return 120;

  const onsets = [...new Set(notes.map((n) => Math.round(n.startTimeSeconds * 1000) / 1000))].sort(
    (a, b) => a - b
  );

  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const gap = onsets[i] - onsets[i - 1];
    if (gap >= MIN_INTERVAL && gap <= MAX_INTERVAL) intervals.push(gap);
  }
  if (intervals.length === 0) return 120;

  const binCount = Math.ceil((MAX_INTERVAL - MIN_INTERVAL) / BIN_SIZE);
  const histogram = new Array(binCount).fill(0);
  for (const gap of intervals) {
    const bin = Math.min(binCount - 1, Math.floor((gap - MIN_INTERVAL) / BIN_SIZE));
    histogram[bin]++;
  }

  let bestBin = 0;
  for (let i = 1; i < histogram.length; i++) {
    if (histogram[i] > histogram[bestBin]) bestBin = i;
  }
  const beatInterval = MIN_INTERVAL + (bestBin + 0.5) * BIN_SIZE;

  let bpm = 60 / beatInterval;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;

  return Math.round(bpm);
}
