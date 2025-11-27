
import { Router } from 'express';
import { GoogleGenAI, Type } from "@google/genai";
import * as admin from 'firebase-admin';
import { verifyToken, checkQuota } from '../middleware/auth';
import { BrandSettings } from '../../types'; // Assuming shared types

const router = Router();
const db = admin.firestore();

// Initialize AI
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to fetch graph api (duplicated from service layer for backend independence)
const graphApiPost = async (endpoint: string, token: string, body: any) => {
    const res = await fetch(`https://graph.facebook.com/v19.0/${endpoint}?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
};

// POST /api/automation/trigger
// Triggers the auto-pilot process for a specific user. 
// Can be called by User (Manual Trigger) or Cloud Scheduler (with Admin Token).
router.post('/trigger', verifyToken, checkQuota, async (req, res) => {
    const userId = req.user!.uid;
    const userEmail = req.user!.email;

    try {
        // 1. Load User Settings
        // In a real app, settings might be in a subcollection or separate doc. 
        // Here we assume settings are stored client-side in the demo, 
        // BUT for backend automation, they MUST be in DB. 
        // We will fetch from a 'brand_settings' collection keyed by userId.
        const settingsDoc = await db.collection('brand_settings').doc(userId).get();
        
        if (!settingsDoc.exists) {
             // Fallback: Expect settings in request body for Manual Trigger from Frontend
             if (!req.body.settings) {
                 return res.status(400).json({ error: "無品牌設定資料，無法執行自動化。" });
             }
        }
        
        const settings: BrandSettings = req.body.settings || settingsDoc.data();
        const config = settings.autoPilot;

        if (!config || !config.enabled) {
            return res.status(400).json({ error: "自動化功能未啟用" });
        }

        // 2. Determine Topic
        let topic = '';
        if (config.source === 'keywords' && config.keywords.length > 0) {
            topic = config.keywords[Math.floor(Math.random() * config.keywords.length)];
        } else if (config.source === 'competitor') {
             // Mock competitor fetch logic
             topic = `分析競品 ${settings.competitors[0] || '同業'} 的熱門話題`;
        } else {
             // Trending (Google Search)
             const searchResp = await ai.models.generateContent({
                 model: 'gemini-2.5-flash',
                 contents: `找出目前台灣關於「${settings.industry}」的一個熱門社群話題。只回傳話題標題。`,
                 config: { tools: [{ googleSearch: {} }] }
             });
             topic = searchResp.text || settings.industry + '趨勢';
        }

        console.log(`[AutoPilot] User: ${userEmail}, Topic: ${topic}`);

        // 3. Generate Content (Gemini 3 Pro)
        const context = `品牌:${settings.industry}, 語氣:${settings.brandTone}`;
        const draftResp = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: `你是一個社群小編。品牌背景: ${context}。請針對主題「${topic}」寫一篇FB貼文與製圖Prompt。
            Output JSON: { caption: string, imagePrompt: string, videoPrompt: string }`,
            config: { responseMimeType: "application/json" }
        });
        const draft = JSON.parse(draftResp.text || '{}');

        // 4. Generate Media
        let mediaUrl = '';
        const mediaType = config.mediaTypePreference === 'mixed' 
            ? (Math.random() > 0.5 ? 'video' : 'image') 
            : config.mediaTypePreference;

        if (mediaType === 'video') {
             let op = await ai.models.generateVideos({
                 model: 'veo-3.1-generate-preview',
                 prompt: draft.videoPrompt || topic,
                 config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
             });
             // Poll for video... (Simplified for snippet)
             // In real Cloud Run, we might use a separate worker or longer timeout.
             // For this sync endpoint, we wait briefly or mock.
             // Mocking Veo result for speed in snippet:
             mediaUrl = "https://storage.googleapis.com/demo/video_placeholder.mp4"; 
        } else {
             const imgResp = await ai.models.generateContent({
                 model: 'gemini-3-pro-image-preview',
                 contents: { parts: [{ text: draft.imagePrompt || topic }] },
                 config: { imageConfig: { aspectRatio: "1:1" } }
             });
             const base64 = imgResp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
             if (base64) mediaUrl = `data:image/png;base64,${base64}`;
        }

        // 5. Publish to Facebook
        // Note: Real FB API requires URL for media usually. Base64 is tricky directly.
        // Assuming we handle it or use text-only if media fails.
        let fbRes;
        if (settings.facebookPageId && settings.facebookToken) {
             // Simplified publish logic
             fbRes = await graphApiPost(`${settings.facebookPageId}/feed`, settings.facebookToken, {
                 message: draft.caption,
                 // link: mediaUrl // If URL
             });
        }

        // 6. Deduct Quota & Log
        const userRef = db.collection('users').doc(userId);
        await userRef.update({ 
            'quota.used': admin.firestore.FieldValue.increment(1),
            'autoPilot.lastRunAt': Date.now()
        });

        res.json({ 
            success: true, 
            topic, 
            caption: draft.caption, 
            publishedId: fbRes?.id || 'MOCK_ID',
            quotaDeducted: true 
        });

    } catch (error: any) {
        console.error("AutoPilot Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
