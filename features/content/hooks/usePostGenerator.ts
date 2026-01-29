
import { useState, useEffect } from 'react';
import { BrandSettings, Post, TrendingTopic, ImageIntent } from '../../../types';
import { getTrendingTopics, generatePostDraft, generateImage, applyWatermark, generateViralContent, generateImagePromptString, compositeImageWithText } from '../../../services/geminiService';
import { publishPostToFacebook } from '../../../services/facebookService';
import { checkAndUseQuota } from '../../../services/authService';
import { useAuth } from '../../../context/AuthContext';
import { shuffleArray } from '../../../services/gemini/core'; 

export interface PostGeneratorState {
    step: 1 | 2;
    topic: string;
    mode: 'brand' | 'viral';
    draft: {
        caption: string;
        firstComment: string;
        imagePrompt: string;
    };
    imageSettings: {
        intent: ImageIntent;
        renderMode: 'plain' | 'ai_text' | 'smart_layout';
        customText: string;
        layoutTitle: string;
        layoutSubtitle: string;
    };
    media: {
        url?: string;
        isGenerating: boolean;
        phase: string;
    };
    scheduling: {
        date: string;
        syncInstagram: boolean;
        isPublishing: boolean;
        result: { success: boolean; msg: string } | null;
    };
    trends: {
        data: TrendingTopic[]; // Currently visible batch
        loading: boolean;
    };
}

export const usePostGenerator = (
    settings: BrandSettings, 
    onPostCreated: (post: Post) => void,
    onQuotaUpdate: () => void,
    editPost?: Post | null,
    initialTopic?: string,
    initialSourceUrl?: string
) => {
    const { userProfile } = useAuth();

    // --- State Management ---
    const [step, setStep] = useState<1 | 2>(1);
    const [topic, setTopic] = useState('');
    const [mode, setMode] = useState<'brand' | 'viral'>('brand');
    const [sourceUrl, setSourceUrl] = useState(''); 
    
    // Trend Logic: Pooling & Pagination
    const [allTrends, setAllTrends] = useState<TrendingTopic[]>([]); // The Big Pool (Cache)
    const [visibleTrends, setVisibleTrends] = useState<TrendingTopic[]>([]); // The Visible Batch
    const [seenTrendIds, setSeenTrendIds] = useState<Set<string>>(new Set()); // Track what we've shown
    const [isLoadingTrends, setIsLoadingTrends] = useState(false);

    // Draft State
    const [draft, setDraft] = useState({ caption: '', firstComment: '', imagePrompt: '' });
    const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

    // Image State
    const [imageIntent, setImageIntent] = useState<ImageIntent>('lifestyle');
    const [renderMode, setRenderMode] = useState<'plain' | 'ai_text' | 'smart_layout'>('plain');
    const [customImageText, setCustomImageText] = useState('');
    const [layoutTitle, setLayoutTitle] = useState('');
    const [layoutSubtitle, setLayoutSubtitle] = useState('');
    const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
    const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
    const [generatingPhase, setGeneratingPhase] = useState('');

    // Publishing State
    const [scheduleDate, setScheduleDate] = useState('');
    const [syncInstagram, setSyncInstagram] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishResult, setPublishResult] = useState<{success: boolean, msg: string} | null>(null);

    // --- Effects ---

    // 1. Initialize from Edit Post or Topic
    useEffect(() => {
        if (editPost) {
            setStep(2);
            setTopic(editPost.topic);
            setDraft({ 
                caption: editPost.caption, 
                firstComment: editPost.firstComment || '', 
                imagePrompt: editPost.mediaPrompt 
            });
            setMediaUrl(editPost.mediaUrl);
            setScheduleDate(editPost.scheduledDate || '');
            setSyncInstagram(!!editPost.syncInstagram);
        } else if (initialTopic) {
            setTopic(initialTopic);
            if (initialSourceUrl) setSourceUrl(initialSourceUrl);
            setStep(1);
        }
    }, [editPost, initialTopic, initialSourceUrl]);

    // 2. Smart Layout Auto-fill
    useEffect(() => {
        if (draft.caption && !layoutTitle) {
            setLayoutTitle(topic);
            const priceMatch = draft.caption.match(/\$\d+(?:,\d+)?/);
            if (priceMatch) setLayoutSubtitle(`${priceMatch[0]} 起`);
        }
    }, [draft.caption]);

    // --- Actions ---

    // SMART LOAD TRENDS
    const loadTrends = async (manualRefresh: boolean = false) => {
        if (!userProfile) return alert("請先登入");
        
        setIsLoadingTrends(true);
        const BATCH_SIZE = 6; // Show 6 items at a time

        // 1. Try to fetch from local pool first
        if (manualRefresh && allTrends.length > 0) {
            // Filter out items we've already seen in this session
            const unseen = allTrends.filter(t => !seenTrendIds.has(t.title));
            
            if (unseen.length >= BATCH_SIZE) {
                // We have enough unseen items in cache! Use them.
                const nextBatch = shuffleArray(unseen).slice(0, BATCH_SIZE);
                setVisibleTrends(nextBatch);
                
                // Mark as seen
                setSeenTrendIds(prev => {
                    const next = new Set(prev);
                    nextBatch.forEach((t: TrendingTopic) => next.add(t.title));
                    return next;
                });
                
                // Add fake delay for better UX (so user sees "refresh" happening)
                await new Promise(r => setTimeout(r, 600));
                setIsLoadingTrends(false);
                return;
            } else {
                // Pool exhausted! We need to fetch fresh data from API.
                console.log("Trend Pool Exhausted. Fetching fresh data from API...");
            }
        }

        // 2. Fetch from Backend (Quota Charge)
        const COST = 3; 
        const allowed = await checkAndUseQuota(userProfile.user_id, COST, 'TREND_SEARCH'); 
        if (!allowed) {
            setIsLoadingTrends(false);
            return; 
        }
        
        onQuotaUpdate();
        
        try {
            const query = topic.trim() || settings.industry || '台灣熱門時事';
            
            // forceRefresh=true ensures backend fetches new data from Google/RSS
            // We request a large pool (e.g., 50)
            const freshTrends = await getTrendingTopics(query, 50, true);
            
            if (freshTrends.length > 0) {
                const shuffled = shuffleArray(freshTrends);
                const firstBatch = shuffled.slice(0, BATCH_SIZE);
                
                setAllTrends(shuffled);
                setVisibleTrends(firstBatch);
                
                // Reset seen tracking for new pool
                const newSeen = new Set<string>();
                firstBatch.forEach(t => newSeen.add(t.title));
                setSeenTrendIds(newSeen);

                if (manualRefresh && topic.trim()) {
                    alert(`已為您搜尋關於「${query}」的最新話題！(扣除 ${COST} 點)`);
                }
            }
        } catch (e) { 
            console.error(e); 
        } finally { 
            setIsLoadingTrends(false); 
        }
    };

    const generateDraft = async () => {
        if (!topic || !userProfile) return;
        
        const allowed = await checkAndUseQuota(userProfile.user_id, 5, 'GENERATE_POST_DRAFT');
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
                }, undefined, userProfile.role);
                
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

    const generateMedia = async () => {
        if (!userProfile || isGeneratingMedia) return;
        
        if (renderMode === 'ai_text' && !customImageText) return alert("請輸入您想顯示在圖片上的文字，或切換模式。");
        if (renderMode === 'smart_layout' && !layoutTitle) return alert("智慧排版模式需要至少輸入「主標題」。");
    
        const cost = mediaUrl ? 5 : 8; 
        const allowed = await checkAndUseQuota(userProfile.user_id, cost, 'GENERATE_IMAGE_AI');
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
            
            let url = await generateImage(
                finalPrompt, 
                userProfile.role, 
                settings, 
                imageIntent,
                renderMode === 'ai_text' ? customImageText : undefined,
                renderMode === 'smart_layout'
            );
    
            if (renderMode === 'smart_layout') {
                setGeneratingPhase('正在進行智慧排版合成...');
                url = await compositeImageWithText(url, layoutTitle, layoutSubtitle, '#FFD700');
            }
    
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

    const publish = async (isScheduled: boolean) => {
        if (!userProfile || isPublishing) return;
        let scheduledUnixTime: number | undefined = undefined;
    
        if (isScheduled) {
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
              userId: userProfile.user_id,
              topic,
              caption: draft.caption, 
              firstComment: draft.firstComment,
              mediaPrompt: draft.imagePrompt,
              mediaType: 'image',
              mediaUrl,
              status: isScheduled ? 'scheduled' : 'published',
              scheduledDate: isScheduled ? scheduleDate : undefined, 
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
                newPost.status = isScheduled ? 'scheduled' : 'published';
                await onPostCreated(newPost);
                
                if (isScheduled) setPublishResult({ success: true, msg: "✅ 已成功傳送至 Facebook 排程系統！" });
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

    return {
        step, setStep,
        topic, setTopic,
        mode, setMode,
        sourceUrl, setSourceUrl,
        // Pass visible trends to UI
        trends: { data: visibleTrends, loading: isLoadingTrends, load: loadTrends },
        draft: { data: draft, setData: setDraft, isGenerating: isGeneratingDraft, generate: generateDraft },
        image: {
            intent: imageIntent, setIntent: setImageIntent,
            renderMode, setRenderMode,
            customText: customImageText, setCustomText: setCustomImageText,
            layoutTitle, setLayoutTitle,
            layoutSubtitle, setLayoutSubtitle,
            url: mediaUrl, setUrl: setMediaUrl,
            isGenerating: isGeneratingMedia,
            phase: generatingPhase,
            generate: generateMedia
        },
        publish: {
            scheduleDate, setScheduleDate,
            syncInstagram, setSyncInstagram,
            isPublishing,
            result: publishResult, setResult: setPublishResult,
            execute: publish
        }
    };
};
