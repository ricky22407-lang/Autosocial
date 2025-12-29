
import { BrandSettings } from '../types';
import { getCurrentUser, checkAndUseQuota, getUserProfile } from './authService';
import { getTrendingTopics, generatePostDraft, generateVideo, generateImage, applyWatermark, generateThreadsBatch } from './geminiService';
import { publishPostToFacebook } from './facebookService';
import { publishThreadsPost } from './threadsService';
import { db, isMock, firebase } from './firebase';

// Helper for Threads Image Generation in Automation (simulating logic from ThreadsNurturePanel)
const generateImageUrlLocal = (prompt: string, query: string, mode: 'ai_url' | 'stock_url' | 'none') => {
    if (mode === 'none') return undefined;
    const seed = Math.floor(Math.random() * 1000000).toString();
    // Use prompt if AI, or query/prompt if stock
    const text = mode === 'ai_url' ? prompt : (query || prompt);
    const encoded = encodeURIComponent(text);
    
    // Pollinations URL for Threads public access
    return `https://image.pollinations.ai/prompt/${encoded}?n=${seed}&model=flux`;
};

export const AutomationClient = {
  // --- Facebook AutoPilot ---
  trigger: async (settings: BrandSettings) => {
    // 1. Identity & Quota Check
    const user = getCurrentUser();
    if (!user) throw new Error("使用者未登入");
    
    // COST CALCULATION:
    // [BILLING] FB Automation: 15 Points (Premium Service Fee)
    // Includes Draft + Image + Search + Convenience Fee
    const COST = 15; 
    const hasQuota = await checkAndUseQuota(user.uid, COST, 'AUTOPILOT_FB_FULL_RUN');
    if (!hasQuota) throw new Error(`配額不足，自動化發文需 ${COST} 點`);

    const config = settings.autoPilot;
    if (!config || !config.enabled) throw new Error("自動化功能未啟用");

    // NEW: Fetch user role for smart model selection
    const profile = await getUserProfile(user.uid);
    const userRole = profile?.role || 'user';

    console.log(`[AutoPilot Client] Starting FB task... Role: ${userRole}`);

    // 2. Determine Topic
    let topic = '';
    if (config.source === 'keywords' && config.keywords.length > 0) {
        topic = config.keywords[Math.floor(Math.random() * config.keywords.length)];
    } else {
         // Default to Trending if competitor was selected (as it's removed)
         const trends = await getTrendingTopics(settings.industry);
         topic = trends.length > 0 ? trends[0].title : `${settings.industry} 趨勢分享`;
    }

    // 3. Generate Content
    // Pass userRole to generatePostDraft for smart fallback
    const draft = await generatePostDraft(topic, settings, {
        length: '150-300字',
        ctaList: [],
        tempHashtags: ''
    }, undefined, userRole);

    // 4. Generate Media
    let mediaUrl = '';
    const mediaType = config.mediaTypePreference === 'mixed' 
        ? (Math.random() > 0.5 ? 'video' : 'image') 
        : config.mediaTypePreference;

    try {
        if (mediaType === 'video') {
             try {
                mediaUrl = await generateVideo(draft.videoPrompt || topic);
             } catch (e) {
                console.warn("Video generation failed in automation, falling back to image", e);
                // Pass userRole to generateImage for Pollinations fallback check
                mediaUrl = await generateImage(draft.imagePrompt || topic, userRole);
             }
        } else {
             // Pass userRole to generateImage for Pollinations fallback check
             mediaUrl = await generateImage(draft.imagePrompt || topic, userRole);
        }

        // --- Auto Watermark Logic (Automation) ---
        if (settings.logoUrl && mediaUrl) {
            try {
                console.log("[AutoPilot] Applying watermark...");
                mediaUrl = await applyWatermark(mediaUrl, settings.logoUrl);
            } catch (wmError) {
                console.warn("[AutoPilot] Watermark failed, proceeding with original image.", wmError);
            }
        }

    } catch (e) {
        console.warn("Media generation failed", e);
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

    // 6. Log Last Run
    if (!isMock && db && user.uid) {
        try {
            await db.collection('users').doc(user.uid).update({
                // Note: quota was already decremented by checkAndUseQuota, so we just log timestamp here
                updated_at: Date.now()
            });
        } catch (e) { console.error("Failed to update stats", e); }
    }

    return {
        success: true,
        topic,
        caption: draft.caption,
        mediaUrl,
        published: publishResult.success,
        message: publishResult.success ? "已發佈至 Facebook" : "已生成內容 (未發佈/發佈失敗)"
    };
  },

  // --- Threads AutoPilot ---
  triggerThreads: async (settings: BrandSettings) => {
      const user = getCurrentUser();
      if (!user) throw new Error("使用者未登入");

      const config = settings.threadsAutoPilot;
      if (!config || !config.enabled) throw new Error("Threads 自動化功能未啟用");

      // COST CALCULATION:
      // Base: 2 pt (Pricing Update)
      // Image (AI): +5 pts (Total 7)
      // Image (Stock/News): +1 pt
      let COST = 2;
      if (config.imageMode === 'ai_url') COST += 5;
      else if (config.imageMode === 'stock_url') COST += 1;

      const hasQuota = await checkAndUseQuota(user.uid, COST, 'AUTOPILOT_THREADS_TRIGGER');
      if (!hasQuota) throw new Error(`配額不足 (Threads 自動化需 ${COST} 點)`);

      // Filter available accounts
      const targetIds = config.targetAccountIds || [];
      const activeAccounts = settings.threadsAccounts?.filter(a => {
          if (!a.isActive) return false;
          if (targetIds.length > 0) return targetIds.includes(a.id);
          return false; 
      }) || [];

      if (activeAccounts.length === 0) throw new Error("無符合條件的 Threads 帳號 (請檢查是否已勾選指定名單且帳號為活躍狀態)");

      console.log("[AutoPilot Client] Starting Threads task...");

      // 1. Determine Topic
      const seedKeyword = settings.industry || '台灣熱門時事';
      // Use cached trends implicitly via getTrendingTopics
      const trends = await getTrendingTopics(seedKeyword);
      const topic = trends.length > 0 ? trends[0].title : `${settings.industry} 熱門討論`;

      // 2. Select ONE random account
      const targetAccount = activeAccounts[Math.floor(Math.random() * activeAccounts.length)];
      const persona = targetAccount.personaPrompt ? [targetAccount.personaPrompt] : [];

      // 3. Generate Post (Batch size 1)
      // generateThreadsBatch always uses Flash, so logic is handled inside service
      const posts = await generateThreadsBatch(topic, 1, settings, persona);
      const post = posts[0];

      // 4. Prepare Image
      let imageUrl = undefined;
      if (config.imageMode !== 'none') {
          imageUrl = generateImageUrlLocal(post.imagePrompt, post.imageQuery, config.imageMode);
      }

      // 5. Publish
      let publishResult = { success: false, id: '' };
      try {
          const res = await publishThreadsPost(targetAccount, post.caption, imageUrl);
          if (res.success) {
              publishResult = { success: true, id: res.id || 'published' };
          }
      } catch (e) {
          console.error("Threads Auto Publish Failed", e);
      }

      // 6. Log/Sync
      if (!isMock && db && user.uid) {
        try {
            await db.collection('users').doc(user.uid).update({
                updated_at: Date.now()
            });
        } catch (e) { console.error("Failed to update stats", e); }
      }

      return {
          success: true,
          topic,
          targetAccount: targetAccount.username,
          published: publishResult.success,
          message: publishResult.success ? `已發佈至 Threads (${targetAccount.username})` : "Threads 發佈失敗"
      };
  }
};
