
import React, { useState, useEffect } from 'react';
import { AppView, BrandSettings, Post, UserProfile } from './types';

// #region Components Import
import SettingsForm from './components/SettingsForm';
import { PostCreator } from './components/PostCreator';
import ScheduleList from './components/ScheduleList';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import AutomationPanel from './components/AutomationPanel';
import ThreadsNurturePanel from './components/ThreadsNurturePanel';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import SeoArticleGenerator from './components/SeoArticleGenerator';
import ReferralPanel from './components/ReferralPanel'; 
import ErrorReportModal from './components/ErrorReportModal'; 
import KeyRedemptionModal from './components/KeyRedemptionModal';
// #endregion

// #region Services & Auth Import
import { subscribeAuth, logout, getUserProfile, fetchUserPostsFromCloud, syncPostToCloud, deletePostFromCloud } from './services/authService';
// #endregion

const defaultSettings: BrandSettings = {
  industry: '',
  brandType: 'enterprise',
  services: '',
  website: '',
  productInfo: '',
  brandTone: 'Professional',
  persona: '',
  facebookPageId: '',
  facebookToken: '',
  threadsAccounts: [], 
  referenceFiles: [],
  fixedHashtags: '',
  autoReply: { enabled: false, defaultResponse: '', rules: [] },
  autoPilot: {
    enabled: false,
    frequency: 'daily',
    postTime: '09:00',
    source: 'trending',
    keywords: [],
    mediaTypePreference: 'image'
  }
};

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [view, setView] = useState<AppView>(AppView.LOGIN);
  const [settings, setSettings] = useState<BrandSettings>(defaultSettings);
  const [posts, setPosts] = useState<Post[]>([]);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeAuth(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile(profile);
        setView(AppView.CREATE);
        loadLocalSettings();
        const cloudPosts = await fetchUserPostsFromCloud(currentUser.uid);
        setPosts(cloudPosts);
      } else {
        setUserProfile(null);
        setView(AppView.LOGIN);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const loadLocalSettings = () => {
    const savedSettings = localStorage.getItem('autosocial_settings');
    if (savedSettings) {
        try {
            const parsed = JSON.parse(savedSettings);
            setSettings({ ...defaultSettings, ...parsed });
        } catch (e) {}
    }
  };

  const handleLogout = async () => {
    await logout();
    setView(AppView.LOGIN);
  };

  const refreshProfile = async () => {
    if (user) {
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);
    }
  };

  const handleSaveSettings = (newSettings: BrandSettings) => {
    setSettings(newSettings);
    localStorage.setItem('autosocial_settings', JSON.stringify(newSettings));
  };

  const handlePostCreated = async (newPost: Post) => {
    if (!user || !userProfile) return;
    
    if (newPost.status === 'scheduled') {
        const scheduledCount = posts.filter(p => p.status === 'scheduled' && p.id !== newPost.id).length;
        const role = userProfile.role;
        let limit = 3; 
        if (role === 'pro') limit = 5;
        else if (role === 'business') limit = 10;
        else if (role === 'admin') limit = 100;

        if (scheduledCount >= limit) {
            alert(`⚠️ 排程空間不足！您的方案最多儲存 ${limit} 篇排程貼文。`);
            return;
        }
    }
    
    try {
        setPosts(prev => {
            const exists = prev.find(p => p.id === newPost.id);
            if (exists) return prev.map(p => p.id === newPost.id ? newPost : p);
            return [newPost, ...prev];
        });

        await syncPostToCloud(user.uid, newPost);
        const updatedPosts = await fetchUserPostsFromCloud(user.uid);
        setPosts(updatedPosts);
        setEditingPost(null);
        setView(AppView.SCHEDULE);
    } catch (e: any) {
        alert(`同步失敗: ${e.message}`);
    }
  };

  const handleDeletePost = async (postId: string) => {
      if (!user) return;
      if (confirm("確定要從雲端永久刪除此紀錄嗎？")) {
          try {
              await deletePostFromCloud(user.uid, postId);
              setPosts(prev => prev.filter(p => p.id !== postId));
          } catch (e) {
              alert("刪除失敗");
          }
      }
  };

  const handleEditPost = (post: Post) => {
      setEditingPost(post);
      setView(AppView.CREATE);
  };

  const role = userProfile?.role || 'user';
  const isAdmin = role === 'admin';
  const isStarterPlus = ['starter', 'pro', 'business', 'admin'].includes(role);
  const isProPlus = ['pro', 'business', 'admin'].includes(role);
  const isBusinessPlus = ['business', 'admin'].includes(role);

  const hasAnalyticsAccess = isStarterPlus || userProfile?.unlockedFeatures?.includes('ANALYTICS');
  const hasAutomationAccess = isBusinessPlus || userProfile?.unlockedFeatures?.includes('AUTOMATION');
  const hasSeoAccess = isProPlus || userProfile?.unlockedFeatures?.includes('SEO');
  const hasThreadsAccess = isProPlus || userProfile?.unlockedFeatures?.includes('THREADS');

  if (loadingAuth) return <div className="h-screen flex items-center justify-center bg-dark text-white text-xl animate-pulse">AutoSocial AI 啟動中...</div>;
  if (view === AppView.LOGIN) return <Login onLoginSuccess={() => {}} />;

  const NavItem = ({ viewId, label, active, onClick, disabled = false, badge = "" }: any) => (
    <button 
      onClick={() => !disabled && onClick(viewId)} 
      className={`relative w-full text-left px-6 py-3 transition-all flex items-center justify-between group ${active ? 'bg-primary/10 text-primary font-bold' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>}
      <span className="text-[15px] tracking-wide">{label}</span>
      {badge && <span className="text-[9px] bg-gray-700 px-1.5 py-0.5 rounded uppercase tracking-tighter text-gray-400">{badge}</span>}
    </button>
  );

  return (
    <div className="min-h-screen bg-dark text-gray-200 flex flex-col md:flex-row relative font-sans">
      <aside className="w-full md:w-64 bg-card border-r border-gray-800 flex flex-col shadow-2xl z-30">
        <div className="p-8 border-b border-gray-800">
          <h1 className="text-xl font-black text-white tracking-tighter cursor-pointer flex items-center gap-2" onClick={() => setView(AppView.CREATE)}>
            AUTOSOCIAL <span className="text-primary">AI</span>
          </h1>
          <div className="mt-4 p-3 bg-dark/50 rounded-lg border border-gray-800">
            {userProfile ? (
                <>
                    <p className="truncate text-[10px] text-gray-500 mb-1 font-mono">{userProfile.email}</p>
                    <div className="flex justify-between items-center">
                        <p className="text-[11px] font-bold text-blue-400 uppercase tracking-widest">{userProfile.role}</p>
                        <p className="text-[10px] text-gray-500 font-bold">{userProfile.quota_used}/{userProfile.quota_total}</p>
                    </div>
                </>
            ) : <p className="text-xs text-gray-500">訪客模式</p>}
          </div>
        </div>
        
        <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto custom-scrollbar">
          <NavItem viewId={AppView.CREATE} label="建立貼文" active={view === AppView.CREATE} onClick={setView} />
          <NavItem viewId={AppView.SCHEDULE} label="排程與歷史" active={view === AppView.SCHEDULE} onClick={setView} />
          <NavItem viewId={AppView.SETTINGS} label="品牌設定" active={view === AppView.SETTINGS} onClick={setView} />
          
          <div className="pt-8 mb-2 px-6">
              <p className="text-[10px] text-gray-600 font-black tracking-[0.2em] uppercase">進階管理模組</p>
          </div>
          
          <NavItem viewId={AppView.ANALYTICS} label="數據分析中心" active={view === AppView.ANALYTICS} onClick={() => hasAnalyticsAccess ? setView(AppView.ANALYTICS) : alert("需升級至 Starter 方案或輸入解鎖金鑰")} disabled={!hasAnalyticsAccess} badge={!hasAnalyticsAccess ? "LOCK" : ""} />
          <NavItem viewId={AppView.AUTOMATION} label="全自動化中心" active={view === AppView.AUTOMATION} onClick={() => hasAutomationAccess ? setView(AppView.AUTOMATION) : alert("需升級至 Business 方案或輸入解鎖金鑰")} disabled={!hasAutomationAccess} badge={!hasAutomationAccess ? "LOCK" : ""} />
          <NavItem viewId={AppView.SEO_ARTICLES} label="SEO 文章生成" active={view === AppView.SEO_ARTICLES} onClick={() => hasSeoAccess ? setView(AppView.SEO_ARTICLES) : alert("需升級至 Pro 方案或輸入解鎖金鑰")} disabled={!hasSeoAccess} badge={!hasSeoAccess ? "LOCK" : ""} />
          <NavItem viewId={AppView.THREADS_NURTURE} label="Threads 養號系統" active={view === AppView.THREADS_NURTURE} onClick={() => hasThreadsAccess ? setView(AppView.THREADS_NURTURE) : alert("需升級至 Pro 方案或輸入解鎖金鑰")} disabled={!hasThreadsAccess} badge={!hasThreadsAccess ? "LOCK" : ""} />
          <NavItem viewId={AppView.REFERRAL} label="好友推薦計畫" active={view === AppView.REFERRAL} onClick={setView} />
        </nav>

        <div className="p-4 border-t border-gray-800 bg-dark/20 space-y-2">
          <button onClick={() => setShowKeyModal(true)} className="w-full text-left px-4 py-2 text-xs rounded transition-colors font-bold bg-yellow-900/20 text-yellow-400 hover:bg-yellow-900/40 border border-yellow-800/50 mb-2">
              🔑 兌換金鑰 (Redeem)
          </button>
          
          {isAdmin && (
            <button onClick={() => setView(AppView.ADMIN)} className={`w-full text-left px-4 py-2 text-xs rounded transition-colors font-bold ${view === AppView.ADMIN ? 'bg-red-900 text-white' : 'text-red-400 hover:bg-red-900/10'}`}>
              管理員後台
            </button>
          )}
          <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-xs text-gray-500 hover:text-red-400 transition-colors">
            登出系統
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-10 overflow-y-auto h-screen custom-scrollbar bg-dark/95">
        {view === AppView.CREATE && (
          <PostCreator 
            settings={settings} 
            user={userProfile} 
            onPostCreated={handlePostCreated} 
            onQuotaUpdate={refreshProfile} 
            editPost={editingPost} 
            onCancel={() => setEditingPost(null)}
            scheduledPostsCount={posts.filter(p => p.status === 'scheduled').length}
          />
        )}
        {view === AppView.SCHEDULE && (
          <ScheduleList posts={posts} onUpdatePosts={async (updated) => {
              const originalIds = posts.map(p => p.id);
              const updatedIds = updated.map(p => p.id);
              const deletedId = originalIds.find(id => !updatedIds.includes(id));
              if (deletedId) await handleDeletePost(deletedId);
              else {
                  const changed = updated.find((p, i) => JSON.stringify(p) !== JSON.stringify(posts.find(op => op.id === p.id)));
                  if (changed && user) await syncPostToCloud(user.uid, changed);
                  setPosts(updated);
              }
          }} onEditPost={handleEditPost} />
        )}
        {view === AppView.SETTINGS && <SettingsForm onSave={handleSaveSettings} initialSettings={settings} />}
        {view === AppView.ANALYTICS && <AnalyticsDashboard settings={settings} />}
        {view === AppView.AUTOMATION && <AutomationPanel settings={settings} onSave={handleSaveSettings} />}
        {view === AppView.SEO_ARTICLES && <SeoArticleGenerator user={userProfile} onQuotaUpdate={refreshProfile} />}
        {view === AppView.THREADS_NURTURE && <ThreadsNurturePanel settings={settings} user={userProfile} onSaveSettings={handleSaveSettings} onQuotaUpdate={refreshProfile} />}
        {view === AppView.REFERRAL && <ReferralPanel user={userProfile} onQuotaUpdate={refreshProfile} />}
        {view === AppView.ADMIN && isAdmin && <AdminPanel currentUser={userProfile!} />}
      </main>
      
      <button onClick={() => setShowReportModal(true)} className="fixed bottom-6 right-6 bg-red-600 hover:bg-red-500 text-white w-10 h-10 rounded-full z-40 shadow-2xl transition-transform active:scale-90 flex items-center justify-center font-bold text-lg">!</button>
      
      {/* Modals */}
      {showReportModal && <ErrorReportModal user={userProfile} currentView={view} onClose={() => setShowReportModal(false)} />}
      {showKeyModal && userProfile && <KeyRedemptionModal user={userProfile} onClose={() => setShowKeyModal(false)} onSuccess={refreshProfile} />}
    </div>
  );
};

export default App;
