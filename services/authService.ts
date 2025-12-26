
import { UserProfile, UserRole, AdminKey, SystemConfig, LogEntry, DashboardStats, BrandSettings, UserReport, UsageLog, Post } from '../types';
import { auth, db, isMock, firebase } from './firebase';

const DB_USERS = 'autosocial_db_users';
const SESSION_KEY = 'autosocial_session_uid';

const getMockDb = (key: string) => {
    try {
        return JSON.parse(localStorage.getItem(key) || '{}');
    } catch (e) {
        return {};
    }
};

const saveMockDb = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

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

export const getCurrentUser = () => {
    if (!isMock) return auth.currentUser;
    const uid = localStorage.getItem(SESSION_KEY);
    if (uid) {
         const users = getMockDb(DB_USERS);
         const u = users[uid];
         return { uid: uid, email: u ? u.email : 'demo@example.com' };
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
    // 1. Mock Admin Login (Backdoor for Demo/Dev)
    if (isMock && email === 'ricky22407@gmail.com' && pass === 'testautosocial1106') {
         const uid = 'demo_admin';
         const users = getMockDb(DB_USERS);
         if (!users[uid]) {
             users[uid] = { 
                 user_id: uid, 
                 email, 
                 role: 'admin', 
                 quota_total: 99999, 
                 quota_used: 0, 
                 created_at: Date.now(), 
                 isSuspended: false, 
                 unlockedFeatures: ['ANALYTICS', 'AUTOMATION', 'SEO', 'THREADS'] 
             } as UserProfile;
             saveMockDb(DB_USERS, users);
         }
         localStorage.setItem(SESSION_KEY, uid);
         window.dispatchEvent(new Event('auth_state_change'));
         return { user: { uid, email } };
    }

    // 2. Real Firebase Login
    if (!isMock) {
        const cred = await auth.signInWithEmailAndPassword(email, pass);
        
        // --- Admin Restoration Logic ---
        // Automatically promote this specific email to admin upon login
        if (email === 'ricky22407@gmail.com') {
            try {
                await db.collection('users').doc(cred.user!.uid).set({
                    role: 'admin',
                    quota_total: 99999,
                    unlockedFeatures: ['ANALYTICS', 'AUTOMATION', 'SEO', 'THREADS'],
                    updated_at: Date.now()
                }, { merge: true });
                console.log("👑 Admin privileges restored for:", email);
            } catch (e) {
                console.error("Failed to restore admin privileges:", e);
            }
        }
        // -------------------------------

        return { user: cred.user };
    } 
    
    // 3. Mock User Login
    const users = getMockDb(DB_USERS);
    const user = Object.values(users).find((u: any) => u.email === email) as UserProfile;
    if (user) {
        localStorage.setItem(SESSION_KEY, user.user_id);
        window.dispatchEvent(new Event('auth_state_change'));
        return { user: { uid: user.user_id, email: user.email } };
    }
    return await register(email, pass);
};

export const register = async (email: string, pass: string) => {
    if (!isMock) {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        await createUserProfile({ uid: cred.user!.uid, email: email });
        
        // --- Admin Restoration Logic (Registration Case) ---
        if (email === 'ricky22407@gmail.com') {
             await db.collection('users').doc(cred.user!.uid).update({
                role: 'admin',
                quota_total: 99999,
                unlockedFeatures: ['ANALYTICS', 'AUTOMATION', 'SEO', 'THREADS']
            });
        }
        
        return { user: cred.user };
    } 
    
    const uid = 'user_' + Date.now();
    await createUserProfile({ uid, email });
    localStorage.setItem(SESSION_KEY, uid);
    window.dispatchEvent(new Event('auth_state_change'));
    return { user: { uid, email } };
};

export const sendPasswordReset = async (email: string) => {
    if (!isMock) {
        await auth.sendPasswordResetEmail(email);
    } else {
        console.log(`[Mock] Password reset sent to ${email}`);
    }
};

export const logout = async () => {
    if (!isMock) await auth.signOut();
    else {
        localStorage.removeItem(SESSION_KEY);
        window.dispatchEvent(new Event('auth_state_change'));
    }
};

export const syncPostToCloud = async (userId: string, post: Post) => {
    if (isMock) {
        const posts = JSON.parse(localStorage.getItem('autosocial_posts') || '[]');
        const idx = posts.findIndex((p: any) => p.id === post.id);
        if (idx > -1) posts[idx] = post;
        else posts.unshift(post);
        localStorage.setItem('autosocial_posts', JSON.stringify(posts));
        return;
    }
    const cleanPost = { ...post };
    if (cleanPost.status === 'published' && cleanPost.publishedUrl && cleanPost.mediaUrl?.startsWith('data:')) {
        delete cleanPost.mediaUrl;
    }
    try {
        await db.collection('users').doc(userId).collection('posts').doc(post.id).set(cleanPost);
    } catch (e) {
        console.error("Cloud Sync Failed", e);
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
        return [];
    }
};

export const deletePostFromCloud = async (userId: string, postId: string) => {
    if (isMock) {
        const posts = JSON.parse(localStorage.getItem('autosocial_posts') || '[]');
        localStorage.setItem('autosocial_posts', JSON.stringify(posts.filter((p: any) => p.id !== postId)));
        return;
    }
    try { await db.collection('users').doc(userId).collection('posts').doc(postId).delete(); } catch (e) {}
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

export const checkAndUseQuota = async (userId: string, amount: number = 1): Promise<boolean> => {
    const user = await getUserProfile(userId);
    if (!user || user.isSuspended) return false;
    if ((user.quota_used + amount) > user.quota_total) return false;

    if (!isMock) {
        await db.collection('users').doc(userId).update({
            quota_used: firebase.firestore.FieldValue.increment(amount),
            updated_at: Date.now()
        });
    } else {
        const users = getMockDb(DB_USERS);
        if (users[userId]) {
            users[userId].quota_used += amount;
            saveMockDb(DB_USERS, users);
        }
    }
    return true;
};

export const updateUserSettings = async (userId: string, settings: BrandSettings) => {
    if (!isMock) await db.collection('brand_settings').doc(userId).set(settings, { merge: true });
};

// Admin Helpers
export const getAllUsers = async (): Promise<UserProfile[]> => {
    if (!isMock) {
        const snap = await db.collection('users').orderBy('created_at', 'desc').get();
        return snap.docs.map(doc => doc.data() as UserProfile);
    } 
    return Object.values(getMockDb(DB_USERS));
};

export const generateAdminKey = async (adminId: string, type: string, role?: UserRole, feature?: string): Promise<string> => {
    const featureCode = feature ? `-${feature.substring(0,3)}` : '';
    const key = `KEY${featureCode}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*100)}`;
    const data: AdminKey = { 
        key, 
        type: type as any, 
        targetRole: role, 
        targetFeature: feature as any, 
        createdBy: adminId, 
        createdAt: Date.now(), 
        expiresAt: Date.now() + 3600000 * 24, // 24 Hours valid
        isUsed: false 
    };
    
    if (!isMock) await db.collection('admin_keys').doc(key).set(data);
    else {
        const keys = getMockDb('autosocial_keys');
        keys[key] = data;
        saveMockDb('autosocial_keys', keys);
    }
    return key;
};

export const useAdminKey = async (userId: string, keyString: string): Promise<{ success: boolean; message: string }> => {
    if (!isMock) {
        const keyRef = db.collection('admin_keys').doc(keyString);
        try {
            return await db.runTransaction(async (t) => {
                const doc = await t.get(keyRef);
                if (!doc.exists) throw new Error("無效的金鑰");
                const keyData = doc.data() as AdminKey;
                if (keyData.isUsed) throw new Error("此金鑰已被使用");
                
                const userRef = db.collection('users').doc(userId);
                
                if (keyData.type === 'RESET_QUOTA') {
                    t.update(userRef, { quota_used: 0 });
                } 
                else if (keyData.type === 'UPGRADE_ROLE' && keyData.targetRole) {
                    t.update(userRef, { role: keyData.targetRole, quota_total: getQuotaForRole(keyData.targetRole) });
                } 
                else if (keyData.type === 'UNLOCK_FEATURE' && keyData.targetFeature) {
                    t.update(userRef, { 
                        unlockedFeatures: firebase.firestore.FieldValue.arrayUnion(keyData.targetFeature) 
                    });
                }

                t.update(keyRef, { isUsed: true, usedBy: userId, usedAt: Date.now() });
                return { success: true, message: "金鑰兌換成功！" };
            });
        } catch (e: any) { return { success: false, message: e.message }; }
    } else {
        const keys = getMockDb('autosocial_keys');
        const kData = keys[keyString];
        if (!kData || kData.isUsed) return { success: false, message: "無效或已使用" };
        
        const users = getMockDb(DB_USERS);
        const user = users[userId];
        
        if (kData.type === 'RESET_QUOTA') user.quota_used = 0;
        else if (kData.type === 'UPGRADE_ROLE') {
            user.role = kData.targetRole;
            user.quota_total = getQuotaForRole(kData.targetRole);
        } else if (kData.type === 'UNLOCK_FEATURE') {
            if(!user.unlockedFeatures) user.unlockedFeatures = [];
            if(!user.unlockedFeatures.includes(kData.targetFeature)) user.unlockedFeatures.push(kData.targetFeature);
        }
        
        kData.isUsed = true;
        saveMockDb('autosocial_keys', keys);
        saveMockDb(DB_USERS, users);
        return { success: true, message: "兌換成功 (Mock)" };
    }
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

export const resetUserQuota = async (userId: string) => {
    if (!isMock) await db.collection('users').doc(userId).update({ quota_used: 0 });
};

export const submitUserReport = async (report: Omit<UserReport, 'id'>) => {
    if (!isMock) await db.collection('user_reports').add(report);
};

export const getUserReports = async (): Promise<UserReport[]> => {
    if (!isMock) {
        const snap = await db.collection('user_reports').orderBy('timestamp', 'desc').get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserReport));
    } 
    return [];
};

export const getDashboardStats = async (): Promise<DashboardStats> => {
    const users = await getAllUsers();
    let apiTotal = 0;
    if (!isMock) { 
        const doc = await db.collection('system_stats').doc('api_usage').get(); 
        if (doc.exists) apiTotal = doc.data()?.total_calls || 0; 
    }
    return { totalUsers: users.length, activeUsersToday: Math.floor(users.length * 0.3), totalApiCallsToday: apiTotal || 128, errorCountToday: 0 };
};

export const getSystemLogs = (): LogEntry[] => [];
export const getSystemConfig = (): SystemConfig => JSON.parse(localStorage.getItem('sys_config') || '{"maintenanceMode": false, "dryRunMode": false}');
export const updateSystemConfig = (config: Partial<SystemConfig>) => localStorage.setItem('sys_config', JSON.stringify({ ...getSystemConfig(), ...config }));
export const logUserActivity = async (logData: Omit<UsageLog, 'ts'>) => {
    if (!isMock) await db.collection('usage_logs').add({ ...logData, ts: Date.now() });
};
export const getUserUsageLogs = async (userId: string): Promise<UsageLog[]> => [];
export const deleteUserUsageLogs = async (userId: string): Promise<void> => {};

export const redeemReferralCode = async (currentUserId: string, code: string): Promise<{ success: boolean; reward: number }> => {
    const REWARD_AMOUNT = 50;
    const cleanCode = code.trim().toUpperCase();

    if (!isMock) {
        try {
            // 1. Find Referrer by Code
            const referrerSnapshot = await db.collection('users').where('referralCode', '==', cleanCode).limit(1).get();
            
            if (referrerSnapshot.empty) {
                throw new Error("邀請碼無效或不存在");
            }

            const referrerDoc = referrerSnapshot.docs[0];
            const referrerRef = referrerDoc.ref;
            const userRef = db.collection('users').doc(currentUserId);

            // 2. Transaction
            await db.runTransaction(async (t) => {
                const currentUserDoc = await t.get(userRef);
                if (!currentUserDoc.exists) throw new Error("Current user not found");
                
                const currentUserData = currentUserDoc.data() as UserProfile;

                // Validation
                if (currentUserData.referredBy) {
                    throw new Error("您已經領取過新人獎勵了 (每人限一次)");
                }
                if (currentUserData.referralCode === cleanCode) {
                    throw new Error("不能輸入自己的邀請碼");
                }
                if (currentUserDoc.id === referrerDoc.id) {
                    throw new Error("不能輸入自己的邀請碼");
                }

                // Update Current User
                t.update(userRef, {
                    referredBy: cleanCode,
                    quota_total: firebase.firestore.FieldValue.increment(REWARD_AMOUNT),
                    updated_at: Date.now()
                });

                // Update Referrer
                t.update(referrerRef, {
                    referralCount: firebase.firestore.FieldValue.increment(1),
                    quota_total: firebase.firestore.FieldValue.increment(REWARD_AMOUNT),
                    updated_at: Date.now()
                });
            });

            return { success: true, reward: REWARD_AMOUNT };

        } catch (e: any) {
            console.error("Referral Error:", e);
            throw new Error(e.message || "兌換失敗，請稍後再試");
        }
    } else {
        // --- Mock Mode Logic ---
        const users = getMockDb(DB_USERS);
        const me = users[currentUserId];
        
        if (!me) throw new Error("User not found");
        if (me.referredBy) throw new Error("您已經領取過新人獎勵了");
        if (me.referralCode === cleanCode) throw new Error("不能輸入自己的邀請碼");

        const referrer = Object.values(users).find((u: any) => u.referralCode === cleanCode) as UserProfile;
        
        if (!referrer) throw new Error("邀請碼無效");
        if (referrer.user_id === currentUserId) throw new Error("不能輸入自己的邀請碼");

        // Execute Updates
        me.referredBy = cleanCode;
        me.quota_total = (me.quota_total || 0) + REWARD_AMOUNT;
        
        referrer.referralCount = (referrer.referralCount || 0) + 1;
        referrer.quota_total = (referrer.quota_total || 0) + REWARD_AMOUNT;

        saveMockDb(DB_USERS, users);
        return { success: true, reward: REWARD_AMOUNT };
    }
};
