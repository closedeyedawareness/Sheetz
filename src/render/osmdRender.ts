import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { Score } from '../types';
import { renderChordOverlay } from './chordOverlay';
import { scoreToMusicXml } from './musicXml';

// Above this many measures we engrave the score in chunks rather than handing
// OSMD the whole thing at once (see renderScore). Small scores render as one
// piece so they keep a single clef/time signature and no seams.
const CHUNK_THRESHOLD = 48;
const CHUNK_SIZE = 16;

/**
 * Engraves one MusicXML document into `container` with OpenSheetMusicDisplay.
 * Tries the A4 paged layout first; if OSMD's engraver throws, retries once in
 * Endless (single-strip) mode. Throws only if both layouts fail.
 */
async function engrave(
  container: HTMLElement,
  musicXml: string,
  opts: { drawTitle: boolean; drawComposer: boolean }
): Promise<void> {
  const base = { backend: 'svg' as const, autoResize: false, drawPartNames: false, ...opts };
  let lastErr: unknown;
  for (const pageFormat of ['A4_P', 'Endless']) {
    container.innerHTML = '';
    const osmd = new OpenSheetMusicDisplay(container, { ...base, pageFormat });
    try {
      await osmd.load(musicXml);
      osmd.render();
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`OSMD render failed in "${pageFormat}" mode:`, err instanceof Error ? err.message : err);
    }
  }
  throw lastErr;
}

/**
 * Renders a Score by serializing it to MusicXML and letting OpenSheetMusicDisplay
 * (a mature open-source engraving library) handle layout: measure spacing, line
 * breaks, and tie/slur routing, rather than hand-computing note positions.
 *
 * Large grand-staff scores (a 3-minute piano piece can be ~200 measures) can
 * throw an internal "clefType" ArgumentOutOfRangeException deep in OSMD's layout
 * on memory/canvas-limited browsers — reproducibly on some phones — even though
 * the MusicXML is valid and engraves fine on desktop. To sidestep it we engrave
 * such scores in measure chunks: each chunk is a self-contained MusicXML score
 * (its first measure restates the clef/key/time) rendered by its own short-lived
 * OSMD instance into its own SVG, so no single layout pass has to hold the whole
 * piece and peak memory stays low. The chord overlay scans every chunk's SVG
 * together afterwards, so it's unaffected by the split.
 */
export async function renderScore(container: HTMLDivElement, score: Score): Promise<void> {
  container.innerHTML = '';
  const total = Math.max(score.treble.measures.length, score.bass.measures.length);
  const hasTitle = Boolean(score.title?.trim());
  const hasComposer = Boolean(score.artist?.trim());

  if (total <= CHUNK_THRESHOLD) {
    try {
      await engrave(container, scoreToMusicXml(score), { drawTitle: hasTitle, drawComposer: hasComposer });
    } catch (err) {
      console.error('OSMD failed to render this score. MusicXML that triggered it:\n', scoreToMusicXml(score), '\nScore:', score, '\nError:', err);
      throw err;
    }
    renderChordOverlay(container, score);
    return;
  }

  for (let start = 0, idx = 0; start < total; start += CHUNK_SIZE, idx++) {
    const end = Math.min(start + CHUNK_SIZE, total);
    const chunkEl = document.createElement('div');
    chunkEl.className = 'osmd-chunk';
    container.appendChild(chunkEl);
    const chunkXml = scoreToMusicXml(score, { start, end });
    try {
      // Only the first chunk shows the title/composer, so they don't repeat down the page.
      await engrave(chunkEl, chunkXml, { drawTitle: idx === 0 && hasTitle, drawComposer: idx === 0 && hasComposer });
    } catch (err) {
      console.error(`OSMD failed to engrave measures ${start + 1}-${end} of ${total}. MusicXML that triggered it:\n`, chunkXml, '\nError:', err);
      throw err;
    }
  }
  renderChordOverlay(container, score);
}
