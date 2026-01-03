
import React, { useState } from 'react';
import { UserProfile, InfluencerProfile } from '../../types';
import { checkAndUseQuota, logUserActivity, getPublicInfluencers } from '../../services/authService';
import { searchInfluencers } from '../../services/gemini/text';
import InfluencerCard from './InfluencerCard';

interface Props {
  user: UserProfile;
  onQuotaUpdate: () => void;
}

interface MatchResult {
    userId: string;
    profile: InfluencerProfile;
    email: string;
    matchScore: number;
    invitationSent: boolean;
}

const InfluencerRadar: React.FC<Props> = ({ user, onQuotaUpdate }) => {
    const [query, setQuery] = useState('');
    const [targetPlatforms, setTargetPlatforms] = useState({ facebook: true, threads: true });
    const [isScanning, setIsScanning] = useState(false);
    const [results, setResults] = useState<MatchResult[]>([]);
    const [hasSearched, setHasSearched] = useState(false);

    // 付費狀態追蹤
    const [tagsUnlocked, setTagsUnlocked] = useState(false); 
    const [fullyUnlockedIds, setFullyUnlockedIds] = useState<Set<string>>(new Set());

    // Modal State
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(null);
    const [inviteMessage, setInviteMessage] = useState('');

    const togglePlatform = (p: 'facebook' | 'threads') => {
        setTargetPlatforms(prev => ({ ...prev, [p]: !prev[p] }));
    };

    const handleSearch = async () => {
        if (!query.trim()) return alert("請輸入產品關鍵字或尋人條件。");
        if (!targetPlatforms.facebook && !targetPlatforms.threads) return alert("請至少選擇一個目標平台。");
        
        setIsScanning(true);
        setHasSearched(true);
        
        try {
            // 1. 取得所有公開人才
            const allRealTalents = await getPublicInfluencers();
            
            // 2. 本地預過濾平台條件
            const filteredTalents = allRealTalents.filter(t => {
                const hasFB = !!t.influencerProfile?.platforms?.facebook;
                const hasThreads = !!t.influencerProfile?.platforms?.threads;
                return (targetPlatforms.facebook && hasFB) || (targetPlatforms.threads && hasThreads);
            });

            if (filteredTalents.length === 0) {
                setResults([]);
                return;
            }

            // 3. AI 進行語意匹配與排序
            const matchedData = await searchInfluencers(query, filteredTalents);
            
            // 4. 重建 MatchResult，確保資料來源是本地 Profile 而非 AI 幻覺
            const finalMatches: MatchResult[] = matchedData
                .map((m: any) => {
                    const originalUser = filteredTalents.find(u => u.email === m.email);
                    if (!originalUser || !originalUser.influencerProfile) return null;

                    return {
                        userId: originalUser.user_id,
                        profile: originalUser.influencerProfile,
                        email: originalUser.email,
                        matchScore: m.matchScore || 80,
                        invitationSent: false
                    };
                })
                .filter((m): m is MatchResult => m !== null);

            setResults(finalMatches);
            setTagsUnlocked(false); 
            setFullyUnlockedIds(new Set());

        } catch (e: any) {
            console.error("Radar Error:", e);
            alert(`雷達連線失敗: ${e.message}`);
        } finally {
            setIsScanning(false);
        }
    };

    const handleUnlockTags = async () => {
        const COST = 10;
        if (!confirm(`確認花費 ${COST} 點解鎖本次搜尋結果中所有人才的「領域標籤」、「社群數據」與「報價」？\n(姓名與簡介將繼續保持模糊)`)) return;

        const allowed = await checkAndUseQuota(user.user_id, COST, 'MARKETPLACE_PREVIEW_TAGS', { query });
        if (!allowed) return;
        
        setTagsUnlocked(true);
        onQuotaUpdate();
    };

    const handleUnlockFull = async (match: MatchResult) => {
        const COST = 30;
        if (!confirm(`確認花費 ${COST} 點解鎖「${match.matchScore}% 匹配」人才的完整資料與聯繫功能？`)) return;

        const allowed = await checkAndUseQuota(user.user_id, COST, 'MARKETPLACE_FULL_UNLOCK', { target: match.email });
        if (!allowed) return;

        setFullyUnlockedIds(prev => new Set(prev).add(match.userId));
        onQuotaUpdate();
    };

    const openInviteModal = (match: MatchResult) => {
        setSelectedMatch(match);
        setInviteMessage(`嗨！我們是 ${user.email.split('@')[0]}，在 AutoSocial 平台上看到您的風格非常適合我們正在進行的「${query}」推廣活動。想詢問您近期是否有興趣接案？期待您的回覆，謝謝！`);
        setIsInviteModalOpen(true);
    };

    const handleConfirmInvite = async () => {
        if (!selectedMatch || !inviteMessage.trim()) return;
        await logUserActivity({
            uid: user.user_id,
            act: 'MARKETPLACE_INVITE_SENT',
            ts: Date.now(),
            topic: selectedMatch.email,
            prmt: inviteMessage
        });
        setResults(prev => prev.map(p => p.userId === selectedMatch.userId ? { ...p, invitationSent: true } : p));
        setIsInviteModalOpen(false);
        alert("✅ 邀請已發送！");
    };

    return (
        <div className="space-y-10 animate-fade-in relative">
            {/* Search Box */}
            <div className="bg-card p-10 rounded-[2.5rem] border border-gray-700 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 blur-[100px] rounded-full pointer-events-none"></div>
                <div className="max-w-2xl mx-auto text-center space-y-8">
                    <div className="space-y-2">
                        <h3 className="text-2xl font-bold text-white">啟動精準媒合雷達</h3>
                        <p className="text-xs text-gray-500">搜尋資料庫完全免費，您可以先確認是否有感興趣的人選再解鎖。</p>
                    </div>

                    <div className="flex justify-center gap-4">
                        <button onClick={() => togglePlatform('facebook')} className={`flex items-center gap-2 px-6 py-3 rounded-2xl border transition-all font-bold text-sm ${targetPlatforms.facebook ? 'bg-blue-600 border-blue-500 text-white' : 'bg-dark border-gray-700 text-gray-500'}`}>f Facebook</button>
                        <button onClick={() => togglePlatform('threads')} className={`flex items-center gap-2 px-6 py-3 rounded-2xl border transition-all font-bold text-sm ${targetPlatforms.threads ? 'bg-pink-600 border-pink-500 text-white' : 'bg-dark border-gray-700 text-gray-500'}`}>@ Threads</button>
                    </div>

                    <div className="relative group">
                        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="例如：尋找美妝類、擅長短影音的創作者..." className="w-full bg-dark border border-gray-600 rounded-3xl px-8 py-5 text-white text-lg focus:border-primary outline-none transition-all pr-40" />
                        <button onClick={handleSearch} disabled={isScanning} className="absolute right-2 top-2 bottom-2 bg-primary text-black font-black px-8 rounded-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
                            {isScanning ? '掃描中...' : '免費搜尋'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Scanning State */}
            {isScanning && (
                <div className="py-20 flex flex-col items-center gap-8">
                    <div className="relative w-32 h-32 flex items-center justify-center">
                        <div className="absolute inset-0 border-4 border-primary/20 rounded-full animate-ping"></div>
                        <div className="w-4 h-4 bg-primary rounded-full shadow-[0_0_15px_#00f2ea]"></div>
                    </div>
                    <p className="text-xl font-black text-white tracking-widest animate-pulse">RADAR SCANNING...</p>
                </div>
            )}

            {/* Results Grid */}
            {hasSearched && !isScanning && (
                <div className="space-y-10">
                    <div className="flex flex-col md:flex-row justify-between items-center bg-gray-900/50 p-6 rounded-[2rem] border border-gray-800 gap-4">
                        <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest">
                            {results.length > 0 ? `偵測到 ${results.length} 位符合條件的人才` : "目前人才庫尚無符合條件的創作者"}
                        </h4>
                        {!tagsUnlocked && results.length > 0 && (
                            <button onClick={handleUnlockTags} className="w-full md:w-auto bg-yellow-600 hover:bg-yellow-500 text-black px-8 py-3 rounded-2xl font-black text-xs shadow-lg transition-all active:scale-95">
                                🔓 解鎖本次結果所有人才標籤 (10 點)
                            </button>
                        )}
                        {tagsUnlocked && <span className="text-green-400 text-xs font-black flex items-center gap-2">✨ 標籤資訊已解鎖</span>}
                    </div>
                    
                    {results.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
                            {results.map((match, idx) => {
                                const isFullyUnlocked = fullyUnlockedIds.has(match.userId);
                                return (
                                    <div key={idx} className="space-y-4">
                                        <div className="relative">
                                            <div className="absolute -top-3 -right-3 z-20 bg-green-500 text-black text-[10px] font-black px-3 py-1 rounded-full shadow-lg">
                                                {match.matchScore}% MATCH
                                            </div>
                                            <InfluencerCard 
                                                profile={match.profile} 
                                                email={match.email} 
                                                displayMode={isFullyUnlocked ? 'FULL' : tagsUnlocked ? 'PREVIEW' : 'LOCKED'} 
                                            />
                                        </div>
                                        
                                        {!isFullyUnlocked ? (
                                            <button 
                                                onClick={() => handleUnlockFull(match)}
                                                className="w-full py-4 bg-primary text-black rounded-2xl font-black text-sm transition-all shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                                            >
                                                🔓 解鎖完整資料與邀請 (30 點)
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => !match.invitationSent && openInviteModal(match)}
                                                disabled={match.invitationSent}
                                                className={`w-full py-4 rounded-2xl font-black text-sm transition-all shadow-xl flex items-center justify-center gap-2 ${match.invitationSent ? 'bg-gray-800 text-gray-500' : 'bg-secondary text-white hover:brightness-110'}`}
                                            >
                                                {match.invitationSent ? '✅ 已發送邀請' : '✉️ 發送合作邀請'}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Custom Invitation Modal */}
            {isInviteModalOpen && selectedMatch && (
                <div className="fixed inset-0 bg-black/80 z-[400] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
                    <div className="bg-gray-900 border border-gray-700 w-full max-w-xl rounded-[2.5rem] overflow-hidden p-8 space-y-6 shadow-2xl">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-2xl font-black text-white">發送合作邀約</h3>
                                <p className="text-gray-400 text-sm mt-1">給：<span className="text-secondary font-bold">{selectedMatch.email.split('@')[0]}</span></p>
                            </div>
                            <button onClick={() => setIsInviteModalOpen(false)} className="text-gray-500 hover:text-white">✕</button>
                        </div>
                        <textarea value={inviteMessage} onChange={e => setInviteMessage(e.target.value)} rows={8} className="w-full bg-dark border border-gray-700 rounded-2xl p-5 text-gray-200 text-sm focus:border-secondary outline-none transition-all resize-none shadow-inner" />
                        <div className="flex gap-3">
                            <button onClick={() => setIsInviteModalOpen(false)} className="flex-1 py-4 rounded-2xl bg-gray-800 text-gray-400 font-bold hover:bg-gray-700 transition-all">取消</button>
                            <button onClick={handleConfirmInvite} className="flex-[2] py-4 rounded-2xl bg-secondary text-white font-black shadow-lg hover:brightness-110 active:scale-95 transition-all">確認發送邀請</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InfluencerRadar;
