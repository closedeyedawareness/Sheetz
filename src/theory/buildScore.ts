import type { NoteEvent, Score, TimeSignatureInfo } from '../types';
import { TICKS_PER_QUARTER, TICKS_PER_WHOLE } from './durations';
import { splitHands } from './handSplit';
import { detectKey } from './key';
import { buildStaffPart } from './measures';
import { quantizeNotes } from './quantize';
import { estimateTempo } from './tempo';

export function makeTimeSignature(numerator: number, denominator: number): TimeSignatureInfo {
  return { numerator, denominator, ticksPerMeasure: Math.round((numerator * TICKS_PER_WHOLE) / denominator) };
}

export interface BuildScoreOptions {
  /** Override the auto-detected tempo, in BPM. */
  tempoBpm?: number;
  /** Defaults to 4/4, the most common piano meter. */
  timeSignature?: TimeSignatureInfo;
}

export function buildScore(notes: NoteEvent[], options: BuildScoreOptions = {}): Score {
  const tempoBpm = options.tempoBpm ?? estimateTempo(notes);
  const timeSignature = options.timeSignature ?? makeTimeSignature(4, 4);
  const key = detectKey(notes);
  const secondsPerTick = 60 / tempoBpm / TICKS_PER_QUARTER;

  const quantized = quantizeNotes(notes, tempoBpm);
  const { treble, bass } = splitHands(quantized);

  const lastTick = (staffNotes: typeof quantized) =>
    staffNotes.reduce((max, n) => Math.max(max, n.startTick + n.durationTicks), 0);
  const sharedTotalTicks = Math.max(lastTick(treble), lastTick(bass));

  return {
    tempoBpm,
    timeSignature,
    key,
    treble: buildStaffPart(treble, 'treble', timeSignature.ticksPerMeasure, secondsPerTick, key, sharedTotalTicks),
    bass: buildStaffPart(bass, 'bass', timeSignature.ticksPerMeasure, secondsPerTick, key, sharedTotalTicks),
  };
}
