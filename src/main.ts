import './style.css';
import { decodeAudioFile } from './audio/decode';
import { startLiveListen, type LiveListenSession } from './audio/liveListen';
import { transcribeAudio } from './audio/transcribe';
import { connectMidi, type MidiSession } from './midi/webMidi';
import { exportScoreToPdf } from './render/exportPdf';
import { renderScore } from './render/osmdRender';
import { buildScore, makeTimeSignature } from './theory/buildScore';
import { midiToPitch } from './theory/pitchSpelling';
import { generateChordProgression, generateStructuredProgression } from './theory/progressionGenerator';
import type { Measure, NoteEvent, Score } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
<header>
  <p class="eyebrow">✦ AI-assisted transcription</p>
  <img class="brand-logo" src="/logo.png" alt="Sheetz" width="220" height="220" />
  <p class="tagline">A pianist's dream</p>
  <p class="subtitle">Upload a solo piano recording and get notated grand-staff sheet music, play a connected MIDI keyboard live, or listen through your microphone.</p>
</header>

<section class="panel">
  <h2>Song details</h2>
  <div class="controls-row">
    <label>
      Song title
      <input type="text" id="titleInput" placeholder="Untitled" />
    </label>
    <label>
      Artist
      <input type="text" id="artistInput" placeholder="Unknown" />
    </label>
  </div>
</section>

<section class="panel">
  <h2>1. Import audio</h2>
  <label class="dropzone" id="dropzone">
    <input type="file" id="fileInput" accept=".wav,.mp3,.ogg,.flac,audio/*" />
    <span class="dropzone-cta">Choose audio file</span>
    <div class="hint">or drag and drop a .wav or .mp3 here — best results with solo piano recordings, processed entirely in your browser.</div>
  </label>

  <div class="controls-row">
    <label>
      Time signature
      <select id="timeSigSelect">
        <option value="" selected>Auto-detect</option>
        <option value="4/4">4/4</option>
        <option value="3/4">3/4</option>
        <option value="2/4">2/4</option>
        <option value="6/8">6/8</option>
      </select>
    </label>
    <label>
      Tempo override (BPM)
      <input type="number" id="tempoInput" min="30" max="300" placeholder="auto" />
    </label>
    <button class="primary" id="analyzeButton" disabled>Analyze</button>
  </div>

  <div id="status" class="status"></div>
  <div class="progress-bar" id="progressBar" hidden><div id="progressFill" style="width:0%"></div></div>
</section>

<section class="panel">
  <h2>2. Or play live via MIDI</h2>
  <button class="secondary" id="midiButton">Connect MIDI keyboard</button>
  <div class="midi-status" id="midiStatus"></div>
</section>

<section class="panel">
  <h2>3. Or listen live via microphone</h2>
  <p style="opacity: 0.8; font-size: 14px; margin-bottom: 16px;">
    Play into your device's mic and watch the key and chord update as you go. When you stop, the full take is
    transcribed into notation just like an uploaded file.
  </p>
  <button class="secondary" id="liveListenButton">Start listening</button>
  <div class="midi-status" id="liveListenStatus"></div>
  <div class="live-listen-display" id="liveListenDisplay" hidden>
    <div class="live-chord" id="liveChordText">—</div>
    <div class="live-meta">
      <span id="liveKeyText"></span> <span aria-hidden="true">·</span> <span id="liveTimeText">0:00</span>
    </div>
  </div>
</section>

<section class="panel">
  <h2>4. Generate chord progressions</h2>
  <p style="opacity: 0.8; font-size: 14px; margin-bottom: 16px;">Composer's aid: generates professional jazz chords in a random key. Click to get fresh ideas.</p>
  <div class="controls-row">
    <button class="primary" id="generateButton">✨ One-line progression</button>
    <button class="primary" id="generateStructuredButton">🎵 Full song structure</button>
  </div>

  <div id="generatedProgression" class="generated-chord-output" hidden>
    <div class="progression-line" id="progressionLine"></div>
    <div class="progression-meta" id="progressionMeta"></div>
  </div>

  <div id="generatedStructured" class="generated-structured-output" hidden>
    <div class="progression-meta" id="structuredMeta"></div>
    <div class="song-section">
      <div class="section-label">Intro</div>
      <div class="progression-line" id="introLine"></div>
    </div>
    <div class="song-section">
      <div class="section-label">Transition</div>
      <div class="progression-line" id="transitionLine"></div>
    </div>
    <div class="song-section">
      <div class="section-label">Ending</div>
      <div class="progression-line" id="endingLine"></div>
    </div>
  </div>
</section>

<section class="panel" id="scoreSection" hidden>
  <div class="score-header">
    <h2>Sheet music</h2>
    <button class="secondary" id="downloadPdfButton">Download PDF</button>
  </div>
  <div class="score-meta" id="scoreMeta"></div>
  <p class="scroll-hint">↔ Scroll sideways to read across each line</p>
  <div id="scoreContainer"><div id="scoreInner"></div></div>
  <p class="limitations">
    Automated transcription is approximate: hand-splitting uses a fixed middle-C threshold, rhythm is snapped to a
    sixteenth-note grid at a single estimated tempo, and dynamics/articulation/slurs are heuristic guesses from note
    loudness and timing. Treat this as a first draft to refine by ear, not a publishable engraving.
  </p>
</section>
`;

const dropzone = document.querySelector<HTMLLabelElement>('#dropzone')!;
const fileInput = document.querySelector<HTMLInputElement>('#fileInput')!;
const analyzeButton = document.querySelector<HTMLButtonElement>('#analyzeButton')!;
const timeSigSelect = document.querySelector<HTMLSelectElement>('#timeSigSelect')!;
const tempoInput = document.querySelector<HTMLInputElement>('#tempoInput')!;
const titleInput = document.querySelector<HTMLInputElement>('#titleInput')!;
const artistInput = document.querySelector<HTMLInputElement>('#artistInput')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const progressBar = document.querySelector<HTMLDivElement>('#progressBar')!;
const progressFill = document.querySelector<HTMLDivElement>('#progressFill')!;
const scoreSection = document.querySelector<HTMLElement>('#scoreSection')!;
const scoreMeta = document.querySelector<HTMLDivElement>('#scoreMeta')!;
const scoreInner = document.querySelector<HTMLDivElement>('#scoreInner')!;
const downloadPdfButton = document.querySelector<HTMLButtonElement>('#downloadPdfButton')!;
const midiButton = document.querySelector<HTMLButtonElement>('#midiButton')!;
const midiStatus = document.querySelector<HTMLDivElement>('#midiStatus')!;
const liveListenButton = document.querySelector<HTMLButtonElement>('#liveListenButton')!;
const liveListenStatus = document.querySelector<HTMLDivElement>('#liveListenStatus')!;
const liveListenDisplay = document.querySelector<HTMLDivElement>('#liveListenDisplay')!;
const liveChordText = document.querySelector<HTMLDivElement>('#liveChordText')!;
const liveKeyText = document.querySelector<HTMLSpanElement>('#liveKeyText')!;
const liveTimeText = document.querySelector<HTMLSpanElement>('#liveTimeText')!;
const generateButton = document.querySelector<HTMLButtonElement>('#generateButton')!;
const generateStructuredButton = document.querySelector<HTMLButtonElement>('#generateStructuredButton')!;
const generatedProgression = document.querySelector<HTMLDivElement>('#generatedProgression')!;
const progressionLine = document.querySelector<HTMLDivElement>('#progressionLine')!;
const progressionMeta = document.querySelector<HTMLDivElement>('#progressionMeta')!;
const generatedStructured = document.querySelector<HTMLDivElement>('#generatedStructured')!;
const structuredMeta = document.querySelector<HTMLDivElement>('#structuredMeta')!;
const introLine = document.querySelector<HTMLDivElement>('#introLine')!;
const transitionLine = document.querySelector<HTMLDivElement>('#transitionLine')!;
const endingLine = document.querySelector<HTMLDivElement>('#endingLine')!;

let selectedFile: File | undefined;
let midiSession: MidiSession | undefined;
let liveListenSession: LiveListenSession | undefined;

function formatElapsed(totalSeconds: number): string {
  const whole = Math.floor(totalSeconds);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function setStatus(message: string, kind: 'info' | 'error' | '' = ''): void {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
}

function currentTimeSignature() {
  if (!timeSigSelect.value) return undefined;
  const [num, den] = timeSigSelect.value.split('/').map(Number);
  return makeTimeSignature(num, den);
}

function currentSongMeta() {
  return { title: titleInput.value.trim() || undefined, artist: artistInput.value.trim() || undefined };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function describeScore(score: Score): string {
  const keyName = `${score.key.name}${score.key.mode === 'major' ? ' major' : ' minor'}`;
  const heading = [score.title, score.artist]
    .filter((s): s is string => Boolean(s))
    .map(escapeHtml)
    .join(' — ');
  return `
    ${heading ? `<div class="score-heading">${heading}</div>` : ''}
    <div><b>Tempo</b> ~${score.tempoBpm} BPM</div>
    <div><b>Key</b> ${keyName}</div>
    <div><b>Time</b> ${score.timeSignature.numerator}/${score.timeSignature.denominator}</div>
    <div><b>Measures</b> ${score.treble.measures.length}</div>
  `;
}

/** MIDI → display note name, e.g. 61 → "C#4", spelled to match the score's key. */
function noteName(midi: number, key: Score['key']): string {
  const p = midiToPitch(midi, key);
  const accidental = p.alter > 0 ? '#'.repeat(p.alter) : p.alter < 0 ? 'b'.repeat(-p.alter) : '';
  return `${p.step}${accidental}${p.octave}`;
}

/** One staff's measures rendered as readable text: "1: C4+E4+G4 · rest · D4". */
function staffToText(measures: Measure[], key: Score['key']): string {
  return measures
    .map((measure, i) => {
      const cells = measure.slots.map((slot) =>
        slot.type === 'rest' || !slot.pitches?.length
          ? 'rest'
          : slot.pitches.map((m) => noteName(m, key)).join('+')
      );
      return `<div class="fb-measure"><span class="fb-measure-num">${i + 1}</span>${escapeHtml(
        cells.join(' · ')
      )}</div>`;
    })
    .join('');
}

/**
 * Fallback when OSMD can't engrave the staff (e.g. its clefType crash): the notes
 * were detected fine, so still show them as text per hand rather than losing the
 * whole result to an error message.
 */
function showScoreFallback(score: Score): void {
  scoreSection.hidden = false;
  scoreMeta.innerHTML = describeScore(score);
  timeSigSelect.value = `${score.timeSignature.numerator}/${score.timeSignature.denominator}`;
  scoreInner.innerHTML = `
    <div class="fallback-notes">
      <p class="fallback-warning">⚠ Couldn't engrave the staff for this take, so here are the detected notes as text (chords joined with +).</p>
      <div class="fb-staff"><h4>Treble (right hand)</h4>${staffToText(score.treble.measures, score.key)}</div>
      <div class="fb-staff"><h4>Bass (left hand)</h4>${staffToText(score.bass.measures, score.key)}</div>
    </div>
  `;
}

function pdfFilename(score: Score): string {
  const base = [score.title, score.artist].filter((s): s is string => Boolean(s)).join(' - ') || 'sheet-music';
  return `${base.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
}

// OSMD isn't safe to invoke concurrently, so overlapping showScore() calls
// (e.g. rapid MIDI note releases) are chained rather than run in parallel.
let renderLock: Promise<void> = Promise.resolve();
let lastScore: Score | undefined;

function showScore(score: Score): Promise<void> {
  lastScore = score;
  scoreSection.hidden = false;
  scoreMeta.innerHTML = describeScore(score);
  // Reflects whatever meter was actually used (including auto-detected) back into the
  // dropdown, so the user can see what was picked and override it for a re-analysis.
  timeSigSelect.value = `${score.timeSignature.numerator}/${score.timeSignature.denominator}`;
  const run = renderLock.catch(() => undefined).then(() => renderScore(scoreInner, score));
  renderLock = run.catch(() => undefined);
  return run;
}

function pickFile(file: File): void {
  selectedFile = file;
  analyzeButton.disabled = false;
  setStatus(`Ready to analyze "${file.name}".`, 'info');
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) pickFile(file);
});
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) pickFile(file);
});

/**
 * Shared by file-upload analysis and live-mic recordings: decodes, runs
 * basic-pitch, and renders a score, or reports why nothing came out.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || String(err);
  // Non-Error throws (raw objects/strings from a third-party lib) stringify to
  // an unhelpful "[object Object]" by default — try to pull a readable message
  // out of common shapes before falling back to that.
  if (err && typeof err === 'object') {
    const withMessage = err as { message?: unknown; name?: unknown };
    if (typeof withMessage.message === 'string' && withMessage.message) {
      return typeof withMessage.name === 'string' && withMessage.name
        ? `${withMessage.name}: ${withMessage.message}`
        : withMessage.message;
    }
    try {
      const dumped = JSON.stringify(err, Object.getOwnPropertyNames(err));
      if (dumped && dumped !== '{}') return dumped;
    } catch {
      // circular or unserializable; fall through to String(err) below.
    }
  }
  return String(err);
}

async function transcribeAndShow(source: Blob, notFoundMessage: string): Promise<void> {
  progressBar.hidden = false;
  progressFill.style.width = '0%';

  let audioBuffer;
  try {
    setStatus('Decoding audio…', 'info');
    audioBuffer = await decodeAudioFile(source);
  } catch (err) {
    console.error('decodeAudioFile failed', err);
    setStatus(`Could not decode that recording (${describeError(err)}).`, 'error');
    progressBar.hidden = true;
    return;
  }

  let notes: NoteEvent[];
  try {
    setStatus('Running pitch detection (this can take a little while for longer recordings)…', 'info');
    notes = await transcribeAudio(audioBuffer, (fraction) => {
      progressFill.style.width = `${Math.round(fraction * 100)}%`;
    });
  } catch (err) {
    console.error('pitch detection failed', err);
    setStatus(`Pitch detection failed (${describeError(err)}).`, 'error');
    progressBar.hidden = true;
    return;
  }

  if (notes.length === 0) {
    setStatus(notFoundMessage, 'error');
    progressBar.hidden = true;
    return;
  }

  // Pitch detection succeeded past this point. Building/rendering the score is a
  // separate failure domain — don't report an engraving error as "Pitch detection
  // failed", which sent people chasing the wrong problem (and hid that the notes
  // were actually detected fine).
  const tempoOverride = tempoInput.value ? Number(tempoInput.value) : undefined;
  let score: Score;
  try {
    score = buildScore(notes, {
      tempoBpm: tempoOverride,
      timeSignature: currentTimeSignature(),
      ...currentSongMeta(),
    });
  } catch (err) {
    console.error('building the score failed', err);
    setStatus(`Detected ${notes.length} notes, but couldn't build the score (${describeError(err)}).`, 'error');
    progressBar.hidden = true;
    return;
  }

  try {
    await showScore(score);
    setStatus(`Detected ${notes.length} notes.`, 'info');
  } catch (err) {
    // The score is valid; only the engraving (OSMD) failed. Keep the result usable
    // by showing the notes as text instead of discarding everything into an error.
    console.error('rendering the sheet music failed; showing text fallback', err);
    showScoreFallback(score);
    setStatus(
      `Detected ${notes.length} notes, but couldn't engrave the staff (${describeError(err)}) — ` +
        'showing the notes as text below. Details were logged to the browser console.',
      'error'
    );
  } finally {
    progressBar.hidden = true;
  }
}

analyzeButton.addEventListener('click', async () => {
  if (!selectedFile) return;
  analyzeButton.disabled = true;
  await transcribeAndShow(selectedFile, 'No notes were detected in this recording. Try a clearer solo piano take.');
  analyzeButton.disabled = false;
});

midiButton.addEventListener('click', async () => {
  if (midiSession) {
    midiSession.disconnect();
    midiSession = undefined;
    midiButton.textContent = 'Connect MIDI keyboard';
    midiStatus.textContent = 'Disconnected.';
    return;
  }

  try {
    midiSession = await connectMidi((notes) => {
      if (notes.length === 0) return;
      const score = buildScore(notes, { timeSignature: currentTimeSignature(), ...currentSongMeta() });
      showScore(score).catch((err) => console.error(err));
    });
    midiButton.textContent = 'Disconnect MIDI keyboard';
    midiStatus.textContent =
      midiSession.deviceNames.length > 0
        ? `Listening on: ${midiSession.deviceNames.join(', ')}. Start playing — the score updates as you go.`
        : 'No MIDI input devices found. Plug one in and reconnect.';
  } catch (err) {
    console.error(err);
    midiStatus.textContent = err instanceof Error ? err.message : 'Could not connect to MIDI.';
  }
});

liveListenButton.addEventListener('click', async () => {
  if (liveListenSession) {
    const session = liveListenSession;
    liveListenSession = undefined;
    liveListenButton.disabled = true;
    liveListenButton.textContent = 'Transcribing…';
    liveListenDisplay.hidden = true;
    liveListenStatus.textContent = '';
    try {
      const recording = await session.stop();
      await transcribeAndShow(
        recording,
        'No notes were detected in that take. Try playing a bit louder or closer to the mic.'
      );
    } finally {
      liveListenButton.disabled = false;
      liveListenButton.textContent = 'Start listening';
    }
    return;
  }

  try {
    liveListenSession = await startLiveListen((update) => {
      liveListenDisplay.hidden = false;
      liveChordText.textContent = update.chordLabel ?? '—';
      liveKeyText.textContent = `${update.key.name}${update.key.mode === 'major' ? ' major' : ' minor'}`;
      liveTimeText.textContent = formatElapsed(update.elapsedSeconds);
    });
    liveListenButton.textContent = 'Stop & transcribe';
    liveListenStatus.textContent = liveListenSession.deviceLabel
      ? `Listening on: ${liveListenSession.deviceLabel}. Play — the chord and key update as you go.`
      : 'Listening — the chord and key update as you go.';
  } catch (err) {
    console.error(err);
    liveListenStatus.textContent = err instanceof Error ? err.message : 'Could not access the microphone.';
  }
});

generateButton.addEventListener('click', () => {
  const progression = generateChordProgression();
  progressionLine.textContent = progression.line;
  progressionMeta.textContent = `Key: ${progression.key} (${progression.mode})`;
  generatedProgression.hidden = false;
  generatedStructured.hidden = true;
});

generateStructuredButton.addEventListener('click', () => {
  const structured = generateStructuredProgression();
  introLine.textContent = structured.intro;
  transitionLine.textContent = structured.transition;
  endingLine.textContent = structured.ending;
  structuredMeta.textContent = `Key: ${structured.key} (${structured.mode})`;
  generatedStructured.hidden = false;
  generatedProgression.hidden = true;
});

downloadPdfButton.addEventListener('click', async () => {
  if (!lastScore) return;
  downloadPdfButton.disabled = true;
  const originalText = downloadPdfButton.textContent;
  downloadPdfButton.textContent = 'Generating PDF…';
  try {
    await exportScoreToPdf(scoreInner, pdfFilename(lastScore));
  } catch (err) {
    console.error(err);
    setStatus(err instanceof Error ? err.message : 'Could not generate the PDF.', 'error');
  } finally {
    downloadPdfButton.disabled = false;
    downloadPdfButton.textContent = originalText;
  }
});
