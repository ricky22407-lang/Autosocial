
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const cwd = typeof process !== 'undefined' && (process as any).cwd ? (process as any).cwd() : '.';
  const env = loadEnv(mode, cwd, '');
  
  return {
    plugins: [react()],
    define: {
      // Allow process.env to exist for runtime injection
      'process.env.NODE_ENV': JSON.stringify(mode),
      // We do NOT stringify process.env.API_KEY here because it might be injected dynamically by the host environment
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'firebase/app', 'firebase/auth', 'firebase/firestore'],
          }
        }
      }
    }
  };
});
