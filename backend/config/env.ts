
import * as dotenv from 'dotenv';

dotenv.config();

const getEnv = (key: string) => {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[key]) return process.env[key];
    if (process.env[`VITE_${key}`]) return process.env[`VITE_${key}`];
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
    // Primary Key
    API_KEY: getEnv('API_KEY') || '',
    // Backup Keys
    API_KEY_2: getEnv('API_KEY_2') || '',
    API_KEY_3: getEnv('API_KEY_3') || '',
  },

  OPENAI: {
    API_KEY: getEnv('OPENAI_API_KEY') || '',
  },
  
  // Platform App Credentials (SaaS Mode)
  THREADS: {
      APP_ID: getEnv('THREADS_APP_ID'),
      APP_SECRET: getEnv('THREADS_APP_SECRET')
  },
  
  APP: {
    DEFAULT_QUOTA_USER: 5,
    DEFAULT_QUOTA_PRO: 100,
    DEFAULT_QUOTA_VIP: 1000,
  }
};
