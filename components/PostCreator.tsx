
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
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-8 backdrop-blur-xl animate-fade-in text-center">
        <div className="loader mb-6 scale-150 border-t-primary"></div>
        <h2 className="text-2xl font-black text-white mb-2 tracking-tight">{message}</h2>
        <p className="text-gray-400 font-mono text-xs uppercase tracking-widest">AI Processing...</p>
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

  const loadTrends = async () => {
      if (!user) return alert("請先登入");
      const allowed = await checkAndUseQuota(user.user_id, 1);
      if (!allowed) return alert("配額不足 (需要 1 點)");
      onQuotaUpdate();
      setIsLoadingTrends(true);
      try {
          const query = topic.trim() || settings.industry || '台灣熱門話題';
          const trends = await getTrendingTopics(query);
          setTrendingTopics(trends);
          
          if(topic.trim()) alert(`已為您搜尋關於「${query}」的熱門話題！`);
      } catch (e) { console.error(e); }
      finally { setIsLoadingTrends(false); }
  };

  const handleNext = async () => {
    if (!topic || !user) return;
    
    const allowed = await checkAndUseQuota(user.user_id, 2);
    if (!allowed) return alert("配額不足 (需要 2 點)");
    
    onQuotaUpdate();
    setStep(2);
    setIsGeneratingDraft(true);
    setMediaUrl(undefined); 
    
    try {
        if (mode === 'brand') {
            const res = await generatePostDraft(topic, settings, { 
                length: '150-300字', 
                ctaList: [], 
                tempHashtags: '', 
                includeEngagement: false 
            }, undefined, user.role);
            setDraft({ 
                caption: res.caption || '', 
                firstComment: res.ctaText || '', 
                imagePrompt: res.imagePrompt || `Professional photo about ${topic}` 
            });
        } else {
            const res = await generateViralContent(topic, {
                audience: '社群大眾',
                viralType: 'auto',
                platform: 'facebook',
                versionCount: 1
            }, settings);
            
            const fallbackPrompt = `A creative, photorealistic image about ${topic}, 8k resolution, cinematic lighting, commercial photography style`;

            setDraft({
                caption: res.versions?.[0] || '生成內容為空，請重試',
                firstComment: '',
                imagePrompt: res.imagePrompt || fallbackPrompt
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
    if (!draft.imagePrompt.trim()) return alert("請輸入圖片提示詞 (Prompt)");

    const cost = mediaUrl ? 2 : 5;
    const allowed = await checkAndUseQuota(user.user_id, cost);
    if (!allowed) return alert(`配額不足 (需要 ${cost} 點)`);
    
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
      <div className="max-w-4xl mx-auto space-y-12 animate-fade-in pt-10">
          <div className="text-center space-y-3">
              <h2 className="text-5xl font-black text-white tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                  What's Next?
              </h2>
              <p className="text-gray-400 font-bold tracking-widest uppercase">輸入核心主題，讓 AI 為您打造吸睛內容</p>
          </div>
          
          <div className="glass-card p-12 rounded-[2rem] shadow-2xl space-y-8 relative overflow-hidden">
              {/* Decorative Glow */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full pointer-events-none"></div>

              <div className="flex p-1.5 bg-black/40 rounded-2xl border border-white/5 relative z-10">
                  <button 
                    onClick={() => setMode('brand')}
                    className={`flex-1 py-4 rounded-xl font-bold tracking-wide transition-all ${mode === 'brand' ? 'bg-primary text-black shadow-[0_0_20px_rgba(0,242,234,0.4)]' : 'text-gray-500 hover:text-white'}`}
                  >
                    品牌模式
                  </button>
                  <button 
                    onClick={() => setMode('viral')}
                    className={`flex-1 py-4 rounded-xl font-bold tracking-wide transition-all ${mode === 'viral' ? 'bg-secondary text-white shadow-[0_0_20px_rgba(255,0,85,0.4)]' : 'text-gray-500 hover:text-white'}`}
                  >
                    爆文模式 (小紅書)
                  </button>
              </div>

              <div className="flex gap-3 relative z-10">
                  <input 
                    value={topic} 
                    onChange={e => setTopic(e.target.value)} 
                    className="flex-1 p-5 rounded-2xl text-xl font-medium placeholder-gray-600 outline-none" 
                    placeholder="輸入主題 (例如：夏季保養、今日新聞...)" 
                  />
                  <button 
                    onClick={loadTrends} 
                    className="bg-gray-800 hover:bg-gray-700 px-8 rounded-2xl text-white font-bold transition-all flex flex-col items-center justify-center gap-1 border border-gray-700 hover:border-white/20"
                  >
                    <span className="text-sm">🔥 挖掘靈感</span>
                    <span className="text-[9px] bg-primary/20 text-primary px-2 rounded-full font-black">1 CREDIT</span>
                  </button>
              </div>

              {isLoadingTrends ? (
                  <div className="flex justify-center py-6"><div className="loader border-t-primary"></div></div>
              ) : trendingTopics.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-72 overflow-y-auto p-4 border border-white/5 rounded-2xl bg-black/20 custom-scrollbar relative z-10">
                      {trendingTopics.map((t, i) => (
                          <div 
                            key={i} 
                            onClick={() => setTopic(t.title)} 
                            className={`p-4 rounded-xl cursor-pointer transition-all group backdrop-blur-md ${topic === t.title ? 'bg-primary/20 border-primary border' : 'bg-white/5 border-transparent border hover:border-white/20 hover:bg-white/10'}`}
                          >
                              <h4 className="font-bold text-white text-sm mb-1 line-clamp-1 group-hover:text-primary transition-colors">{t.title}</h4>
                              <p className="text-[11px] text-gray-500 line-clamp-1">{t.description}</p>
                          </div>
                      ))}
                  </div>
              )}

              <button 
                onClick={handleNext} 
                disabled={!topic} 
                className={`w-full py-6 rounded-2xl font-black text-white shadow-2xl hover:opacity-90 transition-all disabled:opacity-30 text-xl tracking-widest uppercase relative z-10 ${mode === 'viral' ? 'bg-gradient-to-r from-orange-600 to-red-600' : 'bg-gradient-to-r from-blue-600 to-primary'}`}
              >
                GENERATE MAGIC <span className="text-sm font-normal opacity-70 ml-2">(2 CREDITS)</span>
              </button>
          </div>
      </div>
  );

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in pt-4">
        <div className="space-y-6">
            <div className="glass-card p-8 rounded-3xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-gray-300 tracking-tighter uppercase text-sm">CONTENT EDITOR ({mode === 'viral' ? 'VIRAL' : 'BRAND'})</h3>
                    <button onClick={() => setStep(1)} className="text-[10px] font-bold text-red-400 hover:text-white transition-colors uppercase tracking-widest border border-red-500/30 px-2 py-1 rounded">← RESET TOPIC</button>
                </div>
                
                {/* Caption Editor */}
                <label className="text-[10px] text-gray-500 font-bold mb-2 block uppercase tracking-wider">CAPTION</label>
                <textarea 
                    value={draft.caption} 
                    onChange={e => setDraft({...draft, caption: e.target.value})} 
                    className="w-full h-[300px] p-6 text-white mb-6 resize-none outline-none custom-scrollbar leading-relaxed text-[15px] rounded-2xl" 
                />

                {/* Image Prompt Editor */}
                <div className="mb-6">
                    <div className="flex justify-between items-end mb-2">
                        <label className="text-[10px] text-primary font-bold block uppercase tracking-wider">VISUAL PROMPT</label>
                    </div>
                    <textarea 
                        value={draft.imagePrompt} 
                        onChange={e => setDraft({...draft, imagePrompt: e.target.value})} 
                        className="w-full h-24 p-4 text-gray-300 text-xs outline-none resize-none leading-relaxed rounded-xl" 
                        placeholder="Describe the image..."
                    />
                </div>
                
                <div className="space-y-4">
                    <button 
                        onClick={handleGenMedia} 
                        className={`w-full py-5 rounded-2xl font-black text-white shadow-lg transition-all flex items-center justify-center gap-3 tracking-widest uppercase border border-white/10 ${mediaUrl ? 'bg-black/40 hover:bg-black/60' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110'}`}
                    >
                        {mediaUrl ? (
                            <>REGENERATE ART <span className="text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-full">2 CR</span></>
                        ) : (
                            <>GENERATE VISUAL <span className="text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-full">5 CR</span></>
                        )}
                    </button>
                </div>
            </div>
        </div>
        
        <div className="space-y-6">
            <div className="glass-card p-8 rounded-3xl flex flex-col min-h-[600px] relative">
                <h3 className="font-black text-gray-300 tracking-tighter uppercase text-sm mb-6">PREVIEW</h3>
                
                {/* Simulated Phone UI */}
                <div className="bg-white rounded-[2rem] overflow-hidden flex-1 border-8 border-gray-900 shadow-2xl flex flex-col relative mx-auto w-full max-w-sm">
                    {/* Status Bar */}
                    <div className="bg-white text-black text-[10px] font-bold p-3 flex justify-between px-6">
                        <span>9:41</span>
                        <span>📶 🔋</span>
                    </div>

                    <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 to-red-500 flex items-center justify-center text-white text-xs font-bold">B</div>
                        <div className="space-y-0.5">
                            <div className="h-2 w-20 bg-gray-200 rounded"></div>
                            <div className="h-1.5 w-12 bg-gray-100 rounded"></div>
                        </div>
                    </div>
                    <div className="p-4 overflow-y-auto max-h-[400px] custom-scrollbar flex-1 bg-white">
                        <p className="text-black text-[14px] whitespace-pre-wrap mb-4 leading-relaxed font-sans">{draft.caption}</p>
                        {mediaUrl && <img src={mediaUrl} className="w-full h-auto rounded-xl shadow-sm border border-gray-100 animate-fade-in" />}
                        {!mediaUrl && (
                            <div className="w-full aspect-square bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 gap-2">
                                <span className="text-2xl opacity-50">🖼️</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest">Waiting for Visuals</span>
                            </div>
                        )}
                        
                        {/* Fake Interactions */}
                        <div className="flex gap-4 mt-4 text-gray-400">
                             <div className="w-5 h-5 bg-gray-100 rounded-full"></div>
                             <div className="w-5 h-5 bg-gray-100 rounded-full"></div>
                             <div className="w-5 h-5 bg-gray-100 rounded-full ml-auto"></div>
                        </div>
                    </div>
                </div>

                {publishResult ? (
                    <div className={`mt-8 p-5 rounded-2xl text-center font-bold border transition-all ${publishResult.success ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-red-500/20 text-red-400 border-red-500/50'}`}>
                        <div className="text-[15px] mb-1">{publishResult.msg}</div>
                        <button onClick={() => setPublishResult(null)} className="text-[10px] uppercase font-black tracking-widest text-white/50 hover:text-white transition-colors underline underline-offset-4">Back to Edit</button>
                    </div>
                ) : (
                    <div className="mt-8 space-y-4">
                        <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                            <div className="flex-1">
                                <label className="block text-[9px] text-gray-500 font-black uppercase tracking-[0.2em] mb-1">SCHEDULE</label>
                                <input 
                                    type="datetime-local" 
                                    value={scheduleDate} 
                                    onChange={e => setScheduleDate(e.target.value)} 
                                    className="w-full bg-transparent text-white outline-none text-sm font-bold p-0 border-none" 
                                />
                            </div>
                            <div className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${isLimitReached ? 'text-red-400 border-red-900/50' : 'text-primary border-primary/20'}`}>
                                {scheduledPostsCount}/{limit} SLOT
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => handleFinalize(true)} 
                                disabled={isLimitReached} 
                                className={`flex-1 py-4 rounded-xl font-black transition-all border uppercase tracking-widest text-xs ${isLimitReached ? 'border-gray-800 text-gray-700 cursor-not-allowed' : 'border-gray-600 text-gray-400 hover:border-white hover:text-white'}`}
                            >
                                {isLimitReached ? 'FULL' : 'SAVE DRAFT'}
                            </button>
                            <button 
                                onClick={() => handleFinalize(false)} 
                                className="flex-1 bg-white text-black py-4 rounded-xl font-black shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-gray-200 transition-all transform active:scale-95 text-xs uppercase tracking-widest"
                            >
                                PUBLISH NOW
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
