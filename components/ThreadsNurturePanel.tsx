
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
    // Using simple query + strict modifiers works better for "fake stock photos"
    const realismPrompt = `${query}, candid photography, shot on iPhone 15, natural lighting, grainy, unpolished, 4k, no 3d render, no illustration, hyperrealistic`;
    const encoded = encodeURIComponent(realismPrompt);
    // Direct call to Pollinations (Free, Fast, Good for "Stock" tier)
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
      setSelectedTopics([title]);
      setManualTopic(''); 
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

      const sourceTopicData = trendingTopics.find(t => t.title === topicSource);
      const initialNewsImg = sourceTopicData?.imageUrl;
      const newsUrl = sourceTopicData?.url; // For OG fetch

      // No popup for missing news image, we will handle it via fallback logic
      const totalCost = calculateCost(genCount, preSelectedImageMode);
      
      if (!confirm(`確定生成 ${genCount} 篇貼文？\n\n模式：${preSelectedImageMode === 'ai' ? 'AI繪圖' : preSelectedImageMode === 'stock' ? '擬真圖庫' : preSelectedImageMode === 'news' ? '新聞圖片' : '純文字'}\n總計消耗：${totalCost} 點配額`)) return;

      const allowed = await checkAndUseQuota(user.user_id, totalCost);
      if (!allowed) return alert(`配額不足 (需 ${totalCost} 點)`);
      onQuotaUpdate();

      setIsGenerating(true);
      setGeneratedPosts([]);

      try {
          const activeAccounts = accounts.filter(a => a.isActive);
          if (activeAccounts.length === 0) throw new Error("無活躍帳號，請先啟用或新增帳號");
          
          const personas = activeAccounts.map(a => a.personaPrompt || '').filter(Boolean);
          const results = await generateThreadsBatch(topicSource, genCount, settings, personas);

          // Prepare final posts with Waterfall Logic for Images
          const newPosts: GeneratedPost[] = await Promise.all(results.map(async (r, i) => {
              let finalMode = preSelectedImageMode;
              let finalImageUrl = undefined;
              let errorLog = undefined;
              let paid = false;
              const uniqueSeed = Date.now().toString() + i;

              // --- AI Mode (Backend, High Quality) ---
              if (finalMode === 'ai') {
                  paid = true;
                  try {
                      finalImageUrl = await generateImage(r.imagePrompt);
                  } catch (e) {
                      console.warn("AI Image gen failed in batch", e);
                      // Fallback: don't change mode, just log error so user can retry for free
                      errorLog = '圖片生成失敗 (請點擊重試)';
                  }
              }
              // --- Stock Mode (Frontend, Fast, Realistic Style) ---
              else if (finalMode === 'stock') {
                  // Direct generation, no backend overhead.
                  // Use 'imageQuery' (shorter) if available for better stock results
                  finalImageUrl = generateStockUrl(r.imageQuery || r.imagePrompt, uniqueSeed);
              }
              // --- News Mode (Advanced Fetch) ---
              else if (finalMode === 'news') {
                  // 1. RSS Image
                  if (initialNewsImg) {
                      finalImageUrl = initialNewsImg;
                  } 
                  // 2. OG Fetch (Deep)
                  else if (newsUrl) {
                      const ogImg = await fetchNewsImageFromUrl(newsUrl);
                      if (ogImg) finalImageUrl = ogImg;
                  }
                  
                  // 3. Last Resort: AI Fallback for News
                  if (!finalImageUrl) {
                      try {
                         // Generate "Realistic News Style" image
                         const newsPrompt = `News photo about ${topicSource}, realistic, journalism style, 4k`;
                         finalImageUrl = await generateImage(newsPrompt);
                      } catch (e) {
                         // Really failed
                         finalMode = 'none'; // Only downgrade if absolutely everything failed
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
                  
                  // Image Data
                  newsImageUrl: finalMode === 'news' ? finalImageUrl : undefined,
                  imageUrl: (finalMode === 'ai' || finalMode === 'stock' || finalMode === 'news') ? finalImageUrl : undefined,
                  imageSourceType: finalMode,
                  log: errorLog,
                  paidForGeneration: paid,
                  
                  status: 'idle',
                  targetAccountId: activeAccounts[i % activeAccounts.length]?.id
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

      // --- Smart Retry Logic ---
      if (newMode === 'ai') {
          // If we are ALREADY in AI mode (paid 4 pts) but failed to generate image (url empty),
          // OR if we paid for it but swapped away and swapped back,
          // We should allow retry for FREE (costDiff = 0).
          // However, if we successfully generated an image and want ANOTHER one, we charge.
          
          if (post.imageSourceType === 'ai' && !post.imageUrl) {
              // Free Retry for failed generation
              costDiff = 0; 
          } else if (post.imageSourceType === 'ai' && post.imageUrl) {
              // Re-generation (Variation)
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

      // Update State
      setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { 
          ...p, 
          imageSourceType: newMode, 
          log: undefined,
          paidForGeneration: newMode === 'ai' ? true : p.paidForGeneration
      } : p));

      // Execute Logic
      if (newMode === 'ai') {
          setIsRegeneratingImage(post.id);
          try {
              const url = await generateImage(post.imagePrompt);
              setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageUrl: url } : p));
          } catch (e: any) {
              // Keep mode as 'ai' but clear URL so retry remains free
              setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageUrl: undefined, log: '生成失敗 (點擊重試)' } : p));
          } finally {
              setIsRegeneratingImage(null);
          }
      } 
      else if (newMode === 'stock') {
           // Fast Client-side Gen
           const url = generateStockUrl(post.imageQuery || post.imagePrompt, Date.now().toString());
           setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageUrl: url } : p));
      }
      else if (newMode === 'news') {
           // If switching to news manually, try to find the image again
           if (!post.newsImageUrl) {
               // Try deep fetch logic again for this specific post
               const sourceTopic = trendingTopics.find(t => t.title === post.topic);
               if (sourceTopic?.url) {
                   const ogImg = await fetchNewsImageFromUrl(sourceTopic.url);
                   if (ogImg) {
                       setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, newsImageUrl: ogImg } : p));
                       return;
                   }
               }
               
               // Fallback AI
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
                          <button onClick={() => handleRemoveAccount(acc.id)} className="text-red-400 text-xs absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-dark px-2 py-1 rounded">移除</button>
                      </div>
                  ))}
                  {accounts.length === 0 && (
                      <div className="col-span-full text-center py-8 text-gray-500 border border-dashed border-gray-700 rounded-lg">
                          尚無帳號，請上方新增。
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* VIEW: GENERATOR (2-Step Flow) */}
      {activeTab === 'generator' && (
          <div className="space-y-8 animate-fade-in">
              {/* STEP 1: Discover Topics */}
              {genStep === 1 && (
                  <div className="bg-card p-6 rounded-xl border border-gray-700">
                      <h3 className="text-xl font-bold text-white mb-2">Step 1: 挖掘靈感話題</h3>
                      <p className="text-gray-400 text-sm mb-6">點擊下方按鈕，AI 將為您分析台灣熱門時事。</p>
                      
                      {trendingTopics.length === 0 ? (
                          <div className="text-center py-8">
                               {trendError && <p className="text-red-400 mb-4">{trendError}</p>}
                               <button 
                                  onClick={loadTrends} 
                                  disabled={loadingTrends}
                                  className="bg-secondary hover:bg-indigo-600 text-white px-8 py-4 rounded-full font-bold shadow-lg transition-transform transform hover:scale-105 disabled:opacity-50"
                               >
                                   🔍 挖掘熱門話題 (扣 1 點)
                               </button>
                               <div className="mt-8 border-t border-gray-700 pt-6 max-w-md mx-auto">
                                   <label className="block text-sm text-gray-400 mb-2">或直接手動輸入主題跳過：</label>
                                   <div className="flex gap-2">
                                       <input 
                                          value={manualTopic}
                                          onChange={e => setManualTopic(e.target.value)}
                                          className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white"
                                          placeholder="例如：夏日海邊穿搭"
                                       />
                                       <button 
                                          onClick={proceedToGenerateUI}
                                          disabled={!manualTopic}
                                          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded"
                                       >
                                           下一步
                                       </button>
                                   </div>
                               </div>
                          </div>
                      ) : (
                          <div className="space-y-6">
                              <div className="flex flex-wrap gap-3">
                                  {trendingTopics.map((t, i) => (
                                      <button 
                                        key={i}
                                        onClick={() => selectTopic(t.title)}
                                        className={`px-4 py-3 rounded-lg border text-left transition-all relative ${
                                            selectedTopics.includes(t.title) 
                                            ? 'bg-blue-900/50 border-primary ring-2 ring-primary text-white' 
                                            : 'bg-dark border-gray-600 text-gray-300 hover:border-gray-400 hover:bg-gray-800'
                                        }`}
                                      >
                                          <div className="font-bold">{t.title}</div>
                                          {t.imageUrl && <span className="absolute top-2 right-2 text-[10px] bg-green-900 text-green-200 px-1 rounded">有圖</span>}
                                          {t.description && <div className="text-xs text-gray-500 mt-1 line-clamp-1">{t.description}</div>}
                                      </button>
                                  ))}
                              </div>

                              <div className="flex justify-end pt-4 border-t border-gray-700">
                                   <button 
                                      onClick={proceedToGenerateUI}
                                      disabled={selectedTopics.length === 0}
                                      className="bg-primary hover:bg-blue-600 text-white px-8 py-3 rounded font-bold shadow-lg disabled:opacity-50"
                                   >
                                       下一步：設定生成參數 →
                                   </button>
                              </div>
                          </div>
                      )}
                  </div>
              )}

              {/* STEP 2: Generate Content */}
              {genStep === 2 && (
                  <div className="space-y-8 animate-fade-in">
                      <div className="bg-card p-6 rounded-xl border border-gray-700">
                           <div className="flex items-center justify-between mb-4">
                               <h3 className="text-xl font-bold text-white">Step 2: 批量生產貼文</h3>
                               <button onClick={resetGenFlow} className="text-sm text-gray-400 hover:text-white underline">← 重新選擇話題</button>
                           </div>
                           
                           <div className="bg-blue-900/20 border border-blue-900 p-4 rounded mb-6">
                               <span className="text-gray-400 text-sm">已選話題：</span>
                               <span className="text-xl font-bold text-white ml-2">
                                   {selectedTopics.length > 0 ? selectedTopics[0] : manualTopic}
                               </span>
                           </div>

                           <div className="flex flex-col md:flex-row items-end gap-4">
                               <div className="flex-1 w-full">
                                   <label className="block text-sm text-gray-400 mb-1">生成篇數 (每次建議 1-3 篇)</label>
                                   <select value={genCount} onChange={e => setGenCount(Number(e.target.value) as 1|2|3)} className="w-full bg-dark border border-gray-600 rounded p-2 text-white">
                                       <option value="1">1 篇</option>
                                       <option value="2">2 篇</option>
                                       <option value="3">3 篇</option>
                                   </select>
                               </div>

                               <div className="flex-1 w-full">
                                   <label className="block text-sm text-gray-400 mb-1">圖片模式 (預設)</label>
                                   <select value={preSelectedImageMode} onChange={e => setPreSelectedImageMode(e.target.value as ImageSourceType)} className="w-full bg-dark border border-gray-600 rounded p-2 text-white">
                                       <option value="none">❌ 純文字 (共 1 點)</option>
                                       <option value="news">📰 新聞原圖 (共 2 點)</option>
                                       <option value="ai">🎨 AI 繪圖 (共 4 點)</option>
                                       <option value="stock">📷 擬真圖庫 (共 2 點)</option>
                                       <option value="upload">📤 手動上傳 (共 1 點)</option>
                                   </select>
                               </div>

                               <div className="flex-1 w-full">
                                   <button 
                                        onClick={handleGenerateBatch}
                                        disabled={isGenerating}
                                        className="w-full bg-secondary hover:bg-indigo-600 text-white px-6 py-2 rounded font-bold h-[42px] disabled:opacity-50 transition-colors shadow-lg"
                                    >
                                        ✨ 生成 (共扣 {calculateCost(genCount, preSelectedImageMode)} 點)
                                    </button>
                               </div>
                           </div>
                           <div className="text-xs text-gray-500 mt-3 p-3 bg-gray-900/50 rounded border border-gray-700">
                               <p className="font-bold text-gray-400 mb-1">💰 點數價目表 (Per Post)</p>
                               <ul className="flex flex-wrap gap-4">
                                   <li>📝 純文字: <span className="text-green-400">1 點</span></li>
                                   <li>📰 新聞圖: <span className="text-yellow-400">2 點</span> (1文+1圖)</li>
                                   <li>📷 擬真圖庫: <span className="text-yellow-400">2 點</span> (1文+1圖)</li>
                                   <li>🎨 AI 繪圖: <span className="text-pink-400">4 點</span> (1文+1圖/高算力)</li>
                               </ul>
                           </div>
                      </div>

                      {/* Results List */}
                      {generatedPosts.length > 0 && (
                          <div className="space-y-6">
                              <h3 className="font-bold text-white text-lg">生成結果預覽</h3>
                              {generatedPosts.map((post) => (
                                  <div key={post.id} className="bg-dark p-6 rounded border border-gray-600 flex flex-col md:flex-row gap-6 shadow-xl relative">
                                      {/* Loading Overlay for Image Regen */}
                                      {isRegeneratingImage === post.id && (
                                          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 rounded">
                                              <span className="loader mr-2"></span> 圖片生成中...
                                          </div>
                                      )}

                                      <div className="flex-1 space-y-4">
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">貼文內容</label>
                                              <textarea 
                                                  value={post.caption}
                                                  onChange={e => {
                                                      const val = e.target.value;
                                                      setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, caption: val } : p));
                                                  }}
                                                  className="w-full h-32 bg-gray-800 border border-gray-700 rounded p-3 text-white text-sm resize-none focus:border-primary outline-none"
                                              />
                                          </div>
                                          
                                          <div className="flex gap-4">
                                              <div className="flex-1">
                                                  <label className="block text-xs text-gray-400 mb-1">發佈帳號</label>
                                                  <select 
                                                      value={post.targetAccountId} 
                                                      onChange={e => {
                                                          const val = e.target.value;
                                                          setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, targetAccountId: val } : p));
                                                      }}
                                                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-xs text-white"
                                                  >
                                                      {accounts.map(a => <option key={a.id} value={a.id}>{a.username}</option>)}
                                                  </select>
                                              </div>
                                              <div className="flex-1">
                                                  <label className="block text-xs text-gray-400 mb-1">圖片模式 (升級需補差額)</label>
                                                  <select 
                                                      value={post.imageSourceType} 
                                                      onChange={e => handleImageModeChange(post, e.target.value as ImageSourceType)}
                                                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-xs text-white"
                                                  >
                                                      <option value="none">❌ 純文字</option>
                                                      <option value="news">📰 新聞原圖 (共2點)</option>
                                                      <option value="ai">🎨 AI 繪圖 (共4點)</option>
                                                      <option value="stock">📷 擬真圖庫 (共2點)</option>
                                                      <option value="upload">📤 手動上傳</option>
                                                  </select>
                                              </div>
                                          </div>
                                          
                                          {post.imageSourceType === 'upload' && (
                                              <div className="border border-dashed border-gray-600 p-4 rounded bg-gray-800/50">
                                                  <input 
                                                      type="file" 
                                                      accept="image/png, image/jpeg, image/jpg, image/webp"
                                                      onChange={(e) => handleFileUpload(post.id, e)}
                                                      className="text-xs text-gray-300 w-full"
                                                  />
                                                  <p className="text-[10px] text-gray-500 mt-1">* 支援 JPG, PNG, WEBP (系統將嘗試中轉網址)</p>
                                              </div>
                                          )}
                                      </div>
                                      
                                      <div className="w-full md:w-64 flex flex-col gap-3">
                                          <div className="flex-1 bg-black rounded flex items-center justify-center overflow-hidden border border-gray-700 min-h-[160px] relative group cursor-pointer" onClick={() => post.imageSourceType === 'ai' && !post.imageUrl ? handleImageModeChange(post, 'ai') : null}>
                                              {post.imageSourceType === 'none' ? (
                                                  <span className="text-gray-500 text-xs">無圖片</span>
                                              ) : (
                                                  post.imageUrl || post.newsImageUrl || post.uploadedImageBase64 ? (
                                                      <img 
                                                          src={getPreviewUrl(post)} 
                                                          alt="Preview" 
                                                          className="w-full h-full object-cover absolute inset-0 transition-transform transform group-hover:scale-110" 
                                                          onError={(e) => (e.currentTarget.src = 'https://placehold.co/400x400?text=Image+Error')}
                                                      />
                                                  ) : (
                                                      <div className="flex flex-col items-center justify-center h-full text-gray-500 hover:text-white transition-colors">
                                                           {post.imageSourceType === 'ai' ? (
                                                               <>
                                                                 <span className="text-2xl mb-1">⚠️</span>
                                                                 <span className="text-xs text-center">生成失敗<br/>點此免費重試</span>
                                                               </>
                                                           ) : <span className="text-xs">等待圖片...</span>}
                                                      </div>
                                                  )
                                              )}
                                          </div>
                                          
                                          {post.status === 'done' ? (
                                              <div className="bg-green-900/50 text-green-400 text-center py-2 rounded text-sm font-bold border border-green-700">
                                                  ✅ 已發佈
                                              </div>
                                          ) : (
                                              <button 
                                                  onClick={() => handlePublish(post)}
                                                  disabled={post.status === 'publishing'}
                                                  className={`w-full py-2 rounded text-sm font-bold text-white transition-colors shadow-md ${post.status === 'failed' ? 'bg-red-600' : 'bg-primary hover:bg-blue-600'}`}
                                              >
                                                  {post.status === 'publishing' ? '發佈中...' : post.status === 'failed' ? '重試發佈' : '🚀 發佈貼文'}
                                              </button>
                                          )}
                                          {post.log && <p className={`text-[10px] text-center ${post.status === 'failed' ? 'text-red-400' : 'text-gray-500'}`}>{post.log}</p>}
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
                          <h3 className="text-xl font-bold text-white">💬 留言互動 (Reply Bot)</h3>
                          <p className="text-sm text-gray-400">掃描並 AI 回覆網友留言</p>
                      </div>
                      <button 
                          onClick={handleScan} 
                          disabled={isLoadingComments}
                          className="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded font-bold disabled:opacity-50"
                      >
                          🔄 掃描留言
                      </button>
                  </div>

                  {comments.length === 0 && !isLoadingComments ? (
                      <div className="text-center py-10 text-gray-500 bg-dark/30 rounded border border-dashed border-gray-700">
                          無未讀留言。
                      </div>
                  ) : (
                      <div className="space-y-4">
                          {comments.map((comment) => (
                              <div key={comment.id} className="bg-dark p-4 rounded border border-gray-600">
                                  <div className="flex items-center gap-2 mb-2 text-sm">
                                      <span className="font-bold text-white">@{comment.username}</span>
                                      <span className="text-gray-500">{new Date(comment.timestamp).toLocaleString()}</span>
                                  </div>
                                  <p className="text-gray-200 mb-3">{comment.text}</p>
                                  
                                  {selectedCommentId === comment.id ? (
                                      <div className="bg-gray-800 p-3 rounded">
                                          {generatedReplies.length > 0 ? (
                                              <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
                                                  {generatedReplies.map((r, i) => (
                                                      <button key={i} onClick={() => setDraftReply(r)} className="whitespace-nowrap px-3 py-1 bg-gray-700 rounded text-xs text-white hover:bg-gray-600">
                                                          {r.substring(0, 15)}...
                                                      </button>
                                                  ))}
                                              </div>
                                          ) : <div className="text-xs text-gray-500 mb-2">AI 思考中...</div>}
                                          
                                          <textarea 
                                              value={draftReply}
                                              onChange={e => setDraftReply(e.target.value)}
                                              className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm mb-2"
                                              rows={2}
                                          />
                                          <div className="flex justify-end gap-2">
                                              <button onClick={() => setSelectedCommentId(null)} className="text-gray-400 text-sm">取消</button>
                                              <button onClick={() => handleSendReply(comment, draftReply)} disabled={isReplying} className="bg-blue-600 text-white px-4 py-1 rounded text-sm font-bold">發送</button>
                                          </div>
                                      </div>
                                  ) : (
                                      <button onClick={() => handleGenReply(comment)} className="text-blue-400 text-sm border border-blue-900 bg-blue-900/20 px-3 py-1 rounded">
                                          ✨ AI 擬答
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
