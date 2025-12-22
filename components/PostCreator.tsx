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
        "💡 貼心提醒：排程貼文將安全存儲於 Firebase 雲端，不佔用手機空間。",
        "💡 節省空間：發佈成功的貼文，系統會自動刪除暫存大圖，僅保留紀錄。",
        "💡 流量密碼：在貼文第一則留言放連結，通常觸及率會比直接放在內文高。",
        "💡 AI 正在思考最吸引人的標題...",
        "💡 系統正在處理雲端同步..."
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
                <p className="text-gray-300 text-sm">{tips[tipIndex]}</p>
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
  
  const [viralType, setViralType] = useState<ViralType>('regret');
  const [viralPlatform, setViralPlatform] = useState<ViralPlatform>('facebook');
  const [targetAudience, setTargetAudience] = useState('');
  const [titleCandidates, setTitleCandidates] = useState<TitleScore[]>([]);
  const [isScoringTitles, setIsScoringTitles] = useState(false);
  const [viralDrafts, setViralDrafts] = useState<string[]>([]);

  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  
  const [draft, setDraft] = useState({ caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  
  const [mediaSource, setMediaSource] = useState<'ai' | 'upload'>('ai');
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video'>('image'); 
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);

  const [scheduleDate, setScheduleDate] = useState('');
  const [syncInstagram, setSyncInstagram] = useState(false);
  
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{success: boolean, msg: string} | null>(null);

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
                setDraft(parsed.draft || { caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
                setMediaUrl(parsed.mediaUrl);
            } catch (e) {}
        }
    }
  }, [editPost]);

  // 暫存草稿至 LocalStorage (僅限編輯中，不包含大圖數據以防溢位)
  useEffect(() => {
      if (!topic && step === 1) return;
      if (editPost) return;
      const stateToSave = { step, topic, postMode, draft, mediaSource, selectedMediaType, scheduleDate, syncInstagram };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(stateToSave));
  }, [step, topic, postMode, draft, mediaSource, selectedMediaType, scheduleDate, syncInstagram]);

  const handleNextToDraft = async (overrideTopic?: string) => {
    const effectiveTopic = overrideTopic || topic;
    if (!effectiveTopic || isGeneratingDraft || !user) return;
    
    const cost = postMode === 'viral' ? 5 : 2;
    const allowed = await checkAndUseQuota(user.user_id, cost);
    if (!allowed) return alert(`⚠️ 配額不足`);
    
    onQuotaUpdate(); setStep(2); setIsGeneratingDraft(true);
    try {
      if (postMode === 'viral') {
          const viralRes = await generateViralContent(effectiveTopic, { audience: targetAudience || 'General', viralType, platform: viralPlatform, versionCount: 1 }, currentSettings);
          setDraft({ caption: viralRes.versions[0], firstComment: '', imagePrompt: viralRes.imagePrompt, videoPrompt: viralRes.imagePrompt });
      } else {
          const generated = await generatePostDraft(effectiveTopic, currentSettings, { length: captionLength, ctaList: ctaList.filter(l => l.url), tempHashtags: '', includeEngagement, imageText }, selectedTopicData || undefined, user.role);
          setDraft({ caption: generated.caption, firstComment: generated.ctaText || '', imagePrompt: generated.imagePrompt, videoPrompt: generated.videoPrompt });
      }
    } catch (e: any) { alert(`生成失敗: ${e.message}`); setStep(1); }
    finally { setIsGeneratingDraft(false); }
  };

  const handleGenerateMedia = async () => {
    if (!user || isGeneratingMedia) return;
    const cost = selectedMediaType === 'video' ? 20 : 5; 
    const allowed = await checkAndUseQuota(user.user_id, cost);
    if (!allowed) return alert(`配額不足`);
    
    onQuotaUpdate(); setMediaUrl(undefined); setIsGeneratingMedia(true);
    try {
      let url = '';
      if (selectedMediaType === 'video') url = await generateVideo(draft.videoPrompt || draft.imagePrompt);
      else {
          url = await generateImage(draft.imagePrompt, user.role, currentSettings.brandStylePrompt);
          if (currentSettings.logoUrl) url = await applyWatermark(url, currentSettings.logoUrl);
      }
      setMediaUrl(url);
    } catch (e: any) { alert(`素材失敗: ${e.message}`); }
    finally { setIsGeneratingMedia(false); }
  };

  const handleFinalize = async (schedule: boolean) => {
    if (!user || isPublishing) return;
    if (schedule && !scheduleDate) return alert("請先選擇排程時間");
    
    setIsPublishing(true);
    try {
        const newPost: Post = {
          id: editPost ? editPost.id : Date.now().toString(),
          userId: user.user_id, topic: topic,
          caption: draft.caption, firstComment: draft.firstComment,
          mediaPrompt: draft.imagePrompt, mediaType: selectedMediaType,
          mediaUrl, status: schedule ? 'scheduled' : 'published',
          scheduledDate: schedule ? scheduleDate : undefined, syncInstagram,
          createdAt: editPost ? editPost.createdAt : Date.now()
        };

        if (schedule) {
          // 排程：直接交給雲端存儲
          await onPostCreated(newPost);
          setPublishResult({ success: true, msg: "貼文已排入雲端排程系統！" });
          localStorage.removeItem(DRAFT_KEY);
        } else {
          // 立即發佈
          const result = await publishPostToFacebook(currentSettings.facebookPageId, currentSettings.facebookToken, draft.caption, mediaUrl, draft.firstComment, syncInstagram);
          if (result.success) {
            newPost.publishedUrl = result.url; newPost.status = 'published';
            await onPostCreated(newPost); // 同步雲端 (此處會自動清理大圖)
            setPublishResult({ success: true, msg: "發佈成功！雲端空間已自動清理暫存大圖。" });
            localStorage.removeItem(DRAFT_KEY);
          } else {
            newPost.status = 'failed'; newPost.errorLog = result.error;
            await onPostCreated(newPost);
            setPublishResult({ success: false, msg: `發佈失敗: ${result.error}` });
          }
        }
    } catch (err: any) {
        setPublishResult({ success: false, msg: `系統錯誤: ${err.message}` });
    } finally {
        setIsPublishing(false);
    }
  };

  if (isGeneratingDraft) return <LoadingOverlay message="AI 正在撰寫文案" />;
  if (isGeneratingMedia) return <LoadingOverlay message="AI 正在生成圖片/影片" />;
  if (isPublishing) return <LoadingOverlay message="正在處理雲端同步" />;

  if (step === 1) {
      return (
          <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
               <h2 className="text-2xl font-bold mb-4">1. 設定貼文主題</h2>
               <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
                  <input value={topic} onChange={e => setTopic(e.target.value)} className="w-full bg-dark border-gray-600 rounded p-3 text-white" placeholder="輸入主題 (例如：夏季保養心得)" />
                  <button onClick={() => handleNextToDraft()} disabled={!topic} className="w-full py-3 rounded font-bold text-white bg-primary">生成文案</button>
               </div>
          </div>
      )
  }

  return (
    <div className="max-w-6xl auto grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
        <div className="space-y-6">
            <div className="bg-card p-6 rounded-xl border border-gray-700">
                <textarea value={draft.caption} onChange={e => setDraft({...draft, caption: e.target.value})} className="w-full h-64 bg-dark border-gray-600 rounded p-3 text-white mb-4" />
                <div className="flex gap-2 mb-4">
                    <button onClick={() => setSelectedMediaType('image')} className={`flex-1 p-2 rounded ${selectedMediaType === 'image' ? 'bg-primary' : 'bg-gray-700'}`}>🖼️ 圖片</button>
                    <button onClick={() => setSelectedMediaType('video')} className={`flex-1 p-2 rounded ${selectedMediaType === 'video' ? 'bg-primary' : 'bg-gray-700'}`}>🎥 影片</button>
                </div>
                <button onClick={handleGenerateMedia} className="w-full py-3 rounded font-bold bg-secondary text-white">重新生成素材</button>
            </div>
        </div>
        <div className="bg-card p-6 rounded-xl border border-gray-700 flex flex-col">
            <h3 className="text-xl font-bold mb-4">預覽與發佈</h3>
            <div className="bg-white text-black rounded p-4 flex-1 mb-4 overflow-hidden">
                <div className="whitespace-pre-wrap text-sm mb-4">{draft.caption}</div>
                {mediaUrl && (selectedMediaType === 'video' ? <video src={mediaUrl} controls className="w-full" /> : <img src={mediaUrl} className="w-full h-auto" />)}
            </div>
            {publishResult ? (
                <div className={`p-4 rounded text-center font-bold ${publishResult.success ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'}`}>
                    {publishResult.msg}
                    <button onClick={() => setPublishResult(null)} className="block w-full mt-2 text-xs underline">繼續編輯</button>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="bg-dark p-3 rounded border border-gray-600">
                        <label className="block text-xs text-gray-500 mb-1">排程日期與時間</label>
                        <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full bg-transparent text-white outline-none" />
                    </div>
                    <div className="flex gap-4">
                        <button onClick={() => handleFinalize(true)} className="flex-1 border border-primary text-primary py-3 rounded font-bold hover:bg-primary/10">存入雲端排程</button>
                        <button onClick={() => handleFinalize(false)} className="flex-1 bg-primary text-white py-3 rounded font-bold hover:bg-blue-600">立即發佈</button>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
