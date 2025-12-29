
import { db, isMock, firebase } from '../firebase';
import { UserProfile, BrandSettings, UsageLog, Post, UserReport, QuotaTransaction, QuotaBatch } from '../../types';
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
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    // Create initial batch
    const initialBatch: QuotaBatch = {
        id: uuidv4(),
        amount: 30,
        initialAmount: 30,
        expiresAt: now + ONE_YEAR_MS,
        source: 'trial',
        addedAt: now
    };

    const newUser: UserProfile = {
        user_id: user.uid,
        email: user.email,
        role: 'user', 
        quota_total: 30, 
        quota_used: 0,
        quota_reset_date: initialBatch.expiresAt, // Legacy support
        quota_batches: [initialBatch], // New Batch System
        expiry_warning_level: 0,
        isSuspended: false,
        unlockedFeatures: [],
        referralCode: `REF-${user.uid.substring(0,5).toUpperCase()}`,
        referralCount: 0,
        last_api_call_timestamp: 0,
        created_at: now,
        updated_at: now
    };

    if (!isMock) {
        await db.collection('users').doc(user.uid).set(newUser);
    } else {
        MockStore.saveUser(newUser);
    }
    return newUser;
};

/**
 * Execute a Quota Transaction (FIFO Batch Consumption)
 */
export const checkAndUseQuota = async (
    userId: string, 
    amount: number = 1, 
    action: string = 'GENERAL_API_CALL',
    metadata: any = {}
): Promise<boolean> => {
    
    // MOCK MODE (Simplified for Dev)
    if (isMock) {
        const user = MockStore.getUser(userId);
        if (!user || user.isSuspended) return false;
        
        // Mock simple total check
        if (user.quota_total < amount) return false;
        user.quota_total -= amount;
        user.quota_used += amount;
        
        MockStore.saveUser(user);
        return true;
    }

    // REAL FIREBASE TRANSACTION
    const userRef = db.collection('users').doc(userId);
    const ledgerRef = db.collection('quota_transactions').doc();

    try {
        await db.runTransaction(async (t: any) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new Error("User not found");

            const userData = userDoc.data() as UserProfile;
            const now = Date.now();
            
            // 1. Suspension Check
            if (userData.isSuspended) throw new Error("Account Suspended");

            // 2. Rate Limiting
            if (userData.last_api_call_timestamp) {
                const timeDiff = now - userData.last_api_call_timestamp;
                if (timeDiff < 2000) { // 2s soft limit to prevent abuse
                     // throw new Error(`操作過快`); // Optional: strict mode
                }
            }

            // 3. Batch Logic (Migration on the fly if needed)
            let batches: QuotaBatch[] = userData.quota_batches || [];
            
            // If legacy user (no batches), convert total to a single batch
            if (batches.length === 0 && userData.quota_total > 0) {
                batches.push({
                    id: 'legacy_migration',
                    amount: userData.quota_total,
                    initialAmount: userData.quota_total,
                    expiresAt: userData.quota_reset_date || (now + 365 * 24 * 60 * 60 * 1000),
                    source: 'admin_gift',
                    addedAt: now
                });
            }

            // 4. Filter Expired & Sort by Expiry (FIFO)
            // We use valid batches only
            let validBatches = batches
                .filter(b => b.expiresAt > now && b.amount > 0)
                .sort((a, b) => a.expiresAt - b.expiresAt);

            // 5. Calculate Total Available
            const totalAvailable = validBatches.reduce((sum, b) => sum + b.amount, 0);
            
            if (totalAvailable < amount) {
                throw new Error(`配額不足 (需 ${amount} 點，剩餘 ${totalAvailable} 點)`);
            }

            // 6. Consume Points (FIFO)
            let remainingCost = amount;
            const updatedBatches: QuotaBatch[] = [];
            
            // Reconstruct the batches array with updated amounts
            // We iterate through validBatches to deduct, then append any valid batches we didn't touch
            // BUT careful: validBatches is a sorted subset. We need to preserve the full set minus expired/empty.
            // Simpler approach: Map over the valid sorted ones, deduct, then merge results.
            
            for (let i = 0; i < validBatches.length; i++) {
                let batch = { ...validBatches[i] };
                if (remainingCost > 0) {
                    if (batch.amount >= remainingCost) {
                        batch.amount -= remainingCost;
                        remainingCost = 0;
                    } else {
                        remainingCost -= batch.amount;
                        batch.amount = 0; // Empty this batch
                    }
                }
                if (batch.amount > 0) {
                    updatedBatches.push(batch);
                }
            }

            // 7. Update User Data
            const newTotal = updatedBatches.reduce((sum, b) => sum + b.amount, 0);
            // Find earliest expiry for legacy support field
            const nextExpiry = updatedBatches.length > 0 ? updatedBatches[0].expiresAt : 0;

            t.update(userRef, {
                quota_batches: updatedBatches,
                quota_total: newTotal, // Sync total
                quota_reset_date: nextExpiry,
                quota_used: firebase.firestore.FieldValue.increment(amount),
                last_api_call_timestamp: now,
                updated_at: now
            });

            // 8. Write to Ledger
            const transactionRecord: QuotaTransaction = {
                txId: ledgerRef.id,
                userId: userId,
                amount: -amount,
                balanceAfter: newTotal,
                action: action,
                timestamp: now,
                metadata: metadata
            };
            t.set(ledgerRef, transactionRecord);
        });

        return true;
    } catch (e: any) {
        console.error("Quota Transaction Failed:", e.message);
        if (e.message.includes("操作過快") || e.message.includes("配額不足")) {
             alert(e.message); 
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
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

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

            await db.runTransaction(async (t: any) => {
                const currentUserDoc = await t.get(userRef);
                if (!currentUserDoc.exists) throw new Error("User not found");
                const currentUserData = currentUserDoc.data() as UserProfile;

                if (currentUserData.referredBy) throw new Error("您已經領取過新人獎勵了 (每人限一次)");
                if (currentUserData.referralCode === cleanCode) throw new Error("不能輸入自己的邀請碼");
                if (currentUserDoc.id === referrerDoc.id) throw new Error("不能輸入自己的邀請碼");

                const now = Date.now();
                const expiry = now + ONE_YEAR_MS;

                // Create Batch for Me
                const myBatch: QuotaBatch = {
                    id: uuidv4(),
                    amount: REWARD_AMOUNT,
                    initialAmount: REWARD_AMOUNT,
                    expiresAt: expiry,
                    source: 'referral',
                    addedAt: now
                };

                // Create Batch for Referrer
                const refBatch: QuotaBatch = {
                    id: uuidv4(),
                    amount: REWARD_AMOUNT,
                    initialAmount: REWARD_AMOUNT,
                    expiresAt: expiry,
                    source: 'referral',
                    addedAt: now
                };

                // Update Me
                const myBatches = [...(currentUserData.quota_batches || []), myBatch];
                // Clean migration if needed
                if (!currentUserData.quota_batches && currentUserData.quota_total > 0) {
                     myBatches.unshift({
                        id: 'legacy_ref_mig', amount: currentUserData.quota_total, initialAmount: currentUserData.quota_total,
                        expiresAt: currentUserData.quota_reset_date || expiry, source: 'trial', addedAt: now
                     });
                }
                // Sort by earliest expiry
                myBatches.sort((a,b) => a.expiresAt - b.expiresAt);

                t.update(userRef, {
                    referredBy: cleanCode,
                    quota_batches: myBatches,
                    quota_total: myBatches.reduce((s,b) => s + b.amount, 0),
                    quota_reset_date: myBatches[0].expiresAt, // Update earliest expiry
                    expiry_warning_level: 0,
                    updated_at: now
                });

                // Update Referrer
                const referrerData = referrerDoc.data() as UserProfile;
                const refBatches = [...(referrerData.quota_batches || []), refBatch];
                if (!referrerData.quota_batches && referrerData.quota_total > 0) {
                     refBatches.unshift({
                        id: 'legacy_ref_mig_host', amount: referrerData.quota_total, initialAmount: referrerData.quota_total,
                        expiresAt: referrerData.quota_reset_date || expiry, source: 'trial', addedAt: now
                     });
                }
                refBatches.sort((a,b) => a.expiresAt - b.expiresAt);

                t.update(referrerRef, {
                    referralCount: firebase.firestore.FieldValue.increment(1),
                    quota_batches: refBatches,
                    quota_total: refBatches.reduce((s,b) => s + b.amount, 0),
                    quota_reset_date: refBatches[0].expiresAt,
                    expiry_warning_level: 0,
                    updated_at: now
                });

                // Ledger
                t.set(userLedgerRef, {
                    txId: userLedgerRef.id, userId: currentUserId, amount: REWARD_AMOUNT, balanceAfter: myBatches.reduce((s,b) => s + b.amount, 0),
                    action: 'REFERRAL_REWARD_CLAIM', timestamp: now, metadata: { code: cleanCode }
                });
                t.set(referrerLedgerRef, {
                     txId: referrerLedgerRef.id, userId: referrerDoc.id, amount: REWARD_AMOUNT, balanceAfter: refBatches.reduce((s,b) => s + b.amount, 0),
                     action: 'REFERRAL_BONUS', timestamp: now, metadata: { fromUser: currentUserId }
                });
            });
            return { success: true, reward: REWARD_AMOUNT };
        } catch (e: any) {
            throw new Error(e.message || "兌換失敗");
        }
    } else {
        // Mock (Simplified)
        return { success: true, reward: REWARD_AMOUNT };
    }
};

// ... (Other functions remain same) ...
export const logUserActivity = async (logData: Omit<UsageLog, 'ts'>) => {
    if (!isMock) await db.collection('usage_logs').add({ ...logData, ts: Date.now() });
    else MockStore.saveLog({ ...logData, ts: Date.now() });
};

export const submitUserReport = async (report: Omit<UserReport, 'id'>) => {
    if (!isMock) await db.collection('user_reports').add(report);
};

export const getUserReports = async (): Promise<UserReport[]> => {
    if (!isMock) {
        const snap = await db.collection('user_reports').orderBy('timestamp', 'desc').get();
        return snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as UserReport));
    } 
    return [];
};

export const getUserUsageLogs = async (userId: string): Promise<UsageLog[]> => { 
    if (!isMock) {
        const snap = await db.collection('usage_logs').where('uid', '==', userId).orderBy('ts', 'desc').limit(100).get();
        return snap.docs.map((doc: any) => doc.data() as UsageLog);
    }
    return [];
};

export const deleteUserUsageLogs = async (userId: string): Promise<void> => {
    if (!isMock) {
        const snap = await db.collection('usage_logs').where('uid', '==', userId).get();
        const batch = db.batch();
        snap.docs.forEach((doc: any) => batch.delete(doc.ref));
        await batch.commit();
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
    } catch (e) { console.error("Cloud Sync Failed", e); }
};

export const fetchUserPostsFromCloud = async (userId: string): Promise<Post[]> => {
    if (isMock) {
        try { return JSON.parse(localStorage.getItem('autosocial_posts') || '[]'); } catch(e) { return []; }
    }
    try {
        const snap = await db.collection('users').doc(userId).collection('posts').orderBy('createdAt', 'desc').get();
        return snap.docs.map((doc: any) => doc.data() as Post);
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
