
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Some libraries use process.env, shim it for browser compatibility if needed, 
    // but usually import.meta.env is preferred in Vite.
    'process.env': process.env
  },
  build: {
    chunkSizeWarningLimit: 1000, // Raise warning limit to 1000kb
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'firebase/app', 'firebase/auth', 'firebase/firestore'],
          utils: ['@google/genai', 'uuid']
        }
      }
    }
  }
});
