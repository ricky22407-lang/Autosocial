
import { useState } from 'react';
import { OpportunityPost, UserProfile } from '../../../types';
import { findThreadsOpportunities } from '../../../services/geminiService';
import { checkAndUseQuota } from '../../../services/authService';

export const useOpportunityScout = (
    user: UserProfile | null,
    onQuotaUpdate: () => void
) => {
    const [keyword, setKeyword] = useState('');
    const [results, setResults] = useState<OpportunityPost[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [debugQuery, setDebugQuery] = useState('');

    const handleSearch = async () => {
        if (!keyword.trim()) return alert("請輸入關鍵字");
        if (!user) return alert("請先登入");

        // Permission Check
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
        
        setDebugQuery(`自動搜尋：關於「${keyword}」的推薦/評價/避雷討論...`);
        
        try {
            const leads = await findThreadsOpportunities(keyword);
            setResults(leads);
        } catch (e: any) {
            alert(`搜尋失敗: ${e.message}`);
        } finally {
            setIsSearching(false);
        }
    };

    return {
        keyword, setKeyword,
        results, 
        isSearching, hasSearched, debugQuery,
        handleSearch
    };
};
