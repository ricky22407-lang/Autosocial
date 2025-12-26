
import { db, isMock, firebase } from '../firebase';
import { UserProfile, BrandSettings, UsageLog, Post, UserReport, QuotaTransaction } from '../../types';
import { MockStore } from '../mockStore';
import { v4 as uuidv4 } from 'uuid';

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
        if (!isMock) {
            const doc = await db.collection('users').doc(userId).get();
            return doc.exists ? (doc.data() as UserProfile) : null;
        } 
        return MockStore.getUser(userId);
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
        last_api_call_timestamp: 0,
        created_at: Date.now(),
        updated_at: Date.now()
    };

    if (!isMock) {
        await db.collection('users').doc(user.uid).set(newUser);
    } else {
        MockStore.saveUser(newUser);
    }
    return newUser;
};

/**
 * Execute a Quota Transaction (Ledger System)
 * Replaces simple increments with strict accounting.
 */
export const checkAndUseQuota = async (
    userId: string, 
    amount: number = 1, 
    action: string = 'GENERAL_API_CALL',
    metadata: any = {}
): Promise<boolean> => {
    
    // MOCK MODE (Simplified)
    if (isMock) {
        const user = MockStore.getUser(userId);
        if (!user || user.isSuspended) return false;
        
        // Rate Limit Check (Mock)
        const now = Date.now();
        if (user.last_api_call_timestamp && (now - user.last_api_call_timestamp < 2000)) {
            console.warn("Mock Rate Limit hit (2s)");
            // In mock, we log but allow for dev speed
        }

        if ((user.quota_used + amount) > user.quota_total) return false;
        
        user.quota_used += amount;
        user.last_api_call_timestamp = now;
        MockStore.saveUser(user);
        
        // Mock Ledger Log
        console.log(`[Ledger Mock] ${action}: -${amount} pts. Balance: ${user.quota_total - user.quota_used}`);
        return true;
    }

    // REAL FIREBASE TRANSACTION
    const userRef = db.collection('users').doc(userId);
    const ledgerRef = db.collection('quota_transactions').doc();

    try {
        await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new Error("User not found");

            const userData = userDoc.data() as UserProfile;
            
            // 1. Suspension Check
            if (userData.isSuspended) throw new Error("Account Suspended");

            // 2. Rate Limiting (5 seconds cooldown)
            const now = Date.now();
            if (userData.last_api_call_timestamp) {
                const timeDiff = now - userData.last_api_call_timestamp;
                if (timeDiff < 5000) { // 5000ms
                     throw new Error(`操作過快！請等待 ${Math.ceil((5000 - timeDiff)/1000)} 秒後再試。`);
                }
            }

            // 3. Balance Check
            const currentUsed = userData.quota_used || 0;
            const total = userData.quota_total || 0;
            if (currentUsed + amount > total) {
                throw new Error("配額不足，請充值或升級方案。");
            }

            // 4. Update User State
            const newUsed = currentUsed + amount;
            t.update(userRef, {
                quota_used: newUsed,
                last_api_call_timestamp: now,
                updated_at: now
            });

            // 5. Write to Ledger
            const transactionRecord: QuotaTransaction = {
                txId: ledgerRef.id,
                userId: userId,
                amount: -amount, // Negative for cost
                balanceAfter: total - newUsed,
                action: action,
                timestamp: now,
                metadata: metadata
            };
            t.set(ledgerRef, transactionRecord);
        });

        return true;
    } catch (e: any) {
        console.error("Quota Transaction Failed:", e.message);
        // If it's our specific logic error, we can throw it up to UI or return false
        if (e.message.includes("操作過快") || e.message.includes("配額不足")) {
             alert(e.message); // Simple alert for now, ideally UI handles error state
             return false;
        }
        return false;
    }
};

export const updateUserSettings = async (userId: string, settings: BrandSettings) => {
    if (!isMock) await db.collection('brand_settings').doc(userId).set(settings, { merge: true });
};

export const redeemReferralCode = async (currentUserId: string, code: string): Promise<{ success: boolean; reward: number }> => {
    const REWARD_AMOUNT = 50;
    const cleanCode = code.trim().toUpperCase();

    if (!isMock) {
        try {
            // 1. Find Referrer by Code
            const referrerSnapshot = await db.collection('users').where('referralCode', '==', cleanCode).limit(1).get();
            if (referrerSnapshot.empty) throw new Error("邀請碼無效或不存在");

            const referrerDoc = referrerSnapshot.docs[0];
            const referrerRef = referrerDoc.ref;
            const userRef = db.collection('users').doc(currentUserId);
            
            const userLedgerRef = db.collection('quota_transactions').doc();
            const referrerLedgerRef = db.collection('quota_transactions').doc();

            // 2. Transaction
            await db.runTransaction(async (t) => {
                const currentUserDoc = await t.get(userRef);
                if (!currentUserDoc.exists) throw new Error("User not found");
                const currentUserData = currentUserDoc.data() as UserProfile;

                if (currentUserData.referredBy) throw new Error("您已經領取過新人獎勵了 (每人限一次)");
                if (currentUserData.referralCode === cleanCode) throw new Error("不能輸入自己的邀請碼");
                if (currentUserDoc.id === referrerDoc.id) throw new Error("不能輸入自己的邀請碼");

                // Update Me
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

                // Ledger Entry for Me
                t.set(userLedgerRef, {
                    txId: userLedgerRef.id,
                    userId: currentUserId,
                    amount: REWARD_AMOUNT,
                    balanceAfter: (currentUserData.quota_total || 0) - (currentUserData.quota_used || 0) + REWARD_AMOUNT,
                    action: 'REFERRAL_REWARD_CLAIM',
                    timestamp: Date.now(),
                    metadata: { code: cleanCode }
                });

                // Ledger Entry for Referrer (We can't easily get referrer balance in same read efficiently without reading it first, doing best effort estimate or omitting balanceAfter for referrer if reading is costly, but let's read it)
                const referrerData = referrerDoc.data() as UserProfile;
                t.set(referrerLedgerRef, {
                     txId: referrerLedgerRef.id,
                     userId: referrerDoc.id,
                     amount: REWARD_AMOUNT,
                     balanceAfter: (referrerData.quota_total || 0) - (referrerData.quota_used || 0) + REWARD_AMOUNT,
                     action: 'REFERRAL_BONUS',
                     timestamp: Date.now(),
                     metadata: { fromUser: currentUserId }
                });
            });
            return { success: true, reward: REWARD_AMOUNT };
        } catch (e: any) {
            throw new Error(e.message || "兌換失敗");
        }
    } else {
        // Mock Logic
        const me = MockStore.getUser(currentUserId);
        if (!me) throw new Error("User not found");
        if (me.referredBy) throw new Error("您已經領取過新人獎勵了");
        if (me.referralCode === cleanCode) throw new Error("不能輸入自己的邀請碼");

        const referrer = MockStore.findUserByReferral(cleanCode);
        if (!referrer) throw new Error("邀請碼無效");
        if (referrer.user_id === currentUserId) throw new Error("不能輸入自己的邀請碼");

        me.referredBy = cleanCode;
        me.quota_total = (me.quota_total || 0) + REWARD_AMOUNT;
        referrer.referralCount = (referrer.referralCount || 0) + 1;
        referrer.quota_total = (referrer.quota_total || 0) + REWARD_AMOUNT;

        MockStore.saveUser(me);
        MockStore.saveUser(referrer);
        return { success: true, reward: REWARD_AMOUNT };
    }
};

// --- Log & Reports ---
export const logUserActivity = async (logData: Omit<UsageLog, 'ts'>) => {
    if (!isMock) await db.collection('usage_logs').add({ ...logData, ts: Date.now() });
    else MockStore.saveLog({ ...logData, ts: Date.now() });
};

export const submitUserReport = async (report: Omit<UserReport, 'id'>) => {
    if (!isMock) await db.collection('user_reports').add(report);
    // No Mock implementation needed for now
};

export const getUserReports = async (): Promise<UserReport[]> => {
    if (!isMock) {
        const snap = await db.collection('user_reports').orderBy('timestamp', 'desc').get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserReport));
    } 
    return [];
};

export const getUserUsageLogs = async (userId: string): Promise<UsageLog[]> => { 
    // Simplified: Just returning empty for now to save space, real impl needs Firestore query
    if (!isMock) {
        const snap = await db.collection('usage_logs').where('uid', '==', userId).orderBy('ts', 'desc').limit(100).get();
        return snap.docs.map(doc => doc.data() as UsageLog);
    }
    return [];
};

export const deleteUserUsageLogs = async (userId: string): Promise<void> => {
    if (!isMock) {
        const snap = await db.collection('usage_logs').where('uid', '==', userId).get();
        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
};

// --- Post Cloud Sync ---
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
    // Cleanup huge datauris if published
    if (cleanPost.status === 'published' && cleanPost.publishedUrl && cleanPost.mediaUrl?.startsWith('data:')) {
        delete cleanPost.mediaUrl;
    }
    try {
        await db.collection('users').doc(userId).collection('posts').doc(post.id).set(cleanPost);
    } catch (e) { console.error("Cloud Sync Failed", e); }
};

export const fetchUserPostsFromCloud = async (userId: string): Promise<Post[]> => {
    if (isMock) {
        try { return JSON.parse(localStorage.getItem('autosocial_posts') || '[]'); } catch(e) { return []; }
    }
    try {
        const snap = await db.collection('users').doc(userId).collection('posts').orderBy('createdAt', 'desc').get();
        return snap.docs.map(doc => doc.data() as Post);
    } catch (e) { return []; }
};

export const deletePostFromCloud = async (userId: string, postId: string) => {
    if (isMock) {
        const posts = JSON.parse(localStorage.getItem('autosocial_posts') || '[]');
        localStorage.setItem('autosocial_posts', JSON.stringify(posts.filter((p: any) => p.id !== postId)));
        return;
    }
    try { await db.collection('users').doc(userId).collection('posts').doc(postId).delete(); } catch (e) {}
};
