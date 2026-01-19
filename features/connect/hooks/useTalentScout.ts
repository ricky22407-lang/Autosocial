
import { useState, useEffect } from 'react';
import { SocialCard, UserProfile } from '../../../types';
import { ConnectService } from '../../../services/connectService';
import { checkAndUseQuota } from '../../../services/authService';

export const useTalentScout = (user: UserProfile | null, onQuotaUpdate: () => void) => {
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

    return {
        talents, 
        categoryFilter, setCategoryFilter,
        platformFilter, setPlatformFilter,
        loading,
        unlockingId,
        unlockedMap,
        showUnlockedSection,
        handleUnlock
    };
};
