
import React, { useState, useEffect } from 'react';
import { SocialCard, UserProfile } from '../../types';
import { ConnectService, CONNECT_CATEGORIES, CONNECT_PLATFORMS } from '../../services/connectService';
import { checkAndUseQuota } from '../../services/authService';

interface Props {
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const CATEGORIES = ['全部', ...CONNECT_CATEGORIES];
const PLATFORMS = ['全部', ...CONNECT_PLATFORMS];

const TalentScout: React.FC<Props> = ({ user, onQuotaUpdate }) => {
    const [talents, setTalents] = useState<SocialCard[]>([]);
    const [categoryFilter, setCategoryFilter] = useState('全部');
    const [platformFilter, setPlatformFilter] = useState('全部');
    const [loading, setLoading] = useState(false);
    const [unlockingId, setUnlockingId] = useState<string | null>(null);
    
    // New State for Unlocked Records
    const [unlockedMap, setUnlockedMap] = useState<Map<string, number>>(new Map()); // Map<TalentId, UnlockTimestamp>
    const [showUnlockedSection, setShowUnlockedSection] = useState(false);

    useEffect(() => {
        loadData();
    }, [categoryFilter, platformFilter, user?.user_id]);

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Load All Public Talents
            const data = await ConnectService.getTalents(
                categoryFilter === '全部' ? undefined : categoryFilter,
                platformFilter === '全部' ? undefined : platformFilter
            );
            
            // Filter out self
            const filteredData = user 
                ? data.filter(t => t.userId !== user.user_id) 
                : data;
            setTalents(filteredData);

            // 2. Load My Active Unlocks (if logged in)
            if (user) {
                const activeUnlocks = await ConnectService.getActiveUnlocks(user.user_id);
                const map = new Map<string, number>();
                activeUnlocks.forEach(u => map.set(u.talentId, u.unlockedAt));
                setUnlockedMap(map);
                if (activeUnlocks.length > 0) setShowUnlockedSection(true);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleUnlock = async (talent: SocialCard) => {
        if (!user) return alert("請先登入");
        if (unlockedMap.has(talent.id)) return;

        const UNLOCK_COST = 30;
        
        if (!confirm(`確定要解鎖 ${talent.displayName} 的聯絡資料嗎？\n\n1. 將扣除 ${UNLOCK_COST} 點數。\n2. 資料將保留在「已解鎖名片夾」3 天 (72小時)，逾期需重新解鎖。`)) return;

        setUnlockingId(talent.id);
        try {
            const allowed = await checkAndUseQuota(user.user_id, UNLOCK_COST, 'CONNECT_UNLOCK_CONTACT', { target: talent.id });
            if (!allowed) {
                alert("交易失敗：點數不足或系統權限錯誤。\n(請檢查 Console 是否有 Permission Denied)");
                return;
            }
            
            await ConnectService.unlockTalentContact(user.user_id, talent.id);
            onQuotaUpdate();
            
            // Refresh unlocks locally
            setUnlockedMap(prev => new Map(prev).set(talent.id, Date.now()));
            setShowUnlockedSection(true);
            alert("🔓 解鎖成功！資料已存入上方「已解鎖名片夾」。");
            
        } catch (e: any) {
            alert(`解鎖失敗: ${e.message}`);
        } finally {
            setUnlockingId(null);
        }
    };

    // Helper to calculate remaining time string
    const getRemainingTime = (timestamp: number) => {
        const expiresAt = timestamp + 3 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const diff = expiresAt - now;
        
        if (diff <= 0) return "已過期";
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        if (days > 0) return `${days}天 ${hours}小時`;
        return `${hours}小時 ${Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))}分`;
    };

    // Helper to render a card
    const renderCard = (talent: SocialCard, isUnlocked: boolean, unlockedAt?: number) => {
        return (
            <div key={talent.id} className={`relative bg-card rounded-2xl overflow-hidden border transition-all hover:shadow-2xl group ${talent.isBoosted ? 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)]' : 'border-gray-700'}`}>
                {talent.isBoosted && <div className="absolute top-0 right-0 bg-yellow-400 text-black text-[10px] font-black px-2 py-1 rounded-bl-lg z-10 animate-pulse">⚡ 推薦</div>}
                
                <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="relative">
                            <img src={talent.avatarUrl} className={`w-16 h-16 rounded-full border-2 border-gray-600 transition-all duration-500 ${!isUnlocked ? 'blur-md grayscale opacity-50' : ''}`} alt="Avatar"/>
                            {!isUnlocked && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xl">🔒</span></div>}
                        </div>
                        <div>
                            <h3 className={`font-bold text-white text-lg ${!isUnlocked ? 'blur-[2px] select-none' : ''}`}>{!isUnlocked ? 'User_Hidden' : talent.displayName}</h3>
                            <div className="flex gap-1 mt-1 flex-wrap">
                                {(talent.platforms || []).slice(0,3).map(p => <span key={p} className="text-[9px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{p}</span>)}
                            </div>
                        </div>
                    </div>

                    {talent.specialties && talent.specialties.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                            {talent.specialties.slice(0,3).map(s => <span key={s} className="text-[10px] bg-purple-900/30 text-purple-200 border border-purple-500/30 px-1.5 py-0.5 rounded">{s}</span>)}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 mb-4 bg-black/20 p-3 rounded-xl">
                        <div className="text-center"><p className="text-[10px] text-gray-500 uppercase">粉絲數</p><p className="font-mono text-white font-bold">{talent.followersCount.toLocaleString()}</p></div>
                        <div className="text-center border-l border-gray-700"><p className="text-[10px] text-gray-500 uppercase">互動率</p><p className="font-mono text-green-400 font-bold">{talent.engagementRate}%</p></div>
                    </div>

                    <div className="space-y-2 mb-6">
                        <div className="flex justify-between text-xs"><span className="text-gray-500">預算</span><span className="text-yellow-400 font-bold">{talent.priceRange}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-gray-500">類別</span><span className="text-white">{talent.categories.join(', ')}</span></div>
                    </div>

                    {isUnlocked ? (
                        <div className="bg-green-900/20 border border-green-600/50 p-3 rounded-xl text-left space-y-1">
                            <div className="flex justify-between items-center mb-2 border-b border-green-800 pb-1">
                                <span className="text-green-400 font-bold text-xs">✅ 已解鎖聯絡資訊</span>
                                {unlockedAt && <span className="text-[10px] text-yellow-300 font-mono">剩 {getRemainingTime(unlockedAt)}</span>}
                            </div>
                            <p className="text-xs text-gray-300 select-all"><span className="text-gray-500">Email:</span> {talent.contactInfo?.email || '無'}</p>
                            <p className="text-xs text-gray-300 select-all"><span className="text-gray-500">Line:</span> {talent.contactInfo?.lineId || '無'}</p>
                            <p className="text-xs text-gray-300 select-all"><span className="text-gray-500">Tel:</span> {talent.contactInfo?.phone || '無'}</p>
                        </div>
                    ) : (
                        <button 
                            onClick={() => handleUnlock(talent)} 
                            disabled={!!unlockingId} 
                            className={`w-full font-black py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
                                talent.isBoosted 
                                ? 'bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black shadow-yellow-500/20' 
                                : 'bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-600 hover:border-slate-500'
                            }`}
                        >
                            {unlockingId === talent.id ? '解鎖中...' : '🔓 解鎖並聯繫 (30點)'}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Filters */}
            <div className="space-y-3 pb-2">
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar items-center">
                    <span className="text-xs font-bold text-gray-500 whitespace-nowrap">平台:</span>
                    {PLATFORMS.map(p => (
                        <button key={p} onClick={() => setPlatformFilter(p)} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap border transition-colors ${platformFilter === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-dark text-gray-400 border-gray-700 hover:border-gray-500'}`}>{p}</button>
                    ))}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar items-center">
                    <span className="text-xs font-bold text-gray-500 whitespace-nowrap">類別:</span>
                    {CATEGORIES.map(cat => (
                        <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap border transition-colors ${categoryFilter === cat ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-dark text-gray-400 border-gray-700 hover:border-gray-500'}`}>{cat}</button>
                    ))}
                </div>
            </div>

            {/* Unlocked Section (Active Records) */}
            {showUnlockedSection && unlockedMap.size > 0 && (
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-6 rounded-2xl border border-green-500/30 mb-8 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-green-500"></div>
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        📂 已解鎖名片夾 <span className="text-xs font-normal text-gray-400 bg-black/30 px-2 py-0.5 rounded">限時 3 天自動刪除</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {talents.filter(t => unlockedMap.has(t.id)).map(talent => renderCard(talent, true, unlockedMap.get(talent.id)))}
                    </div>
                </div>
            )}

            {/* Main Grid */}
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">探索新名片</h3>
            {loading ? (
                <div className="text-center py-20 text-gray-500">
                    <div className="loader border-t-yellow-500 mb-4 mx-auto"></div>
                    載入素人資料庫...
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {talents.length === 0 && <div className="col-span-full text-center py-10 text-gray-500">沒有找到符合條件的名片。</div>}
                    {talents.filter(t => !unlockedMap.has(t.id)).map(talent => renderCard(talent, false))}
                </div>
            )}
        </div>
    );
};

export default TalentScout;
