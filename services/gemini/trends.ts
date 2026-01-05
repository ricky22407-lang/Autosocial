
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
    // 1. Construct Targeted Query (BROAD MATCH)
    // REMOVED quotes to allow broad matching (e.g. "聖誕交換禮物" matches "聖誕禮物")
    // "site:threads.net" ensures we focus on the platform.
    const searchQuery = `${keyword} site:threads.net`; 
    
    try {
        const response = await callBackend('generateContent', {
            model: 'gemini-2.5-flash', 
            contents: `
                Role: Social Media Scraper.
                Task: Find user discussions on Threads related to: ${keyword}
                
                [Tool Instruction]
                Use the Google Search tool with the query: '${searchQuery}'
                
                [Processing Rules - STRICT]
                1. List 5-10 posts found in the search results.
                2. Do NOT be picky. If it mentions "${keyword}", include it.
                3. Even if it's an old post or just sharing a photo, include it.
                4. Extract the snippet and URL.
                
                [Output Format]
                Return ONLY a JSON Array. NO preamble text.
                [
                  {
                    "content": "Summary of what the user said...",
                    "url": "https://www.threads.net/...",
                    "intentScore": 5,
                    "replyCount": "N/A", 
                    "likeCount": "N/A"
                  }
                ]
            `,
            config: { 
                tools: [{ googleSearch: {} }],
                // SAFETY: Disable filters to ensure "rant" posts (high opportunity) aren't blocked
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
                ]
            }
        });

        const rawText = response.text || '';
        console.log("🔍 Threads Search Raw Output:", rawText); // DEBUG LOG

        // Robust JSON Parsing
        let jsonStr = rawText;
        const firstBracket = rawText.indexOf('[');
        const lastBracket = rawText.lastIndexOf(']');
        
        if (firstBracket !== -1 && lastBracket !== -1) {
            jsonStr = rawText.substring(firstBracket, lastBracket + 1);
        } else {
            console.warn("AI did not return a JSON array. Raw response:", rawText);
            return []; // Fail gracefully
        }

        try {
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed)) {
                // Filter to ensure valid URLs
                return parsed.filter(p => p.url && (p.url.includes('threads.net') || p.url.includes('instagram.com')));
            }
        } catch (e) {
            console.error("JSON Parse failed:", e);
        }
        
        return [];

    } catch (e: any) {
        console.error("Opportunity search failed", e);
        return []; 
    }
};
