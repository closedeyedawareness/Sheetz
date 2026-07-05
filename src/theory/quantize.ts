import type { NoteEvent, QuantizedNote } from '../types';
import { TICKS_PER_QUARTER } from './durations';

/**
 * Snaps note onsets/durations onto a sixteenth-note grid derived from the
 * estimated tempo. Notes shorter than one grid step are stretched to fill it.
 * Duplicate (pitch, startTick) pairs from noisy transcription are collapsed,
 * keeping the longer/louder detection.
 */
export function quantizeNotes(notes: NoteEvent[], bpm: number): QuantizedNote[] {
  const secondsPerTick = 60 / bpm / TICKS_PER_QUARTER;

  const byKey = new Map<string, QuantizedNote>();
  for (const note of notes) {
    const startTick = Math.round(note.startTimeSeconds / secondsPerTick);
    const durationTicks = Math.max(1, Math.round(note.durationSeconds / secondsPerTick));
    const key = `${startTick}:${note.pitchMidi}`;
    const existing = byKey.get(key);
    if (!existing || durationTicks > existing.durationTicks) {
      byKey.set(key, {
        pitchMidi: note.pitchMidi,
        startTick,
        durationTicks,
        rawDurationSeconds: note.durationSeconds,
        amplitude: note.amplitude,
      });
    }
  }

  return [...byKey.values()].sort((a, b) => a.startTick - b.startTick || a.pitchMidi - b.pitchMidi);
}
