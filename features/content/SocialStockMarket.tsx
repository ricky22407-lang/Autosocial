
import React, { useState, useEffect } from 'react';
import { StockTrend, StockCategory } from '../../types';
import { getMarketData, getMarketSummary } from '../../services/gemini/trends';
import { useAuth } from '../../context/AuthContext';

interface Props {
    onNavigateToCreate: (topic: string, platform: 'fb' | 'threads') => void;
    // user & onQuotaUpdate removed, using Context
}

const SocialStockMarket: React.FC<Props> = ({ onNavigateToCreate }) => {
    const { userProfile, refreshProfile } = useAuth();
    
    const [stocks, setStocks] = useState<StockTrend[]>([]);
    const [category, setCategory] = useState<StockCategory>('general');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedStock, setSelectedStock] = useState<StockTrend | null>(null);
    const [summary, setSummary] = useState('');
    const [loadingSummary, setLoadingSummary] = useState(false);

    useEffect(() => {
        loadMarket();
    }, [category]);

    const loadMarket = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getMarketData(category);
            if (data.length === 0) {
                setError("此分類目前沒有足夠數據，正在嘗試重新擷取...");
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

    // Helper for Source Badge
    const SourceBadge = ({ source }: { source: string }) => {
        if (source === 'dcard') return <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">Dcard</span>;
        if (source === 'ptt') return <span className="bg-black text-white border border-white text-[9px] px-1.5 py-0.5 rounded font-bold">PTT</span>;
        return <span className="bg-gray-700 text-gray-300 text-[9px] px-1.5 py-0.5 rounded font-bold">News</span>;
    };

    return (
        <div className="h-full flex flex-col animate-fade-in relative overflow-hidden pb-10">
            {/* 1. Ticker Header (Marquee) */}
            <div className="w-full bg-black border-b border-gray-800 h-10 flex items-center overflow-hidden whitespace-nowrap relative z-10">
                <div className="animate-marquee flex gap-8 text-xs font-mono">
                    {stocks.length > 0 ? stocks.map(s => (
                        <div key={s.id} className="flex gap-2">
                            <span className="text-white font-bold">{s.title.substring(0, 15)}</span>
                            <span className={s.change >= 0 ? "text-red-500" : "text-green-500"}>
                                {s.price.toFixed(1)}
                            </span>
                        </div>
                    )) : <span className="text-gray-500">等待市場開盤...</span>}
                    {/* Duplicate for smooth loop */}
                    {stocks.length > 0 && stocks.map(s => (
                        <div key={s.id + '_dup'} className="flex gap-2">
                            <span className="text-white font-bold">{s.title.substring(0, 15)}</span>
                            <span className={s.change >= 0 ? "text-red-500" : "text-green-500"}>
                                {s.price.toFixed(1)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 2. Main Title */}
            <div className="text-center py-6">
                <h1 className="text-3xl md:text-5xl font-black text-white tracking-tighter mb-2">
                    社群趨勢交易所
                </h1>
                <p className="text-gray-500 text-xs tracking-[0.3em] uppercase">Social Trend Exchange</p>
            </div>

            {/* 3. Category Tabs */}
            <div className="flex justify-center mb-6 px-4">
                <div className="bg-gray-900 p-1 rounded-xl border border-gray-700 flex flex-wrap justify-center gap-1">
                    <button 
                        onClick={() => setCategory('general')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${category === 'general' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        📰 總覽 (News)
                    </button>
                    <button 
                        onClick={() => setCategory('entertainment')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${category === 'entertainment' ? 'bg-pink-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        🎤 娛樂追星
                    </button>
                    <button 
                        onClick={() => setCategory('life')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${category === 'life' ? 'bg-yellow-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        ☕ 生活優惠
                    </button>
                    <button 
                        onClick={() => setCategory('social')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${category === 'social' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        🔥 Dcard/PTT 熱議
                    </button>
                </div>
            </div>

            {/* 4. Stock Grid */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center min-h-[300px]">
                    <div className="flex flex-col items-center">
                        <div className="loader border-t-red-500 scale-150 mb-4"></div>
                        <p className="text-red-500 font-mono text-sm animate-pulse">
                            正在連線交易所主機...
                            {category === 'social' && <span className="block text-xs text-gray-500 mt-2">(讀取 Dcard/PTT 數據可能需要較長時間)</span>}
                        </p>
                    </div>
                </div>
            ) : error || stocks.length === 0 ? (
                <div className="flex-1 flex items-center justify-center min-h-[300px]">
                    <div className="bg-red-900/20 border border-red-500/50 p-8 rounded-2xl text-center max-w-md">
                        <div className="text-4xl mb-4">📉</div>
                        <h3 className="text-xl font-bold text-red-400 mb-2">無數據</h3>
                        <p className="text-gray-400 text-sm mb-6">{error || "市場暫時沒有此分類的數據。"}</p>
                        <button onClick={loadMarket} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold">重試連線</button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 px-4 pb-24 overflow-y-auto custom-scrollbar">
                    {stocks.map((stock) => (
                        <div 
                            key={stock.id} 
                            onClick={() => handleStockClick(stock)}
                            className={`
                                cursor-pointer bg-gray-900 border rounded-xl p-4 transition-all hover:scale-105 active:scale-95 relative group flex flex-col justify-between
                                ${stock.change >= 0 ? 'border-red-900/50 hover:border-red-500' : 'border-green-900/50 hover:border-green-500'}
                            `}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <SourceBadge source={stock.source} />
                                <span className={`text-xs font-black px-1.5 py-0.5 rounded ${stock.change >= 0 ? 'bg-red-900 text-red-400' : 'bg-green-900 text-green-400'}`}>
                                    {stock.change > 0 ? '▲' : '▼'} {Math.abs(stock.change)}%
                                </span>
                            </div>
                            <h3 className="text-base font-bold text-white leading-tight mb-4 line-clamp-3">
                                {stock.title}
                            </h3>
                            <div className="flex justify-between items-end border-t border-gray-800 pt-2">
                                <div>
                                    <p className="text-[9px] text-gray-500 uppercase">熱度</p>
                                    <p className={`text-xl font-black font-mono ${stock.change >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                                        {stock.price.toFixed(0)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] text-gray-500 uppercase">聲量</p>
                                    <p className="text-xs text-white font-mono">{stock.volume}</p>
                                </div>
                            </div>
                            {/* Hover Glow */}
                            <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none ${stock.change >= 0 ? 'bg-red-500' : 'bg-green-500'}`}></div>
                        </div>
                    ))}
                </div>
            )}

            {/* 5. Detail Modal (Drawer) */}
            {selectedStock && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedStock(null)}>
                    <div 
                        className="bg-gray-900 border border-gray-700 w-full max-w-2xl rounded-t-3xl md:rounded-2xl overflow-hidden shadow-2xl relative flex flex-col max-h-[85vh]"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="p-6 border-b border-gray-800 bg-black/50 flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <SourceBadge source={selectedStock.source} />
                                    <span className="text-xs text-gray-500">#{selectedStock.id.slice(-4)}</span>
                                </div>
                                <h2 className="text-2xl font-black text-white mb-2 leading-tight">{selectedStock.title}</h2>
                                <div className="flex gap-4 text-sm font-mono">
                                    <span className={selectedStock.change >= 0 ? 'text-red-500' : 'text-green-500'}>
                                        指數: {selectedStock.price} ({selectedStock.change}%)
                                    </span>
                                    <a href={selectedStock.newsUrl} target="_blank" className="text-blue-400 hover:underline flex items-center gap-1">
                                        查看原始文章 ↗
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
                                    <p className="text-xs text-gray-600 mt-2 text-center">AI 正在閱讀內容並整理重點...</p>
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
                                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:brightness-110 text-white py-4 rounded-xl font-black shadow-lg shadow-blue-900/20 flex flex-col items-center group"
                            >
                                <span className="text-lg group-hover:scale-110 transition-transform">🔵 做多 (FB)</span>
                                <span className="text-[10px] opacity-70 font-normal">生成品牌貼文</span>
                            </button>
                            <button 
                                onClick={() => handleTrade('threads')}
                                className="bg-gradient-to-r from-red-600 to-pink-600 hover:brightness-110 text-white py-4 rounded-xl font-black shadow-lg shadow-red-900/20 flex flex-col items-center group"
                            >
                                <span className="text-lg group-hover:scale-110 transition-transform">🔴 做空 (Threads)</span>
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
