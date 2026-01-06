
import React, { useState, useEffect } from 'react';
import { UserProfile, SocialCard, BrandSettings } from '../../types';
import { ConnectService, CONNECT_CATEGORIES } from '../../services/connectService';
import { fetchPageAnalytics } from '../../services/facebookService';
import { fetchUserThreads } from '../../services/threadsService';

interface Props {
    user: UserProfile;
    settings: BrandSettings;
    onSave: () => void;
}

const SPECIALTIES_OPTIONS = [
    "短影音 (Reels/TikTok)",
    "深度開箱評測",
    "生活圖文",
    "知識懶人包",
    "爆文",
    "高質感攝影",
    "直播帶貨"
];

const MyCardEditor: React.FC<Props> = ({ user, settings, onSave }) => {
    const [card, setCard] = useState<Partial<SocialCard>>({
        userId: user.user_id,
        displayName: '',
        role: user.role,
        tags: [],
        categories: [],
        specialties: [],
        followersCount: 0,
        engagementRate: 0,
        priceRange: '500 - 1500',
        bio: '',
        isVisible: true,
        contactInfo: { email: user.email }
    });
    
    // Price Range State
    const [priceMin, setPriceMin] = useState<string>('500');
    const [priceMax, setPriceMax] = useState<string>('1500');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [newTag, setNewTag] = useState('');
    const [showConsent, setShowConsent] = useState(false);

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
            // Parse existing price range
            if (profile.priceRange) {
                const parts = profile.priceRange.replace(/[^0-9-]/g, '').split('-');
                if (parts.length === 2) {
                    setPriceMin(parts[0].trim());
                    setPriceMax(parts[1].trim());
                }
            }
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

    const handleAutoSync = async () => {
        const hasFB = !!(settings.facebookPageId && settings.facebookToken);
        const hasThreads = !!(settings.threadsAccounts && settings.threadsAccounts.length > 0);

        if (!hasFB && !hasThreads) {
            return alert("請先至「品牌設定」連結 Facebook 粉專或 Threads 帳號，才能自動抓取數據。");
        }

        setSyncing(true);
        try {
            let fbFollowers = 0;
            let fbEngagement = 0;
            let threadsEngagement = 0;
            let syncedSources = [];

            if (hasFB) {
                try {
                    const analytics = await fetchPageAnalytics(settings.facebookPageId, settings.facebookToken);
                    if (analytics) {
                        fbFollowers = analytics.followers;
                        fbEngagement = analytics.engagementRate;
                        syncedSources.push('Facebook');
                    }
                } catch (e) { console.warn("FB Sync Failed", e); }
            }

            if (hasThreads) {
                try {
                    const activeAccount = settings.threadsAccounts!.find(a => a.isActive);
                    if (activeAccount) {
                        const posts = await fetchUserThreads(activeAccount, 5);
                        if (posts.length > 0) {
                            threadsEngagement = 2.5; // Baseline estimation
                            syncedSources.push('Threads');
                        }
                    }
                } catch (e) { console.warn("Threads Sync Failed", e); }
            }
            
            const finalFollowers = fbFollowers > 0 ? fbFollowers : card.followersCount;
            const finalEngagement = fbFollowers > 0 ? fbEngagement : (threadsEngagement > 0 ? threadsEngagement : card.engagementRate);

            if (syncedSources.length > 0) {
                setCard(prev => ({
                    ...prev,
                    followersCount: finalFollowers,
                    engagementRate: finalEngagement
                }));
                alert(`✅ 同步成功！(來源: ${syncedSources.join(', ')})\n粉絲數：${finalFollowers || '(未偵測到公開數據)'}\n互動率：${finalEngagement}%`);
            } else {
                alert("⚠️ 同步完成，但無法讀取到有效數據 (可能是權限不足或粉專無數據)。");
            }

        } catch (e: any) {
            alert(`同步失敗: ${e.message}`);
        } finally {
            setSyncing(false);
        }
    };

    const confirmSave = async () => {
        setSaving(true);
        
        // Format Price Range
        const formattedPriceRange = `${parseInt(priceMin || '0').toLocaleString()} - ${parseInt(priceMax || '0').toLocaleString()}`;

        try {
            await ConnectService.saveMyProfile({
                ...card,
                priceRange: formattedPriceRange,
                userId: user.user_id,
                role: user.role,
            } as SocialCard);
            alert("✅ 名片已儲存並更新至廣場！");
            setShowConsent(false);
            onSave();
        } catch (e: any) {
            console.error("Save failed:", e);
            if (e.code === 'permission-denied' || e.message.includes('permission')) {
                alert("❌ 儲存失敗：權限不足。\n\n請檢查 Firebase Firestore Rules 設定，確保您有權寫入 'connect_profiles' 集合。");
            } else {
                alert("儲存失敗: " + e.message);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleSaveClick = () => {
        if (!card.displayName || !card.categories?.length) {
            return alert("請填寫暱稱與至少一個分類");
        }
        if (parseInt(priceMin) > parseInt(priceMax)) {
            return alert("報價區間錯誤：最低價不能高於最高價");
        }
        setShowConsent(true);
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

    const toggleSpecialty = (spec: string) => {
        const current = card.specialties || [];
        if (current.includes(spec)) {
            setCard({ ...card, specialties: current.filter(s => s !== spec) });
        } else {
            if (current.length >= 3) return alert("擅長形式最多選擇 3 項");
            setCard({ ...card, specialties: [...current, spec] });
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in relative">
            
            {/* Left: Form */}
            <div className="space-y-6">
                <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                        <h3 className="text-lg font-bold text-white">編輯資料</h3>
                        <button 
                            onClick={handleAutoSync}
                            disabled={syncing}
                            className="bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 text-xs px-3 py-1.5 rounded-lg border border-blue-800 transition-colors flex items-center gap-1"
                        >
                            {syncing ? <div className="loader w-3 h-3 border-t-blue-300"></div> : '🔄'} 
                            一鍵同步 (FB/Threads)
                        </button>
                    </div>
                    
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">顯示暱稱 *</label>
                        <input value={card.displayName} onChange={e => setCard({...card, displayName: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">主要分類 (最多3個) *</label>
                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar p-1 border border-gray-700/50 rounded bg-black/20">
                            {CONNECT_CATEGORIES.map(cat => (
                                <button 
                                    key={cat} 
                                    onClick={() => toggleCategory(cat)}
                                    className={`px-3 py-1 rounded text-xs border transition-colors whitespace-nowrap ${card.categories?.includes(cat) ? 'bg-primary text-black border-primary' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">擅長形式 (最多3項)</label>
                        <div className="flex flex-wrap gap-2">
                            {SPECIALTIES_OPTIONS.map(spec => (
                                <button 
                                    key={spec} 
                                    onClick={() => toggleSpecialty(spec)}
                                    className={`px-3 py-1 rounded-full text-xs border transition-colors whitespace-nowrap ${card.specialties?.includes(spec) ? 'bg-purple-900/50 text-purple-200 border-purple-500' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}`}
                                >
                                    {spec}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">粉絲數 (可自動抓取)</label>
                            <input type="number" value={card.followersCount} onChange={e => setCard({...card, followersCount: parseInt(e.target.value)})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">平均互動率 (%)</label>
                            <input type="number" step="0.1" value={card.engagementRate} onChange={e => setCard({...card, engagementRate: parseFloat(e.target.value)})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">接案報價區間 (TWD)</label>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 relative">
                                <span className="absolute left-3 top-2.5 text-gray-500 text-xs">$</span>
                                <input 
                                    type="number" 
                                    value={priceMin} 
                                    onChange={e => setPriceMin(e.target.value)} 
                                    className="w-full bg-dark border border-gray-600 rounded p-2 pl-6 text-white" 
                                    placeholder="最低" 
                                />
                            </div>
                            <span className="text-gray-400 font-bold">~</span>
                            <div className="flex-1 relative">
                                <span className="absolute left-3 top-2.5 text-gray-500 text-xs">$</span>
                                <input 
                                    type="number" 
                                    value={priceMax} 
                                    onChange={e => setPriceMax(e.target.value)} 
                                    className="w-full bg-dark border border-gray-600 rounded p-2 pl-6 text-white" 
                                    placeholder="最高" 
                                />
                            </div>
                        </div>
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
                    <button onClick={handleSaveClick} disabled={saving} className="bg-primary hover:bg-cyan-400 text-black font-bold py-3 px-8 rounded-xl shadow-lg transition-all disabled:opacity-50">
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

                        {card.specialties && card.specialties.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-4">
                                {card.specialties.map(spec => (
                                    <span key={spec} className="text-[10px] bg-purple-900/40 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded">
                                        {spec}
                                    </span>
                                ))}
                            </div>
                        )}

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
                                <span className="text-yellow-400 font-bold">{parseInt(priceMin || '0').toLocaleString()} - {parseInt(priceMax || '0').toLocaleString()}</span>
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

            {/* Consent Modal */}
            {showConsent && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] p-6 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 border border-gray-600 rounded-xl max-w-md w-full p-6 shadow-2xl relative">
                        <h3 className="text-xl font-black text-white mb-4 flex items-center gap-2">
                            ⚠️ 資料公開聲明 (Data Privacy)
                        </h3>
                        <div className="text-sm text-gray-300 space-y-4 mb-6 leading-relaxed">
                            <p>
                                您即將儲存並發佈您的接案名片。請確認您理解以下事項：
                            </p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>
                                    <strong>公開展示：</strong>您填寫的資料（暱稱、粉絲數、報價、自我介紹）將公開於 AutoSocial Connect 平台，供品牌方與其他會員搜尋瀏覽。
                                </li>
                                <li>
                                    <strong>聯絡資訊：</strong>您的 Email 或 Line ID 僅在品牌方支付點數解鎖後才會顯示，但請勿在「自我介紹」中直接填寫私密個資。
                                </li>
                                <li>
                                    <strong>真實性承諾：</strong>若您使用自動串接功能，即代表同意平台讀取並顯示您的社群帳號公開數據（如追蹤數）。
                                </li>
                            </ul>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button 
                                onClick={() => setShowConsent(false)}
                                className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                            >
                                取消
                            </button>
                            <button 
                                onClick={confirmSave}
                                className="px-6 py-2 rounded-lg bg-primary hover:bg-cyan-400 text-black font-bold transition-colors"
                            >
                                我同意並儲存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyCardEditor;
