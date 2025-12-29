
import React, { useState } from 'react';
import { generateSeoArticle } from '../services/geminiService';
import { checkAndUseQuota, logUserActivity } from '../services/authService';
import { UserProfile } from '../types';

interface Props {
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const SeoArticleGenerator: React.FC<Props> = ({ user, onQuotaUpdate }) => {
    // Input States - Generic Defaults
    const [topic, setTopic] = useState('');
    const [length, setLength] = useState('約 800 字');
    const [keywords, setKeywords] = useState('');
    
    // Checkbox Options
    const [optAgenda, setOptAgenda] = useState(true);
    const [optMeta, setOptMeta] = useState(true);
    const [optFAQ, setOptFAQ] = useState(true);
    const [optRefLinks, setOptRefLinks] = useState(true);

    // Output States
    const [resultText, setResultText] = useState('');
    const [imageKeyword, setImageKeyword] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [copyBtnText, setCopyBtnText] = useState('複製全文');

    const handleGenerate = async () => {
        if (!topic.trim()) {
            setErrorMsg("請輸入核心關鍵字！");
            return;
        }
        if (!user || isGenerating) return;

        setErrorMsg('');
        
        // [BILLING] SEO Articles: 15 Credits (Lowered from 20)
        const COST = 15;

        // Check Quota with Ledger Action
        try {
            const allowed = await checkAndUseQuota(user.user_id, COST, 'GENERATE_SEO_ARTICLE', { topic });
            if (!allowed) {
                return;
            }
            onQuotaUpdate();
        } catch (e) {
            setErrorMsg("資料庫連線錯誤，無法確認配額。");
            return;
        }

        setIsGenerating(true);
        setResultText('');
        setImageKeyword('');

        try {
            const result = await generateSeoArticle(
                topic, 
                length, 
                keywords, 
                { agenda: optAgenda, meta: optMeta, faq: optFAQ, refLinks: optRefLinks }
            );
            setResultText(result.fullText);
            setImageKeyword(result.imageKeyword);

            // --- Log Usage ---
            logUserActivity({
                uid: user.user_id,
                act: 'seo',
                topic: topic,
                prmt: `Keywords: ${keywords}, Length: ${length}`,
                res: result.fullText,
                params: JSON.stringify({ options: { optAgenda, optMeta, optFAQ } })
            });

        } catch (e: any) {
            console.error(e);
            setErrorMsg(`生成失敗: ${e.message || "未知錯誤"}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopy = () => {
        if (!resultText) return;
        navigator.clipboard.writeText(resultText).then(() => {
            setCopyBtnText('已複製！');
            setTimeout(() => setCopyBtnText('複製全文'), 2000);
        });
    };

    const searchStock = (provider: 'pexels' | 'unsplash' | 'pixabay') => {
        const query = imageKeyword || topic;
        const encoded = encodeURIComponent(query);
        let url = '';

        if (provider === 'pexels') url = `https://www.pexels.com/zh-tw/search/${encoded}/`;
        else if (provider === 'unsplash') url = `https://unsplash.com/s/photos/${encoded}`;
        else if (provider === 'pixabay') url = `https://pixabay.com/images/search/${encoded}/`;

        window.open(url, '_blank');
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">
                AI 部落格文章生成器 <span className="text-sm font-normal text-primary bg-blue-900/30 border border-blue-900 px-2 py-1 rounded-full ml-2">SEO 專用版</span>
            </h2>

            {/* Step 1: Input Form */}
            <div className="bg-card p-6 rounded-xl border border-gray-700 shadow-lg">
                <h2 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-2">步驟一：生成 SEO 文章</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="col-span-1">
                        <label className="block text-sm font-medium text-gray-400 mb-1">核心關鍵字 (主題)</label>
                        <input 
                            type="text" 
                            value={topic} 
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="例如：2024 AI 趨勢、美食+旅遊"
                            className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none"
                        />
                    </div>
                    <div className="col-span-1">
                        <label className="block text-sm font-medium text-gray-400 mb-1">預計長度</label>
                        <select 
                            value={length} 
                            onChange={(e) => setLength(e.target.value)}
                            className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none"
                        >
                            <option value="約 800 字">約 800 字 (標準)</option>
                            <option value="約 1500 字">約 1500 字 (深度長文)</option>
                            <option value="約 2500 字">約 2500 字 (權威指南)</option>
                        </select>
                    </div>
                    
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-400 mb-1">LSI 關鍵字組 (長尾關鍵字)</label>
                        <textarea 
                            rows={2} 
                            value={keywords}
                            onChange={(e) => setKeywords(e.target.value)}
                            placeholder="例如：ChatGPT 應用, 數位行銷工具, 生產力提升"
                            className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none resize-y"
                        />
                    </div>

                    {/* SEO Options */}
                    <div className="col-span-2 bg-dark/50 p-4 rounded-lg border border-gray-600">
                        <span className="block text-sm font-medium text-gray-300 mb-3">文章必須要素 (SEO 優化選項)</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className="inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={optAgenda} onChange={(e) => setOptAgenda(e.target.checked)} className="form-checkbox h-5 w-5 text-indigo-600 rounded bg-gray-700 border-gray-500" />
                                <span className="ml-2 text-gray-300 text-sm">生成文章目錄 (Agenda/TOC)</span>
                            </label>
                            <label className="inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={optMeta} onChange={(e) => setOptMeta(e.target.checked)} className="form-checkbox h-5 w-5 text-indigo-600 rounded bg-gray-700 border-gray-500" />
                                <span className="ml-2 text-gray-300 text-sm">Meta Description (摘要)</span>
                            </label>
                            <label className="inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={optFAQ} onChange={(e) => setOptFAQ(e.target.checked)} className="form-checkbox h-5 w-5 text-indigo-600 rounded bg-gray-700 border-gray-500" />
                                <span className="ml-2 text-gray-300 text-sm">FAQ 常見問題區塊</span>
                            </label>
                            <label className="inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={optRefLinks} onChange={(e) => setOptRefLinks(e.target.checked)} className="form-checkbox h-5 w-5 text-indigo-600 rounded bg-gray-700 border-gray-500" />
                                <span className="ml-2 text-gray-300 text-sm">自動附上權威參考連結 (E-E-A-T)</span>
                            </label>
                        </div>
                    </div>
                </div>

                {errorMsg && (
                    <div className="mt-4 p-3 bg-red-900/50 border border-red-500 text-red-200 rounded">
                        {errorMsg}
                    </div>
                )}

                <button 
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="mt-6 w-full py-3 px-4 text-white font-bold bg-primary rounded-lg shadow-md hover:bg-blue-600 transition duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isGenerating ? <div className="loader"></div> : null}
                    {isGenerating ? 'AI 正在撰寫中 (約需 10-20 秒)...' : '開始生成純文字文章 (消耗 15 配額)'}
                </button>
            </div>

            {/* Step 2: Result */}
            {resultText && (
                <div className="bg-card p-6 rounded-xl shadow-lg border border-gray-700 animate-fade-in">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-white">文章內容 (純文字)</h2>
                        <button 
                            onClick={handleCopy}
                            className={`py-2 px-4 rounded-lg shadow-md transition duration-150 text-sm font-medium text-white ${copyBtnText === '已複製！' ? 'bg-green-600' : 'bg-primary hover:bg-blue-600'}`}
                        >
                            {copyBtnText}
                        </button>
                    </div>
                    <textarea 
                        readOnly
                        value={resultText}
                        rows={20} 
                        className="w-full bg-dark p-4 border border-gray-600 rounded-lg text-gray-200 text-base leading-relaxed resize-y font-sans focus:outline-none focus:border-primary"
                    />
                </div>
            )}

            {/* Step 3: Image Search */}
            <div className="bg-card p-6 rounded-xl shadow-lg border border-gray-700">
                <h2 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-2">步驟二：免費圖庫搜尋 (快速跳轉)</h2>
                
                <label className="block text-sm font-medium text-gray-400 mb-1">
                    圖片搜尋關鍵字 (AI 自動建議)
                </label>
                <div className="flex gap-2 mb-6">
                     <input 
                        type="text" 
                        value={imageKeyword}
                        onChange={(e) => setImageKeyword(e.target.value)}
                        placeholder="等待文章生成..."
                        className="flex-grow bg-dark border border-gray-600 rounded-lg p-3 text-white focus:border-primary outline-none"
                     />
                     <button 
                        onClick={() => {
                            navigator.clipboard.writeText(imageKeyword);
                            alert("關鍵字已複製！");
                        }}
                        className="p-3 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 text-white transition-colors" 
                        title="複製關鍵字"
                     >
                         複製
                     </button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <button onClick={() => searchStock('pexels')} className="py-3 px-4 text-white font-bold bg-green-700 rounded-lg shadow hover:bg-green-600 transition">
                        前往 Pexels 搜尋
                    </button>
                    <button onClick={() => searchStock('unsplash')} className="py-3 px-4 text-white font-bold bg-black border border-gray-600 rounded-lg shadow hover:bg-gray-900 transition">
                        前往 Unsplash 搜尋
                    </button>
                    <button onClick={() => searchStock('pixabay')} className="py-3 px-4 text-white font-bold bg-blue-700 rounded-lg shadow hover:bg-blue-600 transition">
                        前往 Pixabay 搜尋
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SeoArticleGenerator;
