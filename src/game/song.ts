import { Midi } from '@tonejs/midi';

export interface SongNote {
  midi: number;
  /** Seconds from the start of the song. */
  time: number;
  /** Seconds. */
  duration: number;
}

export interface Song {
  name: string;
  notes: SongNote[];
  /** Total length in seconds. */
  duration: number;
  /** Approximate tempo, for display only. */
  bpm: number;
  meta?: SongMeta;
}

export type Tier = 'Beginner' | 'Easy' | 'Medium' | 'Hard' | 'Expert';

export interface SongMeta {
  notesPerSec: number;
  accidentalRatio: number;
  rangeSemitones: number;
  maxPolyphony: number;
  /** 0..100 overall difficulty score. */
  score: number;
  tier: Tier;
}

const isBlackNote = (m: number) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

/** Derive a difficulty rating from the notes themselves (density, chords, reach, accidentals). */
export function analyze(song: Song): SongMeta {
  const n = song.notes;
  if (!n.length) return { notesPerSec: 0, accidentalRatio: 0, rangeSemitones: 0, maxPolyphony: 1, score: 0, tier: 'Beginner' };
  const nps = n.length / Math.max(1, song.duration);
  const accidentalRatio = n.filter((x) => isBlackNote(x.midi)).length / n.length;
  const pitches = n.map((x) => x.midi);
  const rangeSemitones = Math.max(...pitches) - Math.min(...pitches);
  // Max simultaneous notes (chords / two hands).
  let maxPolyphony = 1;
  for (let i = 0; i < n.length; i++) {
    let c = 1;
    for (let j = i + 1; j < n.length && n[j].time < n[i].time + 0.05; j++) c++;
    maxPolyphony = Math.max(maxPolyphony, c);
  }
  const raw = nps * 9 + accidentalRatio * 22 + (rangeSemitones / 12) * 6 + (maxPolyphony - 1) * 10;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const tier: Tier = score < 18 ? 'Beginner' : score < 34 ? 'Easy' : score < 52 ? 'Medium' : score < 72 ? 'Hard' : 'Expert';
  return { notesPerSec: nps, accidentalRatio, rangeSemitones, maxPolyphony, score, tier };
}

/** Parse a Standard MIDI File (any track layout) into a flat, time-sorted note list. */
export function parseMidi(data: ArrayBuffer, fallbackName = 'Song'): Song {
  const midi = new Midi(data);
  const notes: SongNote[] = [];
  for (const track of midi.tracks) {
    for (const n of track.notes) {
      notes.push({ midi: n.midi, time: n.time, duration: n.duration });
    }
  }
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
  const bpm = Math.round(midi.header.tempos[0]?.bpm ?? 120);
  const song: Song = { name: midi.name || fallbackName, notes, duration: midi.duration, bpm };
  song.meta = analyze(song);
  return song;
}

/** Fetch and parse one of the bundled .mid files (from public/songs). */
export async function loadSongFromUrl(url: string, name: string): Promise<Song> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load ${name} (${res.status})`);
  const buf = await res.arrayBuffer();
  const song = parseMidi(buf, name);
  song.name = name;
  return song;
}
