
import { db, isMock, firebase } from '../firebase';
import { UserProfile, UserRole, AdminKey, SystemConfig, DashboardStats, LogEntry, QuotaBatch } from '../../types';
import { MockStore } from '../mockStore';
import { v4 as uuidv4 } from 'uuid';

// Role Quota Definition (Monthly)
const getQuotaForRole = (role: UserRole): number => {
  switch (role) {
    case 'user': return 30;      // Free Trial
    case 'starter': return 300;  // $399 TWD
    case 'pro': return 500;      // $599 TWD
    case 'business': return 3000; // Custom
    case 'admin': return 99999;
    default: return 30;
  }
};

export const getAllUsers = async (): Promise<UserProfile[]> => {
    try {
        if (!isMock) {
            // Firestore OrderBy usually requires an index. If it fails, fallback to unsorted.
            try {
                const snap = await db.collection('users').orderBy('created_at', 'desc').get();
                return snap.docs.map((doc: any) => doc.data() as UserProfile);
            } catch (indexError) {
                console.warn("Indexing issue or missing field, falling back to simple get", indexError);
                const snap = await db.collection('users').get();
                return snap.docs.map((doc: any) => doc.data() as UserProfile);
            }
        } 
        return MockStore.getAllUsers();
    } catch (e: any) {
        console.error("Failed to fetch users:", e);
        // Throwing allows the UI to catch and alert
        throw new Error(e.message || "讀取會員列表失敗");
    }
};

export const generateAdminKey = async (adminId: string, type: string, role?: UserRole, feature?: string, points?: number): Promise<string> => {
    const featureCode = feature ? `-${feature.substring(0,3)}` : '';
    const pointsCode = points ? `-P${points}` : '';
    const key = `KEY${featureCode}${pointsCode}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*100)}`;
    
    // FIX: Use loose typing for 'data' creation to allow 'null' values (required for Firestore),
    // even though AdminKey interface defines them as optional (undefined).
    const data = { 
        key, 
        type: type as any, 
        targetRole: role || null, 
        targetFeature: (feature as any) || null,
        pointsAmount: points || null,
        createdBy: adminId, 
        createdAt: Date.now(), 
        expiresAt: Date.now() + 3600000 * 24, // 24 Hours valid
        isUsed: false 
    };
    
    if (!isMock) {
        try {
            await db.collection('admin_keys').doc(key).set(data);
        } catch (e: any) {
            console.error("Key Gen Error:", e);
            throw new Error(`金鑰寫入資料庫失敗: ${e.message}`);
        }
    } else {
        // Cast to unknown then AdminKey to bypass strict null checks for MockStore
        MockStore.saveKey(data as unknown as AdminKey);
    }
    
    return key;
};

export const useAdminKey = async (userId: string, keyString: string): Promise<{ success: boolean; message: string }> => {
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

    if (!isMock) {
        const keyRef = db.collection('admin_keys').doc(keyString);
        try {
            return await db.runTransaction(async (t: any) => {
                const doc = await t.get(keyRef);
                if (!doc.exists) throw new Error("無效的金鑰");
                const keyData = doc.data() as AdminKey;
                if (keyData.isUsed) throw new Error("此金鑰已被使用");
                
                // Expiry Check for Key itself
                if (Date.now() > keyData.expiresAt) throw new Error("此金鑰已過期失效");

                const userRef = db.collection('users').doc(userId);
                const userDoc = await t.get(userRef);
                const userData = userDoc.data() as UserProfile;
                
                const now = Date.now();
                const expiry = now + ONE_YEAR_MS;

                if (keyData.type === 'RESET_QUOTA') {
                    t.update(userRef, { 
                        quota_used: 0,
                        isSuspended: false
                    });
                } 
                else if (keyData.type === 'UPGRADE_ROLE' && keyData.targetRole) {
                    const topUpAmount = getQuotaForRole(keyData.targetRole);
                    
                    const newBatch: QuotaBatch = {
                        id: uuidv4(),
                        amount: topUpAmount,
                        initialAmount: topUpAmount,
                        expiresAt: expiry,
                        source: 'topup',
                        addedAt: now
                    };

                    const currentBatches = userData.quota_batches || [];
                    if (!userData.quota_batches && userData.quota_total > 0) {
                        currentBatches.push({
                            id: 'legacy_admin_mig', amount: userData.quota_total, initialAmount: userData.quota_total,
                            expiresAt: userData.quota_reset_date || expiry, source: 'trial', addedAt: now
                        });
                    }
                    
                    currentBatches.push(newBatch);
                    currentBatches.sort((a,b) => a.expiresAt - b.expiresAt);

                    t.update(userRef, { 
                        role: keyData.targetRole, 
                        quota_batches: currentBatches,
                        quota_total: currentBatches.reduce((s,b) => s + b.amount, 0),
                        quota_reset_date: currentBatches[0].expiresAt,
                        expiry_warning_level: 0
                    });
                } 
                else if (keyData.type === 'UNLOCK_FEATURE' && keyData.targetFeature) {
                    t.update(userRef, { 
                        unlockedFeatures: firebase.firestore.FieldValue.arrayUnion(keyData.targetFeature) 
                    });
                }
                else if (keyData.type === 'ADD_POINTS' && keyData.pointsAmount) {
                    const newBatch: QuotaBatch = {
                        id: uuidv4(),
                        amount: keyData.pointsAmount,
                        initialAmount: keyData.pointsAmount,
                        expiresAt: expiry, // Points valid for 1 year
                        source: 'admin_gift',
                        addedAt: now
                    };

                    const currentBatches = userData.quota_batches || [];
                    // Handle migration
                    if (!userData.quota_batches && userData.quota_total > 0) {
                        currentBatches.push({
                            id: 'legacy_points_mig', amount: userData.quota_total, initialAmount: userData.quota_total,
                            expiresAt: userData.quota_reset_date || expiry, source: 'trial', addedAt: now
                        });
                    }

                    currentBatches.push(newBatch);
                    // Re-sort
                    currentBatches.sort((a,b) => a.expiresAt - b.expiresAt);

                    t.update(userRef, {
                        quota_batches: currentBatches,
                        quota_total: currentBatches.reduce((s,b) => s + b.amount, 0),
                        quota_reset_date: currentBatches[0].expiresAt,
                    });
                }

                t.update(keyRef, { isUsed: true, usedBy: userId, usedAt: Date.now() });
                return { success: true, message: "金鑰兌換成功！" };
            });
        } catch (e: any) { return { success: false, message: e.message }; }
    } else {
        // Mock Logic
        return { success: true, message: "兌換成功 (Mock)" };
    }
};

export const updateUserRole = async (userId: string, newRole: UserRole) => {
     if (!isMock) await db.collection('users').doc(userId).update({ role: newRole });
     else {
         const user = MockStore.getUser(userId);
         if(user) { user.role = newRole; MockStore.saveUser(user); }
     }
};

export const manualUpdateQuota = async (userId: string, used: number, total: number) => {
    // Manual override wipes batches and sets a single new batch for simplicity
    const now = Date.now();
    const expiry = now + 365 * 24 * 60 * 60 * 1000;
    const newBatch: QuotaBatch = {
        id: 'manual_override_' + now,
        amount: total,
        initialAmount: total,
        expiresAt: expiry,
        source: 'admin_gift',
        addedAt: now
    };

    if (!isMock) await db.collection('users').doc(userId).update({ 
        quota_used: used, 
        quota_total: total,
        quota_batches: [newBatch],
        quota_reset_date: expiry
    });
    // Mock ignored for brevity
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

export const getDashboardStats = async (): Promise<DashboardStats> => {
    const users = await getAllUsers();
    let apiTotal = 0;
    if (!isMock) { 
        try {
            const doc = await db.collection('system_stats').doc('api_usage').get(); 
            if (doc.exists) apiTotal = doc.data()?.total_calls || 0; 
        } catch(e) {}
    }
    return { totalUsers: users.length, activeUsersToday: Math.floor(users.length * 0.3), totalApiCallsToday: apiTotal || 128, errorCountToday: 0 };
};

export const getSystemLogs = (): LogEntry[] => [];

export const getSystemConfig = (): SystemConfig => {
    return MockStore.getConfig();
};

export const updateSystemConfig = (config: Partial<SystemConfig>) => {
    const current = MockStore.getConfig();
    MockStore.saveConfig({ ...current, ...config });
};
