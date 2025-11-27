import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Some libraries use process.env, shim it for browser compatibility if needed, 
    // but usually import.meta.env is preferred in Vite.
    'process.env': process.env
  }
});