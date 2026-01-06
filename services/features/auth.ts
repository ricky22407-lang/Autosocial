
import { auth, db, isMock } from '../firebase';
import { createUserProfile, getUserProfile } from './user';
import { MockStore } from '../mockStore';
import { UserProfile } from '../../types';

const SESSION_KEY = 'autosocial_session_uid';

export const getCurrentUser = () => {
    if (!isMock) return auth.currentUser;
    const uid = localStorage.getItem(SESSION_KEY);
    if (uid) {
         const u = MockStore.getUser(uid);
         return { uid: uid, email: u ? u.email : 'demo@example.com' };
    }
    return null;
};

export const login = async (email: string, pass: string) => {
    // 1. Real Firebase Login
    if (!isMock) {
        const cred = await auth.signInWithEmailAndPassword(email, pass);
        return { user: cred.user };
    } 
    
    // 2. Mock User Login (Dev Mode)
    const user = MockStore.findUserByEmail(email);
    if (user) {
        localStorage.setItem(SESSION_KEY, user.user_id);
        window.dispatchEvent(new Event('auth_state_change'));
        return { user: { uid: user.user_id, email: user.email } };
    }
    
    // Auto-register in Mock mode if user doesn't exist to simplify testing
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
    if (!isMock) await auth.signOut();
    else {
        localStorage.removeItem(SESSION_KEY);
        window.dispatchEvent(new Event('auth_state_change'));
    }
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

    const check = () => {
         const uid = localStorage.getItem(SESSION_KEY);
         if(uid) {
             const u = MockStore.getUser(uid);
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

export const sendPasswordReset = async (email: string) => {
    if (!isMock) await auth.sendPasswordResetEmail(email);
    else console.log(`[Mock] Password reset sent to ${email}`);
};

/**
 * Exchange Threads OAuth Code for Long-Lived Token via Backend
 * NOTE: App credentials are now handled server-side for security.
 */
export const exchangeThreadsAuth = async (code: string, redirectUri: string) => {
    if (isMock) {
        return { 
            token: 'mock_threads_long_token_' + Date.now(), 
            userId: 'mock_user_123',
            username: 'mock_threads_user'
        };
    }

    // Call our serverless function instead of direct external API
    // This keeps the Client Secret hidden on the server
    const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            action: 'exchange',
            code, 
            redirectUri 
        })
    });

    const data = await res.json();
    if (!data.success) {
        throw new Error(data.error || 'Token exchange failed on server');
    }
    return data.data; // { userId, token, username }
};

export const agreeToConnectTerms = async (userId: string) => {
    if (!isMock) {
        await db.collection('users').doc(userId).update({ hasAgreedConnectTerms: true });
    } else {
        const user = MockStore.getUser(userId);
        if (user) {
            user.hasAgreedConnectTerms = true;
            MockStore.saveUser(user);
        }
    }
};
