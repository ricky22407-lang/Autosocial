
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
    const [debugQuery, setDebugQuery] = useState('');
    
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
        
        // Show user what's happening under the hood (OSINT logic)
        setDebugQuery(`site:threads.net "${keyword}" ("求推薦" OR "好用嗎" OR "避雷" OR "挑選" OR "比較")`);
        
        try {
            const leads = await findThreadsOpportunities(keyword);
            setResults(leads);
        } catch (e: any) {
            alert(`搜尋失敗: ${e.message}`);
        } finally {
            setIsSearching(false);
        }
    };

    // Helper: Determine if the URL is a direct link or a search fallback
    const isSearchFallback = (url: string) => url.includes('/search?q=') || url.includes('google.com');

    return (
        <div className="space-y-6">
            {/* Search Section */}
            <div className="bg-card p-6 rounded-xl border border-gray-700 shadow-xl">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-bold text-yellow-400 mb-2 uppercase tracking-wider flex justify-between">
                            <span>商機關鍵字 (Intent Search)</span>
                            <span className="text-[10px] text-gray-500 font-normal normal-case border border-gray-600 px-2 rounded">OSINT Engine Active</span>
                        </label>
                        <input 
                            value={keyword}
                            onChange={e => setKeyword(e.target.value)}
                            onCompositionStart={() => setIsComposing(true)}
                            onCompositionEnd={() => setIsComposing(false)}
                            placeholder="例如：過年禮盒、洗髮精、保濕精華... (自動搜尋 Threads 真人貼文)"
                            className="w-full bg-dark border border-gray-600 rounded-xl p-4 text-white placeholder-gray-500 focus:border-yellow-500 outline-none transition-colors shadow-inner"
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
                                <span>深度掃描中...</span>
                            </>
                        ) : '🔍 開始偵測'}
                    </button>
                </div>
                
                {isSearching && (
                    <div className="mt-4 p-3 bg-black/30 rounded border border-gray-700 text-xs font-mono text-green-400 animate-pulse">
                        &gt; Executing OSINT Dork: {debugQuery}...
                    </div>
                )}

                <p className="text-xs text-gray-500 mt-3 ml-1 leading-relaxed">
                    <b>工作原理：</b> 系統使用 Google 進階搜尋運算子 (Google Dorks) 鎖定 Threads/Dcard，並過濾出具有<b>「求推薦、好用嗎、避雷、比較、挑選、哪裡買」</b>等強烈意圖的討論，精準命中潛在客戶。
                </p>
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {results.map((post, index) => (
                    <div key={index} className="bg-gradient-to-br from-gray-900 to-black p-6 rounded-2xl border border-gray-800 hover:border-yellow-500/50 transition-all group relative flex flex-col h-full shadow-lg">
                        {/* Intent Score Badge */}
                        <div className="absolute top-4 right-4 flex items-center gap-1 bg-yellow-900/30 text-yellow-400 px-2 py-1 rounded text-xs font-bold border border-yellow-500/20">
                            <span>🔥 意圖: {post.intentScore}/10</span>
                        </div>

                        {/* Content */}
                        <div className="mb-4 pr-16 flex-1">
                            <h4 className="text-gray-500 text-xs font-bold mb-2 flex items-center gap-2">
                                <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">
                                    {post.url.includes('dcard') ? 'Dcard' : 'Threads'}
                                </span>
                                {post.username !== 'Unknown' && <span>@{post.username}</span>}
                            </h4>
                            <p className="text-gray-200 text-sm leading-relaxed font-medium">"{post.content}"</p>
                            {post.reasoning && (
                                <div className="mt-3 p-2 bg-gray-800/50 rounded border border-gray-700/50">
                                    <p className="text-[10px] text-gray-400 italic">💡 AI 分析: {post.reasoning}</p>
                                </div>
                            )}
                        </div>

                        {/* Metrics Bar */}
                        {(post.replyCount && post.replyCount !== 'null' && post.replyCount !== 'Unknown') && (
                            <div className="flex items-center gap-4 text-xs text-gray-500 mb-4 px-1 border-t border-gray-800 pt-3">
                                <span className="flex items-center gap-1" title="留言數 (估計)">
                                    💬 <span className="font-mono text-gray-300">{post.replyCount}</span>
                                </span>
                                {post.likeCount && post.likeCount !== 'Unknown' && (
                                    <span className="flex items-center gap-1" title="按讚數 (估計)">
                                        ❤️ <span className="font-mono text-gray-300">{post.likeCount}</span>
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Action Area */}
                        <div className="mt-auto pt-2">
                            <a 
                                href={post.url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-gray-600 hover:border-white/50 group text-xs"
                            >
                                <span>↗</span> {isSearchFallback(post.url) ? '前往搜尋結果頁' : '前往原始貼文'}
                            </a>
                        </div>
                    </div>
                ))}
            </div>
            
            {!isSearching && results.length === 0 && hasSearched && (
                <div className="text-center py-16 bg-dark/20 rounded-xl border border-dashed border-gray-700 flex flex-col items-center">
                    <div className="text-5xl mb-4 opacity-50 grayscale">🌵</div>
                    <h3 className="text-lg font-bold text-gray-400 mb-2">荒漠：未發現高價值商機</h3>
                    <p className="text-sm text-gray-500 max-w-md mx-auto mb-6 leading-relaxed">
                        AI 使用了嚴格的過濾條件 (必須包含購買/比較意圖)，但沒有在 Threads/Dcard 找到關於「{keyword}」的有效討論。這可能代表該關鍵字過於冷門，或目前沒有人討論。
                    </p>
                    <div className="inline-block text-left text-xs text-gray-400 bg-black/40 p-5 rounded-xl border border-gray-700">
                        <p className="font-bold mb-2 text-yellow-500">💡 建議嘗試：</p>
                        <ul className="list-disc pl-4 space-y-1.5">
                            <li><b>換個說法</b>：將「洗髮精」改為「頭皮癢」、「掉髮」 (針對痛點搜尋)。</li>
                            <li><b>擴大範圍</b>：搜尋品類而非特定品牌 (例如搜「藍牙耳機」而非「AirPods」)。</li>
                            <li><b>生活化用語</b>：加入「有人用過嗎」、「求滅火」。</li>
                        </ul>
                    </div>
                </div>
            )}

            {!hasSearched && !isSearching && (
                <div className="text-center py-20 text-gray-600 flex flex-col items-center opacity-70">
                    <span className="text-4xl mb-4">🔭</span>
                    <p>輸入產品或服務關鍵字，AI 將自動掃描全網潛在客戶。</p>
                </div>
            )}
        </div>
    );
};

export default OpportunityScout;
