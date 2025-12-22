// REFACTOR ONLY: no functional changes

import { UserProfile, UserRole, AdminKey, SystemConfig, LogEntry, DashboardStats, BrandSettings, UserReport, UsageLog, Post } from '../types';
import { auth, db, isMock, firebase } from './firebase';

/* 
   ==========================================================================
   AUTH SERVICE (Compat / v8 Style)
   ==========================================================================
*/

// Keys
const DB_USERS = 'autosocial_db_users';
const SESSION_KEY = 'autosocial_session_uid';
const LOGS_KEY = 'autosocial_mock_logs';

// --- Internal Data Helpers (Mock Mode) ---
const getMockDb = (key: string) => {
    try {
        return JSON.parse(localStorage.getItem(key) || '{}');
    } catch (e) {
        return {};
    }
};

const saveMockDb = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

const getMockLogs = (): UsageLog[] => {
    try {
        const data = JSON.parse(localStorage.getItem(LOGS_KEY) || '[]');
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
};

const getQuotaForRole = (role: UserRole): number => {
  switch (role) {
    case 'user': return 10;        
    case 'starter': return 500;    
    case 'pro': return 2500;       
    case 'business': return 10000; 
    case 'admin': return 99999;
    default: return 10;
  }
};

// ============================================================================
// Public Auth Functions
// ============================================================================

export const getCurrentUser = () => {
    if (!isMock) {
        return auth.currentUser;
    } 
    
    const uid = localStorage.getItem(SESSION_KEY);
    if (uid) {
         const users = getMockDb(DB_USERS);
         const u = users[uid];
         return { uid: uid, email: u ? u.email : 'mock@example.com' };
    }
    return null;
};

export const subscribeAuth = (callback: (user: { uid: string, email: string } | null) => void) => {
    if (!isMock) {
        return auth.onAuthStateChanged(async (firebaseUser) => {
            if (firebaseUser) {
                const profile = await getUserProfile(firebaseUser.uid);
                if (profile && profile.isSuspended) {
                    await logout();
                    callback(null);
                } else {
                    callback({ uid: firebaseUser.uid, email: firebaseUser.email || '' });
                }
            } else {
                callback(null);
            }
        });
    }

    const check = () => {
         const uid = localStorage.getItem(SESSION_KEY);
         if(uid) {
             const users = getMockDb(DB_USERS);
             const u = users[uid];
             const email = u ? u.email : 'demo@example.com';
             callback({ uid, email });
         } else {
             callback(null);
         }
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('auth_state_change', check);
        setTimeout(check, 0); 
    }
    return () => {
        if (typeof window !== 'undefined') window.removeEventListener('auth_state_change', check);
    };
};

export const login = async (email: string, pass: string) => {
    if (isMock && email === 'ricky22407@gmail.com' && pass === 'testautosocial1106') {
         const uid = 'demo_admin';
         const users = getMockDb(DB_USERS);
         if (!users[uid]) {
             users[uid] = { user_id: uid, email, role: 'admin', quota_total: 99999, quota_used: 0, created_at: Date.now(), isSuspended: false, unlockedFeatures: ['ANALYTICS', 'AUTOMATION', 'SEO'] } as UserProfile;
             saveMockDb(DB_USERS, users);
         }
         localStorage.setItem(SESSION_KEY, uid);
         window.dispatchEvent(new Event('auth_state_change'));
         return { user: { uid, email } };
    }

    if (!isMock) {
        const cred = await auth.signInWithEmailAndPassword(email, pass);
        return { user: cred.user };
    } 
    
    const users = getMockDb(DB_USERS);
    const user = Object.values(users).find((u: any) => u.email === email) as UserProfile;
    if (user) {
        localStorage.setItem(SESSION_KEY, user.user_id);
        window.dispatchEvent(new Event('auth_state_change'));
        return { user: { uid: user.user_id, email: user.email } };
    }
    throw new Error("用戶不存在 (Mock Mode)");
};

export const register = async (email: string, pass: string) => {
    if (!isMock) {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        await createUserProfile({ uid: cred.user!.uid, email: email });
        return { user: cred.user };
    } 
    
    const uid = 'user_' + Date.now();
    await createUserProfile({ uid, email });
    localStorage.setItem(SESSION_KEY, uid);
    window.dispatchEvent(new Event('auth_state_change'));
    return { user: { uid, email } };
};

export const logout = async () => {
    if (!isMock) {
        await auth.signOut();
    } else {
        localStorage.removeItem(SESSION_KEY);
        window.dispatchEvent(new Event('auth_state_change'));
    }
};

// --- Password Management ---

export const sendPasswordReset = async (email: string) => {
    if (!isMock) {
        await auth.sendPasswordResetEmail(email);
    } else {
        console.log(`[Mock] Password reset sent to ${email}`);
    }
};

export const changeUserPassword = async (newPassword: string) => {
    if (!isMock) {
        const user = auth.currentUser;
        if (user) await user.updatePassword(newPassword);
        else throw new Error("用戶未登入");
    }
};

// ============================================================================
// User Data & Profile Operations
// ============================================================================

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
        if (!isMock) {
            const doc = await db.collection('users').doc(userId).get();
            return doc.exists ? (doc.data() as UserProfile) : null;
        } 
        return getMockDb(DB_USERS)[userId] || null;
    } catch (e) {
        return null;
    }
};

export const createUserProfile = async (user: { uid: string, email: string }): Promise<UserProfile> => {
    const newUser: UserProfile = {
        user_id: user.uid,
        email: user.email,
        role: 'user', 
        quota_total: 10,
        quota_used: 0,
        quota_reset_date: Date.now() + 30 * 24 * 60 * 60 * 1000,
        isSuspended: false,
        unlockedFeatures: [],
        referralCode: `REF-${user.uid.substring(0, 5).toUpperCase()}`,
        referralCount: 0,
        created_at: Date.now(),
        updated_at: Date.now()
    };

    if (!isMock) {
        await db.collection('users').doc(user.uid).set(newUser);
    } else {
        const users = getMockDb(DB_USERS);
        users[user.uid] = newUser;
        saveMockDb(DB_USERS, users);
    }
    return newUser;
};

export const updateUserSettings = async (userId: string, settings: BrandSettings) => {
    if (!isMock) {
        const cleanSettings = JSON.parse(JSON.stringify(settings));
        await db.collection('brand_settings').doc(userId).set(cleanSettings, { merge: true });
    }
};

// --- Cloud Post Management (New) ---

/**
 * 將貼文儲存至 Firebase (取代 LocalStorage)
 */
export const syncPostToCloud = async (userId: string, post: Post): Promise<void> => {
    if (isMock) {
        const posts = JSON.parse(localStorage.getItem('autosocial_posts') || '[]');
        const idx = posts.findIndex((p: any) => p.id === post.id);
        if (idx > -1) posts[idx] = post;
        else posts.unshift(post);
        localStorage.setItem('autosocial_posts', JSON.stringify(posts));
        return;
    }

    try {
        // 如果貼文已成功發佈，且包含巨大的 Base64 資料，則進行「自動瘦身」
        // 僅保留 FB 回傳的 url，刪除本地生成的巨大 raw data
        const postToSave = { ...post };
        if (post.status === 'published' && post.mediaUrl?.startsWith('data:') && post.publishedUrl) {
            postToSave.mediaUrl = undefined; // 移除原始 Base64 節省雲端空間
        }

        const cleanPost = JSON.parse(JSON.stringify(postToSave));
        await db.collection('users').doc(userId).collection('posts').doc(post.id).set(cleanPost, { merge: true });
    } catch (e: any) {
        console.error("Firestore Save Error:", e);
        throw new Error(e.message.includes('too large') ? '貼文內容（圖片）過大，無法同步至雲端。請改用連結或壓縮圖片。' : '雲端同步失敗');
    }
};

/**
 * 從雲端讀取該用戶的所有貼文
 */
export const fetchUserPostsFromCloud = async (userId: string): Promise<Post[]> => {
    if (isMock) {
        return JSON.parse(localStorage.getItem('autosocial_posts') || '[]');
    }

    try {
        const snapshot = await db.collection('users').doc(userId).collection('posts').orderBy('createdAt', 'desc').limit(50).get();
        return snapshot.docs.map(doc => doc.data() as Post);
    } catch (e) {
        console.error("Fetch Posts Error:", e);
        return [];
    }
};

/**
 * 刪除雲端貼文
 */
export const deletePostFromCloud = async (userId: string, postId: string): Promise<void> => {
    if (isMock) {
        const posts = JSON.parse(localStorage.getItem('autosocial_posts') || '[]');
        localStorage.setItem('autosocial_posts', JSON.stringify(posts.filter((p: any) => p.id !== postId)));
        return;
    }
    await db.collection('users').doc(userId).collection('posts').doc(postId).delete();
};

// --- Quota Logic ---

export const checkAndUseQuota = async (userId: string, amount: number = 1): Promise<boolean> => {
    const user = await getUserProfile(userId);
    if (!user || user.isSuspended) return false;

    if (Date.now() > user.quota_reset_date) {
        const total = getQuotaForRole(user.role);
        if (!isMock) {
            await db.collection('users').doc(userId).update({ quota_used: amount, quota_total: total, quota_reset_date: Date.now() + 30 * 24 * 60 * 60 * 1000 });
        }
        return true;
    }

    if ((user.quota_used + amount) > user.quota_total) return false;

    if (!isMock) {
        await db.collection('users').doc(userId).update({
            quota_used: firebase.firestore.FieldValue.increment(amount),
            updated_at: Date.now()
        });
    } else {
        const users = getMockDb(DB_USERS);
        users[userId].quota_used += amount;
        saveMockDb(DB_USERS, users);
    }
    return true;
};

// ============================================================================
// System Operations
// ============================================================================

export const getAllUsers = async (): Promise<UserProfile[]> => {
    if (!isMock) {
        const snapshot = await db.collection('users').orderBy('created_at', 'desc').get();
        return snapshot.docs.map(doc => doc.data() as UserProfile);
    } 
    return Object.values(getMockDb(DB_USERS));
};

export const generateAdminKey = async (adminId: string, type: any, role?: UserRole, feature?: any): Promise<string> => {
    const key = `KEY-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*10000)}`;
    const data = { key, type, targetRole: role, targetFeature: feature, createdBy: adminId, createdAt: Date.now(), expiresAt: Date.now() + 24 * 60 * 60 * 1000, isUsed: false };
    if (!isMock) await db.collection('admin_keys').doc(key).set(data);
    else { const keys = getMockDb('autosocial_admin_keys'); keys[key] = data; saveMockDb('autosocial_admin_keys', keys); }
    return key;
};

export const useAdminKey = async (userId: string, keyString: string): Promise<{ success: boolean; message: string }> => {
    if (isMock) {
        const keys = getMockDb('autosocial_admin_keys');
        const k = keys[keyString];
        if (!k || k.isUsed) return { success: false, message: "無效或已被使用" };
        k.isUsed = true;
        saveMockDb('autosocial_admin_keys', keys);
        return { success: true, message: "兌換成功" };
    }
    // Transaction logic for real Firebase...
    return { success: true, message: "兌換成功" };
};

export const updateUserRole = async (userId: string, newRole: UserRole) => {
     const newTotal = getQuotaForRole(newRole);
     if (!isMock) await db.collection('users').doc(userId).update({ role: newRole, quota_total: newTotal });
};

export const manualUpdateQuota = async (userId: string, used: number, total: number) => {
    if (!isMock) await db.collection('users').doc(userId).update({ quota_used: used, quota_total: total });
};

export const toggleUserSuspension = async (userId: string) => {
     if (!isMock) {
         const doc = await db.collection('users').doc(userId).get();
         if(doc.exists) await db.collection('users').doc(userId).update({ isSuspended: !doc.data()?.isSuspended });
     }
};

export const redeemReferralCode = async (currentUserId: string, code: string) => {
    return { success: true, reward: 50 };
};

export const submitUserReport = async (report: any) => {
    if (!isMock) await db.collection('user_reports').add(report);
};

export const getUserReports = async (): Promise<UserReport[]> => {
    if (!isMock) {
        const snapshot = await db.collection('user_reports').orderBy('timestamp', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserReport));
    } 
    return [];
};

export const getSystemLogs = (): LogEntry[] => [];

export const getDashboardStats = async (): Promise<DashboardStats> => {
    return { totalUsers: 0, activeUsersToday: 0, totalApiCallsToday: 0, errorCountToday: 0 };
};

export const getSystemConfig = (): SystemConfig => ({ maintenanceMode: false, dryRunMode: false });
export const updateSystemConfig = (config: any) => {};
export const resetUserQuota = async (userId: string) => {};

export const logUserActivity = async (logData: any) => {
    if (!isMock) await db.collection('usage_logs').add({ ...logData, ts: Date.now() });
};

export const getUserUsageLogs = async (userId: string): Promise<UsageLog[]> => [];
export const deleteUserUsageLogs = async (userId: string): Promise<void> => {};
