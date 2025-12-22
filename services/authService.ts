import { UserProfile, UserRole, AdminKey, SystemConfig, LogEntry, DashboardStats, BrandSettings, UserReport, UsageLog, Post } from '../types';
import { auth, db, isMock, firebase } from './firebase';

/* 
   ==========================================================================
   AUTH & DATA SERVICE
   ==========================================================================
*/

const DB_USERS = 'autosocial_db_users';
const SESSION_KEY = 'autosocial_session_uid';
const LOGS_KEY = 'autosocial_mock_logs';

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
// Auth Functions
// ============================================================================

export const getCurrentUser = () => {
    if (!isMock) return auth.currentUser;
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
    if (!isMock) await auth.signOut();
    else {
        localStorage.removeItem(SESSION_KEY);
        window.dispatchEvent(new Event('auth_state_change'));
    }
};

export const sendPasswordReset = async (email: string) => {
    if (!isMock) await auth.sendPasswordResetEmail(email);
};

export const changeUserPassword = async (newPassword: string) => {
    if (!isMock) {
        const user = auth.currentUser;
        if (user) await user.updatePassword(newPassword);
    }
};

// ============================================================================
// Firestore Data Operations
// ============================================================================

export const syncPostToCloud = async (userId: string, post: Post) => {
    if (isMock) return;
    
    // 數據瘦身：若已發佈且有連結，移除巨大的 Base64 數據以節省 Firestore 空間與傳輸成本
    const cleanPost = { ...post };
    if (cleanPost.status === 'published' && cleanPost.publishedUrl && cleanPost.mediaUrl?.startsWith('data:')) {
        delete cleanPost.mediaUrl;
    }

    try {
        await db.collection('users').doc(userId).collection('posts').doc(post.id).set(cleanPost);
    } catch (e) {
        console.error("Cloud Sync Failed", e);
        throw e;
    }
};

export const fetchUserPostsFromCloud = async (userId: string): Promise<Post[]> => {
    if (isMock) {
        try {
            return JSON.parse(localStorage.getItem('autosocial_posts') || '[]');
        } catch(e) { return []; }
    }
    try {
        const snap = await db.collection('users').doc(userId).collection('posts').orderBy('createdAt', 'desc').get();
        return snap.docs.map(doc => doc.data() as Post);
    } catch (e) {
        console.error("Fetch Cloud Posts Failed", e);
        return [];
    }
};

export const deletePostFromCloud = async (userId: string, postId: string) => {
    if (isMock) return;
    try {
        await db.collection('users').doc(userId).collection('posts').doc(postId).delete();
    } catch (e) { console.error(e); }
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
        if (!isMock) {
            const doc = await db.collection('users').doc(userId).get();
            return doc.exists ? (doc.data() as UserProfile) : null;
        } 
        return getMockDb(DB_USERS)[userId] || null;
    } catch (e) { return null; }
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
        referralCode: `REF-${user.uid.substring(0,5).toUpperCase()}`,
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
        await db.collection('brand_settings').doc(userId).set(settings, { merge: true });
    }
};

// --- Quota Logic ---

const deductQuota = async (userId: string, amount: number): Promise<boolean> => {
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
}

export const checkAndUseQuota = async (userId: string, amount: number = 1): Promise<boolean> => {
    const user = await getUserProfile(userId);
    if (!user || user.isSuspended) return false;
    if ((user.quota_used + amount) > user.quota_total) return false;
    return await deductQuota(userId, amount);
};

// ============================================================================
// Admin & Others
// ============================================================================

export const getAllUsers = async (): Promise<UserProfile[]> => {
    if (!isMock) {
        const snapshot = await db.collection('users').orderBy('created_at', 'desc').get();
        return snapshot.docs.map(doc => doc.data() as UserProfile);
    } 
    return Object.values(getMockDb(DB_USERS));
};

export const generateAdminKey = async (adminId: string, type: string, role?: UserRole, feature?: string): Promise<string> => {
    const keyString = `KEY-${Date.now().toString().slice(-4)}-${Math.floor(Math.random()*1000)}`;
    const data = { key: keyString, type, targetRole: role, targetFeature: feature, createdBy: adminId, createdAt: Date.now(), expiresAt: Date.now() + 3600000, isUsed: false };
    if (!isMock) await db.collection('admin_keys').doc(keyString).set(data);
    return keyString;
};

export const useAdminKey = async (userId: string, keyString: string): Promise<{ success: boolean; message: string }> => {
    if (!isMock) {
        const keyRef = db.collection('admin_keys').doc(keyString);
        try {
            return await db.runTransaction(async (t) => {
                const doc = await t.get(keyRef);
                if (!doc.exists || doc.data()?.isUsed) throw new Error("無效或已使用");
                const keyData = doc.data() as AdminKey;
                const userRef = db.collection('users').doc(userId);
                if (keyData.type === 'RESET_QUOTA') t.update(userRef, { quota_used: 0 });
                else if (keyData.type === 'UPGRADE_ROLE' && keyData.targetRole) t.update(userRef, { role: keyData.targetRole, quota_total: getQuotaForRole(keyData.targetRole) });
                t.update(keyRef, { isUsed: true });
                return { success: true, message: "兌換成功" };
            });
        } catch (e: any) { return { success: false, message: e.message }; }
    }
    return { success: false, message: "Mock 模式不支援" };
};

export const updateUserRole = async (userId: string, newRole: UserRole) => {
     if (!isMock) await db.collection('users').doc(userId).update({ role: newRole, quota_total: getQuotaForRole(newRole) });
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
    if (isMock) throw new Error("Mock 不支援邀請碼");
    const snapshot = await db.collection('users').where('referralCode', '==', code).limit(1).get();
    if (snapshot.empty) throw new Error("無效邀請碼");
    const reward = 50;
    await db.runTransaction(async (t) => {
         t.update(snapshot.docs[0].ref, { quota_total: firebase.firestore.FieldValue.increment(reward), referralCount: firebase.firestore.FieldValue.increment(1) });
         t.update(db.collection('users').doc(currentUserId), { quota_total: firebase.firestore.FieldValue.increment(reward), referredBy: code });
    });
    return { success: true, reward };
};

export const submitUserReport = async (report: Omit<UserReport, 'id'>) => {
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
export const getDashboardStats = async (): Promise<DashboardStats> => ({ totalUsers: 0, activeUsersToday: 0, totalApiCallsToday: 0, errorCountToday: 0 });

export const getSystemConfig = (): SystemConfig => JSON.parse(localStorage.getItem('sys_config') || '{"maintenanceMode": false, "dryRunMode": false}');
export const updateSystemConfig = (config: Partial<SystemConfig>) => localStorage.setItem('sys_config', JSON.stringify({ ...getSystemConfig(), ...config }));

export const resetUserQuota = async (userId: string) => {
    if (!isMock) await db.collection('users').doc(userId).update({ quota_used: 0 });
};

export const logUserActivity = async (logData: Omit<UsageLog, 'ts'>) => {
    if (!isMock) await db.collection('usage_logs').add({ ...logData, ts: Date.now() });
};

export const getUserUsageLogs = async (userId: string): Promise<UsageLog[]> => {
    if (isMock) return [];
    const snap = await db.collection('usage_logs').where('uid', '==', userId).get();
    return snap.docs.map(doc => doc.data() as UsageLog).sort((a, b) => b.ts - a.ts);
};

export const deleteUserUsageLogs = async (userId: string): Promise<void> => {
    if (isMock) return;
    const snap = await db.collection('usage_logs').where('uid', '==', userId).get();
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
};
