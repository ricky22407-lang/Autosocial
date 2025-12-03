
import { GoogleGenAI, Type } from "@google/genai";
import { BrandSettings, TrendingTopic, AnalyticsData, CachedTrendData } from "../types";
import { db } from "./firebase"; // Using compat export

// #region Config & Init
// Using process.env.API_KEY as per coding guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// System Prompts
const SYSTEM_INSTRUCTION_FB = `
You are an expert social media manager for the Taiwan market.
Your goal is to write engaging, high-conversion Facebook posts in Traditional Chinese (Taiwan).
Tone: Professional yet approachable, using local idioms where appropriate.
Format:
- Start with a strong hook.
- Use bullet points for readability.
- Include 3-5 relevant hashtags.
- Include emojis.
`;

// ECP0 Persona Framework for Threads
const SYSTEM_INSTRUCTION_THREADS = `
[System Instruction]
Role: You are a genuine, active user on Threads (Taiwan region).
Context: Threads culture in Taiwan favors authenticity, raw emotion, "murmuring" (碎碎唸), and community connection over polished, corporate marketing.
Language: Traditional Chinese (Taiwan) with authentic internet slang.

[Cognitive Style]
- Observational: Notices small, relatable details in daily life.
- Reactive: Quick to share immediate thoughts on trending topics.
- Skeptical: Naturally resistant to obvious ads or "salesy" content.
- Humorous: Finds irony in serious situations; self-deprecating.

[Expression Style]
- Structure: Short, fragmented sentences. Frequent line breaks.
- Tone: Natural, conversational, "murmur", sometimes "deadpan" (厭世) or "enthusiastic" (激動).
- Formatting: Minimal punctuation. Lowercase English. Use spaces for breath.
- Anti-Patterns: DO NOT use "小編" (admin), "各位粉絲" (fans), "趕快來買" (buy now). DO NOT sound like a bot.

[Specific Character Constraints]
(This will be injected dynamically based on user persona settings)
`;
// #endregion

// #region Helper Functions (Image Validation & Cache)

/**
 * Helper to clean JSON string from Markdown code blocks
 */
const cleanJsonText = (text: string): string => {
    if (!text) return '{}';
    return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

/**
 * Simple HTML Entity Decoder
 */
const decodeHtml = (html: string) => {
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
};

/**
 * Validate News Image URL
 * Filters out common tracking pixels, ads, and social icons
 */
const isValidNewsImage = (url: string): boolean => {
    if (!url) return false;
    const lower = url.toLowerCase();
    
    // Blacklist
    const badKeywords = [
        'pixel', 'tracker', 'analytics', 'facebook.com/tr', 'ads', 
        'doubleclick', 'button', 'share_icon', 'logo', 'placeholder'
    ];
    if (badKeywords.some(k => lower.includes(k))) return false;

    return true;
};

// --- Global Cache Logic ---
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 Hours

const checkTrendCache = async (industry: string): Promise<TrendingTopic[] | null> => {
    try {
        const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const cacheId = `${dateKey}_${industry.replace(/\s+/g, '_')}`;
        
        const doc = await db.collection('global_trend_cache').doc(cacheId).get();
        
        if (doc.exists) {
            const data = doc.data() as CachedTrendData;
            const age = Date.now() - data.createdAt;
            if (age < CACHE_TTL && data.topics && data.topics.length > 0) {
                console.log(`[Cache Hit] Serving trends for ${industry} from cache.`);
                return shuffleArray(data.topics);
            }
        }
    } catch (e) {
        console.warn("Cache read failed", e);
    }
    return null;
};

const saveTrendCache = async (industry: string, topics: TrendingTopic[]) => {
    try {
        const dateKey = new Date().toISOString().split('T')[0];
        const cacheId = `${dateKey}_${industry.replace(/\s+/g, '_')}`;
        
        const cacheData: CachedTrendData = {
            id: cacheId,
            industry,
            topics,
            createdAt: Date.now()
        };
        
        await db.collection('global_trend_cache').doc(cacheId).set(cacheData);
    } catch (e) {
        console.warn("Cache write failed", e);
    }
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

// #region RSS Fetching (Robust Mode V3.1)

// Helper to fetch text with proxy fallback
const fetchTextWithProxy = async (targetUrl: string): Promise<string> => {
    // Proxy 1: AllOrigins (JSONP-like, reliable)
    try {
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
        const data = await res.json();
        if (data.contents) return data.contents;
    } catch (e) {
        console.warn("Proxy 1 (AllOrigins) failed, trying Proxy 2...");
    }

    // Proxy 2: CorsProxy.io (Direct pipe)
    try {
        const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
        const text = await res.text();
        if (text) return text;
    } catch (e) {
        console.warn("Proxy 2 (CorsProxy) failed.");
    }

    throw new Error("All RSS proxies failed");
};

// Main RSS Fetcher
const fetchRealtimeRss = async (keyword: string): Promise<TrendingTopic[]> => {
    let rssUrl = '';
    // Use generic list to switch source
    const isGeneric = ['台灣熱門時事', '今日新聞', '熱門話題', '新聞', 'News'].some(k => keyword.includes(k));

    if (isGeneric) {
        // Yahoo News Taiwan (Standard RSS 2.0 with media:content)
        rssUrl = 'https://tw.news.yahoo.com/rss';
    } else {
        // Google News (Atom/RSS mix)
        rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}+when:1d&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
    }

    try {
        const xmlString = await fetchTextWithProxy(rssUrl);
        
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlString, "text/xml");
        const items = xml.querySelectorAll("item");
        
        const results: TrendingTopic[] = [];
        
        for (let i = 0; i < Math.min(items.length, 20); i++) {
            const item = items[i];
            const title = item.querySelector("title")?.textContent || "";
            const link = item.querySelector("link")?.textContent || "";
            let imageUrl = '';

            // 1. Try media:content (Yahoo Standard)
            const mediaContent = item.getElementsByTagName('media:content')[0];
            if (mediaContent) {
                imageUrl = mediaContent.getAttribute('url') || '';
            }

            // 2. Try enclosure
            if (!imageUrl) {
                const enclosure = item.getElementsByTagName('enclosure')[0];
                if (enclosure && (enclosure.getAttribute('type') || '').startsWith('image')) {
                    imageUrl = enclosure.getAttribute('url') || '';
                }
            }

            // 3. Try Description Parsing (Google News)
            if (!imageUrl) {
                const descRaw = item.querySelector("description")?.textContent || "";
                // Decode HTML entities (e.g. &lt;img) to real tags
                const descHtml = decodeHtml(descRaw);
                
                // Aggressive Regex to find src inside description
                // Matches <img ... src="http..." ...>
                const match = descHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
                if (match && match[1]) {
                    if (isValidNewsImage(match[1])) {
                        imageUrl = match[1];
                    }
                }
            }

            // 4. Google High-Res Optimization
            if (imageUrl && (imageUrl.includes('googleusercontent.com') || imageUrl.includes('ggpht.com'))) {
                // Force higher resolution if it's a resize param
                if (imageUrl.match(/=[wh]\d+/)) {
                     imageUrl = imageUrl.replace(/=[wh]\d+[-a-z0-9]*/, '=w800');
                } else {
                    imageUrl += '=w800';
                }
            }

            if (title && link) {
                results.push({
                    title,
                    description: title, // Use title as desc for cleaner UI
                    url: link,
                    imageUrl // Can be empty, UI will handle fallback
                });
            }
        }
        
        return results;
    } catch (e) {
        console.warn("RSS fetch flow failed", e);
        return [];
    }
};
// #endregion

// #region Core Services (Trending, Draft, Image, SEO, Report)

/**
 * Get Trending Topics with Global Caching
 */
export const getTrendingTopics = async (industry: string = "台灣熱門時事", seed?: number): Promise<TrendingTopic[]> => {
  // 1. Check Cache
  const cached = await checkTrendCache(industry);
  if (cached) {
      return cached;
  }

  // 2. Fetch Fresh Data (Real RSS)
  let topics = await fetchRealtimeRss(industry);

  // 3. Fallback to Gemini ONLY if RSS returns absolutely nothing (Emergency)
  if (topics.length === 0) {
      console.warn("RSS returned 0 items, using Gemini fallback.");
      try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `列出目前台灣關於「${industry}」的 5 個熱門社群話題。
            請直接回傳純 JSON 陣列，不要有任何 Markdown 格式。
            格式: [{ "title": "...", "description": "...", "url": "..." }]`
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

  // 4. Save to Cache
  if (topics.length > 0) {
      await saveTrendCache(industry, topics);
  }

  return topics;
};

/**
 * Generate Facebook Post Draft
 */
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
      "caption": "完整貼文內容...",
      "ctaText": "點擊這裡購買...",
      "imagePrompt": "繁體中文圖片生成提示詞...",
      "videoPrompt": "繁體中文影片生成提示詞..."
    }
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  return JSON.parse(response.text || '{}');
};

/**
 * Generate Image (with 3-layer Fallback)
 */
export const generateImage = async (prompt: string): Promise<string> => {
    // 1. Try Imagen 3 (Best Quality)
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-3.0-generate-001',
            prompt: prompt,
            config: { numberOfImages: 1, aspectRatio: '1:1' }
        });
        const b64 = response.generatedImages?.[0]?.image?.imageBytes;
        if (b64) return `data:image/png;base64,${b64}`;
    } catch (e) {
        console.warn("Imagen 3 failed, trying Gemini 3 Pro...");
    }

    // 2. Try Gemini 3 Pro Image (High Quality)
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts: [{ text: prompt }] },
            config: { imageConfig: { aspectRatio: "1:1" } }
        });
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (part?.inlineData?.data) return `data:image/png;base64,${part.inlineData.data}`;
    } catch (e) {
        console.warn("Gemini 3 Pro Image failed, trying Flash...");
    }

    // 3. Try Gemini 2.5 Flash Image (Fastest/Cheapest)
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: prompt }] },
            config: { imageConfig: { aspectRatio: "1:1" } }
        });
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (part?.inlineData?.data) return `data:image/png;base64,${part.inlineData.data}`;
    } catch (e: any) {
        throw new Error(`所有圖片模型皆生成失敗: ${e.message}`);
    }
    
    throw new Error("Unknown error in image generation");
};

/**
 * Generate Video (Veo) - Using Fallback logic if needed
 */
export const generateVideo = async (prompt: string): Promise<string> => {
    try {
        // Try Fast model first
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
        });

        // Polling with timeout (max 60s)
        let attempts = 0;
        while (!operation.done && attempts < 12) {
            await new Promise(r => setTimeout(r, 5000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
            attempts++;
        }

        if (!operation.done) throw new Error("Video generation timed out");

        const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!uri) throw new Error("No video URI returned");

        // Append key for client-side fetch
        return `${uri}&key=${process.env.API_KEY}`;
    } catch (e: any) {
        console.warn("Veo failed, fallback to Image:", e);
        // Fallback to Image generation logic
        const img = await generateImage(prompt);
        throw new Error(`影片生成失敗: ${e.message}`);
    }
};

/**
 * Generate SEO Article
 */
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
      1. Use Markdown format (H1, H2, H3).
      2. Tone: Authoritative yet readable (E-E-A-T standards).
      ${options.agenda ? '3. Include a Table of Contents (Agenda) after the intro.' : ''}
      ${options.meta ? '4. Provide Title Tag & Meta Description at the very top.' : ''}
      ${options.faq ? '5. Include a FAQ section at the end.' : ''}
      ${options.refLinks ? '6. Cite authoritative sources/links where possible.' : ''}
      
      Output JSON Format (RAW JSON ONLY, NO MARKDOWN):
      {
         "fullText": "Markdown content string...",
         "imageKeyword": "A short English keyword for searching stock photos"
      }
    `;

    // 1. First, search for grounding info
    let searchContext = "";
    try {
         const searchResp = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Research SEO content for topic: ${topic}. Keywords: ${keywords}`,
            // Removed responseMimeType: 'application/json' to fix tool use conflict
            config: { tools: [{ googleSearch: {} }] } 
        });
        searchContext = searchResp.text || "";
    } catch (e) { console.warn("Search grounding failed, continuing without it."); }

    // 2. Generate Article using context
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Context from Google Search: ${searchContext}\n\n${prompt}`,
        config: { responseMimeType: "application/json" }
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

/**
 * Generate Weekly Report
 */
export const generateWeeklyReport = async (analytics: AnalyticsData, settings: BrandSettings, topPosts?: any) => {
    const prompt = `
      Act as a senior social media analyst.
      Brand: ${settings.industry}
      Data Period: ${analytics.period}
      
      Metrics:
      - Followers: ${analytics.followers}
      - Reach: ${analytics.reach}
      - Engagement Rate: ${analytics.engagementRate}%
      
      Top Posts Context: ${topPosts ? JSON.stringify(topPosts) : 'N/A'}

      Please write a weekly performance report in Traditional Chinese:
      1. Key Achievements (Highlight growth).
      2. Content Analysis (What worked?).
      3. Strategic Suggestions for next week.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
    });

    return response.text || "報告生成失敗";
};

/**
 * Generate Threads Batch (One-Shot)
 */
export const generateThreadsBatch = async (
    topic: string, 
    count: number, 
    settings: BrandSettings, 
    personas: string[] = []
) => {
    // Inject specific personas if available
    const personaConstraint = personas.length > 0 
        ? `Use these specific personas for the posts (rotate if multiple):\n${personas.map((p, i) => `${i+1}. ${p}`).join('\n')}`
        : 'Adopt a mix of: 1. Cynical/Funny, 2. Emotional/Raw, 3. Insightful.';

    const prompt = `
      ${SYSTEM_INSTRUCTION_THREADS}
      
      ${personaConstraint}

      Task: Generate ${count} distinct Threads posts about the topic: "${topic}".
      Industry: ${settings.industry}
      
      Requirements for each post:
      1. Content: Under 500 chars. No hashtags needed (Threads style).
      2. Visuals: Provide an English prompt for AI image generation AND a short English keyword query for stock photo search.
      3. Variation: Each post must have a different angle/voice.

      Output JSON Array:
      [
        {
          "caption": "...",
          "imagePrompt": "Detailed English prompt for AI art...",
          "imageQuery": "Short English keyword for stock photo (e.g. 'rainy window')"
        }
      ]
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });

    return JSON.parse(response.text || '[]');
};
// #endregion
