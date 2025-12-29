
import { callBackend } from './core';
import { BrandSettings, ImageIntent } from '../../types';
import { buildCommercialImagePrompt } from '../promptTemplates';

const ensureEnglishPrompt = async (prompt: string): Promise<string> => {
    if (/^[\x00-\x7F]*$/.test(prompt)) return prompt;
    try {
        const response = await callBackend('generateContent', {
            model: 'gemini-2.5-flash',
            contents: `Translate to descriptive English image prompt: "${prompt}". Output ONLY string.`
        });
        return response.text.trim();
    } catch (e) { return prompt; }
};

export const generateImage = async (
    prompt: string, 
    userRole: string = 'user', 
    settings?: BrandSettings, 
    intent: ImageIntent = 'lifestyle'
): Promise<string> => {
    const noLimitTrigger = /no limit/i.test(prompt);
    let basePrompt = prompt.replace(/no limit/ig, '').trim();
    
    // 1. Construct the Commercial Design Prompt
    let finalPrompt = "";
    if (settings) {
        const englishSubject = await ensureEnglishPrompt(basePrompt);
        finalPrompt = buildCommercialImagePrompt(englishSubject, settings, intent, userRole);
    } else {
        finalPrompt = await ensureEnglishPrompt(basePrompt);
        finalPrompt += ", photorealistic, cinematic lighting, photography style";
    }

    console.log("🎨 [Commercial Design Prompt]", finalPrompt);

    // 2. Select Engine
    // 'pro', 'business', 'admin' -> Priority: Backend Waterfall (Ideogram -> Imagen -> Grok)
    // 'user', 'starter' -> Frontend Economy Mode (Pollinations)
    
    const isProTier = ['pro', 'business', 'admin'].includes(userRole);

    if (!isProTier) {
         console.log("🎨 [ImageGen] Economy Mode: Pollinations");
         return `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?n=${Math.floor(Math.random()*100000)}&model=flux&enhance=true`;
    }

    try {
        console.log(`🎨 [ImageGen] Pro Mode: calling Backend Waterfall`);
        const safetySettings = noLimitTrigger ? [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }] : undefined;
        
        // We call 'generateImages'. The backend now handles the waterfall (Ideogram -> Imagen -> Grok).
        // We don't specify model here to let backend decide based on keys.
        const response = await callBackend('generateImages', { 
            prompt: finalPrompt, 
            safetySettings 
        });
        
        if (response.base64) {
            console.log(`✅ Image generated via provider: ${response.provider || 'unknown'}`);
            return `data:image/png;base64,${response.base64}`;
        }
        throw new Error("No image data");
    } catch (e: any) {
        console.error("❌ [ImageGen] Backend Failed. Fallback to Pollinations.", e.message);
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?n=${Math.floor(Math.random()*100000)}&model=flux&enhance=true`;
    }
};

export const generateVideo = async (prompt: string): Promise<string> => {
    try {
        const response = await callBackend('generateVideos', {
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
        });
        if (response.videoBase64) return `data:video/mp4;base64,${response.videoBase64}`;
        throw new Error("No video data returned");
    } catch (e: any) {
        console.warn("Veo failed, fallback to Image:", e);
        throw new Error(`影片生成失敗: ${e.message}`);
    }
};

export const analyzeVisualStyle = async (imageB64s: string[]): Promise<string> => {
    const parts = [
        { text: "Role: Art Director. Analyze these brand images and extract a consistent 'Visual Style Prompt' (Lighting, Color, Composition, Mood). Output concise English paragraph." },
        ...imageB64s.map(b64 => ({ inlineData: { mimeType: "image/png", data: b64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '') } }))
    ] as any;

    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: { parts }
    });
    return response.text || "Minimalist, clean, high-key lighting.";
};

export const applyWatermark = async (mainImageUrl: string, logoUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (typeof document === 'undefined') { reject(new Error("Canvas not supported")); return; }
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error("Canvas context not supported")); return; }
        const mainImg = new Image(); mainImg.crossOrigin = "anonymous"; mainImg.src = mainImageUrl;
        mainImg.onload = () => {
            canvas.width = mainImg.width; canvas.height = mainImg.height; ctx.drawImage(mainImg, 0, 0);
            const logoImg = new Image(); logoImg.crossOrigin = "anonymous"; logoImg.src = logoUrl;
            logoImg.onload = () => {
                const logoW = canvas.width * 0.15; const logoH = (logoImg.height/logoImg.width)*logoW;
                const p = canvas.width * 0.05; ctx.globalAlpha = 0.9; ctx.drawImage(logoImg, canvas.width-logoW-p, canvas.height-logoH-p, logoW, logoH);
                resolve(canvas.toDataURL('image/png'));
            };
            logoImg.onerror = () => resolve(mainImageUrl);
        };
        mainImg.onerror = (e) => reject(new Error("Main image load failed"));
    });
};
