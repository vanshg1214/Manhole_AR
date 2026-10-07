import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        treeGrate: resolve(__dirname, 'tree-grate/index.html'),
      },
    },
  },
});
