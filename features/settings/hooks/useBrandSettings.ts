
import { useState, useEffect, useRef } from 'react';
import { BrandSettings } from '../../../types';
import { fetchRecentPostCaptions } from '../../../services/facebookService';
import { analyzeBrandTone } from '../../../services/geminiService';
import { checkAndUseQuota, getCurrentUser } from '../../../services/authService';
import { loginAndGetPages, initFacebookSdk, FacebookPage } from '../../../services/facebookAuth';

const INDUSTRIES = [
    "數位行銷", "餐飲美食", "美妝保養", "旅遊住宿", "3C電子", "服飾穿搭", 
    "教育培訓", "房地產", "金融理財", "醫療保健", "寵物用品", "居家生活", "運動健身"
];

// Helper to get Env safely
const getFbAppId = () => {
    const env = (import.meta as any).env || {};
    if (env.VITE_FB_APP_ID) return env.VITE_FB_APP_ID;
    if (env.REACT_APP_FB_APP_ID) return env.REACT_APP_FB_APP_ID;
    return '';
};

export const useBrandSettings = (
    initialSettings: BrandSettings, 
    onSave: (settings: BrandSettings) => void
) => {
    const [formData, setFormData] = useState<BrandSettings>(initialSettings);
    const [isAnalyzingTone, setIsAnalyzingTone] = useState(false);
    
    // Industry UI State
    const [industrySelectValue, setIndustrySelectValue] = useState<string>('');
    const [showCustomIndustry, setShowCustomIndustry] = useState(false);
    
    // Facebook OAuth State
    const [fbPages, setFbPages] = useState<FacebookPage[]>([]);
    const [isFbLoading, setIsFbLoading] = useState(false);
    const [isFbSdkReady, setIsFbSdkReady] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initialization
    useEffect(() => {
        setFormData(initialSettings);
        
        // Industry Logic
        if (initialSettings.industry) {
            if (INDUSTRIES.includes(initialSettings.industry)) {
                setIndustrySelectValue(initialSettings.industry);
                setShowCustomIndustry(false);
            } else {
                setIndustrySelectValue('other');
                setShowCustomIndustry(true);
            }
        } else {
            setIndustrySelectValue('');
            setShowCustomIndustry(false);
        }

        // FB SDK
        const appId = getFbAppId();
        if (appId) {
            initFacebookSdk(appId).then(() => setIsFbSdkReady(true)).catch(console.error);
        }
    }, [initialSettings]);

    const handleChange = (field: keyof BrandSettings, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleIndustrySelectChange = (val: string) => {
        setIndustrySelectValue(val);
        if (val === 'other') {
            setShowCustomIndustry(true);
            handleChange('industry', '');
        } else {
            setShowCustomIndustry(false);
            handleChange('industry', val);
        }
    };

    // Competitor List Logic
    const handleCompetitorChange = (index: number, val: string) => {
        const newList = [...(formData.competitorUrls || [])];
        newList[index] = val;
        handleChange('competitorUrls', newList);
    };

    const addCompetitorField = () => {
        const current = formData.competitorUrls || [];
        if (current.length >= 5) return;
        handleChange('competitorUrls', [...current, '']);
    };

    const removeCompetitorField = (index: number) => {
        const newList = (formData.competitorUrls || []).filter((_, i) => i !== index);
        handleChange('competitorUrls', newList);
    };

    // AI Tone Analysis
    const handleAutoAnalyzeStyle = async () => {
        if (!formData.facebookPageId || !formData.facebookToken) {
            return alert("請先填寫並驗證 Facebook Page ID 與 Token");
        }

        const user = getCurrentUser();
        if (!user) return alert("請先登入");
        
        const COST = 5;
        const allowed = await checkAndUseQuota(user.uid, COST, 'ANALYZE_TONE');
        if (!allowed) return; 
        
        setIsAnalyzingTone(true);
        try {
            const posts = await fetchRecentPostCaptions(formData.facebookPageId, formData.facebookToken, 15);
            if (posts.length < 3) throw new Error("貼文數量過少，無法有效分析 (至少需要 3 篇)。");
            const styleGuide = await analyzeBrandTone(posts);
            setFormData(prev => ({ ...prev, brandStyleGuide: styleGuide }));
            alert(`✅ 分析完成！已更新「品牌風格指南」。(扣除 ${COST} 點)`);
        } catch (e: any) {
            alert(`分析失敗: ${e.message}`);
        } finally {
            setIsAnalyzingTone(false);
        }
    };

    // Facebook Connect
    const handleConnectFacebook = async () => {
        if (!isFbSdkReady) {
            const appId = getFbAppId();
            alert(`⚠️ 無法啟動 Facebook 登入。\n原因：${!appId ? '未設定 App ID' : 'SDK 被瀏覽器插件阻擋 (請關閉 AdBlock)'}`);
            return;
        }
        
        setIsFbLoading(true);
        try {
            const pages = await loginAndGetPages();
            setFbPages(pages);
            if (pages.length === 1) selectPage(pages[0]);
            else if (pages.length === 0) alert("沒有發現任何粉絲專頁，或未授權管理權限。");
        } catch (e: any) {
            alert(`FB 登入失敗: ${e.message}`);
        } finally {
            setIsFbLoading(false);
        }
    };

    const selectPage = (page: FacebookPage) => {
        setFormData(prev => ({
            ...prev,
            facebookPageId: page.id,
            facebookToken: page.access_token,
            brandName: prev.brandName || page.name
        }));
        setFbPages([]);
        alert(`已成功連結：${page.name}`);
    };

    // Logo Upload
    const handleLogoUpload = (file: File) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target?.result as string;
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 300;
                const scale = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                const resizedBase64 = canvas.toDataURL('image/png', 0.8);
                setFormData(prev => ({ ...prev, logoUrl: resizedBase64 }));
            };
            img.src = base64;
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        alert("品牌設定已同步至雲端！");
    };

    return {
        formData, handleChange,
        industrySelectValue, handleIndustrySelectChange, showCustomIndustry, INDUSTRIES,
        competitorHandlers: { handleCompetitorChange, addCompetitorField, removeCompetitorField },
        fbState: { isAnalyzingTone, isFbLoading, isFbSdkReady, fbPages },
        fbActions: { handleAutoAnalyzeStyle, handleConnectFacebook, selectPage },
        logoActions: { fileInputRef, handleLogoUpload },
        handleSubmit
    };
};
