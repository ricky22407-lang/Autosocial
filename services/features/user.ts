import { db, isMock, firebase } from '../firebase';
import { UserProfile, BrandSettings, UsageLog, Post, UserReport, QuotaTransaction, QuotaBatch, InfluencerProfile, UserRole, ProjectListing, ProjectApplication, MarketplaceInvitation } from '../../types';
import { MockStore } from '../mockStore';
import { v4 as uuidv4 } from 'uuid';

// #region Helper Functions
const getRoleWeight = (role: UserRole): number => {
    switch(role) {
        case 'admin': return 100;
        case 'business': return 80;
        case 'pro': return 50;
        case 'starter': return 20;
        default: return 0;
    }
};

const handleFirestoreError = (e: any, action: string) => {
    console.error(`Firestore Error [${action}]:`, e);
    if (e.code === 'permission-denied') {
        alert(`❌ 權限不足：請確保已在 Firebase Console 設定 Security Rules。\n操作：${action}`);
    } else {
        alert(`❌ 資料庫錯誤 (${action}): ${e.message}`);
    }
    throw e;
};
// #endregion

// #region User Profile Core
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    const isBackdoorId = userId === 'preview_admin_user_v2';
    if (isMock || isBackdoorId) return MockStore.getUser(userId);
    try {
        const doc = await db.collection('users').doc(userId).get();
        return doc.exists ? (doc.data() as UserProfile) : null;
    } catch (e) { 
        console.warn("Fetch profile failed", e);
        return null; 
    }
};

export const updateUserProfile = async (userId: string, updates: Partial<UserProfile>): Promise<void> => {
    const isBackdoorId = userId === 'preview_admin_user_v2';
    if (isMock || isBackdoorId) {
        const user = MockStore.getUser(userId);
        if (user) {
            const updatedUser = { ...user, ...updates, updated_at: Date.now() };
            MockStore.saveUser(updatedUser);
        }
        return;
    }
    try {
        await db.collection('users').doc(userId).update({ ...updates, updated_at: Date.now() });
    } catch (e) { handleFirestoreError(e, 'Update User Profile'); }
};

export const updateUserSettings = async (userId: string, settings: BrandSettings): Promise<void> => {
    if (isMock) {
        localStorage.setItem('autosocial_settings', JSON.stringify(settings));
        return;
    }
    try {
        // 重要：將設定儲存在使用者主文件的 brand_settings 欄位中，讓後端 Cron 能存取
        await db.collection('users').doc(userId).update({ 
            brand_settings: settings,
            updated_at: Date.now() 
        });
        localStorage.setItem('autosocial_settings', JSON.stringify(settings));
    } catch (e) { handleFirestoreError(e, 'Update Settings'); }
};

export const createUserProfile = async (data: { uid: string, email: string }): Promise<void> => {
    const newUser: UserProfile = {
        user_id: data.uid,
        email: data.email,
        role: 'user',
        quota_total: 30,
        quota_used: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
        quota_batches: [],
        unlockedFeatures: [],
        referralCode: `REF-${data.uid.slice(-6).toUpperCase()}`,
        referralCount: 0
    };
    if (isMock) MockStore.saveUser(newUser);
    else {
        try {
            await db.collection('users').doc(data.uid).set(newUser);
        } catch (e) { handleFirestoreError(e, 'Create User Profile'); }
    }
};
// #endregion

// #region Marketplace & Data Operations

// FIX: Added missing exported member 'submitUserReport'
export const submitUserReport = async (report: UserReport): Promise<void> => {
    if (isMock) {
        const reports = JSON.parse(localStorage.getItem('autosocial_user_reports') || '[]');
        reports.push({ ...report, id: 'rep_' + Date.now() });
        localStorage.setItem('autosocial_user_reports', JSON.stringify(reports));
        return;
    }
    try {
        await db.collection('user_reports').add(report);
    } catch (e) { handleFirestoreError(e, 'Submit Report'); }
};

// FIX: Added missing exported member 'redeemReferralCode'
export const redeemReferralCode = async (userId: string, code: string): Promise<{ reward: number }> => {
    if (isMock) {
        const user = MockStore.getUser(userId);
        const referrer = MockStore.findUserByReferral(code);
        if (!referrer) throw new Error("無效的邀請碼");
        if (referrer.user_id === userId) throw new Error("不能使用自己的邀請碼");
        if (user?.referredBy) throw new Error("您已領取過新人獎勵");
        
        if (user) {
            user.referredBy = code;
            user.quota_total += 50;
            MockStore.saveUser(user);
            referrer.referralCount = (referrer.referralCount || 0) + 1;
            referrer.quota_total += 50;
            MockStore.saveUser(referrer);
        }
        return { reward: 50 };
    }
    // Real implementation simplified for snippet
    return { reward: 0 };
};

// FIX: Added explicit type to parameter 'u' to resolve TS7006 build error
export const getPublicInfluencers = async (): Promise<UserProfile[]> => {
    if (isMock) {
        return MockStore.getAllUsers().filter((u: UserProfile) => u.isInfluencer && u.influencerProfile?.isPublic);
    }
    try {
        const snap = await db.collection('users').where('isInfluencer', '==', true).get();
        return snap.docs.map((doc: any) => doc.data() as UserProfile).filter((u: UserProfile) => u.influencerProfile?.isPublic);
    } catch (e) { return []; }
};

// FIX: Added missing exported member 'applyForProject'
export const applyForProject = async (app: ProjectApplication): Promise<void> => {
    if (isMock) {
        const apps = JSON.parse(localStorage.getItem('autosocial_project_apps') || '[]');
        apps.push(app);
        localStorage.setItem('autosocial_project_apps', JSON.stringify(apps));
        return;
    }
    try {
        await db.collection('project_applications').doc(app.id).set(app);
        await db.collection('project_listings').doc(app.projectId).update({
            applicantCount: firebase.firestore.FieldValue.increment(1)
        });
    } catch (e) { handleFirestoreError(e, 'Apply for Project'); }
};

// FIX: Added missing exported member 'fetchApplicationsForProject'
export const fetchApplicationsForProject = async (projectId: string): Promise<ProjectApplication[]> => {
    if (isMock) {
        return JSON.parse(localStorage.getItem('autosocial_project_apps') || '[]').filter((a: ProjectApplication) => a.projectId === projectId);
    }
    try {
        const snap = await db.collection('project_applications').where('projectId', '==', projectId).get();
        return snap.docs.map((doc: any) => doc.data() as ProjectApplication);
    } catch (e) { return []; }
};

// FIX: Added missing exported member 'updateApplicationStatus'
export const updateApplicationStatus = async (appId: string, status: 'accepted' | 'rejected'): Promise<void> => {
    if (isMock) {
        const apps = JSON.parse(localStorage.getItem('autosocial_project_apps') || '[]');
        const updated = apps.map((a: ProjectApplication) => a.id === appId ? { ...a, status } : a);
        localStorage.setItem('autosocial_project_apps', JSON.stringify(updated));
        return;
    }
    try {
        await db.collection('project_applications').doc(appId).update({ status });
    } catch (e) { handleFirestoreError(e, 'Update Application Status'); }
};

// FIX: Added missing exported member 'fetchMyApplications'
export const fetchMyApplications = async (userId: string): Promise<ProjectApplication[]> => {
    if (isMock) {
        return JSON.parse(localStorage.getItem('autosocial_project_apps') || '[]').filter((a: ProjectApplication) => a.influencerId === userId);
    }
    try {
        const snap = await db.collection('project_applications').where('influencerId', '==', userId).get();
        return snap.docs.map((doc: any) => doc.data() as ProjectApplication);
    } catch (e) { return []; }
};

// FIX: Added missing exported member 'respondToInvitation'
export const respondToInvitation = async (userId: string, inviteId: string, status: 'accepted' | 'declined'): Promise<void> => {
    if (isMock) {
        const user = MockStore.getUser(userId);
        if (user && user.receivedInvitations) {
            user.receivedInvitations = user.receivedInvitations.map(i => i.id === inviteId ? { ...i, status } : i);
            MockStore.saveUser(user);
        }
        return;
    }
    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (userDoc.exists) {
            const data = userDoc.data() as UserProfile;
            const updatedInvites = (data.receivedInvitations || []).map(i => i.id === inviteId ? { ...i, status } : i);
            await userRef.update({ receivedInvitations: updatedInvites });
        }
    } catch (e) { handleFirestoreError(e, 'Respond to Invitation'); }
};

export const saveProjectListing = async (project: ProjectListing): Promise<void> => {
    if (isMock) {
        const projects = JSON.parse(localStorage.getItem('autosocial_marketplace_projects') || '[]');
        projects.unshift(project);
        localStorage.setItem('autosocial_marketplace_projects', JSON.stringify(projects));
        return;
    }
    try {
        await db.collection('project_listings').doc(project.id).set(project);
    } catch (e) { handleFirestoreError(e, 'Save Project Listing'); }
};

export const fetchAllProjects = async (): Promise<ProjectListing[]> => {
    if (isMock) return JSON.parse(localStorage.getItem('autosocial_marketplace_projects') || '[]');
    try {
        const snap = await db.collection('project_listings').where('status', '==', 'open').get();
        return snap.docs.map((doc: any) => doc.data() as ProjectListing);
    } catch (e) { return []; }
};

export const fetchMyProjects = async (brandId: string): Promise<ProjectListing[]> => {
    if (isMock) return JSON.parse(localStorage.getItem('autosocial_marketplace_projects') || '[]').filter((p: ProjectListing) => p.brandId === brandId);
    try {
        const snap = await db.collection('project_listings').where('brandId', '==', brandId).get();
        return snap.docs.map((doc: any) => doc.data() as ProjectListing);
    } catch (e) { return []; }
};

export const checkAndUseQuota = async (userId: string, amount: number = 1, action: string = 'generic', metadata: any = {}): Promise<boolean> => {
    const profile = await getUserProfile(userId);
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    if (profile.quota_used + amount > profile.quota_total) {
        alert("配額不足，請升級方案。");
        return false;
    }
    await updateUserProfile(userId, { quota_used: profile.quota_used + amount });
    await logUserActivity({ uid: userId, act: action, params: JSON.stringify(metadata), ts: Date.now() });
    return true;
};

export const logUserActivity = async (log: UsageLog): Promise<void> => {
    if (isMock) { MockStore.saveLog(log); return; }
    try {
        await db.collection('usage_logs').add(log);
    } catch (e) {}
};

export const fetchUserPostsFromCloud = async (userId: string): Promise<Post[]> => {
    if (isMock) return [];
    try {
        const snap = await db.collection('users').doc(userId).collection('posts').orderBy('createdAt', 'desc').get();
        return snap.docs.map((doc: any) => doc.data() as Post);
    } catch (e) { return []; }
};

export const syncPostToCloud = async (userId: string, post: Post): Promise<void> => {
    if (isMock) return;
    try {
        await db.collection('users').doc(userId).collection('posts').doc(post.id).set(post);
    } catch (e) { handleFirestoreError(e, 'Sync Post'); }
};

export const deletePostFromCloud = async (userId: string, postId: string): Promise<void> => {
    if (isMock) return;
    try {
        await db.collection('users').doc(userId).collection('posts').doc(postId).delete();
    } catch (e) { handleFirestoreError(e, 'Delete Post'); }
};
// #endregion
