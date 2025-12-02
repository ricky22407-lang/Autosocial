

import { UserProfile, UserRole, AdminKey, SystemConfig, LogEntry, DashboardStats } from '../types';
import { auth, db, isMock, firebase } from './firebase';

/* 
   ==========================================================================
   AUTH SERVICE (Compat / v8 Style)
   ==========================================================================
*/

// Mock Keys
const DB_USERS = 'autosocial_db_users';
const SESSION_KEY = 'autosocial_session_uid';

// Helpers
const getDb = (key: string) => JSON.parse(localStorage.getItem(key) || '{}');
const saveDb = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

// --- Auth Helper ---
export const getCurrentUser = () => {
    if (!isMock) {
        return auth.currentUser;
    } else {
        const uid = localStorage.getItem(SESSION_KEY);
        if (uid) {
             const users = getDb(DB_USERS);
             const u = users[uid];
             return { uid: uid, email: u ? u.email : 'mock@example.com' };
        }
        return null;
    }
};

// --- Auth Subscription ---
export const subscribeAuth = (callback: (user: { uid: string, email: string } | null) => void) => {
    if (!isMock) {
        return auth.onAuthStateChanged(async (firebaseUser) => {
            if (firebaseUser) {
                // Check suspension
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
    } else {
        // Mock Subscription
        const check = () => {
             const uid = localStorage.getItem(SESSION_KEY);
             if(uid) {
                 const users = getDb(DB_USERS);
                 const u = users[uid];
                 const email = u ? u.email : 'demo@example.com';
                 const user = { uid, email };
                 callback(user);
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
    }
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
             users[uid] = { user_id: uid, email, role: 'admin', quota_total: 9999, quota_used: 0, created_at: Date.now(), isSuspended: false, unlockedFeatures: ['ANALYTICS', 'AUTOMATION', 'SEO'] } as UserProfile;
             saveDb(DB_USERS, users);
         }
         localStorage.setItem(SESSION_KEY, uid);
         window.dispatchEvent(new Event('auth_state_change'));
         return { user: { uid, email } };
    }

    if (!isMock) {
        const cred = await auth.signInWithEmailAndPassword(email, pass);
        return { user: cred.user };
    } else {
        const users = getDb(DB_USERS);
        const user = Object.values(users).find((u: any) => u.email === email) as UserProfile;
        if (user) {
            localStorage.setItem(SESSION_KEY, user.user_id);
            window.dispatchEvent(new Event('auth_state_change'));
            return { user: { uid: user.user_id, email: user.email } };
        }
        throw new Error("用戶不存在 (Mock Mode) - 請切換至「註冊」頁面建立帳號");
    }
};

export const register = async (email: string, pass: string) => {
    if (!isMock) {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        await createUserProfile({ uid: cred.user!.uid, email: email });
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
    if (!isMock) await auth.signOut();
    else {
        localStorage.removeItem(SESSION_KEY);
        window.dispatchEvent(new Event('auth_state_change'));
    }
};

// --- Password Management (Real + Mock) ---

export const sendPasswordReset = async (email: string) => {
    if (!isMock) {
        await auth.sendPasswordResetEmail(email);
    } else {
        // Mock delay
        await new Promise(r => setTimeout(r, 1000));
        console.log(`[Mock] Password reset email sent to ${email}`);
    }
};

export const changeUserPassword = async (newPassword: string) => {
    if (!isMock) {
        const user = auth.currentUser;
        if (user) {
            await user.updatePassword(newPassword);
        } else {
            throw new Error("用戶未登入");
        }
    } else {
        // Mock
        await new Promise(r => setTimeout(r, 1000));
        console.log(`[Mock] Password changed to ${newPassword}`);
    }
};

// --- User Data Operations ---

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
        if (!isMock) {
            const doc = await db.collection('users').doc(userId).get();
            return doc.exists ? (doc.data() as UserProfile) : null;
        } else {
            return getDb(DB_USERS)[userId] || null;
        }
    } catch (e) {
        console.error("Failed to get user profile", e);
        return null;
    }
};

export const createUserProfile = async (user: { uid: string, email: string }): Promise<UserProfile> => {
    const newUser: UserProfile = {
        user_id: user.uid,
        email: user.email,
        role: 'user',
        quota_total: 5,
        quota_used: 0,
        quota_reset_date: Date.now() + 30 * 24 * 60 * 60 * 1000,
        isSuspended: false,
        unlockedFeatures: [],
        created_at: Date.now(),
        updated_at: Date.now()
    };

    if (!isMock) {
        await db.collection('users').doc(user.uid).set(newUser);
    } else {
        const users = getDb(DB_USERS);
        users[user.uid] = newUser;
        saveDb(DB_USERS, users);
    }
    return newUser;
};

// --- Quota & Role Operations ---

export const checkAndUseQuota = async (userId: string): Promise<boolean> => {
    const user = await getUserProfile(userId);
    if (!user) return false;
    if (user.isSuspended) return false;

    // Check Reset Date
    if (Date.now() > user.quota_reset_date) {
        // Reset Logic
        const newReset = Date.now() + 30 * 24 * 60 * 60 * 1000;
        const total = getQuotaForRole(user.role);
        
        if (!isMock) {
            await db.collection('users').doc(userId).update({
                quota_used: 0,
                quota_total: total,
                quota_reset_date: newReset
            });
        } else {
            const users = getDb(DB_USERS);
            users[userId].quota_used = 0;
            users[userId].quota_total = total;
            users[userId].quota_reset_date = newReset;
            saveDb(DB_USERS, users);
        }
        return true; 
    }

    if (user.quota_used >= user.quota_total) return false;

    // Deduct
    if (!isMock) {
        await db.collection('users').doc(userId).update({
            quota_used: firebase.firestore.FieldValue.increment(1),
            updated_at: Date.now()
        });
    } else {
        const users = getDb(DB_USERS);
        users[userId].quota_used += 1;
        saveDb(DB_USERS, users);
    }
    return true;
};

// --- Admin Operations ---

export const getAllUsers = async (): Promise<UserProfile[]> => {
    if (!isMock) {
        const snapshot = await db.collection('users').orderBy('created_at', 'desc').get();
        return snapshot.docs.map(doc => doc.data() as UserProfile);
    } else {
        const users = getDb(DB_USERS);
        return Object.values(users);
    }
};

export const generateAdminKey = async (
    adminId: string, 
    type: 'RESET_QUOTA' | 'UPGRADE_ROLE' | 'UNLOCK_FEATURE', 
    role?: UserRole,
    feature?: 'ANALYTICS' | 'AUTOMATION' | 'SEO'
): Promise<string> => {
    const keyString = `KEY-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*10000)}`;
    const keyData: AdminKey = {
        key: keyString,
        type,
        targetRole: role,
        targetFeature: feature,
        createdBy: adminId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        isUsed: false
    };

    if (!isMock) {
        await db.collection('admin_keys').doc(keyString).set(keyData);
    } else {
        const keys = getDb('autosocial_admin_keys');
        keys[keyString] = keyData;
        saveDb('autosocial_admin_keys', keys);
    }
    return keyString;
};

export const useAdminKey = async (userId: string, keyString: string): Promise<{ success: boolean; message: string }> => {
    if (!isMock) {
        const keyRef = db.collection('admin_keys').doc(keyString);
        const userRef = db.collection('users').doc(userId);
        
        try {
            return await db.runTransaction(async (t) => {
                const doc = await t.get(keyRef);
                if (!doc.exists) throw new Error("無效的金鑰");
                const keyData = doc.data() as AdminKey;
                if (keyData.isUsed) throw new Error("此金鑰已被使用");
                if (Date.now() > keyData.expiresAt) throw new Error("此金鑰已過期");

                // Effect
                if (keyData.type === 'RESET_QUOTA') {
                    t.update(userRef, { quota_used: 0 });
                } else if (keyData.type === 'UPGRADE_ROLE' && keyData.targetRole) {
                    const newTotal = getQuotaForRole(keyData.targetRole);
                    t.update(userRef, { role: keyData.targetRole, quota_total: newTotal });
                } else if (keyData.type === 'UNLOCK_FEATURE' && keyData.targetFeature) {
                    t.update(userRef, { 
                        unlockedFeatures: firebase.firestore.FieldValue.arrayUnion(keyData.targetFeature) 
                    });
                }

                t.update(keyRef, { isUsed: true });
                return { success: true, message: "兌換成功！" };
            });
        } catch (e: any) {
            return { success: false, message: e.message };
        }
    } else {
        // Mock Implementation
        const keys = getDb('autosocial_admin_keys');
        const keyData = keys[keyString];
        if (!keyData) return { success: false, message: "無效的金鑰" };
        if (keyData.isUsed) return { success: false, message: "此金鑰已被使用" };
        
        const users = getDb(DB_USERS);
        const user = users[userId];
        
        if (keyData.type === 'RESET_QUOTA') {
            user.quota_used = 0;
        } else if (keyData.type === 'UPGRADE_ROLE' && keyData.targetRole) {
            user.role = keyData.targetRole;
            user.quota_total = getQuotaForRole(keyData.targetRole);
        } else if (keyData.type === 'UNLOCK_FEATURE' && keyData.targetFeature) {
             if(!user.unlockedFeatures) user.unlockedFeatures = [];
             user.unlockedFeatures.push(keyData.targetFeature);
        }
        
        keyData.isUsed = true;
        saveDb('autosocial_admin_keys', keys);
        saveDb(DB_USERS, users);
        return { success: true, message: "兌換成功！" };
    }
};

export const updateUserRole = async (userId: string, newRole: UserRole) => {
     const newTotal = getQuotaForRole(newRole);
     if (!isMock) {
         await db.collection('users').doc(userId).update({
             role: newRole,
             quota_total: newTotal
         });
     } else {
         const users = getDb(DB_USERS);
         if(users[userId]) {
             users[userId].role = newRole;
             users[userId].quota_total = newTotal;
             saveDb(DB_USERS, users);
         }
     }
};

export const manualUpdateQuota = async (userId: string, used: number, total: number) => {
    if (!isMock) {
        await db.collection('users').doc(userId).update({
            quota_used: used,
            quota_total: total
        });
    } else {
        const users = getDb(DB_USERS);
        if(users[userId]) {
            users[userId].quota_used = used;
            users[userId].quota_total = total;
            saveDb(DB_USERS, users);
        }
    }
};

export const toggleUserSuspension = async (userId: string) => {
     if (!isMock) {
         const doc = await db.collection('users').doc(userId).get();
         if(doc.exists) {
             const current = doc.data()?.isSuspended || false;
             await db.collection('users').doc(userId).update({ isSuspended: !current });
         }
     } else {
         const users = getDb(DB_USERS);
         if(users[userId]) {
             users[userId].isSuspended = !users[userId].isSuspended;
             saveDb(DB_USERS, users);
         }
     }
};

// --- Logs & Stats (Mock-ish implementation for simplicity) ---

export const getSystemLogs = (): LogEntry[] => {
    // In real app, query 'logs' collection
    return [];
};

export const getDashboardStats = async (): Promise<DashboardStats> => {
    const users = await getAllUsers();
    return {
        totalUsers: users.length,
        activeUsersToday: users.filter(u => u.updated_at > Date.now() - 86400000).length,
        totalApiCallsToday: users.reduce((acc, u) => acc + (u.updated_at > Date.now() - 86400000 ? 1 : 0), 0), // Rough estimate
        errorCountToday: 0
    };
};

export const getSystemConfig = (): SystemConfig => {
    return JSON.parse(localStorage.getItem('sys_config') || '{"maintenanceMode": false, "dryRunMode": false}');
};

export const updateSystemConfig = (config: Partial<SystemConfig>) => {
    const current = getSystemConfig();
    const next = { ...current, ...config };
    localStorage.setItem('sys_config', JSON.stringify(next));
};

export const resetUserQuota = async (userId: string) => {
    if (!isMock) {
        await db.collection('users').doc(userId).update({ quota_used: 0 });
    } else {
        const users = getDb(DB_USERS);
        if(users[userId]) {
            users[userId].quota_used = 0;
            saveDb(DB_USERS, users);
        }
    }
};