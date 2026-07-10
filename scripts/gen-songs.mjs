// Generates the built-in .mid songs (all public-domain compositions) into
// public/songs/. Run with: node scripts/gen-songs.mjs
// The game can also load any .mid the user uploads, so this is just a starter set.
import pkg from '@tonejs/midi';
const { Midi } = pkg;
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/songs');
mkdirSync(outDir, { recursive: true });

// Build a .mid from a [midiNote, beats] sequence at a given tempo.
function makeSong({ name, bpm, seq }) {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  midi.name = name;
  const track = midi.addTrack();
  track.name = name;
  const secPerBeat = 60 / bpm;
  let t = 0;
  for (const [note, beats] of seq) {
    if (note !== null) {
      track.addNote({ midi: note, time: t, duration: Math.max(0.08, beats * secPerBeat * 0.92) });
    }
    t += beats * secPerBeat;
  }
  return Buffer.from(midi.toArray());
}

// Build a .mid from explicit [midiNote, startBeat, durBeats] triples — allows
// overlapping notes (chords, two hands, sustained holds).
function makeSongExplicit({ name, bpm, notes }) {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  midi.name = name;
  const track = midi.addTrack();
  const spb = 60 / bpm;
  for (const [note, startBeat, durBeats] of notes) {
    track.addNote({ midi: note, time: startBeat * spb, duration: Math.max(0.08, durBeats * spb * 0.94) });
  }
  return Buffer.from(midi.toArray());
}

// --- BEGINNER: Twinkle Twinkle Little Star, C major ---
const twinkle = [
  [60,1],[60,1],[67,1],[67,1],[69,1],[69,1],[67,2],
  [65,1],[65,1],[64,1],[64,1],[62,1],[62,1],[60,2],
  [67,1],[67,1],[65,1],[65,1],[64,1],[64,1],[62,2],
  [67,1],[67,1],[65,1],[65,1],[64,1],[64,1],[62,2],
];

// --- TWO-HAND: Canon fragment (Pachelbel), D major — held LH chords + RH melody ---
const canonNotes = (() => {
  const roots = [50, 45, 47, 42, 43, 50, 43, 45];
  const rh = [78,76,74,73,71,69,71,73, 74,73,71,69,67,66,67,69, 71,69,67,66,64,62,64,66, 67,66,64,62,61,62,64,66];
  const notes = [];
  roots.forEach((r, i) => { notes.push([r, i * 2, 1.9]); notes.push([r + 7, i * 2, 1.9]); }); // LH root + fifth, held 2 beats
  rh.forEach((m, i) => notes.push([m, i * 0.5, 0.45]));                                        // RH eighth-note melody
  return notes;
})();

// --- EASY: Ode to Joy (Beethoven), C major, steady quarter notes ---
const odeToJoy = [
  [64,1],[64,1],[65,1],[67,1], [67,1],[65,1],[64,1],[62,1],
  [60,1],[60,1],[62,1],[64,1], [64,1.5],[62,0.5],[62,2],
  [64,1],[64,1],[65,1],[67,1], [67,1],[65,1],[64,1],[62,1],
  [60,1],[60,1],[62,1],[64,1], [62,1.5],[60,0.5],[60,2],
];

// --- MEDIUM: Für Elise (Beethoven), opening, eighth notes, some accidentals ---
const furElise = [
  [76,.5],[75,.5],[76,.5],[75,.5],[76,.5],[71,.5],[74,.5],[72,.5],[69,1],
  [60,.5],[64,.5],[69,.5],[71,1],
  [64,.5],[68,.5],[71,.5],[72,1],
  [64,.5],[76,.5],[75,.5],[76,.5],[75,.5],[76,.5],[71,.5],[74,.5],[72,.5],[69,1],
  [60,.5],[64,.5],[69,.5],[71,1],
  [64,.5],[72,.5],[71,.5],[69,2],
];

// --- HARD: Rondo alla Turca (Mozart), opening figure, fast sixteenths, wide range ---
const turkishMarch = [
  [71,.25],[69,.25],[68,.25],[69,.25],[72,.75],
  [74,.25],[72,.25],[71,.25],[72,.25],[76,.75],
  [77,.25],[76,.25],[75,.25],[76,.25],[81,.25],[80,.25],[81,.25],[76,.25],
  [77,.25],[76,.25],[75,.25],[76,.25],[72,.75],
  [74,.25],[72,.25],[71,.25],[72,.25],[76,.75],
  [77,.25],[76,.25],[75,.25],[76,.25],[81,.25],[80,.25],[81,.25],[83,.5],
  [72,.25],[74,.25],[76,.25],[77,.25],[79,.25],[81,.25],[83,.25],[84,.75],
];

const seqSongs = [
  { file: 'twinkle.mid',            name: 'Twinkle Twinkle',   bpm: 100, seq: twinkle },
  { file: 'ode-to-joy.mid',         name: 'Ode to Joy',        bpm: 96,  seq: odeToJoy },
  { file: 'fur-elise.mid',          name: 'Für Elise',         bpm: 120, seq: furElise },
  { file: 'turkish-march.mid',      name: 'Rondo alla Turca',  bpm: 138, seq: turkishMarch },
];
const explicitSongs = [
  { file: 'canon.mid',              name: "Pachelbel's Canon", bpm: 108, notes: canonNotes },
];

for (const s of seqSongs) {
  const buf = makeSong(s);
  writeFileSync(resolve(outDir, s.file), buf);
  console.log(`wrote ${s.file} (${buf.length} bytes) — ${s.name} @ ${s.bpm}bpm, ${s.seq.length} notes`);
}
for (const s of explicitSongs) {
  const buf = makeSongExplicit(s);
  writeFileSync(resolve(outDir, s.file), buf);
  console.log(`wrote ${s.file} (${buf.length} bytes) — ${s.name} @ ${s.bpm}bpm, ${s.notes.length} notes`);
}
console.log('done ->', outDir);
