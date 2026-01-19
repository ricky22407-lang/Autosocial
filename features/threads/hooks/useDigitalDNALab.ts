
import { useState } from 'react';
import { ThreadsAccount, UserProfile, DNALabAnalysis, UserRole } from '../../../types';
import { fetchUserThreads } from '../../../services/threadsService';
import { generateDNALabAnalysis } from '../../../services/gemini/text';
import { generateImage } from '../../../services/gemini/media';
import { checkAndUseQuota } from '../../../services/authService';
import { buildDNALabImagePrompt } from '../../../services/promptTemplates';

export const useDigitalDNALab = (
    accounts: ThreadsAccount[],
    user: UserProfile | null,
    onQuotaUpdate: () => void
) => {
    const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<DNALabAnalysis | null>(null);
    const [loadingStage, setLoadingStage] = useState('');

    const role = user?.role || 'user';

    const getRoleLabel = (role: UserRole) => {
        switch(role) {
            case 'starter': return 'Starter (職業裝)';
            case 'pro': return 'Pro (稀有配件)';
            case 'business': return 'Business (VIP光環)';
            case 'admin': return 'GM (神裝)';
            default: return 'Free (初始型態)';
        }
    };

    const handleAnalyze = async () => {
        if (!user) return alert("請先登入");
        const account = accounts.find(a => a.id === selectedAccountId);
        if (!account) return alert("請選擇帳號");

        // [BILLING] DNA Lab: 10 Points (Analysis + Image)
        const COST = 10;
        const allowed = await checkAndUseQuota(user.user_id, COST, 'DNA_LAB_ANALYSIS');
        if (!allowed) return;
        onQuotaUpdate();

        setIsAnalyzing(true);
        setResult(null);

        try {
            // 1. Fetch Posts
            setLoadingStage('正在掃描大腦皮層 (Reading Posts)...');
            const posts = await fetchUserThreads(account, 15);
            if (posts.length < 5) throw new Error("貼文數量太少 (至少需 5 篇)，無法精確分析基因。");
            const postTexts = posts.map((p: any) => p.text).filter(Boolean);

            // 2. Analyze DNA (Gemini)
            setLoadingStage('正在進行基因定序 (Analyzing DNA)...');
            const analysis = await generateDNALabAnalysis(postTexts);

            // 3. Generate Visual (RPG Style)
            setLoadingStage(`正在生成 RPG 角色 (${getRoleLabel(role)})...`);
            
            // Construct visual prompt based on analysis + user tier
            const prompt = buildDNALabImagePrompt(analysis.visualDescription, role);
            const imageUrl = await generateImage(prompt, role); 

            setResult({ ...analysis, imageUrl });

        } catch (e: any) {
            alert(`實驗失敗: ${e.message}`);
        } finally {
            setIsAnalyzing(false);
            setLoadingStage('');
        }
    };

    return {
        selectedAccountId, setSelectedAccountId,
        isAnalyzing,
        result,
        loadingStage,
        handleAnalyze,
        getRoleLabel,
        role
    };
};
