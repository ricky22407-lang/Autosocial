
import React, { useState, useEffect } from 'react';
import { BrandSettings, Post, TrendingTopic, UserProfile, ImageIntent } from '../types';
import { getTrendingTopics, generatePostDraft, generateImage, applyWatermark, generateViralContent, generateImagePromptString, compositeImageWithText } from '../services/geminiService';
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

const LoadingOverlay: React.FC<{ message: string, subMessage?: string }> = ({ message, subMessage }) => (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-8 backdrop-blur-xl animate-fade-in text-center">
        <div className="loader mb-6 scale-150 border-t-primary"></div>
        <h2 className="text-2xl font-black text-white mb-2 tracking-tight">{message}</h2>
        {subMessage && <p className="text-gray-400 font-mono text-xs uppercase tracking-widest">{subMessage}</p>}
    </div>
);

export const PostCreator: React.FC<Props> = ({ settings, user, onPostCreated, onQuotaUpdate, editPost, onCancel, scheduledPostsCount = 0 }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<'brand' | 'viral'>('brand');
  
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  
  const [draft, setDraft] = useState({ caption: '', firstComment: '', imagePrompt: '' });
  const [imageIntent, setImageIntent] = useState<ImageIntent>('lifestyle'); 
  
  // Image Rendering Modes
  const [renderMode, setRenderMode] = useState<'plain' | 'ai_text' | 'smart_layout'>('plain');
  const [customImageText, setCustomImageText] = useState(''); // Used for AI Text Mode
  
  // Smart Layout State
  const [layoutTitle, setLayoutTitle] = useState('');
  const [layoutSubtitle, setLayoutSubtitle] = useState('');

  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [generatingPhase, setGeneratingPhase] = useState<string>(''); 
  
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

  // Pre-fill smart layout text based on topic when draft is generated
  useEffect(() => {
      if (draft.caption && !layoutTitle) {
          // Heuristic: Use topic as title, extract first price or short phrase as subtitle
          setLayoutTitle(topic);
          const priceMatch = draft.caption.match(/\$\d+(?:,\d+)?/);
          if (priceMatch) setLayoutSubtitle(`${priceMatch[0]} 起`);
      }
  }, [draft.caption]);

  const loadTrends = async () => {
      if (!user) return alert("請先登入");
      
      const COST = 3; 
      const allowed = await checkAndUseQuota(user.user_id, COST, 'TREND_SEARCH'); 
      if (!allowed) return; 
      
      onQuotaUpdate();
      setIsLoadingTrends(true);
      try {
          const query = topic.trim() || settings.industry || '台灣熱門話題';
          const trends = await getTrendingTopics(query);
          setTrendingTopics(trends);
          if(topic.trim()) alert(`已為您搜尋關於「${query}」的熱門話題！(扣除 ${COST} 點)`);
      } catch (e) { console.error(e); }
      finally { setIsLoadingTrends(false); }
  };

  const handleNext = async () => {
    if (!topic || !user) return;
    
    // [BILLING] FB Draft: 5 Points
    const allowed = await checkAndUseQuota(user.user_id, 5, 'GENERATE_POST_DRAFT');
    if (!allowed) return; 
    
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
                imagePrompt: '' 
            });
        } else {
            const res = await generateViralContent(topic, {
                audience: '社群大眾',
                viralType: 'auto',
                platform: 'facebook',
                versionCount: 1
            }, settings);
            setDraft({
                caption: res.versions?.[0] || '生成內容為空，請重試',
                firstComment: '',
                imagePrompt: ''
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
    
    // Validation
    if (renderMode === 'ai_text' && !customImageText) {
        return alert("請輸入您想顯示在圖片上的文字，或切換模式。");
    }
    if (renderMode === 'smart_layout' && !layoutTitle) {
        return alert("智慧排版模式需要至少輸入「主標題」。");
    }

    // [BILLING] FB Image: Regen 5 Points, First Time 8 Points
    const cost = mediaUrl ? 5 : 8; 
    const allowed = await checkAndUseQuota(user.user_id, cost, 'GENERATE_IMAGE_AI');
    if (!allowed) return;
    
    onQuotaUpdate();
    setIsGeneratingMedia(true);
    setGeneratingPhase('正在構思畫面...');

    try {
        let finalPrompt = draft.imagePrompt;

        if (!finalPrompt.trim()) {
             const aiPrompt = await generateImagePromptString(draft.caption, imageIntent, settings);
             finalPrompt = aiPrompt;
             setDraft(prev => ({ ...prev, imagePrompt: aiPrompt }));
        }

        setGeneratingPhase('AI 設計師繪圖中 (標準畫質)...');
        
        // Step 1: Generate Base Image
        // If smart_layout, we pass true to ask AI for negative space.
        // If ai_text, we pass the text string.
        let url = await generateImage(
            finalPrompt, 
            user.role, 
            settings, 
            imageIntent,
            renderMode === 'ai_text' ? customImageText : undefined,
            renderMode === 'smart_layout' // useSmartLayout flag
        );

        // Step 2: Apply Canvas Overlay (If Smart Layout)
        if (renderMode === 'smart_layout') {
            setGeneratingPhase('正在進行智慧排版合成...');
            url = await compositeImageWithText(url, layoutTitle, layoutSubtitle, '#FFD700');
        }

        // Step 3: Apply Logo
        if (settings.logoUrl) {
            setGeneratingPhase('正在壓上品牌浮水印...');
            url = await applyWatermark(url, settings.logoUrl);
        }
        setMediaUrl(url);
    } catch (e: any) { 
        alert(`製圖失敗: ${e.message}`); 
    } finally { 
        setIsGeneratingMedia(false); 
        setGeneratingPhase('');
    }
  };

  const handleIntentChange = (newIntent: ImageIntent) => {
      setImageIntent(newIntent);
  };

  const handleFinalize = async (schedule: boolean) => {
    if (!user || isPublishing) return;
    let scheduledUnixTime: number | undefined = undefined;

    if (schedule) {
        if (!scheduleDate) return alert("請選擇預計發佈時間");
        const targetTime = new Date(scheduleDate).getTime();
        const now = Date.now();
        const diffMinutes = (targetTime - now) / 1000 / 60;
        if (diffMinutes < 10) return alert("FB 規定：排程時間必須在「未來 10 分鐘」之後。");
        if (diffMinutes > 30 * 24 * 60) return alert("FB 規定：排程時間不能超過 30 天。");
        scheduledUnixTime = Math.floor(targetTime / 1000);
    }

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

        const res = await publishPostToFacebook(
            settings.facebookPageId, 
            settings.facebookToken, 
            draft.caption, 
            mediaUrl, 
            draft.firstComment, 
            syncInstagram,
            scheduledUnixTime
        );

        if (res.success) {
            newPost.publishedUrl = res.url;
            newPost.status = schedule ? 'scheduled' : 'published';
            await onPostCreated(newPost);
            
            if (schedule) setPublishResult({ success: true, msg: "✅ 已成功傳送至 Facebook 排程系統！" });
            else setPublishResult({ success: true, msg: "✅ 貼文已成功發佈！" });
        } else {
            newPost.status = 'failed';
            newPost.errorLog = res.error;
            await onPostCreated(newPost);
            setPublishResult({ success: false, msg: `❌ 發佈失敗: ${res.error}` });
        }

    } catch (err: any) { 
        setPublishResult({ success: false, msg: `錯誤: ${err.message}` }); 
    } finally { 
        setIsPublishing(false); 
    }
  };

  if (isGeneratingDraft) return <LoadingOverlay message="AI 正在構思文案..." />;
  if (isGeneratingMedia) return <LoadingOverlay message={generatingPhase} subMessage="請稍候，正在為您打造專屬素材" />;
  if (isPublishing) return <LoadingOverlay message="正在傳送至 Facebook..." />;

  if (step === 1) return (
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
                  <button onClick={loadTrends} className="bg-gray-800 hover:bg-gray-700 px-8 py-4 md:py-0 rounded-2xl text-white font-bold transition-all flex flex-row md:flex-col items-center justify-center gap-2 md:gap-1 border border-gray-700 hover:border-white/20 whitespace-nowrap">
                    <span className="text-sm">🔥 挖掘靈感</span><span className="text-[9px] bg-primary/20 text-primary px-2 rounded-full font-black">3 點數</span>
                  </button>
              </div>

              {isLoadingTrends ? (
                  <div className="flex justify-center py-6"><div className="loader border-t-primary"></div></div>
              ) : trendingTopics.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-72 overflow-y-auto p-4 border border-white/5 rounded-2xl bg-black/20 custom-scrollbar relative z-10">
                      {trendingTopics.map((t, i) => (
                          <div key={i} onClick={() => setTopic(t.title)} className={`p-4 rounded-xl cursor-pointer transition-all group backdrop-blur-md ${topic === t.title ? 'bg-primary/20 border-primary border' : 'bg-white/5 border-transparent border hover:border-white/20 hover:bg-white/10'}`}>
                              <h4 className="font-bold text-white text-sm mb-1 line-clamp-1 group-hover:text-primary transition-colors">{t.title}</h4>
                              <p className="text-[11px] text-gray-500 line-clamp-1">{t.description}</p>
                          </div>
                      ))}
                  </div>
              )}

              <button onClick={handleNext} disabled={!topic} className={`w-full py-5 md:py-6 rounded-2xl font-black text-white shadow-2xl hover:opacity-90 transition-all disabled:opacity-30 text-lg md:text-xl tracking-widest uppercase relative z-10 ${mode === 'viral' ? 'bg-gradient-to-r from-orange-600 to-red-600' : 'bg-gradient-to-r from-blue-600 to-primary'}`}>
                開始生成文案 <span className="text-sm font-normal opacity-70 ml-2">(5 點數)</span>
              </button>
          </div>
      </div>
  );

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in pt-4 pb-20">
        <div className="space-y-6">
            <div className="glass-card p-6 md:p-8 rounded-3xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-gray-300 tracking-tighter uppercase text-sm">內容編輯器 ({mode === 'viral' ? '爆文模式' : '品牌模式'})</h3>
                    <button onClick={() => setStep(1)} className="text-[10px] font-bold text-red-400 hover:text-white transition-colors uppercase tracking-widest border border-red-500/30 px-2 py-1 rounded">← 重設主題</button>
                </div>
                
                <label className="text-[10px] text-gray-500 font-bold mb-2 block uppercase tracking-wider">貼文文案 (Caption)</label>
                <textarea value={draft.caption} onChange={e => setDraft({...draft, caption: e.target.value})} className="w-full h-[200px] p-6 text-white mb-6 resize-none outline-none custom-scrollbar leading-relaxed text-[15px] rounded-2xl" />

                {/* New Image Settings Logic */}
                <div className="mb-6 p-4 bg-black/30 rounded-xl border border-gray-700">
                    <label className="text-[10px] text-primary font-bold mb-2 block uppercase tracking-wider">選擇配圖風格 (Image Intent)</label>
                    <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                        {(['product_showcase', 'promotion', 'lifestyle', 'educational', 'festival'] as ImageIntent[]).map(intent => (
                            <button 
                                key={intent}
                                onClick={() => handleIntentChange(intent)}
                                className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap border transition-all ${imageIntent === intent ? 'bg-primary text-black border-primary' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}`}
                            >
                                {intent === 'product_showcase' ? '📦 產品特寫' : intent === 'promotion' ? '🏷️ 促銷 Banner' : intent === 'lifestyle' ? '🏖️ 情境生活' : intent === 'educational' ? '📚 知識圖卡' : '🎉 節慶賀圖'}
                            </button>
                        ))}
                    </div>
                    
                    {/* TEXT MODE SELECTION */}
                    <div className="mb-4 pt-3 border-t border-gray-700">
                        <label className="text-[10px] text-gray-400 font-bold mb-2 block uppercase tracking-wider">文字渲染模式 (Text Mode)</label>
                        <div className="flex bg-black/40 rounded-lg p-1 mb-4 border border-gray-600">
                            <button 
                                onClick={() => setRenderMode('plain')}
                                className={`flex-1 py-2 rounded text-xs font-bold transition-all ${renderMode === 'plain' ? 'bg-gray-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                純淨無字
                            </button>
                            <button 
                                onClick={() => setRenderMode('smart_layout')}
                                className={`flex-1 py-2 rounded text-xs font-bold transition-all ${renderMode === 'smart_layout' ? 'bg-yellow-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                ⚡ 智慧排版 (推薦)
                            </button>
                            <button 
                                onClick={() => setRenderMode('ai_text')}
                                className={`flex-1 py-2 rounded text-xs font-bold transition-all ${renderMode === 'ai_text' ? 'bg-red-900/50 text-red-300 border border-red-800' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                AI 生成 (實驗性)
                            </button>
                        </div>

                        {renderMode === 'smart_layout' && (
                            <div className="bg-yellow-900/10 border border-yellow-600/30 p-4 rounded-xl animate-fade-in space-y-3">
                                <p className="text-[10px] text-yellow-200/80 mb-1 flex items-center gap-2">
                                    <span className="text-lg">✨</span> 系統將自動在圖片底部合成電影感字幕。
                                </p>
                                <div>
                                    <label className="text-[10px] text-gray-400 block mb-1">主標題</label>
                                    <input 
                                        value={layoutTitle}
                                        onChange={e => setLayoutTitle(e.target.value)}
                                        className="w-full bg-black/40 border border-yellow-600/30 rounded p-2 text-white text-sm focus:border-yellow-500 outline-none"
                                        placeholder="例如：泰國曼谷五日遊"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-400 block mb-1">副標題 / 價格</label>
                                    <input 
                                        value={layoutSubtitle}
                                        onChange={e => setLayoutSubtitle(e.target.value)}
                                        className="w-full bg-black/40 border border-yellow-600/30 rounded p-2 text-yellow-400 font-bold text-sm focus:border-yellow-500 outline-none"
                                        placeholder="例如：$29,900 起"
                                    />
                                </div>
                            </div>
                        )}

                        {renderMode === 'ai_text' && (
                            <div className="bg-red-900/10 border border-red-500/50 p-4 rounded-xl animate-fade-in">
                                <p className="text-xs text-red-300 font-bold mb-2 flex items-center gap-2">
                                    <span>⚠️</span> 警告：AI 直接生成
                                </p>
                                <p className="text-[10px] text-red-200/80 mb-3 leading-relaxed">
                                    此模式由 DALL-E 3 直接嘗試在圖片中「畫」出文字。
                                    <br/>
                                    <strong>即便在最強模型下，中文字仍有極高機率變成亂碼。建議使用「智慧排版」模式。</strong>
                                </p>
                                <input 
                                    value={customImageText}
                                    onChange={e => setCustomImageText(e.target.value)}
                                    placeholder="請輸入欲顯示的文字 (例如: NT$18,900)"
                                    className="w-full bg-black/40 border border-red-500/30 rounded-lg p-3 text-white text-sm focus:border-red-500 outline-none placeholder-gray-500"
                                />
                            </div>
                        )}
                    </div>

                    <label className="flex justify-between items-center text-[10px] text-gray-500 font-bold mb-2 uppercase tracking-wider">
                        <span>視覺提示詞 (AI Prompt)</span>
                        <button onClick={() => setDraft(prev => ({...prev, imagePrompt: ''}))} className="text-red-400 hover:text-white transition-colors text-[9px] border border-red-500/30 px-1 rounded">清空以重新生成</button>
                    </label>
                    <textarea 
                        value={draft.imagePrompt} 
                        onChange={e => setDraft({...draft, imagePrompt: e.target.value})} 
                        className="w-full h-16 p-3 text-gray-300 text-xs outline-none resize-none leading-relaxed rounded-xl border border-gray-700 bg-black/20 focus:border-primary/50 transition-colors" 
                        placeholder={mediaUrl ? "您可手動修改 Prompt 並點擊重新繪製..." : "點擊「生成圖片」後，AI 將自動根據文案與風格填寫此處..."} 
                    />
                </div>
                
                <div className="space-y-4">
                    <button 
                        onClick={handleGenMedia} 
                        disabled={isGeneratingMedia}
                        className={`w-full py-5 rounded-2xl font-black text-white shadow-lg transition-all flex items-center justify-center gap-3 tracking-widest uppercase border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed ${mediaUrl ? 'bg-black/40 hover:bg-black/60' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110'}`}
                    >
                        {isGeneratingMedia ? (
                            <>
                                <div className="loader w-4 h-4 border-t-white"></div>
                                繪製中...
                            </>
                        ) : mediaUrl ? (
                            <>重新繪製 (依據當前 Prompt) <span className="text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-full">5 點數</span></>
                        ) : (
                            <>生成商業設計圖 (Ideogram/Imagen) <span className="text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-full">8 點數</span></>
                        )}
                    </button>
                </div>
            </div>
        </div>
        
        <div className="space-y-6">
            <div className="glass-card p-6 md:p-8 rounded-3xl flex flex-col min-h-[600px] relative">
                <h3 className="font-black text-gray-300 tracking-tighter uppercase text-sm mb-6">預覽效果</h3>
                
                <div className="bg-white rounded-[2rem] overflow-hidden flex-1 border-8 border-gray-900 shadow-2xl flex flex-col relative mx-auto w-full max-w-sm">
                    <div className="bg-white text-black text-[10px] font-bold p-3 flex justify-between px-6"><span>9:41</span><span>📶 🔋</span></div>
                    <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 to-red-500 flex items-center justify-center text-white text-xs font-bold">B</div>
                        <div className="space-y-0.5"><div className="h-2 w-20 bg-gray-200 rounded"></div><div className="h-1.5 w-12 bg-gray-100 rounded"></div></div>
                    </div>
                    <div className="p-4 overflow-y-auto max-h-[400px] custom-scrollbar flex-1 bg-white">
                        <p className="text-black text-[14px] whitespace-pre-wrap mb-4 leading-relaxed font-sans">{draft.caption}</p>
                        {mediaUrl && <img src={mediaUrl} className="w-full h-auto rounded-xl shadow-sm border border-gray-100 animate-fade-in" />}
                        {!mediaUrl && (
                            <div className="w-full aspect-square bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 gap-2">
                                <span className="text-2xl opacity-50">🖼️</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-center px-4">
                                    {draft.caption ? "請選擇左側風格並點擊生成圖片" : "等待文案生成..."}
                                </span>
                            </div>
                        )}
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
                        <button onClick={() => setPublishResult(null)} className="text-[10px] uppercase font-black tracking-widest text-white/50 hover:text-white transition-colors underline underline-offset-4">返回編輯</button>
                    </div>
                ) : (
                    <div className="mt-8 space-y-4">
                        <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex-1 w-full">
                                <label className="block text-[9px] text-gray-500 font-black uppercase tracking-[0.2em] mb-1">FB 排程發佈 (選填)</label>
                                <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full bg-transparent text-white outline-none text-sm font-bold p-0 border-none" />
                            </div>
                            <div className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${isLimitReached ? 'text-red-400 border-red-900/50' : 'text-primary border-primary/20'}`}>
                                {scheduledPostsCount}/{limit} 席位
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => handleFinalize(true)} disabled={isLimitReached} className={`flex-1 py-4 rounded-xl font-black transition-all border uppercase tracking-widest text-xs ${isLimitReached ? 'border-gray-800 text-gray-700 cursor-not-allowed' : 'border-gray-600 text-gray-400 hover:border-white hover:text-white'}`}>
                                {isLimitReached ? '已滿' : '排程發佈 (FB API)'}
                            </button>
                            <button onClick={() => handleFinalize(false)} className="flex-1 bg-white text-black py-4 rounded-xl font-black shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-gray-200 transition-all transform active:scale-95 text-xs uppercase tracking-widest">
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
