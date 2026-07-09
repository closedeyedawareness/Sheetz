import type { ChordAlternative, KeyInfo } from '../types';
import { midiToPitch } from './pitchSpelling';

function pc(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Formats a chord root + quality suffix as display text, e.g. "F#m7". */
export function chordLabel(root: number, suffix: string, key: KeyInfo): string {
  const pitch = midiToPitch(pc(root) + 60, key);
  const accidental = pitch.alter === 1 ? '#' : pitch.alter === -1 ? 'b' : '';
  return `${pitch.step}${accidental}${suffix}`;
}

const MAJOR_FAMILY = new Set(['', 'maj7', '7']);
const MINOR_FAMILY = new Set(['m', 'm7']);

/**
 * Standard music-theory substitutions for a detected chord, relative to the
 * piece's key: relative major/minor, parallel (borrowed) mode, and — for
 * dominant chords — a tritone substitution and the "ii" chord that would
 * approach the same target. These are suggestions only: picking one just
 * relabels the chord symbol, it never rewrites the underlying notation.
 */
export function getChordAlternatives(chord: { root: number; suffix: string }, key: KeyInfo): ChordAlternative[] {
  const alts: ChordAlternative[] = [];
  const seen = new Set<string>([`${pc(chord.root)}${chord.suffix}`]);

  const add = (root: number, suffix: string) => {
    const key2 = `${pc(root)}${suffix}`;
    if (seen.has(key2)) return;
    seen.add(key2);
    alts.push({ root: pc(root), suffix, label: chordLabel(root, suffix, key) });
  };

  if (MAJOR_FAMILY.has(chord.suffix)) {
    add(chord.root - 3, chord.suffix === '' ? 'm' : 'm7'); // relative minor
    add(chord.root, chord.suffix === '' ? 'm' : 'm7'); // parallel (borrowed) minor
  } else if (MINOR_FAMILY.has(chord.suffix)) {
    add(chord.root + 3, chord.suffix === 'm' ? '' : 'maj7'); // relative major
    add(chord.root, chord.suffix === 'm' ? '' : 'maj7'); // parallel (borrowed) major
  } else {
    add(chord.root, ''); // parallel major
    add(chord.root, 'm'); // parallel minor
  }

  if (chord.suffix === '7') {
    add(chord.root + 6, '7'); // tritone substitution
    add(chord.root + 7, 'm7'); // "ii" approaching the same target
  }

  return alts.slice(0, 4);
}
