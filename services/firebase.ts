
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
// Helper to safely get env vars in both Vite (browser) and Node (server) environments
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

let auth: any;
let db: any;
let isMock = false;

// Check if config exists
const hasConfig = !!firebaseConfig.apiKey && !!firebaseConfig.projectId;

if (hasConfig) {
  // --- REAL FIREBASE MODE (Production) ---
  console.log("🔥 Initializing Real Firebase Connection...", firebaseConfig.projectId);
  
  const app = !firebase.apps.length ? firebase.initializeApp(firebaseConfig) : firebase.app();
  auth = firebase.auth(app);
  db = firebase.firestore(app);
  isMock = false;

} else {
  // --- MOCK MODE (Local Preview) ---
  console.log("⚠️ No Firebase Config found in env. Using MOCK mode for preview.");
  
  auth = {
    currentUser: null,
    onAuthStateChanged: (cb: any) => {
        const check = () => {
             const uid = localStorage.getItem('autosocial_session_uid');
             if(uid) cb({ uid, email: 'demo@example.com', getIdToken: async () => 'mock-token' });
             else cb(null);
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('auth_state_change', check);
            check();
        }
        return () => {
            if (typeof window !== 'undefined') window.removeEventListener('auth_state_change', check);
        };
    },
    signOut: async () => {
        localStorage.removeItem('autosocial_session_uid');
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth_state_change'));
    }
  };

  db = {}; 
  isMock = true;
}

export { auth, db, isMock };
