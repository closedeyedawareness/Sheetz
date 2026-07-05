import { BasicPitch, addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch';
import type { NoteEvent } from '../types';

const MODEL_PATH = `${import.meta.env.BASE_URL}model/model.json`;

let basicPitch: BasicPitch | undefined;

function getModel(): BasicPitch {
  if (!basicPitch) {
    basicPitch = new BasicPitch(MODEL_PATH);
  }
  return basicPitch;
}

/**
 * Run Spotify's basic-pitch model (client-side, via TensorFlow.js) over a decoded
 * audio buffer and return the detected note events. Polyphonic; works best on
 * solo piano recordings.
 */
export async function transcribeAudio(
  audioBuffer: AudioBuffer,
  onProgress?: (fraction: number) => void
): Promise<NoteEvent[]> {
  const model = getModel();
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];

  await model.evaluateModel(
    audioBuffer,
    (f, o, c) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (percent) => onProgress?.(percent)
  );

  const rawNotes = outputToNotesPoly(frames, onsets, 0.25, 0.25, 5);
  const withBends = addPitchBendsToNoteEvents(contours, rawNotes);
  const notes = noteFramesToTime(withBends);

  return notes
    .map((n) => ({
      pitchMidi: n.pitchMidi,
      startTimeSeconds: n.startTimeSeconds,
      durationSeconds: n.durationSeconds,
      amplitude: n.amplitude,
    }))
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
}
