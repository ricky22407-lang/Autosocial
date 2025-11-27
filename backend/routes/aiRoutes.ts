
import { Router } from 'express';
import { GoogleGenAI, Type } from "@google/genai";
import { verifyToken, checkQuota } from '../middleware/auth';
import * as admin from 'firebase-admin';

const router = Router();
const db = admin.firestore();

// Initialize AI Client server-side
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// POST /api/ai/draft - Generate Post Draft
router.post('/draft', verifyToken, checkQuota, async (req, res) => {
  const { topic, brand, options } = req.body;
  
  try {
    const context = `
      品牌名稱: AutoSocial
      產業類別: ${brand.industry}
      服務項目: ${brand.services}
      產品資訊: ${brand.productInfo}
      品牌語氣: ${brand.brandTone}
      小編人設: ${brand.persona}
      競品參考: ${brand.competitors.join(', ')}
      參考資料: ${brand.referenceFiles.map((f: any) => f.content.substring(0, 500)).join('... ')}
    `;

    const allHashtags = `${brand.fixedHashtags || ''} ${options.tempHashtags || ''}`.trim();
    const ctaInstruction = options.ctaLinks.length > 0 
      ? `包含以下連結的行動呼籲 (CTA)，請撰寫一段吸引人的文字引導點擊：\n${options.ctaLinks.join('\n')}` 
      : '無';

    const prompt = `
      你是一位專精於台灣市場的專業社群媒體經理。
      品牌背景資訊: ${context}
      任務: 請針對主題「${topic}」創作一篇 Facebook 貼文。
      貼文要求：
      1. 字數範圍: ${options.length} (請嚴格遵守)。
      2. 行動呼籲 (CTA): ${ctaInstruction}。 (請將 CTA 文字單獨生成，不要直接合併在 caption 中)。
      3. 必備標籤 (Hashtags): ${allHashtags} (請列於文末)。
      
      請依照以下步驟輸出 JSON 格式：
      1. caption: 貼文文案 (繁體中文，台灣用語，包含Emoji)。結尾請加上 Hashtags。
      2. ctaText: CTA 文字段落 (包含連結)，若無連結則留空。
      3. imagePrompt: AI 圖片生成提示詞 (繁體中文)。
      4. videoPrompt: AI 影片生成 (Veo) 提示詞 (繁體中文)。
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            caption: { type: Type.STRING },
            ctaText: { type: Type.STRING },
            imagePrompt: { type: Type.STRING },
            videoPrompt: { type: Type.STRING }
          }
        }
      }
    });

    // Deduct Quota
    const userRef = db.collection('users').doc(req.user!.uid);
    await userRef.update({ 'quota.used': admin.firestore.FieldValue.increment(1) });

    res.json(JSON.parse(response.text || '{}'));

  } catch (error: any) {
    console.error("AI Gen Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/image - Generate Image
router.post('/image', verifyToken, checkQuota, async (req, res) => {
  const { prompt } = req.body;
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
    });

    let imageUrl = '';
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
        }
    }
    
    if (!imageUrl) throw new Error("No image generated");

    // Deduct Quota
    const userRef = db.collection('users').doc(req.user!.uid);
    await userRef.update({ 'quota.used': admin.firestore.FieldValue.increment(1) });

    res.json({ url: imageUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/video - Generate Video
router.post('/video', verifyToken, checkQuota, async (req, res) => {
    const { prompt } = req.body;
    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            prompt: prompt,
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
        });

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }

        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!videoUri) throw new Error("Video generation failed");

        // Append Server Key
        const finalUrl = `${videoUri}&key=${process.env.API_KEY}`;

        // Deduct Quota
        const userRef = db.collection('users').doc(req.user!.uid);
        await userRef.update({ 'quota.used': admin.firestore.FieldValue.increment(1) });

        res.json({ url: finalUrl });

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
