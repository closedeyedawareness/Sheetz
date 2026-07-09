import type { ChordSymbol, KeyInfo, QuantizedNote } from '../types';
import { chordLabel, getChordAlternatives } from './chordSubstitutions';

interface ChordTemplate {
  suffix: string;
  mxmlKind: string;
  /** Semitone offsets from the root. */
  intervals: number[];
}

// Ordered roughly simplest-first so ties in scoring favor the plainer label.
const CHORD_TEMPLATES: ChordTemplate[] = [
  { suffix: '', mxmlKind: 'major', intervals: [0, 4, 7] },
  { suffix: 'm', mxmlKind: 'minor', intervals: [0, 3, 7] },
  { suffix: 'dim', mxmlKind: 'diminished', intervals: [0, 3, 6] },
  { suffix: 'aug', mxmlKind: 'augmented', intervals: [0, 4, 8] },
  { suffix: 'sus2', mxmlKind: 'suspended-second', intervals: [0, 2, 7] },
  { suffix: 'sus4', mxmlKind: 'suspended-fourth', intervals: [0, 5, 7] },
  { suffix: '7', mxmlKind: 'dominant', intervals: [0, 4, 7, 10] },
  { suffix: 'maj7', mxmlKind: 'major-seventh', intervals: [0, 4, 7, 11] },
  { suffix: 'm7', mxmlKind: 'minor-seventh', intervals: [0, 3, 7, 10] },
  { suffix: 'm7b5', mxmlKind: 'half-diminished', intervals: [0, 3, 6, 10] },
  { suffix: 'dim7', mxmlKind: 'diminished-seventh', intervals: [0, 3, 6, 9] },
];

const MIN_DISTINCT_PITCH_CLASSES = 2;

function scoreTemplate(root: number, template: ChordTemplate, observed: Set<number>, bassPc: number | undefined) {
  const templatePcs = new Set(template.intervals.map((i) => (root + i) % 12));
  let matched = 0;
  for (const pc of templatePcs) if (observed.has(pc)) matched++;
  let extraneous = 0;
  for (const pc of observed) if (!templatePcs.has(pc)) extraneous++;
  const missing = templatePcs.size - matched;
  let score = matched * 2 - extraneous * 1 - missing * 1.5;
  if (bassPc === root) score += 0.5;
  return score;
}

/**
 * Finds the best-fitting chord (root + quality) for a set of
 * simultaneously-sounding pitch classes. Exported for reuse by live-listening
 * mode, which matches chords frame-by-frame from a mic chroma vector instead
 * of from quantized notes.
 */
export function detectChord(
  observed: Set<number>,
  bassPc: number | undefined
): { root: number; suffix: string; mxmlKind: string } | undefined {
  if (observed.size < MIN_DISTINCT_PITCH_CLASSES) return undefined;

  let best: { root: number; suffix: string; mxmlKind: string; score: number } | undefined;
  for (let root = 0; root < 12; root++) {
    for (const template of CHORD_TEMPLATES) {
      const score = scoreTemplate(root, template, observed, bassPc);
      if (!best || score > best.score) {
        best = { root, suffix: template.suffix, mxmlKind: template.mxmlKind, score };
      }
    }
  }
  return best && best.score > 0 ? best : undefined;
}

/**
 * Analyzes the harmony one measure at a time (union of pitch classes sounding
 * anywhere in that measure, both hands combined) and returns a chord symbol
 * only where it changes from the previous measure, so the same chord held
 * across several bars is labeled once rather than repeated on every measure.
 */
export function detectChordProgression(
  notes: QuantizedNote[],
  ticksPerMeasure: number,
  totalMeasures: number,
  key: KeyInfo
): ChordSymbol[] {
  const symbols: ChordSymbol[] = [];
  let lastLabel: string | undefined;

  for (let m = 0; m < totalMeasures; m++) {
    const start = m * ticksPerMeasure;
    const end = start + ticksPerMeasure;
    const inMeasure = notes.filter((n) => n.startTick < end && n.startTick + n.durationTicks > start);
    if (inMeasure.length === 0) continue;

    const pitchClasses = new Set(inMeasure.map((n) => ((n.pitchMidi % 12) + 12) % 12));
    const bassMidi = Math.min(...inMeasure.map((n) => n.pitchMidi));
    const bassPc = ((bassMidi % 12) + 12) % 12;

    const chord = detectChord(pitchClasses, bassPc);
    if (!chord) continue;

    const dedupeKey = `${chord.root}${chord.suffix}`;
    if (dedupeKey === lastLabel) continue;
    lastLabel = dedupeKey;
    symbols.push({
      measureIndex: m,
      root: chord.root,
      suffix: chord.suffix,
      mxmlKind: chord.mxmlKind,
      label: chordLabel(chord.root, chord.suffix, key),
      alternatives: getChordAlternatives(chord, key),
    });
  }

  return symbols;
}
