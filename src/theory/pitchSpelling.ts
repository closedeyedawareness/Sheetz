import type { KeyInfo } from '../types';

interface Spelling {
  letter: string;
  accidental: '' | '#' | 'b';
}

// Natural (white-key) pitch classes always use their plain letter name.
const NATURALS: Record<number, Spelling> = {
  0: { letter: 'c', accidental: '' },
  2: { letter: 'd', accidental: '' },
  4: { letter: 'e', accidental: '' },
  5: { letter: 'f', accidental: '' },
  7: { letter: 'g', accidental: '' },
  9: { letter: 'a', accidental: '' },
  11: { letter: 'b', accidental: '' },
};

const SHARP_SPELLING: Record<number, Spelling> = {
  1: { letter: 'c', accidental: '#' },
  3: { letter: 'd', accidental: '#' },
  6: { letter: 'f', accidental: '#' },
  8: { letter: 'g', accidental: '#' },
  10: { letter: 'a', accidental: '#' },
};

const FLAT_SPELLING: Record<number, Spelling> = {
  1: { letter: 'd', accidental: 'b' },
  3: { letter: 'e', accidental: 'b' },
  6: { letter: 'g', accidental: 'b' },
  8: { letter: 'a', accidental: 'b' },
  10: { letter: 'b', accidental: 'b' },
};

/**
 * Converts a MIDI pitch number into a VexFlow key string (e.g. "c#/4"),
 * spelling chromatic notes with sharps or flats depending on the detected
 * key's accidental convention. This is a simplification: real notation
 * software also considers melodic context (e.g. avoiding augmented seconds),
 * which is out of scope here.
 */
export function midiToVexKey(midi: number, key: KeyInfo): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const useFlats = key.accidental === 'b';
  const spelling = NATURALS[pc] ?? (useFlats ? FLAT_SPELLING[pc] : SHARP_SPELLING[pc]);
  return `${spelling.letter}${spelling.accidental}/${octave}`;
}
