import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set third parameter to '' to load all env regardless of prefix
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    // Defines global constant replacements.
    // This effectively polyfills `process.env` in the browser code.
    define: {
      'process.env': JSON.stringify(env)
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