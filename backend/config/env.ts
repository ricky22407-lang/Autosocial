
import * as dotenv from 'dotenv';

dotenv.config();

export const Config = {
  PORT: process.env.PORT || 8080,
  ENV: process.env.NODE_ENV || 'development',
  
  FIREBASE: {
    PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },

  GEMINI: {
    API_KEY: process.env.API_KEY || '', // Used for server-side calls
  },
  
  APP: {
    DEFAULT_QUOTA_USER: 5,
    DEFAULT_QUOTA_PRO: 100,
    DEFAULT_QUOTA_VIP: 1000,
  }
};
