
// #region Imports & Interfaces
import React, { useState, useEffect } from 'react';
import { BrandSettings, ThreadsAccount, UserProfile, TrendingTopic } from '../types';
import { generateThreadsBatch, getTrendingTopics } from '../services/geminiService';
import { publishThreadsPost, refreshThreadsToken } from '../services/threadsService';
import { checkAndUseQuota } from '../services/authService';

interface Props {
  settings: BrandSettings;
  user: UserProfile | null;
  onSaveSettings: (settings: BrandSettings) => void;
  onQuotaUpdate: () => void;
}

interface GeneratedPost {
  id: string;
  topic: string; 
  caption: string;
  imagePrompt: string;
  imageQuery: string;
  imageUrl?: string;
  targetAccountId?: string;
  status: 'idle' | 'publishing' | 'done' | 'failed';
  log?: string;
  imageSourceType?: 'ai' | 'stock' | 'source_url'; 
  isImageLoading?: boolean; 
}

type ImageMode = 'none' | 'manual' | 'ai_url' | 'stock_url' | 'source_url';
// #endregion

const ThreadsNurturePanel: React.FC<Props> = ({ settings, user, onSaveSettings, onQuotaUpdate }) => {
  // #region State: Account Management
  const [activeTab, setActiveTab] = useState<'accounts' | 'generator'>('accounts');
  const [accounts, setAccounts] = useState<ThreadsAccount[]>(settings.threadsAccounts || []);
  const [newAccount, setNewAccount] = useState({ id: '', username: '', token: '', personaPrompt: '' });
  // #endregion

  // #region State: Content Generator
  const [manualTopic, setManualTopic] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [postCount, setPostCount] = useState(1); // 1, 2, 3
  const [imageMode, setImageMode] = useState<ImageMode>('ai_url');
  
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  // #endregion

  // #region Business Logic: Account Limits
  const getAccountLimit = () => {
      if (!user) return 0;
      if (user.role === 'admin' || user.role === 'business') return 20; // Enterprise/Agency (Business)
      if (user.role === 'pro') return 3; // Pro Creator
      return 0; // Free/Starter user shouldn't be here (Blocked by App.tsx)
  };

  const accountLimit = getAccountLimit();
  const currentCount = accounts.length;
  const isLimitReached = currentCount >= accountLimit;

  // Auto-save settings when accounts change
  useEffect(() => {
    onSaveSettings({ ...settings, threadsAccounts: accounts });
  }, [accounts]);
  // #endregion

  // #region Handlers: Account Actions
  const handleAddAccount = () => {
    if (isLimitReached) {
        alert(`⚠️ 您的方案 (${user?.role}) 最多只能綁定 ${accountLimit} 個帳號。\n請升級至 Business (企業版) 方案以解鎖更多帳號額度。`);
        return;
    }

    if (newAccount.id && newAccount.token) {
      setAccounts([...accounts, { 
          ...newAccount, 
          username: newAccount.username || `User_${newAccount.id.slice(-4)}`,
          userId: newAccount.id, 
          isActive: true,
          personaPrompt: newAccount.personaPrompt
      } as any]);
      setNewAccount({ id: '', username: '', token: '', personaPrompt: '' });
    }
  };

  const handleRemoveAccount = (index: number) => {
    if (confirm('確定刪除此帳號嗎？')) {
      setAccounts(accounts.filter((_, i) => i !== index));
    }
  };

  const handleUpdatePersona = (index: number, newPersona: string) => {
      const updated = [...accounts];
      updated[index].personaPrompt = newPersona;
      setAccounts(updated);
  };

  const handleRefreshToken = async (index: number) => {
      const acc = accounts[index];
      if (!acc.token) return;
      
      const res = await refreshThreadsToken(acc.token);
      if (res.success && res.newToken) {
          const updated = [...accounts];
          updated[index].token = res.newToken;
          setAccounts(updated);
          alert(`帳號 ${acc.username} Token 延長成功！`);
      } else {
          alert(`延長失敗: ${res.error}`);
      }
  };
  // #endregion

  // #region Handlers: Topics & Trends
  const loadTrending = async () => {
    if (!user || loadingTrends) return;
    
    // Check Quota for Trend Refresh (1 Point)
    const allowed = await checkAndUseQuota(user.user_id, 1);
    if (!allowed) {
        alert("⚠️ 配額不足，無法刷新趨勢。");
        return;
    }
    onQuotaUpdate();

    setLoadingTrends(true);
    try {
        const seedKeyword = manualTopic.trim() || settings.industry || '台灣熱門時事';
        const topics = await getTrendingTopics(seedKeyword, Date.now());
        setTrendingTopics(topics);
    } catch (e) {
        console.error(e);
    } finally {
        setLoadingTrends(false);
    }
  };

  const toggleTopic = (title: string) => {
      if (selectedTopics.includes(title)) {
          setSelectedTopics(selectedTopics.filter(t => t !== title));
      } else {
          setSelectedTopics([...selectedTopics, title]);
      }
  };
  // #endregion

  // #region Handlers: Batch Generation
  // Helper to calculate quota cost based on user selection
  const calculateCost = () => {
      if (imageMode === 'ai_url') return 3;
      if (imageMode === 'source_url' || imageMode === 'stock_url') return 2;
      return 1; // manual or none
  };

  const generateImageUrl = (prompt: string, query: string, type: 'ai' | 'stock', seed: number): string => {
      // Encode strict
      if (type === 'ai') {
          // AI Mode: Artistic, Creative, Illustration style
          const encodedPrompt = encodeURIComponent(prompt || query);
          // Use standard flux model
          return `https://image.pollinations.ai/prompt/${encodedPrompt}?n=${seed}&model=flux`;
      } else {
          // Stock Mode (New): Use Pollinations with "Photorealism" prompt to simulate Stock Photos
          // Added strong camera specs: Canon EOS R5, f/1.8, bokeh, etc.
          const stockPrompt = `${query}, photorealistic, 4k, highly detailed, real photography, cinematic lighting, Canon EOS R5, f/1.8, depth of field, natural colors`;
          const encodedPrompt = encodeURIComponent(stockPrompt);
          return `https://image.pollinations.ai/prompt/${encodedPrompt}?n=${seed}&model=flux`;
      }
  };

  const handleGenerateBatch = async () => {
    let topicsToProcess = [...selectedTopics];
    if (topicsToProcess.length === 0 && manualTopic.trim()) {
        topicsToProcess.push(manualTopic.trim());
    }

    if (topicsToProcess.length === 0) return alert('請至少輸入一個主題或選擇熱門話題');
    if (!user) return alert('請先登入');
    if (accounts.length === 0) return alert('請先新增至少一個 Threads 帳號');
    if (isGenerating) return;

    setIsGenerating(true);
    setGeneratedPosts([]); 

    const allNewPosts: GeneratedPost[] = [];
    const activePersonas = accounts
        .map(a => a.personaPrompt)
        .filter(p => p && p.trim().length > 0) as string[];
    
    // Dynamic Cost Calculation
    const costPerTopic = calculateCost();

    try {
      for (const t of topicsToProcess) {
          const allowed = await checkAndUseQuota(user.user_id, costPerTopic);
          if (!allowed) {
              alert(`配額不足 (需要 ${costPerTopic} 點)，已停止於主題: ${t}`);
              break;
          }
          onQuotaUpdate();

          // Pass personas to the service
          const posts = await generateThreadsBatch(t, postCount, settings, activePersonas);
          
          // Find if this topic has a source image available in trending list
          const trendingSource = trendingTopics.find(tt => tt.title === t);
          const sourceImageUrl = trendingSource?.imageUrl;

          posts.forEach((p, idx) => {
             const targetAcc = accounts[allNewPosts.length % accounts.length];
             const timestamp = Date.now() + allNewPosts.length + idx;
             
             let finalImageUrl = undefined;
             let finalSourceType: 'ai' | 'stock' | 'source_url' = 'stock';

             // Image Strategy Logic
             if (imageMode === 'source_url') {
                 if (sourceImageUrl) {
                     finalImageUrl = sourceImageUrl;
                     finalSourceType = 'source_url';
                 } else {
                     // Fallback to Stock (AI Photorealism) if source image missing
                     // Auto Upgrade: User paid 2 points, gets AI fallback (which is better) for free
                     finalSourceType = 'stock';
                     finalImageUrl = generateImageUrl(p.imagePrompt, p.imageQuery, 'stock', timestamp);
                 }
             } else if (imageMode === 'ai_url') {
                finalSourceType = 'ai';
                finalImageUrl = generateImageUrl(p.imagePrompt, p.imageQuery, 'ai', timestamp);
             } else if (imageMode === 'stock_url') {
                finalSourceType = 'stock';
                finalImageUrl = generateImageUrl(p.imagePrompt, p.imageQuery, 'stock', timestamp);
             }

             allNewPosts.push({
                 ...p,
                 topic: t,
                 status: 'idle',
                 targetAccountId: targetAcc.id,
                 imageUrl: finalImageUrl,
                 imageSourceType: finalSourceType,
                 isImageLoading: !!finalImageUrl 
             });
          });
      }

      setGeneratedPosts(allNewPosts);
      setActiveTab('generator');
    } catch (e: any) {
      alert(`生成失敗: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };
  // #endregion

  // #region Handlers: Post Edits & Publishing
  const handleUpdatePost = (index: number, updates: Partial<GeneratedPost>) => {
      const updated = [...generatedPosts];
      if (updates.imageUrl && updates.imageUrl !== updated[index].imageUrl) {
          updates.isImageLoading = true;
      }
      updated[index] = { ...updated[index], ...updates };
      setGeneratedPosts(updated);
  };

  const handleImageLoad = (index: number) => {
      const updated = [...generatedPosts];
      updated[index].isImageLoading = false;
      setGeneratedPosts(updated);
  };

  const handleImageError = (index: number) => {
      const post = generatedPosts[index];
      // If image fails to load (404/403), auto-upgrade to Stock Mode
      // Only retry if it wasn't already a manual failure to avoid infinite loops
      if (post.imageUrl && !post.imageUrl.includes('placehold.co')) {
          console.warn(`[Image Rescue] Image failed for post ${index}. Upgrading to AI Stock...`);
          
          const newSeed = Date.now() + Math.random();
          // Force switch to 'stock' type logic using Pollinations
          const newUrl = generateImageUrl(post.imagePrompt, post.imageQuery, 'stock', newSeed);
          
          handleUpdatePost(index, {
              imageUrl: newUrl,
              imageSourceType: 'stock',
              isImageLoading: true,
              log: '⚠️ 原圖失效，已自動替換為 AI 擬真圖'
          });
      } else {
          // If even fallback fails, show placeholder
          handleUpdatePost(index, { isImageLoading: false });
      }
  };

  const handleRefreshImage = (index: number) => {
      const post = generatedPosts[index];
      const newSeed = Date.now() + Math.random();
      
      // Toggle between AI (Artistic) and Stock (Realism), ignoring Source URL for manual refresh
      const newType = post.imageSourceType === 'ai' ? 'stock' : 'ai';
      const newUrl = generateImageUrl(post.imagePrompt, post.imageQuery, newType, newSeed);
      
      handleUpdatePost(index, { 
          imageUrl: newUrl,
          imageSourceType: newType,
          isImageLoading: true,
          log: undefined // Clear logs
      });
  };

  const handleQueryChange = (index: number, newQuery: string) => {
      const post = generatedPosts[index];
      const newSeed = Date.now();
      // Keep current type unless it was source_url, then force stock
      const typeToUse = post.imageSourceType === 'source_url' ? 'stock' : (post.imageSourceType || 'stock');
      const newUrl = generateImageUrl(post.imagePrompt, newQuery, typeToUse, newSeed);
      
      handleUpdatePost(index, {
          imageQuery: newQuery,
          imageUrl: newUrl,
          imageSourceType: typeToUse,
          isImageLoading: true,
          log: undefined 
      });
  };

  const handlePublishSingle = async (index: number) => {
      const post = generatedPosts[index];
      if (post.status === 'publishing' || post.status === 'done') return;

      const updated = [...generatedPosts];
      updated[index].status = 'publishing';
      setGeneratedPosts(updated);

      const targetAccount = accounts.find(a => a.id === post.targetAccountId);
      if (!targetAccount) {
          updated[index].status = 'failed';
          updated[index].log = '找不到指定帳號';
          setGeneratedPosts([...updated]);
          return;
      }

      const res = await publishThreadsPost(targetAccount, post.caption, post.imageUrl);
      
      const finalUpdated = [...generatedPosts]; 
      if (res.success) {
          finalUpdated[index].status = 'done';
          finalUpdated[index].log = `Published ID: ${res.id}`;
      } else {
          finalUpdated[index].status = 'failed';
          finalUpdated[index].log = res.error;
      }
      setGeneratedPosts(finalUpdated);
  };

  const handlePublishAll = async () => {
    const postsToPublish = generatedPosts.filter(p => p.status === 'idle' || p.status === 'failed');
    if (postsToPublish.length === 0) return alert("沒有待發佈的貼文");

    if (!confirm(`即將發佈 ${postsToPublish.length} 篇貼文到 Threads，確定嗎？`)) return;

    for (let i = 0; i < generatedPosts.length; i++) {
        if (generatedPosts[i].status === 'idle' || generatedPosts[i].status === 'failed') {
            await handlePublishSingle(i);
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    alert("批量發佈流程結束");
  };
  // #endregion

  // #region Render UI
  return (
    <div className="max-w-6xl mx-auto p-4 animate-fade-in pb-20">
      <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-white">🧵 Threads 養號農場 V2.5</h2>
          <div className="text-xs text-gray-400">全域趨勢快取 • 智慧配圖系統 • 多帳號營運</div>
      </div>

      <div className="flex border-b border-gray-700 mb-6">
        <button 
          onClick={() => setActiveTab('accounts')}
          className={`px-6 py-3 font-bold transition-colors ${activeTab === 'accounts' ? 'text-white border-b-2 border-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
          👥 帳號管理 ({accounts.length}/{accountLimit})
        </button>
        <button 
          onClick={() => setActiveTab('generator')}
          className={`px-6 py-3 font-bold transition-colors ${activeTab === 'generator' ? 'text-white border-b-2 border-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
          🚀 批量生成器
        </button>
      </div>

      {/* --- Tab: Accounts --- */}
      {activeTab === 'accounts' && (
          <div className="space-y-6">
              <div className="bg-card p-6 rounded-xl border border-gray-700">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-white">新增 Threads 帳號</h3>
                      <span className={`text-xs px-2 py-1 rounded font-bold ${isLimitReached ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'}`}>
                          {user?.role === 'pro' ? 'Pro 方案 (限3個)' : user?.role === 'business' ? 'Business 方案 (限20個)' : 'Admin'} : 已綁定 {currentCount} / {accountLimit}
                      </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <input 
                        value={newAccount.username}
                        onChange={e => setNewAccount({...newAccount, username: e.target.value})}
                        placeholder="帳號名稱 (方便識別用)"
                        className="bg-dark border border-gray-600 rounded p-2 text-white"
                        disabled={isLimitReached}
                      />
                      <input 
                        value={newAccount.id}
                        onChange={e => setNewAccount({...newAccount, id: e.target.value})}
                        placeholder="Threads User ID (數字)"
                        className="bg-dark border border-gray-600 rounded p-2 text-white"
                        disabled={isLimitReached}
                      />
                      <input 
                        value={newAccount.token}
                        onChange={e => setNewAccount({...newAccount, token: e.target.value})}
                        placeholder="Long-lived Access Token"
                        className="md:col-span-2 bg-dark border border-gray-600 rounded p-2 text-white"
                        disabled={isLimitReached}
                      />
                      <textarea
                        value={newAccount.personaPrompt}
                        onChange={e => setNewAccount({...newAccount, personaPrompt: e.target.value})}
                        placeholder="人設 Prompt (例如：你是個毒舌評論家...)"
                        rows={2}
                        className="md:col-span-2 bg-dark border border-gray-600 rounded p-2 text-white text-sm"
                        disabled={isLimitReached}
                      />
                  </div>
                  {isLimitReached ? (
                       <div className="bg-yellow-900/30 border border-yellow-600 text-yellow-200 p-3 rounded text-sm text-center">
                           ⚠️ 已達方案帳號上限。如需管理更多帳號 (Agency 模式)，請聯繫管理員升級至 Business (企業版) 方案。
                       </div>
                  ) : (
                      <button onClick={handleAddAccount} disabled={!newAccount.id || !newAccount.token} className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded font-bold disabled:opacity-50">
                          ＋ 新增帳號
                      </button>
                  )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {accounts.map((acc, i) => (
                      <div key={i} className="bg-card p-4 rounded-lg border border-gray-700 relative group">
                          <button onClick={() => handleRemoveAccount(i)} className="absolute top-2 right-2 text-red-400 hover:text-white z-10">×</button>
                          
                          <div className="mb-2">
                             <div className="flex items-center gap-2">
                                <h4 className="font-bold text-white text-lg">{acc.username}</h4>
                                <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                                   <input type="checkbox" checked={acc.isActive} onChange={() => {
                                      const updated = [...accounts];
                                      updated[i].isActive = !updated[i].isActive;
                                      setAccounts(updated);
                                   }} />
                                   {acc.isActive ? '活躍' : '暫停'}
                                </label>
                             </div>
                             <p className="text-xs text-gray-500">ID: {acc.userId}</p>
                             <p className="text-xs text-gray-400 truncate">Token: {acc.token.slice(0, 10)}...</p>
                          </div>

                          <div className="relative">
                              <label className="text-[10px] text-gray-400 block mb-1">人設 (Persona) - 可編輯:</label>
                              <textarea 
                                value={acc.personaPrompt || ''}
                                onChange={(e) => handleUpdatePersona(i, e.target.value)}
                                className="w-full bg-dark/50 border border-gray-600 rounded p-2 text-xs text-yellow-500 focus:border-yellow-500 outline-none resize-none h-16"
                                placeholder="未設定人設"
                              />
                          </div>
                          
                          <button 
                             onClick={() => handleRefreshToken(i)} 
                             className="mt-2 w-full text-xs border border-green-600 text-green-400 hover:bg-green-900/30 py-1 rounded"
                          >
                             🔄 延長 Token 效期
                          </button>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* --- Tab: Generator --- */}
      {activeTab === 'generator' && (
          <div className="space-y-8">
              <div className="bg-card p-6 rounded-xl border border-gray-700">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                          <label className="block text-sm text-gray-400 font-bold">1. 選擇或輸入話題</label>
                          <div className="flex gap-2">
                              <input 
                                value={manualTopic}
                                onChange={e => setManualTopic(e.target.value)}
                                placeholder="輸入自訂主題..."
                                className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white focus:ring-2 ring-primary outline-none"
                              />
                              <button 
                                onClick={loadTrending} 
                                disabled={loadingTrends} 
                                className="bg-secondary px-4 py-2 rounded text-white text-sm hover:bg-indigo-600 flex items-center gap-2 disabled:opacity-70"
                              >
                                  {loadingTrends ? <div className="loader w-3 h-3"></div> : null}
                                  {loadingTrends ? '搜尋中...' : '刷新趨勢 (扣1點)'}
                              </button>
                          </div>
                          
                          {selectedTopics.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                  {selectedTopics.map(t => (
                                      <span key={t} className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1">
                                          {t} <button onClick={() => toggleTopic(t)} className="hover:text-red-200">×</button>
                                      </span>
                                  ))}
                              </div>
                          )}

                          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                              {trendingTopics.map((t, i) => (
                                  <button 
                                    key={i} 
                                    onClick={() => toggleTopic(t.title)}
                                    className={`px-3 py-1 rounded-full text-xs border transition-colors flex flex-col items-start ${selectedTopics.includes(t.title) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-gray-300 hover:border-white'}`}
                                  >
                                      <span>{t.title}</span>
                                      {t.imageUrl && <span className="text-[9px] bg-green-900/50 px-1 rounded mt-0.5 text-green-300">🖼️ 有圖</span>}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div className="space-y-4">
                          <label className="block text-sm text-gray-400 font-bold">2. 生成參數設定</label>
                          
                          <div>
                              <div className="flex justify-between mb-1">
                                  <span className="text-xs text-gray-400">每個主題生成篇數 (Max 3)</span>
                                  <span className="text-xs text-white font-bold">{postCount} 篇</span>
                              </div>
                              <input 
                                type="range" min="1" max="3" step="1"
                                value={postCount}
                                onChange={e => setPostCount(parseInt(e.target.value))}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                              />
                              <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                                  <span>1</span><span>2</span><span>3</span>
                              </div>
                          </div>

                          <div>
                              <label className="block text-xs text-gray-400 mb-1">圖片來源模式與成本</label>
                              <select 
                                value={imageMode} 
                                onChange={e => setImageMode(e.target.value as ImageMode)}
                                className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm"
                              >
                                  <option value="ai_url">🎨 AI 繪圖 (創意/插畫) - 扣 3 點</option>
                                  <option value="stock_url">📷 擬真攝影 (AI取代圖庫) - 扣 2 點</option>
                                  <option value="source_url">📰 新聞原圖 (若無自動轉擬真) - 扣 2 點</option>
                                  <option value="manual">✍️ 手動輸入網址 - 扣 1 點</option>
                                  <option value="none">❌ 純文字 (無圖片) - 扣 1 點</option>
                              </select>
                              <p className="text-[10px] text-gray-500 mt-1">
                                  {imageMode === 'stock_url' && "使用 AI 生成高畫質擬真照片，解決圖庫重複問題。"}
                                  {imageMode === 'source_url' && "優先抓取新聞原圖，失敗則自動升級為擬真攝影 (不補扣點)。"}
                              </p>
                          </div>

                          <button 
                             onClick={handleGenerateBatch} 
                             disabled={isGenerating} 
                             className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white py-3 rounded font-bold shadow-lg transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                          >
                             {isGenerating ? <div className="loader"></div> : null}
                             {isGenerating ? 'AI 正在批量寫作中...' : `🚀 開始生成 (預計每主題扣 ${calculateCost()} 點)`}
                          </button>
                      </div>
                  </div>
              </div>

              {generatedPosts.length > 0 && (
                  <div>
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="text-xl font-bold text-white">📝 生成結果預覽 ({generatedPosts.length})</h3>
                          <button onClick={handlePublishAll} className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded font-bold shadow-lg">
                              ⚡ 全部發佈
                          </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {generatedPosts.map((post, i) => (
                              <div key={i} className={`bg-card rounded-xl border relative overflow-hidden flex flex-col ${post.status === 'done' ? 'border-green-600 opacity-75' : post.status === 'failed' ? 'border-red-600' : 'border-gray-700'}`}>
                                  {post.status === 'publishing' && <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10"><span className="text-white font-bold animate-pulse">發佈中...</span></div>}
                                  
                                  <div className="p-3 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
                                      <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300 truncate max-w-[120px]" title={post.topic}>{post.topic}</span>
                                      <select 
                                          value={post.targetAccountId} 
                                          onChange={e => handleUpdatePost(i, { targetAccountId: e.target.value })}
                                          className="bg-dark text-white text-xs border border-gray-600 rounded px-1 py-1 w-[120px]"
                                      >
                                          {accounts.map(a => <option key={a.id} value={a.id}>{a.username}</option>)}
                                      </select>
                                  </div>

                                  <div className="p-4 flex-1 space-y-3">
                                      <textarea 
                                          value={post.caption}
                                          onChange={e => handleUpdatePost(i, { caption: e.target.value })}
                                          className="w-full h-32 bg-dark border border-gray-600 rounded p-2 text-sm text-white resize-none"
                                      />

                                      {imageMode !== 'none' && (
                                          <div>
                                              <div className="flex flex-col gap-2 mb-2">
                                                 <div className="flex gap-1 items-center">
                                                    <input 
                                                        value={post.imageQuery || ''}
                                                        onChange={e => handleQueryChange(i, e.target.value)}
                                                        placeholder="搜尋關鍵字"
                                                        className="flex-1 bg-dark border border-gray-600 rounded px-2 py-1 text-xs text-gray-300"
                                                    />
                                                    <button 
                                                        onClick={() => handleRefreshImage(i)}
                                                        disabled={post.isImageLoading}
                                                        className={`px-2 py-1 rounded text-xs border whitespace-nowrap transition-all flex items-center gap-1 ${
                                                            post.isImageLoading ? 'bg-gray-800 text-gray-500' : 'bg-gray-700 text-white'
                                                        }`}
                                                    >
                                                        {post.isImageLoading ? <div className="loader w-3 h-3 border-2"></div> : '🔄'} {post.isImageLoading ? '' : (post.imageSourceType === 'stock' ? '擬真' : 'AI')}
                                                    </button>
                                                 </div>
                                                 <input 
                                                    value={post.imageUrl || ''}
                                                    onChange={e => handleUpdatePost(i, { imageUrl: e.target.value })}
                                                    placeholder="圖片 URL"
                                                    className="w-full bg-dark border border-gray-600 rounded px-2 py-1 text-xs text-gray-500"
                                                 />
                                              </div>
                                              
                                              <div className="h-48 bg-black/50 rounded flex items-center justify-center overflow-hidden border border-gray-700 relative group">
                                                  {post.imageUrl ? (
                                                      <img 
                                                        src={post.imageUrl} 
                                                        className={`w-full h-full object-cover transition-opacity duration-300 ${post.isImageLoading ? 'opacity-30' : 'opacity-100'}`}
                                                        onLoad={() => handleImageLoad(i)}
                                                        referrerPolicy="no-referrer"
                                                        onError={() => handleImageError(i)}
                                                      />
                                                  ) : (
                                                      <span className="text-xs text-gray-500">無圖片</span>
                                                  )}
                                                  {post.isImageLoading && (
                                                      <div className="absolute inset-0 flex items-center justify-center">
                                                          <div className="loader border-primary border-t-transparent w-6 h-6"></div>
                                                      </div>
                                                  )}
                                              </div>
                                          </div>
                                      )}

                                      {post.log && (
                                          <div className={`text-[10px] p-2 rounded ${post.status === 'done' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                                              {post.log}
                                          </div>
                                      )}
                                  </div>

                                  <div className="p-3 border-t border-gray-700 bg-gray-800 flex justify-end gap-2">
                                      <button 
                                        onClick={() => handlePublishSingle(i)}
                                        disabled={post.status === 'done' || post.status === 'publishing'}
                                        className={`flex-1 py-2 rounded text-sm font-bold transition-colors flex justify-center items-center gap-2 ${post.status === 'done' ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-70'}`}
                                      >
                                          {post.status === 'publishing' ? <div className="loader w-3 h-3"></div> : null}
                                          {post.status === 'done' ? '已發佈' : post.status === 'publishing' ? '發佈中...' : '發佈此篇'}
                                      </button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
          </div>
      )}
      {/* #endregion */}
    </div>
  );
};

export default ThreadsNurturePanel;