
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
    intent: ImageIntent = 'lifestyle',
    textOverlay?: string, // Deprecated for Smart Layout, used for AI rendering
    useSmartLayout: boolean = false // New Flag
): Promise<string> => {
    const noLimitTrigger = /no limit/i.test(prompt);
    let basePrompt = prompt.replace(/no limit/ig, '').trim();
    
    // 1. Construct the Commercial Design Prompt
    let finalPrompt = "";
    if (settings) {
        const englishSubject = await ensureEnglishPrompt(basePrompt);
        
        // If Smart Layout is ON, we DON'T ask AI to render text. We ask for Negative Space.
        // If Smart Layout is OFF, we pass textOverlay to let AI try rendering it.
        finalPrompt = buildCommercialImagePrompt(
            englishSubject, 
            settings, 
            intent, 
            userRole, 
            useSmartLayout ? undefined : textOverlay, 
            useSmartLayout
        );
    } else {
        finalPrompt = await ensureEnglishPrompt(basePrompt);
        finalPrompt += ", photorealistic, cinematic lighting";
    }

    console.log("🎨 [ImageGen Prompt]", finalPrompt);

    // 2. Select Engine
    const isProTier = ['pro', 'business', 'admin'].includes(userRole);
    let imageUrl = "";

    if (!isProTier) {
         console.log("🎨 [ImageGen] Economy Mode: Pollinations");
         imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?n=${Math.floor(Math.random()*100000)}&model=flux&enhance=true`;
    } else {
        try {
            console.log(`🎨 [ImageGen] Pro Mode: calling Backend Waterfall`);
            const safetySettings = noLimitTrigger ? [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }] : undefined;
            
            const response = await callBackend('generateImages', { 
                prompt: finalPrompt, 
                safetySettings 
            });
            
            if (response.base64) {
                imageUrl = `data:image/png;base64,${response.base64}`;
            } else {
                throw new Error("No image data");
            }
        } catch (e: any) {
            console.error("❌ [ImageGen] Backend Failed. Fallback to Pollinations.", e.message);
            imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?n=${Math.floor(Math.random()*100000)}&model=flux&enhance=true`;
        }
    }

    return imageUrl;
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

/**
 * Smart Layout Engine: Composites text onto the image using Canvas.
 * Creates a cinematic "subtitle" style layout at the bottom.
 */
export const compositeImageWithText = async (
    imageUrl: string, 
    title: string, 
    subtitle?: string,
    colorTheme: string = '#FFD700' // Gold default
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageUrl;
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(imageUrl); return; }

            // Set canvas size to match image
            canvas.width = img.width;
            canvas.height = img.height;

            // 1. Draw Base Image
            ctx.drawImage(img, 0, 0);

            // 2. Draw Cinematic Gradient (Bottom Up)
            // This ensures text is readable even on white backgrounds
            const gradientHeight = canvas.height * 0.4; // Bottom 40%
            const gradient = ctx.createLinearGradient(0, canvas.height - gradientHeight, 0, canvas.height);
            gradient.addColorStop(0, "rgba(0,0,0,0)");
            gradient.addColorStop(0.6, "rgba(0,0,0,0.7)");
            gradient.addColorStop(1, "rgba(0,0,0,0.9)");
            
            ctx.fillStyle = gradient;
            ctx.fillRect(0, canvas.height - gradientHeight, canvas.width, gradientHeight);

            // 3. Text Configuration
            const padding = canvas.width * 0.05;
            const bottomMargin = canvas.height * 0.08;
            
            // Subtitle (Price/Tag) - Drawn at the very bottom
            let currentBottom = canvas.height - bottomMargin;
            
            if (subtitle) {
                const subFontSize = Math.floor(canvas.width * 0.05); // 5% of width
                ctx.font = `bold ${subFontSize}px "Noto Sans TC", sans-serif`;
                ctx.textAlign = "left";
                ctx.fillStyle = colorTheme; // Accent Color
                ctx.shadowColor = "rgba(0,0,0,0.8)";
                ctx.shadowBlur = 4;
                ctx.fillText(subtitle, padding, currentBottom);
                currentBottom -= (subFontSize * 1.5);
            }

            // Title - Drawn above subtitle
            if (title) {
                const titleFontSize = Math.floor(canvas.width * 0.07); // 7% of width
                ctx.font = `900 ${titleFontSize}px "Noto Sans TC", sans-serif`;
                ctx.textAlign = "left";
                ctx.fillStyle = "#FFFFFF";
                ctx.shadowColor = "rgba(0,0,0,0.8)";
                ctx.shadowBlur = 10;
                
                // Simple Word Wrap for Title
                const words = title.split('');
                let line = '';
                const lines = [];
                const maxWidth = canvas.width - (padding * 2);

                for(let n = 0; n < words.length; n++) {
                    const testLine = line + words[n];
                    const metrics = ctx.measureText(testLine);
                    if (metrics.width > maxWidth && n > 0) {
                        lines.push(line);
                        line = words[n];
                    } else {
                        line = testLine;
                    }
                }
                lines.push(line);

                // Draw lines bottom-up
                for (let i = lines.length - 1; i >= 0; i--) {
                    ctx.fillText(lines[i], padding, currentBottom);
                    currentBottom -= (titleFontSize * 1.3);
                }
            }

            resolve(canvas.toDataURL('image/png'));
        };

        img.onerror = (e) => {
            console.error("Canvas Load Failed", e);
            resolve(imageUrl); // Return original if fail
        };
    });
};
