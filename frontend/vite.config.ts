import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from 'vite-plugin-tailwindcss';

export default defineConfig({
  plugins: [react(), tailwind()],
  base: '/',
});
