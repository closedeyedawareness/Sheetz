import type { NoteEvent } from '../types';

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;

export interface MidiSession {
  deviceNames: string[];
  disconnect: () => void;
}

/**
 * Connects to any available MIDI input devices (e.g. a keyboard) via the Web
 * MIDI API and streams captured notes to `onNotesChanged` as they're played.
 * `onNotesChanged` receives the full note list accumulated so far each time a
 * note is released, so the caller can simply re-run it through the notation
 * pipeline and re-render.
 */
export async function connectMidi(onNotesChanged: (notes: NoteEvent[]) => void): Promise<MidiSession> {
  if (!navigator.requestMIDIAccess) {
    throw new Error('This browser does not support the Web MIDI API. Try Chrome or Edge.');
  }

  const access = await navigator.requestMIDIAccess();
  const notes: NoteEvent[] = [];
  const active = new Map<number, { startTimeSeconds: number; velocity: number }>();
  const sessionStart = performance.now();

  const handleMessage = (event: MIDIMessageEvent) => {
    const data = event.data;
    if (!data || data.length < 3) return;
    const status = data[0] & 0xf0;
    const pitch = data[1];
    const velocity = data[2];
    const nowSeconds = (performance.now() - sessionStart) / 1000;

    if (status === NOTE_ON && velocity > 0) {
      active.set(pitch, { startTimeSeconds: nowSeconds, velocity: velocity / 127 });
    } else if (status === NOTE_OFF || (status === NOTE_ON && velocity === 0)) {
      const started = active.get(pitch);
      if (started) {
        active.delete(pitch);
        notes.push({
          pitchMidi: pitch,
          startTimeSeconds: started.startTimeSeconds,
          durationSeconds: Math.max(0.05, nowSeconds - started.startTimeSeconds),
          amplitude: started.velocity,
        });
        onNotesChanged([...notes]);
      }
    }
  };

  const inputs = [...access.inputs.values()];
  inputs.forEach((input) => input.addEventListener('midimessage', handleMessage));

  return {
    deviceNames: inputs.map((i) => i.name ?? 'MIDI device'),
    disconnect: () => inputs.forEach((input) => input.removeEventListener('midimessage', handleMessage)),
  };
}
