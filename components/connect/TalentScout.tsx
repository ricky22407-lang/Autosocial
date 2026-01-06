
import React, { useState, useEffect } from 'react';
import { SocialCard, UserProfile } from '../../types';
import { ConnectService } from '../../services/connectService';
import { checkAndUseQuota } from '../../services/authService';

interface Props {
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const CATEGORIES = ['全部', '美食', '旅遊', '美妝', '3C', '攝影', '健身', '親子', '寵物'];

const TalentScout: React.FC<Props> = ({ user, onQuotaUpdate }) => {
    const [talents, setTalents] = useState<SocialCard[]>([]);
    const [filter, setFilter] = useState('全部');
    const [loading, setLoading] = useState(false);
    const [unlockingId, setUnlockingId] = useState<string | null>(null);

    useEffect(() => {
        loadTalents();
    }, [filter]);

    const loadTalents = async () => {
        setLoading(true);
        const data = await ConnectService.getTalents(filter === '全部' ? undefined : filter);
        setTalents(data);
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
                alert("點數不足！請先儲值。");
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
        <div className="space-y-6 animate-fade-in">
            {/* Filter Bar */}
            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setFilter(cat)}
                        className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors border ${
                            filter === cat 
                            ? 'bg-yellow-500 text-black border-yellow-500' 
                            : 'bg-dark text-gray-400 border-gray-700 hover:border-gray-500'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Grid */}
            {loading ? (
                <div className="text-center py-20 text-gray-500">
                    <div className="loader border-t-yellow-500 mb-4 mx-auto"></div>
                    載入素人資料庫...
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {talents.map(talent => {
                        const isUnlocked = ConnectService.isUnlocked(talent.id);
                        const isBoosted = talent.isBoosted;
                        
                        return (
                            <div key={talent.id} className={`relative bg-card rounded-2xl overflow-hidden border transition-all hover:shadow-2xl group ${isBoosted ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.1)]' : 'border-gray-700'}`}>
                                {isBoosted && <div className="absolute top-0 right-0 bg-yellow-500 text-black text-[10px] font-black px-2 py-1 rounded-bl-lg z-10">⚡ BOOSTED</div>}
                                
                                <div className="p-6">
                                    <div className="flex items-center gap-4 mb-4">
                                        {/* Avatar with Blur Logic */}
                                        <div className="relative">
                                            <img 
                                                src={talent.avatarUrl} 
                                                className={`w-16 h-16 rounded-full border-2 border-gray-600 transition-all duration-500 ${!isUnlocked ? 'blur-md grayscale opacity-50' : ''}`} 
                                                alt="Avatar"
                                            />
                                            {!isUnlocked && (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className="text-xl">🔒</span>
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div>
                                            <h3 className={`font-bold text-white text-lg ${!isUnlocked ? 'blur-[2px] select-none' : ''}`}>
                                                {!isUnlocked ? 'User_Hidden' : talent.displayName}
                                            </h3>
                                            <div className="flex gap-2 mt-1">
                                                {talent.tags.slice(0, 2).map(tag => (
                                                    <span key={tag} className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 gap-2 mb-4 bg-black/20 p-3 rounded-xl">
                                        <div className="text-center">
                                            <p className="text-[10px] text-gray-500 uppercase tracking-widest">粉絲數</p>
                                            <p className="font-mono text-white font-bold">{talent.followersCount.toLocaleString()}</p>
                                        </div>
                                        <div className="text-center border-l border-gray-700">
                                            <p className="text-[10px] text-gray-500 uppercase tracking-widest">互動率</p>
                                            <p className="font-mono text-green-400 font-bold">{talent.engagementRate}%</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mb-6">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-500">預算區間</span>
                                            <span className="text-yellow-400 font-bold">{talent.priceRange}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-500">主要類別</span>
                                            <span className="text-white">{talent.categories.join(', ')}</span>
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    {isUnlocked ? (
                                        <div className="bg-green-900/20 border border-green-600/50 p-3 rounded-xl text-center">
                                            <p className="text-green-400 font-bold text-sm">✅ 已解鎖聯絡資訊</p>
                                            <p className="text-xs text-gray-300 mt-1 select-all">{talent.contactInfo?.email}</p>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => handleUnlock(talent)}
                                            disabled={!!unlockingId}
                                            className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-black py-3 rounded-xl transition-all shadow-lg hover:shadow-yellow-500/20 flex items-center justify-center gap-2"
                                        >
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
