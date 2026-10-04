import { defineConfig } from 'vitest/config';

// `base: './'` makes every asset URL relative, so the build works on GitHub Pages
// under https://<user>.github.io/<repo>/ without knowing the repo name.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
