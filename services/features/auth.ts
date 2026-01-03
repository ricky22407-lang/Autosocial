
import { auth, db, isMock } from '../firebase';
import { createUserProfile, getUserProfile } from './user';
import { MockStore } from '../mockStore';
import { UserProfile } from '../../types';

const SESSION_KEY = 'autosocial_session_uid';

export const getCurrentUser = () => {
    const localUid = typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null;
    
    // 真實 Firebase Auth
    if (!isMock && auth.currentUser) {
        return auth.currentUser;
    }

    // 商業化修正：僅在 Mock 模式下允許讀取本地 Session
    if (localUid && isMock) {
         const u = MockStore.getUser(localUid);
         return { uid: localUid, email: u ? u.email : 'demo@example.com' };
    }
    return null;
};

export const login = async (email: string, pass: string) => {
    // 商業化修正：不再提供硬編碼的 admin 密碼
    // 所有用戶（包括管理員）必須通過 Firebase Authentication 註冊與登入
    
    if (!isMock) {
        const cred = await auth.signInWithEmailAndPassword(email, pass);
        localStorage.setItem(SESSION_KEY, cred.user!.uid);
        return { user: cred.user };
    } 
    
    // 開發者用的 Mock 登入邏輯（僅在沒設定 Firebase 時生效）
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
        localStorage.setItem(SESSION_KEY, cred.user!.uid);
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
    if (!isMock) {
        return auth.onAuthStateChanged(async (firebaseUser: any) => {
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

    const checkMock = () => {
         const uid = localStorage.getItem(SESSION_KEY);
         if (uid && isMock) {
             const u = MockStore.getUser(uid);
             callback({ uid: uid, email: u ? u.email : 'demo@example.com' });
             return true;
         }
         return false;
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('auth_state_change', checkMock);
        setTimeout(checkMock, 0);
    }

    return () => {
        if (typeof window !== 'undefined') window.removeEventListener('auth_state_change', checkMock);
    };
};

export const sendPasswordReset = async (email: string) => {
    if (!isMock) await auth.sendPasswordResetEmail(email);
};

export const exchangeThreadsAuth = async (code: string, redirectUri: string) => {
    // 商業化修正：必須通過後端交換，絕對不暴露 app_secret
    const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'exchange', code, redirectUri })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Threads 授權交換失敗');
    return data.data;
};
