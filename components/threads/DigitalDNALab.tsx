
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
本季市場數據顯示，AI 轉型已成為企業首要目標。我們致力於協助合作夥伴導入自動化流程。`;

const DEFAULT_MOCK_THREADS = `笑死 剛剛開會老闆又在講幹話
到底誰會想看那種老掉牙的行銷案啦 救命🆘`;

const FALLBACK_ANALYSIS: DNALabAnalysis = {
    species: "Simulated Two-Faced Chimera",
    visualDescription: "A fantasy chimera with two heads, one head in a suit, one head wild. Chibi style.",
    stats: { chaos: 85, intellect: 70, aggression: 60, emo: 90, professionalization: 40 },
    title: "Level 99 崩潰社畜獸 (模擬)",
    comment: "這隻生物象徵著在社會期待與內心混沌之間掙扎的靈魂。"
} as any;

const DigitalDNALab: React.FC<Props> = ({ accounts = [], settings, user, onQuotaUpdate }) => {
    const threadAccounts = accounts.length > 0 ? accounts : (settings.threadsAccounts || []);
    const [useFb, setUseFb] = useState(true);
    const [useThreads, setUseThreads] = useState(true);
    const [isCreatorMode, setIsCreatorMode] = useState(false);
    const [mockFbText, setMockFbText] = useState(DEFAULT_MOCK_FB);
    const [mockThreadsText, setMockThreadsText] = useState(DEFAULT_MOCK_THREADS);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<DNALabAnalysis | null>(null);
    const [loadingStage, setLoadingStage] = useState('');

    const role = user?.role || 'user';

    const handleAnalyze = async () => {
        if (!user) return alert("請先登入");
        if (!isCreatorMode) {
            if (useFb && (!settings.facebookPageId || !settings.facebookToken)) return alert("請先連結 FB！");
            if (useThreads && threadAccounts.length === 0) return alert("請先連結 Threads！");
        }

        const COST = 10;
        const allowed = await checkAndUseQuota(user.user_id, COST, 'DNA_LAB_ANALYSIS');
        if (!allowed) return;
        onQuotaUpdate();

        setIsAnalyzing(true);
        setResult(null);

        try {
            let combinedText = "";
            if (isCreatorMode) {
                if (useFb) combinedText += `\n[FB]\n${mockFbText}`;
                if (useThreads) combinedText += `\n[Threads]\n${mockThreadsText}`;
                await new Promise(r => setTimeout(r, 1000));
            } else {
                setLoadingStage('正在掃描數據...');
                if (useFb) {
                    const fbPosts = await fetchRecentPostCaptions(settings.facebookPageId, settings.facebookToken, 10);
                    combinedText += fbPosts.join('\n');
                }
                if (useThreads) {
                    const posts = await fetchUserThreads(threadAccounts[0], 10);
                    combinedText += posts.map((p:any) => p.text).join('\n');
                }
            }

            setLoadingStage('AI 綜合分析中...');
            const analysis = await generateDNALabAnalysis([combinedText]);
            
            setLoadingStage(`生成形象中...`);
            const prompt = buildDNALabImagePrompt(analysis.visualDescription, role);
            const imageUrl = await generateImage(prompt, role);
            setResult({ ...analysis, imageUrl });

        } catch (e: any) {
            alert(`分析失敗: ${e.message}`);
        } finally {
            setIsAnalyzing(false);
            setLoadingStage('');
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8 animate-fade-in relative z-10">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-gray-800 pb-8">
                <div>
                    <h2 className="text-4xl font-black text-white tracking-tighter shadow-primary/20">🧬 數位基因實驗室</h2>
                    <p className="text-gray-500 font-bold tracking-[0.3em] uppercase text-[10px] mt-2">Persona Synthesis Engine</p>
                </div>
                
                {/* FIXED: Increased z-index and removed potential blocking elements */}
                <button 
                    onClick={() => setIsCreatorMode(!isCreatorMode)}
                    className={`relative z-20 px-6 py-3 rounded-2xl font-black text-xs transition-all flex items-center gap-3 border-2 active:scale-95 ${
                        isCreatorMode ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' : 'bg-gray-800/50 border-gray-700 text-gray-500 hover:border-gray-500'
                    }`}
                >
                    <span className={`w-2 h-2 rounded-full ${isCreatorMode ? 'bg-yellow-400 animate-pulse' : 'bg-gray-600'}`}></span>
                    {isCreatorMode ? '⚡ 模擬模式已啟動' : '🧪 啟動模擬模式'}
                </button>
            </div>

            <div className="glass-card p-10 rounded-[3rem] space-y-8 relative overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className={`p-6 rounded-3xl border ${useFb ? 'bg-blue-900/10 border-blue-500/50' : 'bg-black/20 border-gray-800 opacity-40'}`}>
                        <label className="flex items-center gap-3 cursor-pointer mb-4">
                            <input type="checkbox" checked={useFb} onChange={e => setUseFb(e.target.checked)} className="w-5 h-5 accent-blue-500" />
                            <span className="text-lg font-black text-white">Facebook (外在)</span>
                        </label>
                        {isCreatorMode && useFb && <textarea value={mockFbText} onChange={e => setMockFbText(e.target.value)} className="w-full h-32 bg-black/40 border border-gray-700 rounded-xl p-3 text-xs text-white" />}
                    </div>
                    <div className={`p-6 rounded-3xl border ${useThreads ? 'bg-pink-900/10 border-pink-500/50' : 'bg-black/20 border-gray-800 opacity-40'}`}>
                        <label className="flex items-center gap-3 cursor-pointer mb-4">
                            <input type="checkbox" checked={useThreads} onChange={e => setUseThreads(e.target.checked)} className="w-5 h-5 accent-pink-500" />
                            <span className="text-lg font-black text-white">Threads (內在)</span>
                        </label>
                        {isCreatorMode && useThreads && <textarea value={mockThreadsText} onChange={e => setMockThreadsText(e.target.value)} className="w-full h-32 bg-black/40 border border-gray-700 rounded-xl p-3 text-xs text-white" />}
                    </div>
                </div>

                <div className="flex flex-col items-center gap-4">
                    <button onClick={handleAnalyze} disabled={isAnalyzing} className="bg-gradient-to-r from-blue-600 to-pink-600 text-white px-16 py-5 rounded-full font-black text-xl shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
                        {isAnalyzing ? (loadingStage || '分析中...') : '🧪 開始融合分析 (10點)'}
                    </button>
                </div>
            </div>

            {result && (
                <div className="max-w-2xl mx-auto animate-fade-in pt-10">
                    <div className="bg-gradient-to-b from-gray-900 to-black rounded-[3rem] border-4 border-white/5 shadow-2xl overflow-hidden p-10 space-y-8">
                        <div className="aspect-square bg-white rounded-3xl p-6 relative flex items-center justify-center shadow-inner">
                            <img src={result.imageUrl} alt="Avatar" className="max-w-full max-h-full object-contain drop-shadow-2xl" />
                        </div>
                        <div className="text-center">
                            <h2 className="text-4xl font-black text-white bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-pink-400">{result.title}</h2>
                            <p className="text-gray-400 mt-4 italic leading-relaxed">"{result.comment}"</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DigitalDNALab;
