import { TICKS_PER_QUARTER } from '../theory/durations';
import { midiToPitch } from '../theory/pitchSpelling';
import type { ChordSymbol, Measure, Score, ScoreSlot } from '../types';

const DURATION_TYPE_NAMES: Record<string, string> = {
  w: 'whole',
  h: 'half',
  q: 'quarter',
  '8': 'eighth',
  '16': '16th',
};

let slurCounter = 0;

/**
 * Renders one <note> element for a single pitch. Chords are NOT multiple
 * <pitch> children on one <note> (that's invalid MusicXML) — each pitch in a
 * chord gets its own <note> element, with all but the first flagged <chord/>.
 */
function renderSingleNote(
  slot: ScoreSlot,
  staffNumber: 1 | 2,
  voiceNumber: 1 | 2,
  midi: number | undefined,
  isChordContinuation: boolean,
  includeChordWideNotations: boolean,
  slurNumber: number,
  key: Score['key']
): string {
  const parts: string[] = ['<note>'];

  if (isChordContinuation) parts.push('<chord/>');
  if (slot.type === 'rest' || midi === undefined) {
    parts.push('<rest/>');
  } else {
    const pitch = midiToPitch(midi, key);
    parts.push(
      `<pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ''}<octave>${pitch.octave}</octave></pitch>`
    );
  }

  parts.push(`<duration>${slot.durationTicks}</duration>`);
  if (slot.type === 'note' && slot.tiedFromPrevious) parts.push('<tie type="stop"/>');
  if (slot.type === 'note' && slot.tiedToNext) parts.push('<tie type="start"/>');
  parts.push(`<voice>${voiceNumber}</voice>`);
  parts.push(`<type>${DURATION_TYPE_NAMES[slot.duration]}</type>`);
  if (slot.dots > 0) parts.push('<dot/>');
  parts.push(`<staff>${staffNumber}</staff>`);

  const notations: string[] = [];
  if (slot.tiedFromPrevious) notations.push('<tied type="stop"/>');
  if (slot.tiedToNext) notations.push('<tied type="start"/>');
  if (includeChordWideNotations) {
    if (slot.slurStart) notations.push(`<slur type="start" number="${slurNumber}"/>`);
    if (slot.slurEnd) notations.push(`<slur type="stop" number="${slurNumber}"/>`);
    if (slot.articulations?.length) {
      const arts = slot.articulations.map((a) => (a === 'staccato' ? '<staccato/>' : '<accent/>')).join('');
      notations.push(`<articulations>${arts}</articulations>`);
    }
  }
  if (notations.length) parts.push(`<notations>${notations.join('')}</notations>`);

  parts.push('</note>');
  return parts.join('');
}

function renderNoteSlot(
  slot: ScoreSlot,
  staffNumber: 1 | 2,
  voiceNumber: 1 | 2,
  key: Score['key'],
  slurNumber: number
): string {
  if (slot.type === 'rest') {
    return renderSingleNote(slot, staffNumber, voiceNumber, undefined, false, true, slurNumber, key);
  }
  return slot.pitches!
    .map((midi, i) => renderSingleNote(slot, staffNumber, voiceNumber, midi, i > 0, i === 0, slurNumber, key))
    .join('');
}

function renderDirection(dynamic: string, staffNumber: 1 | 2): string {
  return `<direction placement="${staffNumber === 1 ? 'below' : 'above'}"><direction-type><dynamics><${dynamic}/></dynamics></direction-type><staff>${staffNumber}</staff></direction>`;
}

function renderHarmony(chord: ChordSymbol, key: Score['key']): string {
  const root = midiToPitch(chord.root + 60, key);
  const rootAlter = root.alter !== 0 ? `<root-alter>${root.alter}</root-alter>` : '';
  return `<harmony><root><root-step>${root.step}</root-step>${rootAlter}</root><kind text="${chord.suffix}">${chord.mxmlKind}</kind></harmony>`;
}

/** Assigns a stable slur-pair number per staff so nested/adjacent slurs don't collide. */
function assignSlurNumbers(measure: Measure | undefined): Map<ScoreSlot, number> {
  const map = new Map<ScoreSlot, number>();
  if (!measure) return map;
  let openNumber: number | undefined;
  for (const slot of measure.slots) {
    if (slot.slurStart) {
      openNumber = (slurCounter % 6) + 1;
      slurCounter++;
      map.set(slot, openNumber);
    } else if (slot.slurEnd && openNumber !== undefined) {
      map.set(slot, openNumber);
      openNumber = undefined;
    } else if (openNumber !== undefined) {
      map.set(slot, openNumber);
    }
  }
  return map;
}

function renderMeasure(
  measureIndex: number,
  treble: Measure | undefined,
  bass: Measure | undefined,
  ticksPerMeasure: number,
  score: Score,
  isFirstMeasure: boolean
): string {
  const parts: string[] = [`<measure number="${measureIndex + 1}">`];

  if (isFirstMeasure) {
    parts.push(
      '<attributes>',
      `<divisions>${TICKS_PER_QUARTER}</divisions>`,
      `<key><fifths>${score.key.fifths}</fifths><mode>${score.key.mode}</mode></key>`,
      `<time><beats>${score.timeSignature.numerator}</beats><beat-type>${score.timeSignature.denominator}</beat-type></time>`,
      '<staves>2</staves>',
      '<clef number="1"><sign>G</sign><line>2</line></clef>',
      '<clef number="2"><sign>F</sign><line>4</line></clef>',
      '</attributes>',
      `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${score.tempoBpm}</per-minute></metronome></direction-type><sound tempo="${score.tempoBpm}"/></direction>`
    );
  }

  const trebleSlurs = assignSlurNumbers(treble);
  const bassSlurs = assignSlurNumbers(bass);

  const trebleSlots = treble?.slots ?? [{ type: 'rest', startTick: 0, durationTicks: ticksPerMeasure, duration: 'w', dots: 0 } as ScoreSlot];
  const bassSlots = bass?.slots ?? [{ type: 'rest', startTick: 0, durationTicks: ticksPerMeasure, duration: 'w', dots: 0 } as ScoreSlot];

  for (const chord of score.chords) {
    if (chord.measureIndex === measureIndex) parts.push(renderHarmony(chord, score.key));
  }

  for (const slot of trebleSlots) {
    if (slot.dynamic) parts.push(renderDirection(slot.dynamic, 1));
    parts.push(renderNoteSlot(slot, 1, 1, score.key, trebleSlurs.get(slot) ?? 1));
  }

  parts.push(`<backup><duration>${ticksPerMeasure}</duration></backup>`);

  for (const slot of bassSlots) {
    if (slot.dynamic) parts.push(renderDirection(slot.dynamic, 2));
    parts.push(renderNoteSlot(slot, 2, 2, score.key, bassSlurs.get(slot) ?? 1));
  }

  parts.push('</measure>');
  return parts.join('');
}

/** Serializes a Score into a MusicXML document string for a two-staff (grand staff) piano part. */
export function scoreToMusicXml(score: Score): string {
  slurCounter = 0;
  const totalMeasures = Math.max(score.treble.measures.length, score.bass.measures.length);
  const measures: string[] = [];
  for (let i = 0; i < totalMeasures; i++) {
    measures.push(
      renderMeasure(
        i,
        score.treble.measures[i],
        score.bass.measures[i],
        score.timeSignature.ticksPerMeasure,
        score,
        i === 0
      )
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Transcription</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${measures.join('')}</part>
</score-partwise>`;
}
