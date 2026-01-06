
import React, { useState, useEffect } from 'react';
import { UserProfile, SocialCard, UserRole } from '../../types';
import { ConnectService } from '../../services/connectService';

interface Props {
    user: UserProfile;
    onSave: () => void;
}

const CATEGORIES = ['美食', '旅遊', '美妝', '3C', '攝影', '健身', '親子', '寵物', '理財', '生活'];

const MyCardEditor: React.FC<Props> = ({ user, onSave }) => {
    const [card, setCard] = useState<Partial<SocialCard>>({
        userId: user.user_id,
        displayName: '',
        role: user.role,
        tags: [],
        categories: [],
        followersCount: 0,
        engagementRate: 0,
        priceRange: '500 - 1,500',
        bio: '',
        isVisible: true,
        contactInfo: { email: user.email }
    });
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newTag, setNewTag] = useState('');

    // Permission Check
    const canCreate = ['starter', 'pro', 'business', 'admin'].includes(user.role);

    useEffect(() => {
        loadProfile();
    }, [user.user_id]);

    const loadProfile = async () => {
        setLoading(true);
        const profile = await ConnectService.getMyProfile(user.user_id);
        if (profile) {
            setCard(profile);
        } else {
            // Default init
            setCard(prev => ({
                ...prev,
                displayName: user.email.split('@')[0],
                avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.user_id}&backgroundColor=b6e3f4`
            }));
        }
        setLoading(false);
    };

    const handleSave = async () => {
        if (!card.displayName || !card.categories?.length) {
            return alert("請填寫暱稱與至少一個分類");
        }
        setSaving(true);
        try {
            await ConnectService.saveMyProfile({
                ...card,
                userId: user.user_id,
                role: user.role,
            } as SocialCard);
            alert("✅ 名片已儲存並更新至廣場！");
            onSave();
        } catch (e: any) {
            alert("儲存失敗: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleCategory = (cat: string) => {
        const current = card.categories || [];
        if (current.includes(cat)) {
            setCard({ ...card, categories: current.filter(c => c !== cat) });
        } else {
            if (current.length >= 3) return alert("最多選擇 3 個分類");
            setCard({ ...card, categories: [...current, cat] });
        }
    };

    const addTag = () => {
        if (!newTag.trim()) return;
        if ((card.tags || []).length >= 5) return alert("最多 5 個標籤");
        setCard({ ...card, tags: [...(card.tags || []), `#${newTag.replace('#', '')}`] });
        setNewTag('');
    };

    if (!canCreate) {
        return (
            <div className="text-center py-20 bg-dark/30 rounded-xl border border-gray-700">
                <div className="text-4xl mb-4">🔒</div>
                <h3 className="text-xl font-bold text-white mb-2">權限不足</h3>
                <p className="text-gray-400 mb-6">建立接案名片功能僅限 <span className="text-yellow-400 font-bold">Starter 方案</span> 以上會員使用。</p>
                <div className="text-sm text-gray-500">請前往「費率說明」升級方案。</div>
            </div>
        );
    }

    if (loading) return <div className="p-10 text-center text-gray-500">載入名片資料中...</div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
            {/* Left: Form */}
            <div className="space-y-6">
                <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-4">
                    <h3 className="text-lg font-bold text-white border-b border-gray-700 pb-2">編輯資料</h3>
                    
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">顯示暱稱 *</label>
                        <input value={card.displayName} onChange={e => setCard({...card, displayName: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">主要分類 (最多3個) *</label>
                        <div className="flex flex-wrap gap-2">
                            {CATEGORIES.map(cat => (
                                <button 
                                    key={cat} 
                                    onClick={() => toggleCategory(cat)}
                                    className={`px-3 py-1 rounded text-xs border transition-colors ${card.categories?.includes(cat) ? 'bg-primary text-black border-primary' : 'bg-transparent text-gray-400 border-gray-600'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">粉絲數 (預估)</label>
                            <input type="number" value={card.followersCount} onChange={e => setCard({...card, followersCount: parseInt(e.target.value)})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">平均互動率 (%)</label>
                            <input type="number" step="0.1" value={card.engagementRate} onChange={e => setCard({...card, engagementRate: parseFloat(e.target.value)})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">接案報價區間 (TWD)</label>
                        <input value={card.priceRange} onChange={e => setCard({...card, priceRange: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" placeholder="例: 500 - 2,000 / 篇" />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">特色標籤 (Tags)</label>
                        <div className="flex gap-2 mb-2">
                            <input value={newTag} onChange={e => setNewTag(e.target.value)} className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white text-xs" placeholder="輸入標籤..." onKeyDown={e => e.key === 'Enter' && addTag()} />
                            <button onClick={addTag} className="bg-gray-700 text-white px-3 rounded text-xs">新增</button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {card.tags?.map((t, i) => (
                                <span key={i} className="text-[10px] bg-gray-800 text-gray-300 px-2 py-1 rounded flex items-center gap-1">
                                    {t} <button onClick={() => setCard({...card, tags: card.tags?.filter((_, idx) => idx !== i)})} className="hover:text-white">×</button>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">自我介紹 / 接案說明</label>
                        <textarea value={card.bio} onChange={e => setCard({...card, bio: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white h-24 resize-none text-sm" />
                    </div>

                    <div className="border-t border-gray-700 pt-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={card.isVisible} onChange={e => setCard({...card, isVisible: e.target.checked})} className="w-4 h-4 rounded text-primary" />
                            <span className="text-sm text-white">公開我的名片 (讓廠商搜尋得到)</span>
                        </label>
                    </div>
                </div>

                <div className="flex justify-end">
                    <button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-cyan-400 text-black font-bold py-3 px-8 rounded-xl shadow-lg transition-all disabled:opacity-50">
                        {saving ? '儲存中...' : '儲存設定'}
                    </button>
                </div>
            </div>

            {/* Right: Preview */}
            <div className="flex flex-col items-center">
                <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-widest">名片預覽 (甲方視角)</h3>
                
                <div className={`relative bg-card rounded-2xl overflow-hidden border w-full max-w-sm ${card.isBoosted ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.1)]' : 'border-gray-700'}`}>
                    {card.isBoosted && <div className="absolute top-0 right-0 bg-yellow-500 text-black text-[10px] font-black px-2 py-1 rounded-bl-lg z-10">⚡ BOOSTED</div>}
                    
                    <div className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <img 
                                src={card.avatarUrl} 
                                className="w-16 h-16 rounded-full border-2 border-gray-600"
                                alt="Avatar"
                            />
                            <div>
                                <h3 className="font-bold text-white text-lg">{card.displayName || '您的暱稱'}</h3>
                                <div className="flex gap-2 mt-1 flex-wrap">
                                    {(card.tags?.slice(0, 2) || []).map(tag => (
                                        <span key={tag} className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                                            {tag}
                                        </span>
                                    ))}
                                    {(!card.tags?.length) && <span className="text-[10px] text-gray-600">#標籤</span>}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-4 bg-black/20 p-3 rounded-xl">
                            <div className="text-center">
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest">粉絲數</p>
                                <p className="font-mono text-white font-bold">{card.followersCount?.toLocaleString() || 0}</p>
                            </div>
                            <div className="text-center border-l border-gray-700">
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest">互動率</p>
                                <p className="font-mono text-green-400 font-bold">{card.engagementRate || 0}%</p>
                            </div>
                        </div>

                        <div className="space-y-2 mb-6">
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500">預算區間</span>
                                <span className="text-yellow-400 font-bold">{card.priceRange || '$0'}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500">主要類別</span>
                                <span className="text-white">{(card.categories || []).join(', ') || '未設定'}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-2 line-clamp-2">{card.bio || '這裡會顯示您的自我介紹...'}</p>
                        </div>

                        <button disabled className="w-full bg-gray-700 text-gray-400 font-black py-3 rounded-xl cursor-not-allowed text-xs">
                            🔒 解鎖並聯繫 (預覽模式)
                        </button>
                    </div>
                </div>
                
                <div className="mt-6 text-center text-xs text-gray-500">
                    <p>提示：完整的名片將增加廠商聯繫的意願。</p>
                </div>
            </div>
        </div>
    );
};

export default MyCardEditor;
