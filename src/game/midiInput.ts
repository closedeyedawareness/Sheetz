// Real MIDI-keyboard input via the Web MIDI API.

export type NoteHandler = (midi: number, velocity: number) => void;

export interface MidiConnection {
  status: 'connected' | 'unsupported' | 'denied' | 'no-devices';
  deviceName?: string;
  disconnect(): void;
}

/**
 * Request access to attached MIDI devices and forward note-on events.
 * Returns a status so the UI can tell the player what happened.
 */
export async function connectMidi(onNoteOn: NoteHandler, onNoteOff?: NoteHandler): Promise<MidiConnection> {
  const nav = navigator as Navigator & { requestMIDIAccess?: (opts?: { sysex: boolean }) => Promise<MIDIAccess> };
  if (!nav.requestMIDIAccess) {
    return { status: 'unsupported', disconnect() {} };
  }

  let access: MIDIAccess;
  try {
    access = await nav.requestMIDIAccess({ sysex: false });
  } catch {
    return { status: 'denied', disconnect() {} };
  }

  const listeners: MIDIInput[] = [];
  const handle = (e: MIDIMessageEvent) => {
    if (!e.data) return;
    const [status, note, velocity] = e.data;
    const command = status & 0xf0;
    if (command === 0x90 && velocity > 0) onNoteOn(note, velocity / 127);
    else if (command === 0x80 || (command === 0x90 && velocity === 0)) onNoteOff?.(note, 0);
  };

  const attachAll = () => {
    for (const input of access.inputs.values()) {
      if (!listeners.includes(input)) {
        input.onmidimessage = handle as (e: MIDIMessageEvent) => void;
        listeners.push(input);
      }
    }
  };
  attachAll();
  // Hot-plugging: pick up devices connected after we asked.
  access.onstatechange = attachAll;

  const first = [...access.inputs.values()][0];
  return {
    status: listeners.length ? 'connected' : 'no-devices',
    deviceName: first?.name ?? undefined,
    disconnect() {
      for (const input of listeners) input.onmidimessage = null;
      access.onstatechange = null;
    },
  };
}

// Computer-keyboard fallback so the game is playable/testable without a MIDI
// device: two rows mapped to a piano octave starting at C4.
const KEY_MAP: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71,
  k: 72, o: 73, l: 74, p: 75, ';': 76, "'": 77,
  z: 48, x: 50, c: 52, v: 53, b: 55, n: 57, m: 59,
};

export function attachKeyboard(onNoteOn: NoteHandler, onNoteOff?: NoteHandler): () => void {
  const down = new Set<string>();
  const kd = (e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const midi = KEY_MAP[e.key.toLowerCase()];
    if (midi === undefined) return;
    if (down.has(e.key)) return;
    down.add(e.key);
    onNoteOn(midi, 0.8);
  };
  const ku = (e: KeyboardEvent) => {
    const midi = KEY_MAP[e.key.toLowerCase()];
    if (midi === undefined) return;
    down.delete(e.key);
    onNoteOff?.(midi, 0);
  };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  return () => {
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
  };
}
