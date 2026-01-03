
import React, { useState, useRef } from 'react';
import { ThreadsAccount, UserProfile, DNALabAnalysis, UserRole, BrandSettings } from '../../types';
import { fetchUserThreads } from '../../services/threadsService';
import { fetchRecentPostCaptions } from '../../services/facebookService';
import { generateDNALabAnalysis } from '../../services/gemini/text';
import { generateImage } from '../../services/gemini/media';
import { checkAndUseQuota } from '../../services/authService';
import { buildDNALabImagePrompt } from '../../services/promptTemplates';

interface Props {
    accounts?: ThreadsAccount[];
    settings: BrandSettings;
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const DEFAULT_MOCK_FB = `【2024 Q3 產業趨勢報告】
本季市場數據顯示，AI 轉型已成為企業首要目標。我們致力於協助合作夥伴導入自動化流程，提升 30% 營運效率。感謝各位客戶的支持，我們將持續精進服務品質。
#數位轉型 #B2B服務 #專業觀點

【產品更新公告】
經過三個月的研發，我們很榮幸宣布推出全新的企業級解決方案。本次更新著重於資安防護與協作效率，歡迎預約演示。
#SaaS #科技創新`;

const DEFAULT_MOCK_THREADS = `笑死 剛剛開會老闆又在講幹話
到底誰會想看那種老掉牙的行銷案啦 救命🆘
真的會被這些老人氣死
好想下班去吃火鍋 煩死人
#社畜日常 #想離職 #這就是人生嗎

只有我覺得今天的捷運特別擠嗎？
甚至有人在車廂吃鹹酥雞 我真的會發瘋 🫠
素質在哪裡？良心在哪裡？雞排在哪裡？`;

// API 失敗時的備用模擬數據
const FALLBACK_ANALYSIS: DNALabAnalysis = {
    species: "Simulated Two-Faced Chimera",
    visualDescription: "A fantasy chimera with two heads, one head wearing a business suit and glasses, the other head wild and roaring. Chibi style.",
    stats: {
        chaos: 85,
        chill: 10,
        intellect: 70,
        aggression: 60,
        emo: 90,
        luck: 20,
        professionalism: 40,
        duality: 95
    },
    title: "Level 99 崩潰社畜獸 (模擬)",
    comment: "檢測到 API 連線異常，已啟動備用模擬協議。這隻生物象徵著在社會期待與內心混沌之間掙扎的靈魂。他的外表雖維持著專業形象，但內心早已開始咆哮。"
};

const DigitalDNALab: React.FC<Props> = ({ accounts = [], settings, user, onQuotaUpdate }) => {
    const threadAccounts = accounts.length > 0 ? accounts : (settings.threadsAccounts || []);
    
    const [selectedThreadId, setSelectedThreadId] = useState(threadAccounts[0]?.id || '');
    const [useFb, setUseFb] = useState(true);
    const [useThreads, setUseThreads] = useState(true);
    
    // 模擬模式狀態
    const [isCreatorMode, setIsCreatorMode] = useState(false);
    const [mockFbText, setMockFbText] = useState(DEFAULT_MOCK_FB);
    const [mockThreadsText, setMockThreadsText] = useState(DEFAULT_MOCK_THREADS);
    
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<DNALabAnalysis | null>(null);
    const [loadingStage, setLoadingStage] = useState('');
    const cardRef = useRef<HTMLDivElement>(null);

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
        
        // 驗證 (模擬模式下跳過 API 檢查)
        if (!isCreatorMode) {
            const hasFbConfig = settings.facebookPageId && settings.facebookToken;
            const hasThreadsConfig = threadAccounts.length > 0;
            if (useFb && !hasFbConfig) return alert("無法分析 FB：請先至設定頁面連結 Facebook 粉絲專頁。");
            if (useThreads && !hasThreadsConfig) return alert("無法分析 Threads：請先連結 Threads 帳號。");
            if (!useFb && !useThreads) return alert("請至少選擇一種數據來源！");
        }

        // [BILLING] DNA Lab: 10 Points
        const COST = 10;
        const allowed = await checkAndUseQuota(user.user_id, COST, 'DNA_LAB_ANALYSIS');
        if (!allowed) return;
        onQuotaUpdate();

        setIsAnalyzing(true);
        setResult(null);

        try {
            let combinedText = "";

            if (isCreatorMode) {
                if (useFb) combinedText += `\n\n=== [SOURCE: FACEBOOK PAGE] ===\n${mockFbText}`;
                if (useThreads) combinedText += `\n\n=== [SOURCE: THREADS] ===\n${mockThreadsText}`;
                setLoadingStage('正在讀取模擬數據...');
                await new Promise(r => setTimeout(r, 800));
            } else {
                if (useFb) {
                    setLoadingStage('正在掃描 Facebook 粉專...');
                    try {
                        const fbPosts = await fetchRecentPostCaptions(settings.facebookPageId, settings.facebookToken, 10);
                        if (fbPosts.length > 0) combinedText += `\n\n=== [SOURCE: FB] ===\n${fbPosts.join('\n---\n')}`;
                    } catch (e) { console.warn("FB Fetch Failed", e); }
                }
                if (useThreads) {
                    setLoadingStage('正在掃描 Threads 帳號...');
                    const targetAccount = selectedThreadId ? threadAccounts.find(a => a.id === selectedThreadId) : threadAccounts[0];
                    if (targetAccount) {
                        try {
                            const posts = await fetchUserThreads(targetAccount, 15);
                            const postTexts = posts.map((p: any) => p.text).filter(Boolean);
                            if (postTexts.length > 0) combinedText += `\n\n=== [SOURCE: THREADS] ===\n${postTexts.join('\n---\n')}`;
                        } catch (e) { console.warn("Threads Fetch Failed", e); }
                    }
                }
            }

            if (combinedText.length < 10) throw new Error("抓取到的內容過少，無法分析。");

            // 3. Analyze DNA
            setLoadingStage('AI 正在融合雙重人格數據...');
            let analysis: DNALabAnalysis;
            try {
                analysis = await generateDNALabAnalysis([combinedText]);
            } catch (apiError) {
                if (isCreatorMode) {
                    analysis = { ...FALLBACK_ANALYSIS, stats: { ...FALLBACK_ANALYSIS.stats, chaos: Math.floor(Math.random()*100) } };
                } else { throw apiError; }
            }

            // 4. Generate Visual
            setLoadingStage(`正在生成 RPG 寵物 (${getRoleLabel(role)})...`);
            const prompt = buildDNALabImagePrompt(analysis.visualDescription, role);
            let imageUrl = '';
            try {
                imageUrl = await generateImage(prompt, role);
            } catch (imgError) {
                imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?n=${Date.now()}&model=flux`;
            }

            setResult({ ...analysis, imageUrl });

        } catch (e: any) {
            alert(`分析失敗: ${e.message}`);
        } finally {
            setIsAnalyzing(false);
            setLoadingStage('');
        }
    };

    const handleDownload = () => {
        if (!result?.imageUrl) return;
        const link = document.createElement('a');
        link.href = result.imageUrl;
        link.download = `AutoSocial_DNA_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8 animate-fade-in pb-20 relative">
            {/* Header */}
            <div className="text-center space-y-2 relative pt-12 md:pt-0">
                <div className="absolute right-0 top-0">
                    <button 
                        onClick={() => setIsCreatorMode(!isCreatorMode)}
                        className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all ${isCreatorMode ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500' : 'bg-gray-800 text-gray-500 border-gray-700'}`}
                    >
                        {isCreatorMode ? '⚡ 模擬模式已啟動' : '🧪 啟動模擬模式'}
                    </button>
                </div>
                <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter drop-shadow-[0_0_15px_rgba(0,242,234,0.5)]">🧬 數位基因實驗室</h2>
                <p className="text-gray-400 font-medium tracking-widest text-xs uppercase">Persona Synthesis Engine</p>
            </div>

            {/* Source Selection */}
            <div className="bg-card p-6 rounded-2xl border border-gray-700 flex flex-col items-center gap-6">
                <div className="flex flex-wrap gap-4 justify-center w-full">
                    <div className={`flex flex-col gap-2 flex-1 min-w-[280px] p-4 rounded-xl border transition-all ${useFb ? 'bg-blue-900/10 border-blue-500' : 'bg-dark border-gray-700 opacity-50'}`}>
                        <div className="flex items-center gap-3">
                            <input type="checkbox" checked={useFb} onChange={e => setUseFb(e.target.checked)} className="w-5 h-5 accent-blue-500" />
                            <span className="text-white font-bold text-sm">Facebook (公眾人格)</span>
                        </div>
                        {isCreatorMode && useFb && (
                            <textarea value={mockFbText} onChange={e => setMockFbText(e.target.value)} className="w-full h-32 bg-black/40 border border-blue-900/30 rounded p-2 text-xs text-blue-100 resize-none mt-2 outline-none" />
                        )}
                    </div>
                    <div className={`flex flex-col gap-2 flex-1 min-w-[280px] p-4 rounded-xl border transition-all ${useThreads ? 'bg-pink-900/10 border-pink-500' : 'bg-dark border-gray-700 opacity-50'}`}>
                        <div className="flex items-center gap-3">
                            <input type="checkbox" checked={useThreads} onChange={e => setUseThreads(e.target.checked)} className="w-5 h-5 accent-pink-500" />
                            <span className="text-white font-bold text-sm">Threads (真實人格)</span>
                        </div>
                        {isCreatorMode && useThreads && (
                            <textarea value={mockThreadsText} onChange={e => setMockThreadsText(e.target.value)} className="w-full h-32 bg-black/40 border border-pink-900/30 rounded p-2 text-xs text-pink-100 resize-none mt-2 outline-none" />
                        )}
                    </div>
                </div>
                <button 
                    onClick={handleAnalyze} 
                    disabled={isAnalyzing}
                    className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white px-10 py-3 rounded-xl font-bold shadow-lg transition-all hover:brightness-110 disabled:opacity-50 flex items-center gap-2"
                >
                    {isAnalyzing ? <><div className="loader w-4 h-4 border-t-white"></div> {loadingStage}</> : '🧪 開始全域融合分析 (10 點)'}
                </button>
            </div>

            {/* Result Display */}
            {result && (
                <div className="max-w-md mx-auto animate-fade-in">
                    <div className="bg-gradient-to-b from-gray-900 to-black rounded-[2.5rem] border-4 border-purple-500/50 shadow-2xl overflow-hidden relative">
                        <div className="aspect-square bg-white p-6 relative flex items-center justify-center overflow-hidden">
                            <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                            <img src={result.imageUrl} alt="RPG Avatar" className="relative z-10 w-full h-full object-contain drop-shadow-2xl" />
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="text-center">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">{result.species}</h3>
                                <h2 className="text-2xl font-black text-white bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">{result.title}</h2>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-[10px]">
                                <StatBar label="混沌 (Chaos)" value={result.stats.chaos} color="bg-red-500" />
                                <StatBar label="專業 (PR)" value={result.stats.professionalism || 0} color="bg-blue-500" />
                                <StatBar label="知識 (INT)" value={result.stats.intellect} color="bg-green-500" />
                                <StatBar label="感性 (EMO)" value={result.stats.emo} color="bg-purple-500" />
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-center">
                                <p className="text-gray-300 text-sm italic font-medium">"{result.comment}"</p>
                            </div>
                        </div>
                    </div>
                    <button onClick={handleDownload} className="mt-6 w-full text-center text-gray-500 hover:text-white text-sm underline">⭳ 保存角色圖</button>
                </div>
            )}
        </div>
    );
};

const StatBar = ({ label, value, color }: { label: string, value: number, color: string }) => (
    <div className="flex flex-col gap-1">
        <div className="flex justify-between font-bold text-gray-500"><span>{label}</span><span>{value}</span></div>
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full ${color}`} style={{ width: `${value}%` }}></div>
        </div>
    </div>
);

export default DigitalDNALab;
