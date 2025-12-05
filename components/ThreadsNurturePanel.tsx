

import React, { useState, useEffect } from 'react';
import { BrandSettings, ThreadsAccount, UserProfile, TrendingTopic } from '../types';
import { generateCommentReply, getTrendingTopics, generateThreadsBatch } from '../services/geminiService';
import { publishThreadsPost, fetchUserThreads, fetchMediaReplies } from '../services/threadsService';
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
  // FIX: Explicitly include 'none' to match code logic
  imageSourceType: 'ai' | 'stock' | 'source_url' | 'none';
}

interface CommentData {
    id: string;
    text: string;
    username: string;
    timestamp: string;
    threadId: string;
    accountIndex: number;
}

const ThreadsNurturePanel: React.FC<Props> = ({ settings, user, onSaveSettings, onQuotaUpdate }) => {
  // #region State
  const [activeTab, setActiveTab] = useState<'accounts' | 'interaction' | 'generator'>('accounts');
  
  // Accounts
  const [accounts, setAccounts] = useState<ThreadsAccount[]>(settings.threadsAccounts || []);
  const [newAccountInput, setNewAccountInput] = useState({ 
      userIdInput: '', // The Threads User ID user types in
      token: '', 
      username: '', 
      personaPrompt: '' 
  });
  
  // Generator
  const [manualTopic, setManualTopic] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [genCount, setGenCount] = useState(3);
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
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

      // Check limits
      const limit = user?.role === 'business' || user?.role === 'admin' ? 20 : (user?.role === 'pro' ? 5 : 0);
      if (accounts.length >= limit) {
          alert(`您的方案最多只能新增 ${limit} 個帳號。`);
          return;
      }

      const newAccount: ThreadsAccount = {
          id: Date.now().toString(), // Internal unique ID
          userId: userIdInput.trim(), // Actual Threads UID
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
  const toggleTopic = (title: string) => {
      if (selectedTopics.includes(title)) {
          setSelectedTopics(selectedTopics.filter(t => t !== title));
      } else {
          if (selectedTopics.length >= 3) return;
          setSelectedTopics([...selectedTopics, title]);
      }
  };

  const handleGenerateBatch = async () => {
      if (!user) return alert("請先登入");
      const topicSource = selectedTopics.length > 0 ? selectedTopics.join('、') : manualTopic;
      if (!topicSource) return alert("請選擇或輸入話題");

      // Quota check
      const COST = 2;
      const allowed = await checkAndUseQuota(user.user_id, COST);
      if (!allowed) return alert(`配額不足 (需 ${COST} 點)`);
      onQuotaUpdate();

      setIsGenerating(true);
      setGeneratedPosts([]);

      try {
          // Collect Personas
          const activeAccounts = accounts.filter(a => a.isActive);
          if (activeAccounts.length === 0) throw new Error("無活躍帳號，請先啟用或新增帳號");
          
          const personas = activeAccounts.map(a => a.personaPrompt || '').filter(Boolean);
          const results = await generateThreadsBatch(topicSource, genCount, settings, personas);

          const newPosts: GeneratedPost[] = results.map((r, i) => ({
              id: Date.now() + '_' + i,
              topic: topicSource,
              caption: r.caption,
              imagePrompt: r.imagePrompt,
              imageQuery: r.imageQuery,
              imageSourceType: 'ai',
              status: 'idle',
              // Round-robin assign to active accounts
              targetAccountId: activeAccounts[i % activeAccounts.length]?.id
          }));

          setGeneratedPosts(newPosts);
      } catch (e: any) {
          alert(`生成失敗: ${e.message}`);
      } finally {
          setIsGenerating(false);
      }
  };

  const getPreviewUrl = (post: GeneratedPost) => {
      if (post.imageUrl) return post.imageUrl;
      if (post.imageSourceType === 'none') return '';
      
      const seed = post.id; // stable seed
      let prompt = post.imagePrompt;
      if (post.imageSourceType === 'stock') {
          prompt = `${post.imageQuery}, photorealistic, real life photography, 4k`;
      }
      return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?n=${seed}&model=flux`;
  };

  const handlePublish = async (post: GeneratedPost) => {
      const acc = accounts.find(a => a.id === post.targetAccountId);
      if (!acc) return alert("找不到指定發佈的帳號");

      setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'publishing' } : p));

      const imgUrl = post.imageSourceType === 'none' ? undefined : getPreviewUrl(post);
      
      const res = await publishThreadsPost(acc, post.caption, imgUrl);

      setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { 
          ...p, 
          status: res.success ? 'done' : 'failed',
          log: res.success ? '發佈成功' : res.error 
      } : p));
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
              
              const threads = await fetchUserThreads(acc, 3); // last 3 posts
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

      {/* VIEW: GENERATOR */}
      {activeTab === 'generator' && (
          <div className="space-y-8">
              <div className="bg-card p-6 rounded-xl border border-gray-700">
                  <h3 className="font-bold text-white mb-4">步驟 1: 選擇話題</h3>
                  
                  {loadingTrends ? (
                      <div className="text-sm text-gray-400 animate-pulse">正在載入熱門話題...</div>
                  ) : (
                      <div className="flex flex-wrap gap-2 mb-4">
                          {trendingTopics.map((t, i) => (
                              <button 
                                key={i}
                                onClick={() => toggleTopic(t.title)}
                                className={`px-3 py-1 rounded-full text-sm border transition-colors ${selectedTopics.includes(t.title) ? 'bg-primary border-primary text-white' : 'bg-transparent border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white'}`}
                              >
                                  {t.title}
                              </button>
                          ))}
                      </div>
                  )}
                  {trendError && <p className="text-yellow-500 text-xs mb-4">⚠️ {trendError}</p>}

                  <div className="flex flex-col md:flex-row gap-4 items-end">
                      <div className="flex-1 w-full">
                          <label className="block text-xs text-gray-400 mb-1">自訂主題</label>
                          <input 
                              value={manualTopic}
                              onChange={e => setManualTopic(e.target.value)}
                              className="w-full bg-dark border border-gray-600 rounded p-2 text-white focus:border-primary outline-none"
                              placeholder="例如：台北咖啡廳推薦"
                          />
                      </div>
                      <div className="w-full md:w-32">
                          <label className="block text-xs text-gray-400 mb-1">數量</label>
                          <select value={genCount} onChange={e => setGenCount(Number(e.target.value))} className="w-full bg-dark border border-gray-600 rounded p-2 text-white">
                              <option value="1">1 篇</option>
                              <option value="3">3 篇</option>
                              <option value="5">5 篇</option>
                          </select>
                      </div>
                      <button 
                        onClick={handleGenerateBatch}
                        disabled={isGenerating || (selectedTopics.length === 0 && !manualTopic)}
                        className="w-full md:w-auto bg-secondary hover:bg-indigo-600 text-white px-6 py-2 rounded font-bold h-[42px] disabled:opacity-50 transition-colors"
                      >
                          {isGenerating ? '生成中...' : '✨ 批量生成'}
                      </button>
                  </div>
              </div>

              {/* Results */}
              {generatedPosts.length > 0 && (
                  <div className="space-y-4 animate-fade-in">
                      <h3 className="font-bold text-white">步驟 2: 預覽與發佈</h3>
                      {generatedPosts.map((post) => (
                          <div key={post.id} className="bg-dark p-4 rounded border border-gray-600 flex flex-col md:flex-row gap-6">
                              <div className="flex-1 space-y-3">
                                  <textarea 
                                      value={post.caption}
                                      onChange={e => {
                                          const val = e.target.value;
                                          setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, caption: val } : p));
                                      }}
                                      className="w-full h-32 bg-gray-800 border border-gray-700 rounded p-3 text-white text-sm resize-none focus:border-primary outline-none"
                                  />
                                  <div className="flex gap-4">
                                      <select 
                                          value={post.targetAccountId} 
                                          onChange={e => {
                                              const val = e.target.value;
                                              setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, targetAccountId: val } : p));
                                          }}
                                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                                      >
                                          {accounts.map(a => <option key={a.id} value={a.id}>{a.username}</option>)}
                                      </select>
                                      
                                      <select 
                                          value={post.imageSourceType} 
                                          onChange={e => {
                                              const val = e.target.value as any;
                                              setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageSourceType: val } : p));
                                          }}
                                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                                      >
                                          <option value="ai">🎨 AI 繪圖 (Abstract)</option>
                                          <option value="stock">📷 擬真圖庫 (Realistic)</option>
                                          <option value="none">❌ 純文字</option>
                                      </select>
                                  </div>
                              </div>
                              
                              <div className="w-full md:w-64 flex flex-col gap-3">
                                  <div className="flex-1 bg-black rounded flex items-center justify-center overflow-hidden border border-gray-700 min-h-[160px] relative">
                                      {post.imageSourceType === 'none' ? (
                                          <span className="text-gray-500 text-xs">無圖片</span>
                                      ) : (
                                          <img 
                                              src={getPreviewUrl(post)} 
                                              alt="Preview" 
                                              className="w-full h-full object-cover absolute inset-0" 
                                          />
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
                                          className={`w-full py-2 rounded text-sm font-bold text-white transition-colors ${post.status === 'failed' ? 'bg-red-600' : 'bg-primary hover:bg-blue-600'}`}
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
                          {isLoadingComments ? '掃描中...' : '🔄 掃描留言'}
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
