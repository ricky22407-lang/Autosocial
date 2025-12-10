
import React, { useState, useEffect } from 'react';
import { BrandSettings, ThreadsAccount, UserProfile, TrendingTopic } from '../types';
import { generateCommentReply, getTrendingTopics, generateThreadsBatch, generateImage, fetchNewsImageFromUrl } from '../services/geminiService';
import { publishThreadsPost, fetchUserThreads, fetchMediaReplies } from '../services/threadsService';
import { checkAndUseQuota } from '../services/authService';

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
  imageUrl?: string; // AI generated URL or Final URL
  newsImageUrl?: string; // From RSS or OG Fetch
  uploadedImageBase64?: string; // From manual upload (Preview only without hosting)
  
  targetAccountId?: string;
  status: 'idle' | 'publishing' | 'done' | 'failed';
  log?: string;
  imageSourceType: ImageSourceType;
  // Track if this post has successfully used paid generation to allow free retries
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

// --- Helper Components ---

// New: Loading Overlay with Tips
const LoadingOverlay: React.FC<{ message: string, detail?: string }> = ({ message, detail }) => {
    const [tipIndex, setTipIndex] = useState(0);
    const tips = [
        "💡 Threads 小技巧：演算法喜歡「引發討論」的內容，試著在文末用問句結尾。",
        "💡 經營心法：Threads 網友喜歡「真實感」與「廢文感」，過於完美的文案反而沒人看。",
        "💡 省錢祕技：善用「擬真圖庫」模式，只要 2 點就能生成超像網友隨手拍的照片！",
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

// Helper: Frontend-only Stock Photo Generator (Flux with Realism Prompt)
const generateStockUrl = (query: string, seed: string) => {
    // Force "Candid/Realism" style to differentiate from "AI Art"
    const realismPrompt = `${query}, candid photography, shot on iPhone 15, natural lighting, grainy, unpolished, 4k, no 3d render, no illustration, hyperrealistic`;
    const encoded = encodeURIComponent(realismPrompt);
    return `https://image.pollinations.ai/prompt/${encoded}?n=${seed}&model=flux`;
};

const ThreadsNurturePanel: React.FC<Props> = ({ settings, user, onSaveSettings, onQuotaUpdate }) => {
  // #region State
  const [activeTab, setActiveTab] = useState<'accounts' | 'interaction' | 'generator'>('accounts');
  
  // Accounts
  const [accounts, setAccounts] = useState<ThreadsAccount[]>(settings.threadsAccounts || []);
  const [newAccountInput, setNewAccountInput] = useState({ 
      userIdInput: '', 
      token: '', 
      username: '', 
      personaPrompt: '' 
  });
  
  // Generator State Machine: 1 (Discover) -> 2 (Generate)
  const [genStep, setGenStep] = useState<1 | 2>(1);
  const [manualTopic, setManualTopic] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  
  const [genCount, setGenCount] = useState<1 | 2 | 3>(1);
  const [preSelectedImageMode, setPreSelectedImageMode] = useState<ImageSourceType>('none');
  const [selectedGenAccountId, setSelectedGenAccountId] = useState<string>(''); // Selected Account ID
  
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState<string | null>(null);
  
  // Trends
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [trendError, setTrendError] = useState('');

  // Interaction
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
    // Default select first account if available and not set
    if (accounts.length > 0 && !selectedGenAccountId) {
        setSelectedGenAccountId(accounts[0].id);
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
          if (trends.length === 0) {
             setTrendError("目前找不到相關新聞，請嘗試手動輸入話題。");
          }
          setTrendingTopics(trends);
      } catch (e: any) {
          console.warn("Trend load error", e);
          setTrendError("無法載入即時趨勢，請檢查網路或稍後再試。");
      } finally {
          setLoadingTrends(false);
      }
  };

  // --- Account Handlers ---
  const handleAddAccount = () => {
      const { userIdInput, token, username, personaPrompt } = newAccountInput;
      
      if (!userIdInput || !token) {
          alert("請輸入 Threads User ID 與 Access Token");
          return;
      }

      const limit = user?.role === 'business' || user?.role === 'admin' ? 20 : (user?.role === 'pro' ? 5 : 0);
      if (accounts.length >= limit) {
          alert(`您的方案最多只能新增 ${limit} 個帳號。`);
          return;
      }

      const newAccount: ThreadsAccount = {
          id: Date.now().toString(), 
          userId: userIdInput.trim(), 
          token: token.trim(),
          username: username.trim() || `User_${userIdInput.slice(-4)}`,
          isActive: true,
          personaPrompt: personaPrompt.trim()
      };

      setAccounts([...accounts, newAccount]);
      setNewAccountInput({ userIdInput: '', token: '', username: '', personaPrompt: '' });
  };

  const handleRemoveAccount = (id: string) => {
      if (confirm("確定移除此帳號嗎？")) {
          setAccounts(accounts.filter(a => a.id !== id));
      }
  };

  const handleUpdatePersona = (id: string, val: string) => {
      setAccounts(accounts.map(a => a.id === id ? { ...a, personaPrompt: val } : a));
  };

  // --- Generator Handlers ---
  const selectTopic = (title: string) => {
      // Toggle logic
      if (selectedTopics.includes(title)) {
          setSelectedTopics([]); // Deselect
      } else {
          setSelectedTopics([title]);
          setManualTopic(''); // Clear manual if trend selected
      }
  };

  const handleManualTopicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setManualTopic(e.target.value);
      if (e.target.value) {
          setSelectedTopics([]); // Clear selection if typing manually
      }
  };

  const proceedToGenerateUI = () => {
      if (selectedTopics.length === 0 && !manualTopic) return alert("請先選擇或輸入一個話題");
      setGenStep(2);
  };

  const calculateCost = (count: number, mode: ImageSourceType) => {
      const baseCost = 1; 
      let extraCost = 0;
      
      if (mode === 'ai') extraCost = 3;      
      else if (mode === 'news') extraCost = 1;
      else if (mode === 'stock') extraCost = 1; 
      
      return (baseCost + extraCost) * count;
  };

  const handleGenerateBatch = async () => {
      if (!user) return alert("請先登入");
      const topicSource = selectedTopics.length > 0 ? selectedTopics[0] : manualTopic;
      if (!topicSource) return alert("無效話題");

      // Validate Account Selection
      const targetAccount = accounts.find(a => a.id === selectedGenAccountId);
      if (!targetAccount) return alert("請先選擇要發文的帳號");

      const sourceTopicData = trendingTopics.find(t => t.title === topicSource);
      const initialNewsImg = sourceTopicData?.imageUrl;
      const newsUrl = sourceTopicData?.url; // For OG fetch

      const totalCost = calculateCost(genCount, preSelectedImageMode);
      
      if (!confirm(`確定為帳號「${targetAccount.username}」生成 ${genCount} 篇貼文？\n\n模式：${preSelectedImageMode === 'ai' ? 'AI繪圖' : preSelectedImageMode === 'stock' ? '擬真圖庫' : preSelectedImageMode === 'news' ? '新聞圖片' : '純文字'}\n總計消耗：${totalCost} 點配額`)) return;

      const allowed = await checkAndUseQuota(user.user_id, totalCost);
      if (!allowed) return alert(`配額不足 (需 ${totalCost} 點)`);
      onQuotaUpdate();

      setIsGenerating(true);
      setGeneratedPosts([]);

      try {
          // Use specific persona for this batch
          const personaList = [targetAccount.personaPrompt || settings.persona || "Authentic Taiwanese user"];
          const results = await generateThreadsBatch(topicSource, genCount, settings, personaList);

          // Prepare final posts
          const newPosts: GeneratedPost[] = await Promise.all(results.map(async (r, i) => {
              let finalMode = preSelectedImageMode;
              let finalImageUrl = undefined;
              let errorLog = undefined;
              let paid = false;
              const uniqueSeed = Date.now().toString() + i;

              // --- AI Mode ---
              if (finalMode === 'ai') {
                  paid = true;
                  try {
                      finalImageUrl = await generateImage(r.imagePrompt);
                  } catch (e) {
                      console.warn("AI Image gen failed in batch", e);
                      errorLog = '圖片生成失敗 (請點擊重試)';
                  }
              }
              // --- Stock Mode ---
              else if (finalMode === 'stock') {
                  finalImageUrl = generateStockUrl(r.imageQuery || r.imagePrompt, uniqueSeed);
              }
              // --- News Mode ---
              else if (finalMode === 'news') {
                  if (initialNewsImg) {
                      finalImageUrl = initialNewsImg;
                  } else if (newsUrl) {
                      const ogImg = await fetchNewsImageFromUrl(newsUrl);
                      if (ogImg) finalImageUrl = ogImg;
                  }
                  
                  if (!finalImageUrl) {
                      try {
                         const newsPrompt = `News photo about ${topicSource}, realistic, journalism style, 4k`;
                         finalImageUrl = await generateImage(newsPrompt);
                      } catch (e) {
                         finalMode = 'none';
                         errorLog = '無法取得新聞圖片';
                      }
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
                  paidForGeneration: paid,
                  
                  status: 'idle',
                  targetAccountId: targetAccount.id // Lock to selected account
              };
          }));

          setGeneratedPosts(newPosts);
      } catch (e: any) {
          alert(`生成失敗: ${e.message}`);
      } finally {
          setIsGenerating(false);
      }
  };

  // --- Image Helpers ---
  const handleFileUpload = (postId: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          if (file.size > 2 * 1024 * 1024) {
              alert("圖片過大 (限制 2MB)");
              return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
               const base64 = ev.target?.result as string;
               setGeneratedPosts(prev => prev.map(p => p.id === postId ? { 
                   ...p, 
                   uploadedImageBase64: base64,
                   imageSourceType: 'upload' 
               } : p));
          };
          reader.readAsDataURL(file);
      }
  };

  const getPreviewUrl = (post: GeneratedPost) => {
      if (post.imageSourceType === 'upload' && post.uploadedImageBase64) return post.uploadedImageBase64;
      if (post.imageSourceType === 'news' && post.newsImageUrl) return post.newsImageUrl;
      if (post.imageUrl) return post.imageUrl;
      return '';
  };

  // Step 3: Change Image Mode Logic (Prevent Double Charge)
  const handleImageModeChange = async (post: GeneratedPost, newMode: ImageSourceType) => {
      if (!user) return;
      
      const getExtraCost = (m: ImageSourceType) => {
          if (m === 'ai') return 3;
          if (m === 'news') return 1;
          if (m === 'stock') return 1; 
          return 0;
      };

      const currentExtra = getExtraCost(post.imageSourceType);
      const newExtra = getExtraCost(newMode);
      let costDiff = Math.max(0, newExtra - currentExtra);

      if (newMode === 'ai') {
          if (post.imageSourceType === 'ai' && !post.imageUrl) {
              costDiff = 0; 
          } else if (post.imageSourceType === 'ai' && post.imageUrl) {
              if (!confirm("重新生成圖片將再次扣除 3 點。確定嗎？")) return;
              costDiff = 3;
          }
      }

      if (costDiff > 0) {
          if (!confirm(`升級至「${newMode === 'ai' ? 'AI 繪圖' : newMode === 'stock' ? '擬真圖庫' : '新聞圖片'}」模式需要補差額 ${costDiff} 點。確定嗎？`)) {
              return;
          }
      }

      if (costDiff > 0) {
          const allowed = await checkAndUseQuota(user.user_id, costDiff);
          if (!allowed) {
              alert("配額不足，無法執行");
              return;
          }
          onQuotaUpdate();
      }

      setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { 
          ...p, 
          imageSourceType: newMode, 
          log: undefined,
          paidForGeneration: newMode === 'ai' ? true : p.paidForGeneration
      } : p));

      if (newMode === 'ai') {
          setIsRegeneratingImage(post.id);
          try {
              const url = await generateImage(post.imagePrompt);
              setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageUrl: url } : p));
          } catch (e: any) {
              setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageUrl: undefined, log: '生成失敗 (點擊重試)' } : p));
          } finally {
              setIsRegeneratingImage(null);
          }
      } 
      else if (newMode === 'stock') {
           const url = generateStockUrl(post.imageQuery || post.imagePrompt, Date.now().toString());
           setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageUrl: url } : p));
      }
      else if (newMode === 'news') {
           if (!post.newsImageUrl) {
               const sourceTopic = trendingTopics.find(t => t.title === post.topic);
               if (sourceTopic?.url) {
                   const ogImg = await fetchNewsImageFromUrl(sourceTopic.url);
                   if (ogImg) {
                       setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, newsImageUrl: ogImg } : p));
                       return;
                   }
               }
               
               try {
                  const newsPrompt = `News photo about ${post.topic}, realistic, journalism style`;
                  const aiNewsImg = await generateImage(newsPrompt);
                  setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, newsImageUrl: aiNewsImg } : p));
               } catch(e) {
                  alert("此話題無新聞圖片，也無法生成替代圖。");
                  setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageSourceType: 'none' } : p));
               }
           }
      }
  };

  const handlePublish = async (post: GeneratedPost) => {
      const acc = accounts.find(a => a.id === post.targetAccountId);
      if (!acc) return alert("找不到指定發佈的帳號");

      if (post.imageSourceType === 'upload') {
          if (!confirm("⚠️ 注意：手動上傳的圖片目前僅支援「預覽」。\n\nThreads API 需要公開的圖片網址才能發佈。若您繼續，系統將嘗試發送，但可能會因為圖片非公開網址而失敗。\n\n是否仍要嘗試？")) {
              return;
          }
      }

      setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'publishing' } : p));

      const imgUrl = post.imageSourceType === 'none' ? undefined : getPreviewUrl(post);
      
      const res = await publishThreadsPost(acc, post.caption, imgUrl);

      setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { 
          ...p, 
          status: res.success ? 'done' : 'failed',
          log: res.success ? '發佈成功' : res.error 
      } : p));
  };

  const resetGenFlow = () => {
      setGenStep(1);
      setGeneratedPosts([]);
      setSelectedTopics([]);
      setManualTopic('');
  };

  // --- Interaction Handlers ---
  const handleScan = async () => {
      if (!user) return;
      if (accounts.length === 0) return alert("無帳號");
      
      setIsLoadingComments(true);
      setComments([]);
      try {
          const newComments: CommentData[] = [];
          for (let i = 0; i < accounts.length; i++) {
              const acc = accounts[i];
              if (!acc.isActive) continue;
              
              const threads = await fetchUserThreads(acc, 3);
              for (const thread of threads) {
                  const replies = await fetchMediaReplies(acc, thread.id);
                  replies.forEach((r: any) => {
                      newComments.push({
                          id: r.id,
                          text: r.text || '',
                          username: r.username || 'user',
                          timestamp: r.timestamp,
                          threadId: thread.id,
                          accountIndex: i
                      });
                  });
              }
          }
          setComments(newComments);
          if (newComments.length === 0) alert("最近 3 篇貼文無新留言");
      } catch (e: any) {
          alert(`掃描錯誤: ${e.message}`);
      } finally {
          setIsLoadingComments(false);
      }
  };

  const handleGenReply = async (comment: CommentData) => {
      setSelectedCommentId(comment.id);
      setGeneratedReplies([]);
      const acc = accounts[comment.accountIndex];
      const persona = acc.personaPrompt || settings.persona || 'Friendly';
      
      try {
          const replies = await generateCommentReply(comment.text, persona);
          setGeneratedReplies(replies);
      } catch (e) {
          alert("生成回覆失敗");
      }
  };

  const handleSendReply = async (comment: CommentData, text: string) => {
      if (isReplying) return;
      setIsReplying(true);
      const acc = accounts[comment.accountIndex];
      const res = await publishThreadsPost(acc, text, undefined, comment.id);
      
      if (res.success) {
          alert("回覆成功！");
          setComments(prev => prev.filter(c => c.id !== comment.id));
          setSelectedCommentId(null);
      } else {
          alert(`回覆失敗: ${res.error}`);
      }
      setIsReplying(false);
  };

  // --- Render Conditional Overlays ---
  if (loadingTrends) return <LoadingOverlay message="正在搜尋熱門話題" detail="AI 正在分析全網新聞與社群趨勢..." />;
  if (isGenerating) return <LoadingOverlay message="AI 正在量產 Threads 貼文" detail={`正在模擬 ${genCount} 篇不同語氣的真實貼文，並準備圖片中...`} />;
  if (isLoadingComments) return <LoadingOverlay message="正在掃描互動" detail="機器人正在讀取您的帳號留言..." />;

  // Find currently selected account object
  const selectedAccountObj = accounts.find(a => a.id === selectedGenAccountId);

  return (
    <div className="max-w-6xl mx-auto p-4 animate-fade-in pb-20">
      <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-white">🧵 Threads 養號農場</h2>
          <div className="text-xs text-gray-400">多帳號管理 • 智能回覆 • 批量生成</div>
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
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">Threads User ID *</label>
                          <input 
                            value={newAccountInput.userIdInput} 
                            onChange={e => setNewAccountInput({...newAccountInput, userIdInput: e.target.value})} 
                            className="w-full bg-dark border border-gray-600 rounded p-2 text-white" 
                            placeholder="數值 ID (例如 123456789)" 
                          />
                      </div>
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">Access Token *</label>
                          <input 
                            value={newAccountInput.token} 
                            onChange={e => setNewAccountInput({...newAccountInput, token: e.target.value})} 
                            className="w-full bg-dark border border-gray-600 rounded p-2 text-white" 
                            type="password"
                            placeholder="長期 Token" 
                          />
                      </div>
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">顯示名稱</label>
                          <input 
                            value={newAccountInput.username} 
                            onChange={e => setNewAccountInput({...newAccountInput, username: e.target.value})} 
                            className="w-full bg-dark border border-gray-600 rounded p-2 text-white" 
                            placeholder="自訂識別名稱" 
                          />
                      </div>
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">人設 Prompt</label>
                          <input 
                            value={newAccountInput.personaPrompt} 
                            onChange={e => setNewAccountInput({...newAccountInput, personaPrompt: e.target.value})} 
                            className="w-full bg-dark border border-gray-600 rounded p-2 text-white" 
                            placeholder="例如：厭世工程師" 
                          />
                      </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                      <button onClick={handleAddAccount} className="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded font-bold transition-colors">
                          + 新增帳號
                      </button>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {accounts.map((acc) => (
                      <div key={acc.id} className="bg-dark p-4 rounded border border-gray-600 relative group">
                          <div className="flex items-center gap-3 mb-2">
                             <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-lg font-bold text-white">{acc.username.charAt(0)}</div>
                             <div className="overflow-hidden">
                                 <div className="font-bold text-white text-sm truncate">{acc.username}</div>
                                 <div className="text-xs text-gray-500 truncate">ID: {acc.userId}</div>
                             </div>
                          </div>
                          
                          <div className="mt-2 text-xs">
                              <label className="text-gray-400">人設:</label>
                              <input 
                                  className="w-full bg-gray-800 border-none rounded px-2 py-1 mt-1 text-gray-200 focus:ring-1 focus:ring-primary" 
                                  value={acc.personaPrompt || ''} 
                                  onChange={e => handleUpdatePersona(acc.id, e.target.value)} 
                                  placeholder="未設定" 
                              />
                          </div>
                          <button onClick={() => handleRemoveAccount(acc.id)} className="text-red-400 text-xs absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              移除
                          </button>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* VIEW: GENERATOR */}
      {activeTab === 'generator' && (
          <div className="space-y-6">
              {genStep === 1 && (
                  <div className="bg-card p-6 rounded-xl border border-gray-700">
                       <h3 className="text-xl font-bold text-white mb-4">步驟 1: 選擇話題</h3>
                       <div className="flex gap-4 mb-4 overflow-x-auto">
                            <div 
                                onClick={() => loadTrends()} 
                                className="flex-shrink-0 w-32 h-32 bg-indigo-900/30 border border-indigo-500 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-900/50"
                            >
                                <span className="text-2xl mb-2">🔎</span>
                                <span className="text-sm font-bold text-indigo-200">挖掘靈感</span>
                                <span className="text-xs text-indigo-400 mt-1">扣 1 點</span>
                            </div>
                            
                            {trendingTopics.map((t, i) => (
                                <div 
                                    key={i} 
                                    onClick={() => selectTopic(t.title)}
                                    className={`flex-shrink-0 w-48 h-32 p-3 rounded-lg border cursor-pointer relative transition-all ${selectedTopics.includes(t.title) ? 'bg-primary/20 border-primary ring-2 ring-primary' : 'bg-dark border-gray-700 hover:border-gray-500'}`}
                                >
                                    <h4 className="font-bold text-white text-sm line-clamp-2 mb-1">{t.title}</h4>
                                    <p className="text-xs text-gray-400 line-clamp-3">{t.description}</p>
                                    {selectedTopics.includes(t.title) && <div className="absolute top-2 right-2 bg-primary text-white text-xs px-1 rounded">✓</div>}
                                </div>
                            ))}
                       </div>
                       
                       <div className="mt-4">
                           <label className="block text-sm text-gray-400 mb-1">或手動輸入話題:</label>
                           <input 
                                value={manualTopic} 
                                onChange={handleManualTopicChange}
                                className={`w-full bg-dark border border-gray-600 rounded p-3 text-white transition-all ${manualTopic ? 'border-primary ring-1 ring-primary' : ''}`}
                                placeholder="例如：颱風假、#iPhone16" 
                           />
                       </div>

                       {trendError && <p className="text-red-400 text-sm mt-2">{trendError}</p>}
                       
                       <div className="mt-6 flex justify-end">
                           <button onClick={proceedToGenerateUI} className="bg-primary hover:bg-blue-600 text-white px-8 py-3 rounded font-bold shadow-lg">
                               下一步：設定參數 →
                           </button>
                       </div>
                  </div>
              )}

              {genStep === 2 && (
                  <div className="space-y-6">
                      {/* Generation Settings Panel */}
                      <div className="bg-card p-6 rounded-xl border border-gray-700">
                           <div className="flex justify-between items-center mb-6">
                               <h3 className="text-xl font-bold text-white">步驟 2: 設定與生成</h3>
                               <button onClick={resetGenFlow} className="text-gray-400 hover:text-white underline text-sm">← 重選話題</button>
                           </div>
                           
                           {/* --- NEW: Account Selection Moved to Top --- */}
                           <div className="mb-6 bg-blue-900/20 p-4 rounded border border-blue-800">
                               <label className="block text-sm text-blue-300 font-bold mb-2">1. 選擇發文帳號 (決定人設與語氣) *</label>
                               <select 
                                   value={selectedGenAccountId} 
                                   onChange={(e) => setSelectedGenAccountId(e.target.value)}
                                   className="w-full bg-dark border border-blue-500 rounded p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                               >
                                   <option value="" disabled>請選擇帳號</option>
                                   {accounts.map(acc => (
                                       <option key={acc.id} value={acc.id}>
                                           {acc.username} {acc.personaPrompt ? `(${acc.personaPrompt})` : ''}
                                       </option>
                                   ))}
                               </select>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                               <div className="bg-dark/50 p-4 rounded border border-gray-600">
                                   <label className="block text-sm text-gray-400 mb-2">目標話題</label>
                                   <div className="font-bold text-xl text-white break-words">
                                       {selectedTopics.length > 0 ? selectedTopics[0] : manualTopic}
                                   </div>
                               </div>

                               <div className="space-y-4">
                                   <div>
                                       <label className="block text-sm text-gray-400 mb-1">生成數量</label>
                                       <div className="flex gap-2">
                                           {[1, 2, 3].map(n => (
                                               <button 
                                                   key={n} 
                                                   onClick={() => setGenCount(n as 1|2|3)}
                                                   className={`flex-1 py-2 rounded border ${genCount === n ? 'bg-white text-black border-white font-bold' : 'bg-transparent text-gray-400 border-gray-600'}`}
                                               >
                                                   {n} 篇
                                               </button>
                                           ))}
                                       </div>
                                   </div>
                                   
                                   <div>
                                       <label className="block text-sm text-gray-400 mb-1">預設圖片模式</label>
                                       <select 
                                           value={preSelectedImageMode} 
                                           onChange={(e) => setPreSelectedImageMode(e.target.value as ImageSourceType)}
                                           className="w-full bg-dark border border-gray-600 rounded p-2 text-white"
                                       >
                                           <option value="none">📝 純文字 (0 點)</option>
                                           <option value="stock">📷 擬真圖庫 (1 點)</option>
                                           <option value="news">📰 新聞圖片 (1 點)</option>
                                           <option value="ai">🎨 AI 繪圖 (3 點)</option>
                                       </select>
                                   </div>
                               </div>
                           </div>

                           <button 
                               onClick={handleGenerateBatch}
                               disabled={!selectedGenAccountId}
                               className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg transform transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
                           >
                               ✨ 立即生成 {genCount} 篇貼文
                           </button>
                      </div>

                      {/* Results List */}
                      {generatedPosts.length > 0 && (
                          <div className="space-y-8 animate-fade-in">
                              <h3 className="text-xl font-bold text-gray-300">生成結果</h3>
                              {generatedPosts.map((post) => (
                                  <div key={post.id} className="bg-card rounded-xl border border-gray-700 overflow-hidden flex flex-col md:flex-row">
                                      {/* Preview Area */}
                                      <div className="w-full md:w-1/3 bg-black flex items-center justify-center relative min-h-[300px]">
                                          {getPreviewUrl(post) ? (
                                              <img src={getPreviewUrl(post)} alt="Post" className="w-full h-full object-cover" />
                                          ) : (
                                              <div className="text-gray-500 text-sm">無圖片</div>
                                          )}
                                          
                                          {/* Image Overlay Controls */}
                                          <div className="absolute bottom-2 left-2 right-2 flex gap-2 overflow-x-auto p-1 bg-black/50 rounded backdrop-blur-sm">
                                              <button onClick={() => handleImageModeChange(post, 'stock')} className="text-xs bg-gray-700 text-white px-2 py-1 rounded whitespace-nowrap">📷 換圖庫</button>
                                              <button onClick={() => handleImageModeChange(post, 'ai')} className="text-xs bg-purple-700 text-white px-2 py-1 rounded whitespace-nowrap">🎨 AI重繪</button>
                                              <button onClick={() => handleImageModeChange(post, 'news')} className="text-xs bg-blue-700 text-white px-2 py-1 rounded whitespace-nowrap">📰 找新聞圖</button>
                                          </div>
                                          
                                          {/* Manual Upload hidden input */}
                                          {post.imageSourceType === 'upload' && (
                                              <div className="absolute top-2 right-2">
                                                  <label className="bg-gray-800 text-white text-xs px-2 py-1 rounded cursor-pointer border border-gray-600">
                                                      📂 上傳
                                                      <input type="file" className="hidden" onChange={(e) => handleFileUpload(post.id, e)} accept="image/*" />
                                                  </label>
                                              </div>
                                          )}
                                          
                                          {isRegeneratingImage === post.id && (
                                              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                                  <div className="loader"></div>
                                              </div>
                                          )}
                                      </div>

                                      {/* Content Editor */}
                                      <div className="flex-1 p-6 flex flex-col">
                                          <div className="flex justify-between mb-2">
                                              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
                                                  {accounts.find(a => a.id === post.targetAccountId)?.username || 'Unknown'}
                                              </span>
                                              <div className="flex gap-2">
                                                  <label className="text-xs text-gray-400 flex items-center gap-1 cursor-pointer">
                                                      <input 
                                                          type="radio" 
                                                          checked={post.imageSourceType === 'none'} 
                                                          onChange={() => handleImageModeChange(post, 'none')}
                                                      /> 純文字
                                                  </label>
                                                  <label className="text-xs text-gray-400 flex items-center gap-1 cursor-pointer">
                                                      <input 
                                                          type="radio" 
                                                          checked={post.imageSourceType === 'upload'} 
                                                          onChange={() => setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageSourceType: 'upload' } : p))}
                                                      /> 手動上傳
                                                  </label>
                                              </div>
                                          </div>
                                          
                                          <textarea 
                                              value={post.caption}
                                              onChange={(e) => setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, caption: e.target.value } : p))}
                                              className="w-full flex-1 bg-dark border border-gray-600 rounded p-3 text-white mb-4 resize-none focus:border-primary outline-none"
                                          />
                                          
                                          {post.log && (
                                              <div className="text-xs text-red-400 mb-2">{post.log}</div>
                                          )}

                                          <button 
                                              onClick={() => handlePublish(post)}
                                              disabled={post.status === 'publishing' || post.status === 'done'}
                                              className={`w-full py-3 rounded font-bold transition-all ${
                                                  post.status === 'done' ? 'bg-green-700 text-white cursor-default' :
                                                  post.status === 'publishing' ? 'bg-gray-600 text-gray-300' :
                                                  'bg-white text-black hover:bg-gray-200'
                                              }`}
                                          >
                                              {post.status === 'done' ? '✅ 已發佈' : post.status === 'publishing' ? '發送中...' : '🚀 發佈到 Threads'}
                                          </button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              )}
          </div>
      )}

      {/* VIEW: INTERACTION */}
      {activeTab === 'interaction' && (
          <div className="space-y-6">
              <div className="bg-card p-6 rounded-xl border border-gray-700">
                  <div className="flex justify-between items-center mb-6">
                      <div>
                          <h3 className="text-xl font-bold text-white">最新留言</h3>
                          <p className="text-sm text-gray-400">系統將掃描所有活躍帳號的最新 3 篇貼文留言</p>
                      </div>
                      <button onClick={handleScan} className="bg-pink-600 hover:bg-pink-500 text-white px-4 py-2 rounded font-bold">
                          🔄 掃描留言
                      </button>
                  </div>

                  {comments.length === 0 ? (
                      <div className="text-center py-10 text-gray-500 border border-dashed border-gray-700 rounded">
                          尚無新留言或未掃描
                      </div>
                  ) : (
                      <div className="space-y-4">
                          {comments.map(comment => (
                              <div key={comment.id} className="bg-dark p-4 rounded border border-gray-600">
                                  <div className="flex justify-between mb-2">
                                      <span className="font-bold text-white">@{comment.username}</span>
                                      <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
                                          To: {accounts[comment.accountIndex]?.username}
                                      </span>
                                  </div>
                                  <p className="text-gray-300 mb-4">{comment.text}</p>
                                  
                                  {selectedCommentId === comment.id ? (
                                      <div className="bg-gray-800 p-3 rounded">
                                          {generatedReplies.length > 0 ? (
                                              <div className="space-y-2">
                                                  {generatedReplies.map((reply, idx) => (
                                                      <div key={idx} className="flex gap-2">
                                                          <div className="flex-1 text-sm bg-black/30 p-2 rounded text-gray-200">{reply}</div>
                                                          <button onClick={() => handleSendReply(comment, reply)} className="bg-primary text-white px-3 rounded text-sm hover:bg-blue-600">
                                                              發送
                                                          </button>
                                                      </div>
                                                  ))}
                                                  <div className="border-t border-gray-700 my-2 pt-2">
                                                      <input 
                                                          value={draftReply}
                                                          onChange={e => setDraftReply(e.target.value)}
                                                          placeholder="或手動輸入回覆..."
                                                          className="w-full bg-black/30 text-white p-2 rounded text-sm mb-2"
                                                      />
                                                      <button onClick={() => handleSendReply(comment, draftReply)} disabled={!draftReply} className="w-full bg-gray-600 hover:bg-gray-500 text-white py-1 rounded text-sm">
                                                          發送手動回覆
                                                      </button>
                                                  </div>
                                              </div>
                                          ) : (
                                              <div className="text-center text-sm text-gray-400 py-2">
                                                  AI 正在思考回覆...
                                              </div>
                                          )}
                                      </div>
                                  ) : (
                                      <button onClick={() => handleGenReply(comment)} className="text-sm text-primary hover:text-white underline">
                                          ✨ 生成 AI 回覆建議
                                      </button>
                                  )}
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};

export default ThreadsNurturePanel;
