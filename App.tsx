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
  competitors: [],
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

  /**
   * 建立/更新貼文：同步至雲端並執行「方案排程上限」檢查
   */
  const handlePostCreated = async (newPost: Post) => {
    if (!user || !userProfile) return;
    
    // 排程上限檢查
    if (newPost.status === 'scheduled') {
        const scheduledCount = posts.filter(p => p.status === 'scheduled' && p.id !== newPost.id).length;
        const role = userProfile.role;
        
        let limit = 3; 
        if (role === 'pro') limit = 5;
        else if (role === 'business') limit = 10;
        else if (role === 'admin') limit = 100;

        if (scheduledCount >= limit) {
            alert(`⚠️ 排程空間不足！\n您的方案 (${role.toUpperCase()}) 最多僅能儲存 ${limit} 篇雲端排程貼文。\n\n請刪除舊貼文或升級方案。`);
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

  // 權限檢查邏輯
  const role = userProfile?.role || 'user';
  const isAdmin = role === 'admin';
  const isStarterPlus = ['starter', 'pro', 'business', 'admin'].includes(role);
  const isProPlus = ['pro', 'business', 'admin'].includes(role);
  const isBusinessPlus = ['business', 'admin'].includes(role);

  const hasAnalyticsAccess = isStarterPlus || userProfile?.unlockedFeatures?.includes('ANALYTICS');
  const hasAutomationAccess = isBusinessPlus || userProfile?.unlockedFeatures?.includes('AUTOMATION');
  const hasSeoAccess = isProPlus || userProfile?.unlockedFeatures?.includes('SEO');
  const hasThreadsAccess = isProPlus || userProfile?.unlockedFeatures?.includes('THREADS');

  if (loadingAuth) return <div className="h-screen flex items-center justify-center bg-dark text-white">載入中...</div>;
  if (view === AppView.LOGIN) return <Login onLoginSuccess={() => {}} />;

  return (
    <div className="min-h-screen bg-dark text-gray-200 flex flex-col md:flex-row relative">
      {/* 側邊導航欄 - 已恢復所有遺失功能 */}
      <aside className="w-full md:w-64 bg-card border-r border-gray-700 flex flex-col">
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-2xl font-bold text-blue-400 cursor-pointer" onClick={() => setView(AppView.CREATE)}>AutoSocial AI</h1>
          <div className="mt-2 text-[10px] text-gray-400">
            {userProfile ? (
                <>
                    <p className="truncate font-mono">{userProfile.email}</p>
                    <div className="flex justify-between mt-1 items-center">
                        <p className="font-bold text-primary uppercase">{userProfile.role}</p>
                        <p className="text-gray-500">Q: {userProfile.quota_used}/{userProfile.quota_total}</p>
                    </div>
                </>
            ) : 'Guest'}
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          <button onClick={() => setView(AppView.CREATE)} className={`w-full text-left px-4 py-3 rounded transition-colors ${view === AppView.CREATE ? 'bg-primary text-white font-bold' : 'text-gray-400 hover:bg-gray-800'}`}>✨ 建立貼文</button>
          <button onClick={() => setView(AppView.SCHEDULE)} className={`w-full text-left px-4 py-3 rounded transition-colors ${view === AppView.SCHEDULE ? 'bg-primary text-white font-bold' : 'text-gray-400 hover:bg-gray-800'}`}>📅 排程與歷史</button>
          <button onClick={() => setView(AppView.SETTINGS)} className={`w-full text-left px-4 py-3 rounded transition-colors ${view === AppView.SETTINGS ? 'bg-primary text-white font-bold' : 'text-gray-400 hover:bg-gray-800'}`}>⚙️ 品牌設定</button>
          
          <div className="pt-4 mt-4 border-t border-gray-700 space-y-1">
              <p className="px-4 text-[10px] text-gray-600 font-bold mb-2 tracking-widest uppercase">進階模組</p>
              <button onClick={() => { if(hasAnalyticsAccess) setView(AppView.ANALYTICS); else alert("需要 Starter 以上方案"); }} className={`w-full text-left px-4 py-3 rounded transition-colors ${view === AppView.ANALYTICS ? 'bg-indigo-900 text-white font-bold' : 'text-gray-400 hover:bg-gray-800'}`}>📊 數據分析</button>
              <button onClick={() => { if(hasAutomationAccess) setView(AppView.AUTOMATION); else alert("需要 Business 以上方案"); }} className={`w-full text-left px-4 py-3 rounded transition-colors ${view === AppView.AUTOMATION ? 'bg-indigo-900 text-white font-bold' : 'text-gray-400 hover:bg-gray-800'}`}>🤖 自動化中心</button>
              <button onClick={() => { if(hasSeoAccess) setView(AppView.SEO_ARTICLES); else alert("需要 Pro 以上方案"); }} className={`w-full text-left px-4 py-3 rounded transition-colors ${view === AppView.SEO_ARTICLES ? 'bg-indigo-900 text-white font-bold' : 'text-gray-400 hover:bg-gray-800'}`}>📝 SEO 文章</button>
              <button onClick={() => { if(hasThreadsAccess) setView(AppView.THREADS_NURTURE); else alert("需要 Pro 以上方案"); }} className={`w-full text-left px-4 py-3 rounded transition-colors ${view === AppView.THREADS_NURTURE ? 'bg-indigo-900 text-white font-bold' : 'text-gray-400 hover:bg-gray-800'}`}>🧵 Threads 養號</button>
              <button onClick={() => setView(AppView.REFERRAL)} className={`w-full text-left px-4 py-3 rounded transition-colors text-green-400 font-bold ${view === AppView.REFERRAL ? 'bg-green-900/30' : 'hover:bg-gray-800'}`}>🎁 推薦獎勵</button>
          </div>
        </nav>

        <div className="p-4 border-t border-gray-700 space-y-2">
          {isAdmin && <button onClick={() => setView(AppView.ADMIN)} className={`w-full text-left px-4 py-2 text-sm rounded ${view === AppView.ADMIN ? 'bg-red-900 text-white' : 'text-red-400 hover:bg-red-900/20'}`}>👮 管理員後台</button>}
          <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:text-red-400 transition-colors">🚪 登出系統</button>
        </div>
      </aside>

      {/* 主內容區 - 確保所有視圖都被渲染 */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-screen custom-scrollbar">
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
      
      <button onClick={() => setShowReportModal(true)} className="fixed bottom-4 right-4 bg-red-900/80 text-white p-2 rounded-full z-40 shadow-xl hover:scale-110 transition-transform">🐞</button>
      {showReportModal && <ErrorReportModal user={userProfile} currentView={view} onClose={() => setShowReportModal(false)} />}
    </div>
  );
};

export default App;
