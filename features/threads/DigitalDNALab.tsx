
import React, { useRef } from 'react';
import { ThreadsAccount, UserProfile } from '../../types';
import { useDigitalDNALab } from './hooks/useDigitalDNALab';

interface Props {
    accounts: ThreadsAccount[];
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const DigitalDNALab: React.FC<Props> = ({ accounts, user, onQuotaUpdate }) => {
    const {
        selectedAccountId, setSelectedAccountId,
        isAnalyzing,
        result,
        loadingStage,
        handleAnalyze,
        getRoleLabel,
        role
    } = useDigitalDNALab(accounts, user, onQuotaUpdate);

    const cardRef = useRef<HTMLDivElement>(null);

    const handleDownload = () => {
        if (!cardRef.current) return;
        alert("提示：請直接使用手機截圖或電腦截圖工具來保存這張精美的卡片！");
    };

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8 animate-fade-in pb-20">
            {/* Header */}
            <div className="text-center space-y-2">
                <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter drop-shadow-[0_0_15px_rgba(0,242,234,0.5)]">
                    數位基因實驗室
                </h2>
                <p className="text-gray-400 font-medium tracking-widest text-xs md:text-sm uppercase">
                    Digital Soul Diagnosis • RPG Character Gen
                </p>
                <div className="inline-block bg-gray-800 border border-gray-600 px-4 py-1 rounded-full text-xs text-gray-300 mt-2">
                    目前會員等級：<span className="text-primary font-bold">{getRoleLabel(role)}</span>
                </div>
            </div>

            {/* Controls */}
            <div className="bg-card p-6 rounded-2xl border border-gray-700 flex flex-col md:flex-row gap-4 items-center justify-center">
                <select 
                    value={selectedAccountId} 
                    onChange={e => setSelectedAccountId(e.target.value)}
                    className="bg-dark border border-gray-600 rounded-xl px-4 py-3 text-white outline-none w-full md:w-64"
                >
                    {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.username}</option>
                    ))}
                </select>
                
                <button 
                    onClick={handleAnalyze} 
                    disabled={isAnalyzing}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:brightness-110 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition-all w-full md:w-auto disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {isAnalyzing ? (
                        <><div className="loader w-4 h-4 border-t-white"></div> {loadingStage}</>
                    ) : (
                        '🧪 開始基因分析 (10 點)'
                    )}
                </button>
            </div>

            {/* Result Area */}
            {result && (
                <div className="relative w-full max-w-md mx-auto" ref={cardRef}>
                    {/* The Card Container */}
                    <div className="bg-gradient-to-b from-gray-900 to-black rounded-[2rem] border-4 border-purple-500/50 shadow-[0_0_50px_rgba(168,85,247,0.3)] overflow-hidden relative">
                        
                        {/* Decorative Header */}
                        <div className="bg-purple-900/30 p-4 border-b border-purple-500/30 flex justify-between items-center">
                            <span className="text-[10px] font-black tracking-[0.2em] text-purple-300 uppercase">AutoSocial Lab</span>
                            <div className="flex gap-1">
                                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            </div>
                        </div>

                        {/* Character Image */}
                        <div className="aspect-square w-full bg-white relative p-8 flex items-center justify-center overflow-hidden group">
                            {/* Background Pattern */}
                            <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                            
                            {result.imageUrl ? (
                                <img src={result.imageUrl} alt="Character" className="relative z-10 w-full h-full object-contain drop-shadow-2xl filter group-hover:scale-105 transition-transform duration-500" />
                            ) : (
                                <div className="text-black/50 font-bold">Image Gen Failed</div>
                            )}

                            {/* VIP Effect for Business Users */}
                            {role === 'business' && (
                                <div className="absolute top-4 right-4 bg-yellow-400 text-black font-black px-3 py-1 rounded-full text-xs shadow-lg animate-bounce z-20">
                                    👑 VIP USER
                                </div>
                            )}
                        </div>

                        {/* Stats Panel */}
                        <div className="p-6 space-y-6">
                            
                            {/* Title & Name */}
                            <div className="text-center">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">{result.species}</h3>
                                <h2 className="text-2xl font-black text-white leading-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                                    {result.title}
                                </h2>
                            </div>

                            {/* Stats Grid (RPG Style) */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <StatBar label="混亂 (Chaos)" value={result.stats.chaos} color="bg-red-500" />
                                <StatBar label="友善 (Chill)" value={result.stats.chill} color="bg-blue-500" />
                                <StatBar label="知識 (INT)" value={result.stats.intellect} color="bg-green-500" />
                                <StatBar label="攻擊 (ATK)" value={result.stats.aggression} color="bg-orange-500" />
                                <StatBar label="感性 (EMO)" value={result.stats.emo} color="bg-purple-500" />
                                <StatBar label="幸運 (LUCK)" value={result.stats.luck} color="bg-yellow-500" />
                            </div>

                            {/* The Roast Comment */}
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10 relative">
                                <span className="absolute -top-2 left-4 text-2xl">❝</span>
                                <p className="text-gray-300 text-sm italic text-center font-medium leading-relaxed pt-2">
                                    {result.comment}
                                </p>
                                <span className="absolute -bottom-4 right-4 text-2xl text-gray-600">❞</span>
                            </div>

                            {/* Footer */}
                            <div className="text-center pt-2">
                                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                                    Powered by AutoSocial AI
                                </p>
                            </div>
                        </div>
                    </div>

                    <button onClick={handleDownload} className="mt-6 w-full text-center text-gray-400 hover:text-white text-sm underline">
                        ⭳ 保存截圖
                    </button>
                </div>
            )}
        </div>
    );
};

const StatBar = ({ label, value, color }: { label: string, value: number, color: string }) => (
    <div className="flex flex-col gap-1">
        <div className="flex justify-between text-[10px] font-bold text-gray-400">
            <span>{label}</span>
            <span>{value}</span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full ${color}`} style={{ width: `${value}%` }}></div>
        </div>
    </div>
);

export default DigitalDNALab;
