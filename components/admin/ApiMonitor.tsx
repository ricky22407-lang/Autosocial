
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
        <div className="flex flex-col items-center relative group">
            {/* Status Light Indicator - UPDATED: Yellow = Active, Dark = Off */}
            <div 
                className={`absolute top-0 right-2 w-3 h-3 rounded-full border border-black/50 z-10 transition-all duration-500 ${isActive ? 'bg-yellow-400 shadow-[0_0_8px_#facc15] animate-pulse' : 'bg-gray-800 border-gray-700 opacity-50'}`}
                title={isActive ? "運作中 (Active)" : "未啟動 (Offline)"}
            ></div>

            <div className={`relative w-32 h-32 transition-all duration-500 ${!isActive ? 'opacity-20 grayscale' : 'opacity-100'}`}>
                <svg className="transform -rotate-90 w-full h-full filter drop-shadow-lg">
                    <circle 
                        cx="64" cy="64" r={radius} 
                        stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="transparent" 
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
                    <span className={`${fontSizeClass} font-black text-white tracking-tighter`}>{count}</span>
                    <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Calls</span>
                </div>
            </div>
            <p className="mt-3 text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-1 bg-black/20 px-2 py-1 rounded border border-white/5">
                {label}
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

    // Helper for Status Badge
    const StatusBadge = ({ name, active }: { name: string, active: boolean }) => (
        <span className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold border transition-all duration-300 ${active ? 'bg-yellow-500/10 text-yellow-200 border-yellow-500/30' : 'bg-gray-900/50 text-gray-600 border-gray-800'}`}>
            <span className={`w-2 h-2 rounded-full transition-all duration-500 ${active ? 'bg-yellow-400 shadow-[0_0_8px_#facc15] animate-pulse' : 'bg-gray-700'}`}></span>
            {name}
        </span>
    );

    return (
        <div className="bg-card p-8 rounded-xl border border-gray-700 shadow-2xl animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 border-b border-gray-700 pb-6 gap-6">
                <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                        <span className="text-blue-500">⚡</span> API Service Monitor
                    </h3>
                    <div className="flex flex-wrap gap-3 mt-4">
                        {/* Gemini Pool Status */}
                        <StatusBadge name={`Gemini Pool (${status.filter(s => s).length}/5)`} active={status.some(s => s)} />
                        
                        {/* External Providers Status */}
                        <StatusBadge name="Ideogram" active={providers.ideogram} />
                        <StatusBadge name="OpenAI (DALL·E)" active={providers.openai} />
                        <StatusBadge name="Grok (X.AI)" active={providers.grok} />
                    </div>
                </div>
                <div className="text-right bg-black/30 p-4 rounded-xl border border-gray-700 w-full md:w-auto">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-1">Total System Calls</p>
                    <p className="text-4xl font-black text-white font-mono tracking-tight">{apiUsage ? apiUsage.total_calls?.toLocaleString() : 0}</p>
                </div>
            </div>

            {apiUsage ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-10 gap-x-6 justify-items-center">
                    {/* Gemini Keys 1-5 */}
                    <UsageRing count={apiUsage.key_1 || 0} max={2000} label="Gemini #1" color="#3b82f6" isActive={status[0]} />
                    <UsageRing count={apiUsage.key_2 || 0} max={2000} label="Gemini #2" color="#60a5fa" isActive={status[1]} />
                    <UsageRing count={apiUsage.key_3 || 0} max={2000} label="Gemini #3" color="#93c5fd" isActive={status[2]} />
                    <UsageRing count={apiUsage.key_4 || 0} max={2000} label="Gemini #4" color="#bfdbfe" isActive={status[3]} />
                    <UsageRing count={apiUsage.key_5 || 0} max={2000} label="Gemini #5" color="#dbeafe" isActive={status[4]} />

                    {/* External Providers - Added as requested */}
                    <UsageRing count={apiUsage.ideogram || 0} max={500} label="Ideogram" color="#10b981" isActive={providers.ideogram} />
                    <UsageRing count={apiUsage.openai || 0} max={500} label="OpenAI" color="#a855f7" isActive={providers.openai} />
                    <UsageRing count={apiUsage.grok || 0} max={500} label="Grok" color="#ffffff" isActive={providers.grok} />
                </div>
            ) : (
                <div className="text-center py-20 text-gray-500 animate-pulse flex flex-col items-center">
                    <div className="loader border-t-primary mb-4"></div>
                    <span className="text-xs uppercase tracking-widest">Connecting to Telemetry...</span>
                </div>
            )}
            
            <div className="mt-10 bg-gray-900/50 border border-gray-800 p-4 rounded-lg text-[10px] text-gray-400 flex gap-3 items-start">
                <span className="text-xl">ℹ️</span>
                <div>
                    <p className="font-bold text-gray-300 mb-1">系統運作說明 (System Status)：</p>
                    <ul className="list-disc pl-4 space-y-1">
                        <li><span className="text-yellow-400 font-bold">黃燈 (Solid Yellow)</span>：代表 API Key 已設定且服務正常運作中 (Ready)。</li>
                        <li><span className="text-gray-600 font-bold">滅燈 (Dark)</span>：代表環境變數未設定或服務離線 (Not Configured)。</li>
                        <li>Gemini Pool 採用隨機負載平衡 (Random Load Balancing)。</li>
                        <li>繪圖引擎優先級：Ideogram &gt; Imagen (Gemini) &gt; Grok &gt; OpenAI。</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
