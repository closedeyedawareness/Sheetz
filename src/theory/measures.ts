import type { ClefName, Measure, QuantizedNote, ScoreSlot, StaffPart } from '../types';
import { amplitudeToDynamic } from './dynamics';
import { decomposeTicks } from './durations';

interface EventMarker {
  staccato?: boolean;
  accent?: boolean;
  dynamic?: string;
  slurStart?: boolean;
  slurEnd?: boolean;
}
interface ChordEvent {
  isRest: false;
  startTick: number;
  durationTicks: number;
  pitches: number[];
  amplitude: number;
  rawDurationSeconds: number;
  marker?: EventMarker;
}
interface RestEvent {
  isRest: true;
  startTick: number;
  durationTicks: number;
}
type TimelineEvent = ChordEvent | RestEvent;

const STACCATO_RATIO = 0.6;
const ACCENT_RATIO = 1.25;
const MIN_SLUR_GROUP_SIZE = 3;
// Long unbroken legato runs (real playing rarely has rests) are split into
// slurs of at most this many notes, rather than one arc across the whole piece.
const MAX_SLUR_GROUP_SIZE = 8;

function buildTimeline(
  notes: QuantizedNote[],
  secondsPerTick: number,
  ticksPerMeasure: number,
  minTotalTicks: number
): TimelineEvent[] {
  if (notes.length === 0) {
    return minTotalTicks > 0 ? [{ isRest: true, startTick: 0, durationTicks: minTotalTicks }] : [];
  }

  const byStart = new Map<number, QuantizedNote[]>();
  for (const note of notes) {
    const list = byStart.get(note.startTick);
    if (list) list.push(note);
    else byStart.set(note.startTick, [note]);
  }
  const chordStarts = [...byStart.keys()].sort((a, b) => a - b);

  const lastEnd = Math.max(...notes.map((n) => n.startTick + n.durationTicks), minTotalTicks);
  const totalTicks = Math.ceil(lastEnd / ticksPerMeasure) * ticksPerMeasure;

  const events: TimelineEvent[] = [];
  let cursor = 0;
  for (let i = 0; i < chordStarts.length; i++) {
    const startTick = chordStarts[i];
    const members = byStart.get(startTick)!;
    if (startTick > cursor) {
      events.push({ isRest: true, startTick: cursor, durationTicks: startTick - cursor });
    }
    const nextStart = i + 1 < chordStarts.length ? chordStarts[i + 1] : totalTicks;
    const maxDuration = Math.max(...members.map((m) => m.durationTicks));
    const durationTicks = Math.max(1, Math.min(maxDuration, nextStart - startTick));
    const avgAmplitude = members.reduce((s, m) => s + m.amplitude, 0) / members.length;
    const avgRawDuration = members.reduce((s, m) => s + m.rawDurationSeconds, 0) / members.length;
    events.push({
      isRest: false,
      startTick,
      durationTicks,
      pitches: [...new Set(members.map((m) => m.pitchMidi))].sort((a, b) => a - b),
      amplitude: avgAmplitude,
      rawDurationSeconds: avgRawDuration,
    });
    cursor = startTick + durationTicks;
  }
  if (cursor < totalTicks) {
    events.push({ isRest: true, startTick: cursor, durationTicks: totalTicks - cursor });
  }

  annotateArticulationsAndSlurs(events, secondsPerTick);
  return events;
}

/** Mutates chord events in place, attaching computed dynamic/articulation/slur markers. */
function annotateArticulationsAndSlurs(events: TimelineEvent[], secondsPerTick: number): void {
  let emaAmplitude: number | undefined;
  let lastDynamic: string | undefined;

  for (const event of events) {
    if (event.isRest) continue;
    const slotSeconds = event.durationTicks * secondsPerTick;
    const staccato = event.rawDurationSeconds < STACCATO_RATIO * slotSeconds;
    const accent = emaAmplitude !== undefined && event.amplitude > emaAmplitude * ACCENT_RATIO;
    emaAmplitude = emaAmplitude === undefined ? event.amplitude : emaAmplitude * 0.7 + event.amplitude * 0.3;

    const dynamic = amplitudeToDynamic(event.amplitude);
    const dynamicToShow = dynamic !== lastDynamic ? dynamic : undefined;
    if (dynamicToShow) lastDynamic = dynamic;

    event.marker = { staccato, accent, dynamic: dynamicToShow };
  }

  // Group consecutive chord events (no rest between them) into legato phrases.
  let groupStart = -1;
  const flushGroup = (endExclusive: number) => {
    if (groupStart !== -1 && endExclusive - groupStart >= MIN_SLUR_GROUP_SIZE) {
      const first = events[groupStart] as ChordEvent;
      const last = events[endExclusive - 1] as ChordEvent;
      first.marker!.slurStart = true;
      last.marker!.slurEnd = true;
    }
    groupStart = -1;
  };
  events.forEach((event, i) => {
    if (event.isRest) {
      flushGroup(i);
      return;
    }
    if (groupStart === -1) groupStart = i;
    else if (i - groupStart + 1 >= MAX_SLUR_GROUP_SIZE) {
      flushGroup(i + 1);
    }
  });
  flushGroup(events.length);
}

function splitAtMeasureBoundaries(
  startTick: number,
  durationTicks: number,
  ticksPerMeasure: number
): { start: number; ticks: number }[] {
  const segments: { start: number; ticks: number }[] = [];
  let remainingStart = startTick;
  let remaining = durationTicks;
  while (remaining > 0) {
    const posInMeasure = remainingStart % ticksPerMeasure;
    const roomInMeasure = ticksPerMeasure - posInMeasure;
    const take = Math.min(remaining, roomInMeasure);
    segments.push({ start: remainingStart, ticks: take });
    remainingStart += take;
    remaining -= take;
  }
  return segments;
}

function emitSlotsForEvent(event: TimelineEvent, ticksPerMeasure: number): ScoreSlot[] {
  const segments = splitAtMeasureBoundaries(event.startTick, event.durationTicks, ticksPerMeasure);
  const slots: ScoreSlot[] = [];
  const marker = event.isRest ? undefined : event.marker;

  segments.forEach((segment, segIndex) => {
    const parts = decomposeTicks(segment.ticks);
    parts.forEach((part, partIndex) => {
      const isFirstOverall = segIndex === 0 && partIndex === 0;
      const isLastOverall = segIndex === segments.length - 1 && partIndex === parts.length - 1;
      const slot: ScoreSlot = {
        type: event.isRest ? 'rest' : 'note',
        startTick: segment.start + parts.slice(0, partIndex).reduce((s, p) => s + p.ticks, 0),
        durationTicks: part.ticks,
        duration: part.duration,
        dots: part.dots,
      };
      if (!event.isRest) {
        slot.pitches = event.pitches;
        if (!isFirstOverall) slot.tiedFromPrevious = true;
        if (!isLastOverall) slot.tiedToNext = true;
        if (isFirstOverall && marker) {
          const articulations: ScoreSlot['articulations'] = [];
          if (marker.staccato) articulations.push('staccato');
          if (marker.accent) articulations.push('accent');
          if (articulations.length) slot.articulations = articulations;
          if (marker.dynamic) slot.dynamic = marker.dynamic;
          if (marker.slurStart) slot.slurStart = true;
        }
        if (isLastOverall && marker?.slurEnd) slot.slurEnd = true;
      }
      slots.push(slot);
    });
  });
  return slots;
}

export function buildStaffPart(
  notes: QuantizedNote[],
  clef: ClefName,
  ticksPerMeasure: number,
  secondsPerTick: number,
  minTotalTicks = 0
): StaffPart {
  const events = buildTimeline(notes, secondsPerTick, ticksPerMeasure, minTotalTicks);
  const measures: Measure[] = [];

  if (events.length === 0) {
    measures.push({ index: 0, slots: [{ type: 'rest', startTick: 0, durationTicks: ticksPerMeasure, duration: 'w', dots: 0 }] });
    return { clef, measures };
  }

  let currentMeasureIndex = -1;
  let currentSlots: ScoreSlot[] = [];
  const pushMeasure = () => {
    if (currentMeasureIndex >= 0) measures.push({ index: currentMeasureIndex, slots: currentSlots });
  };

  for (const event of events) {
    const slots = emitSlotsForEvent(event, ticksPerMeasure);
    for (const slot of slots) {
      const measureIndex = Math.floor(slot.startTick / ticksPerMeasure);
      if (measureIndex !== currentMeasureIndex) {
        pushMeasure();
        currentMeasureIndex = measureIndex;
        currentSlots = [];
      }
      currentSlots.push(slot);
    }
  }
  pushMeasure();

  return { clef, measures };
}
