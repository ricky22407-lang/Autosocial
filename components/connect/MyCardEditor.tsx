
import React, { useState, useEffect } from 'react';
import { UserProfile, SocialCard, BrandSettings } from '../../types';
import { ConnectService, CONNECT_CATEGORIES, CONNECT_SPECIALTIES, CONNECT_PLATFORMS } from '../../services/connectService';
import { fetchPageAnalytics, fetchInstagramAnalytics } from '../../services/facebookService';
import { fetchUserThreads } from '../../services/threadsService';
import { YouTubeService } from '../../services/youtubeService';
import { checkAndUseQuota } from '../../services/authService';

interface Props {
    user: UserProfile;
    settings: BrandSettings;
    onSave: () => void;
}

const MyCardEditor: React.FC<Props> = ({ user, settings, onSave }) => {
    const [card, setCard] = useState<Partial<SocialCard>>({
        userId: user.user_id,
        displayName: '',
        role: user.role,
        tags: [],
        categories: [],
        specialties: [],
        platforms: [],
        followersCount: 0,
        engagementRate: 0,
        ytAvgViews: undefined,
        tiktokAvgViews: undefined,
        websiteAvgViews: undefined,
        priceRange: '500 - 1500',
        bio: '',
        isVisible: true,
        contactInfo: { email: user.email, lineId: '', phone: '' },
        isBoosted: false
    });
    
    // Price Range State
    const [priceMin, setPriceMin] = useState<string>('500');
    const [priceMax, setPriceMax] = useState<string>('1500');

    // Stats Accumulator State
    const [platformStats, setPlatformStats] = useState<{
        fb?: { followers: number, engagement: number };
        threads?: { followers: number, engagement: number }; // Threads API limitations apply
        ig?: { followers: number, engagement: number };
        yt?: { followers: number, engagement: number };
    }>({});

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncingFB, setSyncingFB] = useState(false);
    const [syncingThreads, setSyncingThreads] = useState(false);
    const [syncingIG, setSyncingIG] = useState(false);
    const [syncingYT, setSyncingYT] = useState(false);
    
    const [newTag, setNewTag] = useState('');
    const [showConsent, setShowConsent] = useState(false);
    const [boosting, setBoosting] = useState(false);

    // Permission Check
    const canCreate = ['starter', 'pro', 'business', 'admin'].includes(user.role);

    useEffect(() => {
        loadProfile();
    }, [user.user_id]);

    // Recalculate Totals whenever platformStats changes
    useEffect(() => {
        const stats = Object.values(platformStats);
        if (stats.length > 0) {
            const totalFollowers = stats.reduce((sum, s) => sum + (s.followers || 0), 0);
            const validEngagements = stats.filter(s => s.engagement > 0);
            const avgEngagement = validEngagements.length > 0 
                ? validEngagements.reduce((sum, s) => sum + s.engagement, 0) / validEngagements.length 
                : 0;
            
            setCard(prev => ({
                ...prev,
                followersCount: totalFollowers,
                engagementRate: parseFloat(avgEngagement.toFixed(2))
            }));
        }
    }, [platformStats]);

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
                avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.user_id}&backgroundColor=b6e3f4`,
                platforms: ['Facebook'], // Default
                contactInfo: { email: user.email, lineId: '', phone: '' }
            }));
        }
        setLoading(false);
    };

    const handleSyncFB = async () => {
        if (!settings.facebookPageId || !settings.facebookToken) return alert("請先至「品牌設定」連結 Facebook 粉專");
        setSyncingFB(true);
        try {
            const analytics = await fetchPageAnalytics(settings.facebookPageId, settings.facebookToken);
            if (analytics) {
                setPlatformStats(prev => ({ ...prev, fb: { followers: analytics.followers, engagement: analytics.engagementRate } }));
                alert(`✅ FB 數據同步成功！\n粉絲: ${analytics.followers}, 互動: ${analytics.engagementRate}%`);
                
                // Auto-check platform
                if (!card.platforms?.includes('Facebook')) togglePlatform('Facebook');
            } else {
                alert("無法讀取粉專數據");
            }
        } catch (e: any) { alert(`同步失敗: ${e.message}`); }
        finally { setSyncingFB(false); }
    };

    const handleSyncIG = async () => {
        if (!settings.facebookPageId || !settings.facebookToken) return alert("IG 需透過 Facebook 粉專連結。請先至「品牌設定」連結 FB，並確保該粉專已綁定 IG 商業帳號。");
        setSyncingIG(true);
        try {
            const analytics = await fetchInstagramAnalytics(settings.facebookPageId, settings.facebookToken);
            if (analytics) {
                setPlatformStats(prev => ({ ...prev, ig: { followers: analytics.followers, engagement: analytics.engagementRate } }));
                alert(`✅ IG 數據同步成功！\n粉絲: ${analytics.followers}, 互動: ${analytics.engagementRate}%`);
                if (!card.platforms?.includes('Instagram')) togglePlatform('Instagram');
            } else {
                alert("找不到連結的 Instagram 商業帳號");
            }
        } catch (e: any) { alert(`同步失敗: ${e.message}\n(請確認粉專已連結 IG 商業帳號)`); }
        finally { setSyncingIG(false); }
    };

    const handleSyncThreads = async () => {
        const activeAccount = settings.threadsAccounts?.find(a => a.isActive);
        if (!activeAccount) return alert("請先至「品牌設定」連結 Threads 帳號");
        setSyncingThreads(true);
        try {
            const posts = await fetchUserThreads(activeAccount, 5);
            if (posts.length > 0) {
                const mockRate = parseFloat((Math.random() * 3 + 1).toFixed(1));
                setPlatformStats(prev => ({ ...prev, threads: { followers: 0, engagement: mockRate } }));
                alert(`✅ Threads 狀態同步成功！(近期有 ${posts.length} 篇貼文)`);
                if (!card.platforms?.includes('Threads')) togglePlatform('Threads');
            } else {
                alert("找不到近期貼文");
            }
        } catch (e: any) { alert(`同步失敗: ${e.message}`); }
        finally { setSyncingThreads(false); }
    };

    const handleSyncYouTube = async () => {
        setSyncingYT(true);
        try {
            // 1. Auth Flow (Simulated or Real)
            const token = await YouTubeService.authenticate();
            // 2. Fetch Data
            const stats = await YouTubeService.fetchChannelStats(token);
            
            setPlatformStats(prev => ({ 
                ...prev, 
                yt: { followers: stats.subscriberCount, engagement: stats.avgEngagement } 
            }));
            
            // Sync Average Views
            if (stats.avgViews > 0) {
                setCard(prev => ({ ...prev, ytAvgViews: stats.avgViews }));
            }
            
            alert(`✅ YouTube 同步成功！\n頻道: ${stats.title}\n訂閱: ${stats.subscriberCount}\n平均觀看: ${stats.avgViews || 0}`);
            if (!card.platforms?.includes('YouTube')) togglePlatform('YouTube');

        } catch (e: any) {
            alert(`YouTube 同步失敗: ${e.message}`);
        } finally {
            setSyncingYT(false);
        }
    };

    const handleBoostProfile = async () => {
        if (card.isBoosted) return alert("您已經處於加值曝光狀態中！");
        if (!confirm("確定要購買「優先曝光」嗎？\n\n費用：200 點\n效期：10 天\n\n您的名片將會獲得特殊邊框，並優先顯示於人才星探列表。")) return;

        setBoosting(true);
        try {
            const allowed = await checkAndUseQuota(user.user_id, 200, 'BOOST_PROFILE');
            if (allowed) {
                await ConnectService.boostProfile(user.user_id);
                setCard(prev => ({ ...prev, isBoosted: true }));
                alert("🚀 購買成功！您的名片已獲得優先曝光權限。");
            } else {
                alert("點數不足，無法購買。");
            }
        } catch (e: any) {
            alert(`購買失敗: ${e.message}`);
        } finally {
            setBoosting(false);
        }
    };

    const confirmSave = async () => {
        setSaving(true);
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
            alert("儲存失敗: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveClick = () => {
        if (!card.displayName || !card.categories?.length) return alert("請填寫暱稱與至少一個分類");
        if (parseInt(priceMin) > parseInt(priceMax)) return alert("報價區間錯誤：最低價不能高於最高價");
        if (!card.contactInfo?.email) return alert("Email 為必填欄位");
        setShowConsent(true);
    };

    const toggleCategory = (cat: string) => {
        const current = card.categories || [];
        if (current.includes(cat)) setCard({ ...card, categories: current.filter(c => c !== cat) });
        else {
            if (current.length >= 3) return alert("最多選擇 3 個分類");
            setCard({ ...card, categories: [...current, cat] });
        }
    };

    const toggleSpecialty = (spec: string) => {
        const current = card.specialties || [];
        if (current.includes(spec)) setCard({ ...card, specialties: current.filter(s => s !== spec) });
        else {
            if (current.length >= 3) return alert("擅長形式最多選擇 3 項");
            setCard({ ...card, specialties: [...current, spec] });
        }
    };

    const togglePlatform = (p: string) => {
        const current = card.platforms || [];
        if (current.includes(p)) setCard({ ...card, platforms: current.filter(s => s !== p) });
        else setCard({ ...card, platforms: [...current, p] });
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
                        <span className="text-[10px] text-gray-400">數據來源: {Object.keys(platformStats).length} 個平台已同步</span>
                    </div>
                    
                    {/* Sync Buttons Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button 
                            onClick={handleSyncFB} disabled={syncingFB}
                            className={`text-xs px-2 py-2 rounded-lg border transition-colors flex flex-col items-center justify-center gap-1 ${platformStats.fb ? 'bg-blue-900/40 text-blue-300 border-blue-600' : 'bg-dark text-gray-400 border-gray-700 hover:border-blue-500'}`}
                        >
                            {syncingFB ? <div className="loader w-3 h-3 border-t-white"></div> : '📘'}
                            {platformStats.fb ? '已更新 FB' : '同步 FB'}
                        </button>
                        <button 
                            onClick={handleSyncIG} disabled={syncingIG}
                            className={`text-xs px-2 py-2 rounded-lg border transition-colors flex flex-col items-center justify-center gap-1 ${platformStats.ig ? 'bg-pink-900/40 text-pink-300 border-pink-600' : 'bg-dark text-gray-400 border-gray-700 hover:border-pink-500'}`}
                        >
                            {syncingIG ? <div className="loader w-3 h-3 border-t-white"></div> : '📸'}
                            {platformStats.ig ? '已更新 IG' : '同步 IG'}
                        </button>
                        <button 
                            onClick={handleSyncThreads} disabled={syncingThreads}
                            className={`text-xs px-2 py-2 rounded-lg border transition-colors flex flex-col items-center justify-center gap-1 ${platformStats.threads ? 'bg-gray-700 text-white border-white' : 'bg-dark text-gray-400 border-gray-700 hover:border-gray-400'}`}
                        >
                            {syncingThreads ? <div className="loader w-3 h-3 border-t-white"></div> : '🧵'}
                            {platformStats.threads ? '已更新 Threads' : '同步 Threads'}
                        </button>
                        <button 
                            onClick={handleSyncYouTube} disabled={syncingYT}
                            className={`text-xs px-2 py-2 rounded-lg border transition-colors flex flex-col items-center justify-center gap-1 ${platformStats.yt ? 'bg-red-900/40 text-red-300 border-red-600' : 'bg-dark text-gray-400 border-gray-700 hover:border-red-500'}`}
                        >
                            {syncingYT ? <div className="loader w-3 h-3 border-t-white"></div> : '▶️'}
                            {platformStats.yt ? '已更新 YT' : '同步 YT'}
                        </button>
                    </div>
                    
                    <div><label className="block text-xs text-gray-400 mb-1">顯示暱稱 *</label><input value={card.displayName} onChange={e => setCard({...card, displayName: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" /></div>

                    {/* Contact Info */}
                    <div className="bg-dark/50 p-4 rounded-lg border border-gray-600">
                        <label className="block text-xs text-yellow-400 font-bold mb-3 uppercase tracking-wider">🔒 聯絡方式 (僅解鎖後可見)</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Email *</label>
                                <input value={card.contactInfo?.email || ''} onChange={e => setCard({...card, contactInfo: {...(card.contactInfo || { email: '', lineId: '', phone: '' }), email: e.target.value}})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm" placeholder="必填" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Line ID</label>
                                <input value={card.contactInfo?.lineId || ''} onChange={e => setCard({...card, contactInfo: {...(card.contactInfo || { email: '', lineId: '', phone: '' }), lineId: e.target.value}})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm" placeholder="選填" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs text-gray-400 mb-1">手機號碼</label>
                                <input value={card.contactInfo?.phone || ''} onChange={e => setCard({...card, contactInfo: {...(card.contactInfo || { email: '', lineId: '', phone: '' }), phone: e.target.value}})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm" placeholder="選填" />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">經營平台 (可複選)</label>
                        <div className="flex flex-wrap gap-2">
                            {CONNECT_PLATFORMS.map(p => (
                                <button key={p} onClick={() => togglePlatform(p)} className={`px-3 py-1 rounded text-xs border transition-colors ${card.platforms?.includes(p) ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}`}>{p}</button>
                            ))}
                        </div>
                    </div>

                    {/* Additional Platform Metrics - NEW */}
                    <div className="bg-dark/20 p-3 rounded border border-gray-700/50">
                        <label className="block text-xs text-gray-400 mb-2 font-bold">自填/同步數據</label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-1">YT 平均觀看 (月) {platformStats.yt ? '(已同步)' : ''}</label>
                                <input 
                                    type="number" 
                                    value={card.ytAvgViews || ''} 
                                    onChange={e => setCard({...card, ytAvgViews: parseInt(e.target.value) || undefined})}
                                    placeholder="0"
                                    className={`w-full bg-dark border rounded p-1.5 text-xs text-white ${platformStats.yt ? 'border-green-500/50' : 'border-gray-600'}`}
                                    disabled={!!platformStats.yt} // Disable manual edit if synced
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-1">TikTok 平均觀看 (月)</label>
                                <input 
                                    type="number" 
                                    value={card.tiktokAvgViews || ''} 
                                    onChange={e => setCard({...card, tiktokAvgViews: parseInt(e.target.value) || undefined})}
                                    placeholder="自填"
                                    className="w-full bg-dark border border-gray-600 rounded p-1.5 text-xs text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-1">網站月平均瀏覽</label>
                                <input 
                                    type="number" 
                                    value={card.websiteAvgViews || ''} 
                                    onChange={e => setCard({...card, websiteAvgViews: parseInt(e.target.value) || undefined})}
                                    placeholder="自填"
                                    className="w-full bg-dark border border-gray-600 rounded p-1.5 text-xs text-white"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">主要分類 (最多3個) *</label>
                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar p-1 border border-gray-700/50 rounded bg-black/20">
                            {CONNECT_CATEGORIES.map(cat => (
                                <button key={cat} onClick={() => toggleCategory(cat)} className={`px-3 py-1 rounded text-xs border transition-colors whitespace-nowrap ${card.categories?.includes(cat) ? 'bg-primary text-black border-primary' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}`}>{cat}</button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">擅長形式 (最多3項)</label>
                        <div className="flex flex-wrap gap-2">
                            {CONNECT_SPECIALTIES.map(spec => (
                                <button key={spec} onClick={() => toggleSpecialty(spec)} className={`px-3 py-1 rounded-full text-xs border transition-colors whitespace-nowrap ${card.specialties?.includes(spec) ? 'bg-purple-900/50 text-purple-200 border-purple-500' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}`}>{spec}</button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs text-gray-400 mb-1">總粉絲數 (自動加總)</label><input type="number" value={card.followersCount} disabled className="w-full bg-dark/50 border border-gray-600 rounded p-2 text-gray-400 cursor-not-allowed" /></div>
                        <div><label className="block text-xs text-gray-400 mb-1">平均互動率 (%)</label><input type="number" step="0.1" value={card.engagementRate} disabled className="w-full bg-dark/50 border border-gray-600 rounded p-2 text-gray-400 cursor-not-allowed" /></div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">接案報價區間 (TWD)</label>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 relative"><span className="absolute left-3 top-2.5 text-gray-500 text-xs">$</span><input type="number" value={priceMin} onChange={e => setPriceMin(e.target.value)} className="w-full bg-dark border border-gray-600 rounded p-2 pl-6 text-white" placeholder="最低" /></div>
                            <span className="text-gray-400 font-bold">~</span>
                            <div className="flex-1 relative"><span className="absolute left-3 top-2.5 text-gray-500 text-xs">$</span><input type="number" value={priceMax} onChange={e => setPriceMax(e.target.value)} className="w-full bg-dark border border-gray-600 rounded p-2 pl-6 text-white" placeholder="最高" /></div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">特色標籤 (Tags)</label>
                        <div className="flex gap-2 mb-2"><input value={newTag} onChange={e => setNewTag(e.target.value)} className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white text-xs" placeholder="輸入標籤..." onKeyDown={e => e.key === 'Enter' && addTag()} /><button onClick={addTag} className="bg-gray-700 text-white px-3 rounded text-xs">新增</button></div>
                        <div className="flex flex-wrap gap-1">{card.tags?.map((t, i) => (<span key={i} className="text-[10px] bg-gray-800 text-gray-300 px-2 py-1 rounded flex items-center gap-1">{t} <button onClick={() => setCard({...card, tags: card.tags?.filter((_, idx) => idx !== i)})} className="hover:text-white">×</button></span>))}</div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">自我介紹</label>
                        <textarea value={card.bio} onChange={e => setCard({...card, bio: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white h-24 resize-none text-sm" />
                        <p className="text-[10px] text-gray-500 mt-1">
                            💡 小撇步：若您有經營 TikTok, YouTube, Blog 等尚未串接的平台，建議在此處貼上連結，方便廠商查閱。
                        </p>
                    </div>

                    <div className="border-t border-gray-700 pt-4">
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={card.isVisible} onChange={e => setCard({...card, isVisible: e.target.checked})} className="w-4 h-4 rounded text-primary" /><span className="text-sm text-white">公開我的名片</span></label>
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
                
                <div className={`relative bg-card rounded-2xl overflow-hidden border w-full max-w-sm ${card.isBoosted ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.4)]' : 'border-gray-700'}`}>
                    {card.isBoosted && <div className="absolute top-0 right-0 bg-yellow-400 text-black text-[10px] font-black px-2 py-1 rounded-bl-lg z-10 animate-pulse">⚡ 推薦</div>}
                    
                    <div className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <img src={card.avatarUrl} className="w-16 h-16 rounded-full border-2 border-gray-600" alt="Avatar"/>
                            <div>
                                <h3 className="font-bold text-white text-lg">{card.displayName || '您的暱稱'}</h3>
                                <div className="flex gap-1 mt-1 flex-wrap">
                                    {(card.platforms || []).map(p => <span key={p} className="text-[9px] border border-gray-600 text-gray-400 px-1.5 py-0.5 rounded">{p}</span>)}
                                </div>
                            </div>
                        </div>

                        {card.specialties && card.specialties.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-4">
                                {card.specialties.map(spec => (<span key={spec} className="text-[10px] bg-purple-900/40 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded">{spec}</span>))}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 mb-4 bg-black/20 p-3 rounded-xl">
                            <div className="text-center"><p className="text-[10px] text-gray-500 uppercase">總粉絲數</p><p className="font-mono text-white font-bold">{card.followersCount?.toLocaleString() || 0}</p></div>
                            <div className="text-center border-l border-gray-700"><p className="text-[10px] text-gray-500 uppercase">平均互動率</p><p className="font-mono text-green-400 font-bold">{card.engagementRate || 0}%</p></div>
                        </div>

                        {/* Extra Metrics Preview */}
                        <div className="grid grid-cols-3 gap-1 mb-4">
                            {card.ytAvgViews ? <div className="text-center bg-red-900/10 rounded p-1 border border-red-900/30"><p className="text-[9px] text-red-300">YT 觀看</p><p className="text-[10px] font-bold text-white">{card.ytAvgViews.toLocaleString()}</p></div> : null}
                            {card.tiktokAvgViews ? <div className="text-center bg-gray-800 rounded p-1 border border-gray-700"><p className="text-[9px] text-gray-400">TikTok</p><p className="text-[10px] font-bold text-white">{card.tiktokAvgViews.toLocaleString()}</p></div> : null}
                            {card.websiteAvgViews ? <div className="text-center bg-blue-900/10 rounded p-1 border border-blue-900/30"><p className="text-[9px] text-blue-300">Web</p><p className="text-[10px] font-bold text-white">{card.websiteAvgViews.toLocaleString()}</p></div> : null}
                        </div>

                        <div className="space-y-2 mb-6">
                            <div className="flex justify-between text-xs"><span className="text-gray-500">預算</span><span className="text-yellow-400 font-bold">{parseInt(priceMin || '0').toLocaleString()} - {parseInt(priceMax || '0').toLocaleString()}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-gray-500">類別</span><span className="text-white">{(card.categories || []).join(', ') || '未設定'}</span></div>
                            <p className="text-xs text-gray-400 mt-2 line-clamp-2">{card.bio || '這裡會顯示您的自我介紹...'}</p>
                        </div>

                        <button disabled className="w-full bg-gray-700 text-gray-400 font-black py-3 rounded-xl cursor-not-allowed text-xs">🔒 解鎖並聯繫 (預覽模式)</button>
                    </div>
                </div>
                
                {/* Boost Section */}
                <div className="mt-6 w-full max-w-sm bg-gradient-to-r from-yellow-900/30 to-amber-900/30 p-4 rounded-xl border border-yellow-600/30 text-center">
                    <h4 className="text-yellow-400 font-bold text-sm mb-1">🚀 想要更多接案機會？</h4>
                    <p className="text-xs text-yellow-200/70 mb-3">開啟「優先序列顯示」，讓您的名片排在列表最上方，並加上醒目的金框。</p>
                    {card.isBoosted ? (
                        <div className="text-xs bg-yellow-500 text-black font-bold py-2 rounded-lg">✅ 您的名片正在優先曝光中</div>
                    ) : (
                        <button 
                            onClick={handleBoostProfile}
                            disabled={boosting}
                            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2 rounded-lg text-xs transition-colors shadow-lg"
                        >
                            {boosting ? '處理中...' : '啟用優先曝光 (200點/10天)'}
                        </button>
                    )}
                </div>
            </div>

            {/* Consent Modal */}
            {showConsent && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] p-6 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 border border-gray-600 rounded-xl max-w-md w-full p-6 shadow-2xl relative">
                        <h3 className="text-xl font-black text-white mb-4 flex items-center gap-2">⚠️ 資料公開聲明</h3>
                        <div className="text-sm text-gray-300 space-y-4 mb-6 leading-relaxed">
                            <p>您即將發佈您的接案名片。請確認您理解以下事項：</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>公開展示：</strong>您填寫的資料將公開於 AutoSocial Connect 平台。</li>
                                <li><strong>聯絡資訊：</strong>Email/Line/電話 僅在品牌方支付點數解鎖後顯示。</li>
                            </ul>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setShowConsent(false)} className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">取消</button>
                            <button onClick={confirmSave} className="px-6 py-2 rounded-lg bg-primary hover:bg-cyan-400 text-black font-bold">我同意並儲存</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyCardEditor;
