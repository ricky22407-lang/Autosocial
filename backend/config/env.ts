
import * as dotenv from 'dotenv';

dotenv.config();

const getEnv = (key: string) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
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
