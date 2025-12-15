
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
import ReferralPanel from './components/ReferralPanel'; // New Import
import ErrorReportModal from './components/ErrorReportModal'; // New Import
// #endregion

// #region Services & Auth Import
import { subscribeAuth, logout, getUserProfile, useAdminKey, changeUserPassword } from './services/authService';
// #endregion

// #region Default Configuration
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
  threadsAccounts: [], // Init empty array
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
// #endregion

// #region Helper Components (Modals)
const RedeemModal = ({ onClose, onRedeem }: { onClose: () => void, onRedeem: (key: string) => void }) => {
  const [key, setKey] = useState('');
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-card p-6 rounded-xl border border-gray-600 max-w-md w-full animate-fade-in">
        <h3 className="text-xl font-bold text-white mb-4">🔑 輸入金鑰解鎖功能</h3>
        <input 
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="KEY-XXXX-XXXX"
          className="w-full bg-dark border border-gray-600 rounded p-3 text-white mb-4 text-center font-mono uppercase"
        />
        <div className="flex gap-4">
          <button onClick={onClose} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded">取消</button>
          <button onClick={() => onRedeem(key)} disabled={!key} className="flex-1 bg-primary hover:bg-blue-600 text-white py-2 rounded font-bold disabled:opacity-50">確認兌換</button>
        </div>
      </div>
    </div>
  );
};

const ChangePasswordModal = ({ onClose }: { onClose: () => void }) => {
    const [pass, setPass] = useState('');
    const [msg, setMsg] = useState('');
    const [loading, setLoading] = useState(false);

    const handleUpdate = async () => {
        setLoading(true);
        setMsg('');
        try {
            await changeUserPassword(pass);
            setMsg('✅ 修改成功！');
            setTimeout(onClose, 1500);
        } catch (e: any) {
            setMsg(`❌ 失敗: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-xl border border-gray-600 max-w-md w-full animate-fade-in">
            <h3 className="text-xl font-bold text-white mb-4">🔐 修改密碼</h3>
            <input 
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="輸入新密碼"
              className="w-full bg-dark border border-gray-600 rounded p-3 text-white mb-4"
            />
            {msg && <p className="mb-4 text-center text-sm font-bold text-white">{msg}</p>}
            <div className="flex gap-4">
              <button onClick={onClose} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded">取消</button>
              <button onClick={handleUpdate} disabled={!pass || loading} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded font-bold disabled:opacity-50">確認修改</button>
            </div>
          </div>
        </div>
    );
};
// #endregion

const App: React.FC = () => {
  // #region State Management
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  const [view, setView] = useState<AppView>(AppView.LOGIN);
  const [settings, setSettings] = useState<BrandSettings>(defaultSettings);
  const [posts, setPosts] = useState<Post[]>([]);
  
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  
  // Bug Report State
  const [showReportModal, setShowReportModal] = useState(false);
  // #endregion

  // #region Auth & Initialization
  useEffect(() => {
    const unsubscribe = subscribeAuth(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile(profile);
        setView(AppView.CREATE);
        loadLocalData();
      } else {
        setUserProfile(null);
        setView(AppView.LOGIN);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const loadLocalData = () => {
    const savedSettings = localStorage.getItem('autosocial_settings');
    const savedPosts = localStorage.getItem('autosocial_posts');
    if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        // Merge with default to ensure new fields exist
        const merged = { ...defaultSettings, ...parsed };
        if(!merged.autoReply) merged.autoReply = defaultSettings.autoReply;
        if(!merged.autoPilot) merged.autoPilot = defaultSettings.autoPilot;
        if(!merged.threadsAccounts) merged.threadsAccounts = []; 
        
        // FIX: Ensure arrays to prevent SettingsForm crash
        if (!Array.isArray(merged.competitors)) merged.competitors = [];
        if (!Array.isArray(merged.referenceFiles)) merged.referenceFiles = [];
        
        setSettings(merged);
    }
    if (savedPosts) setPosts(JSON.parse(savedPosts));
  };
  // #endregion

  // #region Handlers (Auth, Key, Data)
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

  const handleRedeemKey = async (key: string) => {
    if (user) {
      const res = await useAdminKey(user.uid, key);
      alert(res.message);
      if (res.success) {
         await refreshProfile();
         setShowRedeemModal(false);
      }
    }
  };

  const handleSaveSettings = (newSettings: BrandSettings) => {
    setSettings(newSettings);
    localStorage.setItem('autosocial_settings', JSON.stringify(newSettings));
  };

  const handlePostCreated = (newPost: Post) => {
    let updatedPosts;
    if (posts.find(p => p.id === newPost.id)) {
        updatedPosts = posts.map(p => p.id === newPost.id ? newPost : p);
    } else {
        updatedPosts = [newPost, ...posts];
    }
    setPosts(updatedPosts);
    localStorage.setItem('autosocial_posts', JSON.stringify(updatedPosts));
    setEditingPost(null);
    setView(AppView.SCHEDULE);
  };

  const handleEditPost = (post: Post) => {
      setEditingPost(post);
      setView(AppView.CREATE);
  };

  const handleUpdatePosts = (updatedPosts: Post[]) => {
      setPosts(updatedPosts);
      localStorage.setItem('autosocial_posts', JSON.stringify(updatedPosts));
  };
  // #endregion

  // #region Render Logic & Permissions
  const role = userProfile?.role || 'user';
  // Role Hierarchy: user(Free) < starter < pro < business < admin
  const isStarterPlus = ['starter', 'pro', 'business', 'admin'].includes(role);
  const isProPlus = ['pro', 'business', 'admin'].includes(role);
  const isBusinessPlus = ['business', 'admin'].includes(role);
  const isAdmin = role === 'admin';

  // Specific Feature Access
  const hasAnalyticsAccess = isStarterPlus || userProfile?.unlockedFeatures?.includes('ANALYTICS');
  const hasAutomationAccess = isBusinessPlus || userProfile?.unlockedFeatures?.includes('AUTOMATION');
  const hasSeoAccess = isProPlus || userProfile?.unlockedFeatures?.includes('SEO') || userProfile?.unlockedFeatures?.includes('SEO_ARTICLES');
  const hasThreadsAccess = isProPlus || userProfile?.unlockedFeatures?.includes('THREADS');

  if (loadingAuth) return <div className="h-screen flex items-center justify-center bg-dark text-white">載入中...</div>;

  if (view === AppView.LOGIN) {
    return <Login onLoginSuccess={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-dark text-gray-200 flex flex-col md:flex-row relative">
      {/* #region Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-card border-r border-gray-700 flex flex-col">
        <div className="p-6 border-b border-gray-700">
          <h1 
            className="text-2xl font-bold text-blue-400 cursor-pointer hover:text-blue-300 transition-colors"
            onClick={() => setView(AppView.CREATE)}
            title="回到首頁"
          >
            AutoSocial AI
          </h1>
          <div className="mt-2 text-xs text-gray-400">
            {userProfile ? (
                <>
                    <p className="truncate" title={userProfile.email}>{userProfile.email}</p>
                    <p className="mt-1 flex items-center">
                        <span className={`px-2 py-0.5 rounded text-white mr-2 font-bold text-[10px] uppercase ${
                            userProfile.role === 'business' ? 'bg-yellow-600' : 
                            userProfile.role === 'pro' ? 'bg-purple-600' :
                            userProfile.role === 'starter' ? 'bg-green-600' :
                            userProfile.role === 'admin' ? 'bg-red-600' : 'bg-gray-600'
                        }`}>{userProfile.role === 'user' ? 'FREE' : userProfile.role}</span>
                        <span>Quota: {userProfile.quota_used}/{userProfile.quota_total}</span>
                    </p>
                </>
            ) : 'Guest'}
          </div>
          <button onClick={() => setShowRedeemModal(true)} className="w-full mt-4 bg-gray-700 hover:bg-gray-600 text-white text-xs py-2 rounded border border-gray-600">
             🔑 輸入金鑰
          </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {/* Group 1: Core */}
          <button onClick={() => setView(AppView.CREATE)} className={`w-full text-left px-4 py-3 rounded transition-colors ${view === AppView.CREATE ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
             ✨ 建立 FB 貼文
          </button>
          
          <button 
             onClick={() => {
                 if(isStarterPlus) setView(AppView.SCHEDULE);
                 else alert("排程管理功能僅限「Starter」以上方案使用。\n\n請升級以解鎖完整功能。");
             }} 
             className={`w-full text-left px-4 py-3 rounded transition-colors flex justify-between items-center ${view === AppView.SCHEDULE ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
             <span>📅 排程管理</span>
             {!isStarterPlus && <span className="text-xs">🔒</span>}
          </button>
          
          {/* Group 2: Data & Settings */}
          <div className="pt-4 border-t border-gray-700">
             <button 
                onClick={() => {
                    if (hasAnalyticsAccess) setView(AppView.ANALYTICS);
                    else alert("數據分析功能僅限「Starter」以上方案使用。");
                }} 
                className={`w-full text-left px-4 py-3 rounded transition-colors flex justify-between items-center ${view === AppView.ANALYTICS ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              >
                 <span>📊 數據分析</span>
                 {!hasAnalyticsAccess && <span className="text-xs">🔒</span>}
              </button>
              
              <button 
                onClick={() => {
                    if (hasAutomationAccess) setView(AppView.AUTOMATION);
                    else alert("AutoPilot 自動化功能僅限「Business (企業版)」使用。\n\n這是最高階的自動營運功能。");
                }} 
                className={`w-full text-left px-4 py-3 rounded transition-colors flex justify-between items-center ${view === AppView.AUTOMATION ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              >
                 <span>🤖 自動化設定</span>
                 {!hasAutomationAccess && <span className="text-xs">🔒</span>}
              </button>

              <button onClick={() => setView(AppView.SETTINGS)} className={`w-full text-left px-4 py-3 rounded transition-colors ${view === AppView.SETTINGS ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
                 ⚙️ 品牌設定
              </button>
          </div>

          {/* Group 3: Growth Tools */}
          <div className="pt-4 border-t border-gray-700">
              <button 
                onClick={() => setView(AppView.REFERRAL)} 
                className={`w-full text-left px-4 py-3 rounded transition-colors flex justify-between items-center ${view === AppView.REFERRAL ? 'bg-green-900 border border-green-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              >
                 <span>🎁 推薦獎勵</span>
                 <span className="text-xs bg-green-600 px-1 rounded text-white">Free</span>
              </button>

              <button 
                onClick={() => {
                    if (hasThreadsAccess) setView(AppView.THREADS_NURTURE);
                    else alert("Threads 養號功能僅限「Pro (專業版)」以上方案使用。\n\n請升級以解鎖此核心功能。");
                }} 
                className={`w-full text-left px-4 py-3 rounded transition-colors flex justify-between items-center ${view === AppView.THREADS_NURTURE ? 'bg-black border border-gray-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              >
                 <span>🧵 Threads 養號</span>
                 {!hasThreadsAccess && <span className="text-xs">🔒</span>}
              </button>

              <button 
                onClick={() => {
                    if (hasSeoAccess) setView(AppView.SEO_ARTICLES);
                    else alert("SEO 文章生成僅限「Pro (專業版)」以上方案使用。");
                }} 
                className={`w-full text-left px-4 py-3 rounded transition-colors flex justify-between items-center ${view === AppView.SEO_ARTICLES ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              >
                 <span>📝 SEO 文章</span>
                 {!hasSeoAccess && <span className="text-xs">🔒</span>}
              </button>
          </div>
        </nav>

        <div className="p-4 border-t border-gray-700 space-y-2">
          {isAdmin && (
              <button onClick={() => setView(AppView.ADMIN)} className={`w-full text-left px-4 py-2 text-sm transition-colors rounded border flex items-center gap-2 ${view === AppView.ADMIN ? 'bg-red-900/50 text-red-200 border-red-900' : 'text-red-400 border-transparent hover:bg-gray-800'}`}>
                 👮 管理員後台
              </button>
          )}
          <button onClick={() => setShowPwdModal(true)} className="w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2">
             🔑 修改密碼
          </button>
          <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:text-red-400 transition-colors flex items-center gap-2">
             🚪 登出
          </button>
        </div>
      </aside>
      {/* #endregion */}

      {/* #region Main Content View Switch */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-screen relative">
        {view === AppView.CREATE && (
          <PostCreator 
            settings={settings} 
            user={userProfile}
            onPostCreated={handlePostCreated} 
            onQuotaUpdate={refreshProfile}
            editPost={editingPost}
            onCancel={() => setEditingPost(null)}
          />
        )}

        {view === AppView.SCHEDULE && (
          <ScheduleList 
            posts={posts} 
            onUpdatePosts={handleUpdatePosts}
            onEditPost={handleEditPost}
          />
        )}
        
        {view === AppView.REFERRAL && (
            <ReferralPanel user={userProfile} onQuotaUpdate={refreshProfile} />
        )}

        {view === AppView.THREADS_NURTURE && (
           hasThreadsAccess ? 
           <ThreadsNurturePanel 
              settings={settings} 
              user={userProfile} 
              onSaveSettings={handleSaveSettings}
              onQuotaUpdate={refreshProfile}
           /> : <div className="p-8 text-center text-gray-500">Access Denied</div>
        )}

        {view === AppView.ANALYTICS && (
          hasAnalyticsAccess ? <AnalyticsDashboard settings={settings} /> : <div className="p-8 text-center text-gray-500">Access Denied</div>
        )}
        
        {view === AppView.AUTOMATION && (
          hasAutomationAccess ? <AutomationPanel settings={settings} onSave={handleSaveSettings} /> : <div className="p-8 text-center text-gray-500">Access Denied</div>
        )}

        {view === AppView.SEO_ARTICLES && (
            hasSeoAccess ? <SeoArticleGenerator user={userProfile} onQuotaUpdate={refreshProfile} /> : <div className="p-8 text-center text-gray-500">Access Denied</div>
        )}

        {view === AppView.SETTINGS && (
             <SettingsForm 
               onSave={handleSaveSettings} 
               initialSettings={settings} 
             />
        )}

        {view === AppView.ADMIN && isAdmin && (
          <AdminPanel currentUser={userProfile!} />
        )}
      </main>
      {/* #endregion */}
      
      {/* Modals */}
      {showRedeemModal && <RedeemModal onClose={() => setShowRedeemModal(false)} onRedeem={handleRedeemKey} />}
      {showPwdModal && <ChangePasswordModal onClose={() => setShowPwdModal(false)} />}
      
      {/* Bug Report Button (Always visible) */}
      <button 
        onClick={() => setShowReportModal(true)}
        className="fixed bottom-4 right-4 bg-red-900/80 text-white p-2 rounded-full shadow-lg border border-red-500 hover:bg-red-800 transition-colors z-40"
        title="回報問題"
      >
        🐞
      </button>
      {showReportModal && <ErrorReportModal user={userProfile} currentView={view} onClose={() => setShowReportModal(false)} />}
    </div>
  );
};

export default App;
