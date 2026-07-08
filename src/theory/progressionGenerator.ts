// Root note spellings chosen to minimise accidentals per key, mirroring key.ts.
const MAJOR_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

type ChordQuality = 'maj7' | 'm7' | '7' | 'm7b5' | 'maj9' | 'm9' | '9' | '13' | '7b9' | 'm6';

interface DegreeChord {
  /** Semitone offset of this scale degree's root from the tonic. */
  offset: number;
  quality: ChordQuality;
}

// Diatonic 7th chords built on each degree of the major scale (Ionian).
const MAJOR_DEGREES: DegreeChord[] = [
  { offset: 0, quality: 'maj7' }, // I
  { offset: 2, quality: 'm7' }, // ii
  { offset: 4, quality: 'm7' }, // iii
  { offset: 5, quality: 'maj7' }, // IV
  { offset: 7, quality: '7' }, // V
  { offset: 9, quality: 'm7' }, // vi
  { offset: 11, quality: 'm7b5' }, // vii°
];

// Diatonic 7th chords built on each degree of the natural minor scale (Aeolian).
const MINOR_DEGREES: DegreeChord[] = [
  { offset: 0, quality: 'm7' }, // i
  { offset: 2, quality: 'm7b5' }, // ii°
  { offset: 3, quality: 'maj7' }, // III
  { offset: 5, quality: 'm7' }, // iv
  { offset: 7, quality: 'm7' }, // v
  { offset: 8, quality: 'maj7' }, // VI
  { offset: 10, quality: '7' }, // VII
];

// Scale-degree index sequences (into *_DEGREES above), picked for strong root motion
// (4ths/5ths, stepwise resolutions) so any pick reads as an intentional progression.
const MAJOR_PROGRESSIONS: number[][] = [
  [0, 5, 1, 4],
  [1, 4, 0],
  [0, 3, 4, 0],
  [5, 1, 4, 0],
  [0, 5, 3, 4],
  [2, 5, 1, 4],
  [0, 4, 5, 3],
  [3, 4, 2, 5],
];

const MINOR_PROGRESSIONS: number[][] = [
  [0, 3, 4, 0],
  [0, 5, 2, 6],
  [1, 4, 0],
  [0, 3, 6, 2],
  [0, 6, 5, 4],
  [2, 5, 0, 0],
];

// Occasional colour tones layered on the plain diatonic quality, weighted so the
// progression mostly stays clean with a jazzier flourish here and there.
const DOMINANT_COLOURS: ChordQuality[] = ['7', '7', '9', '13', '7b9'];
const MAJOR7_COLOURS: ChordQuality[] = ['maj7', 'maj7', 'maj9'];
const MINOR7_COLOURS: ChordQuality[] = ['m7', 'm7', 'm9', 'm6'];

function pick<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

function withColour(quality: ChordQuality): ChordQuality {
  if (quality === '7') return pick(DOMINANT_COLOURS);
  if (quality === 'maj7') return pick(MAJOR7_COLOURS);
  if (quality === 'm7') return pick(MINOR7_COLOURS);
  return quality;
}

function chordName(rootNames: string[], tonicIndex: number, degree: DegreeChord): string {
  const root = rootNames[(tonicIndex + degree.offset) % 12];
  return `${root}${withColour(degree.quality)}`;
}

export interface GeneratedProgression {
  /** e.g. "Cm7 – Fm7 – Bb7 – Ebmaj9" */
  line: string;
  key: string;
  mode: 'major' | 'minor';
}

export interface StructuredProgression {
  intro: string;
  transition: string;
  ending: string;
  key: string;
  mode: 'major' | 'minor';
}

/** Generates one line of diatonic, professionally-voiced chords in a randomly chosen key. */
export function generateChordProgression(): GeneratedProgression {
  const mode: 'major' | 'minor' = Math.random() < 0.5 ? 'major' : 'minor';
  const tonicIndex = Math.floor(Math.random() * 12);
  const rootNames = mode === 'major' ? MAJOR_ROOTS : MINOR_ROOTS;
  const degrees = mode === 'major' ? MAJOR_DEGREES : MINOR_DEGREES;
  const sequence = pick(mode === 'major' ? MAJOR_PROGRESSIONS : MINOR_PROGRESSIONS);

  const chords = sequence.map((degreeIndex) => chordName(rootNames, tonicIndex, degrees[degreeIndex]));
  const keyName = `${rootNames[tonicIndex]}${mode === 'minor' ? 'm' : ''}`;

  return { line: chords.join(' – '), key: keyName, mode };
}

/** Generates a full song structure: intro (4 chords) → transition (4 chords) → ending (4 chords). */
export function generateStructuredProgression(): StructuredProgression {
  const mode: 'major' | 'minor' = Math.random() < 0.5 ? 'major' : 'minor';
  const tonicIndex = Math.floor(Math.random() * 12);
  const rootNames = mode === 'major' ? MAJOR_ROOTS : MINOR_ROOTS;
  const degrees = mode === 'major' ? MAJOR_DEGREES : MINOR_DEGREES;

  // Intro: establishes the key with strong tonic, stable progression
  const introSequences: number[][] = [
    [0, 3, 4, 0], // I - IV - V - I (classic)
    [0, 5, 1, 4], // I - vi - ii - V
    [0, 2, 5, 1], // I - iii - vi - ii
    [1, 4, 0, 5], // ii - V - I - vi
  ];
  const introSeq = pick(introSequences);
  const intro = introSeq.map((idx) => chordName(rootNames, tonicIndex, degrees[idx])).join(' – ');

  // Transition: moves away from tonic, sets up tension, ends on dominant or secondary chord
  const transitionSequences: number[][] = [
    [2, 5, 1, 4], // iii - vi - ii - V (circle motion)
    [5, 1, 4, 2], // vi - ii - V - iii (stepping up)
    [3, 4, 5, 1], // IV - V - vi - ii (modulating feel)
    [4, 2, 5, 3], // V - iii - vi - IV (jazz reharmonization)
    [1, 5, 2, 4], // ii - vi - iii - V (chromatic bass feel)
  ];
  const transSeq = pick(transitionSequences);
  const transition = transSeq.map((idx) => chordName(rootNames, tonicIndex, degrees[idx])).join(' – ');

  // Ending: resolves back to tonic, provides closure, strong final cadence
  const endingSequences: number[][] = [
    [5, 1, 4, 0], // vi - ii - V - I (authentic cadence)
    [4, 3, 4, 0], // V - IV - V - I (plagal-authentic hybrid)
    [2, 5, 1, 0], // iii - vi - ii - I (circle back)
    [3, 4, 0, 0], // IV - V - I - I (IV-V-I resolution, double I)
    [1, 4, 5, 0], // ii - V - vi - I (deceptive then resolve)
  ];
  const endSeq = pick(endingSequences);
  const ending = endSeq.map((idx) => chordName(rootNames, tonicIndex, degrees[idx])).join(' – ');

  const keyName = `${rootNames[tonicIndex]}${mode === 'minor' ? 'm' : ''}`;
  return { intro, transition, ending, key: keyName, mode };
}
