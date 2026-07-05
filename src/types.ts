/** A single detected/played note, in continuous time. */
export interface NoteEvent {
  pitchMidi: number;
  startTimeSeconds: number;
  durationSeconds: number;
  /** Loudness, normalized 0-1. */
  amplitude: number;
}

/** A note event after quantization to the sixteenth-note grid. */
export interface QuantizedNote {
  pitchMidi: number;
  startTick: number;
  durationTicks: number;
  /** Duration before quantization, used for staccato detection. */
  rawDurationSeconds: number;
  amplitude: number;
}

export type ClefName = 'treble' | 'bass';

export type ArticulationMark = 'staccato' | 'accent';

/** One notated event inside a measure: either a sounding chord or a rest. */
export interface ScoreSlot {
  type: 'note' | 'rest';
  startTick: number;
  durationTicks: number;
  /** VexFlow base duration, e.g. 'w' | 'h' | 'q' | '8' | '16'. */
  duration: string;
  dots: 0 | 1;
  /** Raw MIDI pitches making up the chord. Only present for notes. */
  pitches?: number[];
  /** True if this slot is tied over from the previous slot (same sounding note continues). */
  tiedFromPrevious?: boolean;
  /** True if this slot is tied into the next slot. */
  tiedToNext?: boolean;
  articulations?: ArticulationMark[];
  /** Dynamic marking to print above this slot, only set at change points. */
  dynamic?: string;
  slurStart?: boolean;
  slurEnd?: boolean;
}

export interface Measure {
  index: number;
  slots: ScoreSlot[];
}

export interface StaffPart {
  clef: ClefName;
  measures: Measure[];
}

export interface KeyInfo {
  /** Pitch class 0-11 of the tonic, 0 = C. */
  tonic: number;
  mode: 'major' | 'minor';
  /** Key name, e.g. 'G', 'Em', 'Bb'. */
  name: string;
  accidental: '#' | 'b' | null;
  /** Signed count of sharps (positive) or flats (negative) for MusicXML's <fifths>. */
  fifths: number;
  correlation: number;
}

export interface TimeSignatureInfo {
  numerator: number;
  denominator: number;
  /** Length of one measure, in sixteenth-note ticks. */
  ticksPerMeasure: number;
}

/** A detected chord symbol (e.g. "Dm7"), shown at the measure where the harmony changes. */
export interface ChordSymbol {
  measureIndex: number;
  /** Pitch class 0-11 of the chord root. */
  root: number;
  /** Quality suffix, e.g. '', 'm', '7', 'maj7', 'dim'. */
  suffix: string;
  /** MusicXML <kind> value, e.g. 'major', 'minor-seventh'. */
  mxmlKind: string;
}

export interface Score {
  tempoBpm: number;
  timeSignature: TimeSignatureInfo;
  key: KeyInfo;
  treble: StaffPart;
  bass: StaffPart;
  chords: ChordSymbol[];
}
