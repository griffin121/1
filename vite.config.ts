import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Set base to your GitHub Pages repo name
export default defineConfig({
  plugins: [react()],
  base: '/1/'
});
