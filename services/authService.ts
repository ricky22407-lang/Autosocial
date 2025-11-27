
import { UserProfile, UserRole, AdminKey, SystemConfig, LogEntry, DashboardStats } from '../types';

/* 
   ==========================================================================
   DEVELOPMENT / DEMO MODE (SIMULATED BACKEND)
   ==========================================================================
   This service simulates a backend database using LocalStorage.
*/

// Mock DB keys for LocalStorage
const DB_USERS = 'autosocial_db_users';
const DB_KEYS = 'autosocial_db_keys';
const DB_LOGS = 'autosocial_db_logs';
const DB_CONFIG = 'autosocial_db_config';
const SESSION_KEY = 'autosocial_session_uid';

// --- LocalStorage Helpers ---
const getDb = (key: string) => {
  const s = localStorage.getItem(key);
  return s ? JSON.parse(s) : {};
};
const getList = (key: string) => {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : [];
}
const saveDb = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

// --- System Logging ---
export const logSystemAction = (userId: string, email: string, action: string, status: 'success' | 'error' | 'warning', details: string) => {
    const logs = getList(DB_LOGS);
    const newLog: LogEntry = {
        id: Date.now().toString() + Math.random().toString().slice(2,5),
        timestamp: Date.now(),
        userId,
        userEmail: email,
        action,
        status,
        details
    };
    // Keep last 500 logs
    const updatedLogs = [newLog, ...logs].slice(0, 500);
    saveDb(DB_LOGS, updatedLogs);
};

export const getSystemLogs = (): LogEntry[] => {
    return getList(DB_LOGS);
};

// --- System Config ---
export const getSystemConfig = (): SystemConfig => {
    const config = getDb(DB_CONFIG);
    return {
        maintenanceMode: config.maintenanceMode || false,
        dryRunMode: config.dryRunMode || false,
        globalAnnouncement: config.globalAnnouncement || ''
    };
};

export const updateSystemConfig = (newConfig: Partial<SystemConfig>) => {
    const current = getSystemConfig();
    saveDb(DB_CONFIG, { ...current, ...newConfig });
};

// --- Auth Simulation ---

export const subscribeAuth = (callback: (user: { uid: string, email: string } | null) => void) => {
    const check = () => {
        const uid = localStorage.getItem(SESSION_KEY);
        if (uid) {
            const users = getDb(DB_USERS);
            const user = users[uid];
            // Check suspension
            if (user && user.isSuspended) {
                localStorage.removeItem(SESSION_KEY);
                callback(null);
                return;
            }
            if (user) callback({ uid: user.user_id, email: user.email });
            else callback(null);
        } else {
            callback(null);
        }
    };
    check();
    
    const listener = () => check();
    window.addEventListener('storage', listener);
    window.addEventListener('auth_state_change', listener);
    return () => {
        window.removeEventListener('storage', listener);
        window.removeEventListener('auth_state_change', listener);
    };
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

export const login = async (email: string, pass: string) => {
    await new Promise(r => setTimeout(r, 500));

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPass = pass.trim();
    
    // 1. DEMO ACCOUNT CHECK (Priority)
    // Explicit check to prevent "User not found" error if password is wrong
    if (normalizedEmail === 'ricky22407@gmail.com') {
        if (normalizedPass === 'testautosocial1106') {
            const users = getDb(DB_USERS);
            let foundUser = Object.values(users).find((u: any) => u.email.toLowerCase() === normalizedEmail) as UserProfile | undefined;
            
            if (!foundUser) {
                // Auto-create ADMIN user for demo if missing
                const uid = 'demo_admin_' + Date.now();
                const newUser: UserProfile = {
                    user_id: uid,
                    email: normalizedEmail,
                    role: 'admin',
                    quota_total: 9999,
                    quota_used: 0,
                    quota_reset_date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime(),
                    created_at: Date.now(),
                    updated_at: Date.now(),
                    isSuspended: false,
                    unlockedFeatures: ['ANALYTICS', 'AUTOMATION']
                };
                users[uid] = newUser;
                saveDb(DB_USERS, users);
                foundUser = newUser;
            } else {
                // Force admin rights for demo account if downgraded
                if (foundUser.role !== 'admin') {
                    foundUser.role = 'admin';
                    users[foundUser.user_id] = foundUser;
                    saveDb(DB_USERS, users);
                }
            }

            if (foundUser.isSuspended) throw new Error("此帳號已被停用，請聯繫管理員。");

            localStorage.setItem(SESSION_KEY, foundUser.user_id);
            logSystemAction(foundUser.user_id, foundUser.email, 'LOGIN', 'success', 'Admin Login via Demo Creds');
            window.dispatchEvent(new Event('auth_state_change'));
            return { user: { uid: foundUser.user_id, email: foundUser.email } };
        } else {
            throw new Error("測試帳號密碼錯誤 (提示: testautosocial1106)");
        }
    }

    // 2. Standard Logic
    const config = getSystemConfig();
    if (config.maintenanceMode) {
        throw new Error("系統維護中，暫時無法登入。");
    }

    const users = getDb(DB_USERS);
    const foundUser = Object.values(users).find((u: any) => u.email.toLowerCase() === normalizedEmail) as UserProfile | undefined;
    
    if (foundUser) {
        if (foundUser.isSuspended) throw new Error("此帳號已被停用，請聯繫管理員。");
        // Mock password check - in a real app, verify hash here.
        // For this demo, we accept any password for registered users to simplify testing.
        
        localStorage.setItem(SESSION_KEY, foundUser.user_id);
        logSystemAction(foundUser.user_id, foundUser.email, 'LOGIN', 'success', 'User Login');
        window.dispatchEvent(new Event('auth_state_change'));
        return { user: { uid: foundUser.user_id, email: foundUser.email } };
    } else {
        throw new Error("用戶不存在 (請先註冊)");
    }
};

export const register = async (email: string, pass: string) => {
    await new Promise(r => setTimeout(r, 500));
    const normalizedEmail = email.toLowerCase().trim();
    
    const users = getDb(DB_USERS);
    const existing = Object.values(users).find((u: any) => u.email.toLowerCase() === normalizedEmail);
    if (existing) throw new Error("Email 已被註冊");
    
    const uid = 'user_' + Date.now();
    const newUser = { uid, email: normalizedEmail };
    
    // Create profile immediately
    await createUserProfile(newUser);
    
    logSystemAction(uid, normalizedEmail, 'REGISTER', 'success', 'New User Registration');
    localStorage.setItem(SESSION_KEY, uid);
    window.dispatchEvent(new Event('auth_state_change'));
    return { user: newUser };
};

export const logout = async () => {
    localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event('auth_state_change'));
};

// --- User Operations ---

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const users = getDb(DB_USERS);
  return users[userId] || null;
};

export const createUserProfile = async (user: any): Promise<UserProfile> => {
  const newUser: UserProfile = {
    user_id: user.uid,
    email: user.email || '',
    role: 'user', 
    quota_total: 5, // Default for User
    quota_used: 0,
    quota_reset_date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime(),
    created_at: Date.now(),
    updated_at: Date.now(),
    isSuspended: false,
    unlockedFeatures: []
  };
  
  const users = getDb(DB_USERS);
  users[user.uid] = newUser;
  saveDb(DB_USERS, users);
  
  return newUser;
};

export const checkAndUseQuota = async (userId: string): Promise<boolean> => {
  const users = getDb(DB_USERS);
  const user = users[userId] as UserProfile;
  if (!user || user.isSuspended) return false;

  const config = getSystemConfig();
  if (config.dryRunMode) {
      logSystemAction(userId, user.email, 'USE_QUOTA', 'warning', 'Quota check skipped (Dry Run Mode)');
      return true;
  }

  // Reset check
  if (Date.now() > user.quota_reset_date) {
     const nextMonth = new Date();
     nextMonth.setMonth(nextMonth.getMonth() + 1);
     nextMonth.setDate(1);
     user.quota_used = 1; // Count this one
     user.quota_reset_date = nextMonth.getTime();
     saveDb(DB_USERS, users);
     return true;
  }

  if (user.quota_used >= user.quota_total) {
      logSystemAction(userId, user.email, 'USE_QUOTA', 'error', 'Quota Exceeded');
      return false;
  }

  user.quota_used += 1;
  user.updated_at = Date.now();
  saveDb(DB_USERS, users);
  
  logSystemAction(userId, user.email, 'USE_QUOTA', 'success', `Used 1 quota. Remaining: ${user.quota_total - user.quota_used}`);
  return true;
};

// --- Admin Operations ---

export const getDashboardStats = async (): Promise<DashboardStats> => {
    const users = Object.values(getDb(DB_USERS)) as UserProfile[];
    const logs = getList(DB_LOGS) as LogEntry[];
    
    const oneDayAgo = Date.now() - 86400000;
    const activeUserIds = new Set(logs.filter(l => l.timestamp > oneDayAgo).map(l => l.userId));
    
    const apiCalls = logs.filter(l => l.timestamp > oneDayAgo && l.action === 'USE_QUOTA' && l.status === 'success').length;
    const errors = logs.filter(l => l.timestamp > oneDayAgo && l.status === 'error').length;

    return {
        totalUsers: users.length,
        activeUsersToday: activeUserIds.size,
        totalApiCallsToday: apiCalls,
        errorCountToday: errors
    };
};

export const getAllUsers = async (): Promise<UserProfile[]> => {
  const users = getDb(DB_USERS);
  return Object.values(users);
};

export const updateUserRole = async (targetUserId: string, newRole: UserRole) => {
  const users = getDb(DB_USERS);
  if (users[targetUserId]) {
      const oldRole = users[targetUserId].role;
      users[targetUserId].role = newRole;
      users[targetUserId].updated_at = Date.now();
      
      // Update quota defaults
      users[targetUserId].quota_total = getQuotaForRole(newRole);
      
      saveDb(DB_USERS, users);
      logSystemAction('ADMIN', 'admin', 'UPDATE_ROLE', 'success', `Changed ${users[targetUserId].email} from ${oldRole} to ${newRole}`);
  }
};

export const manualUpdateQuota = async (targetUserId: string, used: number, total: number) => {
    const users = getDb(DB_USERS);
    if (users[targetUserId]) {
        users[targetUserId].quota_used = used;
        users[targetUserId].quota_total = total;
        saveDb(DB_USERS, users);
        logSystemAction('ADMIN', 'admin', 'UPDATE_QUOTA', 'success', `Set quota for ${users[targetUserId].email} to ${used}/${total}`);
    }
};

export const toggleUserSuspension = async (targetUserId: string) => {
    const users = getDb(DB_USERS);
    if (users[targetUserId]) {
        users[targetUserId].isSuspended = !users[targetUserId].isSuspended;
        saveDb(DB_USERS, users);
        const status = users[targetUserId].isSuspended ? 'Suspended' : 'Activated';
        logSystemAction('ADMIN', 'admin', 'TOGGLE_SUSPEND', 'warning', `${status} user ${users[targetUserId].email}`);
    }
}

export const resetUserQuota = async (targetUserId: string) => {
  const users = getDb(DB_USERS);
  if (users[targetUserId]) {
      users[targetUserId].quota_used = 0;
      users[targetUserId].updated_at = Date.now();
      saveDb(DB_USERS, users);
      logSystemAction('ADMIN', 'admin', 'RESET_QUOTA', 'success', `Reset quota for ${users[targetUserId].email}`);
  }
};

// --- Key System ---

export const generateAdminKey = async (
    adminId: string, 
    type: 'RESET_QUOTA' | 'UPGRADE_ROLE' | 'UNLOCK_FEATURE', 
    targetRole?: UserRole,
    targetFeature?: 'ANALYTICS' | 'AUTOMATION'
): Promise<string> => {
  const keyString = `KEY-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  
  const newKey: AdminKey = {
    key: keyString,
    type,
    targetRole,
    targetFeature, // New support for feature keys
    createdBy: adminId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 Hours
    isUsed: false
  };

  const keys = getDb(DB_KEYS);
  keys[keyString] = newKey;
  saveDb(DB_KEYS, keys);
  logSystemAction(adminId, 'admin', 'GENERATE_KEY', 'success', `Generated key ${type} ${targetRole || targetFeature || ''}`);
  
  return keyString;
};

export const useAdminKey = async (userId: string, keyString: string): Promise<{ success: boolean; message: string }> => {
  const keys = getDb(DB_KEYS);
  const keyData = keys[keyString] as AdminKey;

  if (!keyData) return { success: false, message: "無效的金鑰" };
  if (keyData.isUsed) return { success: false, message: "此金鑰已被使用" };
  if (Date.now() > keyData.expiresAt) return { success: false, message: "金鑰已過期" };

  // Execute
  const users = getDb(DB_USERS);
  const user = users[userId];
  if (!user) return { success: false, message: "用戶不存在" };

  if (keyData.type === 'RESET_QUOTA') {
    user.quota_used = 0;
  } else if (keyData.type === 'UPGRADE_ROLE' && keyData.targetRole) {
    user.role = keyData.targetRole;
    user.quota_total = getQuotaForRole(keyData.targetRole);
  } else if (keyData.type === 'UNLOCK_FEATURE' && keyData.targetFeature) {
    if (!user.unlockedFeatures) user.unlockedFeatures = [];
    if (!user.unlockedFeatures.includes(keyData.targetFeature)) {
        user.unlockedFeatures.push(keyData.targetFeature);
    }
  }

  saveDb(DB_USERS, users);

  // Mark used
  keyData.isUsed = true;
  saveDb(DB_KEYS, keys);
  
  logSystemAction(userId, user.email, 'USE_KEY', 'success', `Used key ${keyString}`);

  return { success: true, message: `金鑰使用成功！${keyData.type === 'UNLOCK_FEATURE' ? '功能已解鎖。' : ''}` };
};
