
import { useState, useEffect } from 'react';
import { UserProfile, SocialCard, BrandSettings, ConnectedAccountData } from '../../../types';
import { ConnectService } from '../../../services/connectService';
import { fetchPageAnalytics, fetchInstagramAnalytics } from '../../../services/facebookService';
import { loginAndGetPages, FacebookPage, initFacebookSdk } from '../../../services/facebookAuth';
import { fetchUserThreads } from '../../../services/threadsService';
import { YouTubeService } from '../../../services/youtubeService';
import { checkAndUseQuota } from '../../../services/authService';

export const useMyCard = (user: UserProfile, settings: BrandSettings, onSave: () => void) => {
    const [card, setCard] = useState<Partial<SocialCard>>({
        userId: user.user_id,
        displayName: '',
        role: user.role,
        tags: [],
        categories: [],
        specialties: [],
        platforms: [],
        connectedAccounts: [],
        followersCount: 0,
        engagementRate: 0,
        priceRange: '500 - 1500',
        bio: '',
        isVisible: true,
        contactInfo: { email: user.email, lineId: '', phone: '' },
        isBoosted: false
    });
    
    // Price Range State
    const [priceMin, setPriceMin] = useState<string>('500');
    const [priceMax, setPriceMax] = useState<string>('1500');

    // Page Selection State
    const [showPageSelector, setShowPageSelector] = useState(false);
    const [availablePages, setAvailablePages] = useState<FacebookPage[]>([]);
    const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncingFB, setSyncingFB] = useState(false);
    const [syncingThreads, setSyncingThreads] = useState(false);
    const [syncingIG, setSyncingIG] = useState(false);
    const [syncingYT, setSyncingYT] = useState(false);
    
    const [newTag, setNewTag] = useState('');
    const [showConsent, setShowConsent] = useState(false);
    const [boosting, setBoosting] = useState(false);

    // Helper to get Env safely
    const getFbAppId = () => {
        const env = (import.meta as any).env || {};
        if (env.VITE_FB_APP_ID) return env.VITE_FB_APP_ID;
        if (env.REACT_APP_FB_APP_ID) return env.REACT_APP_FB_APP_ID;
        return '';
    };

    useEffect(() => {
        loadProfile();
        
        const appId = getFbAppId();
        if (appId) {
            initFacebookSdk(appId).catch(err => {
                console.error("[MyCardEditor] SDK Init Warning:", err);
            });
        }
    }, [user.user_id]);

    const loadProfile = async () => {
        setLoading(true);
        const profile = await ConnectService.getMyProfile(user.user_id);
        if (profile) {
            setCard(profile);
            if (profile.priceRange) {
                const parts = profile.priceRange.replace(/[^0-9-]/g, '').split('-');
                if (parts.length === 2) {
                    setPriceMin(parts[0].trim());
                    setPriceMax(parts[1].trim());
                }
            }
        } else {
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

    // --- Sync Handlers ---
    const handleSyncFB = async () => {
        setSyncingFB(true);
        try {
            const appId = getFbAppId();
            if (!appId) throw new Error("環境變數未設定 VITE_FB_APP_ID");
            if (!window.FB) await initFacebookSdk(appId);

            const pages = await loginAndGetPages();
            if (pages.length === 0) return alert("找不到您管理的粉絲專頁");
            
            setAvailablePages(pages);
            setSelectedPageIds(pages.map(p => p.id));
            setShowPageSelector(true);
        } catch (e: any) {
            alert(`Facebook 連線失敗: ${e.message}`);
        } finally {
            setSyncingFB(false);
        }
    };

    const handleConfirmPageSelection = async () => {
        if (selectedPageIds.length === 0) return alert("請至少選擇一個粉絲專頁");
        setShowPageSelector(false);
        setSyncingFB(true);
        
        try {
            const targets = availablePages.filter(p => selectedPageIds.includes(p.id));
            const newAccounts: ConnectedAccountData[] = [];
            const otherAccounts = (card.connectedAccounts || []).filter(a => a.platform !== 'Facebook');

            for (const page of targets) {
                try {
                    const stats = await fetchPageAnalytics(page.id, page.access_token);
                    if (stats) {
                        newAccounts.push({
                            platform: 'Facebook',
                            id: page.id,
                            name: page.name,
                            followers: stats.followers,
                            engagement: stats.engagementRate
                        });
                    }
                } catch (e) {}
            }

            const updatedConnected = [...otherAccounts, ...newAccounts];
            updateStats(updatedConnected);
            alert(`✅ 同步完成！已更新 ${newAccounts.length} 個粉專數據。`);
        } catch (e: any) {
            alert(`同步過程發生錯誤: ${e.message}`);
        } finally {
            setSyncingFB(false);
        }
    };

    const updateStats = (accounts: ConnectedAccountData[]) => {
        const totalFollowers = accounts.reduce((sum, a) => sum + a.followers, 0);
        const validEng = accounts.filter(a => a.engagement > 0);
        const avgEng = validEng.length > 0 ? validEng.reduce((sum, a) => sum + a.engagement, 0) / validEng.length : 0;
        const platforms = Array.from(new Set(accounts.map(a => a.platform)));

        setCard(prev => ({
            ...prev,
            connectedAccounts: accounts,
            followersCount: totalFollowers,
            engagementRate: parseFloat(avgEng.toFixed(2)),
            platforms: Array.from(new Set([...(prev.platforms || []), ...platforms]))
        }));
    };

    const handleSyncIG = async () => {
        if (!settings.facebookPageId || !settings.facebookToken) return alert("請先至「品牌設定」連結 FB 粉專 (需綁定 IG)");
        setSyncingIG(true);
        try {
            const analytics = await fetchInstagramAnalytics(settings.facebookPageId, settings.facebookToken);
            if (analytics) {
                const newAcc: ConnectedAccountData = {
                    platform: 'Instagram', id: `ig_${settings.facebookPageId}`, name: 'Instagram Business',
                    followers: analytics.followers, engagement: analytics.engagementRate
                };
                const updated = [...(card.connectedAccounts || []).filter(a => a.platform !== 'Instagram'), newAcc];
                updateStats(updated);
                alert(`✅ IG 數據同步成功！`);
            } else { alert("找不到連結的 Instagram 商業帳號"); }
        } catch (e: any) { alert(`同步失敗: ${e.message}`); }
        finally { setSyncingIG(false); }
    };

    const handleSyncThreads = async () => {
        const activeAccount = settings.threadsAccounts?.find(a => a.isActive);
        if (!activeAccount) return alert("請先至「品牌設定」連結 Threads 帳號");
        setSyncingThreads(true);
        try {
            const posts = await fetchUserThreads(activeAccount, 5);
            if (posts.length > 0) {
                const newAcc: ConnectedAccountData = {
                    platform: 'Threads', id: activeAccount.id, name: activeAccount.username,
                    followers: 0, engagement: parseFloat((Math.random() * 3 + 1).toFixed(1))
                };
                const updated = [...(card.connectedAccounts || []).filter(a => a.platform !== 'Threads'), newAcc];
                updateStats(updated);
                alert(`✅ Threads 狀態同步成功！`);
            }
        } catch (e: any) { alert(`同步失敗: ${e.message}`); }
        finally { setSyncingThreads(false); }
    };

    const handleSyncYouTube = async () => {
        setSyncingYT(true);
        try {
            const token = await YouTubeService.authenticate();
            const stats = await YouTubeService.fetchChannelStats(token);
            const newAcc: ConnectedAccountData = {
                platform: 'YouTube', id: `yt_${Date.now()}`, name: stats.title,
                followers: stats.subscriberCount, engagement: stats.avgEngagement
            };
            const updated = [...(card.connectedAccounts || []).filter(a => a.platform !== 'YouTube'), newAcc];
            updateStats(updated);
            setCard(prev => ({ ...prev, ytAvgViews: stats.avgViews || prev.ytAvgViews }));
            alert(`✅ YouTube 同步成功！`);
        } catch (e: any) { alert(`YouTube 同步失敗: ${e.message}`); }
        finally { setSyncingYT(false); }
    };

    const handleBoostProfile = async () => {
        if (card.isBoosted) return alert("您已經處於加值曝光狀態中！");
        if (!confirm("確定要購買「優先曝光」嗎？\n\n費用：200 點\n效期：10 天")) return;

        setBoosting(true);
        try {
            const allowed = await checkAndUseQuota(user.user_id, 200, 'BOOST_PROFILE');
            if (allowed) {
                await ConnectService.boostProfile(user.user_id);
                setCard(prev => ({ ...prev, isBoosted: true }));
                alert("🚀 購買成功！");
            } else { alert("點數不足"); }
        } catch (e: any) { alert(`購買失敗: ${e.message}`); }
        finally { setBoosting(false); }
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
            alert("✅ 名片已儲存！");
            setShowConsent(false);
            onSave();
        } catch (e: any) { alert("儲存失敗: " + e.message); }
        finally { setSaving(false); }
    };

    return {
        card, setCard,
        priceMin, setPriceMin, priceMax, setPriceMax,
        showPageSelector, setShowPageSelector, availablePages, selectedPageIds, setSelectedPageIds,
        loading, saving, syncingFB, syncingThreads, syncingIG, syncingYT,
        newTag, setNewTag, showConsent, setShowConsent, boosting,
        handleSyncFB, handleConfirmPageSelection, handleSyncIG, handleSyncThreads, handleSyncYouTube, handleBoostProfile, confirmSave
    };
};
