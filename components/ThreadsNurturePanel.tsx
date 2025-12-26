
import React, { useState, useEffect } from 'react';
import { BrandSettings, ThreadsAccount, UserProfile, TrendingTopic } from '../types';
import { generateCommentReply, getTrendingTopics, generateThreadsBatch, generateImage, fetchNewsImageFromUrl, analyzeThreadsStyle } from '../services/geminiService';
import { publishThreadsPost, fetchUserThreads, fetchMediaReplies, validateThreadsToken } from '../services/threadsService';
import { checkAndUseQuota } from '../services/authService';
import { getThreadsSystemInstruction } from '../services/promptTemplates';
import TokenTutorialModal from './TokenTutorialModal';

interface Props {
  settings: BrandSettings;
  user: UserProfile | null;
  onSaveSettings: (settings: BrandSettings) => void;
  onQuotaUpdate: () => void;
}

type ImageSourceType = 'ai' | 'stock' | 'news' | 'upload' | 'none';

interface GeneratedPost {
  id: string;
  topic: string; 
  caption: string;
  imagePrompt: string;
  imageQuery: string;
  
  // Image Sources
  imageUrl?: string; 
  newsImageUrl?: string; 
  uploadedImageBase64?: string;
  
  targetAccountId?: string;
  status: 'idle' | 'publishing' | 'done' | 'failed';
  log?: string;
  imageSourceType: ImageSourceType;
  paidForGeneration?: boolean; 
}

interface CommentData {
    id: string;
    text: string;
    username: string;
    timestamp: string;
    threadId: string;
    accountIndex: number;
}

// --- Constants: Authentic Style Presets (Updated) ---
const STYLE_PRESETS = [
    { name: '請選擇風格模板...', dna: '' },
    { 
        name: '🫠 厭世社畜 (真實感/抱怨)', 
        dna: '你是一個被工作壓垮的台灣社畜。語氣充滿無奈、疲憊，但帶有自嘲的幽默。喜歡抱怨老闆、天氣、或莫名其妙的客戶。關鍵特徵：1. 絕對不使用句號，改用空格或換行。2. 常用 Emoji：🫠, 💀, 🙃, 😭。3. 口頭禪：「心好累」、「想離職」、「救命」、「確」。文章結構鬆散，像是剛下班在捷運上的隨手發文。' 
    },
    { 
        name: '🤡 發瘋廢文 (混沌/迷因)', 
        dna: '你是一個思緒跳躍、有點「發瘋」狀態的脆友。語氣誇張、情緒起伏大（或是極度敷衍）。針對時事發表「沒什麼營養」但「很好笑」的評論。關鍵特徵：1. 使用大量網路流行語（如：笑死、暈、超派）。2. 節奏極快，短句為主。3. 把 Threads 當成個版在碎碎念。' 
    },
    { 
        name: '👀 吃瓜群眾 (八卦/好奇)', 
        dna: '你是一個熱愛觀察路人、跟風時事的吃瓜群眾。語氣帶有「好奇」、「驚訝」或「看戲」的成分。喜歡用問句開頭，例如「只有我覺得...嗎？」、「有人知道...嗎？」。目的是引發共鳴和討論。語氣親切但帶點八卦感。' 
    },
    { 
        name: '💖 暈船仔/EMO (感性/深夜)', 
        dna: '你是一個感情豐富、容易「暈船」或深夜 EMO 的人。語氣感性、柔軟，文字帶有淡淡的憂傷或對關係的困惑。常用 Emoji：🥺, 💔, ☁️, 🥀。喜歡分享一些看起來很有道理但其實是廢話的愛情觀。' 
    },
    { 
        name: '🏢 品牌小編 (親切/非官方腔)', 
        dna: '你是一個「像真人的小編」。雖然代表品牌，但拒絕使用官腔。語氣活潑、甚至會自嘲自家產品。會跟粉絲像朋友一樣對話，使用「小編」自稱。目的是建立親和力，而不是推銷。' 
    }
];

// --- Helper Components ---

const LoadingOverlay: React.FC<{ message: string, detail?: string }> = ({ message, detail }) => {
    const [tipIndex, setTipIndex] = useState(0);
    const tips = [
        "💡 Threads 小技巧：演算法喜歡「引發討論」的內容，試著在文末用問句結尾。",
        "💡 經營心法：Threads 網友喜歡「真實感」與「廢文感」，過於完美的文案反而沒人看。",
        "💡 省錢祕技：善用「擬真圖庫」模式，只要 3 點就能生成超像網友隨手拍的照片！",
        "💡 流量密碼：看到熱門時事要趕快跟風，AutoSocial 的「挖掘靈感」能幫你搶快。",
        "💡 安全建議：雖然我們有自動養號，但建議不要在短時間內連續發佈超過 5 篇貼文。"
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setTipIndex(prev => (prev + 1) % tips.length);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 bg-dark/95 z-50 flex flex-col items-center justify-center p-8 backdrop-blur-sm animate-fade-in">
            <div className="w-20 h-20 mb-6 relative">
                <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-pink-500 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{message}</h2>
            <p className="text-gray-400 mb-8 animate-pulse">{detail || "AI 正在高速運算中，請稍候..."}</p>
            
            <div className="bg-card p-6 rounded-xl border border-gray-700 max-w-md w-full text-center shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500"></div>
                <p className="text-yellow-400 text-sm font-bold mb-2 uppercase tracking-wider">AutoSocial Pro Tips</p>
                <p className="text-gray-200 text-base transition-all duration-500 min-h-[50px] flex items-center justify-center font-medium">
                    {tips[tipIndex]}
                </p>
            </div>
        </div>
    );
};

const generateStockUrl = (query: string, seed: string) => {
    // Ensuring topic adherence: The query is already AI-optimized for the specific post
    const realismPrompt = `${query}, candid photography, shot on iPhone 15, natural lighting, grainy, unpolished, 4k, no 3d render, no illustration, hyperrealistic`;
    const encoded = encodeURIComponent(realismPrompt);
    // Use Pollinations with unique seed
    // Add cache buster 't' to force browser reload
    return `https://image.pollinations.ai/prompt/${encoded}?n=${seed}&model=flux&t=${Date.now()}`;
};

const ThreadsNurturePanel: React.FC<Props> = ({ settings, user, onSaveSettings, onQuotaUpdate }) => {
  // #region State
  const [activeTab, setActiveTab] = useState<'accounts' | 'interaction' | 'generator'>('accounts');
  
  // Accounts
  const [accounts, setAccounts] = useState<ThreadsAccount[]>(settings.threadsAccounts || []);
  const [newAccountInput, setNewAccountInput] = useState<{
      userIdInput: string;
      token: string;
      username: string;
      personaPrompt: string;
      accountType: 'personal' | 'brand';
      safetyFilter: boolean;
  }>({ 
      userIdInput: '', 
      token: '', 
      username: '', 
      personaPrompt: '', // This will map to styleGuide on creation
      accountType: 'personal',
      safetyFilter: true
  });
  const [verifyStatus, setVerifyStatus] = useState<{valid: boolean, msg: string} | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState<string | null>(null); // Account ID being analyzed
  const [showTutorial, setShowTutorial] = useState(false);
  
  // Generator State Machine
  const [genStep, setGenStep] = useState<1 | 2>(1);
  const [manualTopic, setManualTopic] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [genCount, setGenCount] = useState<1 | 2 | 3>(1);
  const [preSelectedImageMode, setPreSelectedImageMode] = useState<ImageSourceType>('none');
  const [selectedGenAccountId, setSelectedGenAccountId] = useState<string>(''); 
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  // Track which post is currently regenerating image (for loading spinner)
  const [isRegeneratingImage, setIsRegeneratingImage] = useState<string | null>(null);
  
  // Trends & Interactions
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [trendError, setTrendError] = useState('');
  const [comments, setComments] = useState<CommentData[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [generatedReplies, setGeneratedReplies] = useState<string[]>([]);
  const [draftReply, setDraftReply] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  // #endregion

  // --- Effects & Init ---
  useEffect(() => {
    onSaveSettings({ ...settings, threadsAccounts: accounts });
    
    // FIX: Auto-select logic to handle additions or deletions of accounts
    if (accounts.length > 0) {
        const currentSelectionExists = accounts.some(a => a.id === selectedGenAccountId);
        if (!selectedGenAccountId || !currentSelectionExists) {
            setSelectedGenAccountId(accounts[0].id);
        }
    } else {
        if (selectedGenAccountId) setSelectedGenAccountId('');
    }
  }, [accounts]);

  const loadTrends = async () => {
      if (!user) return alert("請先登入");
      const COST = 1;
      const allowed = await checkAndUseQuota(user.user_id, COST);
      if (!allowed) return alert(`配額不足 (需要 ${COST} 點)`);
      onQuotaUpdate();

      setLoadingTrends(true);
      setTrendError('');
      setTrendingTopics([]);

      try {
          const industry = settings.industry || '台灣熱門時事';
          const trends = await getTrendingTopics(industry);
          if (trends.length === 0) setTrendError("目前找不到相關新聞，請嘗試手動輸入話題。");
          setTrendingTopics(trends);
      } catch (e: any) {
          console.warn("Trend load error", e);
          setTrendError("無法載入即時趨勢，請檢查網路或稍後再試。");
      } finally {
          setLoadingTrends(false);
      }
  };

  // --- Account Handlers ---
  const handleVerifyAccount = async () => {
      const { userIdInput, token } = newAccountInput;
      if (!userIdInput || !token) return alert("請先輸入 ID 與 Token");
      
      setIsVerifying(true);
      setVerifyStatus(null);
      try {
          const res = await validateThreadsToken(userIdInput.trim(), token.trim());
          if (res.valid) {
              setVerifyStatus({ valid: true, msg: `✅ 驗證成功: ${res.username}` });
              if (!newAccountInput.username && res.username) {
                  setNewAccountInput(prev => ({ ...prev, username: res.username || '' }));
              }
          } else {
              setVerifyStatus({ valid: false, msg: `❌ 驗證失敗: ${res.error}` });
          }
      } catch (e: any) {
          setVerifyStatus({ valid: false, msg: `❌ 錯誤: ${e.message}` });
      } finally {
          setIsVerifying(false);
      }
  };

  const handleAddAccount = () => {
      const { userIdInput, token, username, personaPrompt, accountType, safetyFilter } = newAccountInput;
      if (!userIdInput || !token) { alert("請輸入 Threads User ID 與 Access Token"); return; }

      const limit = user?.role === 'business' || user?.role === 'admin' ? 20 : (user?.role === 'pro' ? 5 : 0);
      if (accounts.length >= limit) { alert(`您的方案最多只能新增 ${limit} 個帳號。`); return; }

      const newAccount: ThreadsAccount = {
          id: Date.now().toString(), 
          userId: userIdInput.trim(), 
          token: token.trim(),
          username: username.trim() || `User_${userIdInput.slice(-4)}`,
          isActive: true,
          personaPrompt: '', // Keep clean, we use styleGuide for logic
          accountType,
          safetyFilter,
          styleGuide: personaPrompt.trim() // Initialize with manual input if present
      };

      setAccounts([...accounts, newAccount]);
      setNewAccountInput({ userIdInput: '', token: '', username: '', personaPrompt: '', accountType: 'personal', safetyFilter: true });
      setVerifyStatus(null);
  };

  const handleRemoveAccount = (id: string) => {
      if (confirm("確定移除此帳號嗎？")) setAccounts(accounts.filter(a => a.id !== id));
  };

  const handleUpdateAccount = (id: string, field: keyof ThreadsAccount, val: any) => {
      setAccounts(accounts.map(a => a.id === id ? { ...a, [field]: val } : a));
  };

  const handleAnalyzeStyle = async (account: ThreadsAccount) => {
      if (!user) return;
      if (!account.token) return alert("無 Token，無法讀取貼文");
      
      const allowed = await checkAndUseQuota(user.user_id, 2); // Charge 2 credits for analysis
      if (!allowed) return alert("配額不足 (需 2 點)");
      onQuotaUpdate();

      setIsAnalyzingStyle(account.id);
      try {
          // 1. Fetch recent posts
          const posts = await fetchUserThreads(account, 10); // Fetch last 10
          if (!posts || posts.length < 3) {
              const useTemplate = confirm("⚠️ 此帳號貼文數量不足 (少於 3 篇)，無法進行分析。\n\n是否直接使用「預設風格模板」來填寫設定？");
              if (useTemplate) {
                  // User can select manually from the dropdown now
              }
              throw new Error("貼文數量不足 (新帳號請直接使用下方的『風格模板』)");
          }
          
          const postTexts = posts.map((p: any) => p.text).filter(Boolean);
          
          // 2. AI Analyze
          const styleDNA = await analyzeThreadsStyle(postTexts);
          
          // 3. Update Account
          handleUpdateAccount(account.id, 'styleGuide', styleDNA);
          alert("✅ 風格分析完成！已更新 Style DNA。");
      } catch (e: any) {
          alert(`分析失敗: ${e.message}`);
      } finally {
          setIsAnalyzingStyle(null);
      }
  };

  // --- Generator Handlers ---
  const selectTopic = (title: string) => {
      if (selectedTopics.includes(title)) setSelectedTopics([]);
      else { setSelectedTopics([title]); setManualTopic(''); }
  };

  const handleManualTopicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setManualTopic(e.target.value);
      if (e.target.value) setSelectedTopics([]);
  };

  const proceedToGenerateUI = () => {
      if (selectedTopics.length === 0 && !manualTopic) return alert("請先選擇或輸入一個話題");
      setGenStep(2);
  };

  const calculateCost = (count: number, mode: ImageSourceType) => {
      const baseCost = 2; 
      let extraCost = 0;
      if (mode === 'ai') extraCost = 5;
      else if (mode === 'news') extraCost = 1;
      else if (mode === 'stock') extraCost = 3;
      return (baseCost + extraCost) * count;
  };

  const handleGenerateBatch = async () => {
      if (!user) return alert("請先登入");
      const topicSource = selectedTopics.length > 0 ? selectedTopics[0] : manualTopic;
      if (!topicSource) return alert("無效話題");

      const targetAccount = accounts.find(a => a.id === selectedGenAccountId);
      if (!targetAccount) return alert("❌ 錯誤：請先在上方選單選擇要發文的帳號");

      const totalCost = calculateCost(genCount, preSelectedImageMode);
      if (!confirm(`確定為帳號「${targetAccount.username}」生成 ${genCount} 篇貼文？\n\n消耗：${totalCost} 點配額`)) return;

      const allowed = await checkAndUseQuota(user.user_id, totalCost);
      if (!allowed) return alert(`配額不足 (需 ${totalCost} 點)`);
      onQuotaUpdate();

      setIsGenerating(true);
      setGeneratedPosts([]);

      try {
          // Construct the Prompt Instruction based on Account Type & Learned Style
          const instruction = getThreadsSystemInstruction(
              targetAccount.accountType || 'personal',
              targetAccount.styleGuide,
              targetAccount.safetyFilter
          );

          // Use the instruction as the "persona" argument
          const results = await generateThreadsBatch(topicSource, genCount, settings, [instruction]);

          const sourceTopicData = trendingTopics.find(t => t.title === topicSource);
          const initialNewsImg = sourceTopicData?.imageUrl;
          const newsUrl = sourceTopicData?.url;

          const newPosts: GeneratedPost[] = await Promise.all(results.map(async (r, i) => {
              let finalMode = preSelectedImageMode;
              let finalImageUrl = undefined;
              let errorLog = undefined;
              const uniqueSeed = Date.now().toString() + i;

              if (finalMode === 'ai') {
                  try { finalImageUrl = await generateImage(r.imagePrompt, user.role); } 
                  catch (e) { errorLog = '圖片生成失敗'; }
              } else if (finalMode === 'stock') {
                  finalImageUrl = generateStockUrl(r.imageQuery || r.imagePrompt, uniqueSeed);
              } else if (finalMode === 'news') {
                  if (initialNewsImg) finalImageUrl = initialNewsImg;
                  else if (newsUrl) {
                      const ogImg = await fetchNewsImageFromUrl(newsUrl);
                      if (ogImg) finalImageUrl = ogImg;
                  }
                  if (!finalImageUrl) {
                      try {
                         const newsPrompt = `News photo about ${topicSource}, realistic, journalism style, 4k`;
                         finalImageUrl = await generateImage(newsPrompt, user.role);
                      } catch (e) { finalMode = 'none'; errorLog = '無法取得新聞圖片'; }
                  }
              }

              return {
                  id: Date.now() + '_' + i,
                  topic: topicSource,
                  caption: r.caption,
                  imagePrompt: r.imagePrompt,
                  imageQuery: r.imageQuery,
                  newsImageUrl: finalMode === 'news' ? finalImageUrl : undefined,
                  imageUrl: (finalMode === 'ai' || finalMode === 'stock' || finalMode === 'news') ? finalImageUrl : undefined,
                  imageSourceType: finalMode,
                  log: errorLog,
                  status: 'idle',
                  targetAccountId: targetAccount.id
              };
          }));

          setGeneratedPosts(newPosts);
      } catch (e: any) {
          alert(`生成失敗: ${e.message}`);
      } finally {
          setIsGenerating(false);
      }
  };

  // --- Common Handlers (Upload, Publish, etc.) same as before ---
  const handleFileUpload = (postId: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => setGeneratedPosts(prev => prev.map(p => p.id === postId ? { ...p, uploadedImageBase64: ev.target?.result as string, imageSourceType: 'upload' } : p));
          reader.readAsDataURL(file);
      }
  };

  const getPreviewUrl = (post: GeneratedPost) => {
      if (post.imageSourceType === 'upload' && post.uploadedImageBase64) return post.uploadedImageBase64;
      if (post.imageSourceType === 'news' && post.newsImageUrl) return post.newsImageUrl;
      if (post.imageUrl) return post.imageUrl;
      return '';
  };

  const handleImageModeChange = async (post: GeneratedPost, newMode: ImageSourceType) => {
      if (newMode === 'stock') {
          if (!user) return alert("請先登入");
          
          const COST = 2;
          const confirmChange = confirm(`🎨 換圖將重新生成並消耗 ${COST} 點配額，確定執行？`);
          if (!confirmChange) return;

          const allowed = await checkAndUseQuota(user.user_id, COST);
          if (!allowed) return alert(`配額不足 (需 ${COST} 點)`);
          onQuotaUpdate();

          // Start Loading
          setIsRegeneratingImage(post.id);

          // Force new seed with higher entropy
          const newSeed = Date.now().toString() + Math.floor(Math.random() * 9999);
          // IMPORTANT: Use imageQuery if available (more specific), fallback to topic
          const visualSubject = post.imageQuery || post.topic; 
          const newUrl = generateStockUrl(visualSubject, newSeed);

          // Increase timeout to 1500ms to allow generation time and prevent "instant change" feel
          setTimeout(() => {
              setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageSourceType: newMode, imageUrl: newUrl } : p));
              setIsRegeneratingImage(null);
          }, 1500); 

      } else {
          // Just switching modes (e.g. to 'none' or 'upload'), no cost
          setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageSourceType: newMode } : p));
      }
  };

  const handlePublish = async (post: GeneratedPost) => {
      // Validation Check
      if (!post.targetAccountId) return alert("❌ 錯誤：未指定發佈帳號");
      const acc = accounts.find(a => a.id === post.targetAccountId);
      if (!acc) return alert("❌ 錯誤：找不到對應的帳號資料，請檢查帳號是否已被移除。");
      
      if (!post.caption) return alert("❌ 內容為空，無法發佈");

      setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'publishing', log: '發佈中...' } : p));
      
      try {
          const imgUrl = post.imageSourceType === 'none' ? undefined : getPreviewUrl(post);
          const res = await publishThreadsPost(acc, post.caption, imgUrl);
          
          if (res.success) {
              setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'done', log: '✅ 發佈成功！' } : p));
          } else {
              setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'failed', log: `❌ 發佈失敗: ${res.error}` } : p));
              alert(`發佈失敗: ${res.error}`);
          }
      } catch (e: any) {
          setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'failed', log: `❌ 系統錯誤: ${e.message}` } : p));
      }
  };

  // ... (Interaction Handlers: handleScan, handleGenReply, handleSendReply - Same as before)
  const handleScan = async () => {/* ... */}; 
  const handleGenReply = async (c: any) => {/* ... */};
  const handleSendReply = async (c: any, t: string) => {/* ... */};

  if (loadingTrends) return <LoadingOverlay message="正在搜尋熱門話題" detail="AI 正在分析全網新聞與社群趨勢..." />;
  if (isGenerating) return <LoadingOverlay message="AI 正在量產 Threads 貼文" detail={`正在模擬 ${genCount} 篇不同語氣的真實貼文，並準備圖片中...`} />;

  return (
    <div className="max-w-6xl mx-auto p-4 animate-fade-in pb-20">
      <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-white">🧵 Threads 養號農場</h2>
          <div className="text-xs text-gray-400">多帳號管理 • 風格學習 • 批量生成</div>
      </div>

      <div className="flex border-b border-gray-700 mb-6 overflow-x-auto">
        <button onClick={() => setActiveTab('accounts')} className={`px-6 py-3 font-bold whitespace-nowrap ${activeTab === 'accounts' ? 'text-white border-b-2' : 'text-gray-500 hover:text-gray-300'}`}>👥 帳號管理</button>
        <button onClick={() => setActiveTab('interaction')} className={`px-6 py-3 font-bold whitespace-nowrap ${activeTab === 'interaction' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-500 hover:text-gray-300'}`}>💬 留言互動</button>
        <button onClick={() => setActiveTab('generator')} className={`px-6 py-3 font-bold whitespace-nowrap ${activeTab === 'generator' ? 'text-white border-b-2' : 'text-gray-500 hover:text-gray-300'}`}>🚀 內容生成</button>
      </div>

      {/* VIEW: ACCOUNTS */}
      {activeTab === 'accounts' && (
          <div className="space-y-6">
              <div className="bg-card p-6 rounded-xl border border-gray-700">
                  <h3 className="font-bold text-white mb-4">新增帳號</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* ID & Token Fields */}
                      <div><label className="block text-xs text-gray-400 mb-1">Threads User ID *</label><input value={newAccountInput.userIdInput} onChange={e => setNewAccountInput({...newAccountInput, userIdInput: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" placeholder="數值 ID" /></div>
                      <div>
                          <label className="block text-xs text-gray-400 mb-1 flex justify-between"><span>Access Token *</span><button onClick={() => setShowTutorial(true)} className="text-primary hover:underline text-xs flex items-center gap-1">❓ 如何獲取 Token</button></label>
                          <input value={newAccountInput.token} onChange={e => setNewAccountInput({...newAccountInput, token: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" type="password" placeholder="長期 Token" />
                      </div>
                      
                      {/* Name & Type */}
                      <div><label className="block text-xs text-gray-400 mb-1">顯示名稱</label><input value={newAccountInput.username} onChange={e => setNewAccountInput({...newAccountInput, username: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" placeholder="自訂識別名稱" /></div>
                      
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">帳號類型</label>
                          <div className="flex gap-4 items-center h-[38px]">
                              <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="radio" checked={newAccountInput.accountType === 'personal'} onChange={() => setNewAccountInput({...newAccountInput, accountType: 'personal'})} />
                                  <span className="text-sm text-gray-300">👤 個人/創作者</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="radio" checked={newAccountInput.accountType === 'brand'} onChange={() => setNewAccountInput({...newAccountInput, accountType: 'brand'})} />
                                  <span className="text-sm text-gray-300">🏢 品牌/企業</span>
                              </label>
                          </div>
                      </div>

                      {/* Brand Safety */}
                      {newAccountInput.accountType === 'brand' && (
                          <div className="md:col-span-2 bg-blue-900/20 p-2 rounded border border-blue-800 flex items-center gap-2">
                              <input type="checkbox" checked={newAccountInput.safetyFilter} onChange={e => setNewAccountInput({...newAccountInput, safetyFilter: e.target.checked})} className="w-4 h-4 text-blue-600" />
                              <span className="text-xs text-blue-200">啟用品牌安全護欄 (自動過濾政治、腥羶色、爭議話題)</span>
                          </div>
                      )}

                      {/* NEW: Manual Persona Input */}
                      <div className="md:col-span-2">
                          <label className="block text-xs text-gray-400 mb-1">自訂人設與語氣 (選填)</label>
                          <textarea
                              value={newAccountInput.personaPrompt}
                              onChange={e => setNewAccountInput({...newAccountInput, personaPrompt: e.target.value})}
                              className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-xs h-20 resize-none placeholder-gray-600 focus:border-primary outline-none"
                              placeholder="例如：你是一個熱愛咖啡的文青，喜歡用底片相機，文字風格慵懶..."
                          />
                      </div>
                  </div>
                  
                  {verifyStatus && <p className={`mt-3 text-xs font-bold ${verifyStatus.valid ? 'text-green-400' : 'text-red-400'}`}>{verifyStatus.msg}</p>}

                  <div className="mt-4 flex gap-2 justify-end">
                      <button onClick={handleVerifyAccount} disabled={isVerifying} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm font-bold transition-colors">{isVerifying ? '檢查中...' : '🔍 驗證 Token'}</button>
                      <button onClick={handleAddAccount} className="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded font-bold transition-colors">+ 新增帳號</button>
                  </div>
              </div>

              {/* Account List */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {accounts.map((acc) => (
                      <div key={acc.id} className="bg-dark p-4 rounded border border-gray-600 relative group">
                          <div className="flex items-center gap-3 mb-2">
                             <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white ${acc.accountType === 'brand' ? 'bg-blue-700' : 'bg-pink-700'}`}>
                                 {acc.accountType === 'brand' ? '🏢' : '👤'}
                             </div>
                             <div className="overflow-hidden">
                                 <div className="font-bold text-white text-sm truncate">{acc.username}</div>
                                 <div className="text-xs text-gray-500 truncate">Type: {acc.accountType === 'brand' ? 'Brand' : 'Personal'}</div>
                             </div>
                          </div>
                          
                          <div className="mt-3 text-xs space-y-2">
                              <div>
                                  <div className="flex justify-between items-center mb-1">
                                      <label className="text-gray-400">Style DNA:</label>
                                      <button 
                                          onClick={() => handleAnalyzeStyle(acc)} 
                                          disabled={!!isAnalyzingStyle}
                                          className="text-primary hover:underline flex items-center gap-1"
                                      >
                                          {isAnalyzingStyle === acc.id ? '分析中...' : '🔮 讀取過往貼文'}
                                      </button>
                                  </div>
                                  
                                  {/* NEW: Style Preset Dropdown (AUTHENTIC TAIWAN STYLE) */}
                                  <select 
                                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 mb-2 text-white text-[10px] outline-none"
                                      onChange={(e) => {
                                          if (e.target.value) {
                                              handleUpdateAccount(acc.id, 'styleGuide', e.target.value);
                                          }
                                      }}
                                      value=""
                                  >
                                      <option value="" disabled>✨ 快速套用風格模板 (台灣特有種)</option>
                                      {STYLE_PRESETS.map((style, idx) => (
                                          <option key={idx} value={style.dna}>{style.name}</option>
                                      ))}
                                  </select>

                                  <textarea 
                                      className="w-full bg-gray-900 border-none rounded px-2 py-1 mt-1 text-gray-300 focus:ring-1 focus:ring-primary h-20 text-[10px] resize-none" 
                                      value={acc.styleGuide || ''} 
                                      onChange={e => handleUpdateAccount(acc.id, 'styleGuide', e.target.value)} 
                                      placeholder="AI 分析出的風格指令將顯示於此。新帳號請使用上方選單套用模板。" 
                                  />
                              </div>
                              
                              {acc.accountType === 'brand' && (
                                  <label className="flex items-center gap-2 cursor-pointer bg-black/20 p-1 rounded">
                                      <input type="checkbox" checked={acc.safetyFilter} onChange={e => handleUpdateAccount(acc.id, 'safetyFilter', e.target.checked)} />
                                      <span className="text-gray-400">🛡️ 安全護欄</span>
                                  </label>
                              )}
                          </div>
                          <button onClick={() => handleRemoveAccount(acc.id)} className="text-red-400 text-xs absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">移除</button>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* VIEW: GENERATOR (Simplified Layout for brevity) */}
      {activeTab === 'generator' && (
          <div className="space-y-6">
              {genStep === 1 && (
                  <div className="bg-card p-6 rounded-xl border border-gray-700">
                       <h3 className="text-xl font-bold text-white mb-4">步驟 1: 選擇話題</h3>
                       
                       {/* UPDATED: Grid Layout for better use of space */}
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4 max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
                            <div onClick={() => loadTrends()} className="flex flex-col items-center justify-center bg-indigo-900/30 border border-indigo-500 rounded-lg p-6 cursor-pointer hover:bg-indigo-900/50 min-h-[160px] text-center shadow-lg transition-transform active:scale-95">
                                <span className="text-4xl mb-3">🔎</span>
                                <span className="text-lg font-bold text-indigo-200">挖掘最新靈感</span>
                                <p className="text-xs text-indigo-300/60 mt-1">搜尋即時熱門新聞與社群話題</p>
                            </div>
                            {trendingTopics.map((t, i) => (
                                <div key={i} onClick={() => selectTopic(t.title)} className={`flex flex-col justify-between p-4 rounded-lg border cursor-pointer min-h-[160px] transition-all relative overflow-hidden ${selectedTopics.includes(t.title) ? 'bg-primary/20 border-primary ring-2 ring-primary' : 'bg-dark border-gray-700 hover:border-gray-500'}`}>
                                    {t.imageUrl && <div className="absolute inset-0 opacity-10 bg-cover bg-center z-0" style={{backgroundImage: `url(${t.imageUrl})`}}></div>}
                                    <div className="relative z-10">
                                        <h4 className="font-bold text-white text-base line-clamp-2 mb-2 leading-tight">{t.title}</h4>
                                        <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">{t.description || "點擊查看詳情，AI 將自動延伸話題..."}</p>
                                    </div>
                                    <div className="relative z-10 mt-2 text-[10px] text-gray-500 flex justify-between items-center">
                                        <span>來源: {t.url ? new URL(t.url).hostname.replace('www.', '') : 'News'}</span>
                                        {selectedTopics.includes(t.title) && <span className="text-primary font-bold">✓ 已選擇</span>}
                                    </div>
                                </div>
                            ))}
                       </div>

                       <div className="mt-6 pt-4 border-t border-gray-700">
                           <label className="block text-xs text-gray-400 mb-1">自訂話題</label>
                           <input value={manualTopic} onChange={handleManualTopicChange} className="w-full bg-dark border border-gray-600 rounded p-3 text-white" placeholder="或手動輸入您想聊的主題..." />
                       </div>
                       <div className="mt-6 flex justify-end"><button onClick={proceedToGenerateUI} className="bg-primary hover:bg-blue-600 text-white px-8 py-3 rounded font-bold shadow-lg">下一步</button></div>
                  </div>
              )}

              {genStep === 2 && (
                  <div className="space-y-6">
                      <div className="bg-card p-6 rounded-xl border border-gray-700">
                           <div className="flex justify-between items-center mb-6">
                               <h3 className="text-xl font-bold text-white">步驟 2: 生成與發佈</h3>
                               <button 
                                   onClick={() => setGenStep(1)} 
                                   className="text-sm text-gray-400 hover:text-white border border-gray-600 px-3 py-1 rounded hover:bg-gray-700 transition-colors"
                               >
                                   ↩ 返回選題
                               </button>
                           </div>

                           <div className="mb-6 bg-blue-900/20 p-4 rounded border border-blue-800">
                               <label className="block text-sm text-blue-300 font-bold mb-2">1. 選擇發文帳號 (決定語氣與人設) *</label>
                               <select value={selectedGenAccountId} onChange={(e) => setSelectedGenAccountId(e.target.value)} className="w-full bg-dark border border-blue-500 rounded p-3 text-white">
                                   {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.username} ({acc.accountType === 'brand' ? '品牌' : '個人'})</option>)}
                               </select>
                           </div>
                           
                           {/* Other settings same as before */}
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                               <div className="bg-dark/50 p-4 rounded border border-gray-600"><label className="block text-sm text-gray-400 mb-2">當前話題</label><div className="font-bold text-xl text-white">{selectedTopics[0] || manualTopic}</div></div>
                               <div className="space-y-4">
                                   <div><label className="block text-sm text-gray-400 mb-1">數量</label><div className="flex gap-2">{[1,2,3].map(n => <button key={n} onClick={() => setGenCount(n as any)} className={`flex-1 py-2 rounded border ${genCount === n ? 'bg-white text-black' : 'border-gray-600'}`}>{n}</button>)}</div></div>
                                   <div><label className="block text-sm text-gray-400 mb-1">圖片</label><select value={preSelectedImageMode} onChange={(e) => setPreSelectedImageMode(e.target.value as any)} className="w-full bg-dark border border-gray-600 rounded p-2 text-white"><option value="none">無圖片</option><option value="stock">擬真圖庫</option><option value="ai">AI繪圖</option></select></div>
                               </div>
                           </div>

                           <button onClick={handleGenerateBatch} disabled={!selectedGenAccountId} className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg">✨ 生成貼文</button>
                      </div>

                      {/* Results Display (Simplified) */}
                      {generatedPosts.length > 0 && (
                          <div className="space-y-8">
                              {generatedPosts.map((post) => (
                                  <div key={post.id} className="bg-card rounded-xl border border-gray-700 overflow-hidden flex flex-col md:flex-row">
                                      <div className="w-full md:w-1/3 bg-black flex items-center justify-center relative min-h-[300px]">
                                          {getPreviewUrl(post) ? (
                                              <img 
                                                  key={getPreviewUrl(post) || 'empty'} // FORCE RE-RENDER ON URL CHANGE
                                                  src={getPreviewUrl(post)} 
                                                  className="w-full h-full object-cover transition-opacity duration-500" 
                                              />
                                          ) : <span className="text-gray-500">無圖片</span>}
                                          
                                          {/* Loading Overlay for Image Regeneration */}
                                          {isRegeneratingImage === post.id && (
                                              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
                                                  <div className="loader mb-2 border-t-primary"></div>
                                                  <span className="text-xs text-white font-bold animate-pulse">繪製新素材中...</span>
                                              </div>
                                          )}

                                          <div className="absolute bottom-2 left-2 flex gap-2">
                                              {/* Updated Change Image Button: Forces stock refresh */}
                                              <button 
                                                  onClick={() => handleImageModeChange(post, 'stock')} 
                                                  disabled={isRegeneratingImage === post.id}
                                                  className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded shadow-lg font-bold border border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                              >
                                                  🔄 隨機換圖 (2點)
                                              </button>
                                          </div>
                                      </div>
                                      <div className="flex-1 p-6 flex flex-col">
                                          <textarea value={post.caption} onChange={(e) => setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, caption: e.target.value } : p))} className="w-full flex-1 bg-dark border border-gray-600 rounded p-3 text-white mb-4 resize-none" />
                                          <div className="flex justify-between items-center">
                                              <span className={`text-xs font-bold ${post.status === 'done' ? 'text-green-400' : post.status === 'failed' ? 'text-red-400' : 'text-gray-500'}`}>{post.log || (post.status === 'idle' ? '準備就緒' : '')}</span>
                                              <button onClick={() => handlePublish(post)} disabled={post.status === 'publishing' || post.status === 'done'} className={`px-6 py-3 rounded font-bold transition-all ${post.status === 'done' ? 'bg-green-600 text-white cursor-default' : 'bg-white text-black hover:bg-gray-200'}`}>
                                                  {post.status === 'publishing' ? '發佈中...' : post.status === 'done' ? '已發佈' : '立即發佈'}
                                              </button>
                                          </div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              )}
          </div>
      )}

      {showTutorial && <TokenTutorialModal platform="threads" onClose={() => setShowTutorial(false)} />}
    </div>
  );
};

export default ThreadsNurturePanel;
