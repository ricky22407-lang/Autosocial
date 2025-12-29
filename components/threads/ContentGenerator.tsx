
import React, { useState, useEffect } from 'react';
import { BrandSettings, ThreadsAccount, UserProfile, TrendingTopic } from '../../types';
import { getTrendingTopics, generateThreadsBatch, fetchNewsImageFromUrl } from '../../services/geminiService';
import { publishThreadsPost } from '../../services/threadsService';
import { checkAndUseQuota } from '../../services/authService';
import { getThreadsSystemInstruction } from '../../services/promptTemplates';
import { LoadingOverlay, ImagePreview, generateStockUrl } from './ThreadsCommon';

type ImageSourceType = 'ai' | 'stock' | 'news' | 'upload' | 'none';

interface GeneratedPost {
  id: string;
  topic: string; 
  caption: string;
  imagePrompt: string;
  imageQuery: string;
  imageUrl?: string; 
  newsImageUrl?: string; 
  uploadedImageBase64?: string;
  targetAccountId?: string;
  status: 'idle' | 'publishing' | 'done' | 'failed';
  log?: string;
  imageSourceType: ImageSourceType;
  paidForGeneration?: boolean; 
}

interface Props {
    settings: BrandSettings;
    accounts: ThreadsAccount[];
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const ContentGenerator: React.FC<Props> = ({ settings, accounts, user, onQuotaUpdate }) => {
    // State
    const [genStep, setGenStep] = useState<1 | 2>(1);
    const [manualTopic, setManualTopic] = useState('');
    const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
    const [genCount, setGenCount] = useState<1 | 2 | 3>(1);
    const [preSelectedImageMode, setPreSelectedImageMode] = useState<ImageSourceType>('none');
    const [selectedGenAccountId, setSelectedGenAccountId] = useState<string>(''); 
    const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isRegeneratingImage, setIsRegeneratingImage] = useState<string | null>(null);
    const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
    const [loadingTrends, setLoadingTrends] = useState(false);
    const [trendError, setTrendError] = useState('');

    // Effects
    useEffect(() => {
        if (accounts.length > 0) {
            const currentSelectionExists = accounts.some(a => a.id === selectedGenAccountId);
            if (!selectedGenAccountId || !currentSelectionExists) {
                setSelectedGenAccountId(accounts[0].id);
            }
        }
    }, [accounts]);

    const loadTrends = async (overrideKeyword?: string) => {
        if (!user) return alert("請先登入");
        
        // [BILLING LOGIC] Pay-Per-Click Enforced
        // Always deduct points for trend search action, regardless of cache state.
        const COST = 2; 
        const allowed = await checkAndUseQuota(user.user_id, COST, 'TREND_SEARCH');
        if (!allowed) return; 
        
        onQuotaUpdate();
        setLoadingTrends(true);
        setTrendError('');
        setTrendingTopics([]);

        try {
            const query = overrideKeyword || manualTopic || settings.industry || '台灣熱門時事';
            const trends = await getTrendingTopics(query);
            if (trends.length === 0) setTrendError("目前找不到相關新聞，請嘗試手動輸入其他話題。");
            setTrendingTopics(trends);
        } catch (e: any) {
            console.warn("Trend load error", e);
            setTrendError("無法載入即時趨勢，請檢查網路或稍後再試。");
        } finally {
            setLoadingTrends(false);
        }
    };

    const selectTopic = (title: string) => {
        if (selectedTopics.includes(title)) setSelectedTopics([]);
        else { setSelectedTopics([title]); setManualTopic(''); }
    };

    const handleManualTopicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setManualTopic(e.target.value);
        if (e.target.value) setSelectedTopics([]);
    };

    const proceedToGenerateUI = () => {
        if (selectedTopics.length === 0 && !manualTopic) return alert("請先選擇或輸入一個話題");
        setGenStep(2);
    };

    const calculateCost = (count: number, mode: ImageSourceType) => {
        const baseCost = 2; 
        let extraCost = 0;
        if (mode === 'ai') extraCost = 5; 
        else if (mode === 'news') extraCost = 1;
        else if (mode === 'stock') extraCost = 1;
        return (baseCost + extraCost) * count;
    };

    const handleGenerateBatch = async () => {
        if (!user) return alert("請先登入");
        const topicSource = selectedTopics.length > 0 ? selectedTopics[0] : manualTopic;
        if (!topicSource) return alert("無效話題");

        const targetAccount = accounts.find(a => a.id === selectedGenAccountId);
        if (!targetAccount) return alert("錯誤：請先在上方選單選擇要發文的帳號");

        const totalCost = calculateCost(genCount, preSelectedImageMode);
        if (!confirm(`確定為帳號「${targetAccount.username}」生成 ${genCount} 篇貼文？\n\n消耗：${totalCost} 點配額`)) return;

        const allowed = await checkAndUseQuota(user.user_id, totalCost, 'THREADS_BATCH_GEN', { count: genCount, mode: preSelectedImageMode });
        if (!allowed) return; 
        onQuotaUpdate();

        setIsGenerating(true);
        setGeneratedPosts([]);

        try {
            const instruction = getThreadsSystemInstruction(
                targetAccount.accountType || 'personal',
                targetAccount.styleGuide,
                targetAccount.safetyFilter
            );

            const results = await generateThreadsBatch(topicSource, genCount, settings, [instruction]);
            const sourceTopicData = trendingTopics.find(t => t.title === topicSource);
            const initialNewsImg = sourceTopicData?.imageUrl;
            const newsUrl = sourceTopicData?.url;

            const newPosts: GeneratedPost[] = await Promise.all(results.map(async (r, i) => {
                let finalMode = preSelectedImageMode;
                let finalImageUrl = undefined;
                let errorLog = undefined;
                const uniqueSeed = Date.now().toString() + i;

                if (finalMode === 'ai') {
                    const encoded = encodeURIComponent(r.imagePrompt);
                    finalImageUrl = `https://image.pollinations.ai/prompt/${encoded}?n=${uniqueSeed}&model=flux`;
                } else if (finalMode === 'stock') {
                    finalImageUrl = generateStockUrl(r.imageQuery || r.imagePrompt, uniqueSeed);
                } else if (finalMode === 'news') {
                    if (initialNewsImg) finalImageUrl = initialNewsImg;
                    else if (newsUrl) {
                        const ogImg = await fetchNewsImageFromUrl(newsUrl);
                        if (ogImg) finalImageUrl = ogImg;
                    }
                    if (!finalImageUrl) {
                        try {
                           finalImageUrl = generateStockUrl(`News photo about ${topicSource}, realistic, journalism style`, uniqueSeed);
                        } catch (e) { finalMode = 'none'; errorLog = '無法取得新聞圖片'; }
                    }
                }

                return {
                    id: Date.now() + '_' + i,
                    topic: topicSource,
                    caption: r.caption,
                    imagePrompt: r.imagePrompt,
                    imageQuery: r.imageQuery,
                    newsImageUrl: finalMode === 'news' ? finalImageUrl : undefined,
                    imageUrl: (finalMode === 'ai' || finalMode === 'stock' || finalMode === 'news') ? finalImageUrl : undefined,
                    imageSourceType: finalMode,
                    log: errorLog,
                    status: 'idle',
                    targetAccountId: targetAccount.id
                };
            }));

            setGeneratedPosts(newPosts);
        } catch (e: any) {
            alert(`生成失敗: ${e.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const getPreviewUrl = (post: GeneratedPost) => {
        if (post.imageSourceType === 'upload' && post.uploadedImageBase64) return post.uploadedImageBase64;
        if (post.imageSourceType === 'news' && post.newsImageUrl) return post.newsImageUrl;
        if (post.imageUrl) return post.imageUrl;
        return '';
    };

    const handleImageModeChange = async (post: GeneratedPost, newMode: ImageSourceType) => {
        if (newMode === 'stock' || newMode === 'ai') { 
            if (!user) return alert("請先登入");
            const COST = 2; 
            const allowed = await checkAndUseQuota(user.user_id, COST, 'THREADS_REGEN_IMAGE');
            if (!allowed) return; 
            onQuotaUpdate();

            setIsRegeneratingImage(post.id);
            const newSeed = Date.now().toString() + Math.floor(Math.random() * 9999);
            const visualSubject = post.imageQuery || post.topic; 
            const newUrl = generateStockUrl(visualSubject, newSeed);

            setTimeout(() => {
                setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageSourceType: newMode, imageUrl: newUrl } : p));
                setIsRegeneratingImage(null);
            }, 500); 
        } else {
            setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageSourceType: newMode } : p));
        }
    };

    const handlePublish = async (post: GeneratedPost) => {
        if (!post.targetAccountId) return alert("錯誤：未指定發佈帳號");
        const acc = accounts.find(a => a.id === post.targetAccountId);
        if (!acc) return alert("錯誤：找不到對應的帳號資料，請檢查帳號是否已被移除。");
        if (!post.caption) return alert("內容為空，無法發佈");

        setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'publishing', log: '發佈中...' } : p));
        try {
            const imgUrl = post.imageSourceType === 'none' ? undefined : getPreviewUrl(post);
            const res = await publishThreadsPost(acc, post.caption, imgUrl);
            if (res.success) {
                setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'done', log: '發佈成功！' } : p));
            } else {
                setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'failed', log: `發佈失敗: ${res.error}` } : p));
                alert(`發佈失敗: ${res.error}`);
            }
        } catch (e: any) {
            setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'failed', log: `系統錯誤: ${e.message}` } : p));
        }
    };

    if (loadingTrends) return <LoadingOverlay message="正在搜尋熱門話題" detail="AI 正在分析全網新聞與社群趨勢..." />;
    if (isGenerating) return <LoadingOverlay message="AI 正在量產 Threads 貼文" detail={`正在模擬 ${genCount} 篇不同語氣的真實貼文，並準備圖片中...`} />;

    return (
        <div className="space-y-6">
            {genStep === 1 && (
                <div className="bg-card p-6 rounded-xl border border-gray-700">
                     <h3 className="text-xl font-bold text-white mb-4">步驟 1: 選擇話題</h3>
                     <div className="mb-6 p-4 bg-dark/50 rounded-lg border border-gray-600">
                         <label className="block text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">第一步：設定或搜尋話題</label>
                         <div className="flex flex-col md:flex-row gap-2">
                             <input 
                                 value={manualTopic} 
                                 onChange={handleManualTopicChange} 
                                 className="flex-1 bg-dark border border-gray-600 rounded p-3 text-white placeholder-gray-500 focus:border-primary outline-none transition-colors" 
                                 placeholder="輸入關鍵字 (例如: AI, 美食, 房地產)..." 
                             />
                             <button 
                                 onClick={() => loadTrends()} 
                                 className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 md:py-0 rounded font-bold transition-colors whitespace-nowrap flex items-center justify-center gap-2"
                             >
                                 搜尋趨勢 (2點)
                             </button>
                         </div>
                         <p className="text-[10px] text-gray-500 mt-2">提示：輸入關鍵字後點擊「搜尋」，AI 將為您挖掘該領域的最新熱門新聞。</p>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4 max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
                          <div onClick={() => loadTrends(settings.industry)} className="flex flex-col items-center justify-center bg-gray-800/50 border border-gray-600 hover:border-gray-400 rounded-lg p-6 cursor-pointer min-h-[160px] text-center shadow-lg transition-transform active:scale-95 group">
                              <span className="text-lg font-bold text-gray-300 group-hover:text-white">挖掘綜合熱門靈感</span>
                              <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded mt-2 font-bold tracking-wider">2 點數</span>
                              <p className="text-xs text-gray-500 mt-2">查看 {settings.industry || '台灣'} 目前最紅的話題</p>
                          </div>
                          {trendingTopics.map((t, i) => (
                              <div key={i} onClick={() => selectTopic(t.title)} className={`flex flex-col justify-between p-4 rounded-lg border cursor-pointer min-h-[160px] transition-all relative overflow-hidden ${selectedTopics.includes(t.title) ? 'bg-primary/20 border-primary ring-2 ring-primary' : 'bg-dark border-gray-700 hover:border-gray-500'}`}>
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
                     <div className="mt-6 flex justify-end"><button onClick={proceedToGenerateUI} className="bg-primary hover:bg-blue-600 text-white px-8 py-3 rounded font-bold shadow-lg w-full md:w-auto">下一步</button></div>
                </div>
            )}

            {genStep === 2 && (
                <div className="space-y-6">
                    <div className="bg-card p-6 rounded-xl border border-gray-700">
                         <div className="flex justify-between items-center mb-6">
                             <h3 className="text-xl font-bold text-white">步驟 2: 生成與發佈</h3>
                             <button onClick={() => setGenStep(1)} className="text-sm text-gray-400 hover:text-white border border-gray-600 px-3 py-1 rounded hover:bg-gray-700 transition-colors">↩ 返回選題</button>
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
                                 <div><label className="block text-sm text-gray-400 mb-1">圖片</label><select value={preSelectedImageMode} onChange={(e) => setPreSelectedImageMode(e.target.value as any)} className="w-full bg-dark border border-gray-600 rounded p-2 text-white"><option value="none">無圖片</option><option value="stock">擬真圖庫</option><option value="ai">AI繪圖 (推薦)</option></select></div>
                             </div>
                         </div>
                         <button onClick={handleGenerateBatch} disabled={!selectedGenAccountId} className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg">生成貼文</button>
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
                                            <button onClick={() => handleImageModeChange(post, 'stock')} disabled={isRegeneratingImage === post.id} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded shadow-lg font-bold border border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                                                {isRegeneratingImage === post.id ? (<><div className="loader w-3 h-3 border-2 border-t-white"></div>生成中...</>) : '隨機換圖 (2點)'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 p-6 flex flex-col">
                                        <textarea value={post.caption} onChange={(e) => setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, caption: e.target.value } : p))} className="w-full flex-1 bg-dark border border-gray-600 rounded p-3 text-white mb-4 resize-none" />
                                        <div className="flex justify-between items-center">
                                            <span className={`text-xs font-bold ${post.status === 'done' ? 'text-green-400' : post.status === 'failed' ? 'text-red-400' : 'text-gray-500'}`}>{post.log || (post.status === 'idle' ? '準備就緒' : '')}</span>
                                            <button onClick={() => handlePublish(post)} disabled={post.status === 'publishing' || post.status === 'done'} className={`px-6 py-3 rounded font-bold transition-all ${post.status === 'done' ? 'bg-green-600 text-white cursor-default' : 'bg-white text-black hover:bg-gray-200'}`}>
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
