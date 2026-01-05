
// We use global CDN scripts in index.html for maximum compatibility in this environment.
// This file acts as a typed wrapper around the global `window.firebase` object.

declare global {
  interface Window {
    firebase: any;
  }
}

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
// INITIALIZATION
// ============================================================================

let app: any;
let auth: any;
let db: any;
// FORCE REAL MODE: We strictly disable 'isMock' to ensure SaaS production behavior.
let isMock = false; 
let firebase: any; // Export the global namespace

const hasConfig = !!firebaseConfig.apiKey && !!firebaseConfig.projectId && firebaseConfig.apiKey !== 'undefined';

if (typeof window !== 'undefined' && window.firebase && hasConfig) {
  try {
      firebase = window.firebase;
      if (!firebase.apps.length) {
          app = firebase.initializeApp(firebaseConfig);
      } else {
          app = firebase.app();
      }
      auth = firebase.auth();
      db = firebase.firestore();
      console.log("🔥 Firebase Initialized (Global CDN)");
  } catch (e) {
      console.error("❌ Firebase Init Error:", e);
      // We do NOT fall back to mock. We want the error to be visible.
      alert("系統錯誤：無法連接資料庫。請聯繫管理員檢查 Firebase 設定。");
  }
} else {
  // Config Missing Case
  console.error("❌ Critical: Firebase Config Missing. Please check Vercel Environment Variables.");
  if (typeof window !== 'undefined') {
      console.warn("Missing Config:", firebaseConfig);
      // NOTE: We purposely do NOT set isMock = true here.
      // We want the app to fail if config is missing, so the developer fixes the Env Vars.
  }
  
  // Safe empty mocks to prevent immediate crash on import, but usage will fail (as expected)
  // This allows the app to render error UIs instead of white screen.
  firebase = {
      firestore: {
          FieldValue: {
              increment: (n: number) => n,
              serverTimestamp: () => Date.now(),
              arrayUnion: (val: any) => val
          }
      }
  };
}

export { app, auth, db, isMock, firebase };
