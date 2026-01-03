
import { auth, db, isMock } from '../firebase';
import { createUserProfile, getUserProfile } from './user';
import { MockStore } from '../mockStore';
import { UserProfile } from '../../types';

const SESSION_KEY = 'autosocial_session_uid';
const PREVIEW_ADMIN_ID = 'preview_admin_user_v2';

export const getCurrentUser = () => {
    // 優先檢查：預覽專用管理員 Session
    const localUid = typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null;
    if (localUid === PREVIEW_ADMIN_ID) {
        const u = MockStore.getUser(localUid);
        return { uid: localUid, email: u ? u.email : 'admin@gmail.com' };
    }

    // 若非後門且有真實 Firebase Auth
    if (!isMock && auth.currentUser) {
        return auth.currentUser;
    }

    // 一般 Mock 模式
    if (localUid && isMock) {
         const u = MockStore.getUser(localUid);
         return { uid: localUid, email: u ? u.email : 'demo@example.com' };
    }
    return null;
};

export const login = async (email: string, pass: string) => {
    // 0. 管理員後門判斷 (admin@gmail.com / admin)
    if (email === 'admin@gmail.com' && pass === 'admin') {
        let adminUser = MockStore.getUser(PREVIEW_ADMIN_ID);
        if (!adminUser) {
             adminUser = {
                user_id: PREVIEW_ADMIN_ID,
                email: 'admin@gmail.com',
                role: 'admin',
                quota_total: 99999,
                quota_used: 0,
                quota_reset_date: Date.now() + 31536000000,
                quota_batches: [],
                expiry_warning_level: 0,
                isSuspended: false,
                unlockedFeatures: ['ANALYTICS', 'AUTOMATION', 'SEO', 'THREADS'],
                referralCode: 'ADMIN-GOD-MODE',
                referralCount: 999,
                last_api_call_timestamp: 0,
                created_at: Date.now(),
                updated_at: Date.now()
            };
            MockStore.saveUser(adminUser);
        }
        
        localStorage.setItem(SESSION_KEY, PREVIEW_ADMIN_ID);
        window.dispatchEvent(new Event('auth_state_change'));
        return { user: { uid: PREVIEW_ADMIN_ID, email: adminUser.email } };
    }

    // 1. 真實 Firebase 登入
    if (!isMock) {
        const cred = await auth.signInWithEmailAndPassword(email, pass);
        // 登入成功後移除本地可能存在的後門 Session
        localStorage.removeItem(SESSION_KEY);
        return { user: cred.user };
    } 
    
    // 2. 一般 Mock 登入
    const user = MockStore.findUserByEmail(email);
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
        return { user: cred.user };
    } 
    
    const uid = 'user_' + Date.now();
    await createUserProfile({ uid, email });
    localStorage.setItem(SESSION_KEY, uid);
    window.dispatchEvent(new Event('auth_state_change'));
    return { user: { uid, email } };
};

export const logout = async () => {
    localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event('auth_state_change'));
    if (!isMock) await auth.signOut();
};

export const subscribeAuth = (callback: (user: { uid: string, email: string } | null) => void) => {
    const checkMockAndBackdoor = () => {
         const uid = localStorage.getItem(SESSION_KEY);
         if (uid === PREVIEW_ADMIN_ID) {
             const u = MockStore.getUser(uid);
             callback({ uid: uid, email: u ? u.email : 'admin@gmail.com' });
             return true;
         }
         if (uid && isMock) {
             const u = MockStore.getUser(uid);
             callback({ uid: uid, email: u ? u.email : 'demo@example.com' });
             return true;
         }
         return false;
    };
    
    if (!isMock) {
        return auth.onAuthStateChanged(async (firebaseUser: any) => {
            // 優先權：如果存在後門 Session 則覆蓋 Firebase 狀態
            if (localStorage.getItem(SESSION_KEY) === PREVIEW_ADMIN_ID) {
                checkMockAndBackdoor();
                return;
            }

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

    if (typeof window !== 'undefined') {
        window.addEventListener('auth_state_change', checkMockAndBackdoor);
        setTimeout(checkMockAndBackdoor, 0);
    }

    return () => {
        if (typeof window !== 'undefined') window.removeEventListener('auth_state_change', checkMockAndBackdoor);
    };
};

export const sendPasswordReset = async (email: string) => {
    if (!isMock) await auth.sendPasswordResetEmail(email);
};

export const exchangeThreadsAuth = async (code: string, redirectUri: string) => {
    if (isMock) {
        return { 
            token: 'mock_threads_long_token_' + Date.now(), 
            userId: 'mock_user_123',
            username: 'mock_threads_user'
        };
    }

    const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'exchange', code, redirectUri })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Token exchange failed');
    return data.data;
};
