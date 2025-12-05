
// #region Imports & Interfaces
import React, { useState, useEffect } from 'react';
import { BrandSettings, ThreadsAccount, UserProfile, TrendingTopic } from '../types';
import { generateCommentReply } from '../services/geminiService';
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
  
  const [manualTopic, setManualTopic] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [imageMode, setImageMode] = useState<ImageMode>('ai_url');
  
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);

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

  useEffect(() => {
    onSaveSettings({ ...settings, threadsAccounts: accounts });
  }, [accounts]);

  const handleAddAccount = () => {
    if (isLimitReached) return alert(`限額已滿。`);
    if (newAccount.id && newAccount.token) {
      setAccounts([...accounts, { ...newAccount, username: newAccount.username || `User_${newAccount.id}`, userId: newAccount.id, isActive: true, personaPrompt: newAccount.personaPrompt } as any]);
      setNewAccount({ id: '', username: '', token: '', personaPrompt: '' });
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
  
  const handleRefreshToken = async (index: number) => { 
      const acc = accounts[index]; 
      if(!acc.token) return; 
      const res = await refreshThreadsToken(acc.token); 
      if(res.success) alert("Token 刷新成功"); 
      else alert(`刷新失敗: ${res.error}`);
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
              // Mock data for demo if API returns empty
              allComments.push({
                  id: 'mock_c1', text: '這篇文章太實用了！請問之後會有教學嗎？', username: 'fan_01', timestamp: new Date().toISOString(), threadId: 't1', accountIndex: 0
              });
              allComments.push({
                  id: 'mock_c2', text: '笑死 😂 這個很可以', username: 'user_888', timestamp: new Date().toISOString(), threadId: 't1', accountIndex: 0
              });
          }

          setComments(allComments);
      } catch (e) {
          console.error(e);
          alert("掃描失敗");
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

  // ... (Batch Generation Handlers) ...
  const handleGenerateBatch = async () => {
      if (selectedTopics.length === 0 && !manualTopic) return alert('請選擇主題');
      if (isGenerating) return;
      setIsGenerating(true);
      setGeneratedPosts([]);
      try {
         const topics = selectedTopics.length ? selectedTopics : [manualTopic];
         const demoPosts: GeneratedPost[] = topics.map((t, i) => ({
             id: i.toString(),
             topic: t,
             caption: `關於 ${t} 的模擬貼文內容...`,
             imagePrompt: 'demo prompt',
             imageQuery: t,
             status: 'idle',
             targetAccountId: accounts[0]?.id
         }));
         setGeneratedPosts(demoPosts);
         setActiveTab('generator');
      } catch(e) { alert(e); } finally { setIsGenerating(false); }
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
              {/* Account List */}
              <div className="bg-card p-6 rounded-xl border border-gray-700">
                  <div className="flex justify-between mb-4">
                     <h3 className="font-bold text-white">帳號列表</h3>
                     <button onClick={handleAddAccount} className="bg-primary px-3 py-1 rounded text-white text-sm">+ 新增</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {accounts.map((acc, i) => (
                          <div key={i} className="bg-dark p-3 rounded border border-gray-600 relative">
                              <div className="font-bold text-white">{acc.username}</div>
                              <div className="text-xs text-gray-500 truncate mb-2">ID: {acc.userId}</div>
                              <div className="text-xs text-gray-400 mb-2">
                                  人設: <input className="bg-gray-800 border-none rounded px-1 w-20" value={acc.personaPrompt || ''} onChange={e => handleUpdatePersona(i, e.target.value)} placeholder="Default" />
                              </div>
                              <button onClick={() => handleRemoveAccount(i)} className="text-red-400 text-xs absolute top-3 right-3">移除</button>
                          </div>
                      ))}
                  </div>
                  {/* Inputs for new account - simple version */}
                  <div className="mt-4 pt-4 border-t border-gray-700 flex gap-2 flex-wrap">
                      <input value={newAccount.id} onChange={e => setNewAccount({...newAccount, id: e.target.value})} placeholder="Threads User ID" className="bg-dark border border-gray-600 rounded p-2 text-white text-xs" />
                      <input value={newAccount.token} onChange={e => setNewAccount({...newAccount, token: e.target.value})} placeholder="Access Token" className="bg-dark border border-gray-600 rounded p-2 text-white text-xs flex-1" />
                      <input value={newAccount.personaPrompt} onChange={e => setNewAccount({...newAccount, personaPrompt: e.target.value})} placeholder="人設 (e.g. 厭世)" className="bg-dark border border-gray-600 rounded p-2 text-white text-xs" />
                  </div>
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
          <div className="text-center py-20 bg-card rounded border border-gray-700">
              <h3 className="text-white font-bold mb-2">批量生成器</h3>
              <button onClick={() => setManualTopic('測試主題')} className="hidden">Mock Set</button>
              <button onClick={handleGenerateBatch} className="bg-secondary px-6 py-2 rounded text-white font-bold">進入生成流程</button>
              {/* Generator Logic (Hidden/Simplified for now) */}
          </div>
      )}
    </div>
  );
};

export default ThreadsNurturePanel;
