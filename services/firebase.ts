
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
const getEnv = (key: string): string => {
  let value: string | undefined = '';
  // 1. Try Vite import.meta.env
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const env = (import.meta as any).env;
    value = env[key] || env[`VITE_${key}`] || env[`REACT_APP_${key}`];
  }
  // 2. Try Node process.env (Fallback)
  if (!value && typeof process !== 'undefined' && process.env) {
    value = process.env[key] || process.env[`VITE_${key}`] || process.env[`REACT_APP_${key}`];
  }
  return value ? String(value).trim() : '';
};

const firebaseConfig = {
  apiKey: getEnv('FIREBASE_API_KEY'),
  authDomain: getEnv('FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('FIREBASE_APP_ID')
};

// ============================================================================
// INITIALIZATION (COMPAT / V8 STYLE)
// ============================================================================

let app;
let auth: firebase.auth.Auth;
let db: firebase.firestore.Firestore;
let isMock = false;

const hasConfig = !!firebaseConfig.apiKey && !!firebaseConfig.projectId && firebaseConfig.apiKey !== 'undefined';

if (hasConfig) {
  try {
      if (!firebase.apps.length) {
          app = firebase.initializeApp(firebaseConfig);
      } else {
          app = firebase.app();
      }
      auth = firebase.auth();
      db = firebase.firestore();
      console.log("🔥 Firebase Initialized (Compat)");
  } catch (e) {
      console.error("Firebase Init Error:", e);
      isMock = true; 
      // Create mock objects placeholders to prevent crash on import
      auth = {} as any; 
      db = {} as any;
  }
} else {
  console.log("⚠️ No Valid Firebase Config. Using MOCK mode.");
  isMock = true;
  auth = {} as any;
  db = {} as any;
}

export { app, auth, db, isMock, firebase };
