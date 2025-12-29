
import React from 'react';

// --- SVG Ring Component ---
const UsageRing = ({ count, max, label, color, isActive }: { count: number, max: number, label: string, color: string, isActive?: boolean }) => {
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(100, Math.max(0, (count / max) * 100));
    const offset = circumference - (progress / 100) * circumference;
    
    // Dynamic Font Size logic
    const fontSizeClass = count > 999 ? 'text-lg' : 'text-2xl';
    
    return (
        <div className="flex flex-col items-center relative">
            {/* Status Light Indicator */}
            <div 
                className={`absolute top-0 right-2 w-4 h-4 rounded-full border-2 border-card shadow-lg z-10 ${isActive ? 'bg-green-500 animate-pulse shadow-green-500/50' : 'bg-red-900/50 shadow-none'}`}
                title={isActive ? "已連線 (Active)" : "未設定 (Not Configured)"}
            ></div>

            <div className={`relative w-32 h-32 ${!isActive ? 'opacity-30 grayscale' : ''}`}>
                <svg className="transform -rotate-90 w-full h-full">
                    <circle 
                        cx="64" cy="64" r={radius} 
                        stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="transparent" 
                    />
                    <circle 
                        cx="64" cy="64" r={radius} 
                        stroke={color} strokeWidth="8" fill="transparent" 
                        strokeDasharray={circumference} 
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`${fontSizeClass} font-black text-white`}>{count}</span>
                    <span className="text-[10px] text-gray-400">次調用</span>
                </div>
            </div>
            <p className="mt-2 text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                {label}
            </p>
            <p className={`text-[10px] mt-1 ${isActive ? 'text-gray-600' : 'text-red-800'}`}>
                {isActive ? `負載 ${(progress).toFixed(1)}%` : '離線 (OFFLINE)'}
            </p>
        </div>
    );
};

interface Props {
    apiUsage: any;
    apiStatus?: {
        keyStatus: boolean[]; // [true, true, true, false, false]
        providers: {
            openai: boolean;
            ideogram: boolean;
            grok: boolean;
        }
    };
}

export const ApiMonitor: React.FC<Props> = ({ apiUsage, apiStatus }) => {
    const status = apiStatus?.keyStatus || [false, false, false, false, false];
    const providers = apiStatus?.providers || { openai: false, ideogram: false, grok: false };

    return (
        <div className="bg-card p-8 rounded-xl border border-gray-700 shadow-2xl">
            <div className="flex justify-between items-end mb-8 border-b border-gray-700 pb-4">
                <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">🔗 API 服務狀態監控</h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {/* Gemini Status */}
                        <span className="flex items-center gap-1 bg-blue-900/30 px-2 py-1 rounded text-blue-400 text-xs font-bold border border-blue-800">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                            Gemini Pool ({status.filter(s => s).length}/5)
                        </span>
                        
                        {/* External Providers Status */}
                        {providers.ideogram ? (
                            <span className="flex items-center gap-1 bg-green-900/30 px-2 py-1 rounded text-green-400 text-xs font-bold border border-green-800">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span> Ideogram
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 bg-red-900/20 px-2 py-1 rounded text-red-500 text-xs font-bold border border-red-900/50">
                                <span className="w-2 h-2 rounded-full bg-red-600"></span> Ideogram
                            </span>
                        )}

                        {providers.openai ? (
                            <span className="flex items-center gap-1 bg-purple-900/30 px-2 py-1 rounded text-purple-400 text-xs font-bold border border-purple-800">
                                <span className="w-2 h-2 rounded-full bg-purple-500"></span> OpenAI
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 bg-red-900/20 px-2 py-1 rounded text-red-500 text-xs font-bold border border-red-900/50">
                                <span className="w-2 h-2 rounded-full bg-red-600"></span> OpenAI
                            </span>
                        )}

                        {providers.grok ? (
                            <span className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded text-white text-xs font-bold border border-white/30">
                                <span className="w-2 h-2 rounded-full bg-white"></span> Grok
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 bg-red-900/20 px-2 py-1 rounded text-red-500 text-xs font-bold border border-red-900/50">
                                <span className="w-2 h-2 rounded-full bg-red-600"></span> Grok
                            </span>
                        )}
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-xs text-gray-500 font-bold uppercase">總調用次數</p>
                    <p className="text-4xl font-black text-blue-400 font-mono">{apiUsage ? apiUsage.total_calls : 0}</p>
                </div>
            </div>

            {apiUsage ? (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-8 justify-items-center">
                    <UsageRing count={apiUsage.key_1 || 0} max={2000} label="Gemini #1 (主)" color="#3b82f6" isActive={status[0]} />
                    <UsageRing count={apiUsage.key_2 || 0} max={2000} label="Gemini #2 (備)" color="#10b981" isActive={status[1]} />
                    <UsageRing count={apiUsage.key_3 || 0} max={2000} label="Gemini #3 (備)" color="#8b5cf6" isActive={status[2]} />
                    <UsageRing count={apiUsage.key_4 || 0} max={2000} label="Gemini #4 (備)" color="#f59e0b" isActive={status[3]} />
                    <UsageRing count={apiUsage.key_5 || 0} max={2000} label="Gemini #5 (備)" color="#ef4444" isActive={status[4]} />
                </div>
            ) : (
                <div className="text-center py-20 text-gray-500 animate-pulse">
                    正在連線至監控伺服器...
                </div>
            )}
            
            <div className="mt-8 bg-blue-900/10 border border-blue-900/30 p-4 rounded-lg text-xs text-blue-300 flex gap-3">
                <span className="text-2xl">ℹ️</span>
                <div>
                    <p className="font-bold mb-1">系統運作說明：</p>
                    <ul className="list-disc pl-4 space-y-1 text-blue-200/70">
                        <li>綠燈代表環境變數已設定且服務在線。</li>
                        <li>付費版 (Pro/Business) 優先使用 Ideogram (Standard) 或 OpenAI。</li>
                        <li>若主要繪圖 API 失敗，系統會自動降級至 Gemini 備援。</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
