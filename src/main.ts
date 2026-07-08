import './style.css';
import { decodeAudioFile } from './audio/decode';
import { transcribeAudio } from './audio/transcribe';
import { connectMidi, type MidiSession } from './midi/webMidi';
import { renderScore } from './render/osmdRender';
import { buildScore, makeTimeSignature } from './theory/buildScore';
import { generateChordProgression } from './theory/progressionGenerator';
import type { NoteEvent, Score } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
<header>
  <p class="eyebrow">✦ AI-assisted transcription</p>
  <img class="brand-logo" src="/logo.png" alt="Sheetz" width="220" height="220" />
  <p class="tagline">A pianist's dream</p>
  <p class="subtitle">Upload a solo piano recording and get notated grand-staff sheet music, or play a connected MIDI keyboard live.</p>
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
    <div>Drop a .wav or .mp3 file here, or click to choose one</div>
    <div class="hint">Best results with solo piano recordings. Processing happens entirely in your browser.</div>
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
  <h2>3. Generate chord progressions</h2>
  <p style="opacity: 0.8; font-size: 14px; margin-bottom: 16px;">Composer's aid: generates a line of professional jazz chords (Cm7 – Fm7 – Bb7 – Ebmaj9 style) in a random key. Click to get fresh ideas.</p>
  <div class="controls-row">
    <button class="primary" id="generateButton">✨ Generate progression</button>
  </div>
  <div id="generatedProgression" class="generated-chord-output" hidden>
    <div class="progression-line" id="progressionLine"></div>
    <div class="progression-meta" id="progressionMeta"></div>
  </div>
</section>

<section class="panel" id="scoreSection" hidden>
  <h2>Sheet music</h2>
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
const midiButton = document.querySelector<HTMLButtonElement>('#midiButton')!;
const midiStatus = document.querySelector<HTMLDivElement>('#midiStatus')!;
const generateButton = document.querySelector<HTMLButtonElement>('#generateButton')!;
const generatedProgression = document.querySelector<HTMLDivElement>('#generatedProgression')!;
const progressionLine = document.querySelector<HTMLDivElement>('#progressionLine')!;
const progressionMeta = document.querySelector<HTMLDivElement>('#progressionMeta')!;

let selectedFile: File | undefined;
let midiSession: MidiSession | undefined;

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

// OSMD isn't safe to invoke concurrently, so overlapping showScore() calls
// (e.g. rapid MIDI note releases) are chained rather than run in parallel.
let renderLock: Promise<void> = Promise.resolve();

function showScore(score: Score): Promise<void> {
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

analyzeButton.addEventListener('click', async () => {
  if (!selectedFile) return;
  analyzeButton.disabled = true;
  progressBar.hidden = false;
  progressFill.style.width = '0%';

  try {
    setStatus('Decoding audio…', 'info');
    const audioBuffer = await decodeAudioFile(selectedFile);

    setStatus('Running pitch detection (this can take a little while for longer recordings)…', 'info');
    const notes: NoteEvent[] = await transcribeAudio(audioBuffer, (fraction) => {
      progressFill.style.width = `${Math.round(fraction * 100)}%`;
    });

    if (notes.length === 0) {
      setStatus('No notes were detected in this recording. Try a clearer solo piano take.', 'error');
      return;
    }

    const tempoOverride = tempoInput.value ? Number(tempoInput.value) : undefined;
    const score = buildScore(notes, {
      tempoBpm: tempoOverride,
      timeSignature: currentTimeSignature(),
      ...currentSongMeta(),
    });
    await showScore(score);
    setStatus(`Detected ${notes.length} notes.`, 'info');
  } catch (err) {
    console.error(err);
    setStatus(err instanceof Error ? err.message : 'Something went wrong analyzing this file.', 'error');
  } finally {
    analyzeButton.disabled = false;
    progressBar.hidden = true;
  }
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

generateButton.addEventListener('click', () => {
  const progression = generateChordProgression();
  progressionLine.textContent = progression.line;
  progressionMeta.textContent = `Key: ${progression.key} (${progression.mode})`;
  generatedProgression.hidden = false;
});
