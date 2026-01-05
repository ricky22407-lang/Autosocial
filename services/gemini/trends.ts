
import { TrendingTopic, OpportunityPost } from '../../types';
import { callBackend, getSystemCache, setSystemCache, shuffleArray, cleanJsonText, decodeHtml, Type } from './core';

// Helper to check if news image is valid (no pixels, ads, etc)
const isValidNewsImage = (url: string): boolean => {
    if (!url) return false;
    const lower = url.toLowerCase();
    const badKeywords = ['pixel', 'tracker', 'analytics', 'facebook.com/tr', 'ads', 'doubleclick', 'button', 'share_icon', 'logo', 'placeholder'];
    if (badKeywords.some(k => lower.includes(k))) return false;
    return true;
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

const fetchRssContent = async (targetUrl: string): Promise<string> => {
    const data = await callBackend('fetchRss', { url: targetUrl });
    if (!data.text) throw new Error("Backend returned empty RSS content");
    return data.text;
};

const fetchRealtimeRss = async (keyword: string): Promise<TrendingTopic[]> => {
    // Fix: Force 'Taiwan' in query to prevent IP-based localization (US Server -> HK/Global Chinese results)
    const queryTerm = keyword.includes('台灣') || keyword.includes('Taiwan') ? keyword : `${keyword} 台灣`;
    
    // Construct Google News URL with explicit Taiwan bias
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

export const fetchNewsImageFromUrl = async (url: string): Promise<string | null> => {
    if (!url) return null;
    try {
        const data = await callBackend('fetchOgImage', { url });
        if (data.imageUrl && isValidNewsImage(data.imageUrl)) return data.imageUrl;
    } catch (e) { console.warn("Backend OG fetch failed", e); }
    return null;
};

export const getTrendingTopics = async (industry: string = "台灣熱門時事", requestedCount: number = 10): Promise<TrendingTopic[]> => {
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `trend_search_${industry.replace(/\s+/g, '_')}_${today}`;
  
  // 1. Try Cache
  const cachedTopics = await getSystemCache(cacheKey);
  if (cachedTopics && Array.isArray(cachedTopics) && cachedTopics.length > 0) {
      return shuffleArray(cachedTopics).slice(0, requestedCount);
  }

  console.log(`[Cache] Miss: ${cacheKey}. Fetching live...`);

  // 2. Fetch Live (RSS + AI)
  let fetchedTopics: TrendingTopic[] = await fetchRealtimeRss(industry);
  
  // AI Supplement if RSS is weak
  if (fetchedTopics.length < 5) {
      try {
        const response = await callBackend('generateContent', {
            model: 'gemini-2.5-flash',
            contents: `Role: Trend Hunter. Generate 5 trending topics about "${industry}" in Taiwan (Traditional Chinese). Output Pure JSON Array: [{ "title": "...", "description": "...", "url": "#" }]`,
            config: { responseMimeType: "application/json" }
        });
        const raw = JSON.parse(cleanJsonText(response.text || '[]'));
        if (Array.isArray(raw)) {
            const aiTopics = raw.map((t: any) => ({ title: t.title, description: t.description || t.title, url: t.url || '#', imageUrl: undefined }));
            fetchedTopics = [...fetchedTopics, ...aiTopics];
        }
      } catch (e) { console.error("Gemini bypass generation failed", e); }
  }

  const uniqueTopics = Array.from(new Map(fetchedTopics.map(item => [item.title, item])).values());
  
  // 3. Save Cache
  if (uniqueTopics.length > 0) {
      await setSystemCache(cacheKey, uniqueTopics);
  }

  return shuffleArray(uniqueTopics).slice(0, requestedCount);
};

// NEW: Business Opportunity Search
export const findThreadsOpportunities = async (keyword: string): Promise<OpportunityPost[]> => {
    // 1. Construct Targeted Query
    // - site:threads.net/*/post: Forces it to find specific post pages, not user profiles or search listings.
    // - when:1m: Restricts to the last month.
    // - Negatives: Exclude sales/promo terms.
    // - Positives: Include question/problem terms.
    const searchQuery = `site:threads.net/*/post "${keyword}" (請問 OR 請益 OR 求救 OR 苦惱 OR 覺得 OR 難用 OR 怎麼辦) -開箱 -團購 -優惠 -折扣 -下單 -蝦皮 -賣場 -代購 when:1m`;
    
    try {
        // Upgrade: Use gemini-3-pro-preview for better reasoning and search capabilities
        const response = await callBackend('generateContent', {
            model: 'gemini-3-pro-preview', 
            contents: `
                Role: Social Media Lead Scout (Taiwan Region Specialist).
                Task: Analyze search results to find potential customers on Threads who have a specific PROBLEM or QUESTION about: "${keyword}".
                
                [Search Query]: ${searchQuery}
                
                [STRICT FILTERING RULES]
                1. ❌ DISCARD: Posts that are clearly advertisements, product unboxings (unless criticizing), group buys (團購), or news sharing.
                2. ✅ KEEP: Real humans expressing frustration, asking for advice, or comparing products.
                3. 🌍 LOCATION: Must appear to be Taiwan context (Traditional Chinese).
                4. 📅 TIMEFRAME: Must be recent (within 1 month).

                [URL Extraction Rules]
                - You MUST extract the exact post URL from the search result.
                - It usually looks like: https://www.threads.net/@username/post/code
                - Do NOT use google search result links. Use the actual destination link.

                [Output Format]
                RETURN ONLY A RAW JSON ARRAY. 
                Example:
                [
                    {
                        "content": "Full post text...",
                        "url": "https://www.threads.net/@user/post/123xyz",
                        "intentScore": 9,
                        "replyCount": "12", 
                        "likeCount": "50"
                    }
                ]
                
                If reply/like counts are not visible in the snippet, set them to null. Do NOT invent numbers.
            `,
            config: { 
                tools: [{ googleSearch: {} }],
                // responseMimeType: "application/json", // Removed to avoid conflict with Search Tool in some versions
            }
        });

        const rawText = cleanJsonText(response.text || '[]');
        let raw;
        try {
            raw = JSON.parse(rawText);
        } catch (parseError) {
            console.error("Failed to parse Opportunity JSON:", rawText);
            throw new Error("AI 回傳格式錯誤，請重試");
        }
        
        if (!Array.isArray(raw)) return [];

        // Post-processing to ensure URLs are valid threads links
        const validResults = raw.filter((item: OpportunityPost) => {
            const hasValidUrl = item.url && item.url.includes('threads.net') && item.url.includes('/post/');
            const hasScore = (item.intentScore || 0) >= 3;
            return hasValidUrl && hasScore;
        });

        return validResults;

    } catch (e: any) {
        console.error("Opportunity search failed", e);
        throw new Error(`搜尋失敗: ${e.message}`);
    }
};
