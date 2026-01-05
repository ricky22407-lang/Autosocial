
import React, { useState } from 'react';
import { OpportunityPost, ThreadsAccount, UserProfile } from '../../types';
import { findThreadsOpportunities } from '../../services/geminiService';
import { checkAndUseQuota } from '../../services/authService';
import { generateCommentReply } from '../../services/geminiService';
import { publishThreadsPost } from '../../services/threadsService';

interface Props {
    accounts: ThreadsAccount[];
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const OpportunityScout: React.FC<Props> = ({ accounts, user, onQuotaUpdate }) => {
    const [keyword, setKeyword] = useState('');
    const [results, setResults] = useState<OpportunityPost[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedReplyId, setSelectedReplyId] = useState<string | null>(null);
    const [replyDraft, setReplyDraft] = useState('');
    const [isGeneratingReply, setIsGeneratingReply] = useState(false);
    const [replyAccountId, setReplyAccountId] = useState(accounts[0]?.id || '');

    const handleSearch = async () => {
        if (!keyword.trim()) return alert("請輸入關鍵字");
        if (!user) return alert("請先登入");

        const COST = 5; // Higher value for business leads
        const allowed = await checkAndUseQuota(user.user_id, COST, 'OPPORTUNITY_SEARCH');
        if (!allowed) return;
        onQuotaUpdate();

        setIsSearching(true);
        setResults([]);
        
        try {
            const leads = await findThreadsOpportunities(keyword);
            if (leads.length === 0) {
                alert("AI 搜尋完畢，但未發現高潛力的商機 (可能是關鍵字太冷門，或大家都在分享而非提問)。請嘗試更換關鍵字。");
            }
            setResults(leads);
        } catch (e: any) {
            alert(`搜尋失敗: ${e.message}`);
        } finally {
            setIsSearching(false);
        }
    };

    const handleGenerateReply = async (post: OpportunityPost, index: number) => {
        const account = accounts.find(a => a.id === replyAccountId);
        if (!account) return alert("請先選擇用來回覆的帳號");

        setSelectedReplyId(index.toString());
        setIsGeneratingReply(true);
        setReplyDraft('');

        try {
            const persona = account.styleGuide || account.personaPrompt || "Professional and helpful.";
            const replies = await generateCommentReply(post.content, persona);
            if (replies.length > 0) {
                setReplyDraft(replies[0]);
            } else {
                setReplyDraft("AI 無法生成建議，請手動撰寫。");
            }
        } catch (e) {
            setReplyDraft("生成失敗，請重試。");
        } finally {
            setIsGeneratingReply(false);
        }
    };

    const handleSendReply = async (post: OpportunityPost) => {
        // Since we don't have the exact Thread ID from Google Search results (only URL), 
        // we can't use the API to reply directly to a specific ID unless we parse it.
        // Google Search URL format: https://www.threads.net/@username/post/POST_ID
        // We attempt to extract ID.
        
        const match = post.url.match(/\/post\/([a-zA-Z0-9_-]+)/);
        const threadId = match ? match[1] : null;

        if (!threadId) {
            alert("無法解析貼文 ID，請點擊「前往貼文」手動回覆。");
            window.open(post.url, '_blank');
            return;
        }

        const account = accounts.find(a => a.id === replyAccountId);
        if (!account) return;

        if (!confirm(`確定使用帳號 ${account.username} 發送回覆嗎？`)) return;

        try {
            // Note: The `publishThreadsPost` function in threadsService needs to support replyToId.
            // Assuming it does based on previous implementation or standard Graph API.
            // If API restriction prevents replying to *public* threads not owned by user (common restriction),
            // this might fail. In that case, we fallback to manual open.
            
            // Threads API currently (v1) only allows replying to *your own* threads or threads you are mentioned in?
            // Actually, `reply_to_id` allows replying to any thread IF you have the ID, BUT
            // standard access usually restricts interacting with content the app didn't create or user doesn't own.
            // Let's TRY it, if fails, fallback to link.
            
            const res = await publishThreadsPost(account, replyDraft, undefined, threadId);
            
            if (res.success) {
                alert("回覆發送成功！");
                setResults(prev => prev.filter(p => p !== post)); // Remove from list
                setSelectedReplyId(null);
            } else {
                // Common failure for public threads interaction via API
                console.warn("API Reply Error", res.error);
                if (res.error?.includes("Unsupported post request") || res.error?.includes("permission")) {
                    alert("⚠️ Threads API 限制：無法透過第三方工具直接回覆此貼文。\n\n請點擊「前往貼文」手動操作，並貼上已複製的文案。");
                    navigator.clipboard.writeText(replyDraft);
                    window.open(post.url, '_blank');
                } else {
                    alert(`發送失敗: ${res.error}`);
                }
            }
        } catch (e: any) {
            alert(`錯誤: ${e.message}`);
        }
    };

    return (
        <div className="space-y-6">
            {/* Search Section */}
            <div className="bg-card p-6 rounded-xl border border-gray-700">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-bold text-yellow-400 mb-2 uppercase tracking-wider">
                            🔍 開發關鍵字 (Intent Search)
                        </label>
                        <input 
                            value={keyword}
                            onChange={e => setKeyword(e.target.value)}
                            placeholder="例如：過年禮盒、保濕精華液、台中燒肉推薦..."
                            className="w-full bg-dark border border-gray-600 rounded-xl p-4 text-white placeholder-gray-500 focus:border-yellow-500 outline-none transition-colors"
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                    <button 
                        onClick={handleSearch} 
                        disabled={isSearching}
                        className="bg-yellow-600 hover:bg-yellow-500 text-black px-8 py-4 rounded-xl font-black shadow-lg transition-all w-full md:w-auto disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                        {isSearching ? <div className="loader border-t-black"></div> : '💎 挖掘商機 (5點)'}
                    </button>
                </div>
                <p className="text-xs text-gray-500 mt-3 ml-1">
                    AI 智能過濾：系統會自動排除「開箱文」、「分享文」與「廣告文」，只鎖定「提問」、「求推薦」等具備強烈購買意圖的貼文。
                </p>
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {results.map((post, index) => (
                    <div key={index} className="bg-gradient-to-br from-gray-900 to-black p-6 rounded-2xl border border-gray-800 hover:border-yellow-500/50 transition-all group relative overflow-hidden">
                        {/* Intent Score Badge */}
                        <div className="absolute top-4 right-4 flex items-center gap-1 bg-yellow-900/30 text-yellow-400 px-2 py-1 rounded text-xs font-bold border border-yellow-500/20">
                            <span>🔥 意圖分數: {post.intentScore}/10</span>
                        </div>

                        <div className="mb-4 pr-16">
                            <p className="text-gray-300 text-sm leading-relaxed line-clamp-4 font-medium">"{post.content}"</p>
                        </div>

                        <div className="bg-gray-800/50 p-3 rounded-lg text-xs text-gray-400 mb-4 border border-gray-700/50">
                            <span className="text-yellow-500 font-bold">AI 分析：</span> {post.reasoning}
                        </div>

                        {selectedReplyId === index.toString() ? (
                            <div className="animate-fade-in mt-4 bg-gray-800 p-4 rounded-xl border border-gray-600">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-xs text-gray-400 font-bold">擬稿中...</label>
                                    <button onClick={() => setSelectedReplyId(null)} className="text-gray-500 hover:text-white">✕</button>
                                </div>
                                <textarea 
                                    value={replyDraft}
                                    onChange={e => setReplyDraft(e.target.value)}
                                    className="w-full h-24 bg-black/50 border border-gray-600 rounded p-2 text-sm text-white mb-2 resize-none focus:border-yellow-500 outline-none"
                                    placeholder={isGeneratingReply ? "AI 正在撰寫中..." : "在此編輯回覆..."}
                                />
                                <button 
                                    onClick={() => handleSendReply(post)}
                                    disabled={isGeneratingReply || !replyDraft}
                                    className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-2 rounded transition-colors disabled:opacity-50"
                                >
                                    🚀 發送/複製回覆
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-3 mt-auto pt-4 border-t border-gray-800">
                                <select 
                                    value={replyAccountId} 
                                    onChange={e => setReplyAccountId(e.target.value)}
                                    className="bg-black border border-gray-700 rounded px-2 text-xs text-white outline-none flex-1 max-w-[120px]"
                                >
                                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.username}</option>)}
                                </select>
                                <button 
                                    onClick={() => handleGenerateReply(post, index)}
                                    className="flex-1 bg-white text-black font-bold py-2 rounded text-xs hover:bg-gray-200 transition-colors"
                                >
                                    ✍️ 生成回覆
                                </button>
                                <a 
                                    href={post.url} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="px-3 py-2 bg-gray-800 text-gray-400 rounded hover:text-white hover:bg-gray-700 transition-colors flex items-center justify-center"
                                    title="開啟貼文"
                                >
                                    ↗
                                </a>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            
            {!isSearching && results.length === 0 && keyword && (
                <div className="text-center py-20 text-gray-500">
                    輸入關鍵字並點擊「挖掘商機」開始搜尋。
                </div>
            )}
        </div>
    );
};

export default OpportunityScout;
