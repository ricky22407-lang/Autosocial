
import { db, isMock, firebase } from '../firebase';
import { UserProfile, UserRole, AdminKey, SystemConfig, DashboardStats, LogEntry } from '../../types';
import { MockStore } from '../mockStore';

// Role Quota Definition
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

export const getAllUsers = async (): Promise<UserProfile[]> => {
    if (!isMock) {
        const snap = await db.collection('users').orderBy('created_at', 'desc').get();
        return snap.docs.map(doc => doc.data() as UserProfile);
    } 
    return MockStore.getAllUsers();
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
    else MockStore.saveKey(data);
    
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
        // Mock Logic
        const kData = MockStore.getKey(keyString);
        if (!kData || kData.isUsed) return { success: false, message: "無效或已使用" };
        
        const user = MockStore.getUser(userId);
        if (!user) return { success: false, message: "用戶不存在" };
        
        if (kData.type === 'RESET_QUOTA') user.quota_used = 0;
        else if (kData.type === 'UPGRADE_ROLE' && kData.targetRole) {
            user.role = kData.targetRole;
            user.quota_total = getQuotaForRole(kData.targetRole);
        } else if (kData.type === 'UNLOCK_FEATURE' && kData.targetFeature) {
            if(!user.unlockedFeatures) user.unlockedFeatures = [];
            if(!user.unlockedFeatures.includes(kData.targetFeature)) user.unlockedFeatures.push(kData.targetFeature);
        }
        
        kData.isUsed = true;
        MockStore.saveKey(kData);
        MockStore.saveUser(user);
        return { success: true, message: "兌換成功 (Mock)" };
    }
};

export const updateUserRole = async (userId: string, newRole: UserRole) => {
     if (!isMock) await db.collection('users').doc(userId).update({ role: newRole, quota_total: getQuotaForRole(newRole) });
     else {
         const user = MockStore.getUser(userId);
         if(user) {
             user.role = newRole;
             user.quota_total = getQuotaForRole(newRole);
             MockStore.saveUser(user);
         }
     }
};

export const manualUpdateQuota = async (userId: string, used: number, total: number) => {
    if (!isMock) await db.collection('users').doc(userId).update({ quota_used: used, quota_total: total });
    else {
        const user = MockStore.getUser(userId);
        if(user) {
            user.quota_used = used;
            user.quota_total = total;
            MockStore.saveUser(user);
        }
    }
};

export const toggleUserSuspension = async (userId: string) => {
     if (!isMock) {
         const doc = await db.collection('users').doc(userId).get();
         if(doc.exists) await db.collection('users').doc(userId).update({ isSuspended: !doc.data()?.isSuspended });
     } else {
         const user = MockStore.getUser(userId);
         if(user) {
             user.isSuspended = !user.isSuspended;
             MockStore.saveUser(user);
         }
     }
};

export const resetUserQuota = async (userId: string) => {
    if (!isMock) await db.collection('users').doc(userId).update({ quota_used: 0 });
    else {
        const user = MockStore.getUser(userId);
        if(user) {
            user.quota_used = 0;
            MockStore.saveUser(user);
        }
    }
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

export const getSystemLogs = (): LogEntry[] => []; // Mock Implementation

export const getSystemConfig = (): SystemConfig => {
    return MockStore.getConfig();
};

export const updateSystemConfig = (config: Partial<SystemConfig>) => {
    const current = MockStore.getConfig();
    MockStore.saveConfig({ ...current, ...config });
};
