import React, { useState, useEffect, useRef } from 'react';
import { BrandSettings, Post, TrendingTopic, UserProfile, CtaItem, ViralType, ViralPlatform, TitleScore } from '../types';
import { getTrendingTopics, generatePostDraft, generateImage, applyWatermark, generateViralContent, scoreViralTitles } from '../services/geminiService';
import { publishPostToFacebook } from '../services/facebookService';
import { checkAndUseQuota, getSystemConfig, logUserActivity } from '../services/authService';

interface Props {
  settings: BrandSettings;
  user: UserProfile | null;
  onPostCreated: (post: Post) => void;
  onQuotaUpdate: () => void;
  editPost?: Post | null;
  onCancel?: () => void;
}

// --- New Component: Enhanced Loading Overlay ---
const LoadingOverlay: React.FC<{ message: string, detail?: string }> = ({ message, detail }) => {
    const [tipIndex, setTipIndex] = useState(0);
    const tips = [
        "💡 節省 API 成本提示：使用 Pollinations.ai 替代 Gemini Image Gen 可以節省大量配額！",
        "💡 小技巧：定期清理過期的草稿可以保持系統運作順暢。",
        "💡 流量密碼：在貼文第一則留言放連結，通常觸及率會比直接放在內文高。",
        "💡 系統正在切換備用 API Key 以確保您的請求順利完成...",
        "💡 AI 正在思考最吸引人的標題..."
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setTipIndex(prev => (prev + 1) % tips.length);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 bg-dark/90 z-50 flex flex-col items-center justify-center p-8 backdrop-blur-sm animate-fade-in">
            <div className="w-20 h-20 mb-6 relative">
                <div className="absolute inset-0 border-4 border-gray-600 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{message}</h2>
            <p className="text-gray-400 mb-8 animate-pulse">{detail || "正在處理您的請求，請稍候..."}</p>
            
            <div className="bg-card p-4 rounded-lg border border-gray-600 max-w-md w-full text-center shadow-2xl">
                <p className="text-yellow-400 text-sm font-bold mb-1">你知道嗎？</p>
                <p className="text-gray-300 text-sm transition-opacity duration-500 min-h-[40px] flex items-center justify-center">
                    {tips[tipIndex]}
                </p>
            </div>
        </div>
    );
};

const DRAFT_KEY = 'autosocial_post_draft';

export const PostCreator: React.FC<Props> = ({ settings, user, onPostCreated, onQuotaUpdate, editPost, onCancel }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [topic, setTopic] = useState('');
  const [postMode, setPostMode] = useState<'standard' | 'viral'>('standard');
  
  const [selectedTopicData, setSelectedTopicData] = useState<TrendingTopic | null>(null);

  const role = user?.role || 'user';
  const isFreeTier = role === 'user';
  const isStarterPlus = ['starter', 'pro', 'business', 'admin'].includes(role);

  const [isDemoMode, setIsDemoMode] = useState(false);

  // Standard Mode State
  const [captionLength, setCaptionLength] = useState<string>('150-300字');
  const [ctaList, setCtaList] = useState<CtaItem[]>([{ text: '👉 點擊了解', url: '' }]);
  const [ctaPlacement, setCtaPlacement] = useState<'caption' | 'comment'>('caption');
  const [includeEngagement, setIncludeEngagement] = useState(false); // Direction C
  const [imageText, setImageText] = useState(''); // Direction D
  const [tempHashtags, setTempHashtags] = useState<string>('');

  // Viral Mode State
  const [viralType, setViralType] = useState<ViralType>('regret');
  const [viralPlatform, setViralPlatform] = useState<ViralPlatform>('facebook');
  const [targetAudience, setTargetAudience] = useState('');
  const [titleCandidates, setTitleCandidates] = useState<TitleScore[]>([]);
  const [isScoringTitles, setIsScoringTitles] = useState(false);
  const [selectedViralVersion, setSelectedViralVersion] = useState<number>(0);
  const [viralDrafts, setViralDrafts] = useState<string[]>([]); // Store the 3 versions

  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [topicError, setTopicError] = useState('');
  
  const [draft, setDraft] = useState({ caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  
  const [mediaSource, setMediaSource] = useState<'ai' | 'upload'>('ai');
  const [selectedMediaType, setSelectedMediaType] = useState<'image'>('image'); 
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [scheduleDate, setScheduleDate] = useState('');
  const [syncInstagram, setSyncInstagram] = useState(false);
  
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{success: boolean, msg: string} | null>(null);
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);
  const [isInputHighlight, setIsInputHighlight] = useState(false);
  
  // Watermark State
  const [isApplyingWatermark, setIsApplyingWatermark] = useState(false);

  const isPlaceholderMedia = mediaUrl && (mediaUrl.includes('placehold.co') || mediaUrl.includes('sample/BigBuckBunny'));

  const resetToDefaults = () => {
    setStep(1);
    setTopic('');
    setSelectedTopicData(null); 
    setPostMode('standard');
    setCaptionLength('150-300字');
    setCtaList([{ text: '👉 點擊了解', url: '' }]);
    setCtaPlacement('caption');
    setTempHashtags('');
    setIncludeEngagement(false);
    setImageText('');
    
    // Reset Viral
    setViralType('regret');
    setViralPlatform('facebook');
    setTargetAudience('');
    setTitleCandidates([]);
    setViralDrafts([]);

    setDraft({ caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
    setMediaUrl(undefined);
    setMediaSource('ai');
    setSelectedMediaType('image');
    setScheduleDate('');
    setSyncInstagram(false);
    setPublishResult(null);
    setHasLoadedDraft(false);
    setIsDemoMode(false);
    setTrendingTopics([]);
    setTopicError('');
    setIsGeneratingDraft(false);
    setIsGeneratingMedia(false);
    setIsInputHighlight(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (editPost) {
        setStep(2);
        setTopic(editPost.topic);
        setDraft({ 
            caption: editPost.caption, 
            firstComment: editPost.firstComment || '',
            imagePrompt: editPost.mediaPrompt,
            videoPrompt: editPost.mediaPrompt
        });
        setMediaUrl(editPost.mediaUrl);
        setScheduleDate(editPost.scheduledDate || '');
        setSyncInstagram(!!editPost.syncInstagram);
    } else {
        const savedDraft = localStorage.getItem(DRAFT_KEY);
        if (savedDraft) {
            try {
                const parsed = JSON.parse(savedDraft);
                setStep(parsed.step || 1);
                setTopic(parsed.topic || '');
                setPostMode(parsed.postMode || 'standard');
                setSelectedTopicData(parsed.selectedTopicData || null);
                setCaptionLength(parsed.captionLength || '150-300字');
                setCtaList(parsed.ctaList || [{ text: '👉 點擊了解', url: '' }]);
                setCtaPlacement(parsed.ctaPlacement || 'caption');
                setTempHashtags(parsed.tempHashtags || '');
                setIncludeEngagement(parsed.includeEngagement || false);
                setImageText(parsed.imageText || '');
                
                // Load Viral
                setViralType(parsed.viralType || 'regret');
                setViralPlatform(parsed.viralPlatform || 'facebook');
                setTargetAudience(parsed.targetAudience || '');
                setTitleCandidates(parsed.titleCandidates || []);
                setViralDrafts(parsed.viralDrafts || []);

                setDraft(parsed.draft || { caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
                setMediaUrl(parsed.mediaUrl);
                setMediaSource(parsed.mediaSource || 'ai');
                setSelectedMediaType('image'); 
                setScheduleDate(parsed.scheduleDate || '');
                setSyncInstagram(parsed.syncInstagram || false);
                setIsDemoMode(parsed.isDemoMode || false);
                setHasLoadedDraft(true);
            } catch (e) {
                console.error("Failed to load draft", e);
                resetToDefaults();
            }
        } else {
            resetToDefaults();
        }
    }
  }, [editPost]);

  useEffect(() => {
      if (!topic && step === 1) return;
      if (editPost) return;

      const stateToSave = {
          step,
          topic,
          postMode,
          selectedTopicData,
          captionLength,
          ctaList,
          ctaPlacement,
          tempHashtags,
          includeEngagement,
          imageText,
          viralType,
          viralPlatform,
          targetAudience,
          titleCandidates,
          viralDrafts,
          draft,
          mediaUrl,
          mediaSource,
          selectedMediaType,
          scheduleDate,
          syncInstagram,
          isDemoMode
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(stateToSave));
  }, [step, topic, postMode, selectedTopicData, captionLength, ctaList, ctaPlacement, tempHashtags, includeEngagement, imageText, viralType, viralPlatform, targetAudience, titleCandidates, viralDrafts, draft, mediaUrl, mediaSource, selectedMediaType, scheduleDate, syncInstagram, editPost, isDemoMode]);

  useEffect(() => {
    if (isInputHighlight) {
        const timer = setTimeout(() => setIsInputHighlight(false), 2000);
        return () => clearTimeout(timer);
    }
  }, [isInputHighlight]);

  const handleClearDraft = (e?: React.MouseEvent) => {
      if (e) e.preventDefault(); 
      if (confirm("確定要清除所有編輯進度嗎？此動作將同時清除暫存草稿，且無法復原。")) {
          localStorage.removeItem(DRAFT_KEY);
          resetToDefaults();
          if (onCancel) onCancel();
      }
  };

  const loadTrending = async () => {
    if (!user) {
        alert("請先登入");
        return;
    }
    if (isLoadingTopics) return; 

    if (!isDemoMode) {
        const allowed = await checkAndUseQuota(user.user_id, 1);
        if (!allowed) {
            setTopicError('⚠️ 配額不足，無法搜尋。請升級方案或使用 Demo 模式。');
            return;
        }
        onQuotaUpdate();
    }

    setIsLoadingTopics(true);
    setTopicError('');
    try {
      const seed = Date.now();
      const industry = settings.industry || "台灣熱門時事";
      const topics = await getTrendingTopics(industry, seed);
      setTrendingTopics(topics);
      if (topics.length === 0) setTopicError('找不到相關話題，請檢查 API Key 或稍後再試。');
    } catch (e: any) {
      console.error(e);
      setTopicError(`搜尋失敗: ${e.message}`);
    } finally {
      setIsLoadingTopics(false);
    }
  };

  const handleTopicSelect = (t: TrendingTopic) => {
      setTopic(t.title);
      setSelectedTopicData(t);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setIsInputHighlight(true);
  };

  const handleCtaChange = (index: number, field: 'text' | 'url', value: string) => {
    const newList = [...ctaList];
    newList[index] = { ...newList[index], [field]: value };
    setCtaList(newList);
  };
  const addCtaItem = () => { if (ctaList.length < 5) setCtaList([...ctaList, { text: '👉 了解更多', url: '' }]); };
  const removeCtaItem = (index: number) => {
    if (ctaList.length > 1) {
      setCtaList(ctaList.filter((_, i) => i !== index));
    } else {
      setCtaList([{ text: '👉 了解更多', url: '' }]);
    }
  };

  // --- Viral Title Scoring Handler ---
  const handleScoreTitles = async () => {
      if (!user) return alert("請先登入");
      if (!topic) return alert("請先輸入主題");
      if (isScoringTitles) return;

      const COST = 1;
      const allowed = await checkAndUseQuota(user.user_id, COST);
      if (!allowed) return alert(`配額不足 (需要 ${COST} 點)`);
      onQuotaUpdate();

      setIsScoringTitles(true);
      try {
          // 1. Generate Raw Titles via Viral Prompt (Simplified call to save logic)
          // We can just ask for title ideas first or use the topic directly if it's already a good sentence.
          // For better UX, let's generate 5 variations of the topic as titles then score them.
          const draftRes = await generateViralContent(topic, {
              audience: targetAudience || '大眾',
              viralType: viralType,
              platform: viralPlatform
          });
          
          // Extract titles from the 3 versions (assuming first line is title)
          const generatedTitles = draftRes.versions.map(v => v.split('\n')[0].replace(/^#/, '').trim());
          // Add original topic
          const titlesToScore = [...new Set([topic, ...generatedTitles])].slice(0, 5);

          const scores = await scoreViralTitles(titlesToScore);
          setTitleCandidates(scores);
      } catch (e: any) {
          alert(`標題評分失敗: ${e.message}`);
      } finally {
          setIsScoringTitles(false);
      }
  };

  const handleNextToDraft = async () => {
    if (!topic || isGeneratingDraft) return;
    if (!user) {
        alert("請先登入");
        return;
    }
    
    // DEMO MODE Logic
    if (isDemoMode) {
        setStep(2);
        setIsGeneratingDraft(true);
        setTimeout(() => {
            const demoCaption = postMode === 'viral' 
                ? `【Demo 爆文】${topic} 竟然隱藏這種秘密？！\n\n很多人都不知道，其實... (情緒鋪陳)\n\n#爆料 #內幕`
                : `【Demo 模式】關於 ${topic} 的精彩內容分享！\n\n這是 AutoSocial 的演示功能...`;
            setDraft({
                caption: demoCaption,
                firstComment: "點擊連結: example.com",
                imagePrompt: `(Demo) 為 ${topic} 產生一張現代風格的行銷圖片`,
                videoPrompt: `(Demo) 為 ${topic} 產生一支短影音`
            });
            setIsGeneratingDraft(false);
        }, 1500);
        return;
    }

    // Cost Calculation
    const cost = postMode === 'viral' ? 2 : 1;

    try {
        const allowed = await checkAndUseQuota(user.user_id, cost);
        if (!allowed) {
            alert(`⚠️ 您的 AI 使用配額已額滿 (需要 ${cost} 點)。`);
            return;
        }
    } catch (e) {
        alert("資料庫連線錯誤。");
        return;
    }
    onQuotaUpdate();

    setStep(2);
    setIsGeneratingDraft(true);
    try {
      let finalCaption = '';
      let finalFirstComment = '';
      let finalImagePrompt = '';
      let finalVideoPrompt = '';

      if (postMode === 'viral') {
          // --- Viral Generation ---
          const viralRes = await generateViralContent(topic, {
              audience: targetAudience || 'General Audience',
              viralType,
              platform: viralPlatform
          });
          
          setViralDrafts(viralRes.versions);
          finalCaption = viralRes.versions[0]; // Default to first
          finalImagePrompt = viralRes.imagePrompt;
          finalVideoPrompt = viralRes.imagePrompt; // Reuse for simplicity

          // Viral posts usually don't have standard CTA logic in prompt, so we handle manually if needed?
          // The prompt says "No CTA", but we can append link if user provided ctaList in comments.
          if (ctaList.length > 0 && ctaList[0].url) {
              finalFirstComment = `${ctaList[0].text}: ${ctaList[0].url}`;
          }

      } else {
          // --- Standard Generation ---
          const validCtaList = ctaList.filter(l => l.url.trim() !== '');
          const finalLength = isFreeTier ? '150-300字' : captionLength;

          const generated = await generatePostDraft(
              topic, 
              settings, 
              {
                length: finalLength,
                ctaList: validCtaList,
                tempHashtags: '',
                includeEngagement,
                imageText
              },
              selectedTopicData || undefined,
              user.role
          );

          finalCaption = generated.caption;
          if (generated.ctaText && validCtaList.length > 0) {
            if (ctaPlacement === 'caption' || isFreeTier) {
              finalCaption = `${finalCaption}\n\n${generated.ctaText}`;
            } else {
              finalFirstComment = generated.ctaText;
            }
          }
          finalImagePrompt = generated.imagePrompt;
          finalVideoPrompt = generated.videoPrompt;
      }

      setDraft({
        caption: finalCaption,
        firstComment: finalFirstComment,
        imagePrompt: finalImagePrompt,
        videoPrompt: finalVideoPrompt
      });

      // --- Log Usage ---
      logUserActivity({
          uid: user.user_id,
          act: postMode === 'viral' ? 'viral' : 'draft',
          topic: topic,
          prmt: postMode === 'viral' ? `Viral Type: ${viralType}` : `Length: ${captionLength}`,
          res: finalCaption,
          params: JSON.stringify({ role: user.role, mode: postMode })
      });

    } catch (e: any) {
      console.error(e);
      alert(`生成草稿失敗：${e.message}`);
      setStep(1);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
             setMediaUrl(ev.target?.result as string);
             setSelectedMediaType('image'); 
        };
        reader.readAsDataURL(file);
    }
  };

  const handleGenerateMedia = async () => {
    if (!user || isGeneratingMedia) return;
    
    // Viral Image costs 5 (same as standard high quality)
    const cost = 5; 
    
    if (isDemoMode) {
        setIsGeneratingMedia(true);
        setMediaUrl(undefined);
        setTimeout(() => {
            setMediaUrl("https://placehold.co/1024x1024/2563eb/FFF?text=Demo+Image+Success");
            setIsGeneratingMedia(false);
        }, 1500);
        return;
    }

    if (!confirm(`確定生成圖片嗎？這將消耗 ${cost} 點配額。`)) return;

    const allowed = await checkAndUseQuota(user.user_id, cost);
    if (!allowed) {
        alert(`配額不足。`);
        return;
    }
    onQuotaUpdate();

    setMediaUrl(undefined);
    setIsGeneratingMedia(true);

    try {
      const config = getSystemConfig();
      if (config.dryRunMode) {
          await new Promise(r => setTimeout(r, 2000));
          setMediaUrl("https://placehold.co/1024x1024?text=Dry+Run+Image");
          return;
      }

      const seed = Math.floor(Math.random() * 999999);
      const variationSuffix = ` (random_seed: ${seed})`; 
      const promptToSend = draft.imagePrompt + variationSuffix;
      
      // Determine Style Prompt
      let stylePrompt = settings.brandStylePrompt;
      if (postMode === 'viral' && viralPlatform === 'xhs') {
          stylePrompt = "Little Red Book (Xiaohongshu) handwritten note style";
      }

      let url = await generateImage(promptToSend, user.role, stylePrompt);
      
      if (settings.logoUrl && postMode !== 'viral') {
          // Viral posts (especially XHS) usually don't want branded watermarks to look authentic
          try {
              url = await applyWatermark(url, settings.logoUrl);
          } catch (wmError) {
              console.warn("Auto watermark failed:", wmError);
          }
      }
      
      setMediaUrl(url);

      logUserActivity({
          uid: user.user_id,
          act: 'img',
          topic: topic,
          prmt: promptToSend,
          res: 'Generated Image URL',
          params: JSON.stringify({ role: user.role, style: stylePrompt })
      });

    } catch (e: any) {
      console.error(e);
      let msg = e.message;
      if (msg.includes('429')) msg = "API 配額額滿 (429 Too Many Requests)。系統正在切換 Key，請重試。";
      alert(`素材生成失敗: ${msg}`);
    } finally {
      setIsGeneratingMedia(false);
    }
  };

  // --- Watermark Logic (Manual) ---
  const handleApplyWatermark = async () => {
      if (!mediaUrl || !settings.logoUrl) return;
      setIsApplyingWatermark(true);

      try {
          const newUrl = await applyWatermark(mediaUrl, settings.logoUrl);
          setMediaUrl(newUrl);
      } catch (e: any) {
          alert(`浮水印合成失敗: ${e.message}`);
      } finally {
          setIsApplyingWatermark(false);
      }
  };

  const handleFinalize = async (schedule: boolean) => {
    if (!user || isPublishing) return;
    setIsPublishing(true);
    
    const config = getSystemConfig();
    const isDryRun = config.dryRunMode || isDemoMode; 

    const newPost: Post = {
      id: editPost ? editPost.id : Date.now().toString(),
      userId: user.user_id,
      topic: topic + (isDemoMode ? " (Demo)" : ""),
      caption: draft.caption,
      firstComment: draft.firstComment,
      mediaPrompt: mediaSource === 'ai' ? draft.imagePrompt : 'Manual Upload',
      mediaType: selectedMediaType,
      mediaUrl,
      status: schedule ? 'scheduled' : 'published',
      scheduledDate: schedule ? scheduleDate : undefined,
      syncInstagram,
      createdAt: editPost ? editPost.createdAt : Date.now()
    };

    if (schedule) {
      onPostCreated(newPost);
      setPublishResult({ success: true, msg: "貼文排程更新成功！" });
    } else {
      let result;
      if (isDryRun) {
          await new Promise(r => setTimeout(r, 1000));
          result = { success: true, url: "https://facebook.com/demo-post-id", error: syncInstagram ? 'FB 成功 (IG 模擬略過)' : undefined };
          alert(`[Demo/Dry Run] 模擬發文成功！\nPayload:\n${JSON.stringify({caption: draft.caption.substring(0, 50)+'...', ig: syncInstagram}, null, 2)}`);
      } else {
          result = await publishPostToFacebook(
            settings.facebookPageId, 
            settings.facebookToken, 
            draft.caption, 
            mediaUrl,
            draft.firstComment,
            syncInstagram
          );
      }
      
      if (result.success) {
        newPost.publishedUrl = result.url;
        newPost.status = 'published';
        onPostCreated(newPost);
        const msg = `發佈成功！${result.error || ''}`; 
        setPublishResult({ success: true, msg });
      } else {
        newPost.status = 'failed';
        newPost.errorLog = result.error;
        onPostCreated(newPost);
        setPublishResult({ success: false, msg: `發佈失敗: ${result.error}` });
      }
    }
    
    if (schedule || newPost.status === 'published') {
        if (!editPost) {
            localStorage.removeItem(DRAFT_KEY); 
            resetToDefaults();
        }
    }
    setIsPublishing(false);
  };

  // --- Render ---

  if (isLoadingTopics) return <LoadingOverlay message="AI 正在搜尋熱門話題" detail="正在分析新聞來源與社群趨勢..." />;
  if (isGeneratingDraft) return <LoadingOverlay message="AI 正在撰寫文案" detail={`針對主題「${topic}」進行創意發想中...`} />;
  if (isGeneratingMedia) return <LoadingOverlay message="AI 正在繪製圖片" detail="正在調用高效能繪圖模型..." />;
  if (isPublishing) return <LoadingOverlay message="正在發佈貼文" detail={syncInstagram ? "正在同步發送至 Facebook 與 Instagram..." : "正在發送至 Facebook..."} />;

  if (step === 1) {
      return (
          <div className="max-w-4xl mx-auto space-y-6 animate-fade-in relative">
               <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold mb-4">1. 設定貼文主題與模式</h2>
                    <div className="flex gap-2 items-center">
                        <label className="flex items-center gap-2 cursor-pointer bg-gray-800 border border-gray-600 px-3 py-1 rounded hover:bg-gray-700 transition-colors">
                            <input type="checkbox" checked={isDemoMode} onChange={(e) => setIsDemoMode(e.target.checked)} className="w-4 h-4 rounded" />
                            <span className="text-sm font-bold text-yellow-400">🧪 Demo 模式</span>
                        </label>
                        {hasLoadedDraft && <span className="text-xs text-green-400 animate-pulse">已恢復草稿</span>}
                        <button type="button" onClick={handleClearDraft} className="text-red-400 text-sm border border-red-900 bg-red-900/10 px-3 py-1 rounded hover:bg-red-900/40">🗑️ 清除</button>
                    </div>
               </div>
               
               <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
                  {/* Mode Switcher */}
                  <div className="flex bg-dark p-1 rounded-lg border border-gray-600">
                      <button 
                          onClick={() => setPostMode('standard')}
                          className={`flex-1 py-2 rounded-md font-bold transition-all ${postMode === 'standard' ? 'bg-primary text-white shadow' : 'text-gray-400 hover:text-white'}`}
                      >
                          🏢 一般品牌經營
                      </button>
                      <button 
                          onClick={() => setPostMode('viral')}
                          className={`flex-1 py-2 rounded-md font-bold transition-all flex items-center justify-center gap-2 ${postMode === 'viral' ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                      >
                          🔥 營銷號 / 爆文模式 (Beta)
                      </button>
                  </div>

                  <div>
                      <label className="block text-sm text-gray-400 mb-1">貼文主題</label>
                      <input 
                        value={topic} 
                        onChange={e => { setTopic(e.target.value); setSelectedTopicData(null); setTitleCandidates([]); }} 
                        className={`w-full bg-dark border-gray-600 rounded p-3 text-white outline-none transition-all duration-300 ${isInputHighlight ? 'ring-2 ring-yellow-500 shadow-lg shadow-yellow-500/20' : ''}`} 
                        placeholder="例如：母親節特賣活動、職場生存法則..."
                      />
                  </div>
                  
                  {/* STANDARD MODE CONTROLS */}
                  {postMode === 'standard' && (
                      <div className="space-y-6 animate-fade-in">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                  <label className="block text-sm text-gray-400 mb-1">文案長度</label>
                                  {isFreeTier ? (
                                     <div className="w-full bg-gray-800 border border-gray-600 rounded p-3 text-gray-400 text-sm flex justify-between items-center">
                                        <span>🔒 標準 (150-300字)</span>
                                        <span className="text-xs text-yellow-500">免費版鎖定</span>
                                     </div>
                                  ) : (
                                      <select 
                                        value={captionLength} 
                                        onChange={e => setCaptionLength(e.target.value)}
                                        className="w-full bg-dark border border-gray-600 rounded p-3 text-white"
                                      >
                                         <option value="150字內">短文 (150字內)</option>
                                         <option value="150-300字">標準 (150-300字)</option>
                                         <option value="300-600字">長文 (300-600字)</option>
                                         <option value="800字內">深度文章 (800字內)</option>
                                      </select>
                                  )}
                              </div>
                              <div>
                                  <label className="block text-sm text-gray-400 mb-1">臨時 Hashtags</label>
                                  <input value={tempHashtags} onChange={e => setTempHashtags(e.target.value)} placeholder="#活動限定" className="w-full bg-dark border border-gray-600 rounded p-3 text-white" />
                              </div>
                          </div>

                          <div>
                              <label className="block text-sm text-gray-400 mb-2">行動呼籲 (CTA)</label>
                              <div className="space-y-3">
                                  {ctaList.map((item, index) => (
                                     <div key={index} className="flex gap-2 items-center">
                                        <input 
                                            value={item.text} 
                                            onChange={e => handleCtaChange(index, 'text', e.target.value)}
                                            placeholder="呼籲詞 (如：加Line)" 
                                            className="w-1/3 bg-dark border border-gray-600 rounded p-2 text-white text-sm" 
                                        />
                                        <input 
                                            value={item.url} 
                                            onChange={e => handleCtaChange(index, 'url', e.target.value)}
                                            placeholder="https://..." 
                                            className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white text-sm" 
                                        />
                                        <button type="button" onClick={() => removeCtaItem(index)} className="text-red-400 px-2">×</button>
                                     </div>
                                  ))}
                                  {ctaList.length < 5 && <button type="button" onClick={addCtaItem} className="text-sm text-blue-400">+ 新增 CTA 連結</button>}
                              </div>
                              <div className="mt-4 flex gap-4 text-sm bg-dark/50 p-3 rounded border border-gray-800">
                                  <label className="block text-gray-400 mr-2">位置:</label>
                                  <label className="flex items-center gap-1 text-gray-300 cursor-pointer"><input type="radio" checked={ctaPlacement === 'caption'} onChange={() => setCtaPlacement('caption')} /> 內文文末</label>
                                  <label className={`flex items-center gap-1 cursor-pointer ${isFreeTier ? 'text-gray-500 cursor-not-allowed' : 'text-gray-300'}`}><input type="radio" checked={ctaPlacement === 'comment'} onChange={() => setCtaPlacement('comment')} disabled={isFreeTier} /> 第一則留言 {isFreeTier && '🔒'}</label>
                              </div>
                          </div>

                          <div className="p-3 bg-indigo-900/10 border border-indigo-500/30 rounded-lg">
                              <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={includeEngagement} onChange={(e) => setIncludeEngagement(e.target.checked)} className="w-4 h-4 rounded text-primary"/>
                                  <span className="text-sm font-bold text-indigo-300">🔥 增加互動誘餌</span>
                              </label>
                          </div>
                      </div>
                  )}

                  {/* VIRAL MODE CONTROLS */}
                  {postMode === 'viral' && (
                      <div className="space-y-6 animate-fade-in border-t border-purple-500/30 pt-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                  <label className="block text-sm text-purple-300 font-bold mb-1">爆文類型 (Viral Type)</label>
                                  <select 
                                    value={viralType} 
                                    onChange={e => setViralType(e.target.value as ViralType)}
                                    className="w-full bg-dark border border-purple-500/50 rounded p-3 text-white focus:ring-1 focus:ring-purple-500"
                                  >
                                     <option value="regret">😭 後悔型 (早知道就...)</option>
                                     <option value="expose">🤫 內幕型 (其實產業秘密是...)</option>
                                     <option value="counter">👊 打臉型 (別再相信...)</option>
                                     <option value="identity">👥 族群代入型 (30歲後要注意...)</option>
                                     <option value="result">📈 成果數字型 (如何3天做到...)</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-sm text-purple-300 font-bold mb-1">發佈平台優化</label>
                                  <select 
                                    value={viralPlatform} 
                                    onChange={e => setViralPlatform(e.target.value as ViralPlatform)}
                                    className="w-full bg-dark border border-purple-500/50 rounded p-3 text-white focus:ring-1 focus:ring-purple-500"
                                  >
                                     <option value="facebook">📘 Facebook (段落清晰)</option>
                                     <option value="threads">🧵 Threads (極口語/碎念)</option>
                                     <option value="xhs">📕 小紅書 (筆記感/條列+心得)</option>
                                  </select>
                              </div>
                          </div>
                          
                          <div>
                              <label className="block text-sm text-purple-300 font-bold mb-1">目標族群 (Target Audience)</label>
                              <input 
                                value={targetAudience} 
                                onChange={e => setTargetAudience(e.target.value)} 
                                className="w-full bg-dark border border-purple-500/50 rounded p-3 text-white" 
                                placeholder="例如：剛畢業的新鮮人、想減肥的上班族..." 
                              />
                          </div>

                          {/* Title Scoring Section */}
                          <div className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 p-4 rounded-xl border border-pink-500/30">
                              <div className="flex justify-between items-center mb-4">
                                  <h3 className="text-white font-bold flex items-center gap-2">
                                      🧠 標題 AI 預測評分
                                      <span className="text-xs bg-pink-600 text-white px-2 py-0.5 rounded">扣 1 點</span>
                                  </h3>
                                  <button 
                                    onClick={handleScoreTitles}
                                    disabled={!topic || isScoringTitles}
                                    className="text-xs bg-pink-600 hover:bg-pink-500 text-white px-3 py-1.5 rounded disabled:opacity-50"
                                  >
                                      {isScoringTitles ? '分析中...' : '生成並評分'}
                                  </button>
                              </div>
                              
                              {titleCandidates.length > 0 ? (
                                  <div className="space-y-2">
                                      {titleCandidates.map((c, i) => (
                                          <div key={i} className="bg-black/40 p-3 rounded border border-gray-700 hover:border-pink-500 cursor-pointer" onClick={() => setTopic(c.title)}>
                                              <div className="flex justify-between">
                                                  <span className="font-bold text-white text-sm">{c.title}</span>
                                                  <span className={`font-mono font-bold ${c.score >= 40 ? 'text-green-400' : c.score < 30 ? 'text-red-400' : 'text-yellow-400'}`}>{c.score}分</span>
                                              </div>
                                              <p className="text-xs text-gray-400 mt-1">{c.comment}</p>
                                          </div>
                                      ))}
                                  </div>
                              ) : (
                                  <p className="text-xs text-gray-500 text-center py-2">
                                      輸入主題後點擊評分，AI 將自動生成 5 個高點擊標題並預測成效。
                                  </p>
                              )}
                          </div>
                      </div>
                  )}

                  <div className="pt-4 border-t border-gray-700">
                        <button 
                            type="button" 
                            disabled={!topic} 
                            onClick={handleNextToDraft} 
                            className={`w-full text-white py-3 rounded font-bold transition-all ${
                                isDemoMode ? 'bg-yellow-600' : 
                                postMode === 'viral' ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500' :
                                'bg-primary hover:bg-blue-600'
                            }`}
                        >
                            {isDemoMode ? '下一步：Demo 生成' : 
                             postMode === 'viral' ? '生成爆文 (消耗 2 配額)' : 
                             '下一步：AI 生成 (消耗 1 配額)'}
                        </button>
                  </div>
               </div>

               {/* Trending Section (Standard) */}
               <div className="mt-8">
                   <div className="flex items-center justify-between mb-4">
                       <h3 className="text-lg font-semibold text-gray-400">🔥 趨勢靈感</h3>
                       <button onClick={loadTrending} className="bg-secondary px-4 py-2 rounded text-sm text-white hover:bg-indigo-600 flex items-center gap-2">
                           🔍 搜尋熱門話題
                       </button>
                   </div>
                   {topicError && <div className="text-red-400 text-sm mb-2">{topicError}</div>}
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {trendingTopics.map((t, i) => (
                           <div key={i} onClick={() => handleTopicSelect(t)} className="p-4 rounded border border-gray-700 bg-card cursor-pointer hover:border-primary transition-colors hover:bg-gray-800">
                               <h4 className="font-bold text-white mb-1">{t.title}</h4>
                               <p className="text-sm text-gray-400 line-clamp-2">{t.description}</p>
                           </div>
                       ))}
                   </div>
               </div>
          </div>
      )
  }

  // Step 2 & 3
  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in relative">
        <div className="space-y-6">
            <div className="bg-card p-6 rounded-xl border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-primary">
                        編輯內容 {postMode === 'viral' && <span className="text-xs bg-pink-600 text-white px-2 py-1 rounded ml-2">Viral Mode</span>}
                    </h3>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setStep(1)} className="text-xs text-gray-400 hover:text-white underline">← 返回</button>
                        <button type="button" onClick={handleClearDraft} className="text-xs text-red-400 border border-red-900 px-2 py-1 rounded">清除</button>
                    </div>
                </div>
                
                {/* Version Selector for Viral Mode */}
                {postMode === 'viral' && viralDrafts.length > 0 && (
                    <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                        {viralDrafts.map((_, i) => (
                            <button 
                                key={i}
                                onClick={() => {
                                    setSelectedViralVersion(i);
                                    setDraft(prev => ({...prev, caption: viralDrafts[i]}));
                                }}
                                className={`px-3 py-1 rounded text-xs whitespace-nowrap border ${selectedViralVersion === i ? 'bg-pink-600 border-pink-500 text-white' : 'bg-dark border-gray-600 text-gray-400'}`}
                            >
                                版本 {i + 1}
                            </button>
                        ))}
                    </div>
                )}

                <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-1">貼文文案</label>
                    <textarea value={draft.caption} onChange={e => setDraft({...draft, caption: e.target.value})} className="w-full h-64 bg-dark border-gray-600 rounded p-3 text-white mb-2" />
                </div>
                
                {ctaPlacement === 'comment' && !isFreeTier && postMode === 'standard' && (
                        <div className="mb-4">
                        <label className="block text-sm text-gray-400 mb-1">第一則留言 (CTA)</label>
                        <textarea value={draft.firstComment} onChange={e => setDraft({...draft, firstComment: e.target.value})} className="w-full h-20 bg-dark border-gray-600 rounded p-3 text-white" />
                        </div>
                )}

                <div className="flex gap-4 mb-4 border-t border-gray-700 pt-4">
                    <label className="flex items-center gap-2 text-white cursor-pointer"><input type="radio" checked={mediaSource==='ai'} onChange={() => setMediaSource('ai')} /> AI 生成素材</label>
                    <label className="flex items-center gap-2 text-white cursor-pointer"><input type="radio" checked={mediaSource==='upload'} onChange={() => setMediaSource('upload')} /> 手動上傳</label>
                </div>

                {mediaSource === 'ai' ? (
                    <>
                        <div className="flex gap-2 mb-2">
                            <label className={`flex-1 border border-blue-500 bg-blue-900/30 text-blue-200 rounded p-2 text-sm text-center cursor-pointer transition-colors`}>
                                <input type="radio" className="hidden" checked={selectedMediaType==='image'} onChange={() => setSelectedMediaType('image')} />
                                🖼️ AI 圖片 (5點)
                            </label>
                        </div>
                        
                        {/* Direction D: Text on Image Input */}
                        {postMode === 'standard' && (
                            <div className="mb-3">
                                <label className="block text-xs text-gray-400 mb-1">圖片內嵌文字 (選填)</label>
                                <input 
                                    value={imageText} 
                                    onChange={e => setImageText(e.target.value)} 
                                    className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm" 
                                    placeholder="例如：限時特價、New Arrival (建議使用英文)" 
                                />
                            </div>
                        )}
                        
                        <div className="flex justify-between items-center mb-1 px-1">
                             <label className="text-xs text-gray-400">提示詞 (Prompt)</label>
                             <div className="flex gap-1">
                                {postMode === 'viral' && viralPlatform === 'xhs' && (
                                    <span className="text-[10px] text-pink-400 bg-pink-900/20 px-2 py-0.5 rounded border border-pink-800">
                                        📕 小紅書筆記風格
                                    </span>
                                )}
                                <span className="text-[10px] text-green-400 bg-green-900/20 px-2 py-0.5 rounded border border-green-800">✨ 支援中文輸入</span>
                             </div>
                        </div>

                        <textarea value={draft.imagePrompt} onChange={e => setDraft(prev => ({...prev, imagePrompt: e.target.value}))} className="w-full h-24 bg-dark border-gray-600 rounded p-3 text-white mb-2" placeholder="AI 提示詞..." />
                        
                        <button type="button" onClick={handleGenerateMedia} className={`w-full py-3 rounded font-bold text-white transition-all flex justify-center items-center gap-2 ${isDemoMode ? 'bg-yellow-600' : 'bg-secondary hover:bg-indigo-600'}`}>
                            {isDemoMode ? `產生 Demo 素材` : `生成圖片 (扣5點)`}
                        </button>
                        
                        {mediaUrl && (
                            <button type="button" onClick={handleGenerateMedia} className="w-full mt-2 border border-yellow-600 hover:bg-yellow-900/30 py-2 rounded text-yellow-500 text-sm font-bold transition-colors">
                                🔄 不滿意？重新生成 (立即更新種子)
                            </button>
                        )}
                    </>
                ) : (
                    <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-600 hover:border-primary rounded p-8 text-center cursor-pointer transition-colors">
                        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept="image/*" />
                        <p className="text-gray-400">點擊上傳圖片</p>
                    </div>
                )}
            </div>
        </div>

        <div className="bg-card p-6 rounded-xl border border-gray-700 flex flex-col h-full">
            <h3 className="text-xl font-bold mb-4 text-primary">預覽與發佈</h3>
            <div className="bg-white text-black rounded p-4 flex-1 mb-4 flex flex-col shadow-inner">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
                    <div>
                        <div className="font-bold text-sm">AutoSocial {isDemoMode ? 'Demo' : ''}</div>
                        <div className="text-xs text-gray-500">Just now · 🌎</div>
                    </div>
                </div>
                <div className="whitespace-pre-wrap mb-4 text-sm leading-relaxed">{draft.caption}</div>
                <div className="bg-gray-100 min-h-[250px] flex items-center justify-center rounded overflow-hidden relative">
                    {mediaUrl ? (
                        <>
                            <img src={mediaUrl} className="max-w-full max-h-[400px] object-cover" alt="Post Media" />
                            {(isPlaceholderMedia || isDemoMode) && (
                                <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded shadow-md z-10 flex items-center gap-1">
                                    {isDemoMode ? '🧪 Demo Mode' : '⚠️ 替代素材'}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-gray-400 flex flex-col items-center">
                            {isGeneratingMedia ? <div className="loader border-gray-400 mb-2"></div> : null}
                            <span>{isGeneratingMedia ? 'AI 繪圖中...' : '素材預覽區'}</span>
                        </div>
                    )}
                </div>
                {ctaPlacement === 'comment' && draft.firstComment && (
                    <div className="mt-4 pt-2 border-t border-gray-200">
                        <p className="text-xs font-bold text-gray-600 mb-1">留言</p>
                        <div className="bg-gray-100 p-2 rounded text-sm whitespace-pre-wrap">
                            <span className="font-bold mr-1">AutoSocial</span>
                            {draft.firstComment}
                        </div>
                    </div>
                )}
            </div>
            
            {/* --- Tools & Actions --- */}
            {mediaUrl && settings.logoUrl && postMode === 'standard' && (
                <div className="mb-4">
                     <button 
                        onClick={handleApplyWatermark} 
                        disabled={isApplyingWatermark}
                        className="w-full bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded flex items-center justify-center gap-2"
                     >
                         {isApplyingWatermark ? '合成中...' : '🏷️ 重新套用浮水印 (手動)'}
                     </button>
                </div>
            )}
            
            {/* --- Publish Config Section --- */}
            {publishResult ? <div className={`p-4 rounded text-center font-bold ${publishResult.success ? 'bg-green-900/50 text-green-200 border border-green-700' : 'bg-red-900/50 text-red-200 border border-red-700'}`}>{publishResult.msg}</div> : (
                <div className="space-y-4">
                    {/* IG Sync Checkbox */}
                    <div className="flex items-center justify-between bg-dark p-3 rounded border border-gray-600">
                        <div>
                             <span className="font-bold text-white text-sm">同步發佈至 Instagram</span>
                             <p className="text-xs text-gray-400">需連結 IG 商業帳號 (僅支援公開圖片網址)</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={syncInstagram} onChange={e => setSyncInstagram(e.target.checked)} className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r from-purple-500 to-pink-500"></div>
                        </label>
                    </div>

                    {!isFreeTier && (
                        <div className="bg-dark p-3 rounded border border-gray-600">
                            <label className="block text-xs text-gray-400 mb-1">預約發佈時間 (選填)</label>
                            <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full bg-transparent text-white outline-none" />
                        </div>
                    )}
                    <div className="flex gap-4">
                        <button 
                            type="button"
                            onClick={() => handleFinalize(true)} 
                            disabled={!scheduleDate || !isStarterPlus} 
                            className="flex-1 border border-primary text-primary hover:bg-primary/10 py-3 rounded font-bold disabled:opacity-50"
                        >
                            {!isStarterPlus ? "排程 (鎖定)" : "加入排程"}
                        </button>
                        <button 
                            type="button" 
                            onClick={() => handleFinalize(false)} 
                            className={`flex-1 text-white py-3 rounded font-bold shadow-lg ${isDemoMode ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-primary hover:bg-blue-600'}`}
                        >
                            {isDemoMode ? '模擬發佈' : '立即發佈'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};