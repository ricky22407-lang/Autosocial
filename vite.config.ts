import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Cast process to any to avoid TS errors if types/node is missing during build
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Create a clean process.env object for the browser
  // This prevents the "Uncaught ReferenceError: process is not defined" error
  const processEnvValues = {
    'process.env': JSON.stringify(env)
  };

  return {
    plugins: [react()],
    define: processEnvValues,
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