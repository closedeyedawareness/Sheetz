import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { Score } from '../types';
import { renderChordOverlay } from './chordOverlay';
import { scoreToMusicXml } from './musicXml';

/**
 * Renders a Score by serializing it to MusicXML and letting OpenSheetMusicDisplay
 * (a mature open-source engraving library) handle layout: measure spacing, line
 * breaks, and tie/slur routing, rather than hand-computing note positions.
 */
export async function renderScore(container: HTMLDivElement, score: Score): Promise<void> {
  const musicXml = scoreToMusicXml(score);
  const base = {
    backend: 'svg' as const,
    autoResize: false,
    drawTitle: Boolean(score.title?.trim()),
    drawComposer: Boolean(score.artist?.trim()),
    drawPartNames: false,
  };
  // Try the paged (A4) layout first. If OSMD's engraver throws — most often its
  // internal "clefType" ArgumentOutOfRangeException, which we've only ever seen
  // on very large scores in some mobile browsers *even though the MusicXML is
  // valid and engraves fine elsewhere* — retry once in Endless (single-strip)
  // mode, whose layout path avoids the page/system-break clef handling that
  // appears to trip it. Only if BOTH fail do we surface the error so the caller
  // shows the text fallback.
  const layouts = [
    { pageFormat: 'A4_P', label: 'A4 pages' },
    { pageFormat: 'Endless', label: 'endless (fallback)' },
  ];
  let lastErr: unknown;
  for (const layout of layouts) {
    container.innerHTML = '';
    const osmd = new OpenSheetMusicDisplay(container, { ...base, pageFormat: layout.pageFormat });
    try {
      await osmd.load(musicXml);
      osmd.render();
      renderChordOverlay(container, score);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`OSMD render failed in "${layout.label}" mode:`, err instanceof Error ? err.message : err);
    }
  }
  container.innerHTML = '';
  // Both layouts failed — dump the exact MusicXML so the case stays diagnosable,
  // then rethrow for the text fallback.
  console.error('OSMD failed to render this score in every layout. MusicXML that triggered it:\n', musicXml, '\nScore:', score, '\nError:', lastErr);
  throw lastErr;
}
