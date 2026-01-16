
import React, { useState, useEffect } from 'react';
import { AppView, BrandSettings, Post, UserProfile, ThreadsAccount } from './types';

// #region Components Import
import SettingsForm from './components/SettingsForm';
import { PostCreator } from './components/PostCreator';
import ScheduleList from './components/ScheduleList';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import AutomationPanel from './components/AutomationPanel';
import ThreadsNurturePanel from './components/ThreadsNurturePanel';
import ConnectPanel from './components/ConnectPanel';
import SocialStockMarket from './components/SocialStockMarket'; // New
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import SeoArticleGenerator from './components/SeoArticleGenerator';
import ReferralPanel from './components/ReferralPanel'; 
import ErrorReportModal from './components/ErrorReportModal'; 
import KeyRedemptionModal from './components/KeyRedemptionModal';
import PricingPanel from './components/PricingPanel';
import ContactSupportPanel from './components/ContactSupportPanel'; 
import AiAssistantBubble from './components/AiAssistantBubble'; 
import QueueOverlay from './components/QueueOverlay'; 
// #endregion

// #region Services & Auth Import
import { subscribeAuth, logout, getUserProfile, fetchUserPostsFromCloud, syncPostToCloud, deletePostFromCloud, exchangeThreadsAuth } from './services/authService';
import { isFirebaseReady, isMock } from './services/firebase'; 
// #endregion

// #region Icons
const Icons = {
  Market: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
  Create: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  Schedule: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  Settings: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Analytics: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" /></svg>,
  Automation: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  Seo: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
  Threads: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" /></svg>,
  Connect: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  Referral: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>,
  Pricing: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Key: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>,
  Admin: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  Logout: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  Menu: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  Close: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  Support: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
};
// #endregion

const defaultSettings: BrandSettings = {
  industry: '',
  brandName: '', 
  brandType: 'enterprise',
  services: '',
  website: '',
  productInfo: '',
  brandTone: 'Professional',
  persona: '',
  brandColors: ['#000000', '#ffffff', '#cccccc'],
  targetAudience: '',
  visualStyle: 'minimalist',
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
  
  // Navigation State for Stock Market
  const [prefilledTopic, setPrefilledTopic] = useState('');

  const [showReportModal, setShowReportModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProcessingThreads, setIsProcessingThreads] = useState(false);

  // ... (Existing OAuth and Auth Logic) ...
  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code && window.opener && window.opener !== window) {
          console.log("🔐 [threads] Popup detected, sending code to parent...");
          window.opener.postMessage({ type: 'THREADS_OAUTH_CODE', code }, window.location.origin);
          window.close();
      }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAuth(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile(profile);
        // Default to Market view on login
        setView(AppView.MARKET);
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

  useEffect(() => {
      const handleThreadsCallback = async () => {
          if (loadingAuth || !user) return; 
          const params = new URLSearchParams(window.location.search);
          const code = params.get('code');
          if (code && !window.opener) {
              if (isProcessingThreads) return;
              setIsProcessingThreads(true);
              try {
                  if (!localStorage.getItem('autosocial_pending_oauth')) return; 
                  const result = await exchangeThreadsAuth(code, window.location.origin);
                  const newAccount: ThreadsAccount = {
                      id: Date.now().toString(),
                      userId: result.userId,
                      token: result.token,
                      username: result.username || `User_${result.userId.slice(-4)}`,
                      isActive: true,
                      accountType: 'personal',
                      styleGuide: ''
                  };
                  const updatedSettings = {
                      ...settings,
                      threadsAccounts: [...(settings.threadsAccounts || []), newAccount]
                  };
                  setSettings(updatedSettings);
                  localStorage.setItem('autosocial_settings', JSON.stringify(updatedSettings));
                  localStorage.removeItem('autosocial_pending_oauth'); 
                  alert(`Threads 帳號 ${newAccount.username} 連接成功！`);
                  window.history.replaceState({}, document.title, window.location.pathname);
                  setView(AppView.THREADS_NURTURE);
              } catch (e: any) {
                  alert(`Threads 串接失敗: ${e.message}`);
              } finally {
                  setIsProcessingThreads(false);
              }
          }
      };
      handleThreadsCallback();
  }, [loadingAuth, user, settings]); 

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
      try {
          await deletePostFromCloud(user.uid, postId);
          setPosts(prev => prev.filter(p => p.id !== postId));
      } catch (e) { alert("刪除失敗"); }
  };

  const handleEditPost = (post: Post) => {
      setEditingPost(post);
      setView(AppView.CREATE);
  };

  const handleStockNavigate = (topic: string, platform: 'fb' | 'threads') => {
      setPrefilledTopic(topic);
      if (platform === 'fb') {
          // Navigate to FB Creator, passing topic via state
          // Editing post must be null to trigger fresh state in PostCreator
          setEditingPost(null); 
          setView(AppView.CREATE);
      } else {
          // Navigate to Threads Nurture Panel
          setView(AppView.THREADS_NURTURE);
      }
  };

  const role = userProfile?.role || 'user';
  const isAdmin = role === 'admin';
  const isStarterPlus = ['starter', 'pro', 'business', 'admin'].includes(role);
  const isProPlus = ['pro', 'business', 'admin'].includes(role);
  const isBusinessPlus = ['business', 'admin'].includes(role);

  const hasAnalyticsAccess = isStarterPlus || userProfile?.unlockedFeatures?.includes('ANALYTICS');
  const hasAutomationAccess = isProPlus || userProfile?.unlockedFeatures?.includes('AUTOMATION');
  const hasSeoAccess = isProPlus || userProfile?.unlockedFeatures?.includes('SEO');
  const hasThreadsAccess = isProPlus || userProfile?.unlockedFeatures?.includes('THREADS');

  // Check params for OAuth Authorizing view
  const searchParams = new URLSearchParams(window.location.search);

  if (loadingAuth) return <div className="h-screen flex items-center justify-center bg-bg text-primary text-xl animate-pulse font-mono tracking-widest">INITIALIZING SYSTEM...</div>;
  if (searchParams.get('code') && window.opener) return <div className="h-screen flex items-center justify-center bg-black text-white text-sm font-mono">🔐 Authorizing Threads... (Closing soon)</div>;
  if (isProcessingThreads) return <div className="h-screen flex items-center justify-center bg-bg text-pink-500 text-xl font-bold animate-pulse">正在與 Threads 進行安全連線...</div>;
  if (view === AppView.LOGIN) return <Login onLoginSuccess={() => {}} />;

  const NavItem = ({ viewId, label, active, onClick, disabled = false, badge = "", icon }: any) => (
    <button 
      onClick={() => {
          if (!disabled) {
              onClick(viewId);
              setIsSidebarOpen(false); 
          }
      }} 
      className={`relative w-full text-left px-6 py-3.5 transition-all duration-300 flex items-center justify-between group 
        ${active ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:text-white hover:bg-white/5'} 
        ${disabled ? 'opacity-40 cursor-not-allowed grayscale' : ''}
        border-l-2 ${active ? 'border-primary' : 'border-transparent hover:border-white/30'}
      `}
    >
      {active && <div className="absolute inset-0 bg-primary/5 shadow-[0_0_20px_rgba(0,242,234,0.1)]"></div>}
      <div className="flex items-center gap-3 relative z-10">
          <span className={`transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>{icon}</span>
          <span className="text-[14px] font-medium tracking-wide">{label}</span>
      </div>
      {badge && <span className="text-[9px] bg-black/50 border border-gray-700 px-1.5 py-0.5 rounded uppercase tracking-tighter text-gray-400 font-bold">{badge}</span>}
    </button>
  );

  return (
    <div className="min-h-screen text-gray-200 flex flex-col md:flex-row relative font-sans overflow-hidden">
      
      {/* Mobile Header */}
      <div className="md:hidden flex justify-between items-center p-4 glass-panel border-b border-white/10 relative z-50">
          <h1 className="text-lg font-black tracking-tighter text-white flex items-center gap-2">
            AUTO<span className="text-neon-cyan">SOCIAL</span>
          </h1>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-white p-2">
             {isSidebarOpen ? Icons.Close : Icons.Menu}
          </button>
      </div>

      {/* Glass Sidebar */}
      <aside className={`
          fixed md:relative inset-y-0 left-0 w-72 glass-panel z-40 transform transition-transform duration-300 ease-out flex flex-col
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-8 pb-4">
          <h1 className="text-2xl font-black text-white tracking-tighter cursor-pointer flex items-center gap-2 select-none" onClick={() => setView(AppView.MARKET)}>
            AUTO<span className="text-neon-cyan drop-shadow-[0_0_8px_rgba(0,242,234,0.6)]">SOCIAL</span>
          </h1>
          {isMock && <div className="mt-2 text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded border border-yellow-500/50 text-center font-bold tracking-wider">⚠️ Preview Mode (Mock Data)</div>}
          <div className="mt-6 p-4 glass-card rounded-xl border border-white/10 bg-black/20">
            {userProfile ? (
                <>
                    <div className="flex justify-between items-start mb-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-black font-bold text-xs">
                            {userProfile.email[0].toUpperCase()}
                        </div>
                        <div className={`text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider ${userProfile.role === 'admin' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : userProfile.role === 'business' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 'bg-primary/20 text-primary border border-primary/50'}`}>
                            {userProfile.role}
                        </div>
                    </div>
                    <p className="truncate text-xs text-gray-400 mb-3 font-mono">{userProfile.email}</p>
                    <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mb-1">
                        <div className="h-full bg-primary shadow-[0_0_10px_#00f2ea]" style={{ width: `${Math.min(100, (userProfile.quota_used / userProfile.quota_total) * 100)}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500 font-bold mb-2"><span>點數</span><span>{userProfile.quota_used} / {userProfile.quota_total}</span></div>
                </>
            ) : <p className="text-xs text-gray-500">GUEST MODE</p>}
          </div>
        </div>
        
        <nav className="flex-1 py-4 space-y-1 overflow-y-auto custom-scrollbar">
          <NavItem viewId={AppView.MARKET} label="社群交易所" icon={Icons.Market} active={view === AppView.MARKET} onClick={setView} badge="HOT" />
          <NavItem viewId={AppView.CREATE} label="內容創作" icon={Icons.Create} active={view === AppView.CREATE} onClick={setView} />
          <NavItem viewId={AppView.SCHEDULE} label="排程與歷史" icon={Icons.Schedule} active={view === AppView.SCHEDULE} onClick={setView} />
          <NavItem viewId={AppView.SETTINGS} label="品牌設定" icon={Icons.Settings} active={view === AppView.SETTINGS} onClick={setView} />
          
          <div className="mt-6 mb-2 px-6">
              <p className="text-[10px] text-gray-500 font-black tracking-[0.2em] uppercase">智慧功能</p>
          </div>
          <NavItem viewId={AppView.ANALYTICS} label="數據分析" icon={Icons.Analytics} active={view === AppView.ANALYTICS} onClick={() => hasAnalyticsAccess ? setView(AppView.ANALYTICS) : alert("需升級至 Starter 方案")} disabled={!hasAnalyticsAccess} badge={!hasAnalyticsAccess ? "LOCKED" : ""} />
          <NavItem viewId={AppView.AUTOMATION} label="全自動化" icon={Icons.Automation} active={view === AppView.AUTOMATION} onClick={() => hasAutomationAccess ? setView(AppView.AUTOMATION) : alert("需升級至 Pro 方案")} disabled={!hasAutomationAccess} badge={!hasAutomationAccess ? "LOCKED" : ""} />
          <NavItem viewId={AppView.SEO_ARTICLES} label="SEO 文章" icon={Icons.Seo} active={view === AppView.SEO_ARTICLES} onClick={() => hasSeoAccess ? setView(AppView.SEO_ARTICLES) : alert("需升級至 Pro 方案")} disabled={!hasSeoAccess} badge={!hasSeoAccess ? "LOCKED" : ""} />
          <NavItem viewId={AppView.THREADS_NURTURE} label="Threads 進階" icon={Icons.Threads} active={view === AppView.THREADS_NURTURE} onClick={() => hasThreadsAccess ? setView(AppView.THREADS_NURTURE) : alert("需升級至 Pro 方案")} disabled={!hasThreadsAccess} badge={!hasThreadsAccess ? "LOCKED" : ""} />
          <NavItem viewId={AppView.CONNECT} label="口碑媒合" icon={Icons.Connect} active={view === AppView.CONNECT} onClick={setView} />
          
          <div className="mt-6 mb-2 px-6">
              <p className="text-[10px] text-gray-500 font-black tracking-[0.2em] uppercase">成長工具</p>
          </div>
          <NavItem viewId={AppView.PRICING} label="費率說明" icon={Icons.Pricing} active={view === AppView.PRICING} onClick={setView} />
          <NavItem viewId={AppView.REFERRAL} label="推薦計畫" icon={Icons.Referral} active={view === AppView.REFERRAL} onClick={setView} />
        </nav>

        <div className="p-4 bg-black/20 space-y-2 border-t border-white/5">
          <button onClick={() => setShowKeyModal(true)} className="w-full text-left px-4 py-3 text-xs rounded-lg transition-all font-bold bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 flex items-center gap-2 group"><span className="opacity-80 group-hover:scale-110 transition-transform">{Icons.Key}</span> 兌換序號</button>
          <button onClick={() => setView(AppView.CONTACT_SUPPORT)} className="w-full text-left px-4 py-3 text-xs rounded-lg transition-all font-bold bg-blue-900/20 text-blue-300 hover:bg-blue-900/40 border border-blue-800/30 flex items-center gap-2 group"><span className="opacity-80 group-hover:scale-110 transition-transform">{Icons.Support}</span> 聯繫客服</button>
          {isAdmin && <button onClick={() => setView(AppView.ADMIN)} className={`w-full text-left px-4 py-3 text-xs rounded-lg transition-all font-bold flex items-center gap-2 group ${view === AppView.ADMIN ? 'bg-red-600 text-white shadow-lg' : 'text-red-400 hover:bg-red-900/20 border border-red-900/30'}`}><span className="opacity-80 group-hover:scale-110 transition-transform">{Icons.Admin}</span> 管理員後台</button>}
          <button onClick={handleLogout} className="w-full text-left px-4 py-3 text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-2 group hover:bg-white/5 rounded-lg"><span className="opacity-80 group-hover:scale-110 transition-transform">{Icons.Logout}</span> 登出系統</button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 lg:p-12 overflow-y-auto h-screen custom-scrollbar relative">
        <div className="max-w-7xl mx-auto h-full">
            {view === AppView.MARKET && (
                <SocialStockMarket 
                    user={userProfile} 
                    onNavigateToCreate={handleStockNavigate} 
                    onQuotaUpdate={refreshProfile} 
                />
            )}
            {view === AppView.CREATE && (
              <PostCreator 
                settings={settings} 
                user={userProfile} 
                onPostCreated={handlePostCreated} 
                onQuotaUpdate={refreshProfile} 
                editPost={editingPost} 
                onCancel={() => setEditingPost(null)}
                scheduledPostsCount={posts.filter(p => p.status === 'scheduled').length}
                initialTopic={prefilledTopic}
              />
            )}
            {view === AppView.SCHEDULE && (
              <ScheduleList 
                  posts={posts} 
                  onUpdatePosts={async (updated) => {
                      const originalIds = posts.map(p => p.id);
                      const updatedIds = updated.map(p => p.id);
                      const deletedId = originalIds.find(id => !updatedIds.includes(id));
                      if (deletedId) await handleDeletePost(deletedId);
                      else {
                          const changed = updated.find((p, i) => JSON.stringify(p) !== JSON.stringify(posts.find(op => op.id === p.id)));
                          if (changed && user) await syncPostToCloud(user.uid, changed);
                          setPosts(updated);
                      }
                  }} 
                  onEditPost={handleEditPost}
                  settings={settings}
              />
            )}
            {view === AppView.SETTINGS && <SettingsForm onSave={handleSaveSettings} initialSettings={settings} />}
            {view === AppView.ANALYTICS && <AnalyticsDashboard settings={settings} />}
            {view === AppView.AUTOMATION && <AutomationPanel settings={settings} onSave={handleSaveSettings} />}
            {view === AppView.SEO_ARTICLES && <SeoArticleGenerator user={userProfile} onQuotaUpdate={refreshProfile} />}
            {view === AppView.THREADS_NURTURE && <ThreadsNurturePanel settings={settings} user={userProfile} onSaveSettings={handleSaveSettings} onQuotaUpdate={refreshProfile} initialTopic={prefilledTopic} />}
            {view === AppView.CONNECT && <ConnectPanel settings={settings} user={userProfile} onQuotaUpdate={refreshProfile} />}
            {view === AppView.PRICING && <PricingPanel user={userProfile} onContactClick={() => setView(AppView.CONTACT_SUPPORT)} />}
            {view === AppView.REFERRAL && <ReferralPanel user={userProfile} onQuotaUpdate={refreshProfile} />}
            {view === AppView.CONTACT_SUPPORT && <ContactSupportPanel />}
            {view === AppView.ADMIN && isAdmin && <AdminPanel currentUser={userProfile!} />}
        </div>
      </main>
      
      {userProfile && <AiAssistantBubble currentView={view} settings={settings} />}
      <QueueOverlay />
      <button onClick={() => setShowReportModal(true)} className="fixed bottom-6 right-6 bg-red-600 hover:bg-red-500 text-white w-12 h-12 rounded-full z-50 shadow-[0_0_20px_rgba(220,38,38,0.5)] transition-transform active:scale-90 flex items-center justify-center font-bold text-xl backdrop-blur-md border border-white/20" title="回報問題">!</button>
      {showReportModal && <ErrorReportModal user={userProfile} currentView={view} onClose={() => setShowReportModal(false)} />}
      {showKeyModal && userProfile && <KeyRedemptionModal user={userProfile} onClose={() => setShowKeyModal(false)} onSuccess={refreshProfile} />}
    </div>
  );
};

export default App;
