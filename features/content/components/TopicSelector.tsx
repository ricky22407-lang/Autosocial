
import React from 'react';
import { TrendingTopic } from '../../../types';

interface Props {
    topic: string;
    setTopic: (val: string) => void;
    mode: 'brand' | 'viral';
    setMode: (val: 'brand' | 'viral') => void;
    trends: {
        data: TrendingTopic[];
        loading: boolean;
        load: (refresh?: boolean) => void;
    };
    onNext: () => void;
    onSetSourceUrl?: (url: string) => void;
}

export const TopicSelector: React.FC<Props> = ({ topic, setTopic, mode, setMode, trends, onNext, onSetSourceUrl }) => {
    // Note: display logic is now handled in the hook. 
    // trends.data is always the "current visible batch".

    const handleTopicClick = (t: TrendingTopic) => {
        setTopic(t.title);
        if (onSetSourceUrl && t.url) {
            onSetSourceUrl(t.url);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 md:space-y-12 animate-fade-in pt-4 md:pt-10">
            <div className="text-center space-y-3">
                <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                    What's Next?
                </h2>
                <p className="text-gray-400 font-bold tracking-widest uppercase text-xs md:text-base">輸入核心主題，讓 AI 為您打造吸睛內容</p>
            </div>
            
            <div className="glass-card p-6 md:p-12 rounded-[2rem] shadow-2xl space-y-6 md:space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full pointer-events-none"></div>

                <div className="flex p-1.5 bg-black/40 rounded-2xl border border-white/5 relative z-10">
                    <button onClick={() => setMode('brand')} className={`flex-1 py-3 md:py-4 rounded-xl font-bold tracking-wide transition-all text-sm md:text-base ${mode === 'brand' ? 'bg-primary text-black shadow-[0_0_20px_rgba(0,242,234,0.4)]' : 'text-gray-500 hover:text-white'}`}>品牌模式</button>
                    <button onClick={() => setMode('viral')} className={`flex-1 py-3 md:py-4 rounded-xl font-bold tracking-wide transition-all text-sm md:text-base ${mode === 'viral' ? 'bg-secondary text-white shadow-[0_0_20px_rgba(255,0,85,0.4)]' : 'text-gray-500 hover:text-white'}`}>爆文模式 (小紅書)</button>
                </div>

                <div className="flex flex-col md:flex-row gap-3 relative z-10">
                    <input value={topic} onChange={e => setTopic(e.target.value)} className="flex-1 p-4 md:p-5 rounded-2xl text-lg md:text-xl font-medium placeholder-gray-600 outline-none w-full" placeholder="輸入主題 (例如：夏季保養、今日新聞...)" />
                    <button 
                        onClick={() => trends.load(true)} 
                        disabled={trends.loading}
                        className="bg-gray-800 hover:bg-gray-700 px-8 py-4 md:py-0 rounded-2xl text-white font-bold transition-all flex flex-row md:flex-col items-center justify-center gap-2 md:gap-1 border border-gray-700 hover:border-white/20 whitespace-nowrap disabled:opacity-50"
                    >
                      <span className="text-sm">{trends.loading ? '挖掘中...' : '🔥 挖掘靈感'}</span>
                      {!trends.loading && <span className="text-[9px] bg-primary/20 text-primary px-2 rounded-full font-black">3 點數</span>}
                    </button>
                </div>

                {trends.loading ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2">
                        <div className="loader border-t-primary scale-125"></div>
                        <span className="text-xs text-gray-500 font-mono animate-pulse">AI 正在分析全網熱搜話題...</span>
                    </div>
                ) : trends.data.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-72 overflow-y-auto p-4 border border-white/5 rounded-2xl bg-black/20 custom-scrollbar relative z-10 animate-fade-in">
                        {trends.data.map((t, i) => (
                            <div key={i} onClick={() => handleTopicClick(t)} className={`p-4 rounded-xl cursor-pointer transition-all group backdrop-blur-md ${topic === t.title ? 'bg-primary/20 border-primary border' : 'bg-white/5 border-transparent border hover:border-white/20 hover:bg-white/10'}`}>
                                <h4 className="font-bold text-white text-sm mb-1 line-clamp-1 group-hover:text-primary transition-colors">{t.title}</h4>
                                <p className="text-[11px] text-gray-500 line-clamp-1">{t.description}</p>
                            </div>
                        ))}
                    </div>
                )}

                <button onClick={onNext} disabled={!topic} className={`w-full py-5 md:py-6 rounded-2xl font-black text-white shadow-2xl hover:opacity-90 transition-all disabled:opacity-30 text-lg md:text-xl tracking-widest uppercase relative z-10 ${mode === 'viral' ? 'bg-gradient-to-r from-orange-600 to-red-600' : 'bg-gradient-to-r from-blue-600 to-primary'}`}>
                  開始生成文案 <span className="text-sm font-normal opacity-70 ml-2">(5 點數)</span>
                </button>
            </div>
        </div>
    );
};
