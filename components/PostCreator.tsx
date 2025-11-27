

import React, { useState, useEffect, useRef } from 'react';
import { BrandSettings, Post, TrendingTopic, UserProfile } from '../types';
import { getTrendingTopics, generatePostDraft, generateImage, generateVideo } from '../services/geminiService';
import { publishPostToFacebook } from '../services/facebookService';
import { checkAndUseQuota, getSystemConfig } from '../services/authService';

interface Props {
  settings: BrandSettings;
  user: UserProfile | null;
  onPostCreated: (post: Post) => void;
  onQuotaUpdate: () => void;
  editPost?: Post | null;
}

const DRAFT_KEY = 'autosocial_post_draft';

export const PostCreator: React.FC<Props> = ({ settings, user, onPostCreated, onQuotaUpdate, editPost }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [topic, setTopic] = useState('');
  
  // Feature Locks for Basic User
  const isBasicUser = user?.role === 'user';

  // Options State
  const [captionLength, setCaptionLength] = useState<string>('150-300字');
  const [ctaLinks, setCtaLinks] = useState<string[]>(['']);
  const [ctaPlacement, setCtaPlacement] = useState<'caption' | 'comment'>('caption');
  const [tempHashtags, setTempHashtags] = useState<string>('');

  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  
  const [draft, setDraft] = useState({ caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  
  const [mediaSource, setMediaSource] = useState<'ai' | 'upload'>('ai');
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video'>('image');
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [scheduleDate, setScheduleDate] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{success: boolean, msg: string} | null>(null);
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);

  // 1. Initialize from editPost (Priority 1) or LocalStorage Draft (Priority 2)
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
    } else {
        // Load Draft logic
        const savedDraft = localStorage.getItem(DRAFT_KEY);
        if (savedDraft) {
            try {
                const parsed = JSON.parse(savedDraft);
                setStep(parsed.step || 1);
                setTopic(parsed.topic || '');
                setCaptionLength(parsed.captionLength || '150-300字');
                setCtaLinks(parsed.ctaLinks || ['']);
                setCtaPlacement(parsed.ctaPlacement || 'caption');
                setTempHashtags(parsed.tempHashtags || '');
                setDraft(parsed.draft || { caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
                setMediaUrl(parsed.mediaUrl);
                setMediaSource(parsed.mediaSource || 'ai');
                setSelectedMediaType(parsed.selectedMediaType || 'image');
                setScheduleDate(parsed.scheduleDate || '');
                setHasLoadedDraft(true);
            } catch (e) {
                console.error("Failed to load draft", e);
            }
        }
    }
  }, [editPost]);

  // 2. Auto-Save Draft
  useEffect(() => {
      // Don't save if we are editing an existing scheduled post, or if no topic is entered yet
      if (editPost || (!topic && step === 1)) return;

      const stateToSave = {
          step,
          topic,
          captionLength,
          ctaLinks,
          ctaPlacement,
          tempHashtags,
          draft,
          mediaUrl,
          mediaSource,
          selectedMediaType,
          scheduleDate
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(stateToSave));
  }, [step, topic, captionLength, ctaLinks, ctaPlacement, tempHashtags, draft, mediaUrl, mediaSource, selectedMediaType, scheduleDate, editPost]);

  const handleClearDraft = () => {
      if (confirm("確定要清除所有編輯進度嗎？此動作將同時清除暫存草稿，且無法復原。")) {
          localStorage.removeItem(DRAFT_KEY);
          setStep(1);
          setTopic('');
          setCaptionLength('150-300字');
          setCtaLinks(['']);
          setCtaPlacement('caption');
          setTempHashtags('');
          setDraft({ caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
          setMediaUrl(undefined);
          setMediaSource('ai');
          setScheduleDate('');
          setPublishResult(null);
          setHasLoadedDraft(false);
      }
  };

  const loadTrending = async () => {
    setIsLoadingTopics(true);
    // Use service which handles keys internally
    const topics = await getTrendingTopics(settings.industry);
    setTrendingTopics(topics);
    setIsLoadingTopics(false);
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
    if (!topic) return;
    if (!user) return;
    
    // Quota Check
    const allowed = await checkAndUseQuota(user.user_id);
    if (!allowed) {
        alert("⚠️ 您的 AI 使用配額已額滿，請升級方案或聯絡管理員。");
        return;
    }
    
    // Refresh user quota display
    onQuotaUpdate();

    setStep(2);
    setIsGeneratingDraft(true);
    try {
      const validLinks = ctaLinks.filter(l => l.trim() !== '');

      // Force Standard length for Basic User
      const finalLength = isBasicUser ? '150-300字' : captionLength;

      const generated = await generatePostDraft(topic, settings, {
          length: finalLength,
          ctaLinks: validLinks,
          tempHashtags
      });

      let finalCaption = generated.caption;
      const config = getSystemConfig();
      if (config.dryRunMode) {
          finalCaption = "[Demo] " + finalCaption;
      }

      let finalFirstComment = '';

      if (generated.ctaText && validLinks.length > 0) {
        // Force Caption placement for Basic User
        if (ctaPlacement === 'caption' || isBasicUser) {
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

    } catch (e) {
      console.error(e);
      alert("生成草稿失敗，請稍後再試。");
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
             if (file.type.startsWith('video')) {
                 setSelectedMediaType('video');
             } else {
                 setSelectedMediaType('image');
             }
        };
        reader.readAsDataURL(file);
    }
  };

  const handleGenerateMedia = async () => {
    if (!user) return;
    const allowed = await checkAndUseQuota(user.user_id);
    if (!allowed) {
        alert("配額不足");
        return;
    }
    onQuotaUpdate();

    setIsGeneratingMedia(true);
    setMediaUrl(undefined);
    try {
      const config = getSystemConfig();
      if (config.dryRunMode) {
          // Simulate media generation delay
          await new Promise(r => setTimeout(r, 2000));
          if (selectedMediaType === 'image') {
              setMediaUrl("https://placehold.co/1024x1024?text=Demo+Image");
          } else {
              setMediaUrl("https://placehold.co/1280x720.mp4?text=Demo+Video"); // Fake video url
          }
          alert("[Dry Run] 模擬素材生成成功 (未呼叫真實 API)");
          setIsGeneratingMedia(false);
          return;
      }

      if (selectedMediaType === 'image') {
        const url = await generateImage(draft.imagePrompt);
        setMediaUrl(url);
      } else {
        const aiStudio = (window as any).aistudio;
        if (aiStudio && await aiStudio.hasSelectedApiKey()) {
             // Browser-injected key flow for Veo
             const url = await generateVideo(draft.videoPrompt);
             setMediaUrl(url);
        } else {
             // Backend/Env flow
             const url = await generateVideo(draft.videoPrompt);
             setMediaUrl(url);
        }
      }
    } catch (e: any) {
      console.error(e);
      alert(`素材生成失敗: ${e.message}`);
    } finally {
      setIsGeneratingMedia(false);
    }
  };

  const handleFinalize = async (schedule: boolean) => {
    if (!user) return;
    setIsPublishing(true);
    
    const config = getSystemConfig();
    const isDryRun = config.dryRunMode;

    const newPost: Post = {
      id: editPost ? editPost.id : Date.now().toString(),
      userId: user.user_id,
      topic,
      caption: draft.caption,
      firstComment: draft.firstComment,
      mediaPrompt: mediaSource === 'ai' ? (selectedMediaType === 'image' ? draft.imagePrompt : draft.videoPrompt) : 'Manual Upload',
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
          // Simulate Publish
          await new Promise(r => setTimeout(r, 1000));
          console.log("[Dry Run] Publish Payload:", {
              pageId: settings.facebookPageId,
              caption: draft.caption,
              url: mediaUrl
          });
          result = { success: true, url: "https://facebook.com/demo-post-id" };
          alert(`[Dry Run] 模擬發文成功！\n此操作未真實上傳到 Facebook。\n\nPayload:\n${JSON.stringify({caption: draft.caption.substring(0, 50)+'...'}, null, 2)}`);
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
            localStorage.removeItem(DRAFT_KEY); // Clear draft storage
            setStep(1);
            setTopic('');
            setDraft({ caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
            setCtaLinks(['']);
            setMediaUrl(undefined);
            setScheduleDate('');
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
                        {hasLoadedDraft && <span className="text-xs text-green-400 animate-pulse">已恢復上次草稿</span>}
                        <button onClick={handleClearDraft} className="text-red-400 text-sm border border-red-900 bg-red-900/10 px-3 py-1 rounded hover:bg-red-900/40 transition-colors">🗑️ 清除重置</button>
                    </div>
               </div>
               
               <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
                  <div>
                      <label className="block text-sm text-gray-400 mb-1">貼文主題</label>
                      <input 
                        value={topic} 
                        onChange={e => setTopic(e.target.value)} 
                        className="w-full bg-dark border-gray-600 rounded p-3 text-white outline-none" 
                        placeholder="例如：母親節特賣活動、新產品上市..."
                      />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                          <label className="block text-sm text-gray-400 mb-1">文案長度</label>
                          {isBasicUser ? (
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
                                <button onClick={() => removeCtaLink(index)} className="text-red-400 px-2">×</button>
                             </div>
                          ))}
                          {ctaLinks.length < 5 && (
                             <button onClick={addCtaLink} className="text-sm text-blue-400 hover:text-blue-300">+ 新增連結</button>
                          )}
                      </div>
                      <div className="mt-4 flex gap-4 text-sm bg-dark/50 p-3 rounded border border-gray-800">
                          <label className="block text-gray-400 mr-2">CTA 顯示位置:</label>
                          <label className="flex items-center gap-1 text-gray-300 cursor-pointer">
                             <input type="radio" checked={ctaPlacement === 'caption'} onChange={() => setCtaPlacement('caption')} />
                             貼文內文
                          </label>
                          
                          {isBasicUser ? (
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
                        <button disabled={!topic} onClick={handleNextToDraft} className="w-full bg-primary disabled:opacity-50 hover:bg-blue-600 text-white py-3 rounded font-bold transition-all">
                            下一步：使用 AI 生成 (消耗 1 配額)
                        </button>
                  </div>
               </div>

               {/* Trending UI */}
               <div className="mt-8">
                   <div className="flex items-center justify-between mb-4">
                       <h3 className="text-lg font-semibold text-gray-400">🔥 趨勢靈感</h3>
                       <button onClick={loadTrending} className="bg-secondary px-4 py-2 rounded text-sm text-white">🔍 搜尋熱門話題</button>
                   </div>
                   {isLoadingTopics ? <div className="text-center text-primary">AI 正在搜尋分析中...</div> : (
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {trendingTopics.map((t, i) => (
                               <div key={i} onClick={() => setTopic(t.title)} className="p-4 rounded border border-gray-700 bg-card cursor-pointer hover:border-primary transition-colors">
                                   <h4 className="font-bold text-white">{t.title}</h4>
                                   <p className="text-sm text-gray-400 mt-1">{t.description}</p>
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
                    <h3 className="text-xl font-bold text-primary">編輯內容</h3>
                    <div className="flex gap-2">
                        <button onClick={() => setStep(1)} className="text-xs text-gray-400 hover:text-white underline">← 返回設定</button>
                        <button onClick={handleClearDraft} className="text-xs text-red-400 hover:text-red-300 border border-red-900 px-2 py-1 rounded">清除</button>
                    </div>
                </div>
                
                {isGeneratingDraft ? <div className="py-20 text-center animate-pulse text-white">AI 正在撰寫文案中...</div> : (
                    <>
                    <div className="mb-4">
                        <label className="block text-sm text-gray-400 mb-1">貼文文案</label>
                        <textarea value={draft.caption} onChange={e => setDraft({...draft, caption: e.target.value})} className="w-full h-40 bg-dark border-gray-600 rounded p-3 text-white mb-2" />
                    </div>
                    
                    {ctaPlacement === 'comment' && !isBasicUser && (
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
                                <button onClick={() => setSelectedMediaType('image')} className={`flex-1 py-1 rounded text-sm ${selectedMediaType === 'image' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>圖片 (Gemini 3 Pro)</button>
                                <button onClick={() => setSelectedMediaType('video')} className={`flex-1 py-1 rounded text-sm ${selectedMediaType === 'video' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>影片 (Veo 3.1)</button>
                            </div>
                            <textarea value={selectedMediaType === 'image' ? draft.imagePrompt : draft.videoPrompt} onChange={e => setDraft(prev => ({...prev, [selectedMediaType === 'image' ? 'imagePrompt' : 'videoPrompt']: e.target.value}))} className="w-full h-24 bg-dark border-gray-600 rounded p-3 text-white mb-2" placeholder="AI 提示詞..." />
                            
                            <button onClick={handleGenerateMedia} disabled={isGeneratingMedia} className="w-full bg-secondary hover:bg-indigo-600 py-3 rounded font-bold text-white transition-all">
                                {isGeneratingMedia ? 'AI 生成素材中...' : `生成${selectedMediaType === 'image' ? '圖片' : '影片'} (消耗 1 配額)`}
                            </button>
                            
                            {mediaUrl && (
                                <button onClick={handleGenerateMedia} disabled={isGeneratingMedia} className="w-full mt-2 border border-gray-600 hover:bg-gray-700 py-2 rounded text-gray-300 text-sm">
                                    🔄 不滿意？重新生成 (消耗 1 配額)
                                </button>
                            )}
                        </>
                    ) : (
                        <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-600 hover:border-primary rounded p-8 text-center cursor-pointer transition-colors">
                            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept="image/*,video/*" />
                            <p className="text-gray-400">點擊上傳圖片或影片</p>
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
                        <div className="font-bold text-sm">AutoSocial Demo Brand</div>
                        <div className="text-xs text-gray-500">Just now · 🌎</div>
                    </div>
                </div>
                <div className="whitespace-pre-wrap mb-4 text-sm leading-relaxed">{draft.caption}</div>
                <div className="bg-gray-100 min-h-[250px] flex items-center justify-center rounded overflow-hidden">
                    {mediaUrl ? (
                        selectedMediaType === 'image' || mediaSource === 'upload' ? 
                        <img src={mediaUrl} className="max-w-full max-h-[400px] object-cover" /> :
                        <video src={mediaUrl} controls className="max-w-full max-h-[400px]" />
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
                    {!isBasicUser && (
                        <div className="bg-dark p-3 rounded border border-gray-600">
                            <label className="block text-xs text-gray-400 mb-1">預約發佈時間 (選填)</label>
                            <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full bg-transparent text-white outline-none" />
                        </div>
                    )}
                    <div className="flex gap-4">
                        <button 
                            onClick={() => handleFinalize(true)} 
                            disabled={!scheduleDate || isBasicUser} 
                            className="flex-1 border border-primary text-primary hover:bg-primary/10 py-3 rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                            title={isBasicUser ? "免費版不支援排程功能" : ""}
                        >
                            {isBasicUser ? "排程 (鎖定)" : "加入排程"}
                        </button>
                        <button onClick={() => handleFinalize(false)} className="flex-1 bg-primary hover:bg-blue-600 text-white py-3 rounded font-bold shadow-lg">立即發佈</button>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};