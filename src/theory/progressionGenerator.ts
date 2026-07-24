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

// ── Full song structure ────────────────────────────────────────────────────
// A real song is not three unrelated blocks: it is a handful of sections, each
// with a harmonic job, arranged into a FORM — and the chorus (and verse) recur
// identically every time they come round. That recurrence is what makes it a
// song rather than a chord étude. Degree indices below are into *_DEGREES:
// major 0=I 1=ii 2=iii 3=IV 4=V 5=vi 6=vii°; minor 0=i 1=ii° 2=III 3=iv 4=v 5=VI 6=VII.

type SectionType = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'A' | 'outro';

interface SectionPools {
  intro: number[][];
  verse: number[][];
  prechorus: number[][]; // build tension, land on V (or minor VII/v) to lift into the chorus
  chorus: number[][]; // the hook — the harmonic "home" the song keeps returning to
  bridge: number[][]; // contrast — depart, then set up the final chorus
}

const MAJOR_SECTION_POOLS: SectionPools = {
  intro: [[0, 4], [0, 3], [0, 5]], // I–V, I–IV, I–vi vamp
  verse: [[0, 5, 3, 4], [0, 4, 5, 3], [5, 3, 0, 4], [0, 3, 0, 4], [0, 2, 3, 4]],
  prechorus: [[3, 4, 3, 4], [5, 3, 1, 4], [1, 1, 4, 4], [3, 4, 5, 4]],
  chorus: [[0, 4, 5, 3], [0, 3, 4, 3], [5, 3, 0, 4], [0, 4, 3, 4], [3, 0, 4, 0]],
  bridge: [[3, 5, 1, 4], [5, 2, 3, 4], [1, 4, 5, 4], [3, 3, 4, 4]],
};

const MINOR_SECTION_POOLS: SectionPools = {
  intro: [[0, 6], [0, 3], [0, 5]], // i–VII, i–iv, i–VI vamp
  verse: [[0, 6, 5, 6], [0, 5, 2, 6], [0, 3, 6, 2], [0, 6, 5, 4]],
  prechorus: [[3, 3, 6, 6], [5, 6, 3, 4], [3, 4, 6, 6], [5, 3, 4, 6]],
  chorus: [[0, 5, 2, 6], [0, 6, 3, 4], [5, 6, 0, 0], [3, 6, 0, 0]],
  bridge: [[2, 5, 6, 4], [3, 6, 5, 4], [5, 2, 6, 4], [3, 4, 5, 6]],
};

interface FormStep { label: string; type: SectionType; }
interface SongForm { name: string; steps: FormStep[]; }

// Common real-world arrangements. Repeated labels of the same `type` reuse the
// exact same chords (that is the point of a chorus).
const SONG_FORMS: SongForm[] = [
  { name: 'Verse–Chorus (Pop)', steps: [
    { label: 'Intro', type: 'intro' }, { label: 'Verse 1', type: 'verse' }, { label: 'Pre-Chorus', type: 'prechorus' }, { label: 'Chorus', type: 'chorus' },
    { label: 'Verse 2', type: 'verse' }, { label: 'Pre-Chorus', type: 'prechorus' }, { label: 'Chorus', type: 'chorus' },
    { label: 'Bridge', type: 'bridge' }, { label: 'Chorus', type: 'chorus' }, { label: 'Outro', type: 'outro' } ] },
  { name: 'Verse–Chorus (Rock)', steps: [
    { label: 'Intro', type: 'intro' }, { label: 'Verse 1', type: 'verse' }, { label: 'Chorus', type: 'chorus' },
    { label: 'Verse 2', type: 'verse' }, { label: 'Chorus', type: 'chorus' }, { label: 'Bridge', type: 'bridge' }, { label: 'Chorus', type: 'chorus' }, { label: 'Outro', type: 'outro' } ] },
  { name: 'Verse–Chorus (Concise)', steps: [
    { label: 'Intro', type: 'intro' }, { label: 'Verse', type: 'verse' }, { label: 'Chorus', type: 'chorus' },
    { label: 'Verse', type: 'verse' }, { label: 'Chorus', type: 'chorus' }, { label: 'Outro', type: 'outro' } ] },
  { name: 'AABA (Standard)', steps: [
    { label: 'Intro', type: 'intro' }, { label: 'A', type: 'A' }, { label: 'A', type: 'A' }, { label: 'B — Bridge', type: 'bridge' }, { label: 'A', type: 'A' }, { label: 'Outro', type: 'outro' } ] },
  { name: 'Ballad', steps: [
    { label: 'Verse 1', type: 'verse' }, { label: 'Pre-Chorus', type: 'prechorus' }, { label: 'Chorus', type: 'chorus' },
    { label: 'Verse 2', type: 'verse' }, { label: 'Pre-Chorus', type: 'prechorus' }, { label: 'Chorus', type: 'chorus' },
    { label: 'Bridge', type: 'bridge' }, { label: 'Chorus', type: 'chorus' } ] },
];

export interface SongSection {
  label: string;
  /** e.g. "Cmaj7 – Am7 – Fmaj9 – G13" */
  line: string;
  chords: string[];
}

export interface SongProgression {
  /** e.g. "Verse–Chorus (Pop)" */
  form: string;
  key: string;
  mode: 'major' | 'minor';
  /** Sections in performance order; recurring sections carry identical chords. */
  sections: SongSection[];
}

/**
 * Generates a full song: one progression per unique section, all in a single
 * key, arranged into a real form. The chorus and verse recur with the exact
 * same chords each time; the pre-chorus lands on the dominant to lift into the
 * chorus; the outro takes the chorus and resolves it firmly to the tonic.
 */
export function generateSong(): SongProgression {
  const mode: 'major' | 'minor' = Math.random() < 0.5 ? 'major' : 'minor';
  const tonicIndex = Math.floor(Math.random() * 12);
  const rootNames = mode === 'major' ? MAJOR_ROOTS : MINOR_ROOTS;
  const degrees = mode === 'major' ? MAJOR_DEGREES : MINOR_DEGREES;
  const pools = mode === 'major' ? MAJOR_SECTION_POOLS : MINOR_SECTION_POOLS;
  const form = pick(SONG_FORMS);

  const namesFor = (seq: number[]) => seq.map((idx) => chordName(rootNames, tonicIndex, degrees[idx]));

  // Generate each unique section ONCE so its (randomly coloured) chords are
  // fixed, then reuse across every recurrence.
  const used = new Set(form.steps.map((s) => s.type));
  const chordsByType: Partial<Record<SectionType, string[]>> = {};
  if (used.has('verse')) chordsByType.verse = namesFor(pick(pools.verse));
  if (used.has('A')) chordsByType.A = namesFor(pick(pools.verse)); // the A-section is a self-contained verse
  if (used.has('prechorus')) chordsByType.prechorus = namesFor(pick(pools.prechorus));
  if (used.has('chorus')) chordsByType.chorus = namesFor(pick(pools.chorus));
  if (used.has('bridge')) chordsByType.bridge = namesFor(pick(pools.bridge));
  if (used.has('intro')) chordsByType.intro = namesFor(pick(pools.intro));
  if (used.has('outro')) {
    // The outro is the hook, resolved home: take the chorus (or A) and land the
    // last bar on the tonic for closure.
    const base = (chordsByType.chorus ?? chordsByType.A ?? namesFor(pick(pools.chorus))).slice();
    base[base.length - 1] = chordName(rootNames, tonicIndex, degrees[0]);
    chordsByType.outro = base;
  }

  const sections: SongSection[] = form.steps.map((step) => {
    const chords = chordsByType[step.type]!;
    return { label: step.label, chords, line: chords.join(' – ') };
  });

  const keyName = `${rootNames[tonicIndex]}${mode === 'minor' ? 'm' : ''}`;
  return { form: form.name, key: keyName, mode, sections };
}
