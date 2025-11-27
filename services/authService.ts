
import { UserProfile, UserRole, AdminKey, SystemConfig, LogEntry, DashboardStats } from '../types';
import { auth, db, isMock } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';

/* 
   ==========================================================================
   HYBRID AUTH SERVICE
   ==========================================================================
   自動判斷：
   1. 若 isMock = true (無設定)，使用 LocalStorage 模擬。
   2. 若 isMock = false (有設定)，使用真實 Firebase Auth & Firestore。
*/

// Mock Keys
const DB_USERS = 'autosocial_db_users';
const DB_KEYS = 'autosocial_db_keys';
const DB_LOGS = 'autosocial_db_logs';
const SESSION_KEY = 'autosocial_session_uid';

// Helpers
const getDb = (key: string) => JSON.parse(localStorage.getItem(key) || '{}');
const saveDb = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

// --- Auth Subscription ---
export const subscribeAuth = (callback: (user: { uid: string, email: string } | null) => void) => {
    return auth.onAuthStateChanged(async (firebaseUser: any) => {
        if (firebaseUser) {
            // Check suspension
            const profile = await getUserProfile(firebaseUser.uid);
            if (profile && profile.isSuspended) {
                await logout();
                callback(null);
            } else {
                callback({ uid: firebaseUser.uid, email: firebaseUser.email });
            }
        } else {
            callback(null);
        }
    });
};

const getQuotaForRole = (role: UserRole): number => {
  switch (role) {
    case 'user': return 5;
    case 'pro': return 100;
    case 'vip': return 1000;
    case 'admin': return 9999;
    default: return 5;
  }
};

// --- Login / Register ---

export const login = async (email: string, pass: string) => {
    // Backdoor for Mock Demo
    if (isMock && email === 'ricky22407@gmail.com' && pass === 'testautosocial1106') {
         const uid = 'demo_admin';
         const users = getDb(DB_USERS);
         if (!users[uid]) {
             users[uid] = { user_id: uid, email, role: 'admin', quota_total: 9999, quota_used: 0, created_at: Date.now(), isSuspended: false, unlockedFeatures: ['ANALYTICS', 'AUTOMATION'] } as UserProfile;
             saveDb(DB_USERS, users);
         }
         localStorage.setItem(SESSION_KEY, uid);
         window.dispatchEvent(new Event('auth_state_change'));
         return { user: { uid, email } };
    }

    if (!isMock) {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        return { user: cred.user };
    } else {
        const users = getDb(DB_USERS);
        const user = Object.values(users).find((u: any) => u.email === email) as UserProfile;
        if (user) {
            localStorage.setItem(SESSION_KEY, user.user_id);
            window.dispatchEvent(new Event('auth_state_change'));
            return { user: { uid: user.user_id, email: user.email } };
        }
        throw new Error("用戶不存在 (Mock Mode)");
    }
};

export const register = async (email: string, pass: string) => {
    if (!isMock) {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await createUserProfile({ uid: cred.user.uid, email });
        return { user: cred.user };
    } else {
        const uid = 'user_' + Date.now();
        await createUserProfile({ uid, email });
        localStorage.setItem(SESSION_KEY, uid);
        window.dispatchEvent(new Event('auth_state_change'));
        return { user: { uid, email } };
    }
};

export const logout = async () => {
    if (!isMock) await signOut(auth);
    else {
        localStorage.removeItem(SESSION_KEY);
        window.dispatchEvent(new Event('auth_state_change'));
    }
};

// --- User Data Operations ---

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    if (!isMock) {
        const snap = await getDoc(doc(db, 'users', userId));
        return snap.exists() ? (snap.data() as UserProfile) : null;
    } else {
        return getDb(DB_USERS)[userId] || null;
    }
};

export const createUserProfile = async (user: { uid: string, email: string }): Promise<UserProfile> => {
    const newUser: UserProfile = {
        user_id: user.uid,
        email: user.email,
        role: 'user',
        quota_total: 5,
        quota_used: 0,
        quota_reset_date: Date.now() + 2592000000,
        created_at: Date.now(),
        updated_at: Date.now(),
        isSuspended: false,
        unlockedFeatures: []
    };

    if (!isMock) {
        await setDoc(doc(db, 'users', user.uid), newUser);
    } else {
        const users = getDb(DB_USERS);
        users[user.uid] = newUser;
        saveDb(DB_USERS, users);
    }
    return newUser;
};

export const checkAndUseQuota = async (userId: string): Promise<boolean> => {
    let user = await getUserProfile(userId);
    if (!user || user.isSuspended) return false;

    if (user.quota_used >= user.quota_total) return false;

    if (!isMock) {
        await updateDoc(doc(db, 'users', userId), {
            quota_used: user.quota_used + 1,
            updated_at: Date.now()
        });
    } else {
        const users = getDb(DB_USERS);
        users[userId].quota_used += 1;
        saveDb(DB_USERS, users);
    }
    return true;
};

// --- Admin Operations (Connecting to Firestore) ---

export const getAllUsers = async (): Promise<UserProfile[]> => {
    if (!isMock) {
        const q = query(collection(db, 'users'), orderBy('created_at', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data() as UserProfile);
    } else {
        return Object.values(getDb(DB_USERS));
    }
};

// [關鍵功能] 修改會員等級 (寫入 Firestore)
export const updateUserRole = async (targetUserId: string, newRole: UserRole) => {
    const quotaTotal = getQuotaForRole(newRole);
    if (!isMock) {
        await updateDoc(doc(db, 'users', targetUserId), {
            role: newRole,
            quota_total: quotaTotal,
            updated_at: Date.now()
        });
    } else {
        const users = getDb(DB_USERS);
        if (users[targetUserId]) {
            users[targetUserId].role = newRole;
            users[targetUserId].quota_total = quotaTotal;
            saveDb(DB_USERS, users);
        }
    }
};

// [關鍵功能] 手動修改配額 (寫入 Firestore)
export const manualUpdateQuota = async (targetUserId: string, used: number, total: number) => {
    if (!isMock) {
        await updateDoc(doc(db, 'users', targetUserId), {
            quota_used: used,
            quota_total: total,
            updated_at: Date.now()
        });
    } else {
        const users = getDb(DB_USERS);
        if (users[targetUserId]) {
            users[targetUserId].quota_used = used;
            users[targetUserId].quota_total = total;
            saveDb(DB_USERS, users);
        }
    }
};

export const toggleUserSuspension = async (targetUserId: string) => {
    const user = await getUserProfile(targetUserId);
    if (!user) return;
    if (!isMock) {
        await updateDoc(doc(db, 'users', targetUserId), {
            isSuspended: !user.isSuspended,
            updated_at: Date.now()
        });
    } else {
        const users = getDb(DB_USERS);
        users[targetUserId].isSuspended = !users[targetUserId].isSuspended;
        saveDb(DB_USERS, users);
    }
};

// --- System Config & Logging ---
export const getSystemConfig = (): SystemConfig => ({ maintenanceMode: false, dryRunMode: false, globalAnnouncement: '' });
export const updateSystemConfig = (cfg: any) => {}; 
export const getSystemLogs = (): LogEntry[] => [];
export const logSystemAction = async (uid: string, email: string, action: string, status: string, details: string) => { console.log(action, details); };
export const getDashboardStats = async (): Promise<DashboardStats> => {
    const users = await getAllUsers();
    return { totalUsers: users.length, activeUsersToday: 0, totalApiCallsToday: 0, errorCountToday: 0 };
};

// Admin Keys (Simplified for brevity in Hybrid)
export const generateAdminKey = async (adminId: string, type: any, role?: any, feature?: any) => {
    return "KEY-DEMO-" + Date.now(); 
};
export const useAdminKey = async (uid: string, key: string) => {
    return { success: true, message: "Key Feature Mocked" };
};
export const resetUserQuota = async (uid: string) => manualUpdateQuota(uid, 0, 5);
