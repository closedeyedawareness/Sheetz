import type { QuantizedNote } from '../types';

const MIDDLE_C = 60;

/**
 * Splits notes across the grand staff by pitch relative to middle C. This is a
 * simplification: real piano music sometimes crosses hands, which would need a
 * proper voice-separation model to detect. Good enough for a first pass.
 */
export function splitHands(notes: QuantizedNote[]): { treble: QuantizedNote[]; bass: QuantizedNote[] } {
  const treble = notes.filter((n) => n.pitchMidi >= MIDDLE_C);
  const bass = notes.filter((n) => n.pitchMidi < MIDDLE_C);
  return { treble, bass };
}
