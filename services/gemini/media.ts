
import { callBackend } from './core';

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

export const generateImage = async (prompt: string, userRole: string = 'user', stylePrompt?: string): Promise<string> => {
    const noLimitTrigger = /no limit/i.test(prompt);
    let finalPrompt = prompt.replace(/no limit/ig, '').trim();
    const effectiveRole = noLimitTrigger ? 'admin' : userRole;
    const isPaidImageTier = ['pro', 'business', 'admin'].includes(effectiveRole);
    const englishPrompt = await ensureEnglishPrompt(finalPrompt);
    
    let enhancedPrompt = "";
    const isXHS = /handwritten note style|xiaohongshu|note/i.test(stylePrompt || '');
    if (isXHS) enhancedPrompt = `${englishPrompt}. Style: Xiaohongshu note, beige background, handwritten-like font overlay, lifestyle vibe.`;
    else if (stylePrompt) enhancedPrompt = `${englishPrompt}. Visual Style: ${stylePrompt}. Photorealistic.`;
    else enhancedPrompt = `${englishPrompt}, photorealistic, cinematic lighting, photography style`;

    if (!isPaidImageTier) {
         console.log("🎨 [ImageGen] Economy Mode: Pollinations");
         return `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?n=${Math.floor(Math.random()*100000)}&model=flux&enhance=true`;
    }

    try {
        console.log(`🎨 [ImageGen] Pro Mode: Backend`);
        const safetySettings = noLimitTrigger ? [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }] : undefined;
        const response = await callBackend('generateImages', { model: 'imagen-3.0-generate-002', prompt: enhancedPrompt, safetySettings });
        if (response.base64) return `data:image/png;base64,${response.base64}`;
        throw new Error("No image data");
    } catch (e: any) {
        console.error("❌ [ImageGen] Backend Failed. Fallback.", e.message);
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?n=${Math.floor(Math.random()*100000)}&model=flux&enhance=true`;
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
        // Fallback check logic relies on caller to handle error or use image
        // Here we just rethrow so automation client can decide to fallback
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

export const applyTextOverlay = async (imageUrl: string, text: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (typeof document === 'undefined') { reject(new Error("Canvas not supported in this env")); return; }
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error("Canvas context not supported")); return; }
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageUrl;
        img.onload = () => {
            canvas.width = img.width; canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const fontSize = Math.floor(canvas.width * 0.08);
            ctx.font = `bold ${fontSize}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const maxWidth = canvas.width * 0.9;
            let line = '', lines = [];
            for(let i = 0; i < text.length; i++) {
                const char = text[i]; const testLine = line + char;
                if (ctx.measureText(testLine).width > maxWidth && i > 0) { lines.push(line); line = char; } else { line = testLine; }
            }
            lines.push(line);
            const totalHeight = lines.length * (fontSize * 1.2); const padding = fontSize; const bgY = canvas.height - totalHeight - (padding * 2);
            const gradient = ctx.createLinearGradient(0, bgY - 50, 0, canvas.height);
            gradient.addColorStop(0, "rgba(0, 0, 0, 0)"); gradient.addColorStop(0.3, "rgba(0, 0, 0, 0.6)"); gradient.addColorStop(1, "rgba(0, 0, 0, 0.9)");
            ctx.fillStyle = gradient; ctx.fillRect(0, bgY - 50, canvas.width, canvas.height - (bgY - 50));
            let y = canvas.height - totalHeight - padding + (fontSize/2);
            lines.forEach(l => { ctx.shadowColor="rgba(0,0,0,0.8)"; ctx.shadowBlur=15; ctx.lineWidth=fontSize*0.05; ctx.strokeStyle='black'; ctx.strokeText(l,canvas.width/2,y); ctx.fillStyle='white'; ctx.fillText(l,canvas.width/2,y); y+=fontSize*1.2; });
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (e) => reject(new Error("Image load failed"));
    });
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
