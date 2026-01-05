
// We use global CDN scripts in index.html for maximum compatibility in this environment.
// This file acts as a typed wrapper around the global `window.firebase` object.

declare global {
  interface Window {
    firebase: any;
  }
}

// ============================================================================
// DUMMY IMPLEMENTATIONS (Prevent Crash when Env Vars are missing)
// ============================================================================
const dummyAuth = {
    currentUser: null,
    onAuthStateChanged: (cb: any) => {
        cb(null); // Render as logged out
        return () => {}; 
    },
    signInWithEmailAndPassword: () => Promise.reject(new Error("系統錯誤：Firebase 環境變數未設定 (Missing Config)")),
    createUserWithEmailAndPassword: () => Promise.reject(new Error("系統錯誤：Firebase 環境變數未設定 (Missing Config)")),
    signOut: () => Promise.resolve(),
    sendPasswordResetEmail: () => Promise.reject(new Error("Missing Config"))
};

const createDummyChain = () => ({
    doc: () => ({
        get: () => Promise.reject(new Error("DB Config Missing - Check Env Vars")),
        set: () => Promise.reject(new Error("DB Config Missing - Check Env Vars")),
        update: () => Promise.reject(new Error("DB Config Missing - Check Env Vars")),
        delete: () => Promise.reject(new Error("DB Config Missing - Check Env Vars")),
        collection: createDummyChain
    }),
    add: () => Promise.reject(new Error("DB Config Missing - Check Env Vars")),
    where: () => ({
        orderBy: () => ({
            limit: () => ({ get: () => Promise.resolve({ empty: true, docs: [] }) }),
            get: () => Promise.resolve({ empty: true, docs: [] })
        }),
        get: () => Promise.resolve({ empty: true, docs: [] })
    }),
    orderBy: () => ({ get: () => Promise.resolve({ empty: true, docs: [] }) }),
    get: () => Promise.resolve({ empty: true, docs: [] })
});

const dummyDb = {
    collection: createDummyChain,
    runTransaction: () => Promise.reject(new Error("DB Config Missing - Check Env Vars")),
    batch: () => ({ update: () => {}, delete: () => {}, commit: () => Promise.reject(new Error("DB Config Missing")) })
};

const dummyFirebase = {
    firestore: {
        FieldValue: {
            increment: () => 'INCREMENT_FIELD_VALUE',
            serverTimestamp: () => new Date().toISOString(),
            arrayUnion: (val: any) => val
        }
    },
    auth: {
        GoogleAuthProvider: class {}
    }
};

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
// Initialize with dummies BY DEFAULT to ensure export is never undefined
let auth: any = dummyAuth;
let db: any = dummyDb;
let firebase: any = dummyFirebase;

// FORCE REAL MODE: Strictly disable 'isMock' for SaaS production.
let isMock = false; 
let isFirebaseReady = false; // Status Flag
let connectionError = "";

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
      isFirebaseReady = true;
      console.log("🔥 Firebase Initialized (Global CDN) - Connection Ready");
  } catch (e: any) {
      console.error("❌ Firebase Init Error:", e);
      connectionError = e.message;
      // Fallback variables remain as dummies
  }
} else {
  // Diagnostic Logging
  const missingKeys = Object.entries(firebaseConfig)
      .filter(([_, v]) => !v || v === 'undefined')
      .map(([k]) => k);

  if (missingKeys.length > 0) {
      connectionError = `Missing Env Vars: ${missingKeys.join(', ')}`;
      console.error("❌ Critical: Firebase Config Missing.", connectionError);
      console.warn("Please check Vercel Settings > Environment Variables. Ensure keys start with VITE_ if needed.");
  } else if (typeof window !== 'undefined' && !window.firebase) {
      connectionError = "Firebase SDK failed to load from CDN (Network Issue or Adblock).";
      console.error("❌ Firebase SDK not loaded.");
  }
}

export { app, auth, db, isMock, firebase, isFirebaseReady, connectionError };
