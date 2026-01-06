
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
    signInWithEmailAndPassword: () => Promise.reject(new Error("系統錯誤：Firebase 環境變數未設定 (Mock Mode Active)")),
    createUserWithEmailAndPassword: () => Promise.reject(new Error("系統錯誤：Firebase 環境變數未設定 (Mock Mode Active)")),
    signOut: () => Promise.resolve(),
    sendPasswordResetEmail: () => Promise.reject(new Error("Missing Config"))
};

const createDummyChain = () => ({
    doc: () => ({
        get: () => Promise.reject(new Error("DB Config Missing (Mock Mode)")),
        set: () => Promise.reject(new Error("DB Config Missing (Mock Mode)")),
        update: () => Promise.reject(new Error("DB Config Missing (Mock Mode)")),
        delete: () => Promise.reject(new Error("DB Config Missing (Mock Mode)")),
        collection: createDummyChain
    }),
    add: () => Promise.reject(new Error("DB Config Missing (Mock Mode)")),
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
    runTransaction: () => Promise.reject(new Error("DB Config Missing (Mock Mode)")),
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

const hasConfig = !!firebaseConfig.apiKey && !!firebaseConfig.projectId && firebaseConfig.apiKey !== 'undefined';

// Auto-detect mode: If config is missing, force Mock Mode to allow Preview to work
let isMock = !hasConfig; 
let isFirebaseReady = false; // Status Flag
let connectionError = "";

if (hasConfig && typeof window !== 'undefined' && window.firebase) {
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
      isMock = false; // Ensure real mode is active if config exists
      console.log("🔥 Firebase Initialized (Global CDN) - Connection Ready");
  } catch (e: any) {
      console.error("❌ Firebase Init Error, falling back to Mock:", e);
      connectionError = e.message;
      isMock = true; // Fallback to mock on error
      isFirebaseReady = true; // Allow app to continue
  }
} else {
  // Preview Mode / No Config -> Activate Mock Mode
  console.warn("⚠️ Firebase Config Missing. Switching to MOCK MODE for Preview.");
  isMock = true;
  isFirebaseReady = true; // Allow app to continue using MockStore
  connectionError = "Preview Mode (Mock Data)";
}

export { app, auth, db, isMock, firebase, isFirebaseReady, connectionError };
