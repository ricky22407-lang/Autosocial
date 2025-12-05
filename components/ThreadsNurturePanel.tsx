

// #region Imports & Interfaces
import React, { useState, useEffect } from 'react';
import { BrandSettings, ThreadsAccount, UserProfile, TrendingTopic } from '../types';
import { generateCommentReply, getTrendingTopics, generateThreadsBatch } from '../services/geminiService';
import { publishThreadsPost, refreshThreadsToken, fetchUserThreads, fetchMediaReplies } from '../services/threadsService';
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

interface CommentData {
    id: string;
    text: string;
    username: string;
    timestamp: string;
    threadId: string;
    accountIndex: number; // which of our accounts owns the thread
}

type ImageMode = 'none' | 'manual' | 'ai_url' | 'stock_url' | 'source_url';
// #endregion

const ThreadsNurturePanel: React.FC<Props> = ({ settings, user, onSaveSettings, onQuotaUpdate }) => {
  // #region State
  const [activeTab, setActiveTab] = useState<'accounts' | 'interaction' | 'generator'>('accounts');
  const [accounts, setAccounts] = useState<ThreadsAccount[]>(settings.threadsAccounts || []);
  const [newAccount, setNewAccount] = useState({ id: '', username: '', token: '', personaPrompt: '' });
  
  // Generator State
  const [manualTopic, setManualTopic] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [genCount, setGenCount] = useState(3);
  
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [trendError, setTrendError] = useState('');

  // Interaction Center (Replies)
  const [comments, setComments] = useState<CommentData[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [generatedReplies, setGeneratedReplies] = useState<string[]>([]);
  const [draftReply, setDraftReply] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  // #endregion

  const getAccountLimit = () => {
      if (!user) return 0;
      if (user.role === 'admin' || user.role === 'business') return 20; 
      if (user.role === 'pro') return 3; 
      return 0; 
  };

  const accountLimit = getAccountLimit();
  const currentCount = accounts.length;
  const isLimitReached = currentCount >= accountLimit;

  // Sync settings when accounts change
  useEffect(() => {
    onSaveSettings({ ...settings, threadsAccounts: accounts });
  }, [accounts]);

  // Load trends when switching to generator
  useEffect(() => {
      if (activeTab === 'generator' && trendingTopics.length === 0) {
          loadTrends();
      }
  }, [activeTab]);

  const loadTrends = async () => {
      setLoadingTrends(true);
      setTrendError('');
      try {
          const industry = settings.industry || '台灣熱門時事';
          const trends = await getTrendingTopics(industry);
          setTrendingTopics(trends);
      } catch (e: any) {
          setTrendError(e.message);
      } finally {
          setLoadingTrends(false);
      }
  };

  const handleAddAccount = () => {
    if (isLimitReached) return alert(`限額已滿。`);
    if (newAccount.id && newAccount.token) {
      setAccounts([...accounts, { 
          ...newAccount, 
          username: newAccount.username || `User_${newAccount.id}`, 
          userId: newAccount.id, 
          isActive: true, 
          personaPrompt: newAccount.personaPrompt 
      } as any]);
      setNewAccount({ id: '', username: '', token: '', personaPrompt: '' });
    } else {
        alert("請輸入 Threads ID 與 Token");
    }
  };
  
  const handleRemoveAccount = (index: number) => { 
      if (confirm('確定移除此帳號嗎?')) setAccounts(accounts.filter((_, i) => i !== index)); 
  };
  
  const handleUpdatePersona = (index: number, newPersona: string) => { 
      const updated = [...accounts]; 
      updated[index].personaPrompt = newPersona; 
      setAccounts(updated); 
  };

  // --- Interaction / Reply Logic ---
  const handleScanComments = async () => {
      if (!user) return;
      if (accounts.length === 0) return alert("無帳號可掃描");
      setIsLoadingComments(true);
      setComments([]);

      const allComments: CommentData[] = [];

      try {
          for (let i = 0; i < accounts.length; i++) {
              const acc = accounts[i];
              if (!acc.isActive) continue;

              // 1. Get recent threads
              const threads = await fetchUserThreads(acc, 3); // Check last 3 posts
              
              for (const thread of threads) {
                  // 2. Get replies for each thread
                  const replies = await fetchMediaReplies(acc, thread.id);
                  
                  replies.forEach((r: any) => {
                      allComments.push({
                          id: r.id,
                          text: r.text || '[Image/Sticker]',
                          username: r.username || 'Netizen',
                          timestamp: r.timestamp,
                          threadId: thread.id,
                          accountIndex: i
                      });
                  });
              }
          }
          
          if (allComments.length === 0) {
             // If empty, notify user
          }

          setComments(allComments);
      } catch (e) {
          console.error(e);
          alert("掃描失敗，請檢查 Token 是否過期");
      } finally {
          setIsLoadingComments(false);
      }
  };

  const handleGenerateReply = async (comment: CommentData) => {
      setSelectedCommentId(comment.id);
      setGeneratedReplies([]);
      setDraftReply('');
      
      const acc = accounts[comment.accountIndex];
      const persona = acc.personaPrompt || settings.persona || 'Friendly';

      try {
          const replies = await generateCommentReply(comment.text, persona);
          setGeneratedReplies(replies);
      } catch (e) {
          console.error(e);
          alert("生成回覆失敗");
      }
  };

  const handleSendReply = async (comment: CommentData, text: string) => {
      if (!text) return;
      if (isReplying) return;
      setIsReplying(true);

      const acc = accounts[comment.accountIndex];
      
      const res = await publishThreadsPost(acc, text, undefined, comment.id);

      if (res.success) {
          alert("回覆發送成功！");
          setComments(prev => prev.filter(c => c.id !== comment.id)); // Remove from list
          setSelectedCommentId(null);
      } else {
          alert(`回覆失敗: ${res.error}`);
      }
      setIsReplying(false);
  };

  // --- Generator Handlers ---
  const toggleTopic = (title: string) => {
      if (selectedTopics.includes(title)) {
          setSelectedTopics(selectedTopics.filter(t => t !== title));
      } else {
          if (selectedTopics.length >= 3) return alert("最多選擇 3 個主題");
          setSelectedTopics([...selectedTopics, title]);
      }
  };

  const handleGenerateBatch = async () => {
      if (!user) return;
      if (selectedTopics.length === 0 && !manualTopic) return alert('請選擇或輸入主題');
      if (isGenerating) return;

      const cost = 2; // Fixed cost for batch gen
      const allowed = await checkAndUseQuota(user.user_id, cost);
      if (!allowed) return alert(`配額不足 (需 ${cost} 點)`);
      onQuotaUpdate();

      setIsGenerating(true);
      setGeneratedPosts([]);

      try {
         const finalTopic = selectedTopics.length > 0 ? selectedTopics.join(', ') : manualTopic;
         const personas = accounts.map(a => a.personaPrompt || '').filter(p => p);
         
         const results = await generateThreadsBatch(finalTopic, genCount, settings, personas);
         
         const posts: GeneratedPost[] = results.map((r, i) => ({
             id: Date.now() + i + '',
             topic: finalTopic,
             caption: r.caption,
             imagePrompt: r.imagePrompt,
             imageQuery: r.imageQuery,
             status: 'idle',
             targetAccountId: accounts[i % accounts.length]?.id, // Round robin assign
             imageSourceType: 'ai'
         }));

         setGeneratedPosts(posts);
      } catch(e: any) { 
          alert(`生成失敗: ${e.message}`);
      } finally { 
          setIsGenerating(false); 
      }
  };

  const generatePreviewImage = (post: GeneratedPost) => {
      // Helper to generate a preview URL based on source type
      const seed = Date.now();
      if (post.imageSourceType === 'ai') {
          return `https://image.pollinations.ai/prompt/${encodeURIComponent(post.imagePrompt)}?n=${seed}&model=flux`;
      } else if (post.imageSourceType === 'stock') {
          return `https://image.pollinations.ai/prompt/${encodeURIComponent(post.imageQuery + ', photorealistic, real photography')}?n=${seed}&model=flux`;
      }
      return '';
  };

  const handlePostUpdate = (id: string, field: keyof GeneratedPost, value: any) => {
      setGeneratedPosts(prev => prev.map(p => {
          if (p.id !== id) return p;
          const updated = { ...p, [field]: value };
          // If toggling source, update URL immediately for preview
          if (field === 'imageSourceType') {
              updated.imageUrl = generatePreviewImage(updated);
          }
          return updated;
      }));
  };

  const handlePublishPost = async (post: GeneratedPost) => {
      if (post.status === 'publishing' || post.status === 'done') return;
      
      const account = accounts.find(a => a.id === post.targetAccountId);
      if (!account) return alert("未指定帳號");

      handlePostUpdate(post.id, 'status', 'publishing');
      
      // Determine Image URL: Use preview URL if not set manual source
      const finalImageUrl = post.imageUrl || generatePreviewImage(post);

      const res = await publishThreadsPost(account, post.caption, finalImageUrl);
      
      if (res.success) {
          handlePostUpdate(post.id, 'status', 'done');
          handlePostUpdate(post.id, 'log', '發佈成功');
      } else {
          handlePostUpdate(post.id, 'status', 'failed');
          handlePostUpdate(post.id, 'log', res.error);
      }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 animate-fade-in pb-20">
      <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-white">🧵 Threads 養號農場</h2>
          <div className="text-xs text-gray-400">多帳號營運 • 智能回覆 • 批量生成</div>
      </div>

      <div className="flex border-b border-gray-700 mb-6 overflow-x-auto">
        <button onClick={() => setActiveTab('accounts')} className={`px-6 py-3 font-bold whitespace-nowrap ${activeTab === 'accounts' ? 'text-white border-b-2' : 'text-gray-500'}`}>👥 帳號管理</button>
        <button onClick={() => setActiveTab('interaction')} className={`px-6 py-3 font-bold whitespace-nowrap ${activeTab === 'interaction' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-500'}`}>💬 留言互動 (API)</button>
        <button onClick={() => setActiveTab('generator')} className={`px-6 py-3 font-bold whitespace-nowrap ${activeTab === 'generator' ? 'text-white border-b-2' : 'text-gray-500'}`}>🚀 內容生成</button>
      </div>

      {activeTab === 'accounts' && (
          <div className="space-y-6">
              {/* Add Account Card */}
              <div className="bg-card p-6 rounded-xl border border-gray-700">
                  <h3 className="font-bold text-white mb-4">新增帳號</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">Threads User ID</label>
                          <input value={newAccount.id} onChange={e => setNewAccount({...newAccount, id: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" placeholder="必填" />
                      </div>
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">Access Token</label>
                          <input value={newAccount.token} onChange={e => setNewAccount({...newAccount, token: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" placeholder="必填 (長期 Token)" />
                      </div>
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">顯示名稱 (選填)</label>
                          <input value={newAccount.username} onChange={e => setNewAccount({...newAccount, username: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" placeholder="方便辨識用" />
                      </div>
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">人設 Prompt (選填)</label>
                          <input value={newAccount.personaPrompt} onChange={e => setNewAccount({...newAccount, personaPrompt: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" placeholder="例如：厭世工程師、熱情小編" />
                      </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                      <button onClick={handleAddAccount} className="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded font-bold">
                          + 新增帳號
                      </button>
                  </div>
              </div>

              {/* Account List */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {accounts.map((acc, i) => (
                      <div key={i} className="bg-dark p-4 rounded border border-gray-600 relative">
                          <div className="flex items-center gap-2 mb-2">
                             <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold">{acc.username.charAt(0)}</div>
                             <div>
                                 <div className="font-bold text-white text-sm">{acc.username}</div>
                                 <div className="text-xs text-gray-500">ID: {acc.userId}</div>
                             </div>
                          </div>
                          
                          <div className="mt-2 text-xs">
                              <label className="text-gray-400">人設:</label>
                              <input 
                                  className="w-full bg-gray-800 border-none rounded px-2 py-1 mt-1 text-gray-200" 
                                  value={acc.personaPrompt || ''} 
                                  onChange={e => handleUpdatePersona(i, e.target.value)} 
                                  placeholder="Default" 
                              />
                          </div>
                          <button onClick={() => handleRemoveAccount(i)} className="text-red-400 text-xs absolute top-4 right-4 hover:underline">移除</button>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {activeTab === 'interaction' && (
          <div className="space-y-6">
              <div className="bg-card p-6 rounded-xl border border-gray-700">
                  <div className="flex justify-between items-center mb-6">
                      <div>
                          <h3 className="text-xl font-bold text-white">💬 留言互動中心 (Reply Bot)</h3>
                          <p className="text-sm text-gray-400">掃描「自己貼文」下的網友留言，並使用 AI 輔助回覆，提升演算法權重。</p>
                      </div>
                      <button 
                          onClick={handleScanComments} 
                          disabled={isLoadingComments}
                          className="bg-primary hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg disabled:opacity-50"
                      >
                          {isLoadingComments ? '掃描中...' : '🔄 掃描最新留言'}
                      </button>
                  </div>

                  {comments.length === 0 && !isLoadingComments ? (
                      <div className="text-center py-10 text-gray-500 bg-dark/30 rounded border border-dashed border-gray-700">
                          目前沒有未讀留言，或尚未進行掃描。
                      </div>
                  ) : (
                      <div className="grid grid-cols-1 gap-4">
                          {comments.map((comment) => (
                              <div key={comment.id} className="bg-dark p-4 rounded-lg border border-gray-600 flex flex-col md:flex-row gap-4">
                                  <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-2">
                                          <span className="font-bold text-white">@{comment.username}</span>
                                          <span className="text-xs text-gray-500">{new Date(comment.timestamp).toLocaleString()}</span>
                                          <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-300">
                                              in {accounts[comment.accountIndex]?.username}'s post
                                          </span>
                                      </div>
                                      <p className="text-gray-200 mb-3">{comment.text}</p>
                                      
                                      {/* Reply Area */}
                                      {selectedCommentId === comment.id ? (
                                          <div className="mt-3 bg-gray-800 p-3 rounded animate-fade-in">
                                              {generatedReplies.length > 0 ? (
                                                  <div className="space-y-2 mb-3">
                                                      <p className="text-xs text-blue-300 font-bold">AI 建議回覆 (點擊選用):</p>
                                                      {generatedReplies.map((rep, idx) => (
                                                          <div 
                                                            key={idx} 
                                                            onClick={() => setDraftReply(rep)}
                                                            className="p-2 bg-gray-700 hover:bg-gray-600 rounded cursor-pointer text-sm text-white transition-colors"
                                                          >
                                                              {rep}
                                                          </div>
                                                      ))}
                                                  </div>
                                              ) : (
                                                  <div className="text-center py-2 text-xs text-gray-500 animate-pulse">AI 正在思考三種不同風格的回覆...</div>
                                              )}
                                              
                                              <textarea 
                                                  value={draftReply}
                                                  onChange={e => setDraftReply(e.target.value)}
                                                  className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm mb-2"
                                                  placeholder="撰寫回覆..."
                                                  rows={2}
                                              />
                                              <div className="flex justify-end gap-2">
                                                  <button onClick={() => setSelectedCommentId(null)} className="text-gray-400 text-sm px-3 py-1">取消</button>
                                                  <button 
                                                      onClick={() => handleSendReply(comment, draftReply)}
                                                      disabled={!draftReply || isReplying}
                                                      className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1 rounded text-sm font-bold disabled:opacity-50"
                                                  >
                                                      {isReplying ? '發送中...' : '確認回覆'}
                                                  </button>
                                              </div>
                                          </div>
                                      ) : (
                                          <button 
                                              onClick={() => handleGenerateReply(comment)}
                                              className="text-sm text-blue-400 border border-blue-900 bg-blue-900/20 px-3 py-1 rounded hover:bg-blue-900/40"
                                          >
                                              ✨ AI 擬答
                                          </button>
                                      )}
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          </div>
      )}

      {activeTab === 'generator' && (
          <div className="space-y-8">
              {/* Setup Section */}
              <div className="bg-card p-6 rounded-xl border border-gray-700">
                  <h3 className="font-bold text-white mb-4">步驟 1: 選擇話題</h3>
                  
                  {loadingTrends ? <div className="text-sm text-gray-400 animate-pulse">正在載入熱門話題...</div> : (
                      <div className="flex flex-wrap gap-2 mb-4">
                          {trendingTopics.map((t, i) => (
                              <button 
                                key={i}
                                onClick={() => toggleTopic(t.title)}
                                className={`px-3 py-1 rounded-full text-sm border ${selectedTopics.includes(t.title) ? 'bg-primary border-primary text-white' : 'bg-transparent border-gray-600 text-gray-400 hover:border-gray-400'}`}
                              >
                                  {t.title}
                              </button>
                          ))}
                      </div>
                  )}
                  {trendError && <p className="text-red-400 text-xs mb-2">無法載入話題: {trendError}</p>}

                  <div className="flex gap-4 items-end">
                      <div className="flex-1">
                          <label className="block text-xs text-gray-400 mb-1">或輸入自訂主題</label>
                          <input 
                              value={manualTopic}
                              onChange={e => setManualTopic(e.target.value)}
                              className="w-full bg-dark border border-gray-600 rounded p-2 text-white"
                              placeholder="例如：辦公室下午茶推薦"
                          />
                      </div>
                      <div className="w-24">
                          <label className="block text-xs text-gray-400 mb-1">生成數量</label>
                          <select value={genCount} onChange={e => setGenCount(Number(e.target.value))} className="w-full bg-dark border border-gray-600 rounded p-2 text-white">
                              <option value="1">1 篇</option>
                              <option value="3">3 篇</option>
                              <option value="5">5 篇</option>
                          </select>
                      </div>
                      <button 
                        onClick={handleGenerateBatch}
                        disabled={isGenerating || (selectedTopics.length===0 && !manualTopic)}
                        className="bg-secondary hover:bg-indigo-600 text-white px-6 py-2 rounded font-bold h-[42px] disabled:opacity-50"
                      >
                          {isGenerating ? '生成中...' : '✨ 批量生成'}
                      </button>
                  </div>
              </div>

              {/* Results Section */}
              {generatedPosts.length > 0 && (
                  <div className="space-y-4">
                      <h3 className="font-bold text-white">步驟 2: 編輯與發佈</h3>
                      {generatedPosts.map((post) => (
                          <div key={post.id} className="bg-dark p-4 rounded border border-gray-600 flex flex-col md:flex-row gap-6">
                              {/* Left: Content */}
                              <div className="flex-1 space-y-3">
                                  <textarea 
                                      value={post.caption}
                                      onChange={e => handlePostUpdate(post.id, 'caption', e.target.value)}
                                      className="w-full h-32 bg-gray-800 border border-gray-700 rounded p-3 text-white text-sm resize-none focus:border-primary outline-none"
                                  />
                                  <div className="flex gap-4">
                                      <select 
                                          value={post.targetAccountId} 
                                          onChange={e => handlePostUpdate(post.id, 'targetAccountId', e.target.value)}
                                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                                      >
                                          <option value="">選擇發佈帳號...</option>
                                          {accounts.map(a => <option key={a.id} value={a.id}>{a.username}</option>)}
                                      </select>
                                      
                                      <select 
                                          value={post.imageSourceType} 
                                          onChange={e => handlePostUpdate(post.id, 'imageSourceType', e.target.value as any)}
                                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                                      >
                                          <option value="ai">🎨 AI 繪圖 (Abstract)</option>
                                          <option value="stock">📷 擬真圖庫 (Realistic)</option>
                                          <option value="none">❌ 純文字</option>
                                      </select>
                                  </div>
                              </div>
                              
                              {/* Right: Preview & Action */}
                              <div className="w-full md:w-64 flex flex-col gap-3">
                                  <div className="flex-1 bg-black rounded flex items-center justify-center overflow-hidden border border-gray-700 min-h-[160px]">
                                      {post.imageSourceType === 'none' ? (
                                          <span className="text-gray-500 text-xs">無圖片</span>
                                      ) : (
                                          <img 
                                              src={post.imageUrl || generatePreviewImage(post)} 
                                              alt="Preview" 
                                              className="w-full h-full object-cover" 
                                              onError={(e) => (e.currentTarget.style.display = 'none')}
                                          />
                                      )}
                                  </div>
                                  
                                  {post.status === 'done' ? (
                                      <div className="bg-green-900/50 text-green-400 text-center py-2 rounded text-sm font-bold border border-green-700">
                                          ✅ 已發佈
                                      </div>
                                  ) : (
                                      <button 
                                          onClick={() => handlePublishPost(post)}
                                          disabled={post.status === 'publishing'}
                                          className={`w-full py-2 rounded text-sm font-bold text-white transition-colors ${post.status === 'failed' ? 'bg-red-600' : 'bg-primary hover:bg-blue-600'}`}
                                      >
                                          {post.status === 'publishing' ? '發佈中...' : post.status === 'failed' ? '重試發佈' : '🚀 發佈貼文'}
                                      </button>
                                  )}
                                  {post.log && <p className="text-[10px] text-gray-500 text-center">{post.log}</p>}
                              </div>
                          </div>
                      ))}
                  </div>
              )}
          </div>
      )}
    </div>
  );
};

export default ThreadsNurturePanel;