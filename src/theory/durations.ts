/**
 * Rhythm resolution: 1 tick = one sixteenth note, so 4 ticks = one quarter note.
 * This is the smallest note value the transcriber will notate; faster or looser
 * playing gets snapped to this grid.
 */
export const TICKS_PER_QUARTER = 4;
export const TICKS_PER_WHOLE = TICKS_PER_QUARTER * 4;

export interface DurationPart {
  /** VexFlow base duration: 'w' | 'h' | 'q' | '8' | '16'. */
  duration: string;
  dots: 0 | 1;
  ticks: number;
}

/** Largest-to-smallest representable note lengths, in ticks, including single dots. */
const DURATION_TABLE: DurationPart[] = [
  { duration: 'w', dots: 0, ticks: 16 },
  { duration: 'h', dots: 1, ticks: 12 },
  { duration: 'h', dots: 0, ticks: 8 },
  { duration: 'q', dots: 1, ticks: 6 },
  { duration: 'q', dots: 0, ticks: 4 },
  { duration: '8', dots: 1, ticks: 3 },
  { duration: '8', dots: 0, ticks: 2 },
  { duration: '16', dots: 0, ticks: 1 },
];

/**
 * Greedily splits a tick length into the fewest standard note durations that sum
 * to it exactly. The caller is responsible for tying consecutive parts together
 * when there is more than one (for sounding notes) or leaving them untied (rests).
 */
export function decomposeTicks(totalTicks: number): DurationPart[] {
  let remaining = Math.round(totalTicks);
  const parts: DurationPart[] = [];
  while (remaining > 0) {
    const part = DURATION_TABLE.find((d) => d.ticks <= remaining);
    if (!part) break;
    parts.push(part);
    remaining -= part.ticks;
  }
  return parts;
}
