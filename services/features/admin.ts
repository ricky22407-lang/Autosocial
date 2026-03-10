
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
            console.log("[Admin] Fetching all users from Firestore...");
            const snap = await db.collection('users').get();
            if (snap.empty) return [];
            return snap.docs.map((doc: any) => doc.data() as UserProfile);
        } 
        return MockStore.getAllUsers();
    } catch (e: any) {
        console.error("Failed to fetch users:", e);
        if (e.code === 'permission-denied') {
            throw new Error("權限不足 (Permission Denied)。請檢查 Firestore Rules。");
        }
        throw new Error(e.message || "讀取會員列表失敗");
    }
};

// 在 services/features/admin.ts 中覆蓋這兩個函數

export const generateAdminKey = async (adminId: string, type: string, role?: UserRole, feature?: string, points?: number): Promise<string> => {
    if (isMock) return `MOCK_KEY_${Date.now()}`;

    try {
        const res = await fetch('/api/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'generateKey',
                payload: { adminId, type, targetRole: role, targetFeature: feature, pointsAmount: points }
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "金鑰生成失敗");
        return data.key;
    } catch (e: any) {
        throw new Error(`伺服器錯誤: ${e.message}`);
    }
};

export const useAdminKey = async (userId: string, keyString: string): Promise<{ success: boolean; message: string }> => {
    if (isMock) return { success: true, message: "兌換成功 (Mock)" };

    try {
        const res = await fetch('/api/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'useKey',
                payload: { userId, keyString }
            })
        });
        const data = await res.json();
        if (!res.ok) return { success: false, message: data.error || "兌換失敗" };
        return data;
    } catch (e: any) {
        return { success: false, message: `伺服器連線失敗: ${e.message}` };
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

// --- REAL STATS IMPLEMENTATION ---
export const getDashboardStats = async (): Promise<DashboardStats> => {
    // Default stats
    const stats: DashboardStats = { totalUsers: 0, activeUsersToday: 0, totalApiCallsToday: 0, errorCountToday: 0 };

    if (!isMock) { 
        try {
            // 1. Total Users (Approximation from list for now)
            const usersSnap = await db.collection('users').get();
            stats.totalUsers = usersSnap.size;

            // 2. Active Users Today (DAU)
            const startOfDay = new Date();
            startOfDay.setHours(0,0,0,0);
            const activeSnap = await db.collection('users').where('last_api_call_timestamp', '>', startOfDay.getTime()).get();
            stats.activeUsersToday = activeSnap.size;

            // 3. API Usage (From System Stats Doc)
            const doc = await db.collection('system_stats').doc('api_usage').get(); 
            if (doc.exists) stats.totalApiCallsToday = doc.data()?.total_calls || 0; 
            
        } catch(e) {
            console.warn("Stats fetch partial failure", e);
        }
    } else {
        // Mock
        const users = await getAllUsers();
        stats.totalUsers = users.length;
        stats.activeUsersToday = Math.floor(users.length * 0.4);
        stats.totalApiCallsToday = 342;
    }
    return stats;
};

// --- REAL LOGS IMPLEMENTATION ---
export const getSystemLogs = async (): Promise<LogEntry[]> => {
    if (!isMock) {
        try {
            const snap = await db.collection('usage_logs')
                .orderBy('ts', 'desc')
                .limit(50)
                .get();
                
            return snap.docs.map((doc: any) => {
                const data = doc.data();
                // Map usage_log format to LogEntry format for UI
                return {
                    id: doc.id,
                    timestamp: data.ts,
                    userEmail: data.uid, // We store uid mostly, in real app we'd map to email
                    action: data.act,
                    status: (data.res && data.res.startsWith('Error')) ? 'error' : 'success',
                    details: `${data.topic || ''} ${data.prmt ? '(' + data.prmt.substring(0,20) + '...)' : ''}`
                } as LogEntry;
            });
        } catch (e) {
            console.warn("Logs fetch failed", e);
            return [];
        }
    }
    return [];
};

export const getSystemConfig = (): SystemConfig => {
    return MockStore.getConfig();
};

export const updateSystemConfig = (config: Partial<SystemConfig>) => {
    const current = MockStore.getConfig();
    MockStore.saveConfig({ ...current, ...config });
};
