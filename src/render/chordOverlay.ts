import type { ChordSymbol, Score } from '../types';

// Chord symbols and dynamics markings are both plain <text class="vf-text">
// with no distinguishing class, so chord symbols are told apart by content:
// they always start with a note letter, while dynamics are lowercase p/f
// combinations and measure numbers carry their own "measure-number" class.
const CHORD_TEXT_PATTERN = /^[A-G]/;

interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function findChordTextElements(svg: SVGSVGElement): SVGTextElement[] {
  return [...svg.querySelectorAll('text')].filter((t) => {
    const parentClass = t.parentElement?.getAttribute('class') ?? '';
    return parentClass === 'vf-text' && CHORD_TEXT_PATTERN.test(t.textContent ?? '');
  }) as SVGTextElement[];
}

function svgTextToOverlayRect(text: SVGTextElement, relativeTo: HTMLElement): OverlayRect | undefined {
  const svg = text.ownerSVGElement;
  const ctm = text.getScreenCTM();
  if (!svg || !ctm) return undefined;

  const bbox = text.getBBox();
  const topLeft = svg.createSVGPoint();
  topLeft.x = bbox.x;
  topLeft.y = bbox.y;
  const bottomRight = svg.createSVGPoint();
  bottomRight.x = bbox.x + bbox.width;
  bottomRight.y = bbox.y + bbox.height;

  const p1 = topLeft.matrixTransform(ctm);
  const p2 = bottomRight.matrixTransform(ctm);
  const containerRect = relativeTo.getBoundingClientRect();

  return {
    left: p1.x - containerRect.left,
    top: p1.y - containerRect.top,
    width: p2.x - p1.x,
    height: p2.y - p1.y,
  };
}

function closeAllPopovers(root: HTMLElement): void {
  root.querySelectorAll('.chord-popover').forEach((el) => el.remove());
}

function openPopover(box: HTMLElement, chord: ChordSymbol, labelEl: HTMLElement, root: HTMLElement): void {
  closeAllPopovers(root);
  if (chord.alternatives.length === 0) return;

  const popover = document.createElement('div');
  popover.className = 'chord-popover';
  popover.style.left = box.style.left;
  popover.style.top = `${box.offsetTop + box.offsetHeight + 4}px`;

  for (const alt of chord.alternatives) {
    const altButton = document.createElement('button');
    altButton.type = 'button';
    altButton.className = 'chord-alt';
    altButton.textContent = alt.label;
    altButton.addEventListener('click', (e) => {
      e.stopPropagation();
      labelEl.textContent = alt.label;
      box.classList.add('picked');
      popover.remove();
    });
    popover.appendChild(altButton);
  }

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'chord-alt chord-alt-reset';
  resetButton.textContent = `Reset to ${chord.label}`;
  resetButton.addEventListener('click', (e) => {
    e.stopPropagation();
    labelEl.textContent = '';
    box.classList.remove('picked');
    popover.remove();
  });
  popover.appendChild(resetButton);

  root.appendChild(popover);
}

let outsideClickHandler: ((e: MouseEvent) => void) | undefined;

/**
 * Overlays a clickable box on each rendered chord symbol, offering
 * music-theory alternative chords as a relabel-only suggestion — picking one
 * only changes the displayed text, it never touches the underlying notes.
 */
export function renderChordOverlay(root: HTMLElement, score: Score): void {
  root.querySelectorAll('.chord-box, .chord-popover').forEach((el) => el.remove());
  if (score.chords.length === 0) return;

  const pages = [...root.querySelectorAll('svg')] as SVGSVGElement[];
  const matches: { text: SVGTextElement; rect: OverlayRect }[] = [];
  for (const svg of pages) {
    for (const text of findChordTextElements(svg)) {
      const rect = svgTextToOverlayRect(text, root);
      if (rect) matches.push({ text, rect });
    }
  }
  // Reading order: top-to-bottom by row, then left-to-right within a row.
  matches.sort((a, b) => (Math.abs(a.rect.top - b.rect.top) > 8 ? a.rect.top - b.rect.top : a.rect.left - b.rect.left));

  score.chords.forEach((chord, i) => {
    const match = matches[i];
    if (!match) return;
    const { rect } = match;

    const box = document.createElement('button');
    box.type = 'button';
    box.className = 'chord-box';
    box.style.left = `${rect.left - 4}px`;
    box.style.top = `${rect.top - 3}px`;
    box.style.width = `${rect.width + 8}px`;
    box.style.height = `${rect.height + 6}px`;
    box.title = `${chord.label} — click for alternative chords`;

    const labelEl = document.createElement('span');
    labelEl.className = 'chord-box-label';
    box.appendChild(labelEl);

    box.addEventListener('click', (e) => {
      e.stopPropagation();
      openPopover(box, chord, labelEl, root);
    });

    root.appendChild(box);
  });

  if (outsideClickHandler) document.removeEventListener('click', outsideClickHandler);
  outsideClickHandler = () => closeAllPopovers(root);
  document.addEventListener('click', outsideClickHandler);
}
