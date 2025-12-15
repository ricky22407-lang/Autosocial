// REFACTOR ONLY: no functional changes

import { BrandSettings, TrendingTopic, CachedTrendData, CtaItem, ViralType, ViralPlatform, TitleScore, ViralPostDraft } from "../types";
import { db } from "./firebase"; // Using compat export

// Local Type Definition
const Type = {
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  INTEGER: 'INTEGER',
  BOOLEAN: 'BOOLEAN',
  ARRAY: 'ARRAY',
  OBJECT: 'OBJECT'
};

// System Prompts
const SYSTEM_INSTRUCTION_THREADS = `
[System Instruction: Threads Platform Vibe & Cognitive Framework]
Target Audience: Taiwan (Traditional Chinese users).
Role: You are a "Native Threads User" (脆友). You are NOT a social media manager, copywriter, or bot.

[Core Philosophy: The "Murmur" Aesthetic]
Threads in Taiwan is a mix of group therapy, trash talk, and stream-of-consciousness.
- **Mental State:** You are slightly unhinged, observant, cynical, or aggressively supportive.
- **The "Anti-Structure":** Do NOT write structured posts with Intro/Body/Conclusion.
- **In Medias Res:** Start in the middle of a thought. No warmup.
- **Validation Seeking:** We post to find resonance (共鳴), not to educate.

[Dynamic Tone Guidelines (Mix & Match these vibes)]
1. The "Exhausted" (厭世): Low energy, complaining about work/life/stupid people. (e.g., "到底為什麼...")
2. The "Shocked" (吃瓜): Reacting to news with disbelief or sarcasm. (e.g., "只有我覺得...")
3. The "Confused" (問號): Asking genuine or rhetorical questions about social norms.
4. The "Affectionate" (暈船/討拍): Overly emotional about small things.

[Strict "Do Nots" - The Uncanny Valley Check]
- ❌ NEVER start with "大家好" (Hello everyone) or "小編" (Editor).
- ❌ NEVER use "In conclusion" or summary statements.
- ❌ NEVER use a block of hashtags like Instagram. (Max 0-1 hashtag, only for irony).
- ❌ NEVER be overly polite. Be raw.
- ❌ Avoid repeating specific slang (like "笑死", "確", "家人們") unless it fits perfectly contextually. Variety is key.

[Visual Formatting]
- Use frequent line breaks to create "vertical rhythm".
- Sentences should be short, punchy, and sometimes fragmented.
- Lowercase aesthetic (if using English) is preferred but not mandatory.
`;

// #region Utilities (Text & HTML)

const cleanJsonText = (text: string): string => {
    if (!text) return '{}';
    // Remove markdown code blocks and potential noise
    let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Find the first opening brace/bracket
    const firstOpen = clean.search(/[\{\[]/);
    
    // Find the last closing brace/bracket
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
    } catch (e) {
        return html;
    }
};

const isValidNewsImage = (url: string): boolean => {
    if (!url) return false;
    const lower = url.toLowerCase();
    const badKeywords = [
        'pixel', 'tracker', 'analytics', 'facebook.com/tr', 'ads', 
        'doubleclick', 'button', 'share_icon', 'logo', 'placeholder'
    ];
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

// #endregion

// #region Backend & Cache Layer

// --- Backend API Caller ---
const callBackend = async (action: string, payload: any) => {
    try {
        console.log(`[Backend Call] Action: ${action}`, payload.model ? `Model: ${payload.model}` : '');
        
        // Timeout handling
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
        
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error("Non-JSON response from backend:", text.substring(0, 100));
            throw new Error(`Server returned invalid format: ${text.substring(0, 50)}...`);
        }
        
        if (!res.ok) {
            console.error(`[Backend Call Error] Status: ${res.status}`, data);
            throw new Error(data.error || 'Server Error');
        }
        return data;
    } catch (e: any) {
        console.error(`Backend API Error [${action}]:`, e);
        if (e.name === 'AbortError') {
            throw new Error("請求逾時 (Server Timeout)。請重試或改用較簡單的指令。");
        }
        throw e;
    }
};

// --- Cache Logic (Firebase) ---
const CACHE_TTL = 12 * 60 * 60 * 1000;

const checkTrendCache = async (industry: string): Promise<TrendingTopic[] | null> => {
    try {
        const dateKey = new Date().toISOString().split('T')[0];
        const cacheId = `${dateKey}_${industry.replace(/\s+/g, '_')}`;
        const doc = await db.collection('global_trend_cache').doc(cacheId).get();
        if (doc.exists) {
            const data = doc.data() as CachedTrendData;
            const age = Date.now() - data.createdAt;
            if (age < CACHE_TTL && data.topics && data.topics.length > 0) {
                console.log(`[TrendCache] Hit: ${cacheId}`);
                return shuffleArray(data.topics);
            }
        }
    } catch (e) { console.warn("Cache read failed", e); }
    return null;
};

const saveTrendCache = async (industry: string, topics: TrendingTopic[]) => {
    try {
        const dateKey = new Date().toISOString().split('T')[0];
        const cacheId = `${dateKey}_${industry.replace(/\s+/g, '_')}`;
        await db.collection('global_trend_cache').doc(cacheId).set({
            id: cacheId, industry, topics, createdAt: Date.now()
        });
        console.log(`[TrendCache] Saved: ${cacheId}`);
    } catch (e) { console.warn("Cache write failed", e); }
};

// #endregion

// #region RSS & News Fetching

const fetchRssContent = async (targetUrl: string): Promise<string> => {
    const data = await callBackend('fetchRss', { url: targetUrl });
    if (!data.text) throw new Error("Backend returned empty RSS content");
    return data.text;
};

export const fetchNewsImageFromUrl = async (url: string): Promise<string | null> => {
    if (!url) return null;
    try {
        const data = await callBackend('fetchOgImage', { url });
        if (data.imageUrl && isValidNewsImage(data.imageUrl)) {
            return data.imageUrl;
        }
    } catch (e) {
        console.warn("Backend OG fetch failed", e);
    }
    return null;
};

const extractImageUrlFromItem = (item: Element): string => {
    let imageUrl = '';
    
    // Check media:content
    const mediaContent = item.getElementsByTagName('media:content')[0];
    if (mediaContent) imageUrl = mediaContent.getAttribute('url') || '';
    
    // Check enclosure
    if (!imageUrl) {
        const enclosure = item.getElementsByTagName('enclosure')[0];
        if (enclosure && (enclosure.getAttribute('type') || '').startsWith('image')) {
            imageUrl = enclosure.getAttribute('url') || '';
        }
    }
    
    // Check description HTML
    if (!imageUrl) {
        const descRaw = item.querySelector("description")?.textContent || "";
        const descHtml = decodeHtml(descRaw);
        const match = descHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match && match[1] && isValidNewsImage(match[1])) imageUrl = match[1];
    }

    // Fix googleusercontent URLs resolution
    if (imageUrl && (imageUrl.includes('googleusercontent.com') || imageUrl.includes('ggpht.com'))) {
        if (imageUrl.match(/=[wh]\d+/)) imageUrl = imageUrl.replace(/=[wh]\d+[-a-z0-9]*/, '=w800');
        else imageUrl += '=w800';
    }

    return imageUrl;
};

const fetchRealtimeRss = async (keyword: string): Promise<TrendingTopic[]> => {
    let rssUrl = '';
    const isGeneric = ['台灣熱門時事', '今日新聞', '熱門話題', '新聞', 'News'].some(k => keyword.includes(k));

    if (isGeneric) rssUrl = 'https://tw.news.yahoo.com/rss';
    else rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}+when:1d&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;

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

            if (title && link) {
                results.push({ title, description: title, url: link, imageUrl });
            }
        }
        return results;
    } catch (e) {
        console.warn("RSS fetch flow failed", e);
        return [];
    }
};

// #endregion

// #region Core Services

export const getTrendingTopics = async (industry: string = "台灣熱門時事", seed?: number): Promise<TrendingTopic[]> => {
  const cached = await checkTrendCache(industry);
  if (cached) return cached;

  let topics = await fetchRealtimeRss(industry);

  // Fallback to Gemini if RSS is empty
  if (topics.length === 0) {
      console.warn("RSS returned 0 items. Attempting Gemini fallback generation via backend.");
      try {
        const response = await callBackend('generateContent', {
            model: 'gemini-2.5-flash',
            contents: `列出目前台灣關於「${industry}」的 5 個熱門社群話題。
            請直接回傳純 JSON 陣列，不要有任何 Markdown 格式。
            格式: [{ "title": "...", "description": "...", "url": "..." }]`,
            config: { responseMimeType: "application/json" }
        });
        
        const cleanText = cleanJsonText(response.text || '[]');
        let raw = JSON.parse(cleanText);
        if (Array.isArray(raw)) {
            topics = raw.map((t: any) => ({
                title: t.title,
                description: t.description || t.title,
                url: t.url,
            }));
        }
      } catch (e) { 
          console.error("Gemini fallback failed", e); 
      }
  }

  if (topics.length > 0 && topics[0].url !== '#') await saveTrendCache(industry, topics);
  return topics;
};

// #region Prompt Builders (Helpers for Logic Isolation)

const getStrategyPrompt = (brandType?: string) => {
    if (brandType === 'personal') {
        return `[MODE: Personal Brand/Influencer (真人感)]
      - Tone: Authentic, vulnerable, conversational, maybe slightly emotional.
      - Style: Use short sentences. Use lower case aesthetic if fitting. Avoid corporate jargon.
      - Hook: Start with a personal thought or feeling ("我發現...", "其實...", "心情有點複雜").
      - Prohibited: Do NOT use "總結來說", "綜上所述", "小編".`;
    }
    return `[MODE: Enterprise Brand (專業感)]
      - Framework: Use the AIDA model (Attention -> Interest -> Desire -> Action) OR PAS (Problem -> Agitation -> Solution).
      - Tone: Professional, trustworthy, structured, value-driven.
      - Structure: Clear hook -> Value proposition -> Call to action.`;
};

const buildCtaPrompt = (ctaList: CtaItem[]) => {
    if (!ctaList || ctaList.length === 0) return "無特定 CTA";
    let prompt = "必須包含以下行動呼籲 (CTA) 資訊，請將其整理成吸引人的語句 (不要只放連結)：\n";
    ctaList.forEach(cta => {
        prompt += `- ${cta.text}: ${cta.url}\n`;
    });
    return prompt;
};

const buildDraftPrompt = (
    topic: string, 
    settings: BrandSettings, 
    options: { length: string, ctaList: CtaItem[], tempHashtags: string, includeEngagement?: boolean, imageText?: string },
    topicContext?: TrendingTopic
) => {
    const ctaPrompt = buildCtaPrompt(options.ctaList);
    const strategyPrompt = getStrategyPrompt(settings.brandType);
    
    const engagementInstruction = options.includeEngagement 
      ? "CRITICAL: You MUST end the post with a specific question (e.g., A or B choice) or a request to tag a friend to boost comments. This is high priority." 
      : "";

    const imageTextInstruction = options.imageText
      ? `The image MUST clearly display the text: "${options.imageText}". Ensure the text is legible, stylish, and integrated into the scene (e.g., on a sign, neon light, or overlay).`
      : "";

    const contextPrompt = topicContext ? `\n參考新聞: ${topicContext.title} (${topicContext.url})` : '';
    const productContext = settings.productContext ? `\n[核心產品知識庫 - 必須融入貼文]:\n${settings.productContext}\n` : '';

    return `
    品牌: ${settings.industry}
    語氣設定: ${settings.brandTone}
    小編人設: ${settings.persona}
    ${productContext}
    
    ${strategyPrompt}

    任務: 針對主題「${topic}」${contextPrompt} 寫一篇 Facebook 貼文。
    
    [嚴格格式要求 - Structure Rules]
    1. **強制分段**：Facebook 貼文需要高可讀性。請在每個邏輯段落之間使用「雙換行」留白。
    2. **禁止 Markdown**：Facebook 不支援 Bold/Italic。請勿使用 **粗體** 或 *斜體* 符號。
    3. **表情符號**：請依照品牌語氣適量使用 Emoji。
    
    [內容要求]
    1. 字數: ${options.length}
    2. 結構: 依照 [MODE] 設定的策略撰寫。
    3. CTA 處理: ${ctaPrompt} (請將完整的 CTA 文案包含連結，獨立放在 JSON 的 ctaText 欄位)
    4. 互動誘餌: ${engagementInstruction}
    5. Hashtags: ${settings.fixedHashtags} ${options.tempHashtags} (放在文末)
    6. Image Prompt: IMPORTANT - Must be in ENGLISH, detailed, describing a scene (Midjourney style). ${imageTextInstruction}

    Output JSON Format:
    {
      "caption": "...",
      "ctaText": "...", 
      "imagePrompt": "Detailed English image prompt...",
      "videoPrompt": "Detailed English video prompt..."
    }
    `;
};

const buildViralPrompt = (
    topic: string,
    options: { audience: string, viralType: ViralType, platform: ViralPlatform, versionCount: number },
    settings: BrandSettings
) => {
    const productInfo = settings.productContext || settings.productInfo || '';
    const brandName = settings.industry || '我們品牌';

    return `
    你是一個「頂尖社群行銷專家」與「營銷號文案寫手」。
    任務：針對主題「${topic}」撰寫 ${options.versionCount} 則高轉換率的爆款貼文。

    【核心策略：軟性推廣 (Soft Sell)】
    我們不是要單純抱怨或發廢文，而是要用「吸睛故事」包裝「產品推廣」。
    
    【必備結構 (小紅書/營銷號邏輯)】
    1. **Hook (鉤子)**：用標題殺人，製造焦慮、後悔、驚訝或共鳴。(前 2 行最重要)
    2. **Story (故事/痛點)**：具體描述一個場景或痛點，讓讀者覺得「天啊這就是在說我」。語氣要真實、像真人分享 (可以使用"我"、"真心覺得")。
    3. **Value (轉折/價值)**：分享一個觀念、方法或發現，解決上述痛點。
    4. **Product (置入)**：自然地帶出我們的產品/服務，將其作為解決方案的關鍵工具。不要硬廣，要像是「私藏好物分享」。
    
    【品牌與產品資訊 (必須置入)】
    - 品牌/行業：${brandName}
    - 核心產品/賣點：${productInfo}
    *請從上方資訊中提取適合的賣點，融入故事中。*

    【輸入參數】
    - 目標族群：${options.audience}
    - 爆文類型：${options.viralType} (例如：後悔沒早點知道、內幕揭秘)
    - 平台：${options.platform} (如果是小紅書/Threads，請多用 Emoji，分段要短)

    【輸出要求】
    1. 輸出 ${options.versionCount} 則完整貼文 (versions array)。
    2. 針對此內容生成一個詳細的圖片 Prompt (imagePrompt) - 使用英文。如果是 XHS 平台，請描述為「手寫筆記風格 (Handwritten Note Style)」。

    Output JSON Format:
    {
      "versions": ["Version 1 Content...", "Version 2 Content..."],
      "imagePrompt": "Detailed English image prompt..."
    }
    `;
};

// #endregion

// #region Generators

// Analysis Service
export const analyzeBrandTone = async (posts: string[]): Promise<{ tone: string, persona: string }> => {
    if (!posts || posts.length === 0) throw new Error("無貼文可分析");
    
    const combinedPosts = posts.join('\n\n---\n\n');
    const prompt = `
      以下是某個 Facebook 粉絲專頁的近期貼文。請分析這些內容，並提取出該品牌的「語氣設定 (Tone)」與「小編人設 (Persona)」。
      
      請著重分析：
      1. 是否使用表情符號？風格為何？
      2. 斷句習慣 (例如：喜歡短句、是否常換行)。
      3. 口頭禪或常用語助詞。
      4. 對粉絲的稱呼。
      
      貼文內容：
      ${combinedPosts.substring(0, 8000)}

      請回傳 JSON: { "tone": "描述...", "persona": "描述..." }
    `;

    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    tone: { type: Type.STRING },
                    persona: { type: Type.STRING }
                }
            }
        }
    });

    return JSON.parse(cleanJsonText(response.text || '{}'));
};

export const analyzeProductFile = async (text: string): Promise<string> => {
    const prompt = `
      任務：分析以下產品/服務文件，並提取出行銷用的「核心知識庫」。
      請條列出：
      1. 產品核心價值 (USP)
      2. 解決的痛點
      3. 主要規格/特色
      4. 適合的受眾
      
      請用條列式摘要，這份資料將作為未來寫文案的最高指導原則。
      
      文件內容：
      ${text.substring(0, 15000)}
    `;

    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: prompt
    });

    return response.text || "";
};

export const analyzeVisualStyle = async (imageB64s: string[]): Promise<string> => {
    const parts = [
        { text: "You are a professional Art Director. Analyze these brand images and extract a consistent 'Visual Style Prompt' that I can use to generate similar images with AI.\n\nFocus on:\n1. Lighting (e.g., soft, studio, natural)\n2. Color Palette (e.g., pastel, neon, earthy)\n3. Composition (e.g., minimal, busy, macro)\n4. Mood/Vibe (e.g., cozy, professional, energetic)\n\nOutput a single, concise English paragraph (max 50 words) starting with 'Style: ...' that describes this aesthetic." },
    ];

    imageB64s.forEach(b64 => {
        const base64Clean = b64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
        parts.push({
            inlineData: { mimeType: "image/png", data: base64Clean }
        } as any);
    });

    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: { parts }
    });

    return response.text || "Minimalist, clean, high-key lighting.";
};

// --- Viral Title Generators ---
export const generateViralTitles = async (
    topic: string,
    options: { audience: string; viralType: ViralType; }
): Promise<string[]> => {
    const prompt = `
    你是一個「社群標題專家」。
    任務：針對主題「${topic}」產生 5 個極具吸引力的「爆文標題」。
    
    【設定】
    目標受眾：${options.audience}
    類型：${options.viralType} (例如：後悔型、內幕型、打臉型)
    
    【要求】
    1. 標題要短促有力，引發好奇或焦慮。
    2. 不要使用 "標題1:" 這種前綴，直接列出標題。
    3. 只回傳 JSON 字串陣列。
    
    Example Output: ["標題一", "標題二", "標題三", "標題四", "標題五"]
    `;

    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash", 
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
    });

    const clean = cleanJsonText(response.text || '[]');
    try {
        return JSON.parse(clean);
    } catch (e: any) {
        console.error("Title Gen Parse Error", e);
        return [topic];
    }
};

export const scoreViralTitles = async (titles: string[]): Promise<TitleScore[]> => {
    const prompt = `
    你是一個「社群平台點擊率預測模型」，
    專門評估標題在社群平台上的「點擊誘因強度」。

    【評分維度】（每項 0–10 分）
    1. 情緒張力 (emotion)：焦慮、後悔、衝突
    2. 好奇缺口 (curiosity)：是否讓人想點
    3. 身份代入感 (identity)：是否鎖定族群
    4. 具體程度 (specific)：數字、情境
    5. 真實感 (authenticity)：像不像真人

    【評分規則】
    - 總分滿分 50 分
    - 低於 30 分視為低潛力
    - 40 分以上為高爆文潛力
    - 不考慮品牌合規或廣告規範

    【輸入標題清單】
    ${JSON.stringify(titles)}

    【輸出格式】
    請以 JSON 陣列輸出，每一筆包含 title, score (total), breakdown object, comment.
    請依 score 由高到低排序。
    `;

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
                        breakdown: {
                            type: Type.OBJECT,
                            properties: {
                                emotion: { type: Type.NUMBER },
                                curiosity: { type: Type.NUMBER },
                                identity: { type: Type.NUMBER },
                                specific: { type: Type.NUMBER },
                                authenticity: { type: Type.NUMBER }
                            }
                        },
                        comment: { type: Type.STRING }
                    }
                }
            }
        }
    });

    const clean = cleanJsonText(response.text || '[]');
    try {
        return JSON.parse(clean);
    } catch (e: any) {
        console.error("Score Titles Parse Error", e);
        throw new Error(`評分失敗 (格式錯誤): ${e.message}`);
    }
};

// --- Main Content Generators ---

export const generateViralContent = async (
    topic: string,
    options: { audience: string; viralType: ViralType; platform: ViralPlatform; versionCount: number; },
    settings: BrandSettings
): Promise<ViralPostDraft> => {
    
    const prompt = buildViralPrompt(topic, options, settings);

    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash", 
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    versions: { type: Type.ARRAY, items: { type: Type.STRING } },
                    imagePrompt: { type: Type.STRING }
                }
            }
        }
    });

    const clean = cleanJsonText(response.text || '{}');
    try {
        return JSON.parse(clean);
    } catch (e: any) {
        console.error("Viral Content Parse Error", e);
        throw new Error(`生成失敗 (格式錯誤): ${e.message}`);
    }
};

export const generatePostDraft = async (
    topic: string, 
    settings: BrandSettings, 
    options: { 
        length: string, 
        ctaList: CtaItem[], 
        tempHashtags: string,
        includeEngagement?: boolean, 
        imageText?: string 
    },
    topicContext?: TrendingTopic,
    userRole: string = 'user'
) => {
  const isHighTier = ['business', 'admin'].includes(userRole);
  const selectedModel = isHighTier ? "gemini-3-pro-preview" : "gemini-2.5-flash";

  const prompt = buildDraftPrompt(topic, settings, options, topicContext);

  const response = await callBackend('generateContent', {
    model: selectedModel,
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

  return JSON.parse(cleanJsonText(response.text || '{}'));
};

// --- Image Generators ---

const ensureEnglishPrompt = async (prompt: string): Promise<string> => {
    if (/^[\x00-\x7F]*$/.test(prompt)) {
        return prompt;
    }

    try {
        console.log("Detecting non-ASCII in prompt, translating to English...");
        const response = await callBackend('generateContent', {
            model: 'gemini-2.5-flash',
            contents: `Role: Expert AI Image Prompt Translator.
Task: Translate the following text into a descriptive English prompt suitable for high-quality AI image generation.
Input: "${prompt}"
Requirements:
1. Translate accurately to English.
2. If the input is simple (e.g., "a cat"), add subtle details to make it a better prompt (e.g., "a fluffy cat, soft lighting").
3. Do NOT output explanations. ONLY output the English prompt string.`
        });
        return response.text.trim();
    } catch (e) {
        console.warn("Translation failed, using original prompt");
        return prompt;
    }
};

export const generateImage = async (prompt: string, userRole: string = 'user', stylePrompt?: string): Promise<string> => {
    const noLimitTrigger = /no limit/i.test(prompt);
    let finalPrompt = prompt.replace(/no limit/ig, '').trim();

    const effectiveRole = noLimitTrigger ? 'admin' : userRole;
    const isPaidImageTier = ['pro', 'business', 'admin'].includes(effectiveRole);

    const englishPrompt = await ensureEnglishPrompt(finalPrompt);
    
    let enhancedPrompt = "";
    const isXHS = /handwritten note style/i.test(stylePrompt || '') || /xiaohongshu/i.test(stylePrompt || '') || /note/i.test(stylePrompt || '');
    
    if (isXHS) {
        enhancedPrompt = `${englishPrompt}. 
        Style: Little Red Book (Xiaohongshu) note aesthetic. 
        Visuals: Beige or white paper background, handwritten-like font notes overlay (if possible), highlighter marks, circled key points, clean photography, lifestyle vibe, vertical composition preferred. 
        No ugly watermark. Realistic phone photography.`;
    } else if (stylePrompt) {
        enhancedPrompt = `${englishPrompt}. Visual Style: ${stylePrompt}. Photorealistic, cinematic lighting.`;
    } else {
        enhancedPrompt = `${englishPrompt}, photorealistic, cinematic lighting, photography style`;
    }

    // Economy Mode (Pollinations)
    if (!isPaidImageTier) {
         console.log("🎨 [ImageGen] Economy Mode: Using Pollinations (Frontend).");
         const seed = Math.floor(Math.random() * 100000);
         const encodedPrompt = encodeURIComponent(enhancedPrompt);
         return `https://image.pollinations.ai/prompt/${encodedPrompt}?n=${seed}&model=flux&enhance=true`;
    }

    // Pro Mode (Backend)
    try {
        console.log(`🎨 [ImageGen] Pro Mode: Attempting Backend generation${noLimitTrigger ? ' (NO LIMIT)' : ''}...`);
        
        const safetySettings = noLimitTrigger ? [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ] : undefined;

        const response = await callBackend('generateImages', {
            model: 'imagen-3.0-generate-002', 
            prompt: enhancedPrompt,
            safetySettings
        });
        
        if (response.base64) {
             console.log("✅ [ImageGen] Success via Backend!");
             return `data:image/png;base64,${response.base64}`;
        }
        throw new Error("No image data found in response");

    } catch (e: any) {
        console.error("❌ [ImageGen] Backend Failed. Switching to Frontend Fallback.", e.message);
        const seed = Math.floor(Math.random() * 100000);
        const encodedPrompt = encodeURIComponent(enhancedPrompt);
        return `https://image.pollinations.ai/prompt/${encodedPrompt}?n=${seed}&model=flux&enhance=true`;
    }
};

export const generateVideo = async (prompt: string): Promise<string> => {
    try {
        const response = await callBackend('generateVideos', {
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
        });

        if (response.videoBase64) {
            return `data:video/mp4;base64,${response.videoBase64}`;
        }
        throw new Error("No video data returned");

    } catch (e: any) {
        console.warn("Veo failed, fallback to Image:", e);
        const img = await generateImage(prompt, 'pro'); 
        throw new Error(`影片生成失敗，已降級為圖片: ${e.message}`);
    }
};

// --- SEO Article Generator ---
export const generateSeoArticle = async (
    topic: string, 
    length: string, 
    keywords: string,
    options: { agenda: boolean, meta: boolean, faq: boolean, refLinks: boolean }
) => {
    const prompt = `
      Task: Write a comprehensive SEO Blog Article.
      Topic: ${topic}
      Target Length: ${length}
      LSI Keywords: ${keywords}
      Language: Traditional Chinese (Taiwan).
      Requirements:
      1. Use Markdown format.
      ${options.agenda ? '2. Include Agenda.' : ''}
      ${options.meta ? '3. Include Meta Title & Desc.' : ''}
      ${options.faq ? '4. Include FAQ.' : ''}
      
      Output JSON Format:
      { "fullText": "Markdown...", "imageKeyword": "English keyword..." }
    `;

    let searchContext = "";
    try {
         const searchResp = await callBackend('generateContent', {
            model: "gemini-2.5-flash",
            contents: `Research SEO content for topic: ${topic}. Keywords: ${keywords}`,
            config: { tools: [{ googleSearch: {} }] } 
        });
        searchContext = searchResp.text || "";
    } catch (e) { console.warn("Search grounding failed"); }

    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: `Context: ${searchContext}\n\n${prompt}`,
        config: { 
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    fullText: { type: Type.STRING },
                    imageKeyword: { type: Type.STRING }
                }
            }
        }
    });

    const cleanText = cleanJsonText(response.text || '{}');
    let parsed;
    try {
        parsed = JSON.parse(cleanText);
    } catch (e) {
        const match = cleanText.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Failed to parse SEO article JSON");
    }
    return parsed;
};

// --- Report Generator ---
export const generateWeeklyReport = async (analytics: any, settings: BrandSettings, topPosts?: any) => {
    const prompt = `
      Act as a senior social media analyst. Brand: ${settings.industry}.
      Metrics: Followers ${analytics.followers}, Reach ${analytics.reach}, Engagement ${analytics.engagementRate}%.
      Write a weekly performance report in Traditional Chinese.
    `;
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: prompt
    });
    return response.text || "報告生成失敗";
};

// --- Threads Batch Generator ---
export const generateThreadsBatch = async (
    topic: string, 
    count: number, 
    settings: BrandSettings, 
    personas: string[] = []
): Promise<any[]> => {
    const personaConstraint = personas.length > 0 
        ? `[CHARACTER SOUL - 60% Weight]
           You MUST embody the following specific persona.
           Persona Description: ${personas.map((p, i) => `${i+1}. ${p}`).join('\n')}
           
           Reaction Strategy:
           - Filter the topic "${topic}" through this persona's worldview.
           - If the persona is cynical, be cynical. If wholesome, be wholesome.
           - React emotionally.`
        : '[CHARACTER SOUL] Adopt a random authentic Taiwanese netizen perspective (e.g. tired office worker, college student, or bystander).';

    const prompt = `
      ${SYSTEM_INSTRUCTION_THREADS}
      
      ${personaConstraint}
      
      Task: Generate ${count} distinct, unique Threads posts about: "${topic}".
      IMPORTANT: If count > 1, each post must have a different tone.
      
      [IMAGE PROMPT RULES - CRITICAL]
      For 'imagePrompt', DO NOT use Chinese. 
      You MUST write a DETAILED ENGLISH prompt suitable for Midjourney/Imagen/DALL-E.
      Include:
      1. Subject (what is happening)
      2. Environment (background, lighting)
      3. Style (e.g. "Cinematic shot", "Grainy photography", "Shot on iPhone 15", "Studio lighting")
      4. Aspect ratio implied (square)
      
      Output JSON Array: [{ "caption": "...", "imagePrompt": "Detailed English Prompt...", "imageQuery": "Short keyword" }]
    `;

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
                        caption: { type: Type.STRING },
                        imagePrompt: { type: Type.STRING },
                        imageQuery: { type: Type.STRING }
                    }
                }
            }
        }
    });

    return JSON.parse(cleanJsonText(response.text || '[]'));
};

export const generateCommentReply = async (
    commentText: string,
    personaPrompt: string
): Promise<string[]> => {
    const prompt = `
        ${SYSTEM_INSTRUCTION_THREADS}
        
        [Specific Persona (High Priority)]: ${personaPrompt || "Friendly but authentic"}
        
        Task: A user commented on my post: "${commentText}".
        Please generate 3 different reply options that fit my persona.
        They should be short, authentic, and encourage further conversation if possible.
        
        Output JSON Array of strings: ["Option 1", "Option 2", "Option 3"]
    `;

    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
    });
    
    return JSON.parse(cleanJsonText(response.text || '[]'));
};

// #endregion

// #region Visual Utils (Canvas)

export const applyTextOverlay = async (imageUrl: string, text: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error("Canvas not supported"));
            return;
        }

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageUrl;

        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            
            ctx.drawImage(img, 0, 0);

            const fontSize = Math.floor(canvas.width * 0.08);
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const maxWidth = canvas.width * 0.9;
            let line = '';
            const lines = [];
            
            for(let i = 0; i < text.length; i++) {
                const char = text[i];
                const testLine = line + char;
                const metrics = ctx.measureText(testLine);
                const testWidth = metrics.width;
                if (testWidth > maxWidth && i > 0) {
                    lines.push(line);
                    line = char;
                } else {
                    line = testLine;
                }
            }
            lines.push(line);

            const totalTextHeight = lines.length * (fontSize * 1.2);
            const padding = fontSize;
            const bgY = canvas.height - totalTextHeight - (padding * 2);
            
            const gradient = ctx.createLinearGradient(0, bgY - 50, 0, canvas.height);
            gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
            gradient.addColorStop(0.3, "rgba(0, 0, 0, 0.6)");
            gradient.addColorStop(1, "rgba(0, 0, 0, 0.9)");
            
            ctx.fillStyle = gradient;
            ctx.fillRect(0, bgY - 50, canvas.width, canvas.height - (bgY - 50));

            let y = canvas.height - totalTextHeight - padding + (fontSize/2);
            
            lines.forEach(lineStr => {
                ctx.shadowColor = "rgba(0,0,0,0.8)";
                ctx.shadowBlur = 15;
                ctx.lineWidth = fontSize * 0.05;
                ctx.strokeStyle = 'black';
                ctx.strokeText(lineStr, canvas.width / 2, y);
                
                ctx.fillStyle = 'white';
                ctx.fillText(lineStr, canvas.width / 2, y);
                
                y += fontSize * 1.2;
            });

            resolve(canvas.toDataURL('image/png'));
        };

        img.onerror = (e) => {
            console.error("Image load failed for overlay", e);
            reject(new Error("無法讀取圖片以合成文字 (跨域限制或圖片無效)"));
        };
    });
};

export const applyWatermark = async (mainImageUrl: string, logoUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error("Canvas not supported"));
            return;
        }

        const mainImg = new Image();
        mainImg.crossOrigin = "anonymous";
        mainImg.src = mainImageUrl;

        mainImg.onload = () => {
            canvas.width = mainImg.width;
            canvas.height = mainImg.height;
            ctx.drawImage(mainImg, 0, 0);

            const logoImg = new Image();
            logoImg.crossOrigin = "anonymous";
            logoImg.src = logoUrl;

            logoImg.onload = () => {
                const logoWidth = canvas.width * 0.15;
                const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
                const padding = canvas.width * 0.05;
                const x = canvas.width - logoWidth - padding;
                const y = canvas.height - logoHeight - padding;

                ctx.globalAlpha = 0.9;
                ctx.drawImage(logoImg, x, y, logoWidth, logoHeight);
                
                resolve(canvas.toDataURL('image/png'));
            };
            
            logoImg.onerror = (e) => {
                 console.warn("Logo load failed", e);
                 resolve(mainImageUrl);
            }
        };

        mainImg.onerror = (e) => {
            console.error("Main image load failed", e);
            reject(new Error("無法讀取原始圖片以合成浮水印 (跨域限制或圖片無效)"));
        };
    });
};
// #endregion