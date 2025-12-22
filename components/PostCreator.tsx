import React, { useState, useEffect, useRef } from 'react';
import { BrandSettings, Post, TrendingTopic, UserProfile, CtaItem, ViralType, ViralPlatform, TitleScore } from '../types';
import { getTrendingTopics, generatePostDraft, generateImage, generateVideo, applyWatermark, generateViralContent, generateViralTitles, scoreViralTitles, applyTextOverlay } from '../services/geminiService';
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

export const PostCreator: React.FC<Props> = ({ settings: initialSettings, user, onPostCreated, onQuotaUpdate, editPost, onCancel }) => {
  const [currentSettings, setCurrentSettings] = useState<BrandSettings>(initialSettings);
  const [brandProfiles, setBrandProfiles] = useState<{id: string, name: string, settings: BrandSettings}[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('default');

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [topic, setTopic] = useState('');
  const [postMode, setPostMode] = useState<'standard' | 'viral'>('standard');
  const [selectedTopicData, setSelectedTopicData] = useState<TrendingTopic | null>(null);

  const role = user?.role || 'user';
  const isFreeTier = role === 'user';
  const isStarterPlus = ['starter', 'pro', 'business', 'admin'].includes(role);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [captionLength, setCaptionLength] = useState<string>('150-300字');
  const [ctaList, setCtaList] = useState<CtaItem[]>([{ text: '👉 點擊了解', url: '' }]);
  const [ctaPlacement, setCtaPlacement] = useState<'caption' | 'comment'>('caption');
  const [includeEngagement, setIncludeEngagement] = useState(false);
  const [imageText, setImageText] = useState('');
  const [tempHashtags, setTempHashtags] = useState<string>('');

  const [viralType, setViralType] = useState<ViralType>('regret');
  const [viralPlatform, setViralPlatform] = useState<ViralPlatform>('facebook');
  const [targetAudience, setTargetAudience] = useState('');
  const [titleCandidates, setTitleCandidates] = useState<TitleScore[]>([]);
  const [isScoringTitles, setIsScoringTitles] = useState(false);
  const [selectedViralVersion, setSelectedViralVersion] = useState<number>(0);
  const [viralDrafts, setViralDrafts] = useState<string[]>([]);

  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [topicError, setTopicError] = useState('');
  
  const [draft, setDraft] = useState({ caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  
  const [mediaSource, setMediaSource] = useState<'ai' | 'upload'>('ai');
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video'>('image'); 
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [scheduleDate, setScheduleDate] = useState('');
  const [syncInstagram, setSyncInstagram] = useState(false);
  
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{success: boolean, msg: string} | null>(null);
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);
  const [isInputHighlight, setIsInputHighlight] = useState(false);
  const [isApplyingWatermark, setIsApplyingWatermark] = useState(false);

  useEffect(() => {
      const savedProfiles = localStorage.getItem('autosocial_brand_profiles');
      if (savedProfiles) {
          const parsed = JSON.parse(savedProfiles);
          setBrandProfiles(parsed);
          const lastId = localStorage.getItem('autosocial_last_profile_id');
          if (lastId && parsed.find((p: any) => p.id === lastId)) {
              setSelectedProfileId(lastId);
              const target = parsed.find((p: any) => p.id === lastId);
              if (target) setCurrentSettings(target.settings);
          } else if (parsed.length > 0) {
              setSelectedProfileId(parsed[0].id);
              setCurrentSettings(parsed[0].settings);
          }
      }
  }, []);

  const handleProfileSwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newId = e.target.value;
      setSelectedProfileId(newId);
      const target = brandProfiles.find(p => p.id === newId);
      if (target) {
          setCurrentSettings(target.settings);
          localStorage.setItem('autosocial_last_profile_id', newId);
      }
  };

  const resetToDefaults = () => {
    setStep(1); setTopic(''); setSelectedTopicData(null); setPostMode('standard'); setCaptionLength('150-300字');
    setCtaList([{ text: '👉 點擊了解', url: '' }]); setCtaPlacement('caption'); setTempHashtags('');
    setIncludeEngagement(false); setImageText(''); setViralType('regret'); setViralPlatform('facebook');
    setTargetAudience(''); setTitleCandidates([]); setViralDrafts([]);
    setDraft({ caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
    setMediaUrl(undefined); setMediaSource('ai'); setSelectedMediaType('image');
    setScheduleDate(''); setSyncInstagram(false); setPublishResult(null);
    setHasLoadedDraft(false); setIsDemoMode(false); setTrendingTopics([]); setTopicError('');
    setIsGeneratingDraft(false); setIsGeneratingMedia(false); setIsInputHighlight(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (editPost) {
        setStep(2); setTopic(editPost.topic);
        setDraft({ caption: editPost.caption, firstComment: editPost.firstComment || '', imagePrompt: editPost.mediaPrompt, videoPrompt: editPost.mediaPrompt });
        setMediaUrl(editPost.mediaUrl); setScheduleDate(editPost.scheduledDate || ''); setSyncInstagram(!!editPost.syncInstagram);
    } else {
        const savedDraft = localStorage.getItem(DRAFT_KEY);
        if (savedDraft) {
            try {
                const parsed = JSON.parse(savedDraft);
                setStep(parsed.step || 1); setTopic(parsed.topic || ''); setPostMode(parsed.postMode || 'standard');
                setSelectedTopicData(parsed.selectedTopicData || null); setCaptionLength(parsed.captionLength || '150-300字');
                setCtaList(parsed.ctaList || [{ text: '👉 點擊了解', url: '' }]); setCtaPlacement(parsed.ctaPlacement || 'caption');
                setTempHashtags(parsed.tempHashtags || ''); setIncludeEngagement(parsed.includeEngagement || false);
                setImageText(parsed.imageText || ''); setViralType(parsed.viralType || 'regret');
                setViralPlatform(parsed.viralPlatform || 'facebook'); setTargetAudience(parsed.targetAudience || '');
                setTitleCandidates(parsed.titleCandidates || []); setViralDrafts(parsed.viralDrafts || []);
                setDraft(parsed.draft || { caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
                setMediaUrl(parsed.mediaUrl); setMediaSource(parsed.mediaSource || 'ai'); setSelectedMediaType(parsed.selectedMediaType || 'image'); 
                setScheduleDate(parsed.scheduleDate || ''); setSyncInstagram(parsed.syncInstagram || false);
                setIsDemoMode(parsed.isDemoMode || false); setHasLoadedDraft(true);
            } catch (e) { resetToDefaults(); }
        } else { resetToDefaults(); }
    }
  }, [editPost]);

  useEffect(() => {
      if (!topic && step === 1) return;
      if (editPost) return;
      const stateToSave = { step, topic, postMode, selectedTopicData, captionLength, ctaList, ctaPlacement, tempHashtags, includeEngagement, imageText, viralType, viralPlatform, targetAudience, titleCandidates, viralDrafts, draft, mediaUrl, mediaSource, selectedMediaType, scheduleDate, syncInstagram, isDemoMode };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(stateToSave));
  }, [step, topic, postMode, selectedTopicData, captionLength, ctaList, ctaPlacement, tempHashtags, includeEngagement, imageText, viralType, viralPlatform, targetAudience, titleCandidates, viralDrafts, draft, mediaUrl, mediaSource, selectedMediaType, scheduleDate, syncInstagram, editPost, isDemoMode]);

  const handleClearDraft = (e?: React.MouseEvent) => {
      if (e) e.preventDefault(); 
      if (confirm("確定要清除所有編輯進度嗎？此動作將同時清除暫存草稿，且無法復原。")) {
          localStorage.removeItem(DRAFT_KEY); resetToDefaults(); if (onCancel) onCancel();
      }
  };

  const loadTrending = async () => {
    if (!user || isLoadingTopics) return;
    if (!isDemoMode) {
        const allowed = await checkAndUseQuota(user.user_id, 1);
        if (!allowed) { setTopicError('⚠️ 配額不足'); return; }
        onQuotaUpdate();
    }
    setIsLoadingTopics(true); setTopicError('');
    try {
      const topics = await getTrendingTopics(currentSettings.industry || "台灣熱門時事");
      setTrendingTopics(topics);
      if (topics.length === 0) setTopicError('找不到話題');
    } catch (e: any) { setTopicError(`搜尋失敗: ${e.message}`); }
    finally { setIsLoadingTopics(false); }
  };

  const handleTopicSelect = (t: TrendingTopic) => { setTopic(t.title); setSelectedTopicData(t); window.scrollTo({ top: 0, behavior: 'smooth' }); setIsInputHighlight(true); };

  const handleCtaChange = (index: number, field: 'text' | 'url', value: string) => { const newList = [...ctaList]; newList[index] = { ...newList[index], [field]: value }; setCtaList(newList); };
  const addCtaItem = () => { if (ctaList.length < 5) setCtaList([...ctaList, { text: '👉 點擊了解', url: '' }]); };
  const removeCtaItem = (index: number) => { if (ctaList.length > 1) setCtaList(ctaList.filter((_, i) => i !== index)); else setCtaList([{ text: '👉 點擊了解', url: '' }]); };

  const handleScoreTitles = async () => {
      if (!user || !topic || isScoringTitles) return;
      const allowed = await checkAndUseQuota(user.user_id, 1);
      if (!allowed) return alert(`配額不足`);
      onQuotaUpdate();
      setIsScoringTitles(true);
      try {
          const generatedTitles = await generateViralTitles(topic, { audience: targetAudience || '大眾', viralType: viralType });
          const titlesToScore = [...new Set([topic, ...generatedTitles])].slice(0, 5);
          const scores = await scoreViralTitles(titlesToScore);
          setTitleCandidates(scores);
      } catch (e: any) { alert(`評分失敗: ${e.message}`); }
      finally { setIsScoringTitles(false); }
  };

  const handleSelectTitleAndGenerate = async (selectedTitle: string) => { setTopic(selectedTitle); await handleNextToDraft(selectedTitle); };

  const handleNextToDraft = async (overrideTopic?: string) => {
    const effectiveTopic = overrideTopic || topic;
    if (!effectiveTopic || isGeneratingDraft || !user) return;
    if (isDemoMode) {
        setStep(2); setIsGeneratingDraft(true);
        setTimeout(() => { setDraft({ caption: 'Demo Caption...', firstComment: 'Demo Comment', imagePrompt: 'Demo Prompt', videoPrompt: 'Demo Video' }); setIsGeneratingDraft(false); }, 1500);
        return;
    }
    const cost = postMode === 'viral' ? 5 : 2;
    const allowed = await checkAndUseQuota(user.user_id, cost);
    if (!allowed) { alert(`⚠️ 配額不足 (需 ${cost} 點)`); return; }
    onQuotaUpdate(); setStep(2); setIsGeneratingDraft(true);
    try {
      if (postMode === 'viral') {
          const viralRes = await generateViralContent(effectiveTopic, { audience: targetAudience || 'General', viralType, platform: viralPlatform, versionCount: ['pro', 'business', 'admin'].includes(user.role) ? 2 : 1 }, currentSettings);
          setViralDrafts(viralRes.versions); setDraft({ caption: viralRes.versions[0], firstComment: (ctaList[0].url ? `${ctaList[0].text}: ${ctaList[0].url}` : ''), imagePrompt: viralRes.imagePrompt, videoPrompt: viralRes.imagePrompt });
      } else {
          const generated = await generatePostDraft(effectiveTopic, currentSettings, { length: isFreeTier ? '150-300字' : captionLength, ctaList: ctaList.filter(l => l.url.trim() !== ''), tempHashtags: '', includeEngagement, imageText }, selectedTopicData || undefined, user.role);
          let finalCaption = generated.caption; let finalFirstComment = '';
          if (generated.ctaText && ctaList.some(l => l.url)) {
            if (ctaPlacement === 'caption' || isFreeTier) finalCaption += `\n\n${generated.ctaText}`;
            else finalFirstComment = generated.ctaText;
          }
          setDraft({ caption: finalCaption, firstComment: finalFirstComment, imagePrompt: generated.imagePrompt, videoPrompt: generated.videoPrompt });
      }
      logUserActivity({ uid: user.user_id, act: postMode === 'viral' ? 'viral' : 'draft', topic: effectiveTopic, prmt: postMode === 'viral' ? `Viral: ${viralType}` : `Len: ${captionLength}`, res: '', params: '' });
    } catch (e: any) { alert(`生成失敗: ${e.message}`); setStep(1); }
    finally { setIsGeneratingDraft(false); }
  };

  const handleGenerateMedia = async () => {
    if (!user || isGeneratingMedia) return;
    const cost = selectedMediaType === 'video' ? 20 : 5; 
    if (isDemoMode) {
        setIsGeneratingMedia(true); setMediaUrl(undefined);
        setTimeout(() => { setMediaUrl("https://placehold.co/1024x1024/2563eb/FFF?text=Demo"); setIsGeneratingMedia(false); }, 1500);
        return;
    }
    if (!confirm(`確定生成嗎？將消耗 ${cost} 點。`)) return;
    const allowed = await checkAndUseQuota(user.user_id, cost);
    if (!allowed) { alert(`配額不足`); return; }
    onQuotaUpdate(); setMediaUrl(undefined); setIsGeneratingMedia(true);
    try {
      const config = getSystemConfig();
      if (config.dryRunMode) { await new Promise(r => setTimeout(r, 2000)); setMediaUrl("https://placehold.co/1024x1024?text=Dry+Run"); return; }
      let url = '';
      if (selectedMediaType === 'video') url = await generateVideo(draft.videoPrompt || draft.imagePrompt);
      else {
          url = await generateImage(draft.imagePrompt + ` (seed: ${Date.now()})`, user.role, (postMode === 'viral' && viralPlatform === 'xhs' ? "Xiaohongshu note style" : currentSettings.brandStylePrompt));
          if (imageText.trim()) url = await applyTextOverlay(url, imageText);
          if (currentSettings.logoUrl && postMode !== 'viral') url = await applyWatermark(url, currentSettings.logoUrl);
      }
      setMediaUrl(url);
    } catch (e: any) { alert(`素材失敗: ${e.message}`); }
    finally { setIsGeneratingMedia(false); }
  };

  const handleApplyWatermark = async () => {
      if (!mediaUrl || !currentSettings.logoUrl) return;
      setIsApplyingWatermark(true);
      try { const newUrl = await applyWatermark(mediaUrl, currentSettings.logoUrl); setMediaUrl(newUrl); }
      catch (e: any) { alert(`合成失敗: ${e.message}`); }
      finally { setIsApplyingWatermark(false); }
  };

  const handleFinalize = async (schedule: boolean) => {
    if (!user || isPublishing) return;
    setIsPublishing(true);
    
    try {
        const config = getSystemConfig();
        const isDryRun = config.dryRunMode || isDemoMode; 

        const newPost: Post = {
          id: editPost ? editPost.id : Date.now().toString(),
          userId: user.user_id, topic: topic + (isDemoMode ? " (Demo)" : ""),
          caption: draft.caption, firstComment: draft.firstComment,
          mediaPrompt: mediaSource === 'ai' ? draft.imagePrompt : 'Upload',
          mediaType: selectedMediaType === 'video' ? 'video' : 'image',
          mediaUrl, status: schedule ? 'scheduled' : 'published',
          scheduledDate: schedule ? scheduleDate : undefined, syncInstagram,
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
          } else {
              result = await publishPostToFacebook(currentSettings.facebookPageId, currentSettings.facebookToken, draft.caption, mediaUrl, draft.firstComment, syncInstagram);
          }
          
          if (result.success) {
            newPost.publishedUrl = result.url; newPost.status = 'published';
            onPostCreated(newPost);
            setPublishResult({ success: true, msg: `發佈成功！${result.error || ''}` });
          } else {
            newPost.status = 'failed'; newPost.errorLog = result.error;
            onPostCreated(newPost);
            setPublishResult({ success: false, msg: `發佈失敗: ${result.error}` });
          }
        }
        
        if (schedule || newPost.status === 'published') {
            if (!editPost) localStorage.removeItem(DRAFT_KEY);
        }
    } catch (err: any) {
        setPublishResult({ success: false, msg: `系統錯誤: ${err.message}` });
    } finally {
        setIsPublishing(false);
    }
  };

  if (isLoadingTopics) return <LoadingOverlay message="AI 正在搜尋熱門話題" />;
  if (isScoringTitles) return <LoadingOverlay message="AI 正在構思爆款標題" />;
  if (isGeneratingDraft) return <LoadingOverlay message="AI 正在撰寫文案" />;
  if (isGeneratingMedia) return <LoadingOverlay message="AI 正在生成多媒體素材" detail={selectedMediaType === 'video' ? "正在調用 Veo 模型..." : "正在調用繪圖模型..."} />;
  if (isPublishing) return <LoadingOverlay message="正在發佈貼文" />;

  if (step === 1) {
      return (
          <div className="max-w-4xl mx-auto space-y-6 animate-fade-in relative">
               <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold mb-4">1. 設定貼文主題與模式</h2>
                    <div className="flex gap-2 items-center">
                        <label className="flex items-center gap-2 cursor-pointer bg-gray-800 border border-gray-600 px-3 py-1 rounded hover:bg-gray-700">
                            <input type="checkbox" checked={isDemoMode} onChange={(e) => setIsDemoMode(e.target.checked)} />
                            <span className="text-sm font-bold text-yellow-400">🧪 Demo</span>
                        </label>
                        <button type="button" onClick={handleClearDraft} className="text-red-400 text-sm border border-red-900 px-3 py-1 rounded">🗑️ 清除</button>
                    </div>
               </div>
               {brandProfiles.length > 0 && (
                   <div className="bg-blue-900/20 p-3 rounded border border-blue-800 flex items-center justify-between">
                       <span className="text-blue-300 font-bold text-sm">發文身分:</span>
                       <select value={selectedProfileId} onChange={handleProfileSwitch} className="bg-dark border border-blue-500 rounded px-3 py-1 text-white font-bold">
                           {brandProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                       </select>
                   </div>
               )}
               <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
                  <div className="flex bg-dark p-1 rounded-lg border border-gray-600">
                      <button onClick={() => setPostMode('standard')} className={`flex-1 py-2 rounded-md font-bold ${postMode === 'standard' ? 'bg-primary text-white' : 'text-gray-400'}`}>🏢 一般經營</button>
                      <button onClick={() => setPostMode('viral')} className={`flex-1 py-2 rounded-md font-bold ${postMode === 'viral' ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white' : 'text-gray-400'}`}>🔥 爆文模式</button>
                  </div>
                  <div>
                      <label className="block text-sm text-gray-400 mb-1">貼文主題</label>
                      <input value={topic} onChange={e => setTopic(e.target.value)} className="w-full bg-dark border-gray-600 rounded p-3 text-white" placeholder="輸入主題..." />
                  </div>
                  {postMode === 'standard' && (
                      <div className="space-y-6 animate-fade-in">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div><label className="block text-sm text-gray-400 mb-1">文案長度</label><select value={captionLength} onChange={e => setCaptionLength(e.target.value)} className="w-full bg-dark border border-gray-600 rounded p-3 text-white"><option value="150-300字">標準</option><option value="300-600字">長文</option></select></div>
                              <div><label className="block text-sm text-gray-400 mb-1">Hashtags</label><input value={tempHashtags} onChange={e => setTempHashtags(e.target.value)} className="w-full bg-dark border-gray-600 rounded p-3 text-white" /></div>
                          </div>
                          <div>
                              <label className="block text-sm text-gray-400 mb-2">CTA</label>
                              <div className="space-y-2">{ctaList.map((item, i) => (<div key={i} className="flex gap-2"><input value={item.text} onChange={e => handleCtaChange(i, 'text', e.target.value)} className="w-1/3 bg-dark border border-gray-600 rounded p-2 text-white text-sm" /><input value={item.url} onChange={e => handleCtaChange(i, 'url', e.target.value)} className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white text-sm" /></div>))}</div>
                          </div>
                      </div>
                  )}
                  {postMode === 'viral' && (
                      <div className="space-y-6 animate-fade-in pt-6 border-t border-purple-500/30">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div><label className="block text-sm text-purple-300 font-bold mb-1">爆文類型</label><select value={viralType} onChange={e => setViralType(e.target.value as any)} className="w-full bg-dark border border-purple-500/50 rounded p-3 text-white"><option value="regret">😭 後悔型</option><option value="expose">🤫 內幕型</option><option value="result">📈 成果型</option></select></div>
                              <div><label className="block text-sm text-purple-300 font-bold mb-1">平台</label><select value={viralPlatform} onChange={e => setViralPlatform(e.target.value as any)} className="w-full bg-dark border border-purple-500/50 rounded p-3 text-white"><option value="facebook">📘 FB</option><option value="xhs">📕 小紅書</option></select></div>
                          </div>
                          <div className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 p-4 rounded-xl border border-pink-500/30">
                              <div className="flex justify-between items-center mb-4"><h3 className="text-white font-bold">🧠 標題評分</h3><button onClick={handleScoreTitles} className="text-xs bg-pink-600 text-white px-3 py-1 rounded">評分</button></div>
                              {titleCandidates.map((c, i) => (<div key={i} onClick={() => handleSelectTitleAndGenerate(c.title)} className="bg-black/40 p-2 mb-2 rounded border border-gray-700 cursor-pointer flex justify-between"><span>{c.title}</span><span className="text-pink-400">{c.score}分</span></div>))}
                          </div>
                      </div>
                  )}
                  <button onClick={() => handleNextToDraft()} disabled={!topic} className="w-full py-3 rounded font-bold text-white bg-primary">下一步</button>
               </div>
               <div className="mt-8">
                   <div className="flex justify-between mb-4"><h3 className="text-lg font-semibold">🔥 趨勢靈感</h3><button onClick={loadTrending} className="bg-secondary px-4 py-2 rounded text-sm">🔍 搜尋</button></div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{trendingTopics.map((t, i) => (<div key={i} onClick={() => handleTopicSelect(t)} className="p-4 rounded border border-gray-700 bg-card cursor-pointer hover:bg-gray-800"><h4 className="font-bold">{t.title}</h4><p className="text-sm text-gray-400 line-clamp-2">{t.description}</p></div>))}</div>
               </div>
          </div>
      )
  }

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
        <div className="space-y-6">
            <div className="bg-card p-6 rounded-xl border border-gray-700">
                <div className="flex justify-between mb-4"><h3 className="text-xl font-bold">編輯內容</h3><button onClick={() => setStep(1)} className="text-xs text-gray-400 underline">← 返回</button></div>
                <textarea value={draft.caption} onChange={e => setDraft({...draft, caption: e.target.value})} className="w-full h-64 bg-dark border-gray-600 rounded p-3 text-white mb-4" />
                <div className="flex gap-2 mb-4"><button onClick={() => setSelectedMediaType('image')} className={`flex-1 p-2 rounded ${selectedMediaType === 'image' ? 'bg-primary' : 'bg-gray-700'}`}>🖼️ 圖片</button><button onClick={() => setSelectedMediaType('video')} className={`flex-1 p-2 rounded ${selectedMediaType === 'video' ? 'bg-primary' : 'bg-gray-700'}`}>🎥 影片</button></div>
                <button onClick={handleGenerateMedia} className="w-full py-3 rounded font-bold bg-secondary text-white">生成素材</button>
            </div>
        </div>
        <div className="bg-card p-6 rounded-xl border border-gray-700 flex flex-col">
            <h3 className="text-xl font-bold mb-4">預覽與發佈</h3>
            <div className="bg-white text-black rounded p-4 flex-1 mb-4">
                <div className="whitespace-pre-wrap text-sm mb-4">{draft.caption}</div>
                <div className="bg-gray-100 min-h-[250px] flex items-center justify-center rounded overflow-hidden">
                    {mediaUrl ? (selectedMediaType === 'video' ? <video src={mediaUrl} controls /> : <img src={mediaUrl} className="max-w-full" />) : <span className="text-gray-400">素材預覽</span>}
                </div>
            </div>
            {publishResult ? <div className={`p-4 rounded text-center font-bold ${publishResult.success ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'}`}>{publishResult.msg}</div> : (
                <div className="space-y-4">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={syncInstagram} onChange={e => setSyncInstagram(e.target.checked)} /> 同步至 IG</label>
                    <div className="flex gap-4"><button onClick={() => handleFinalize(true)} disabled={!scheduleDate || !isStarterPlus} className="flex-1 border border-primary text-primary py-3 rounded">排程</button><button onClick={() => handleFinalize(false)} className="flex-1 bg-primary text-white py-3 rounded font-bold">立即發佈</button></div>
                </div>
            )}
        </div>
    </div>
  );
};
