
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

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

let auth: Auth | any;
let db: Firestore | any;
let isMock = false;

// Check if config exists and is valid
const hasConfig = !!firebaseConfig.apiKey && !!firebaseConfig.projectId && firebaseConfig.apiKey !== 'undefined';

if (hasConfig) {
  // --- REAL FIREBASE MODE (Production) ---
  console.log("🔥 Initializing Real Firebase Connection...", firebaseConfig.projectId);
  
  try {
      const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
      auth = getAuth(app);
      db = getFirestore(app);
      isMock = false;
  } catch (e) {
      console.error("Firebase Init Error:", e);
      console.warn("Falling back to MOCK mode due to initialization error.");
      isMock = true; // Fallback to avoid crash
  }

} else {
  // --- MOCK MODE (Local Preview or Missing Config) ---
  console.log("⚠️ No Valid Firebase Config found. Using MOCK mode.");
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
       // Debug helper
       const keys = Object.keys((import.meta as any).env);
       console.log("ℹ️ Env Keys Available:", keys.filter(k => k.includes('FIREBASE')));
  }
  isMock = true;
}

// Mock Auth Object Implementation
if (isMock) {
  auth = {
    currentUser: null, // Initial state
    onAuthStateChanged: (cb: any) => {
        const check = () => {
             const uid = localStorage.getItem('autosocial_session_uid');
             if(uid) {
                 const user = { uid, email: 'demo@example.com', getIdToken: async () => 'mock-token' };
                 auth.currentUser = user; // Sync currentUser
                 cb(user);
             } else {
                 auth.currentUser = null; // Sync currentUser
                 cb(null);
             }
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('auth_state_change', check);
            // Immediate check
            setTimeout(check, 0); 
        }
        return () => {
            if (typeof window !== 'undefined') window.removeEventListener('auth_state_change', check);
        };
    },
    signOut: async () => {
        localStorage.removeItem('autosocial_session_uid');
        auth.currentUser = null;
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth_state_change'));
    }
  };

  db = {}; 
}

export { auth, db, isMock };
