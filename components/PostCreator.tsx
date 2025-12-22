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

  // 1. 挖掘靈感 - 扣 1 點
  const loadTrends = async () => {
      if (!user) return;
      const allowed = await checkAndUseQuota(user.user_id, 1);
      if (!allowed) return alert("配額不足 (挖掘靈感需要 1 點)");
      onQuotaUpdate();
      setIsLoadingTrends(true);
      try {
          const industry = settings.industry || '台灣熱門話題';
          const trends = await getTrendingTopics(industry);
          setTrendingTopics(trends);
      } catch (e) { console.error(e); }
      finally { setIsLoadingTrends(false); }
  };

  // 2. 生成內容 (區分品牌 vs 爆文) - 扣 2 點
  const handleNext = async (selectedTopic?: string) => {
    const finalTopic = selectedTopic || topic;
    if (!finalTopic || !user) return;
    
    const allowed = await checkAndUseQuota(user.user_id, 2);
    if (!allowed) return alert("配額不足 (生成文案需要 2 點)");
    
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
            // 爆文模式 - 小紅書/營銷號風格
            const res = await generateViralContent(finalTopic, {
                audience: '社群大眾',
                viralType: 'regret', // 預設使用後悔型 hook
                platform: 'facebook',
                versionCount: 1
            }, settings);
            setDraft({
                caption: res.versions[0],
                firstComment: '',
                imagePrompt: res.imagePrompt
            });
        }
        // 注意：這裡移除了自動生成圖片的調用，必須由 User 手動點擊。
    } catch (e: any) { 
        alert(`失敗: ${e.message}`); 
        setStep(1); 
    } finally { 
        setIsGeneratingDraft(false); 
    }
  };

  // 3. 生成圖片 - 首產 5 點 / 重刷 2 點
  const handleGenMedia = async () => {
    if (!user || isGeneratingMedia) return;
    
    // 判定是否為重刷 (已有圖片網址代表是重刷)
    const cost = mediaUrl ? 2 : 5;
    const allowed = await checkAndUseQuota(user.user_id, cost);
    if (!allowed) return alert(`配額不足 (生成圖片需要 ${cost} 點)`);
    
    onQuotaUpdate();
    setMediaUrl(undefined);
    setIsGeneratingMedia(true);
    try {
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
          setPublishResult({ success: true, msg: "✅ 已存入雲端排程系統" });
        } else {
          const res = await publishPostToFacebook(settings.facebookPageId, settings.facebookToken, draft.caption, mediaUrl, draft.firstComment, syncInstagram);
          if (res.success) {
            newPost.publishedUrl = res.url;
            newPost.status = 'published';
            await onPostCreated(newPost);
            setPublishResult({ success: true, msg: "🚀 貼文已成功發佈！" });
          } else {
            newPost.status = 'failed';
            newPost.errorLog = res.error;
            await onPostCreated(newPost);
            setPublishResult({ success: false, msg: `❌ 發佈失敗: ${res.error}` });
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
  if (isPublishing) return <LoadingOverlay message="正在與 Facebook 同步..." />;

  // 階段 1：話題與模式選擇
  if (step === 1) return (
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pt-6">
          <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-white">你想聊什麼話題？</h2>
              <p className="text-gray-400">輸入核心主題，AI 會根據您的品牌設定生成內容。</p>
          </div>
          
          <div className="bg-card p-6 rounded-2xl border border-gray-700 shadow-xl space-y-6">
              {/* 模式切換 */}
              <div className="flex p-1 bg-dark rounded-xl border border-gray-700">
                  <button 
                    onClick={() => setMode('brand')}
                    className={`flex-1 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${mode === 'brand' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    🏢 品牌發文 <span className="text-[10px] font-normal opacity-60">(專業感)</span>
                  </button>
                  <button 
                    onClick={() => setMode('viral')}
                    className={`flex-1 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${mode === 'viral' ? 'bg-orange-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    🔥 爆文模式 <span className="text-[10px] font-normal opacity-60">(營銷號/小紅書)</span>
                  </button>
              </div>

              <div className="flex gap-2">
                  <input 
                    value={topic} 
                    onChange={e => setTopic(e.target.value)} 
                    className="flex-1 bg-dark border border-gray-600 rounded-xl p-4 text-white outline-none focus:border-primary text-lg" 
                    placeholder="例如：夏季保養心法、今日新聞重點..." 
                  />
                  <button 
                    onClick={loadTrends} 
                    className="bg-gray-700 hover:bg-gray-600 px-6 rounded-xl text-white font-bold transition-all flex items-center gap-2"
                  >
                    🔍 靈感 <span className="text-[10px] bg-blue-600 px-2 py-0.5 rounded shadow-sm">1點</span>
                  </button>
              </div>

              {isLoadingTrends ? (
                  <div className="flex justify-center py-6"><div className="loader border-t-primary"></div></div>
              ) : trendingTopics.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto p-2 border border-gray-800 rounded-xl bg-dark/30 custom-scrollbar">
                      {trendingTopics.map((t, i) => (
                          <div 
                            key={i} 
                            onClick={() => handleNext(t.title)} 
                            className="bg-dark/50 border border-gray-700 p-3 rounded-lg cursor-pointer hover:border-primary hover:bg-primary/10 transition-all group"
                          >
                              <h4 className="font-bold text-blue-400 text-sm mb-1 line-clamp-1 group-hover:text-white">{t.title}</h4>
                              <p className="text-xs text-gray-500 line-clamp-1">{t.description}</p>
                          </div>
                      ))}
                  </div>
              )}

              <button 
                onClick={() => handleNext()} 
                disabled={!topic} 
                className={`w-full py-4 rounded-xl font-bold text-white shadow-lg hover:opacity-90 transition-all disabled:opacity-50 text-xl ${mode === 'viral' ? 'bg-orange-600' : 'bg-primary'}`}
              >
                生成品牌文案 <span className="text-sm font-normal opacity-80">(2點)</span>
              </button>
          </div>
      </div>
  );

  // 階段 2：內容微調與發佈
  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
        <div className="space-y-6">
            <div className="bg-card p-6 rounded-2xl border border-gray-700 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-300">✍️ 文案編輯 ({mode === 'viral' ? '爆文模式' : '品牌模式'})</h3>
                    <button onClick={() => setStep(1)} className="text-xs text-red-400 hover:underline">返回更換主題/模式</button>
                </div>
                <textarea 
                    value={draft.caption} 
                    onChange={e => setDraft({...draft, caption: e.target.value})} 
                    className="w-full h-80 bg-dark border border-gray-600 rounded-xl p-4 text-white mb-6 resize-none focus:border-primary outline-none custom-scrollbar leading-relaxed" 
                />
                
                <div className="space-y-4">
                    <button 
                        onClick={handleGenMedia} 
                        className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 ${mediaUrl ? 'bg-indigo-900 border border-indigo-500' : 'bg-indigo-600'}`}
                    >
                        {mediaUrl ? (
                            <>🔄 重新繪製圖片素材 <span className="text-xs font-normal opacity-80">(半價 2點)</span></>
                        ) : (
                            <>🖼️ 生成 AI 圖片素材 <span className="text-xs font-normal opacity-80">(5點)</span></>
                        )}
                    </button>
                </div>
            </div>
        </div>
        
        <div className="space-y-6">
            <div className="bg-card p-6 rounded-2xl border border-gray-700 shadow-xl flex flex-col min-h-[500px]">
                <h3 className="font-bold text-gray-300 mb-4">📱 預覽</h3>
                <div className="bg-white rounded-xl overflow-hidden flex-1 border border-gray-200 shadow-inner">
                    <div className="p-4 border-b flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-200"></div>
                        <div className="h-2 w-24 bg-gray-200 rounded"></div>
                    </div>
                    <div className="p-4 overflow-y-auto max-h-[400px] custom-scrollbar">
                        <p className="text-black text-sm whitespace-pre-wrap mb-4">{draft.caption}</p>
                        {mediaUrl && <img src={mediaUrl} className="w-full h-auto rounded-lg shadow-md border border-gray-100" />}
                        {!mediaUrl && (
                            <div className="w-full aspect-square bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400">
                                <span className="text-4xl mb-2">🖼️</span>
                                <span className="text-xs">尚未生成圖片</span>
                            </div>
                        )}
                    </div>
                </div>

                {publishResult ? (
                    <div className={`mt-6 p-4 rounded-xl text-center font-bold border ${publishResult.success ? 'bg-green-900/50 text-green-200 border-green-700' : 'bg-red-900/50 text-red-200 border-red-700'}`}>
                        {publishResult.msg}
                        <button onClick={() => setPublishResult(null)} className="block w-full mt-2 text-xs underline">繼續編輯貼文</button>
                    </div>
                ) : (
                    <div className="mt-6 space-y-4">
                        <div className="bg-dark p-4 rounded-xl border border-gray-600 flex justify-between items-center">
                            <div className="flex-1">
                                <label className="block text-[10px] text-gray-500 font-bold uppercase mb-1">排程發佈時間</label>
                                <input 
                                    type="datetime-local" 
                                    value={scheduleDate} 
                                    onChange={e => setScheduleDate(e.target.value)} 
                                    className="w-full bg-transparent text-white outline-none text-sm font-bold" 
                                />
                            </div>
                            <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${isLimitReached ? 'bg-red-900 text-red-200' : 'bg-blue-900 text-blue-200'}`}>
                                雲端空間: {scheduledPostsCount}/{limit}
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => handleFinalize(true)} 
                                disabled={isLimitReached} 
                                className={`flex-1 py-4 rounded-xl font-bold transition-all border-2 ${isLimitReached ? 'border-gray-700 text-gray-600 cursor-not-allowed' : 'border-primary text-primary hover:bg-primary/10'}`}
                            >
                                {isLimitReached ? '排程已滿' : '存入雲端排程'}
                            </button>
                            <button 
                                onClick={() => handleFinalize(false)} 
                                className="flex-1 bg-primary text-white py-4 rounded-xl font-bold shadow-xl hover:bg-blue-600 transition-all transform active:scale-95 text-lg"
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
