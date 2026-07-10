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
  return { name: midi.name || fallbackName, notes, duration: midi.duration, bpm };
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
