
import React, { useState, useEffect } from 'react';
import { BrandSettings, Post, TrendingTopic, UserProfile, ViralType, ViralPlatform } from '../types';
import { getTrendingTopics, generatePostDraft, generateImage, applyWatermark, generateViralContent } from '../services/geminiService';
import { publishPostToFacebook } from '../services/facebookService';
import { checkAndUseQuota } from '../services/authService';

interface Props {
  settings: BrandSettings;
  user: UserProfile | null;
  onPostCreated: (post: Post) => void;
  onQuotaUpdate: () => void;
  editPost?: Post | null;
  onCancel?: () => void;
  scheduledPostsCount?: number;
}

const LoadingOverlay: React.FC<{ message: string }> = ({ message }) => (
    <div className="fixed inset-0 bg-dark/95 z-50 flex flex-col items-center justify-center p-8 backdrop-blur-md animate-fade-in text-center border border-gray-800">
        <div className="loader mb-4 scale-150 border-t-primary"></div>
        <h2 className="text-2xl font-bold text-white mb-2">{message}</h2>
        <p className="text-gray-400">AI 正在努力處理中，請稍候...</p>
    </div>
);

export const PostCreator: React.FC<Props> = ({ settings, user, onPostCreated, onQuotaUpdate, editPost, onCancel, scheduledPostsCount = 0 }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<'brand' | 'viral'>('brand');
  const [viralType, setViralType] = useState<ViralType>('regret');
  
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  
  const [draft, setDraft] = useState({ caption: '', firstComment: '', imagePrompt: '' });
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  
  const [scheduleDate, setScheduleDate] = useState('');
  const [syncInstagram, setSyncInstagram] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{success: boolean, msg: string} | null>(null);

  // 排程上限判定
  const role = user?.role || 'user';
  const limit = role === 'pro' ? 5 : (role === 'business' ? 10 : (role === 'admin' ? 100 : 3));
  const isLimitReached = !editPost && scheduledPostsCount >= limit;

  useEffect(() => {
    if (editPost) {
        setStep(2);
        setTopic(editPost.topic);
        setDraft({ caption: editPost.caption, firstComment: editPost.firstComment || '', imagePrompt: editPost.mediaPrompt });
        setMediaUrl(editPost.mediaUrl);
        setScheduleDate(editPost.scheduledDate || '');
        setSyncInstagram(!!editPost.syncInstagram);
    }
  }, [editPost]);

  const loadTrends = async () => {
      if (!user) return alert("請先登入");
      const allowed = await checkAndUseQuota(user.user_id, 1);
      if (!allowed) return alert("配額不足 (需要 1 點)");
      onQuotaUpdate();
      setIsLoadingTrends(true);
      try {
          // FIX: Use 'topic' input if available, otherwise fallback to industry
          const query = topic.trim() || settings.industry || '台灣熱門話題';
          const trends = await getTrendingTopics(query);
          setTrendingTopics(trends);
          
          if(topic.trim()) alert(`已為您搜尋關於「${query}」的熱門話題！`);
      } catch (e) { console.error(e); }
      finally { setIsLoadingTrends(false); }
  };

  const handleNext = async (selectedTopic?: string) => {
    const finalTopic = selectedTopic || topic;
    if (!finalTopic || !user) return;
    
    const allowed = await checkAndUseQuota(user.user_id, 2);
    if (!allowed) return alert("配額不足 (需要 2 點)");
    
    onQuotaUpdate();
    setStep(2);
    setIsGeneratingDraft(true);
    setTopic(finalTopic);
    
    try {
        if (mode === 'brand') {
            const res = await generatePostDraft(finalTopic, settings, { 
                length: '150-300字', 
                ctaList: [], 
                tempHashtags: '', 
                includeEngagement: false 
            }, undefined, user.role);
            setDraft({ 
                caption: res.caption, 
                firstComment: res.ctaText || '', 
                imagePrompt: res.imagePrompt 
            });
        } else {
            const res = await generateViralContent(finalTopic, {
                audience: '社群大眾',
                viralType: viralType,
                platform: 'facebook',
                versionCount: 1
            }, settings);
            setDraft({
                caption: res.versions[0],
                firstComment: '',
                imagePrompt: res.imagePrompt
            });
        }
    } catch (e: any) { 
        alert(`失敗: ${e.message}`); 
        setStep(1); 
    } finally { 
        setIsGeneratingDraft(false); 
    }
  };

  const handleGenMedia = async () => {
    if (!user || isGeneratingMedia) return;
    // Basic validation
    if (!draft.imagePrompt.trim()) return alert("請輸入圖片提示詞 (Prompt)");

    const cost = mediaUrl ? 2 : 5;
    const allowed = await checkAndUseQuota(user.user_id, cost);
    if (!allowed) return alert(`配額不足 (需要 ${cost} 點)`);
    
    onQuotaUpdate();
    setMediaUrl(undefined);
    setIsGeneratingMedia(true);
    try {
      // Use the potentially edited prompt from state
      let url = await generateImage(draft.imagePrompt, user.role, settings.brandStylePrompt);
      if (settings.logoUrl) url = await applyWatermark(url, settings.logoUrl);
      setMediaUrl(url);
    } catch (e: any) { 
        alert(`製圖失敗: ${e.message}`); 
    } finally { 
        setIsGeneratingMedia(false); 
    }
  };

  const handleFinalize = async (schedule: boolean) => {
    if (!user || isPublishing) return;
    if (schedule && !scheduleDate) return alert("請選擇預計發佈時間");
    setIsPublishing(true);
    try {
        const newPost: Post = {
          id: editPost ? editPost.id : Date.now().toString(),
          userId: user.user_id,
          topic,
          caption: draft.caption, 
          firstComment: draft.firstComment,
          mediaPrompt: draft.imagePrompt,
          mediaType: 'image',
          mediaUrl,
          status: schedule ? 'scheduled' : 'published',
          scheduledDate: schedule ? scheduleDate : undefined, 
          syncInstagram,
          createdAt: editPost ? editPost.createdAt : Date.now()
        };

        if (schedule) {
          await onPostCreated(newPost);
          setPublishResult({ success: true, msg: "已存入雲端排程系統" });
        } else {
          const res = await publishPostToFacebook(settings.facebookPageId, settings.facebookToken, draft.caption, mediaUrl, draft.firstComment, syncInstagram);
          if (res.success) {
            newPost.publishedUrl = res.url;
            newPost.status = 'published';
            await onPostCreated(newPost);
            setPublishResult({ success: true, msg: "貼文已成功發佈！" });
          } else {
            newPost.status = 'failed';
            newPost.errorLog = res.error;
            await onPostCreated(newPost);
            setPublishResult({ success: false, msg: `發佈失敗: ${res.error}` });
          }
        }
    } catch (err: any) { 
        setPublishResult({ success: false, msg: `錯誤: ${err.message}` }); 
    } finally { 
        setIsPublishing(false); 
    }
  };

  if (isGeneratingDraft) return <LoadingOverlay message="AI 正在構思文案..." />;
  if (isGeneratingMedia) return <LoadingOverlay message="AI 正在繪製視覺素材..." />;
  if (isPublishing) return <LoadingOverlay message="正在執行同步發佈..." />;

  if (step === 1) return (
      <div className="max-w-4xl mx-auto space-y-12 animate-fade-in pt-4">
          <div className="text-center space-y-3">
              <h2 className="text-4xl font-black text-white tracking-tight">你想聊什麼話題？</h2>
              <p className="text-gray-500 font-medium">輸入核心主題，讓 AI 為您打造吸睛內容。</p>
          </div>
          
          <div className="bg-card p-10 rounded-3xl border border-gray-800 shadow-2xl space-y-8">
              <div className="flex p-1.5 bg-dark/80 rounded-2xl border border-gray-800">
                  <button 
                    onClick={() => setMode('brand')}
                    className={`flex-1 py-4 rounded-xl font-bold tracking-wide transition-all ${mode === 'brand' ? 'bg-primary text-white shadow-xl' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    品牌模式
                  </button>
                  <button 
                    onClick={() => setMode('viral')}
                    className={`flex-1 py-4 rounded-xl font-bold tracking-wide transition-all ${mode === 'viral' ? 'bg-orange-600 text-white shadow-xl' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    爆文模式 (流量密碼)
                  </button>
              </div>

              {mode === 'viral' && (
                  <div className="flex flex-wrap gap-2 justify-center">
                       {[
                           { id: 'regret', label: '😱 後悔太晚知道' },
                           { id: 'expose', label: '🤫 內行人才懂' },
                           { id: 'counter', label: '⚠️ 千萬不要系列' },
                           { id: 'identity', label: '🎯 特定族群必看' },
                           { id: 'result', label: '✨ 效果太誇張' }
                       ].map(type => (
                           <button
                               key={type.id}
                               onClick={() => setViralType(type.id as ViralType)}
                               className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${viralType === type.id ? 'bg-orange-600/20 text-orange-400 border-orange-500' : 'bg-dark border-gray-700 text-gray-500 hover:border-gray-500'}`}
                           >
                               {type.label}
                           </button>
                       ))}
                  </div>
              )}

              <div className="flex gap-3">
                  <input 
                    value={topic} 
                    onChange={e => setTopic(e.target.value)} 
                    className="flex-1 bg-dark/50 border border-gray-700 rounded-2xl p-5 text-white outline-none focus:border-primary transition-all text-xl font-medium placeholder-gray-600" 
                    placeholder="輸入主題 (例如：夏季保養、今日新聞...)" 
                  />
                  <button 
                    onClick={loadTrends} 
                    className="bg-gray-800 hover:bg-gray-700 px-8 rounded-2xl text-white font-bold transition-all flex flex-col items-center justify-center gap-1 border border-gray-700"
                  >
                    <span className="text-sm">挖掘靈感</span>
                    <span className="text-[9px] bg-blue-500/20 text-blue-400 px-2 rounded-full border border-blue-500/30 font-black">1 點</span>
                  </button>
              </div>

              {isLoadingTrends ? (
                  <div className="flex justify-center py-6"><div className="loader border-t-primary"></div></div>
              ) : trendingTopics.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-72 overflow-y-auto p-4 border border-gray-800 rounded-2xl bg-dark/20 custom-scrollbar">
                      {trendingTopics.map((t, i) => (
                          <div 
                            key={i} 
                            onClick={() => handleNext(t.title)} 
                            className="bg-dark/40 border border-gray-800 p-4 rounded-xl cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group"
                          >
                              <h4 className="font-bold text-blue-400 text-sm mb-1 line-clamp-1 group-hover:text-white transition-colors">{t.title}</h4>
                              <p className="text-[11px] text-gray-500 line-clamp-1">{t.description}</p>
                          </div>
                      ))}
                  </div>
              )}

              <button 
                onClick={() => handleNext()} 
                disabled={!topic} 
                className={`w-full py-6 rounded-2xl font-black text-white shadow-2xl hover:opacity-90 transition-all disabled:opacity-30 text-xl tracking-widest uppercase ${mode === 'viral' ? 'bg-orange-600' : 'bg-primary'}`}
              >
                生成內容 <span className="text-sm font-normal opacity-50 ml-2">需消耗 2 點</span>
              </button>
          </div>
      </div>
  );

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 animate-fade-in pt-4">
        <div className="space-y-8">
            <div className="bg-card p-8 rounded-3xl border border-gray-800 shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-gray-300 tracking-tighter uppercase text-sm">內容編輯 ({mode === 'viral' ? '爆文模式' : '品牌模式'})</h3>
                    <button onClick={() => setStep(1)} className="text-[11px] font-bold text-red-400/80 hover:text-red-400 transition-colors uppercase tracking-widest underline underline-offset-4">返回更換主題</button>
                </div>
                
                {/* Caption Editor */}
                <label className="text-[10px] text-gray-500 font-bold mb-2 block uppercase tracking-wider">貼文文案</label>
                <textarea 
                    value={draft.caption} 
                    onChange={e => setDraft({...draft, caption: e.target.value})} 
                    className="w-full h-[300px] bg-dark/50 border border-gray-800 rounded-2xl p-6 text-white mb-6 resize-none focus:border-primary outline-none custom-scrollbar leading-relaxed text-[15px]" 
                />

                {/* Image Prompt Editor */}
                <div className="mb-6">
                    <div className="flex justify-between items-end mb-2">
                        <label className="text-[10px] text-indigo-400 font-bold block uppercase tracking-wider">AI 繪圖指令 (PROMPT)</label>
                        <span className="text-[9px] text-gray-500">可修改 • 支援中文輸入</span>
                    </div>
                    <textarea 
                        value={draft.imagePrompt} 
                        onChange={e => setDraft({...draft, imagePrompt: e.target.value})} 
                        className="w-full h-24 bg-dark/30 border border-indigo-900/50 rounded-xl p-4 text-gray-300 text-xs focus:border-indigo-500 outline-none resize-none leading-relaxed" 
                        placeholder="請輸入想要生成的圖片描述 (例如: 溫馨的家庭聚餐，桌上有火鍋...)"
                    />
                </div>
                
                <div className="space-y-4">
                    <button 
                        onClick={handleGenMedia} 
                        className={`w-full py-5 rounded-2xl font-black text-white shadow-xl transition-all flex items-center justify-center gap-3 tracking-widest uppercase ${mediaUrl ? 'bg-indigo-900/50 border border-indigo-500/50' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                    >
                        {mediaUrl ? (
                            <>依指令重新繪製 <span className="text-[10px] font-black bg-white/10 px-2 py-0.5 rounded-full">2 點</span></>
                        ) : (
                            <>開始生成圖片 <span className="text-[10px] font-black bg-white/10 px-2 py-0.5 rounded-full">5 點</span></>
                        )}
                    </button>
                </div>
            </div>
        </div>
        
        <div className="space-y-8">
            <div className="bg-card p-8 rounded-3xl border border-gray-800 shadow-2xl flex flex-col min-h-[600px]">
                <h3 className="font-black text-gray-300 tracking-tighter uppercase text-sm mb-6">發佈預覽</h3>
                <div className="bg-white rounded-2xl overflow-hidden flex-1 border border-gray-200 shadow-inner flex flex-col">
                    <div className="p-4 border-b flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-300 text-xs font-bold">P</div>
                        <div className="space-y-1.5">
                            <div className="h-2 w-28 bg-gray-200 rounded"></div>
                            <div className="h-1.5 w-16 bg-gray-100 rounded"></div>
                        </div>
                    </div>
                    <div className="p-5 overflow-y-auto max-h-[500px] custom-scrollbar flex-1">
                        <p className="text-black text-[14px] whitespace-pre-wrap mb-5 leading-relaxed font-sans">{draft.caption}</p>
                        {mediaUrl && <img src={mediaUrl} className="w-full h-auto rounded-xl shadow-lg border border-gray-100 animate-fade-in" />}
                        {!mediaUrl && (
                            <div className="w-full aspect-square bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 gap-2">
                                <span className="text-3xl">🎨</span>
                                <span className="text-xs font-bold uppercase tracking-widest">請先點擊左側生成圖片</span>
                                <span className="text-[10px] text-gray-400 text-center max-w-[200px]">AI 將根據您的 Prompt 繪製專屬素材</span>
                            </div>
                        )}
                    </div>
                </div>

                {publishResult ? (
                    <div className={`mt-8 p-5 rounded-2xl text-center font-bold border transition-all ${publishResult.success ? 'bg-green-900/40 text-green-200 border-green-700/50' : 'bg-red-900/40 text-red-200 border-red-700/50'}`}>
                        <div className="text-[15px] mb-1">{publishResult.msg}</div>
                        <button onClick={() => setPublishResult(null)} className="text-[10px] uppercase font-black tracking-widest text-white/50 hover:text-white transition-colors underline underline-offset-4">繼續編輯內容</button>
                    </div>
                ) : (
                    <div className="mt-8 space-y-6">
                        <div className="bg-dark/60 p-5 rounded-2xl border border-gray-800 flex justify-between items-center">
                            <div className="flex-1">
                                <label className="block text-[9px] text-gray-600 font-black uppercase tracking-[0.2em] mb-2">預計發佈時間</label>
                                <input 
                                    type="datetime-local" 
                                    value={scheduleDate} 
                                    onChange={e => setScheduleDate(e.target.value)} 
                                    className="w-full bg-transparent text-white outline-none text-[15px] font-bold" 
                                />
                            </div>
                            <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${isLimitReached ? 'bg-red-900/20 text-red-400 border-red-900/50' : 'bg-primary/10 text-primary border-primary/20'}`}>
                                雲端空間 {scheduledPostsCount}/{limit}
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => handleFinalize(true)} 
                                disabled={isLimitReached} 
                                className={`flex-1 py-5 rounded-2xl font-black transition-all border-2 uppercase tracking-widest text-sm ${isLimitReached ? 'border-gray-800 text-gray-700 cursor-not-allowed' : 'border-primary text-primary hover:bg-primary/10'}`}
                            >
                                {isLimitReached ? '空間已滿' : '存入雲端排程'}
                            </button>
                            <button 
                                onClick={() => handleFinalize(false)} 
                                className="flex-1 bg-primary text-white py-5 rounded-2xl font-black shadow-2xl hover:bg-blue-600 transition-all transform active:scale-95 text-sm uppercase tracking-widest"
                            >
                                立即發佈
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
