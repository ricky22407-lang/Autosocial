

import { BrandSettings, AutoPilotConfig } from '../types';
import { getTrendingTopics, generatePostDraft, generateImage, generateVideo, generateThreadsBatch } from './geminiService';
import { publishPostToFacebook } from './facebookService';
import { publishThreadsPost } from './threadsService';
import { checkAndUseQuota, getUserProfile, getCurrentUser } from './authService';
import { db, isMock, firebase } from './firebase';

// Helper to generate image URL locally (mirrors ThreadsNurturePanel logic)
const generateImageUrlLocal = (prompt: string, query: string, mode: 'ai_url' | 'stock_url'): string => {
    const seed = Date.now();
    if (mode === 'ai_url') {
        const encodedPrompt = encodeURIComponent(prompt || query);
        // Use standard flux model
        return `https://image.pollinations.ai/prompt/${encodedPrompt}?n=${seed}&model=flux`;
    } else {
        // Updated to match ThreadsNurturePanel Photorealistic logic
        // Replaces LoremFlickr with Pollinations + Realistic Prompt
        // Note: Removing 'model=flux-realism' as it might cause 404s.
        const stockPrompt = `${query}, photorealistic, cinematic lighting, real photography, no 3d render, no illustration, hyperrealistic`;
        const encodedPrompt = encodeURIComponent(stockPrompt);
        return `https://image.pollinations.ai/prompt/${encodedPrompt}?n=${seed}&model=flux`;
    }
};

export const AutomationClient = {
  // --- Facebook AutoPilot ---
  trigger: async (settings: BrandSettings) => {
    // 1. Identity & Quota Check
    const user = getCurrentUser();
    if (!user) throw new Error("使用者未登入");
    
    // Check quota locally/firebase directly (AutoPilot usually consumes more logic, but for now we stick to 1 base + media cost)
    // Actually, let's simplify for automation: charge a flat fee or calculate.
    // Let's assume AutoPilot run costs 1 base point. If it generates AI Image, that's extra internal logic, 
    // but here we just charge 1 to trigger the run for simplicity unless we want complex transaction.
    const hasQuota = await checkAndUseQuota(user.uid, 1);
    if (!hasQuota) throw new Error("配額不足，無法執行自動化任務");

    const config = settings.autoPilot;
    if (!config || !config.enabled) throw new Error("自動化功能未啟用");

    console.log("[AutoPilot Client] Starting FB task...");

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
    const draft = await generatePostDraft(topic, settings, {
        length: '150-300字',
        ctaList: [],
        tempHashtags: ''
    });

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
                mediaUrl = await generateImage(draft.imagePrompt || topic);
             }
        } else {
             mediaUrl = await generateImage(draft.imagePrompt || topic);
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
                // 'quota_used': firebase.firestore.FieldValue.increment(1), 
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

      const hasQuota = await checkAndUseQuota(user.uid, 1);
      if (!hasQuota) throw new Error("配額不足 (Threads AutoPilot)");

      const config = settings.threadsAutoPilot;
      if (!config || !config.enabled) throw new Error("Threads 自動化功能未啟用");

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
      const trends = await getTrendingTopics(seedKeyword);
      const topic = trends.length > 0 ? trends[0].title : `${settings.industry} 熱門討論`;

      // 2. Select ONE random account
      const targetAccount = activeAccounts[Math.floor(Math.random() * activeAccounts.length)];
      const persona = targetAccount.personaPrompt ? [targetAccount.personaPrompt] : [];

      // 3. Generate Post (Batch size 1)
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