// basic-pitch's model was trained on, and only accepts, 22050 Hz mono audio.
const BASIC_PITCH_SAMPLE_RATE = 22050;

/**
 * Decodes an uploaded .wav/.mp3/.ogg/.flac file and resamples it to the mono
 * 22050 Hz format basic-pitch requires.
 */
export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
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
