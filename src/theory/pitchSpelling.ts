import type { KeyInfo } from '../types';

export interface Pitch {
  /** Upper-case letter name A-G. */
  step: string;
  /** Semitone offset from the natural step: -1 flat, 0 natural, 1 sharp. */
  alter: number;
  octave: number;
}

interface Spelling {
  step: string;
  alter: number;
}

// Natural (white-key) pitch classes always use their plain letter name.
const NATURALS: Record<number, Spelling> = {
  0: { step: 'C', alter: 0 },
  2: { step: 'D', alter: 0 },
  4: { step: 'E', alter: 0 },
  5: { step: 'F', alter: 0 },
  7: { step: 'G', alter: 0 },
  9: { step: 'A', alter: 0 },
  11: { step: 'B', alter: 0 },
};

const SHARP_SPELLING: Record<number, Spelling> = {
  1: { step: 'C', alter: 1 },
  3: { step: 'D', alter: 1 },
  6: { step: 'F', alter: 1 },
  8: { step: 'G', alter: 1 },
  10: { step: 'A', alter: 1 },
};

const FLAT_SPELLING: Record<number, Spelling> = {
  1: { step: 'D', alter: -1 },
  3: { step: 'E', alter: -1 },
  6: { step: 'G', alter: -1 },
  8: { step: 'A', alter: -1 },
  10: { step: 'B', alter: -1 },
};

/**
 * Converts a MIDI pitch number into a notated pitch (step/alter/octave),
 * spelling chromatic notes with sharps or flats depending on the detected
 * key's accidental convention. This is a simplification: real notation
 * software also considers melodic context (e.g. avoiding augmented seconds),
 * which is out of scope here.
 */
export function midiToPitch(midi: number, key: KeyInfo): Pitch {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const useFlats = key.accidental === 'b';
  const spelling = NATURALS[pc] ?? (useFlats ? FLAT_SPELLING[pc] : SHARP_SPELLING[pc]);
  return { step: spelling.step, alter: spelling.alter, octave };
}
