import type { NoteEvent, Score, TimeSignatureInfo } from '../types';
import { detectChordProgression } from './chords';
import { TICKS_PER_QUARTER } from './durations';
import { splitHands } from './handSplit';
import { detectKey } from './key';
import { buildStaffPart } from './measures';
import { quantizeNotes } from './quantize';
import { estimateTempo } from './tempo';
import { detectTimeSignature, makeTimeSignature } from './timeSignature';

export { makeTimeSignature };

export interface BuildScoreOptions {
  /** Override the auto-detected tempo, in BPM. */
  tempoBpm?: number;
  /** Overrides the auto-detected meter (2/4, 3/4, 4/4, or 6/8). */
  timeSignature?: TimeSignatureInfo;
  title?: string;
  artist?: string;
}

export function buildScore(notes: NoteEvent[], options: BuildScoreOptions = {}): Score {
  const tempoBpm = options.tempoBpm ?? estimateTempo(notes);
  const key = detectKey(notes);
  const secondsPerTick = 60 / tempoBpm / TICKS_PER_QUARTER;

  const quantized = quantizeNotes(notes, tempoBpm);
  const timeSignature = options.timeSignature ?? detectTimeSignature(quantized);
  const { treble, bass } = splitHands(quantized);

  const lastTick = (staffNotes: typeof quantized) =>
    staffNotes.reduce((max, n) => Math.max(max, n.startTick + n.durationTicks), 0);
  const sharedTotalTicks = Math.max(lastTick(treble), lastTick(bass));
  const totalMeasures = Math.max(1, Math.ceil(sharedTotalTicks / timeSignature.ticksPerMeasure));

  return {
    tempoBpm,
    timeSignature,
    key,
    treble: buildStaffPart(treble, 'treble', timeSignature.ticksPerMeasure, secondsPerTick, sharedTotalTicks),
    bass: buildStaffPart(bass, 'bass', timeSignature.ticksPerMeasure, secondsPerTick, sharedTotalTicks),
    chords: detectChordProgression(quantized, timeSignature.ticksPerMeasure, totalMeasures, key),
    title: options.title,
    artist: options.artist,
  };
}
