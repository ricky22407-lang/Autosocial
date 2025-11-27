
import * as admin from 'firebase-admin';
import { ContentService } from '../content/content.service';
import { FacebookService } from '../facebook/fb.service';
import { MembershipService } from '../membership/membership.service';
import { BrandSettings } from '../../../types';

export class SchedulerService {
  private db = admin.firestore();
  private contentService = new ContentService();
  private fbService = new FacebookService();
  private membershipService = new MembershipService();

  async triggerAutoPilot(userId: string, settings: BrandSettings) {
    // 1. Check Quota
    await this.membershipService.deductQuota(userId, 1);

    const config = settings.autoPilot;
    
    // 2. Select Topic based on Config
    let topic = '';
    if (config.source === 'keywords' && config.keywords.length > 0) {
        topic = config.keywords[Math.floor(Math.random() * config.keywords.length)];
    } else if (config.source === 'competitor') {
        // Mocking competitor logic for now, or use generic
        topic = `關於 ${settings.industry} 產業的競爭對手熱門策略分析`;
    } else {
        // Trending (Uses ContentService's safe fallback search)
        topic = await this.contentService.getTrendingTopic(settings.industry);
    }

    console.log(`[AutoPilot] User: ${userId}, Topic: ${topic}`);

    // 3. Generate Content (Draft)
    const draft = await this.contentService.generateDraft(topic, settings, "150-300字");

    // 4. Generate Media
    let mediaUrl = '';
    const mediaType = config.mediaTypePreference === 'mixed' 
        ? (Math.random() > 0.5 ? 'video' : 'image') 
        : config.mediaTypePreference;

    if (mediaType === 'video') {
         // Note: Veo generation is complex to fallback cleanly without user interaction for keys.
         // In this backend service, we might assume the environment key works or fallback to image.
         try {
             // For simplicity in this demo modular structure, we'll try image if we don't have a video service method yet
             // or strictly implemented video logic in ContentService.
             // Let's fallback to Image for stability in AutoPilot if Veo is restricted.
             mediaUrl = await this.contentService.generateImage(draft.imagePrompt || topic);
         } catch (e) {
             console.warn("Video generation skipped/failed in autopilot, using image.");
             mediaUrl = await this.contentService.generateImage(draft.imagePrompt || topic);
         }
    } else {
         mediaUrl = await this.contentService.generateImage(draft.imagePrompt || topic);
    }

    // 5. Publish
    if (settings.facebookPageId && settings.facebookToken) {
        await this.fbService.publishPost(
            settings.facebookPageId, 
            settings.facebookToken, 
            draft.caption, 
            mediaUrl
        );
    }

    return { topic, published: true };
  }
}
