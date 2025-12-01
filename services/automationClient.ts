
import { BrandSettings, AutoPilotConfig } from '../types';
import { getTrendingTopics, generatePostDraft, generateImage, generateVideo } from './geminiService';
import { publishPostToFacebook } from './facebookService';
import { checkAndUseQuota, getUserProfile } from './authService';
import { auth, db } from './firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';

export const AutomationClient = {
  trigger: async (settings: BrandSettings) => {
    // 1. Identity & Quota Check
    const user = auth.currentUser;
    if (!user) throw new Error("使用者未登入");
    
    // Check quota locally/firebase directly
    const hasQuota = await checkAndUseQuota(user.uid);
    if (!hasQuota) throw new Error("配額不足，無法執行自動化任務");

    const config = settings.autoPilot;
    if (!config || !config.enabled) throw new Error("自動化功能未啟用");

    console.log("[AutoPilot Client] Starting task...");

    // 2. Determine Topic
    let topic = '';
    if (config.source === 'keywords' && config.keywords.length > 0) {
        topic = config.keywords[Math.floor(Math.random() * config.keywords.length)];
    } else if (config.source === 'competitor') {
         topic = `分析競品 ${settings.competitors[0] || '同業'} 的熱門話題`;
    } else {
         // Trending
         const trends = await getTrendingTopics(settings.industry);
         topic = trends.length > 0 ? trends[0].title : `${settings.industry} 趨勢分享`;
    }

    // 3. Generate Content
    // Force shorter length for automation to be safe
    const draft = await generatePostDraft(topic, settings, {
        length: '150-300字',
        ctaLinks: [],
        tempHashtags: ''
    });

    // 4. Generate Media
    let mediaUrl = '';
    const mediaType = config.mediaTypePreference === 'mixed' 
        ? (Math.random() > 0.5 ? 'video' : 'image') 
        : config.mediaTypePreference;

    try {
        if (mediaType === 'video') {
             // Veo on client side might require specific auth flow, allow fallback
             try {
                mediaUrl = await generateVideo(draft.videoPrompt || topic);
             } catch (e) {
                console.warn("Video generation failed in automation, falling back to image", e);
                mediaUrl = await generateImage(draft.imagePrompt || topic);
             }
        } else {
             mediaUrl = await generateImage(draft.imagePrompt || topic);
        }
    } catch (e) {
        console.warn("Media generation failed", e);
        // Continue without media or specific error handling
    }

    // 5. Publish (If token exists)
    let publishResult = { success: false, id: '' };
    if (settings.facebookPageId && settings.facebookToken) {
        try {
            const res = await publishPostToFacebook(
                settings.facebookPageId,
                settings.facebookToken,
                draft.caption,
                mediaUrl
            );
            if (res.success) {
                publishResult = { success: true, id: res.url || 'published' };
            }
        } catch (e) {
            console.error("Auto publish failed", e);
        }
    }

    // 6. Log Last Run to Firestore
    if (!settings.facebookToken) {
        console.log("Skipping real publish (No token)");
    }

    try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
            'quota_used': increment(1), // Ensure quota is synced
            updated_at: Date.now()
        });
    } catch (e) {
        console.error("Failed to update stats in DB", e);
    }

    return {
        success: true,
        topic,
        caption: draft.caption,
        mediaUrl,
        published: publishResult.success,
        message: publishResult.success ? "已發佈至 Facebook" : "已生成內容 (未發佈/發佈失敗)"
    };
  }
};
