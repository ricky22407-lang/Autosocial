import React, { useState, useEffect } from 'react';
import { BrandSettings, Post, TrendingTopic, UserProfile, CtaItem, ViralType, ViralPlatform } from '../types';
import { getTrendingTopics, generatePostDraft, generateImage, generateVideo, applyWatermark, generateViralContent } from '../services/geminiService';
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

const LoadingOverlay: React.FC<{ message: string, detail?: string }> = ({ message, detail }) => {
    const tips = [
        "💡 貼心提醒：排程貼文將安全存儲於 Firebase 雲端，不佔用手機空間。",
        "💡 節省空間：發佈成功的貼文，系統會自動刪除暫存大圖，僅保留紀錄。",
        "💡 流量密碼：在貼文第一則留言放連結，通常觸及率會比直接放在內文高。",
        "💡 AI 正在為您構思引人入勝的文案...",
        "💡 系統正在同步雲端資料庫..."
    ];
    const [tipIndex, setTipIndex] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setTipIndex(prev => (prev + 1) % tips.length), 4000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 bg-dark/95 z-50 flex flex-col items-center justify-center p-8 backdrop-blur-md animate-fade-in text-center">
            <div className="w-24 h-24 mb-8 relative">
                <div className="absolute inset-0 border-8 border-gray-800 rounded-full"></div>
                <div className="absolute inset-0 border-8 border-primary rounded-full border-t-transparent animate-spin"></div>
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">{message}</h2>
            <p className="text-gray-400 mb-12 animate-pulse text-lg">{detail || "AI 大腦高速運轉中..."}</p>
            <div className="bg-card p-6 rounded-2xl border border-gray-700 max-w-lg w-full shadow-2xl">
                <p className="text-yellow-400 font-bold mb-2 uppercase tracking-widest text-sm">小撇步</p>
                <p className="text-gray-300 italic">{tips[tipIndex]}</p>
            </div>
        </div>
    );
};

const DRAFT_KEY = 'autosocial_post_draft';

export const PostCreator: React.FC<Props> = ({ settings: initialSettings, user, onPostCreated, onQuotaUpdate, editPost, onCancel, scheduledPostsCount = 0 }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [topic, setTopic] = useState('');
  const [postMode, setPostMode] = useState<'standard' | 'viral'>('standard');
  const [draft, setDraft] = useState({ caption: '', firstComment: '', imagePrompt: '', videoPrompt: '' });
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video'>('image'); 
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [syncInstagram, setSyncInstagram] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{success: boolean, msg: string} | null>(null);

  const role = user?.role || 'user';
  const getLimit = () => {
      if (role === 'pro') return 5;
      if (role === 'business') return 10;
      if (role === 'admin') return 100;
      return 3;
  };
  const limit = getLimit();
  const isLimitReached = !editPost && scheduledPostsCount >= limit;

  useEffect(() => {
    if (editPost) {
        setStep(2); setTopic(editPost.topic);
        setDraft({ caption: editPost.caption, firstComment: editPost.firstComment || '', imagePrompt: editPost.mediaPrompt, videoPrompt: editPost.mediaPrompt });
        setMediaUrl(editPost.mediaUrl); setScheduleDate(editPost.scheduledDate || ''); setSyncInstagram(!!editPost.syncInstagram);
    } else {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) {
            try {
                const p = JSON.parse(saved);
                if(p.topic) { setStep(2); setTopic(p.topic); setDraft(p.draft); setMediaUrl(p.mediaUrl); }
            } catch(e) {}
        }
    }
  }, [editPost]);

  useEffect(() => {
      if (step === 2 && !editPost) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ topic, draft, mediaUrl }));
      }
  }, [topic, draft, mediaUrl]);

  const handleNext = async () => {
    if (!topic || !user) return;
    const allowed = await checkAndUseQuota(user.user_id, postMode === 'viral' ? 5 : 2);
    if (!allowed) return alert("配額不足");
    onQuotaUpdate(); setStep(2); setIsGeneratingDraft(true);
    try {
      if (postMode === 'viral') {
          const res = await generateViralContent(topic, { audience: 'General', viralType: 'regret', platform: 'facebook', versionCount: 1 }, initialSettings);
          setDraft({ caption: res.versions[0], firstComment: '', imagePrompt: res.imagePrompt, videoPrompt: res.imagePrompt });
      } else {
          const res = await generatePostDraft(topic, initialSettings, { length: '150-300字', ctaList: [], tempHashtags: '', includeEngagement: false, imageText: '' }, undefined, user.role);
          setDraft({ caption: res.caption, firstComment: res.ctaText || '', imagePrompt: res.imagePrompt, videoPrompt: res.videoPrompt });
      }
    } catch (e: any) { alert(`失敗: ${e.message}`); setStep(1); }
    finally { setIsGeneratingDraft(false); }
  };

  const handleGenMedia = async () => {
    if (!user || isGeneratingMedia) return;
    const allowed = await checkAndUseQuota(user.user_id, selectedMediaType === 'video' ? 20 : 5);
    if (!allowed) return alert("配額不足");
    onQuotaUpdate(); setMediaUrl(undefined); setIsGeneratingMedia(true);
    try {
      let url = selectedMediaType === 'video' ? await generateVideo(draft.videoPrompt) : await generateImage(draft.imagePrompt, user.role, initialSettings.brandStylePrompt);
      if (initialSettings.logoUrl && selectedMediaType === 'image') url = await applyWatermark(url, initialSettings.logoUrl);
      setMediaUrl(url);
    } catch (e: any) { alert(`素材失敗: ${e.message}`); }
    finally { setIsGeneratingMedia(false); }
  };

  const handleFinalize = async (schedule: boolean) => {
    if (!user || isPublishing) return;
    if (schedule && !scheduleDate) return alert("請選擇日期時間");
    setIsPublishing(true);
    try {
        const newPost: Post = {
          id: editPost ? editPost.id : Date.now().toString(), userId: user.user_id, topic, caption: draft.caption, 
          firstComment: draft.firstComment, mediaPrompt: draft.imagePrompt, mediaType: selectedMediaType,
          mediaUrl, status: schedule ? 'scheduled' : 'published', scheduledDate: schedule ? scheduleDate : undefined, 
          syncInstagram, createdAt: editPost ? editPost.createdAt : Date.now()
        };
        if (schedule) {
          await onPostCreated(newPost);
          setPublishResult({ success: true, msg: "雲端排程成功！" });
          localStorage.removeItem(DRAFT_KEY);
        } else {
          const res = await publishPostToFacebook(initialSettings.facebookPageId, initialSettings.facebookToken, draft.caption, mediaUrl, draft.firstComment, syncInstagram);
          if (res.success) {
            newPost.publishedUrl = res.url; newPost.status = 'published';
            await onPostCreated(newPost);
            setPublishResult({ success: true, msg: "發佈成功！空間已自動釋放。" });
            localStorage.removeItem(DRAFT_KEY);
          } else {
            newPost.status = 'failed'; newPost.errorLog = res.error;
            await onPostCreated(newPost);
            setPublishResult({ success: false, msg: `發佈失敗: ${res.error}` });
          }
        }
    } catch (err: any) { setPublishResult({ success: false, msg: `錯誤: ${err.message}` }); }
    finally { setIsPublishing(false); }
  };

  if (isGeneratingDraft) return <LoadingOverlay message="AI 正在撰寫文案" detail="我們正在為您生成最具轉換率的社群文案..." />;
  if (isGeneratingMedia) return <LoadingOverlay message="AI 正在製圖中" detail="正在根據文案內容創作高品質視覺素材..." />;
  if (isPublishing) return <LoadingOverlay message="雲端同步中" detail="正在將您的創意內容同步至雲端伺服器..." />;

  if (step === 1) return (
      <div className="max-w-3xl mx-auto space-y-8 animate-fade-in pt-10">
          <div className="text-center space-y-4">
              <h2 className="text-4xl font-bold text-white tracking-tight">你要聊什麼主題？</h2>
              <p className="text-gray-400">輸入一個簡單的想法，AI 將為您完成剩下的所有工作。</p>
          </div>
          <div className="bg-card p-8 rounded-3xl border border-gray-700 shadow-2xl space-y-6">
              <input value={topic} onChange={e => setTopic(e.target.value)} className="w-full bg-dark border-gray-600 rounded-2xl p-5 text-xl text-white outline-none focus:border-primary transition-all shadow-inner" placeholder="例如：夏季抗老保養品推薦、或是貼上一則新聞連結" />
              <div className="flex gap-4">
                  <button onClick={() => setPostMode('standard')} className={`flex-1 p-4 rounded-xl border-2 transition-all font-bold ${postMode === 'standard' ? 'border-primary bg-primary/10 text-white' : 'border-gray-700 text-gray-500 hover:border-gray-600'}`}>🏢 標準品牌模式</button>
                  <button onClick={() => setPostMode('viral')} className={`flex-1 p-4 rounded-xl border-2 transition-all font-bold ${postMode === 'viral' ? 'border-pink-600 bg-pink-900/10 text-white' : 'border-gray-700 text-gray-500 hover:border-gray-600'}`}>🔥 爆款營銷模式</button>
              </div>
              <button onClick={handleNext} disabled={!topic} className="w-full py-4 rounded-2xl font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg hover:from-blue-500 hover:to-indigo-500 transform transition-all active:scale-95 disabled:opacity-50">啟動 AI 創作中心</button>
          </div>
      </div>
  );

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in pb-20">
        <div className="space-y-6">
            <div className="bg-card p-6 rounded-3xl border border-gray-700 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-300 flex items-center gap-2"><span className="text-xl">✍️</span> 編輯文案</h3>
                    <button onClick={() => { if(confirm("捨棄目前草稿？")) setStep(1); }} className="text-xs text-red-400 hover:underline">重新開始</button>
                </div>
                <textarea value={draft.caption} onChange={e => setDraft({...draft, caption: e.target.value})} className="w-full h-72 bg-dark border-gray-600 rounded-2xl p-4 text-white mb-6 resize-none focus:border-primary outline-none custom-scrollbar" />
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <button onClick={() => setSelectedMediaType('image')} className={`p-4 rounded-xl border-2 font-bold transition-all ${selectedMediaType === 'image' ? 'border-primary bg-primary/10 text-white' : 'border-gray-700 text-gray-500'}`}>🖼️ AI 圖片</button>
                    <button onClick={() => setSelectedMediaType('video')} className={`p-4 rounded-xl border-2 font-bold transition-all ${selectedMediaType === 'video' ? 'border-primary bg-primary/10 text-white' : 'border-gray-700 text-gray-500'}`}>🎥 AI 影片</button>
                </div>
                <button onClick={handleGenMedia} className="w-full py-4 rounded-2xl font-bold bg-secondary text-white shadow-lg hover:opacity-90 transition-all">重新生成視覺素材</button>
            </div>
        </div>
        <div className="flex flex-col space-y-6">
            <div className="bg-card p-6 rounded-3xl border border-gray-700 shadow-xl flex-1 flex flex-col">
                <h3 className="font-bold text-gray-300 mb-4 flex items-center gap-2"><span className="text-xl">📱</span> 手機預覽</h3>
                <div className="bg-white rounded-2xl overflow-hidden flex-1 flex flex-col shadow-inner">
                    <div className="p-4 border-b flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-200"></div>
                        <div><div className="h-2 w-20 bg-gray-200 rounded"></div><div className="h-2 w-10 bg-gray-100 rounded mt-1"></div></div>
                    </div>
                    <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
                        <p className="text-black text-sm whitespace-pre-wrap leading-relaxed mb-4">{draft.caption}</p>
                        {mediaUrl && (selectedMediaType === 'video' ? <video src={mediaUrl} controls className="w-full rounded-lg" /> : <img src={mediaUrl} className="w-full h-auto rounded-lg" />)}
                    </div>
                </div>
                {publishResult ? (
                    <div className={`mt-6 p-4 rounded-2xl text-center font-bold animate-fade-in ${publishResult.success ? 'bg-green-900/50 text-green-200 border border-green-700' : 'bg-red-900/50 text-red-200 border border-red-700'}`}>
                        {publishResult.msg}
                        <button onClick={() => setPublishResult(null)} className="block w-full mt-2 text-xs underline opacity-70">繼續編輯內容</button>
                    </div>
                ) : (
                    <div className="mt-6 space-y-4">
                        <div className="bg-dark p-4 rounded-2xl border border-gray-600 flex justify-between items-center group">
                            <div className="flex-1">
                                <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1 group-focus-within:text-primary">排程日期與時間</label>
                                <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full bg-transparent text-white outline-none font-bold" />
                            </div>
                            <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${isLimitReached ? 'bg-red-900 text-red-200' : 'bg-blue-900 text-blue-200'}`}>
                                雲端空間: {scheduledPostsCount}/{limit}
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => handleFinalize(true)} disabled={isLimitReached} className={`flex-1 py-4 rounded-2xl font-bold transition-all border-2 ${isLimitReached ? 'border-gray-700 text-gray-600 cursor-not-allowed' : 'border-primary text-primary hover:bg-primary/10'}`}>{isLimitReached ? '排程已滿' : '存入雲端排程'}</button>
                            <button onClick={() => handleFinalize(false)} className="flex-1 bg-primary text-white py-4 rounded-2xl font-bold shadow-xl hover:bg-blue-600 transition-all transform active:scale-95">立即發佈</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
