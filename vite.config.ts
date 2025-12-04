import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Safe cwd check
  const cwd = typeof process !== 'undefined' && (process as any).cwd ? (process as any).cwd() : '.';
  const env = loadEnv(mode, cwd, '');
  
  return {
    plugins: [react()],
    // Defines global constant replacements.
    // Instead of polyfilling the whole `process.env` (which causes issues),
    // we strictly replace the specific keys used in the code at build time.
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.VITE_API_KEY || ''),
      'process.env.NODE_ENV': JSON.stringify(mode),
      // If other specific env vars are needed, add them here explicitly
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'firebase/app', 'firebase/auth', 'firebase/firestore'],
            utils: ['@google/genai', 'uuid']
          }
        }
      }
    }
  };
});