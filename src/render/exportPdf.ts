import { jsPDF } from 'jspdf';
import 'svg2pdf.js';

// Matches the 'A4_P' pageFormat OSMD is configured with in osmdRender.ts.
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Exports the currently rendered sheet music (one or more OSMD-rendered SVG
 * pages) to a downloadable PDF, one PDF page per sheet-music page, preserving
 * vector text/notation rather than rasterizing it.
 */
export async function exportScoreToPdf(root: HTMLElement, filename: string): Promise<void> {
  const pages = [...root.querySelectorAll('svg')] as SVGSVGElement[];
  if (pages.length === 0) throw new Error('No sheet music to export yet — analyze a recording first.');

  const pdf = new jsPDF('p', 'mm', 'a4');
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage('a4', 'p');
    await pdf.svg(pages[i], { x: 0, y: 0, width: A4_WIDTH_MM, height: A4_HEIGHT_MM });
  }
  pdf.save(filename);
}
