import React, { useState, useEffect } from 'react';
import { BrandSettings, Post, TrendingTopic, UserProfile } from '../types';
import { getTrendingTopics, generatePostDraft, generateImage, applyWatermark } from '../services/geminiService';
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
    <div className="fixed inset-0 bg-dark/90 z-50 flex flex-col items-center justify-center p-8 backdrop-blur-md animate-fade-in">
        <div className="loader mb-4 scale-150"></div>
        <h2 className="text-xl font-bold text-white">{message}</h2>
        <p className="text-gray-400 mt-2">AI 正在處理中...</p>
    </div>
);

const DRAFT_KEY = 'autosocial_post_draft';

export const PostCreator: React.FC<Props> = ({ settings, user, onPostCreated, onQuotaUpdate, editPost, onCancel, scheduledPostsCount = 0 }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [topic, setTopic] = useState('');
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
      if (!allowed) return alert("配額不足 (需要 1 點)");
      
      onQuotaUpdate();
      setIsLoadingTrends(true);
      try {
          const industry = settings.industry || '熱門話題';
          const trends = await getTrendingTopics(industry);
          setTrendingTopics(trends);
      } catch (e) { console.error(e); }
      finally { setIsLoadingTrends(false); }
  };

  // 2. 生成文案 - 扣 2 點
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
    } catch (e: any) { 
        alert(`失敗: ${e.message}`); 
        setStep(1); 
    } finally { 
        setIsGeneratingDraft(false); 
    }
  };

  // 3. 生成圖片 - 扣 5 點
  const handleGenMedia = async () => {
    if (!user || isGeneratingMedia) return;
    const allowed = await checkAndUseQuota(user.user_id, 5);
    if (!allowed) return alert("配額不足 (需要 5 點)");
    
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
    if (schedule && !scheduleDate) return alert("請選擇日期時間");
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

  if (isGeneratingDraft) return <LoadingOverlay message="AI 正在構思高轉換文案..." />;
  if (isGeneratingMedia) return <LoadingOverlay message="AI 正在為您繪製專屬圖片..." />;
  if (isPublishing) return <LoadingOverlay message="正在同步雲端發佈系統..." />;

  if (step === 1) return (
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pt-6">
          <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-white">你想聊什麼話題？</h2>
              <p className="text-gray-400">輸入核心主題，或讓 AI 幫你挖掘目前最夯的話題。</p>
          </div>
          
          <div className="bg-card p-6 rounded-2xl border border-gray-700 shadow-xl space-y-6">
              <div className="flex gap-2">
                  <input 
                    value={topic} 
                    onChange={e => setTopic(e.target.value)} 
                    className="flex-1 bg-dark border border-gray-600 rounded-xl p-4 text-white outline-none focus:border-primary" 
                    placeholder="例如：夏季保養心法、今日新聞重點..." 
                  />
                  <button 
                    onClick={loadTrends} 
                    className="bg-gray-700 hover:bg-gray-600 px-6 rounded-xl text-white font-bold transition-all flex items-center gap-2"
                  >
                    🔍 挖掘靈感 <span className="text-[10px] bg-blue-600 px-1 rounded">1點</span>
                  </button>
              </div>

              {isLoadingTrends ? (
                  <div className="flex justify-center py-6"><div className="loader"></div></div>
              ) : trendingTopics.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto p-2 border border-gray-800 rounded-xl bg-dark/30">
                      {trendingTopics.map((t, i) => (
                          <div 
                            key={i} 
                            onClick={() => handleNext(t.title)} 
                            className="bg-dark/50 border border-gray-700 p-3 rounded-lg cursor-pointer hover:border-primary hover:bg-primary/10 transition-all"
                          >
                              <h4 className="font-bold text-blue-400 text-sm mb-1 line-clamp-1">{t.title}</h4>
                              <p className="text-xs text-gray-500 line-clamp-1">{t.description}</p>
                          </div>
                      ))}
                  </div>
              )}

              <button 
                onClick={() => handleNext()} 
                disabled={!topic} 
                className="w-full py-4 rounded-xl font-bold text-white bg-primary shadow-lg hover:opacity-90 transition-all disabled:opacity-50"
              >
                生成品牌文案 <span className="text-xs font-normal">(2點)</span>
              </button>
          </div>
      </div>
  );

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
        <div className="space-y-6">
            <div className="bg-card p-6 rounded-2xl border border-gray-700 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-300">✍️ 文案編輯</h3>
                    <button onClick={() => setStep(1)} className="text-xs text-red-400 hover:underline">返回重選主題</button>
                </div>
                <textarea 
                    value={draft.caption} 
                    onChange={e => setDraft({...draft, caption: e.target.value})} 
                    className="w-full h-80 bg-dark border border-gray-600 rounded-xl p-4 text-white mb-6 resize-none focus:border-primary outline-none" 
                />
                <button 
                    onClick={handleGenMedia} 
                    className="w-full py-4 rounded-xl font-bold bg-indigo-600 text-white shadow-lg hover:bg-indigo-500 transition-all"
                >
                    🖼️ 重新生成圖片素材 <span className="text-xs font-normal">(5點)</span>
                </button>
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
                    <div className="p-4 overflow-y-auto max-h-[400px]">
                        <p className="text-black text-sm whitespace-pre-wrap mb-4">{draft.caption}</p>
                        {mediaUrl && <img src={mediaUrl} className="w-full h-auto rounded-lg shadow-md" />}
                    </div>
                </div>

                {publishResult ? (
                    <div className={`mt-6 p-4 rounded-xl text-center font-bold ${publishResult.success ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'}`}>
                        {publishResult.msg}
                        <button onClick={() => setPublishResult(null)} className="block w-full mt-2 text-xs underline">繼續編輯</button>
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
                                className="flex-1 bg-primary text-white py-4 rounded-xl font-bold shadow-xl hover:bg-blue-600 transition-all transform active:scale-95"
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
