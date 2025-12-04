import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const cwd = typeof process !== 'undefined' && (process as any).cwd ? (process as any).cwd() : '.';
  const env = loadEnv(mode, cwd, '');
  
  return {
    plugins: [react()],
    // 安全性修正：不再將 API_KEY 注入到前端代碼中
    define: {
      // 僅保留必要的環境判斷，移除敏感資訊
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'firebase/app', 'firebase/auth', 'firebase/firestore'],
            // @google/genai 移至後端，前端 bundle 不再需要包含它，減少體積
          }
        }
      }
    }
  };
});