
import { useState, useEffect } from 'react';
import { BrandSettings, ThreadsAccount, TrendingTopic } from '../../../types';
import { getTrendingTopics, generateThreadsBatch, fetchNewsImageFromUrl, generateImage } from '../../../services/geminiService';
import { publishThreadsPost } from '../../../services/threadsService';
import { checkAndUseQuota } from '../../../services/authService';
import { getThreadsSystemInstruction } from '../../../services/promptTemplates';
import { generateStockUrl } from '../components/Common';
import { useAuth } from '../../../context/AuthContext';
import { storage, isMock, deleteStorageFile } from '../../../services/firebase'; // Import helper

export type ImageSourceType = 'ai' | 'stock' | 'news' | 'upload' | 'none';

export interface GeneratedPost {
  id: string;
  topic: string; 
  caption: string;
  imagePrompt: string;
  imageQuery: string;
  imageUrl?: string; 
  newsImageUrl?: string; 
  uploadedImageBase64?: string;
  targetAccountId?: string;
  status: 'idle' | 'publishing' | 'done' | 'failed';
  log?: string;
  imageSourceType: ImageSourceType;
  paidForGeneration?: boolean; 
}

// Helper: Upload Base64 to Firebase Storage and get URL
const uploadBase64ToStorage = async (base64Data: string, userId: string): Promise<string> => {
    if (isMock) return "https://via.placeholder.com/1024x1024.png?text=Mock+Storage+Image";
    
    try {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const path = `generated_images/${userId}/${timestamp}_${randomId}.png`;
        const storageRef = storage.ref(path);
        
        // base64Data comes as "data:image/png;base64,....."
        await storageRef.putString(base64Data, 'data_url');
        const downloadURL = await storageRef.getDownloadURL();
        return downloadURL;
    } catch (e: any) {
        console.error("Storage Upload Failed:", e);
        throw new Error("圖片上傳雲端失敗，請檢查 Firebase Storage 設定。");
    }
};

export const useThreadsGenerator = (
    settings: BrandSettings,
    accounts: ThreadsAccount[],
    onQuotaUpdate: () => void,
    initialTopic?: string
) => {
    const { userProfile } = useAuth();

    // UI State
    const [step, setStep] = useState<1 | 2>(1);
    const [manualTopic, setManualTopic] = useState('');
    const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
    
    // Gen Settings
    const [genCount, setGenCount] = useState<1 | 2 | 3>(1);
    const [preSelectedImageMode, setPreSelectedImageMode] = useState<ImageSourceType>('none');
    const [selectedGenAccountId, setSelectedGenAccountId] = useState<string>(''); 
    
    // Data State
    const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
    const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
    
    // Loading State
    const [isGenerating, setIsGenerating] = useState(false);
    const [loadingTrends, setLoadingTrends] = useState(false);
    const [trendError, setTrendError] = useState('');
    const [isRegeneratingImage, setIsRegeneratingImage] = useState<string | null>(null);

    // Initialization
    useEffect(() => {
        if (accounts.length > 0) {
            const currentSelectionExists = accounts.some(a => a.id === selectedGenAccountId);
            if (!selectedGenAccountId || !currentSelectionExists) {
                setSelectedGenAccountId(accounts[0].id);
            }
        }
    }, [accounts]);

    useEffect(() => {
        if (initialTopic) {
            setSelectedTopics([initialTopic]);
            setManualTopic(initialTopic);
            setStep(2);
        }
    }, [initialTopic]);

    // --- Actions ---

    const loadTrends = async (overrideKeyword?: string) => {
        if (!userProfile) return alert("請先登入");
        
        const COST = 3; 
        const allowed = await checkAndUseQuota(userProfile.user_id, COST, 'TREND_SEARCH');
        if (!allowed) return; 
        
        onQuotaUpdate();
        setLoadingTrends(true);
        setTrendError('');
        setTrendingTopics([]);

        try {
            const query = overrideKeyword || manualTopic || settings.industry || '台灣熱門時事';
            const trends = await getTrendingTopics(query);
            if (trends.length === 0) setTrendError("目前找不到相關新聞，請嘗試手動輸入其他話題。");
            setTrendingTopics(trends);
        } catch (e: any) {
            console.warn("Trend load error", e);
            setTrendError("無法載入即時趨勢，請檢查網路或稍後再試。");
        } finally {
            setLoadingTrends(false);
        }
    };

    const toggleTopic = (title: string) => {
        if (selectedTopics.includes(title)) setSelectedTopics([]);
        else { setSelectedTopics([title]); setManualTopic(''); }
    };

    const calculateCost = (count: number, mode: ImageSourceType) => {
        const baseCost = 3; 
        let extraCost = 0;
        if (mode === 'ai') extraCost = 5; 
        else if (mode === 'stock') extraCost = 3;
        else if (mode === 'news') extraCost = 1;
        return (baseCost + extraCost) * count;
    };

    const generateBatch = async () => {
        if (!userProfile) return alert("請先登入");
        const topicSource = selectedTopics.length > 0 ? selectedTopics[0] : manualTopic;
        if (!topicSource) return alert("無效話題");

        const targetAccount = accounts.find(a => a.id === selectedGenAccountId);
        if (!targetAccount) return alert("錯誤：請先選擇要發文的帳號");

        const totalCost = calculateCost(genCount, preSelectedImageMode);
        if (!confirm(`確定為帳號「${targetAccount.username}」生成 ${genCount} 篇貼文？\n\n消耗：${totalCost} 點配額`)) return;

        const allowed = await checkAndUseQuota(userProfile.user_id, totalCost, 'THREADS_BATCH_GEN', { count: genCount, mode: preSelectedImageMode });
        if (!allowed) return; 
        onQuotaUpdate();

        setIsGenerating(true);
        setGeneratedPosts([]);

        try {
            const instruction = getThreadsSystemInstruction(
                targetAccount.accountType || 'personal',
                targetAccount.styleGuide,
                targetAccount.safetyFilter
            );

            const results = await generateThreadsBatch(topicSource, genCount, settings, [instruction]);
            const sourceTopicData = trendingTopics.find(t => t.title === topicSource);
            const initialNewsImg = sourceTopicData?.imageUrl;
            const newsUrl = sourceTopicData?.url;

            const newPosts: GeneratedPost[] = await Promise.all(results.map(async (r, i) => {
                let finalMode = preSelectedImageMode;
                let finalImageUrl = undefined;
                let errorLog = undefined;
                const uniqueSeed = Date.now().toString() + i;

                if (finalMode === 'ai') {
                    // 1. Generate Image (Base64) from Gemini
                    try {
                        const prompt = r.imagePrompt || `${topicSource}, artistic, creative, illustration style`;
                        const base64Image = await generateImage(prompt, userProfile.role, settings, 'lifestyle');
                        
                        // 2. Upload to Firebase Storage to get a Public URL
                        if (base64Image && base64Image.startsWith('data:image')) {
                            finalImageUrl = await uploadBase64ToStorage(base64Image, userProfile.user_id);
                        } else {
                            finalImageUrl = base64Image; // Fallback if it's already a URL
                        }

                    } catch (e: any) {
                        console.error("AI Gen Failed:", e);
                        errorLog = "AI 製圖/上傳失敗，已降級為圖庫模式";
                        finalImageUrl = generateStockUrl(r.imageQuery || r.imagePrompt, uniqueSeed);
                        finalMode = 'stock';
                    }
                } else if (finalMode === 'stock') {
                    finalImageUrl = generateStockUrl(r.imageQuery || r.imagePrompt, uniqueSeed);
                } else if (finalMode === 'news') {
                    if (initialNewsImg) finalImageUrl = initialNewsImg;
                    else if (newsUrl) {
                        const ogImg = await fetchNewsImageFromUrl(newsUrl);
                        if (ogImg) finalImageUrl = ogImg;
                    }
                    if (!finalImageUrl) {
                        try {
                           finalImageUrl = generateStockUrl(`News photo about ${topicSource}, realistic, journalism style`, uniqueSeed);
                        } catch (e) { finalMode = 'none'; errorLog = '無法取得新聞圖片'; }
                    }
                }

                return {
                    id: Date.now() + '_' + i,
                    topic: topicSource,
                    caption: r.caption,
                    imagePrompt: r.imagePrompt,
                    imageQuery: r.imageQuery,
                    newsImageUrl: finalMode === 'news' ? finalImageUrl : undefined,
                    imageUrl: (finalMode === 'ai' || finalMode === 'stock' || finalMode === 'news') ? finalImageUrl : undefined,
                    imageSourceType: finalMode,
                    log: errorLog,
                    status: 'idle',
                    targetAccountId: targetAccount.id
                };
            }));

            setGeneratedPosts(newPosts);
        } catch (e: any) {
            alert(`生成失敗: ${e.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const regenerateImage = async (post: GeneratedPost, newMode: ImageSourceType) => {
        if (!userProfile) return;
        
        const COST = newMode === 'ai' ? 5 : 3;
        const allowed = await checkAndUseQuota(userProfile.user_id, COST, 'THREADS_REGEN_IMAGE');
        if (!allowed) return; 
        onQuotaUpdate();

        setIsRegeneratingImage(post.id);
        
        let newUrl = "";
        
        if (newMode === 'ai') {
             try {
                 const prompt = post.imagePrompt || post.topic;
                 const base64 = await generateImage(prompt, userProfile.role, settings, 'lifestyle');
                 if (base64 && base64.startsWith('data:image')) {
                     newUrl = await uploadBase64ToStorage(base64, userProfile.user_id);
                 } else {
                     newUrl = base64;
                 }
             } catch(e: any) {
                 alert(`AI 製圖失敗: ${e.message}`);
                 setIsRegeneratingImage(null);
                 return;
             }
        } else {
             const newSeed = Date.now().toString() + Math.floor(Math.random() * 9999);
             const visualSubject = post.imageQuery || post.topic; 
             newUrl = generateStockUrl(visualSubject, newSeed);
        }

        setTimeout(() => {
            setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageSourceType: newMode, imageUrl: newUrl } : p));
            setIsRegeneratingImage(null);
        }, 500); 
    };

    const publishPost = async (post: GeneratedPost) => {
        if (!post.targetAccountId) return alert("錯誤：未指定發佈帳號");
        const acc = accounts.find(a => a.id === post.targetAccountId);
        if (!acc) return alert("錯誤：找不到對應的帳號資料。");
        if (!post.caption) return alert("內容為空");

        let imgUrl = post.imageUrl;
        
        if (post.imageSourceType === 'upload' && post.uploadedImageBase64) imgUrl = post.uploadedImageBase64;
        if (post.imageSourceType === 'news' && post.newsImageUrl) imgUrl = post.newsImageUrl;
        if (post.imageSourceType === 'none') imgUrl = undefined;

        // Final safety check: if still base64, try late upload
        if (imgUrl && imgUrl.startsWith('data:image')) {
             try {
                 if (userProfile) {
                     imgUrl = await uploadBase64ToStorage(imgUrl, userProfile.user_id);
                 } else {
                     alert("尚未登入，無法上傳圖片");
                     return;
                 }
             } catch (e) {
                 if (!confirm("圖片上傳雲端失敗。是否僅發佈文字？")) return;
                 imgUrl = undefined;
             }
        }

        setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'publishing', log: '發佈中...' } : p));
        try {
            const res = await publishThreadsPost(acc, post.caption, imgUrl);
            if (res.success) {
                setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'done', log: '發佈成功！' } : p));
                
                // --- CLEANUP: DELETE TEMPORARY IMAGE ---
                // Since Threads API has accepted the post, we can delete the image from storage to save space.
                if (imgUrl && imgUrl.includes('firebasestorage')) {
                    // Fire and forget, don't await blocking UI
                    deleteStorageFile(imgUrl);
                }

            } else {
                setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'failed', log: `發佈失敗: ${res.error}` } : p));
                alert(`發佈失敗: ${res.error}`);
            }
        } catch (e: any) {
            setGeneratedPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'failed', log: `系統錯誤: ${e.message}` } : p));
        }
    };

    const updatePostCaption = (id: string, text: string) => {
        setGeneratedPosts(prev => prev.map(p => p.id === id ? { ...p, caption: text } : p));
    };

    return {
        step, setStep,
        manualTopic, setManualTopic,
        selectedTopics, toggleTopic,
        genCount, setGenCount,
        preSelectedImageMode, setPreSelectedImageMode,
        selectedGenAccountId, setSelectedGenAccountId,
        trendingTopics, loadingTrends, trendError, loadTrends,
        isGenerating, generateBatch,
        generatedPosts, updatePostCaption,
        isRegeneratingImage, regenerateImage,
        publishPost
    };
};
