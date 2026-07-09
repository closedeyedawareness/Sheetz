// basic-pitch's model was trained on, and only accepts, 22050 Hz mono audio.
const BASIC_PITCH_SAMPLE_RATE = 22050;

/**
 * Decodes an uploaded audio file (or a recorded mic Blob) and resamples it to
 * the mono 22050 Hz format basic-pitch requires. Typed as `Blob` rather than
 * `File` so MediaRecorder output — which is a Blob, not a File — can be
 * passed straight through after live-listening mode stops.
 */
export async function decodeAudioFile(file: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    void audioCtx.close();
  }

  if (decoded.sampleRate === BASIC_PITCH_SAMPLE_RATE && decoded.numberOfChannels === 1) {
    return decoded;
  }

  const targetLength = Math.ceil((decoded.duration * BASIC_PITCH_SAMPLE_RATE));
  const offlineCtx = new OfflineAudioContext(1, targetLength, BASIC_PITCH_SAMPLE_RATE);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start();
  return offlineCtx.startRendering();
}
