
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

    useEffect(() => {
        loadTalents();
    }, [categoryFilter, platformFilter, user?.user_id]);

    const loadTalents = async () => {
        setLoading(true);
        const data = await ConnectService.getTalents(
            categoryFilter === '全部' ? undefined : categoryFilter,
            platformFilter === '全部' ? undefined : platformFilter
        );
        
        // Filter out self
        const filteredData = user 
            ? data.filter(t => t.userId !== user.user_id) 
            : data;

        setTalents(filteredData);
        setLoading(false);
    };

    const handleUnlock = async (talent: SocialCard) => {
        if (!user) return alert("請先登入");
        if (ConnectService.isUnlocked(talent.id)) return;

        const UNLOCK_COST = 30;
        
        if (!confirm(`確定要解鎖 ${talent.displayName} 的聯絡資料嗎？\n\n將扣除 ${UNLOCK_COST} 點數。`)) return;

        setUnlockingId(talent.id);
        try {
            const allowed = await checkAndUseQuota(user.user_id, UNLOCK_COST, 'CONNECT_UNLOCK_CONTACT', { target: talent.id });
            if (!allowed) {
                alert("交易失敗：點數不足或系統權限錯誤。\n(請檢查 Console 是否有 Permission Denied)");
                return;
            }
            onQuotaUpdate();
            await ConnectService.unlockTalentContact(user.user_id, talent.id);
            alert("🔓 解鎖成功！您可以查看聯絡資訊了。");
        } catch (e: any) {
            alert(`解鎖失敗: ${e.message}`);
        } finally {
            setUnlockingId(null);
        }
    };

    return (
        <div className="space-y-4 animate-fade-in">
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

            {/* Grid */}
            {loading ? (
                <div className="text-center py-20 text-gray-500">
                    <div className="loader border-t-yellow-500 mb-4 mx-auto"></div>
                    載入素人資料庫...
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {talents.length === 0 && <div className="col-span-full text-center py-10 text-gray-500">沒有找到符合條件的名片。</div>}
                    {talents.map(talent => {
                        const isUnlocked = ConnectService.isUnlocked(talent.id);
                        const isBoosted = talent.isBoosted;
                        
                        return (
                            <div key={talent.id} className={`relative bg-card rounded-2xl overflow-hidden border transition-all hover:shadow-2xl group ${isBoosted ? 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)]' : 'border-gray-700'}`}>
                                {isBoosted && <div className="absolute top-0 right-0 bg-yellow-400 text-black text-[10px] font-black px-2 py-1 rounded-bl-lg z-10 animate-pulse">⚡ 推薦</div>}
                                
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
                                        <div className="bg-green-900/20 border border-green-600/50 p-3 rounded-xl text-center">
                                            <p className="text-green-400 font-bold text-sm">✅ 已解鎖聯絡資訊</p>
                                            <p className="text-xs text-gray-300 mt-1 select-all">{talent.contactInfo?.email}</p>
                                        </div>
                                    ) : (
                                        <button onClick={() => handleUnlock(talent)} disabled={!!unlockingId} className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-black py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2">
                                            {unlockingId === talent.id ? '解鎖中...' : '🔓 解鎖並聯繫 (30點)'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default TalentScout;
