import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'lucide-react'],
          codemirror: [
            'codemirror',
            '@codemirror/lang-java',
            '@codemirror/view',
            '@codemirror/state',
            '@codemirror/commands',
            '@codemirror/language',
            '@lezer/highlight',
          ],
        },
      },
    },
  },
});
