
import React, { useState, useEffect } from 'react';
import { UserProfile, ThreadLead } from '../../types';
import { searchThreadsLeads } from '../../services/gemini/text';
import { checkAndUseQuota } from '../../services/authService';

interface Props {
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const STAGES = [
    { label: "正在發射雷達訊號...", progress: 15 },
    { label: "掃描 Threads 實時內容...", progress: 35 },
    { label: "深度分析消費意圖...", progress: 55 },
    { label: "排除網紅與行銷貼文...", progress: 75 },
    { label: "精準定位潛在客戶中...", progress: 90 },
    { label: "彙整數據報告...", progress: 98 }
];

const LeadHunter: React.FC<Props> = ({ user, onQuotaUpdate }) => {
    const [keyword, setKeyword] = useState('');
    const [leads, setLeads] = useState<ThreadLead[]>([]);
    const [isHunting, setIsHunting] = useState(false);
    const [currentStage, setCurrentStage] = useState(0);

    // Simulate progress text updates
    useEffect(() => {
        let interval: any;
        if (isHunting) {
            interval = setInterval(() => {
                setCurrentStage(prev => (prev < STAGES.length - 1 ? prev + 1 : prev));
            }, 3500); // Change stage every 3.5s
        } else {
            setCurrentStage(0);
        }
        return () => clearInterval(interval);
    }, [isHunting]);

    const handleHunt = async () => {
        if (!keyword.trim()) return alert("請輸入搜尋關鍵字（例如：禮盒、保養品推薦）");
        if (!user) return;

        // [BILLING] Lead Hunter Cost: 10 Points
        const COST = 10;
        const allowed = await checkAndUseQuota(user.user_id, COST, 'THREADS_LEAD_HUNTER');
        if (!allowed) return;
        onQuotaUpdate();

        setIsHunting(true);
        setLeads([]);
        try {
            const results = await searchThreadsLeads(keyword.trim());
            setLeads(results);
            if (results.length === 0) alert("此關鍵字目前在 Threads 上尚無偵測到真實的消費需求。");
        } catch (e: any) {
            alert(`雷達掃描失敗: ${e.message}`);
        } finally {
            setIsHunting(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Search Header */}
            <div className="bg-card p-8 rounded-3xl border border-gray-700 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 blur-[100px] rounded-full pointer-events-none"></div>
                
                <h3 className="text-2xl font-black text-white mb-2 flex items-center gap-3">
                    Threads 商機獵人雷達
                </h3>
                <p className="text-gray-400 text-sm mb-6 max-w-2xl font-medium">
                    主動出擊！輸入產品關鍵字，AI 將透過 Google 實時搜尋，
                    <span className="text-pink-400 font-bold">自動排除網紅與廣告</span>，
                    精準定位正在「求推薦」或「求購買」的真實潛在客戶。
                </p>

                <div className="flex flex-col md:flex-row gap-3">
                    <input 
                        value={keyword}
                        onChange={e => setKeyword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !isHunting && handleHunt()}
                        placeholder="搜尋關鍵字 (例如：禮盒, 除濕機, 台北咖啡廳)..."
                        className="flex-1 bg-dark border border-gray-600 rounded-2xl px-6 py-4 text-white font-medium outline-none focus:border-pink-500 transition-all text-lg shadow-inner"
                    />
                    <button 
                        onClick={handleHunt}
                        disabled={isHunting}
                        className="bg-pink-600 hover:bg-pink-500 text-white px-10 py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 min-w-[200px]"
                    >
                        {isHunting ? '啟動中...' : '啟動雷達 (10 點)'}
                    </button>
                </div>
                <p className="text-[10px] text-gray-600 mt-4 font-mono uppercase tracking-widest">Lead Detection Engine v3.0 // Anti-Influencer Mode</p>
            </div>

            {/* Custom Loading State */}
            {isHunting && (
                <div className="py-20 flex flex-col items-center gap-8 animate-fade-in">
                    <div className="relative w-48 h-48 flex items-center justify-center">
                        <div className="absolute inset-0 border-4 border-pink-500/20 rounded-full"></div>
                        <div 
                            className="absolute inset-0 border-4 border-pink-500 rounded-full border-t-transparent animate-spin"
                            style={{ animationDuration: '1.5s' }}
                        ></div>
                        <div className="text-3xl animate-pulse">📡</div>
                    </div>
                    
                    <div className="w-full max-w-md space-y-4">
                        <div className="flex justify-between text-xs font-black uppercase tracking-widest text-pink-400">
                            <span>{STAGES[currentStage].label}</span>
                            <span>{STAGES[currentStage].progress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-pink-500 transition-all duration-1000 ease-out"
                                style={{ width: `${STAGES[currentStage].progress}%` }}
                            ></div>
                        </div>
                        <p className="text-center text-xs text-gray-500 font-medium italic">
                            正在深度爬讀數據，尋找真實消費需求，請稍候...
                        </p>
                    </div>
                </div>
            )}

            {/* Results Grid */}
            {!isHunting && leads.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {leads.map((lead) => (
                        <div key={lead.id} className="bg-gray-900 border border-gray-800 p-6 rounded-2xl flex flex-col justify-between hover:border-pink-500/50 transition-all group relative overflow-hidden">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center font-bold text-xs text-white shadow-lg">@</div>
                                    <span className="font-bold text-white text-sm">{lead.username}</span>
                                </div>
                                <div className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter ${
                                    lead.purchaseIntent === 'high' ? 'bg-red-900/40 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 
                                    'bg-yellow-900/40 text-yellow-400 border border-yellow-500/30'
                                }`}>
                                    {lead.purchaseIntent === 'high' ? '🔥 準客戶' : '⚡ 潛在需求'}
                                </div>
                            </div>

                            <div className="flex-1">
                                <p className="text-gray-300 text-sm leading-relaxed line-clamp-4 mb-4 font-medium italic">
                                    「{lead.content}」
                                </p>
                                
                                <div className="bg-black/40 p-4 rounded-xl border border-white/5 mb-6">
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="text-pink-500">●</span> 系統診斷報告
                                    </p>
                                    <p className="text-xs text-pink-100/80 italic leading-relaxed">{lead.reasoning}</p>
                                </div>
                            </div>

                            <a 
                                href={lead.permalink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="w-full bg-white text-black py-4 rounded-xl font-black text-xs text-center uppercase tracking-widest hover:bg-pink-100 transition-all shadow-lg flex items-center justify-center gap-2 group-hover:scale-[1.02]"
                            >
                                🎯 前往真實貼文進行獲客 ↗
                            </a>
                        </div>
                    ))}
                </div>
            )}

            {!isHunting && leads.length === 0 && (
                <div className="text-center py-24 border-2 border-dashed border-gray-800 rounded-3xl">
                    <div className="text-5xl mb-4 opacity-20">🔭</div>
                    <p className="text-gray-600 font-bold text-xl">尚未偵測到商機</p>
                    <p className="text-gray-700 text-sm mt-1">在上方輸入關鍵字後點擊啟動雷達</p>
                </div>
            )}
        </div>
    );
};

export default LeadHunter;
