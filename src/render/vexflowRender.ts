import {
  Accidental,
  Articulation,
  Beam,
  Curve,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  Voice,
  type RenderContext,
} from 'vexflow';
import type { Measure, Score, ScoreSlot, StaffPart } from '../types';

const MEASURES_PER_SYSTEM = 4;
const MEASURE_WIDTH = 190;
const FIRST_MEASURE_EXTRA_WIDTH = 110;
const TIME_SIG_EXTRA_WIDTH = 40;
const LEFT_MARGIN = 10;
const TOP_MARGIN = 40;
const TREBLE_TO_BASS_GAP = 100;
const SYSTEM_GAP = 190;

/** A slot plus the StaveNote VexFlow built for it, so ties/slurs/dynamics can be wired up afterwards. */
interface RenderedSlot {
  slot: ScoreSlot;
  note: StaveNote;
}

function buildStaveNote(slot: ScoreSlot, clef: string): StaveNote {
  const note = new StaveNote({
    keys: slot.type === 'note' ? slot.keys! : ['b/4'],
    duration: slot.type === 'note' ? slot.duration : `${slot.duration}r`,
    dots: slot.dots,
    clef,
  });
  if (slot.dots > 0) Dot.buildAndAttach([note], { all: true });

  if (slot.type === 'note') {
    if (slot.articulations?.includes('staccato')) {
      note.addModifier(new Articulation('a.').setBetweenLines(false));
    }
    if (slot.articulations?.includes('accent')) {
      note.addModifier(new Articulation('a>'));
    }
  }
  return note;
}

function renderStaffMeasures(
  part: StaffPart,
  measureIndices: number[],
  staveXs: number[],
  staveWidths: number[],
  y: number,
  context: RenderContext,
  isVeryFirstSystem: boolean,
  keySpec: string,
  timeSpec: string,
  tempoBpm: number | undefined
): { staves: Stave[]; renderedSlots: RenderedSlot[] } {
  const staves: Stave[] = [];
  const renderedSlots: RenderedSlot[] = [];

  measureIndices.forEach((measureIndex, posInSystem) => {
    const measure: Measure | undefined = part.measures[measureIndex];
    const stave = new Stave(staveXs[posInSystem], y, staveWidths[posInSystem]);
    if (posInSystem === 0) {
      stave.addClef(part.clef);
      stave.addKeySignature(keySpec);
      if (isVeryFirstSystem) {
        stave.addTimeSignature(timeSpec);
        if (tempoBpm) stave.setTempo({ bpm: tempoBpm, duration: 'q' }, -25);
      }
    }
    stave.setContext(context).draw();
    staves.push(stave);

    if (!measure) return;

    const notes = measure.slots.map((slot) => buildStaveNote(slot, part.clef));
    measure.slots.forEach((slot, i) => renderedSlots.push({ slot, note: notes[i] }));

    const voice = new Voice({ numBeats: 1, beatValue: 4 }).setMode(Voice.Mode.SOFT);
    voice.addTickables(notes);
    Accidental.applyAccidentals([voice], keySpec);

    const noteAreaWidth = stave.getNoteEndX() - stave.getNoteStartX();
    new Formatter().joinVoices([voice]).format([voice], noteAreaWidth - 10);
    voice.draw(context, stave);

    if (notes.length > 1) {
      Beam.generateBeams(notes, { groups: Beam.getDefaultBeamGroups(timeSpec) }).forEach((beam) =>
        beam.setContext(context).draw()
      );
    }
  });

  return { staves, renderedSlots };
}

/** Draws ties between adjacent tied slots, and slurs across marked phrase groups. */
function drawTiesAndSlurs(renderedSlots: RenderedSlot[], context: RenderContext): void {
  for (let i = 1; i < renderedSlots.length; i++) {
    const prev = renderedSlots[i - 1];
    const curr = renderedSlots[i];
    if (curr.slot.tiedFromPrevious && prev.slot.type === 'note' && curr.slot.type === 'note') {
      const indexes = curr.note.getKeys().map((_, idx) => idx);
      new StaveTie({ firstNote: prev.note, lastNote: curr.note, firstIndexes: indexes, lastIndexes: indexes })
        .setContext(context)
        .draw();
    }
  }

  let slurFrom: RenderedSlot | undefined;
  for (const rendered of renderedSlots) {
    if (rendered.slot.slurStart) slurFrom = rendered;
    if (rendered.slot.slurEnd && slurFrom) {
      new Curve(slurFrom.note, rendered.note, {}).setContext(context).draw();
      slurFrom = undefined;
    }
  }
}

/**
 * Dynamics markings are drawn as plain italic text at each note's formatted x
 * position, rather than via VexFlow's TextDynamics (which requires being part
 * of a Voice's tick timeline to know its own position).
 */
function drawDynamics(renderedSlots: RenderedSlot[], context: RenderContext): void {
  for (const { slot, note } of renderedSlots) {
    if (!slot.dynamic) continue;
    const stave = note.getStave();
    if (!stave) continue;
    context.save();
    context.setFont('Georgia, serif', 15, 'bold', 'italic');
    context.fillText(slot.dynamic, note.getAbsoluteX() - 6, stave.getYForBottomText(1));
    context.restore();
  }
}

/** Renders a full grand-staff score into the given container element as SVG. */
export function renderScore(container: HTMLDivElement, score: Score): void {
  container.innerHTML = '';

  const totalMeasures = Math.max(score.treble.measures.length, score.bass.measures.length);
  const systemCount = Math.max(1, Math.ceil(totalMeasures / MEASURES_PER_SYSTEM));

  let maxSystemWidth = 0;
  const systemLayouts: { measureIndices: number[]; xs: number[]; widths: number[] }[] = [];
  for (let s = 0; s < systemCount; s++) {
    const start = s * MEASURES_PER_SYSTEM;
    const measureIndices = Array.from({ length: Math.min(MEASURES_PER_SYSTEM, totalMeasures - start) }, (_, i) => start + i);
    const xs: number[] = [];
    const widths: number[] = [];
    let x = LEFT_MARGIN;
    measureIndices.forEach((_, posInSystem) => {
      let width = MEASURE_WIDTH;
      if (posInSystem === 0) width += FIRST_MEASURE_EXTRA_WIDTH + (s === 0 ? TIME_SIG_EXTRA_WIDTH : 0);
      xs.push(x);
      widths.push(width);
      x += width;
    });
    systemLayouts.push({ measureIndices, xs, widths });
    maxSystemWidth = Math.max(maxSystemWidth, x + LEFT_MARGIN);
  }

  const totalHeight = TOP_MARGIN + systemCount * SYSTEM_GAP + 40;
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(Math.max(600, maxSystemWidth), totalHeight);
  const context = renderer.getContext();

  const keySpec = score.key.vexKey;
  const timeSpec = `${score.timeSignature.numerator}/${score.timeSignature.denominator}`;
  const allRenderedSlots: RenderedSlot[] = [];

  systemLayouts.forEach((layout, systemIndex) => {
    const trebleY = TOP_MARGIN + systemIndex * SYSTEM_GAP;
    const bassY = trebleY + TREBLE_TO_BASS_GAP;

    const trebleResult = renderStaffMeasures(
      score.treble,
      layout.measureIndices,
      layout.xs,
      layout.widths,
      trebleY,
      context,
      systemIndex === 0,
      keySpec,
      timeSpec,
      systemIndex === 0 ? score.tempoBpm : undefined
    );
    const bassResult = renderStaffMeasures(
      score.bass,
      layout.measureIndices,
      layout.xs,
      layout.widths,
      bassY,
      context,
      systemIndex === 0,
      keySpec,
      timeSpec,
      undefined
    );

    const firstTreble = trebleResult.staves[0];
    const firstBass = bassResult.staves[0];
    if (firstTreble && firstBass) {
      new StaveConnector(firstTreble, firstBass).setType('brace').setContext(context).draw();
      new StaveConnector(firstTreble, firstBass).setType('singleLeft').setContext(context).draw();
    }
    const lastTreble = trebleResult.staves[trebleResult.staves.length - 1];
    const lastBass = bassResult.staves[bassResult.staves.length - 1];
    if (lastTreble && lastBass) {
      new StaveConnector(lastTreble, lastBass).setType('singleRight').setContext(context).draw();
    }

    allRenderedSlots.push(...trebleResult.renderedSlots, ...bassResult.renderedSlots);
  });

  drawTiesAndSlurs(allRenderedSlots, context);
  drawDynamics(allRenderedSlots, context);
}
