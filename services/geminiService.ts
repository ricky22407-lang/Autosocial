
import { BrandSettings, TrendingTopic, CachedTrendData } from "../types";
import { db } from "./firebase"; // Using compat export

// Local Type Definition to replace SDK Import and maintain type safety
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

// #region Helper Functions

const cleanJsonText = (text: string): string => {
    if (!text) return '{}';
    return text.replace(/```json/g, '').replace(/```/g, '').trim();
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

// --- Backend API Caller ---
const callBackend = async (action: string, payload: any) => {
    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action, payload })
        });
        
        let data;
        const text = await res.text();
        
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error("Non-JSON response from backend:", text.substring(0, 100));
            throw new Error(`Server returned invalid format: ${text.substring(0, 50)}...`);
        }
        
        if (!res.ok) {
            throw new Error(data.error || 'Server Error');
        }
        return data;
    } catch (e: any) {
        console.error(`Backend API Error [${action}]:`, e);
        throw e;
    }
};

// --- Cache Logic (Firebase) ---
const CACHE_TTL = 4 * 60 * 60 * 1000; 

const checkTrendCache = async (industry: string): Promise<TrendingTopic[] | null> => {
    try {
        const dateKey = new Date().toISOString().split('T')[0];
        const cacheId = `${dateKey}_${industry.replace(/\s+/g, '_')}`;
        const doc = await db.collection('global_trend_cache').doc(cacheId).get();
        if (doc.exists) {
            const data = doc.data() as CachedTrendData;
            const age = Date.now() - data.createdAt;
            if (age < CACHE_TTL && data.topics && data.topics.length > 0) {
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
    } catch (e) { console.warn("Cache write failed", e); }
};

const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

// #region RSS Fetching
const fetchRssContent = async (targetUrl: string): Promise<string> => {
    const data = await callBackend('fetchRss', { url: targetUrl });
    if (!data.text) throw new Error("Backend returned empty RSS content");
    return data.text;
};

// NEW: Fetch OG Image via Backend Proxy
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
            let imageUrl = '';

            const mediaContent = item.getElementsByTagName('media:content')[0];
            if (mediaContent) imageUrl = mediaContent.getAttribute('url') || '';
            if (!imageUrl) {
                const enclosure = item.getElementsByTagName('enclosure')[0];
                if (enclosure && (enclosure.getAttribute('type') || '').startsWith('image')) {
                    imageUrl = enclosure.getAttribute('url') || '';
                }
            }
            if (!imageUrl) {
                const descRaw = item.querySelector("description")?.textContent || "";
                const descHtml = decodeHtml(descRaw);
                const match = descHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
                if (match && match[1] && isValidNewsImage(match[1])) imageUrl = match[1];
            }
            if (imageUrl && (imageUrl.includes('googleusercontent.com') || imageUrl.includes('ggpht.com'))) {
                if (imageUrl.match(/=[wh]\d+/)) imageUrl = imageUrl.replace(/=[wh]\d+[-a-z0-9]*/, '=w800');
                else imageUrl += '=w800';
            }
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

  if (topics.length === 0) {
      console.warn("RSS returned 0 items. Attempting Gemini fallback generation via backend.");
      try {
        const response = await callBackend('generateContent', {
            model: 'gemini-2.5-flash',
            contents: `列出目前台灣關於「${industry}」的 5 個熱門社群話題。
            請直接回傳純 JSON 陣列，不要有任何 Markdown 格式。
            格式: [{ "title": "...", "description": "...", "url": "..." }]`,
            config: {
                responseMimeType: "application/json"
            }
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

export const generatePostDraft = async (
    topic: string, 
    settings: BrandSettings, 
    options: { length: string, ctaLinks: string[], tempHashtags: string },
    topicContext?: TrendingTopic
) => {
  const ctaInstruction = options.ctaLinks.length > 0 
      ? `包含以下連結的行動呼籲 (CTA)：\n${options.ctaLinks.join('\n')}` 
      : '無特定連結';
  const contextPrompt = topicContext ? `\n參考新聞: ${topicContext.title} (${topicContext.url})` : '';

  const prompt = `
    品牌: ${settings.industry}
    語氣: ${settings.brandTone}
    小編人設: ${settings.persona}
    任務: 針對主題「${topic}」${contextPrompt} 寫一篇 FB 貼文。
    要求:
    - 字數: ${options.length}
    - 結構: 開頭吸睛 -> 內容價值 -> 結尾 CTA
    - CTA: ${ctaInstruction} (請將 CTA 文案獨立放在 JSON 的 ctaText 欄位)
    - Hashtags: ${settings.fixedHashtags} ${options.tempHashtags} (放在文末)

    Output JSON Format:
    {
      "caption": "...",
      "ctaText": "...",
      "imagePrompt": "繁體中文圖片生成提示詞...",
      "videoPrompt": "繁體中文影片生成提示詞..."
    }
  `;

  const response = await callBackend('generateContent', {
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

  return JSON.parse(cleanJsonText(response.text || '{}'));
};

export const generateImage = async (prompt: string): Promise<string> => {
    try {
        // Attempt 1: Google Gemini (High Quality)
        const response = await callBackend('generateImages', {
            model: 'gemini-2.5-flash-image',
            prompt: prompt,
            config: { imageConfig: { aspectRatio: "1:1" } }
        });
        
        if (response.base64) {
             return `data:image/png;base64,${response.base64}`;
        }
        throw new Error("No image data found in response");

    } catch (e: any) {
        // Attempt 2: Pollinations AI (Fallback - Free & Reliable)
        // This solves the 'All API keys exhausted' issue elegantly by providing a backup.
        console.warn("Gemini Image Gen failed, switching to Pollinations Fallback:", e.message);
        
        const seed = Math.floor(Math.random() * 100000);
        const encodedPrompt = encodeURIComponent(prompt + ", photorealistic, high quality");
        // Pollinations URL returns image bytes directly, we need to load it or just return URL.
        // Returning URL is safer for frontend display.
        return `https://image.pollinations.ai/prompt/${encodedPrompt}?n=${seed}&model=flux`;
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
        // Fallback to Image if Video fails
        const img = await generateImage(prompt);
        // We throw an error with the image as fallback data if we could, but here we just error
        // Or we could return the image url but caller expects video.
        throw new Error(`影片生成失敗，已降級為圖片: ${e.message}`);
    }
};

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

export const generateThreadsBatch = async (
    topic: string, 
    count: number, 
    settings: BrandSettings, 
    personas: string[] = []
): Promise<any[]> => {
    // 權重設計：Character Soul (Persona) 為「角色靈魂」，權重 60%。
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
      IMPORTANT: If count > 1, each post must have a different tone (e.g., one short/angry, one long/analytical).
      
      Output JSON Array: [{ "caption": "...", "imagePrompt": "...", "imageQuery": "..." }]
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
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            }
        }
    });
    
    return JSON.parse(cleanJsonText(response.text || '[]'));
};
// #endregion
