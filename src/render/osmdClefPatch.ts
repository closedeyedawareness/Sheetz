import { ClefInstruction, ClefEnum } from 'opensheetmusicdisplay';

/**
 * Defensive patch for an OpenSheetMusicDisplay 2.0.0 crash seen only on some
 * mobile browsers (confirmed on Chrome 150 / Android 10, 8 GB RAM, fonts loaded
 * — so not a memory or font problem):
 *
 * OSMD builds a ClefInstruction with an out-of-range `clefType` through an
 * internal code path, and `ClefInstruction.calcParameters()` — the sole place
 * in OSMD that throws `ArgumentOutOfRangeException("clefType")` — aborts the
 * entire engraving. This happens even though the score's own clefs are valid:
 * the rejected MusicXML contains exactly two standard clefs (treble G/line-2,
 * bass F/line-4) and engraves cleanly on desktop Chrome. So one spurious,
 * internally-constructed clef kills an otherwise-fine render.
 *
 * We can't reproduce the browser-specific path to fix its origin, but the throw
 * site is unambiguous. We wrap calcParameters so an unrecognised clefType is
 * coerced to treble (G) instead of throwing. The real clefs are read and set
 * separately and keep their correct types, so this only rescues the spurious
 * one and lets the staff render.
 */
const SUPPORTED = new Set<number>([ClefEnum.G, ClefEnum.F, ClefEnum.C, ClefEnum.percussion, ClefEnum.TAB]);

interface ClefLike {
  clefType: number;
  calcParameters(): void;
}
type Patchable = { __sheetzClefGuard?: boolean };

const proto = ClefInstruction.prototype as unknown as ClefLike & Patchable;
const original = proto.calcParameters as ((this: ClefLike) => void) & Patchable;

if (!original.__sheetzClefGuard) {
  let warned = false;
  const guarded = function (this: ClefLike): void {
    if (!SUPPORTED.has(this.clefType)) {
      if (!warned) {
        warned = true;
        // Capture the construction call stack the OSMD exception itself lacked,
        // so the origin stays diagnosable from the console if we ever need it.
        console.warn(`[sheetz] coerced invalid OSMD clefType (${String(this.clefType)}) to treble`, new Error().stack);
      }
      this.clefType = ClefEnum.G;
    }
    original.call(this);
  } as ((this: ClefLike) => void) & Patchable;
  guarded.__sheetzClefGuard = true;
  proto.calcParameters = guarded;
}
