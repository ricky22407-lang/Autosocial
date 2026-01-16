
import React, { useState, useEffect } from 'react';
import { StockTrend, UserProfile } from '../types';
import { getMarketData, getMarketSummary } from '../services/gemini/trends';
import { checkAndUseQuota } from '../services/authService';

interface Props {
    user: UserProfile | null;
    onNavigateToCreate: (topic: string, platform: 'fb' | 'threads') => void;
    onQuotaUpdate: () => void;
}

const SocialStockMarket: React.FC<Props> = ({ user, onNavigateToCreate, onQuotaUpdate }) => {
    const [stocks, setStocks] = useState<StockTrend[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedStock, setSelectedStock] = useState<StockTrend | null>(null);
    const [summary, setSummary] = useState('');
    const [loadingSummary, setLoadingSummary] = useState(false);

    useEffect(() => {
        loadMarket();
        const timer = setInterval(loadMarket, 60000); // Refresh every minute
        return () => clearInterval(timer);
    }, []);

    const loadMarket = async () => {
        try {
            setError('');
            const data = await getMarketData();
            if (data.length === 0) {
                // If array is empty but no error thrown, it might be an initialization issue or empty DB
                setError("目前沒有市場數據，正在嘗試重新擷取...");
            }
            setStocks(data);
        } catch (e: any) {
            console.error(e);
            setError("無法連線至交易所主機 (Firebase Error)。請稍後再試。");
        } finally {
            setLoading(false);
        }
    };

    const handleStockClick = async (stock: StockTrend) => {
        setSelectedStock(stock);
        setSummary(stock.aiSummary || '');
        
        if (!stock.aiSummary) {
            setLoadingSummary(true);
            try {
                // Check quota? Since it's a shared resource update, maybe free or minimal cost?
                // Decision: Free for viewing, system pays the token cost (or admin gift).
                // But let's add a small cost if it's a fresh generation to prevent abuse? 
                // Actually, "Shared Cache" implies user shouldn't pay if cached.
                // If not cached, the first user triggers it. Let's make it 1 point or free. 
                // Let's make it free to encourage exploration.
                const newSummary = await getMarketSummary(stock);
                setSummary(newSummary);
                // Optimistically update local state
                setStocks(prev => prev.map(s => s.id === stock.id ? { ...s, aiSummary: newSummary } : s));
            } catch (e) {
                setSummary("分析失敗，請稍後再試。");
            } finally {
                setLoadingSummary(false);
            }
        }
    };

    const handleTrade = (platform: 'fb' | 'threads') => {
        if (!selectedStock) return;
        onNavigateToCreate(selectedStock.title, platform);
    };

    return (
        <div className="h-full flex flex-col animate-fade-in relative overflow-hidden pb-10">
            {/* 1. Ticker Header (Marquee) */}
            <div className="w-full bg-black border-b border-gray-800 h-10 flex items-center overflow-hidden whitespace-nowrap relative z-10">
                <div className="animate-marquee flex gap-8 text-xs font-mono">
                    {stocks.length > 0 ? stocks.map(s => (
                        <div key={s.id} className="flex gap-2">
                            <span className="text-white font-bold">{s.title}</span>
                            <span className={s.change >= 0 ? "text-red-500" : "text-green-500"}>
                                {s.price.toFixed(1)} ({s.change > 0 ? '+' : ''}{s.change}%)
                            </span>
                        </div>
                    )) : <span className="text-gray-500">等待市場開盤...</span>}
                    {/* Duplicate for smooth loop */}
                    {stocks.length > 0 && stocks.map(s => (
                        <div key={s.id + '_dup'} className="flex gap-2">
                            <span className="text-white font-bold">{s.title}</span>
                            <span className={s.change >= 0 ? "text-red-500" : "text-green-500"}>
                                {s.price.toFixed(1)} ({s.change > 0 ? '+' : ''}{s.change}%)
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 2. Main Title */}
            <div className="text-center py-8">
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-2">
                    社群趨勢交易所
                </h1>
                <p className="text-gray-500 text-xs tracking-[0.3em] uppercase">Social Trend Exchange</p>
            </div>

            {/* 3. Stock Grid */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center">
                        <div className="loader border-t-red-500 scale-150 mb-4"></div>
                        <p className="text-red-500 font-mono text-sm animate-pulse">連線交易所主機...</p>
                    </div>
                </div>
            ) : error || stocks.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="bg-red-900/20 border border-red-500/50 p-8 rounded-2xl text-center max-w-md">
                        <div className="text-4xl mb-4">📉</div>
                        <h3 className="text-xl font-bold text-red-400 mb-2">無法取得市場數據</h3>
                        <p className="text-gray-400 text-sm mb-6">{error || "市場暫時關閉或連線逾時。"}</p>
                        <button 
                            onClick={() => { setLoading(true); loadMarket(); }}
                            className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold"
                        >
                            重試連線
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 px-4 pb-24 overflow-y-auto custom-scrollbar">
                    {stocks.map((stock) => (
                        <div 
                            key={stock.id} 
                            onClick={() => handleStockClick(stock)}
                            className={`
                                cursor-pointer bg-gray-900 border rounded-xl p-4 transition-all hover:scale-105 active:scale-95 relative group
                                ${stock.change >= 0 ? 'border-red-900/50 hover:border-red-500' : 'border-green-900/50 hover:border-green-500'}
                            `}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-[10px] text-gray-500 font-mono">#{stock.id.slice(-4)}</span>
                                <span className={`text-xs font-black px-1.5 py-0.5 rounded ${stock.change >= 0 ? 'bg-red-900 text-red-400' : 'bg-green-900 text-green-400'}`}>
                                    {stock.change > 0 ? '▲' : '▼'} {Math.abs(stock.change)}%
                                </span>
                            </div>
                            <h3 className="text-lg font-bold text-white leading-tight mb-4 line-clamp-2 min-h-[3rem]">
                                {stock.title}
                            </h3>
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-[10px] text-gray-500 uppercase">熱度指數</p>
                                    <p className={`text-2xl font-black font-mono ${stock.change >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                                        {stock.price.toFixed(1)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-gray-500 uppercase">聲量</p>
                                    <p className="text-sm text-white font-mono">{stock.volume}</p>
                                </div>
                            </div>
                            {/* Hover Glow */}
                            <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none ${stock.change >= 0 ? 'bg-red-500' : 'bg-green-500'}`}></div>
                        </div>
                    ))}
                </div>
            )}

            {/* 4. Detail Modal (Drawer) */}
            {selectedStock && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedStock(null)}>
                    <div 
                        className="bg-gray-900 border border-gray-700 w-full max-w-2xl rounded-t-3xl md:rounded-2xl overflow-hidden shadow-2xl relative flex flex-col max-h-[85vh]"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="p-6 border-b border-gray-800 bg-black/50 flex justify-between items-start">
                            <div>
                                <h2 className="text-3xl font-black text-white mb-2">{selectedStock.title}</h2>
                                <div className="flex gap-4 text-sm font-mono">
                                    <span className={selectedStock.change >= 0 ? 'text-red-500' : 'text-green-500'}>
                                        指數: {selectedStock.price} ({selectedStock.change}%)
                                    </span>
                                    <a href={selectedStock.newsUrl} target="_blank" className="text-blue-400 hover:underline flex items-center gap-1">
                                        查看新聞來源 ↗
                                    </a>
                                </div>
                            </div>
                            <button onClick={() => setSelectedStock(null)} className="text-gray-500 hover:text-white text-2xl">✕</button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto bg-gradient-to-b from-gray-900 to-black">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                🤖 AI 財報摘要 (Trend Analysis)
                            </h3>
                            
                            {loadingSummary ? (
                                <div className="space-y-3 animate-pulse">
                                    <div className="h-4 bg-gray-800 rounded w-3/4"></div>
                                    <div className="h-4 bg-gray-800 rounded w-full"></div>
                                    <div className="h-4 bg-gray-800 rounded w-5/6"></div>
                                    <p className="text-xs text-gray-600 mt-2 text-center">AI 正在閱讀新聞並整理重點...</p>
                                </div>
                            ) : (
                                <div className="bg-gray-800/50 p-5 rounded-xl border border-gray-700 text-gray-200 leading-relaxed whitespace-pre-wrap text-sm">
                                    {summary}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer (Action Buttons) */}
                        <div className="p-6 border-t border-gray-800 bg-black/50 grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => handleTrade('fb')}
                                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:brightness-110 text-white py-4 rounded-xl font-black shadow-lg shadow-blue-900/20 flex flex-col items-center"
                            >
                                <span className="text-lg">🔵 做多 (FB)</span>
                                <span className="text-[10px] opacity-70 font-normal">生成品牌貼文</span>
                            </button>
                            <button 
                                onClick={() => handleTrade('threads')}
                                className="bg-gradient-to-r from-red-600 to-pink-600 hover:brightness-110 text-white py-4 rounded-xl font-black shadow-lg shadow-red-900/20 flex flex-col items-center"
                            >
                                <span className="text-lg">🔴 做空 (Threads)</span>
                                <span className="text-[10px] opacity-70 font-normal">生成個人碎碎念</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <style>{`
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-marquee {
                    animation: marquee 30s linear infinite;
                }
            `}</style>
        </div>
    );
};

export default SocialStockMarket;
