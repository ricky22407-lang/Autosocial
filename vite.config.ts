import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Cast process to any to avoid TS errors if types/node is missing during build
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Safely expose environment variables to the client using JSON.stringify
      // This prevents "process is not defined" errors in the browser
      'process.env': JSON.stringify(env)
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
  };
});