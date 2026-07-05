import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { Score } from '../types';
import { scoreToMusicXml } from './musicXml';

/**
 * Renders a Score by serializing it to MusicXML and letting OpenSheetMusicDisplay
 * (a mature open-source engraving library) handle layout: measure spacing, line
 * breaks, and tie/slur routing, rather than hand-computing note positions.
 */
export async function renderScore(container: HTMLDivElement, score: Score): Promise<void> {
  container.innerHTML = '';
  const osmd = new OpenSheetMusicDisplay(container, {
    backend: 'svg',
    autoResize: false,
    drawTitle: false,
    drawComposer: false,
    drawPartNames: false,
  });
  await osmd.load(scoreToMusicXml(score));
  osmd.render();
}
