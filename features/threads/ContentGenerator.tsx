
import React from 'react';
import { BrandSettings, ThreadsAccount } from '../../types';
import { useThreadsGenerator } from './hooks/useThreadsGenerator';
import { LoadingOverlay, ImagePreview } from './components/Common';

interface Props {
    settings: BrandSettings;
    accounts: ThreadsAccount[];
    onQuotaUpdate: () => void;
    initialTopic?: string;
}

const ContentGenerator: React.FC<Props> = ({ settings, accounts, onQuotaUpdate, initialTopic }) => {
    const {
        step, setStep,
        manualTopic, setManualTopic,
        selectedTopics, toggleTopic,
        genCount, setGenCount,
        preSelectedImageMode, setPreSelectedImageMode,
        selectedGenAccountId, setSelectedGenAccountId,
        trendingTopics, loadingTrends, loadTrends,
        isGenerating, generateBatch,
        generatedPosts, updatePostCaption,
        isRegeneratingImage, regenerateImage,
        publishPost
    } = useThreadsGenerator(settings, accounts, onQuotaUpdate, initialTopic);

    if (loadingTrends) return <LoadingOverlay message="正在搜尋熱門話題" detail="AI 正在分析全網新聞與社群趨勢..." />;
    if (isGenerating) return <LoadingOverlay message="AI 正在量產 Threads 貼文" detail={`正在模擬 ${genCount} 篇不同語氣的真實貼文，並準備圖片中...`} />;

    const getPreviewUrl = (post: any) => {
        if (post.imageSourceType === 'upload' && post.uploadedImageBase64) return post.uploadedImageBase64;
        if (post.imageSourceType === 'news' && post.newsImageUrl) return post.newsImageUrl;
        if (post.imageUrl) return post.imageUrl;
        return '';
    };

    return (
        <div className="space-y-6">
            {step === 1 && (
                <div className="bg-card p-6 rounded-xl border border-gray-700">
                     <h3 className="text-xl font-bold text-white mb-4">步驟 1: 選擇話題</h3>
                     <div className="mb-6 p-4 bg-dark/50 rounded-lg border border-gray-600">
                         <label className="block text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">第一步：設定或搜尋話題</label>
                         <div className="flex flex-col md:flex-row gap-2">
                             <input 
                                 value={manualTopic} 
                                 onChange={e => { setManualTopic(e.target.value); if(e.target.value) toggleTopic(''); }} 
                                 className="flex-1 bg-dark border border-gray-600 rounded p-3 text-white placeholder-gray-500 focus:border-primary outline-none transition-colors" 
                                 placeholder="輸入關鍵字 (例如: AI, 美食, 房地產)..." 
                             />
                             <button 
                                 onClick={() => loadTrends()} 
                                 className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 md:py-0 rounded font-bold transition-colors whitespace-nowrap flex items-center justify-center gap-2"
                             >
                                 搜尋趨勢 (3點)
                             </button>
                         </div>
                         <p className="text-[10px] text-gray-500 mt-2">提示：輸入關鍵字後點擊「搜尋」，AI 將為您挖掘該領域的最新熱門新聞。</p>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4 max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
                          <div onClick={() => loadTrends(settings.industry)} className="flex flex-col items-center justify-center bg-gray-800/50 border border-gray-600 hover:border-gray-400 rounded-lg p-6 cursor-pointer min-h-[160px] text-center shadow-lg transition-transform active:scale-95 group">
                              <span className="text-lg font-bold text-gray-300 group-hover:text-white">挖掘綜合熱門靈感</span>
                              <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded mt-2 font-bold tracking-wider">3 點數</span>
                              <p className="text-xs text-gray-500 mt-2">查看 {settings.industry || '台灣'} 目前最紅的話題</p>
                          </div>
                          {trendingTopics.map((t, i) => (
                              <div key={i} onClick={() => toggleTopic(t.title)} className={`flex flex-col justify-between p-4 rounded-lg border cursor-pointer min-h-[160px] transition-all relative overflow-hidden ${selectedTopics.includes(t.title) ? 'bg-primary/20 border-primary ring-2 ring-primary' : 'bg-dark border-gray-700 hover:border-gray-500'}`}>
                                  {t.imageUrl && <div className="absolute inset-0 opacity-10 bg-cover bg-center z-0" style={{backgroundImage: `url(${t.imageUrl})`}}></div>}
                                  <div className="relative z-10">
                                      <h4 className="font-bold text-white text-base line-clamp-2 mb-2 leading-tight">{t.title}</h4>
                                      <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">{t.description || "點擊查看詳情，AI 將自動延伸話題..."}</p>
                                  </div>
                                  <div className="relative z-10 mt-2 text-[10px] text-gray-500 flex justify-between items-center">
                                      <span>來源: {t.url ? new URL(t.url).hostname.replace('www.', '') : 'News'}</span>
                                      {selectedTopics.includes(t.title) && <span className="text-primary font-bold">✓ 已選擇</span>}
                                  </div>
                              </div>
                          ))}
                     </div>
                     <div className="mt-6 flex justify-end">
                         <button 
                            onClick={() => (selectedTopics.length > 0 || manualTopic) ? setStep(2) : alert("請先選擇話題")} 
                            className="bg-primary hover:bg-blue-600 text-white px-8 py-3 rounded font-bold shadow-lg w-full md:w-auto"
                         >
                             下一步
                         </button>
                     </div>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-6">
                    <div className="bg-card p-6 rounded-xl border border-gray-700">
                         <div className="flex justify-between items-center mb-6">
                             <h3 className="text-xl font-bold text-white">步驟 2: 生成與發佈</h3>
                             <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-white border border-gray-600 px-3 py-1 rounded hover:bg-gray-700 transition-colors">↩ 返回選題</button>
                         </div>
                         <div className="mb-6 bg-blue-900/20 p-4 rounded border border-blue-800">
                             <label className="block text-sm text-blue-300 font-bold mb-2">1. 選擇發文帳號 (決定語氣與人設) *</label>
                             <select value={selectedGenAccountId} onChange={(e) => setSelectedGenAccountId(e.target.value)} className="w-full bg-dark border border-blue-500 rounded p-3 text-white">
                                 {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.username} ({acc.accountType === 'brand' ? '品牌' : '個人'})</option>)}
                              </select>
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                             <div className="bg-dark/50 p-4 rounded border border-gray-600"><label className="block text-sm text-gray-400 mb-2">當前話題</label><div className="font-bold text-xl text-white">{selectedTopics[0] || manualTopic}</div></div>
                             <div className="space-y-4">
                                 <div><label className="block text-sm text-gray-400 mb-1">數量</label><div className="flex gap-2">{[1,2,3].map(n => <button key={n} onClick={() => setGenCount(n as any)} className={`flex-1 py-2 rounded border ${genCount === n ? 'bg-white text-black' : 'border-gray-600'}`}>{n}</button>)}</div></div>
                                 <div><label className="block text-sm text-gray-400 mb-1">圖片</label><select value={preSelectedImageMode} onChange={(e) => setPreSelectedImageMode(e.target.value as any)} className="w-full bg-dark border border-gray-600 rounded p-2 text-white"><option value="none">無圖片 (3點)</option><option value="stock">擬真圖庫 (6點)</option><option value="ai">AI繪圖 (8點)</option></select></div>
                             </div>
                         </div>
                         <button onClick={generateBatch} disabled={!selectedGenAccountId} className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg">生成貼文</button>
                    </div>

                    {generatedPosts.length > 0 && (
                        <div className="space-y-8">
                            {generatedPosts.map((post) => (
                                <div key={post.id} className="bg-card rounded-xl border border-gray-700 overflow-hidden flex flex-col md:flex-row">
                                    <div className="w-full md:w-1/3 bg-black flex items-center justify-center relative min-h-[300px]">
                                        {getPreviewUrl(post) ? (
                                            <ImagePreview src={getPreviewUrl(post)} alt="Generated Content" />
                                        ) : <span className="text-gray-500">無圖片</span>}
                                        <div className="absolute bottom-2 left-2 flex gap-2">
                                            <button onClick={() => regenerateImage(post, 'stock')} disabled={isRegeneratingImage === post.id} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded shadow-lg font-bold border border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                                                {isRegeneratingImage === post.id ? (<><div className="loader w-3 h-3 border-2 border-t-white"></div>生成中...</>) : '隨機換圖 (3點)'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 p-6 flex flex-col">
                                        <textarea value={post.caption} onChange={(e) => updatePostCaption(post.id, e.target.value)} className="w-full flex-1 bg-dark border border-gray-600 rounded p-3 text-white mb-4 resize-none" />
                                        <div className="flex justify-between items-center">
                                            <span className={`text-xs font-bold ${post.status === 'done' ? 'text-green-400' : post.status === 'failed' ? 'text-red-400' : 'text-gray-500'}`}>{post.log || (post.status === 'idle' ? '準備就緒' : '')}</span>
                                            <button onClick={() => publishPost(post)} disabled={post.status === 'publishing' || post.status === 'done'} className={`px-6 py-3 rounded font-bold transition-all ${post.status === 'done' ? 'bg-green-600 text-white cursor-default' : 'bg-white text-black hover:bg-gray-200'}`}>
                                                {post.status === 'publishing' ? '發佈中...' : post.status === 'done' ? '已發佈' : '立即發佈'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ContentGenerator;
