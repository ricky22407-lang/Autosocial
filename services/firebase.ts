
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

const dummyStorage = {
    ref: () => ({
        putString: () => Promise.reject(new Error("Storage Config Missing")),
        getDownloadURL: () => Promise.reject(new Error("Storage Config Missing")),
        delete: () => Promise.reject(new Error("Storage Config Missing"))
    }),
    refFromURL: () => ({
        delete: () => Promise.reject(new Error("Storage Config Missing"))
    })
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
    },
    storage: () => dummyStorage
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
let storage: any = dummyStorage; // Export Storage
let firebase: any = dummyFirebase;

// 修改 services/firebase.ts 後半段的邏輯

// ...前面維持原樣...
const hasConfig = !!firebaseConfig.apiKey && !!firebaseConfig.projectId && firebaseConfig.apiKey !== 'undefined';

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
      storage = firebase.storage(); 
      isFirebaseReady = true;
      isMock = false; 
      console.log("🔥 Firebase Initialized");
  } catch (e: any) {
      // 初始化失敗直接拋出錯誤，不要硬塞假資料
      console.error("❌ Firebase Init Error:", e);
      throw new Error(`Firebase 初始化失敗: ${e.message}`);
  }
} else {
  // 檢查是否在正式環境
  const isProd = import.meta.env.PROD || process.env.NODE_ENV === 'production';
  
  if (isProd) {
      // 🚨 正式環境下，缺少金鑰直接讓網頁報錯，不允許進入 Mock Mode
      throw new Error("系統崩潰：正式環境遺失 Firebase API Keys！請至 Vercel 補齊環境變數。");
  } else {
      // 開發環境才允許 Mock Mode
      console.warn("⚠️ 本地開發環境：Firebase Config 缺失，啟用 Mock Mode。");
      isMock = true;
      isFirebaseReady = true; 
  }
}
// --- UTILS ---
export const deleteStorageFile = async (url: string) => {
    if (isMock || !storage || !url) return;
    try {
        // Only delete if it's actually in our firebase storage
        if (url.includes('firebasestorage.googleapis.com')) {
            const ref = storage.refFromURL(url);
            await ref.delete();
            console.log("🗑️ Storage file deleted:", url);
        }
    } catch (e) {
        console.warn("Failed to delete storage file:", e);
    }
};

export { app, auth, db, storage, isMock, firebase, isFirebaseReady, connectionError };
