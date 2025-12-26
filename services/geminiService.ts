
import { BrandSettings, TrendingTopic, CachedTrendData, CtaItem, ViralType, ViralPlatform, TitleScore, ViralPostDraft, ThreadsAccount } from "../types";
import { db, firebase, isMock } from "./firebase";
import * as Prompts from "./promptTemplates";

// Local Type Definition
const Type = {
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  INTEGER: 'INTEGER',
  BOOLEAN: 'BOOLEAN',
  ARRAY: 'ARRAY',
  OBJECT: 'OBJECT'
};

// #region Utilities (Text & HTML)

const cleanJsonText = (text: string): string => {
    if (!text) return '{}';
    let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstOpen = clean.search(/[\{\[]/);
    const lastCloseCurly = clean.lastIndexOf('}');
    const lastCloseSquare = clean.lastIndexOf(']');
    const lastClose = Math.max(lastCloseCurly, lastCloseSquare);
    if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
        clean = clean.substring(firstOpen, lastClose + 1);
    }
    return clean;
};

const decodeHtml = (html: string) => {
    try {
        const txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    } catch (e) { return html; }
};

const isValidNewsImage = (url: string): boolean => {
    if (!url) return false;
    const lower = url.toLowerCase();
    const badKeywords = ['pixel', 'tracker', 'analytics', 'facebook.com/tr', 'ads', 'doubleclick', 'button', 'share_icon', 'logo', 'placeholder'];
    if (badKeywords.some(k => lower.includes(k))) return false;
    return true;
};

const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

const trackApiLoad = async () => {
    if (isMock) return;
    try {
        const randomSlot = Math.floor(Math.random() * 5) + 1;
        const keyField = `key_${randomSlot}`;
        await db.collection('system_stats').doc('api_usage').set({
            [keyField]: firebase.firestore.FieldValue.increment(1),
            total_calls: firebase.firestore.FieldValue.increment(1),
            last_active: Date.now()
        }, { merge: true });
    } catch (e) { }
};

// #endregion

// #region Backend & Cache Layer

const callBackend = async (action: string, payload: any) => {
    try {
        console.log(`[Backend Call] Action: ${action}`, payload.model ? `Model: ${payload.model}` : '');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 55000);

        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } 
        catch (e) { throw new Error(`Server returned invalid format: ${text.substring(0, 50)}...`); }
        
        if (!res.ok) throw new Error(data.error || 'Server Error');
        if (action !== 'getServiceStatus') trackApiLoad(); // Don't track monitoring calls
        return data;
    } catch (e: any) {
        console.error(`Backend API Error [${action}]:`, e);
        if (e.name === 'AbortError') throw new Error("請求逾時 (Server Timeout)。");
        throw e;
    }
};

const CACHE_TTL = 12 * 60 * 60 * 1000;

// Update Cache Key prefix to 'v2_' to invalidate old HK-biased cache
const checkTrendCache = async (industry: string): Promise<TrendingTopic[] | null> => {
    try {
        const dateKey = new Date().toISOString().split('T')[0];
        const cacheId = `v2_${dateKey}_${industry.replace(/\s+/g, '_')}`;
        const doc = await db.collection('global_trend_cache').doc(cacheId).get();
        if (doc.exists) {
            const data = doc.data() as CachedTrendData;
            if ((Date.now() - data.createdAt) < CACHE_TTL && data.topics?.length > 0) return data.topics;
        }
    } catch (e) { console.warn("Cache read failed", e); }
    return null;
};

const saveTrendCache = async (industry: string, topics: TrendingTopic[]) => {
    try {
        const dateKey = new Date().toISOString().split('T')[0];
        const cacheId = `v2_${dateKey}_${industry.replace(/\s+/g, '_')}`;
        await db.collection('global_trend_cache').doc(cacheId).set({ id: cacheId, industry, topics, createdAt: Date.now() });
    } catch (e) { console.warn("Cache write failed", e); }
};

// #endregion

// #region Core Services

export const getApiServiceStatus = async (): Promise<{ keyStatus: boolean[], totalConfigured: number, hasOpenAI: boolean }> => {
    if (isMock) return { keyStatus: [true, true, true, false, false], totalConfigured: 3, hasOpenAI: true };
    try {
        return await callBackend('getServiceStatus', {});
    } catch (e) {
        console.error("Status check failed", e);
        return { keyStatus: [false, false, false, false, false], totalConfigured: 0, hasOpenAI: false };
    }
};

export const getTrendingTopics = async (industry: string = "台灣熱門時事", requestedCount: number = 10): Promise<TrendingTopic[]> => {
  let cached = await checkTrendCache(industry) || [];
  if (cached.length >= requestedCount) return shuffleArray(cached).slice(0, requestedCount);

  let fetchedTopics: TrendingTopic[] = cached.length === 0 ? await fetchRealtimeRss(industry) : [];
  let combined = [...cached, ...fetchedTopics];
  const uniqueMap = new Map();
  combined.forEach(t => uniqueMap.set(t.title, t));
  combined = Array.from(uniqueMap.values());

  const deficit = requestedCount - combined.length;
  if (deficit > 0) {
      const existingTitles = combined.map(t => t.title).slice(0, 20).join(", ");
      try {
        const response = await callBackend('generateContent', {
            model: 'gemini-2.5-flash',
            contents: `Role: Trend Hunter. Generate ${Math.max(5, deficit + 2)} NEW trending topics about "${industry}" in Taiwan (Traditional Chinese ONLY, NO Hong Kong news). DO NOT include: [${existingTitles}]. Output: Pure JSON Array: [{ "title": "...", "description": "...", "url": "#" }]`,
            config: { responseMimeType: "application/json" }
        });
        const raw = JSON.parse(cleanJsonText(response.text || '[]'));
        if (Array.isArray(raw)) {
            const aiTopics = raw.map((t: any) => ({ title: t.title, description: t.description || t.title, url: t.url || '#', imageUrl: undefined }));
            combined = [...combined, ...aiTopics];
        }
      } catch (e) { console.error("Gemini bypass generation failed", e); }
  }

  const finalMap = new Map();
  combined.forEach(t => finalMap.set(t.title, t));
  const finalTopics = Array.from(finalMap.values());
  if (finalTopics.length > 0) await saveTrendCache(industry, finalTopics);

  return shuffleArray(finalTopics).slice(0, requestedCount);
};

// #region Generators & Other Services...
// (Existing methods unchanged)

const fetchRssContent = async (targetUrl: string): Promise<string> => {
    const data = await callBackend('fetchRss', { url: targetUrl });
    if (!data.text) throw new Error("Backend returned empty RSS content");
    return data.text;
};

export const fetchNewsImageFromUrl = async (url: string): Promise<string | null> => {
    if (!url) return null;
    try {
        const data = await callBackend('fetchOgImage', { url });
        if (data.imageUrl && isValidNewsImage(data.imageUrl)) return data.imageUrl;
    } catch (e) { console.warn("Backend OG fetch failed", e); }
    return null;
};

const extractImageUrlFromItem = (item: Element): string => {
    let imageUrl = '';
    const mediaContent = item.getElementsByTagName('media:content')[0];
    if (mediaContent) imageUrl = mediaContent.getAttribute('url') || '';
    if (!imageUrl) {
        const enclosure = item.getElementsByTagName('enclosure')[0];
        if (enclosure && (enclosure.getAttribute('type') || '').startsWith('image')) imageUrl = enclosure.getAttribute('url') || '';
    }
    if (!imageUrl) {
        const descRaw = item.querySelector("description")?.textContent || "";
        const match = decodeHtml(descRaw).match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match && match[1] && isValidNewsImage(match[1])) imageUrl = match[1];
    }
    if (imageUrl && (imageUrl.includes('googleusercontent.com') || imageUrl.includes('ggpht.com'))) {
        imageUrl = imageUrl.replace(/=[wh]\d+[-a-z0-9]*/, '=w800') + (imageUrl.match(/=[wh]\d+/) ? '' : '=w800');
    }
    return imageUrl;
};

const fetchRealtimeRss = async (keyword: string): Promise<TrendingTopic[]> => {
    // Fix: Force 'Taiwan' in query to prevent IP-based localization (US Server -> HK/Global Chinese results)
    const queryTerm = keyword.includes('台灣') || keyword.includes('Taiwan') ? keyword : `${keyword} 台灣`;
    
    // Yahoo TW is mostly deprecated or redirects, sticking to Google News with strict location
    const isYahooKeyword = ['台灣熱門時事', '今日新聞', '熱門話題', '新聞', 'News'].some(k => keyword.includes(k));
    
    // Construct Google News URL with explicit Taiwan bias
    // q=KEYWORD+when:2d
    // hl=zh-TW (UI Language)
    // gl=TW (Geo Location)
    // ceid=TW:zh-Hant (Content Edition)
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(queryTerm)}+when:2d&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;

    try {
        const xmlString = await fetchRssContent(rssUrl);
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlString, "text/xml");
        const items = xml.querySelectorAll("item");
        const results: TrendingTopic[] = [];
        
        for (let i = 0; i < Math.min(items.length, 20); i++) {
            const item = items[i];
            const title = item.querySelector("title")?.textContent || "";
            const link = item.querySelector("link")?.textContent || "";
            const imageUrl = extractImageUrlFromItem(item);
            if (title && link) results.push({ title, description: title, url: link, imageUrl });
        }
        return results;
    } catch (e) { return []; }
};

// Updated: Returns pure string style guide
export const analyzeBrandTone = async (posts: string[]): Promise<string> => {
    if (!posts || posts.length === 0) throw new Error("無貼文可分析");
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: Prompts.buildAnalysisPrompt(posts.join('\n\n---\n\n')),
        // No JSON schema, we want a descriptive text block
    });
    return response.text || "Style analysis failed.";
};

// New: Analyze Threads Style Specifically
export const analyzeThreadsStyle = async (posts: string[]): Promise<string> => {
    if (!posts || posts.length === 0) throw new Error("無貼文可分析");
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: Prompts.buildThreadsAnalysisPrompt(posts.join('\n\n---\n\n'))
    });
    return response.text || "Threads style analysis failed.";
};

export const analyzeProductFile = async (text: string): Promise<string> => {
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: `Task: Analyze product file and extract marketing USP, pain points, specs, and audience. Content: ${text.substring(0, 15000)}`
    });
    return response.text || "";
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

export const generateViralTitles = async (topic: string, options: { audience: string; viralType: ViralType; }): Promise<string[]> => {
    const prompt = `Role: Viral Title Expert. Topic: ${topic}. Audience: ${options.audience}. Type: ${options.viralType}. Generate 5 clickbait titles. Output JSON Array.`;
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash", 
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } }
    });
    try { return JSON.parse(cleanJsonText(response.text || '[]')); } catch (e) { return [topic]; }
};

export const scoreViralTitles = async (titles: string[]): Promise<TitleScore[]> => {
    const prompt = `Role: Click-Through Rate Predictor. Score these titles (0-10 on Emotion, Curiosity, Identity, Specific, Authenticity). Total max 50. Input: ${JSON.stringify(titles)}. Output JSON Array with scores.`;
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        score: { type: Type.NUMBER },
                        breakdown: { type: Type.OBJECT, properties: { emotion: { type: Type.NUMBER }, curiosity: { type: Type.NUMBER }, identity: { type: Type.NUMBER }, specific: { type: Type.NUMBER }, authenticity: { type: Type.NUMBER } } },
                        comment: { type: Type.STRING }
                    }
                }
            }
        }
    });
    return JSON.parse(cleanJsonText(response.text || '[]'));
};

export const generateViralContent = async (topic: string, options: { audience: string; viralType: string | 'auto'; platform: ViralPlatform; versionCount: number; }, settings: BrandSettings): Promise<ViralPostDraft> => {
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash", 
        contents: Prompts.buildViralPrompt(topic, options, settings),
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: { 
                    caption: { type: Type.STRING }, 
                    imagePrompt: { type: Type.STRING } 
                }
            }
        }
    });
    
    // Safety Parsing
    let data;
    try {
        data = JSON.parse(cleanJsonText(response.text || '{}'));
    } catch (e) {
        // Fallback if schema fails violently
        console.error("JSON Parse Error in Viral Content", e);
        return { versions: ["生成失敗，請重試。"], imagePrompt: "" };
    }

    // Map new flat structure to expected interface
    return {
        versions: [data.caption || '內容生成異常。'],
        imagePrompt: data.imagePrompt || ''
    };
};

export const generatePostDraft = async (topic: string, settings: BrandSettings, options: { length: string, ctaList: CtaItem[], tempHashtags: string, includeEngagement?: boolean, imageText?: string }, topicContext?: TrendingTopic, userRole: string = 'user') => {
  const isHighTier = ['business', 'admin'].includes(userRole);
  const response = await callBackend('generateContent', {
    model: isHighTier ? "gemini-3-pro-preview" : "gemini-2.5-flash",
    contents: Prompts.buildDraftPrompt(topic, settings, options, topicContext),
    config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { caption: { type: Type.STRING }, ctaText: { type: Type.STRING }, imagePrompt: { type: Type.STRING }, videoPrompt: { type: Type.STRING } }
        }
    }
  });
  return JSON.parse(cleanJsonText(response.text || '{}'));
};

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
        const safetySettings = noLimitTrigger ? [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }] : undefined; // Simplified safety
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
        const img = await generateImage(prompt, 'pro'); 
        throw new Error(`影片生成失敗，已降級為圖片: ${e.message}`);
    }
};

export const generateSeoArticle = async (topic: string, length: string, keywords: string, options: { agenda: boolean, meta: boolean, faq: boolean, refLinks: boolean }) => {
    let searchContext = "";
    try {
         const searchResp = await callBackend('generateContent', {
            model: "gemini-2.5-flash",
            contents: `Research SEO content for topic: ${topic}. Keywords: ${keywords}`,
            config: { tools: [{ googleSearch: {} }] } 
        });
        searchContext = searchResp.text || "";
    } catch (e) { }

    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: `Context: ${searchContext}\n\n${Prompts.buildSeoArticlePrompt(topic, length, keywords, options)}`,
        config: { 
            responseMimeType: "application/json",
            responseSchema: { type: Type.OBJECT, properties: { fullText: { type: Type.STRING }, imageKeyword: { type: Type.STRING } } }
        }
    });
    try { return JSON.parse(cleanJsonText(response.text || '{}')); } catch (e) { throw new Error("Failed to parse SEO article JSON"); }
};

export const generateWeeklyReport = async (analytics: any, settings: BrandSettings, topPosts?: any) => {
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: `Act as a senior social media analyst. Brand: ${settings.industry}. Metrics: Followers ${analytics.followers}, Reach ${analytics.reach}, Engagement ${analytics.engagementRate}%. Write a weekly performance report in Traditional Chinese.`
    });
    return response.text || "報告生成失敗";
};

// UPDATED: Now supports accountType and styleGuide overrides
export const generateThreadsBatch = async (topic: string, count: number, settings: BrandSettings, personas: string[] = []): Promise<any[]> => {
    
    let systemInstruction = Prompts.getThreadsSystemInstruction('personal'); // Default
    
    // If the caller passed a specific instruction string (from ThreadsNurturePanel), use it.
    if (personas.length > 0 && personas[0].includes('[MODE:')) {
        systemInstruction = personas[0];
    } else {
        // Fallback to generic personal
        systemInstruction = Prompts.getThreadsSystemInstruction('personal');
    }

    const prompt = `${systemInstruction}\nTask: Generate ${count} distinct Threads posts about: "${topic}". For imagePrompt use DETAILED ENGLISH suitable for Midjourney. Output JSON Array: [{ "caption": "...", "imagePrompt": "...", "imageQuery": "..." }]`;

    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash", 
        contents: prompt,
        config: { 
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.OBJECT, properties: { caption: { type: Type.STRING }, imagePrompt: { type: Type.STRING }, imageQuery: { type: Type.STRING } } }
            }
        }
    });
    return JSON.parse(cleanJsonText(response.text || '[]'));
};

export const generateCommentReply = async (commentText: string, personaPrompt: string): Promise<string[]> => {
    const prompt = `${Prompts.SYSTEM_INSTRUCTION_THREADS}\n[Persona]: ${personaPrompt}\nTask: Reply to comment: "${commentText}". Generate 3 options. Output JSON Array string.`;
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } }
    });
    return JSON.parse(cleanJsonText(response.text || '[]'));
};

export const applyTextOverlay = async (imageUrl: string, text: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
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
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
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
