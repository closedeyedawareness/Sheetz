/** Maps a normalized 0-1 loudness value to a traditional dynamic marking. */
export function amplitudeToDynamic(amplitude: number): string {
  if (amplitude < 0.15) return 'pp';
  if (amplitude < 0.3) return 'p';
  if (amplitude < 0.45) return 'mp';
  if (amplitude < 0.6) return 'mf';
  if (amplitude < 0.75) return 'f';
  return 'ff';
}
