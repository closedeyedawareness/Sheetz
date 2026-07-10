import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Multi-page: the transcription app (index.html) and the game (game.html).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: r('./index.html'),
        game: r('./game.html'),
      },
    },
  },
});
