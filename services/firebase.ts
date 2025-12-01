
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
const getEnv = (key: string) => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    return (import.meta as any).env[key] || (import.meta as any).env[`VITE_${key}`];
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || process.env[`REACT_APP_${key}`];
  }
  return '';
};

const firebaseConfig = {
  apiKey: getEnv('FIREBASE_API_KEY') || getEnv('REACT_APP_FIREBASE_API_KEY'),
  authDomain: getEnv('FIREBASE_AUTH_DOMAIN') || getEnv('REACT_APP_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('FIREBASE_PROJECT_ID') || getEnv('REACT_APP_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('FIREBASE_STORAGE_BUCKET') || getEnv('REACT_APP_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('FIREBASE_MESSAGING_SENDER_ID') || getEnv('REACT_APP_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('FIREBASE_APP_ID') || getEnv('REACT_APP_FIREBASE_APP_ID')
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
  
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);
  db = getFirestore(app);
  isMock = false;

} else {
  // --- MOCK MODE (Local Preview) ---
  console.log("⚠️ No Firebase Config found. Using MOCK mode.");
  
  // Mock Auth Object
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
  isMock = true;
}

export { auth, db, isMock };
