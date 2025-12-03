
import React, { useState, useEffect, useRef } from 'react';
import { BrandSettings, Post, TrendingTopic, UserProfile } from '../types';
import { getTrendingTopics, generatePostDraft, generateImage } from '../services/geminiService';
import { publishPostToFacebook } from '../services/facebookService';
import { checkAndUseQuota, getSystemConfig } from '../services/authService';

interface Props {
  settings: BrandSettings;
  user: UserProfile | null;
  onPostCreated: (post: Post) => void;
  onQuotaUpdate: () => void;
  editPost?: Post | null;
  onCancel?: () => void;
}

const DRAFT_KEY = 'autosocial_post_draft';

export const PostCreator: React.FC<Props> = ({ settings, user, onPostCreated, onQuotaUpdate, editPost, onCancel }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [topic, setTopic] = useState('');
  
  // Store full trending data (title, desc, url) for better AI context
  const [selectedTopicData, setSelectedTopicData] = useState<TrendingTopic | null>(null);

  // Feature Locks based on New Tiers
  // Free (user) cannot use: AI Image, Schedule
  const role = user?.role || 'user';
  const isFreeTier = role === 'user';
  // Starter+ can use basic media
  const isStarterPlus = ['starter', 'pro', 'business', 'admin'].includes(role);

  // Demo Mode State
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Options State
  const [captionLength, setCaptionLength] = useState<string>('150-300字');
  const [ctaLinks, setCtaLinks] = useState<string[]>(['']);
  const [ctaPlacement, setCtaPlacement] = useState<'caption' | 'comment'>('caption');
  const [tempHashtags, setTempHashtags] = useState<string>('');

  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [topicError, setTopicError] = useState('');
  
  const [draft, setDraft] = useState({ caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  
  const [mediaSource, setMediaSource] = useState<'ai' | 'upload'>('ai');
  const [selectedMediaType, setSelectedMediaType] = useState<'image'>('image'); // Video removed
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [scheduleDate, setScheduleDate] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{success: boolean, msg: string} | null>(null);
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);

  // Input highlight state
  const [isInputHighlight, setIsInputHighlight] = useState(false);

  // Check if media is placeholder (Visual warning only)
  const isPlaceholderMedia = mediaUrl && (mediaUrl.includes('placehold.co') || mediaUrl.includes('sample/BigBuckBunny'));

  const resetToDefaults = () => {
    setStep(1);
    setTopic('');
    setSelectedTopicData(null); // Clear context
    setCaptionLength('150-300字');
    setCtaLinks(['']);
    setCtaPlacement('caption');
    setTempHashtags('');
    setDraft({ caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
    setMediaUrl(undefined);
    setMediaSource('ai');
    setSelectedMediaType('image');
    setScheduleDate('');
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

  // 1. Initialize from editPost (Priority 1) or LocalStorage Draft (Priority 2)
  useEffect(() => {
    if (editPost) {
        setStep(2);
        setTopic(editPost.topic);
        // Note: editPost doesn't store full trending context currently, which is fine
        setDraft({ 
            caption: editPost.caption, 
            firstComment: editPost.firstComment || '',
            imagePrompt: editPost.mediaPrompt,
            videoPrompt: editPost.mediaPrompt
        });
        setMediaUrl(editPost.mediaUrl);
        setScheduleDate(editPost.scheduledDate || '');
    } else {
        // Load Draft logic
        const savedDraft = localStorage.getItem(DRAFT_KEY);
        if (savedDraft) {
            try {
                const parsed = JSON.parse(savedDraft);
                setStep(parsed.step || 1);
                setTopic(parsed.topic || '');
                setSelectedTopicData(parsed.selectedTopicData || null);
                setCaptionLength(parsed.captionLength || '150-300字');
                setCtaLinks(parsed.ctaLinks || ['']);
                setCtaPlacement(parsed.ctaPlacement || 'caption');
                setTempHashtags(parsed.tempHashtags || '');
                setDraft(parsed.draft || { caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
                setMediaUrl(parsed.mediaUrl);
                setMediaSource(parsed.mediaSource || 'ai');
                setSelectedMediaType('image'); // Force image
                setScheduleDate(parsed.scheduleDate || '');
                setIsDemoMode(parsed.isDemoMode || false);
                setHasLoadedDraft(true);
            } catch (e) {
                console.error("Failed to load draft", e);
                resetToDefaults();
            }
        } else {
            // No draft and no edit post -> Clean Slate
            resetToDefaults();
        }
    }
  }, [editPost]);

  // 2. Auto-Save Draft
  useEffect(() => {
      if (!topic && step === 1) return;
      if (editPost) return;

      const stateToSave = {
          step,
          topic,
          selectedTopicData,
          captionLength,
          ctaLinks,
          ctaPlacement,
          tempHashtags,
          draft,
          mediaUrl,
          mediaSource,
          selectedMediaType,
          scheduleDate,
          isDemoMode
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(stateToSave));
  }, [step, topic, selectedTopicData, captionLength, ctaLinks, ctaPlacement, tempHashtags, draft, mediaUrl, mediaSource, selectedMediaType, scheduleDate, editPost, isDemoMode]);

  // Effect to handle highlight animation removal
  useEffect(() => {
    if (isInputHighlight) {
        const timer = setTimeout(() => setIsInputHighlight(false), 2000);
        return () => clearTimeout(timer);
    }
  }, [isInputHighlight]);

  const handleClearDraft = (e?: React.MouseEvent) => {
      if (e) e.preventDefault(); // Prevent bubbling issues
      
      if (confirm("確定要清除所有編輯進度嗎？此動作將同時清除暫存草稿，且無法復原。")) {
          // 1. Remove from Storage explicitly first
          localStorage.removeItem(DRAFT_KEY);
          
          // 2. Reset All State Variables
          resetToDefaults();

          // 3. Notify Parent to clear Edit Mode if applicable
          if (onCancel) onCancel();
      }
  };

  const loadTrending = async () => {
    if (!user) {
        alert("請先登入");
        return;
    }
    if (isLoadingTopics) return; // Prevent double click

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
      // Add random seed to get different results on retry
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
      // Store Title
      setTopic(t.title);
      // Store Full Context (Desc, URL)
      setSelectedTopicData(t);
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setIsInputHighlight(true);
  };

  const handleCtaLinkChange = (index: number, value: string) => {
    const newLinks = [...ctaLinks];
    newLinks[index] = value;
    setCtaLinks(newLinks);
  };
  const addCtaLink = () => { if (ctaLinks.length < 5) setCtaLinks([...ctaLinks, '']); };
  const removeCtaLink = (index: number) => {
    if (ctaLinks.length > 1) {
      setCtaLinks(ctaLinks.filter((_, i) => i !== index));
    } else {
      setCtaLinks(['']);
    }
  };

  const handleNextToDraft = async () => {
    if (!topic || isGeneratingDraft) return;
    if (!user) {
        alert("請先登入");
        return;
    }
    
    // --- DEMO MODE LOGIC ---
    if (isDemoMode) {
        setStep(2);
        setIsGeneratingDraft(true);
        // Simulate delay
        setTimeout(() => {
            const demoCaption = `【Demo 模式】關於 ${topic} 的精彩內容分享！\n\n這是 AutoSocial 的演示功能，讓您體驗自動撰寫文案的流程。我們能根據您的品牌語氣，自動生成合適的貼文內容。\n\n#AutoSocial #Demo #AI行銷`;
            const demoCta = `點擊了解更多: https://example.com`;
            
            let finalCaption = demoCaption;
            let finalComment = '';
            
            if (ctaPlacement === 'caption') {
                finalCaption += `\n\n${demoCta}`;
            } else {
                finalComment = demoCta;
            }

            setDraft({
                caption: finalCaption,
                firstComment: finalComment,
                imagePrompt: `(Demo) 為 ${topic} 產生一張現代風格的行銷圖片`,
                videoPrompt: `(Demo) 為 ${topic} 產生一支短影音`
            });
            setIsGeneratingDraft(false);
        }, 1500);
        return;
    }

    // --- REAL MODE LOGIC ---
    
    // Quota Check
    try {
        const allowed = await checkAndUseQuota(user.user_id, 1);
        if (!allowed) {
            alert("⚠️ 您的 AI 使用配額已額滿 (或連線資料庫失敗)，請升級方案或聯絡管理員。\n\n提示：您可以開啟「🧪 Demo 模式」來免費體驗功能。");
            return;
        }
    } catch (e) {
        alert("資料庫連線錯誤，無法確認配額。");
        return;
    }
    
    // Refresh user quota display
    onQuotaUpdate();

    setStep(2);
    setIsGeneratingDraft(true);
    try {
      const validLinks = ctaLinks.filter(l => l.trim() !== '');

      // Force Standard length for Free User
      const finalLength = isFreeTier ? '150-300字' : captionLength;

      const generated = await generatePostDraft(
          topic, 
          settings, 
          {
            length: finalLength,
            ctaLinks: validLinks,
            tempHashtags: '' 
          },
          selectedTopicData || undefined // Pass full context if available
      );

      let finalCaption = generated.caption;
      const config = getSystemConfig();
      if (config.dryRunMode) {
          finalCaption = "[DryRun] " + finalCaption;
      }

      let finalFirstComment = '';

      if (generated.ctaText && validLinks.length > 0) {
        // Force Caption placement for Free User
        if (ctaPlacement === 'caption' || isFreeTier) {
          finalCaption = `${finalCaption}\n\n${generated.ctaText}`;
        } else {
          finalFirstComment = generated.ctaText;
        }
      }

      setDraft({
        caption: finalCaption,
        firstComment: finalFirstComment,
        imagePrompt: generated.imagePrompt,
        videoPrompt: generated.videoPrompt
      });

    } catch (e: any) {
      console.error(e);
      alert(`生成草稿失敗：${e.message}\n請按 F12 檢查 Console 查看 API 狀態。`);
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
             setSelectedMediaType('image'); // Default to image on upload
        };
        reader.readAsDataURL(file);
    }
  };

  const handleGenerateMedia = async () => {
    if (!user || isGeneratingMedia) return;
    
    if (isFreeTier && !isDemoMode) {
        alert("免費版不支援 AI 圖片生成功能。\n請升級至 Starter (創作者版) 以上方案。");
        return;
    }

    // Determine cost
    const cost = 5; // Image cost

    // --- DEMO MODE LOGIC ---
    if (isDemoMode) {
        setIsGeneratingMedia(true);
        setMediaUrl(undefined);
        setTimeout(() => {
            setMediaUrl("https://placehold.co/1024x1024/2563eb/FFF?text=Demo+Image+Success");
            setIsGeneratingMedia(false);
        }, 1500);
        return;
    }

    // --- REAL MODE LOGIC ---
    if (!confirm(`確定生成圖片嗎？\n這將消耗 ${cost} 點配額。`)) return;

    const allowed = await checkAndUseQuota(user.user_id, cost);
    if (!allowed) {
        alert(`配額不足 (需要 ${cost} 點)。請升級方案，或開啟「Demo 模式」進行體驗。`);
        return;
    }
    onQuotaUpdate();

    setIsGeneratingMedia(true);
    
    try {
      const config = getSystemConfig();
      if (config.dryRunMode) {
          // Simulate media generation delay
          await new Promise(r => setTimeout(r, 2000));
          setMediaUrl("https://placehold.co/1024x1024?text=Dry+Run+Image");
          alert("[Dry Run] 模擬素材生成成功 (未呼叫真實 API)");
          setIsGeneratingMedia(false);
          return;
      }

      // Check if it's a regeneration (existing url) to modify prompt for variety
      const isRegeneration = !!mediaUrl;
      const variationSuffix = isRegeneration ? ` (Create a different variation, RandomSeed: ${Date.now()})` : '';

      const promptToSend = draft.imagePrompt + variationSuffix;
      const url = await generateImage(promptToSend);
      setMediaUrl(url);

    } catch (e: any) {
      console.error(e);
      let msg = e.message;
      if (msg.includes('429')) msg = "API 配額額滿 (429 Too Many Requests)。請稍後再試或使用 Demo 模式。";
      else if (msg.includes('404')) msg = "API 資源未找到 (404)。您的 Key 可能無權限使用此模型。";
      
      alert(`素材生成失敗: ${msg}`);
    } finally {
      setIsGeneratingMedia(false);
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
      createdAt: editPost ? editPost.createdAt : Date.now()
    };

    if (schedule) {
      onPostCreated(newPost);
      setPublishResult({ success: true, msg: "貼文排程更新成功！" });
    } else {
      let result;
      if (isDryRun) {
          await new Promise(r => setTimeout(r, 1000));
          console.log("[Demo/Dry Run] Publish Payload:", {
              pageId: settings.facebookPageId,
              caption: draft.caption,
              url: mediaUrl
          });
          result = { success: true, url: "https://facebook.com/demo-post-id" };
          alert(`[Demo/Dry Run] 模擬發文成功！\n此操作未真實上傳到 Facebook。\n\nPayload:\n${JSON.stringify({caption: draft.caption.substring(0, 50)+'...'}, null, 2)}`);
      } else {
          result = await publishPostToFacebook(
            settings.facebookPageId, 
            settings.facebookToken, 
            draft.caption, 
            mediaUrl,
            draft.firstComment
          );
      }
      
      if (result.success) {
        newPost.publishedUrl = result.url;
        newPost.status = 'published';
        onPostCreated(newPost);
        setPublishResult({ success: true, msg: `發佈成功！網址: ${result.url}` });
      } else {
        newPost.status = 'failed';
        newPost.errorLog = result.error;
        onPostCreated(newPost);
        setPublishResult({ success: false, msg: `發佈失敗: ${result.error}` });
      }
    }
    
    // Clear draft only if successful publish or scheduled
    if (schedule || newPost.status === 'published') {
        if (!editPost) {
            localStorage.removeItem(DRAFT_KEY); 
            resetToDefaults();
        }
    }
    setIsPublishing(false);
  };

  if (step === 1) {
      return (
          <div className="max-w-4xl mx-auto space-y-6 animate-fade-in relative">
               <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold mb-4">1. 設定貼文主題與參數</h2>
                    <div className="flex gap-2 items-center">
                        <label className="flex items-center gap-2 cursor-pointer bg-gray-800 border border-gray-600 px-3 py-1 rounded hover:bg-gray-700 transition-colors">
                            <input 
                                type="checkbox" 
                                checked={isDemoMode} 
                                onChange={(e) => setIsDemoMode(e.target.checked)} 
                                className="w-4 h-4 rounded text-primary focus:ring-primary bg-dark border-gray-500"
                            />
                            <span className="text-sm font-bold text-yellow-400">🧪 Demo 模式 (不扣配額)</span>
                        </label>
                        {hasLoadedDraft && <span className="text-xs text-green-400 animate-pulse">已恢復上次草稿</span>}
                        <button type="button" onClick={handleClearDraft} className="text-red-400 text-sm border border-red-900 bg-red-900/10 px-3 py-1 rounded hover:bg-red-900/40 transition-colors">🗑️ 清除重置</button>
                    </div>
               </div>
               
               <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
                  <div>
                      <label className="block text-sm text-gray-400 mb-1">貼文主題</label>
                      <input 
                        value={topic} 
                        onChange={e => { setTopic(e.target.value); setSelectedTopicData(null); }} 
                        className={`w-full bg-dark border-gray-600 rounded p-3 text-white outline-none transition-all duration-300 ${isInputHighlight ? 'ring-2 ring-yellow-500 shadow-lg shadow-yellow-500/20' : ''}`} 
                        placeholder="例如：母親節特賣活動、新產品上市..."
                      />
                  </div>
                  
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
                          <label className="block text-sm text-gray-400 mb-1">臨時 Hashtags (選填)</label>
                          <input 
                             value={tempHashtags}
                             onChange={e => setTempHashtags(e.target.value)}
                             placeholder="#活動限定 #快閃"
                             className="w-full bg-dark border border-gray-600 rounded p-3 text-white"
                          />
                      </div>
                  </div>

                  {/* CTA Section */}
                  <div>
                      <label className="block text-sm text-gray-400 mb-2">行動呼籲 (CTA) 連結</label>
                      <div className="space-y-2">
                          {ctaLinks.map((link, index) => (
                             <div key={index} className="flex gap-2">
                                <input 
                                  value={link}
                                  onChange={e => handleCtaLinkChange(index, e.target.value)}
                                  placeholder="https://example.com/product"
                                  className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white text-sm"
                                />
                                <button type="button" onClick={() => removeCtaLink(index)} className="text-red-400 px-2">×</button>
                             </div>
                          ))}
                          {ctaLinks.length < 5 && (
                             <button type="button" onClick={addCtaLink} className="text-sm text-blue-400 hover:text-blue-300">+ 新增連結</button>
                          )}
                      </div>
                      <div className="mt-4 flex gap-4 text-sm bg-dark/50 p-3 rounded border border-gray-800">
                          <label className="block text-gray-400 mr-2">CTA 顯示位置:</label>
                          <label className="flex items-center gap-1 text-gray-300 cursor-pointer">
                             <input type="radio" checked={ctaPlacement === 'caption'} onChange={() => setCtaPlacement('caption')} />
                             貼文內文
                          </label>
                          
                          {isFreeTier ? (
                              <label className="flex items-center gap-1 text-gray-500 cursor-not-allowed" title="需升級方案">
                                 <input type="radio" disabled />
                                 🔒 第一則留言 (免費版鎖定)
                              </label>
                          ) : (
                              <label className="flex items-center gap-1 text-gray-300 cursor-pointer">
                                 <input type="radio" checked={ctaPlacement === 'comment'} onChange={() => setCtaPlacement('comment')} />
                                 第一則留言
                              </label>
                          )}
                      </div>
                  </div>

                  <div className="pt-4 border-t border-gray-700">
                        <button 
                            type="button" 
                            disabled={!topic || isGeneratingDraft} 
                            onClick={handleNextToDraft} 
                            className={`w-full text-white py-3 rounded font-bold transition-all flex justify-center items-center gap-2 ${isDemoMode ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-primary hover:bg-blue-600 disabled:opacity-50'}`}
                        >
                            {isGeneratingDraft ? <div className="loader"></div> : null}
                            {isGeneratingDraft ? 'AI 撰寫中...' : isDemoMode ? '下一步：使用 Demo 模式生成 (不扣配額)' : '下一步：使用 AI 生成 (消耗 1 配額)'}
                        </button>
                  </div>
               </div>

               {/* Trending UI */}
               <div className="mt-8">
                   <div className="flex items-center justify-between mb-4">
                       <h3 className="text-lg font-semibold text-gray-400">🔥 趨勢靈感</h3>
                       <button 
                            type="button" 
                            onClick={loadTrending} 
                            disabled={isLoadingTopics}
                            className="bg-secondary px-4 py-2 rounded text-sm text-white border border-indigo-500 hover:bg-indigo-600 transition-colors flex items-center gap-2 disabled:opacity-70"
                        >
                            {isLoadingTopics ? <div className="loader w-3 h-3"></div> : null}
                            {isDemoMode ? '🔍 搜尋熱門話題 (Demo)' : '🔍 搜尋熱門話題 (消耗 1 配額)'}
                       </button>
                   </div>
                   {topicError && <div className="text-red-400 text-sm mb-2">{topicError}</div>}
                   {isLoadingTopics ? (
                       <div className="text-center py-8 text-primary animate-pulse flex flex-col items-center">
                           <div className="loader border-primary border-t-transparent w-8 h-8 mb-2"></div>
                           AI 正在搜尋分析中...
                       </div>
                    ) : (
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {trendingTopics.map((t, i) => (
                               <div key={i} onClick={() => handleTopicSelect(t)} className="p-4 rounded border border-gray-700 bg-card cursor-pointer hover:border-primary transition-colors hover:bg-gray-800">
                                   <h4 className="font-bold text-white mb-1">{t.title}</h4>
                                   <p className="text-sm text-gray-400 line-clamp-2">{t.description}</p>
                                   {t.url && <p className="text-xs text-blue-400 mt-2 truncate">🔗 {t.url}</p>}
                               </div>
                           ))}
                       </div>
                   )}
               </div>
          </div>
      )
  }

  // Step 2 & 3 Combined UI
  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in relative">
        <div className="space-y-6">
            <div className="bg-card p-6 rounded-xl border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-primary">編輯內容 {isDemoMode && <span className="text-xs bg-yellow-600 text-white px-2 py-1 rounded ml-2">Demo Mode</span>}</h3>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setStep(1)} disabled={isGeneratingMedia} className="text-xs text-gray-400 hover:text-white underline disabled:opacity-50">← 返回設定</button>
                        <button type="button" onClick={handleClearDraft} disabled={isGeneratingMedia} className="text-xs text-red-400 hover:text-red-300 border border-red-900 px-2 py-1 rounded disabled:opacity-50">清除</button>
                    </div>
                </div>
                
                {isGeneratingDraft ? <div className="py-20 text-center animate-pulse text-white">AI 正在撰寫文案中...</div> : (
                    <>
                    <div className="mb-4">
                        <label className="block text-sm text-gray-400 mb-1">貼文文案</label>
                        <textarea value={draft.caption} onChange={e => setDraft({...draft, caption: e.target.value})} className="w-full h-40 bg-dark border-gray-600 rounded p-3 text-white mb-2" />
                    </div>
                    
                    {ctaPlacement === 'comment' && !isFreeTier && (
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
                                {/* Video disabled temporarily due to API limitations and cost fairness */}
                                {/* 
                                <label className={`flex-1 border ${selectedMediaType==='video'?'border-purple-500 bg-purple-900/30 text-purple-200':'border-gray-600 text-gray-400'} rounded p-2 text-sm text-center cursor-pointer transition-colors ${isFreeTier && !isDemoMode ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    <input type="radio" className="hidden" checked={selectedMediaType==='video'} onChange={() => setSelectedMediaType('video')} disabled={isFreeTier && !isDemoMode} />
                                    🎥 AI 影片 (Veo) (20點)
                                </label>
                                */}
                            </div>
                            <textarea value={draft.imagePrompt} onChange={e => setDraft(prev => ({...prev, imagePrompt: e.target.value}))} className="w-full h-24 bg-dark border-gray-600 rounded p-3 text-white mb-2" placeholder="AI 提示詞..." />
                            
                            <button type="button" onClick={handleGenerateMedia} disabled={isGeneratingMedia} className={`w-full py-3 rounded font-bold text-white transition-all flex justify-center items-center gap-2 ${isDemoMode ? 'bg-yellow-600 hover:bg-yellow-500' : isFreeTier ? 'bg-gray-600 cursor-not-allowed opacity-50' : 'bg-secondary hover:bg-indigo-600'}`} title={isFreeTier ? '免費版不支援 AI 生成圖片' : ''}>
                                {isGeneratingMedia ? <div className="loader"></div> : null}
                                {isGeneratingMedia ? 'AI 生成素材中 (請勿關閉)...' : isDemoMode ? `產生 Demo 素材` : isFreeTier ? '🔒 升級解鎖素材生成' : `生成圖片 (扣5點)`}
                            </button>
                            
                            {mediaUrl && (
                                <button type="button" onClick={handleGenerateMedia} disabled={isGeneratingMedia} className="w-full mt-2 border border-yellow-600 hover:bg-yellow-900/30 py-2 rounded text-yellow-500 text-sm font-bold transition-colors flex justify-center items-center gap-2">
                                    {isGeneratingMedia ? <div className="loader w-3 h-3"></div> : '🔄'} 不滿意？{isDemoMode ? '重新生成 (Demo)' : `重新生成 (扣5點)`}
                                </button>
                            )}
                        </>
                    ) : (
                        <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-600 hover:border-primary rounded p-8 text-center cursor-pointer transition-colors">
                            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept="image/*" />
                            <p className="text-gray-400">點擊上傳圖片</p>
                        </div>
                    )}
                    </>
                )}
            </div>
        </div>

        <div className="bg-card p-6 rounded-xl border border-gray-700 flex flex-col h-full">
            <h3 className="text-xl font-bold mb-4 text-primary">預覽與發佈</h3>
            <div className="bg-white text-black rounded p-4 flex-1 mb-4 flex flex-col shadow-inner">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
                    <div>
                        <div className="font-bold text-sm">AutoSocial {isDemoMode ? 'Demo' : ''} Brand</div>
                        <div className="text-xs text-gray-500">Just now · 🌎</div>
                    </div>
                </div>
                <div className="whitespace-pre-wrap mb-4 text-sm leading-relaxed">{draft.caption}</div>
                <div className="bg-gray-100 min-h-[250px] flex items-center justify-center rounded overflow-hidden relative">
                    {mediaUrl ? (
                        <>
                            <img src={mediaUrl} className="max-w-full max-h-[400px] object-cover" alt="Post Media" />
                            {/* Demo Warning Overlay */}
                            {(isPlaceholderMedia || isDemoMode) && (
                                <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded shadow-md z-10 flex items-center gap-1">
                                    {isDemoMode ? '🧪 Demo Mode' : '⚠️ 替代素材 (配額額滿)'}
                                </div>
                            )}
                        </>
                    ) : (
                        <span className="text-gray-400">素材預覽區</span>
                    )}
                </div>
                {ctaPlacement === 'comment' && draft.firstComment && (
                    <div className="mt-4 pt-2 border-t border-gray-200">
                        <p className="text-xs font-bold text-gray-600 mb-1">留言</p>
                        <div className="bg-gray-100 p-2 rounded text-sm">
                            <span className="font-bold mr-1">AutoSocial</span>
                            {draft.firstComment}
                        </div>
                    </div>
                )}
            </div>
            
            {publishResult ? <div className={`p-4 rounded text-center font-bold ${publishResult.success ? 'bg-green-900/50 text-green-200 border border-green-700' : 'bg-red-900/50 text-red-200 border border-red-700'}`}>{publishResult.msg}</div> : (
                <div className="space-y-4">
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
                            disabled={!scheduleDate || !isStarterPlus || isPublishing} 
                            className="flex-1 border border-primary text-primary hover:bg-primary/10 py-3 rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                            title={!isStarterPlus ? "免費版不支援排程功能" : ""}
                        >
                            {isPublishing ? <div className="loader border-primary border-t-transparent"></div> : null}
                            {!isStarterPlus ? "排程 (鎖定)" : "加入排程"}
                        </button>
                        <button 
                            type="button" 
                            onClick={() => handleFinalize(false)} 
                            disabled={isPublishing}
                            className={`flex-1 text-white py-3 rounded font-bold shadow-lg flex justify-center items-center gap-2 ${isDemoMode ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-primary hover:bg-blue-600 disabled:opacity-70'}`}
                        >
                            {isPublishing ? <div className="loader"></div> : null}
                            {isPublishing ? '發佈中...' : isDemoMode ? '模擬發佈' : '立即發佈'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
