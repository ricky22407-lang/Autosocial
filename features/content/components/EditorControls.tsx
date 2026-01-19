
import React from 'react';
import { ImageIntent } from '../../../types';

interface Props {
    mode: 'brand' | 'viral';
    draft: {
        data: { caption: string; imagePrompt: string };
        setData: React.Dispatch<React.SetStateAction<{ caption: string; firstComment: string; imagePrompt: string; }>>;
    };
    image: {
        intent: ImageIntent;
        setIntent: (val: ImageIntent) => void;
        renderMode: 'plain' | 'ai_text' | 'smart_layout';
        setRenderMode: (val: any) => void;
        customText: string;
        setCustomText: (val: string) => void;
        layoutTitle: string;
        setLayoutTitle: (val: string) => void;
        layoutSubtitle: string;
        setLayoutSubtitle: (val: string) => void;
        url?: string;
        isGenerating: boolean;
        generate: () => void;
    };
    onBack: () => void;
}

export const EditorControls: React.FC<Props> = ({ mode, draft, image, onBack }) => {
    return (
        <div className="space-y-6">
            <div className="glass-card p-6 md:p-8 rounded-3xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-gray-300 tracking-tighter uppercase text-sm">內容編輯器 ({mode === 'viral' ? '爆文模式' : '品牌模式'})</h3>
                    <button onClick={onBack} className="text-[10px] font-bold text-red-400 hover:text-white transition-colors uppercase tracking-widest border border-red-500/30 px-2 py-1 rounded">← 重設主題</button>
                </div>
                
                <label className="text-[10px] text-gray-500 font-bold mb-2 block uppercase tracking-wider">貼文文案 (Caption)</label>
                <textarea 
                    value={draft.data.caption} 
                    onChange={e => draft.setData(prev => ({...prev, caption: e.target.value}))} 
                    className="w-full h-[200px] p-6 text-white mb-6 resize-none outline-none custom-scrollbar leading-relaxed text-[15px] rounded-2xl" 
                />

                <div className="mb-6 p-4 bg-black/30 rounded-xl border border-gray-700">
                    <label className="text-[10px] text-primary font-bold mb-2 block uppercase tracking-wider">選擇配圖風格 (Image Intent)</label>
                    <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                        {(['product_showcase', 'promotion', 'lifestyle', 'educational', 'festival'] as ImageIntent[]).map(intent => (
                            <button 
                                key={intent}
                                onClick={() => image.setIntent(intent)}
                                className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap border transition-all ${image.intent === intent ? 'bg-primary text-black border-primary' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}`}
                            >
                                {intent === 'product_showcase' ? '📦 產品特寫' : intent === 'promotion' ? '🏷️ 促銷 Banner' : intent === 'lifestyle' ? '🏖️ 情境生活' : intent === 'educational' ? '📚 知識圖卡' : '🎉 節慶賀圖'}
                            </button>
                        ))}
                    </div>
                    
                    <div className="mb-4 pt-3 border-t border-gray-700">
                        <label className="text-[10px] text-gray-400 font-bold mb-2 block uppercase tracking-wider">文字渲染模式 (Text Mode)</label>
                        <div className="flex bg-black/40 rounded-lg p-1 mb-4 border border-gray-600">
                            <button onClick={() => image.setRenderMode('plain')} className={`flex-1 py-2 rounded text-xs font-bold transition-all ${image.renderMode === 'plain' ? 'bg-gray-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>純淨無字</button>
                            <button onClick={() => image.setRenderMode('smart_layout')} className={`flex-1 py-2 rounded text-xs font-bold transition-all ${image.renderMode === 'smart_layout' ? 'bg-yellow-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>⚡ 智慧排版</button>
                            <button onClick={() => image.setRenderMode('ai_text')} className={`flex-1 py-2 rounded text-xs font-bold transition-all ${image.renderMode === 'ai_text' ? 'bg-red-900/50 text-red-300 border border-red-800' : 'text-gray-500 hover:text-gray-300'}`}>AI 生成</button>
                        </div>

                        {image.renderMode === 'smart_layout' && (
                            <div className="bg-yellow-900/10 border border-yellow-600/30 p-4 rounded-xl animate-fade-in space-y-3">
                                <p className="text-[10px] text-yellow-200/80 mb-1 flex items-center gap-2"><span className="text-lg">✨</span> 系統將自動在圖片底部合成電影感字幕。</p>
                                <div><label className="text-[10px] text-gray-400 block mb-1">主標題</label><input value={image.layoutTitle} onChange={e => image.setLayoutTitle(e.target.value)} className="w-full bg-black/40 border border-yellow-600/30 rounded p-2 text-white text-sm focus:border-yellow-500 outline-none" placeholder="例如：泰國曼谷五日遊" /></div>
                                <div><label className="text-[10px] text-gray-400 block mb-1">副標題 / 價格</label><input value={image.layoutSubtitle} onChange={e => image.setLayoutSubtitle(e.target.value)} className="w-full bg-black/40 border border-yellow-600/30 rounded p-2 text-yellow-400 font-bold text-sm focus:border-yellow-500 outline-none" placeholder="例如：$29,900 起" /></div>
                            </div>
                        )}

                        {image.renderMode === 'ai_text' && (
                            <div className="bg-red-900/10 border border-red-500/50 p-4 rounded-xl animate-fade-in">
                                <p className="text-xs text-red-300 font-bold mb-2 flex items-center gap-2"><span>⚠️</span> 警告：AI 直接生成</p>
                                <input value={image.customText} onChange={e => image.setCustomText(e.target.value)} placeholder="請輸入欲顯示的文字" className="w-full bg-black/40 border border-red-500/30 rounded-lg p-3 text-white text-sm focus:border-red-500 outline-none" />
                            </div>
                        )}
                    </div>

                    <label className="flex justify-between items-center text-[10px] text-gray-500 font-bold mb-2 uppercase tracking-wider">
                        <span>視覺提示詞 (AI Prompt)</span>
                        <button onClick={() => draft.setData(prev => ({...prev, imagePrompt: ''}))} className="text-red-400 hover:text-white transition-colors text-[9px] border border-red-500/30 px-1 rounded">清空以重新生成</button>
                    </label>
                    <textarea 
                        value={draft.data.imagePrompt} 
                        onChange={e => draft.setData(prev => ({...prev, imagePrompt: e.target.value}))} 
                        className="w-full h-16 p-3 text-gray-300 text-xs outline-none resize-none leading-relaxed rounded-xl border border-gray-700 bg-black/20 focus:border-primary/50 transition-colors" 
                        placeholder={image.url ? "手動修改 Prompt..." : "AI 將自動填寫..."} 
                    />
                </div>
                
                <div className="space-y-4">
                    <button 
                        onClick={image.generate} 
                        disabled={image.isGenerating}
                        className={`w-full py-5 rounded-2xl font-black text-white shadow-lg transition-all flex items-center justify-center gap-3 tracking-widest uppercase border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed ${image.url ? 'bg-black/40 hover:bg-black/60' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110'}`}
                    >
                        {image.isGenerating ? <><div className="loader w-4 h-4 border-t-white"></div>繪製中...</> : image.url ? '重新繪製 (5 點數)' : '生成商業設計圖 (8 點數)'}
                    </button>
                </div>
            </div>
        </div>
    );
};
