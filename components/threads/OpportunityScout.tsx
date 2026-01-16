
import React, { useState } from 'react';
import { OpportunityPost, ThreadsAccount, UserProfile } from '../../types';
import { findThreadsOpportunities } from '../../services/geminiService';
import { checkAndUseQuota } from '../../services/authService';

interface Props {
    accounts: ThreadsAccount[];
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const OpportunityScout: React.FC<Props> = ({ accounts, user, onQuotaUpdate }) => {
    const [keyword, setKeyword] = useState('');
    const [results, setResults] = useState<OpportunityPost[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    
    // IME Composition State
    const [isComposing, setIsComposing] = useState(false);

    const handleSearch = async () => {
        if (!keyword.trim()) return alert("請輸入關鍵字");
        if (!user) return alert("請先登入");

        // Permission Check: Pro, Business, Admin only
        if (!['pro', 'business', 'admin'].includes(user.role)) {
            alert("🔒 此功能僅限 Pro 專業版以上會員使用。\n\n升級後即可無限次使用商機偵測功能！");
            return;
        }

        const COST = 0; // Free for Pro users
        const allowed = await checkAndUseQuota(user.user_id, COST, 'OPPORTUNITY_SEARCH');
        if (!allowed) return;
        onQuotaUpdate();

        setIsSearching(true);
        setHasSearched(true);
        setResults([]);
        
        try {
            const leads = await findThreadsOpportunities(keyword);
            if (leads.length === 0) {
                // No alert needed, UI shows "No results" state
            }
            setResults(leads);
        } catch (e: any) {
            alert(`搜尋失敗: ${e.message}`);
        } finally {
            setIsSearching(false);
        }
    };

    // Helper: Determine if the URL is a direct link or a search fallback
    const isSearchFallback = (url: string) => url.includes('/search?q=');

    return (
        <div className="space-y-6">
            {/* Search Section */}
            <div className="bg-card p-6 rounded-xl border border-gray-700">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-bold text-yellow-400 mb-2 uppercase tracking-wider">
                            商機關鍵字 (Intent Search)
                        </label>
                        <input 
                            value={keyword}
                            onChange={e => setKeyword(e.target.value)}
                            onCompositionStart={() => setIsComposing(true)}
                            onCompositionEnd={() => setIsComposing(false)}
                            placeholder="例如：過年禮盒、保濕精華液... (自動搜尋最近1個月)"
                            className="w-full bg-dark border border-gray-600 rounded-xl p-4 text-white placeholder-gray-500 focus:border-yellow-500 outline-none transition-colors"
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !isComposing) {
                                    handleSearch();
                                }
                            }}
                        />
                    </div>
                    <button 
                        onClick={handleSearch} 
                        disabled={isSearching}
                        className="bg-yellow-600 hover:bg-yellow-500 text-black px-8 py-4 rounded-xl font-black shadow-lg transition-all w-full md:w-auto disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                        {isSearching ? (
                            <>
                                <div className="loader border-t-black w-4 h-4"></div>
                                <span>AI 偵測中...</span>
                            </>
                        ) : '商機開發 (Pro限定)'}
                    </button>
                </div>
                <p className="text-xs text-gray-500 mt-3 ml-1">
                    AI 智能過濾：系統自動鎖定<b>台灣地區</b>、<b>近一個月</b>貼文，並排除「開箱文」、「廣告文」，只鎖定「提問」、「求推薦」等具備強烈購買意圖的貼文。
                </p>
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {results.map((post, index) => (
                    <div key={index} className="bg-gradient-to-br from-gray-900 to-black p-6 rounded-2xl border border-gray-800 hover:border-yellow-500/50 transition-all group relative flex flex-col h-full">
                        {/* Intent Score Badge */}
                        <div className="absolute top-4 right-4 flex items-center gap-1 bg-yellow-900/30 text-yellow-400 px-2 py-1 rounded text-xs font-bold border border-yellow-500/20">
                            <span>意圖分數: {post.intentScore}/10</span>
                        </div>

                        {/* Content */}
                        <div className="mb-4 pr-16 flex-1">
                            <p className="text-gray-300 text-sm leading-relaxed line-clamp-4 font-medium">"{post.content}"</p>
                            {post.reasoning && <p className="text-[10px] text-gray-500 mt-2 italic">💡 AI 分析: {post.reasoning}</p>}
                        </div>

                        {/* Metrics Bar (Hidden if data is invalid/null) */}
                        {(post.replyCount && post.replyCount !== 'null' && post.replyCount !== '0' && post.likeCount && post.likeCount !== 'null' && post.likeCount !== '0') && (
                            <div className="flex items-center gap-4 text-xs text-gray-500 mb-4 px-1">
                                <span className="flex items-center gap-1" title="留言數 (估計)">
                                    💬 <span className="font-mono text-gray-300">{post.replyCount}</span>
                                </span>
                                <span className="flex items-center gap-1" title="按讚數 (估計)">
                                    ❤️ <span className="font-mono text-gray-300">{post.likeCount}</span>
                                </span>
                            </div>
                        )}

                        {/* Action Area - Simplified: Just the Link Button */}
                        <div className="mt-auto pt-4 border-t border-gray-800">
                            <a 
                                href={post.url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-gray-600 hover:border-white/50 group text-xs"
                            >
                                <span>↗</span> {isSearchFallback(post.url) ? '找不到直連，前往搜尋' : '前往貼文 (Short URL)'}
                            </a>
                        </div>
                    </div>
                ))}
            </div>
            
            {!isSearching && results.length === 0 && hasSearched && (
                <div className="text-center py-16 bg-dark/20 rounded-xl border border-dashed border-gray-700">
                    <div className="text-4xl mb-4 opacity-50">🕵️</div>
                    <h3 className="text-lg font-bold text-gray-400 mb-2">未發現高意圖商機</h3>
                    <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
                        AI 掃描了最近的公開貼文，但沒有發現關於「{keyword}」的明確購買需求或提問。
                    </p>
                    <div className="inline-block text-left text-xs text-gray-500 bg-black/30 p-4 rounded-lg">
                        <p className="font-bold mb-1 text-gray-400">💡 建議嘗試：</p>
                        <ul className="list-disc pl-4 space-y-1">
                            <li>更換關鍵字 (例如將「洗髮精」改為「好用洗髮精」)</li>
                            <li>使用更生活化的詞彙 (如「求推薦」、「哪裡買」)</li>
                            <li>擴大搜尋範圍 (嘗試相關品類名稱)</li>
                        </ul>
                    </div>
                </div>
            )}

            {!hasSearched && !isSearching && (
                <div className="text-center py-20 text-gray-500">
                    輸入關鍵字並點擊「商機開發」開始搜尋。
                </div>
            )}
        </div>
    );
};

export default OpportunityScout;
