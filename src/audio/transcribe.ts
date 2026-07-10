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

// TensorFlow.js's WebGL backend, the basic-pitch model, or the browser's own
// GL bindings can all reject/throw with something that isn't a proper `Error`
// (a plain `{}`-shaped object, a raw string, an Event). Left alone, that turns
// into an unhelpful "[object Object]" wherever the caller does
// `err instanceof Error ? err.message : ...`. Normalize anything caught in
// this module into a real Error with as much of the original shape preserved
// as possible, so the on-screen message and the console are both diagnosable.
function toDiagnosableError(err: unknown, context: string): Error {
  if (err instanceof Error) return err;

  let detail: string | undefined;
  if (err && typeof err === 'object') {
    try {
      const dumped = JSON.stringify(err, Object.getOwnPropertyNames(err));
      if (dumped && dumped !== '{}') detail = dumped;
    } catch {
      // err has circular refs or isn't serializable; fall through.
    }
  }
  detail ??= String(err);

  return new Error(`${context}: ${detail}`, { cause: err });
}

// Guards against the model hanging indefinitely (observed when a browser
// silently fails to get a hardware-accelerated WebGL context, so every
// tf.js kernel call stalls instead of erroring) by surfacing a diagnosable
// timeout instead of leaving the UI stuck on "Running pitch detection…"
// forever. Doesn't cancel the underlying computation — tf.js has no
// cancellation hook — but it unblocks the user with an actionable message.
const EVALUATE_MODEL_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
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

  try {
    await withTimeout(
      model.evaluateModel(
        audioBuffer,
        (f, o, c) => {
          frames.push(...f);
          onsets.push(...o);
          contours.push(...c);
        },
        (percent) => onProgress?.(percent)
      ),
      EVALUATE_MODEL_TIMEOUT_MS,
      'Pitch detection timed out. Your browser may have failed to enable GPU acceleration (WebGL) for the ' +
        'transcription model — try a different browser, confirm hardware acceleration is on, or try a shorter recording.'
    );
  } catch (err) {
    throw toDiagnosableError(err, 'Pitch-detection model failed while processing this audio');
  }

  try {
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
  } catch (err) {
    throw toDiagnosableError(err, 'Failed to convert model output into notes');
  }
}
