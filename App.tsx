

import React, { useState, useEffect } from 'react';
import { AppView, BrandSettings, Post, UserProfile } from './types';
import SettingsForm from './components/SettingsForm';
import { PostCreator } from './components/PostCreator';
import ScheduleList from './components/ScheduleList';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import AutomationPanel from './components/AutomationPanel';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import SeoArticleGenerator from './components/SeoArticleGenerator';

import { subscribeAuth, logout, getUserProfile, useAdminKey, changeUserPassword } from './services/authService';

const defaultSettings: BrandSettings = {
  industry: '',
  services: '',
  website: '',
  productInfo: '',
  brandTone: 'Professional',
  persona: '',
  facebookPageId: '',
  facebookToken: '',
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

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  const [view, setView] = useState<AppView>(AppView.LOGIN);
  const [settings, setSettings] = useState<BrandSettings>(defaultSettings);
  const [posts, setPosts] = useState<Post[]>([]);
  
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);

  // Auth Listener
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
        setSettings(merged);
    }
    if (savedPosts) setPosts(JSON.parse(savedPosts));
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
    alert("設定已儲存！");
  };

  const handlePostCreated = (newPost: Post) => {
    // If editing, replace. If new, append.
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

  if (loadingAuth) return <div className="h-screen flex items-center justify-center bg-dark text-white">載入中...</div>;

  if (view === AppView.LOGIN) {
    return <Login onLoginSuccess={() => {}} />;
  }

  // Permission Checks
  const hasAnalyticsAccess = userProfile?.role !== 'user' || userProfile?.unlockedFeatures?.includes('ANALYTICS');
  const hasAutomationAccess = userProfile?.role !== 'user' || userProfile?.unlockedFeatures?.includes('AUTOMATION');
  const hasSeoAccess = userProfile?.role !== 'user' || userProfile?.unlockedFeatures?.includes('SEO') || userProfile?.unlockedFeatures?.includes('SEO_ARTICLES');
  const isAdmin = userProfile?.role === 'admin';

  return (
    <div className="min-h-screen bg-dark text-gray-200 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-card border-r border-gray-700 flex flex-col">
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-2xl font-bold text-blue-400">AutoSocial AI</h1>
          <div className="mt-2 text-xs text-gray-400">
            {userProfile ? (
                <>
                    <p className="truncate" title={userProfile.email}>{userProfile.email}</p>
                    <p className="mt-1 flex items-center">
                        <span className={`px-2 py-0.5 rounded text-white mr-2 font-bold text-[10px] uppercase ${
                            userProfile.role === 'vip' ? 'bg-yellow-600' : 
                            userProfile.role === 'pro' ? 'bg-purple-600' :
                            userProfile.role === 'admin' ? 'bg-red-600' : 'bg-gray-600'
                        }`}>{userProfile.role}</span>
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
          <button onClick={() => setView(AppView.CREATE)} className={`w-full text-left px-4 py-3 rounded transition-colors ${view === AppView.CREATE ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
             ✨ 建立貼文
          </button>
          
          <button onClick={() => setView(AppView.SCHEDULE)} className={`w-full text-left px-4 py-3 rounded transition-colors ${view === AppView.SCHEDULE ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
             📅 排程管理
          </button>
          
          <div className="pt-4 border-t border-gray-700">
              <button 
                onClick={() => {
                    if (hasAnalyticsAccess) setView(AppView.ANALYTICS);
                    else setShowRedeemModal(true);
                }} 
                className={`w-full text-left px-4 py-3 rounded transition-colors flex justify-between items-center ${view === AppView.ANALYTICS ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              >
                 <span>📊 數據分析</span>
                 {!hasAnalyticsAccess && <span className="text-xs">🔒</span>}
              </button>
              
              <button 
                onClick={() => {
                    if (hasAutomationAccess) setView(AppView.AUTOMATION);
                    else setShowRedeemModal(true);
                }} 
                className={`w-full text-left px-4 py-3 rounded transition-colors flex justify-between items-center ${view === AppView.AUTOMATION ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              >
                 <span>🤖 自動化設定</span>
                 {!hasAutomationAccess && <span className="text-xs">🔒</span>}
              </button>

              <button 
                onClick={() => {
                    if (hasSeoAccess) setView(AppView.SEO_ARTICLES);
                    else setShowRedeemModal(true);
                }} 
                className={`w-full text-left px-4 py-3 rounded transition-colors flex justify-between items-center ${view === AppView.SEO_ARTICLES ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              >
                 <span>📝 SEO 文章</span>
                 {!hasSeoAccess && <span className="text-xs">🔒</span>}
              </button>
          </div>

          <div className="pt-4 border-t border-gray-700">
              <button onClick={() => setView(AppView.SETTINGS)} className={`w-full text-left px-4 py-3 rounded transition-colors ${view === AppView.SETTINGS ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
                 ⚙️ 品牌設定
              </button>
              
              {isAdmin && (
                  <button onClick={() => setView(AppView.ADMIN)} className={`w-full text-left px-4 py-3 rounded transition-colors ${view === AppView.ADMIN ? 'bg-red-900/50 text-red-200 border border-red-900' : 'text-red-400 hover:bg-gray-800'}`}>
                     👮 管理員後台
                  </button>
              )}
          </div>
        </nav>

        <div className="p-4 border-t border-gray-700 space-y-2">
          <button onClick={() => setShowPwdModal(true)} className="w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2">
             🔑 修改密碼
          </button>
          <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:text-red-400 transition-colors flex items-center gap-2">
             🚪 登出
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-screen">
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
            initialSettings={settings} 
            onSave={handleSaveSettings} 
          />
        )}

        {view === AppView.ADMIN && isAdmin && userProfile && (
           <AdminPanel currentUser={userProfile} />
        )}
      </main>

      {/* Modals */}
      {showRedeemModal && (
          <RedeemModal onClose={() => setShowRedeemModal(false)} onRedeem={handleRedeemKey} />
      )}
      {showPwdModal && (
          <ChangePasswordModal onClose={() => setShowPwdModal(false)} />
      )}
    </div>
  );
};

export default App;