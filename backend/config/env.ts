
import * as dotenv from 'dotenv';

dotenv.config();

const getEnv = (key: string) => {
  if (typeof process !== 'undefined' && process.env) {
    // 優先讀取沒有前綴的 (後端專用)
    if (process.env[key]) return process.env[key];
    
    // 如果找不到，嘗試讀取 VITE_ 前綴的 (前後端共用)
    if (process.env[`VITE_${key}`]) return process.env[`VITE_${key}`];
    
    // 嘗試 REACT_APP_ 前綴 (舊專案相容)
    if (process.env[`REACT_APP_${key}`]) return process.env[`REACT_APP_${key}`];
  }
  return '';
};

export const Config = {
  PORT: getEnv('PORT') || 8080,
  ENV: getEnv('NODE_ENV') || 'development',
  
  FIREBASE: {
    PROJECT_ID: getEnv('FIREBASE_PROJECT_ID'),
    CLIENT_EMAIL: getEnv('FIREBASE_CLIENT_EMAIL'),
    PRIVATE_KEY: getEnv('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
  },

  GEMINI: {
    API_KEY: getEnv('API_KEY') || '', // Used for server-side calls
  },
  
  APP: {
    DEFAULT_QUOTA_USER: 5,
    DEFAULT_QUOTA_PRO: 100,
    DEFAULT_QUOTA_VIP: 1000,
  }
};
