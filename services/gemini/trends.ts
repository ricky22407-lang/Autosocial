
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

// --- Strict ID Extraction Logic ---
// 只抓取 /post/ 或 /t/ 後面跟著的 ID，並且排除 ? 或 & 之後的參數
const extractThreadsIdStrict = (text: string): string | null => {
    if (!text) return null;
    let decoded = text;
    try { decoded = decodeURIComponent(text); } catch (e) {}

    // Regex Explanation:
    // threads.net/           -> Domain
    // .*                     -> Any path (e.g. @username/)
    // (?:\/post\/|\/t\/)     -> Match either /post/ or /t/
    // ([A-Za-z0-9_-]{5,})    -> Capture the ID (at least 5 chars, usually 11)
    const match = decoded.match(/threads\.net\/.*(?:\/post\/|\/t\/)([A-Za-z0-9_-]{5,})/i);
    
    if (match && match[1]) {
        // Double safety: split by query params delimiters just in case regex leaked
        return match[1].split(/[?&/]/)[0];
    }
    return null;
};

// Internal Helper for AI Execution
const executeOpportunitySearch = async (searchQuery: string, keyword: string): Promise<OpportunityPost[]> => {
    try {
        const response = await callBackend('generateContent', {
            model: 'gemini-2.5-flash', 
            contents: `
                Goal: Find active opportunities on Threads about "${keyword}".
                
                [Tool Instruction]
                Perform a Google Search for: '${searchQuery}'
                
                [Output Requirement]
                - Extract up to 8 distinct posts.
                - **Language**: Summaries in Traditional Chinese.
                - **Intent Score**: 1-10 (10 = Asking for recommendation).
                - **URL**: Provide the specific Threads post link if found.
                - **SEARCH_KEYWORD**: Extract the 2-3 most important keywords from the post (e.g., "iphone 15 case recommendation"). Do NOT include "user asking for".
                
                Format each result strictly:
                BLOCK_START
                CONTENT: [Summary of the post content]
                URL: [The full link found in search]
                SEARCH_KEYWORD: [Concise keywords for manual search]
                SCORE: [1-10]
                METRICS: [Optional: 10 replies, 5 likes]
                BLOCK_END
            `,
            config: { 
                tools: [{ googleSearch: {} }],
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
                ]
            }
        });

        const rawText = response.text || '';
        console.log(`🔍 Search [${searchQuery}] Raw Length:`, rawText.length); 
        
        // --- 1. Grounding Metadata Rescue Pool (Source of Truth) ---
        // Iterate through Google Search results to find REAL post IDs
        const validIdsPool: string[] = [];
        
        if (response.groundingMetadata?.groundingChunks) {
            response.groundingMetadata.groundingChunks.forEach((chunk: any) => {
                const uri = chunk.web?.uri;
                if (uri && uri.includes('threads.net')) {
                    const id = extractThreadsIdStrict(uri);
                    if (id) {
                        validIdsPool.push(id);
                    }
                }
            });
        }
        console.log("🔗 Verified ID Pool:", validIdsPool);

        const results: OpportunityPost[] = [];
        const blocks = rawText.split(/BLOCK_START/i);
        let poolIndex = 0;

        for (const block of blocks) {
            if (!block.match(/BLOCK_END/i)) continue;
            
            const contentMatch = block.match(/CONTENT:\s*(.+)/i);
            const urlMatch = block.match(/URL:\s*(.+)/i);
            const searchKwMatch = block.match(/SEARCH_KEYWORD:\s*(.+)/i);
            const scoreMatch = block.match(/SCORE:\s*(\d+)/i);
            const metricsMatch = block.match(/METRICS:\s*(.+)/i);

            if (contentMatch) {
                const content = contentMatch[1].trim();
                const rawUrlLine = urlMatch ? urlMatch[1].trim() : '';
                const searchKeyword = searchKwMatch ? searchKwMatch[1].trim() : content.substring(0, 15);
                
                let finalUrl = '';
                
                // Priority 1: Check if AI provided URL contains a valid ID
                let id = extractThreadsIdStrict(rawUrlLine);
                
                // Priority 2: Use an ID from the Verified Pool (Google Search Results)
                if (!id && poolIndex < validIdsPool.length) {
                    id = validIdsPool[poolIndex];
                    poolIndex++; 
                }

                // Construct Clean URL if ID found
                if (id) {
                    finalUrl = `https://www.threads.net/post/${id}`;
                } else {
                    // Final Fallback: Search Link using EXTRACTED KEYWORDS (not full summary)
                    // This fixes the "Search page shows AI conclusion" issue
                    finalUrl = `https://www.threads.net/search?q=${encodeURIComponent(searchKeyword)}`;
                }

                // Metrics Parsing
                let replyCount = '0';
                let likeCount = '0';
                if (metricsMatch) {
                    const mText = metricsMatch[1];
                    const r = mText.match(/(\d+)\s*repl/i);
                    const l = mText.match(/(\d+)\s*like/i);
                    if (r) replyCount = r[1];
                    if (l) likeCount = l[1];
                }

                results.push({
                    content: content,
                    url: finalUrl,
                    reasoning: '',
                    intentScore: scoreMatch ? parseInt(scoreMatch[1]) : 5,
                    replyCount,
                    likeCount
                });
            }
        }
        return results;
    } catch (e) {
        console.error("Execute search failed:", e);
        return [];
    }
};

export const findThreadsOpportunities = async (keyword: string): Promise<OpportunityPost[]> => {
    // --- Query Optimization Strategy (Multi-Stage Fallback) ---
    // 1. Calculate Date (30 Days Ago)
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const afterDate = new Date(Date.now() - thirtyDaysMs).toISOString().split('T')[0];

    // Stage 1: Strict (Site + Date)
    console.log("🚀 Opportunity Search Stage 1: Site + Date");
    let results = await executeOpportunitySearch(`site:threads.net "${keyword}" after:${afterDate}`, keyword);

    if (results.length === 0) {
        // Stage 2: Moderate (Site only) - Remove date constraint if Stage 1 fails
        console.log("⚠️ Stage 1 Empty. Retrying Stage 2: Site Only...");
        results = await executeOpportunitySearch(`site:threads.net "${keyword}"`, keyword);
    }

    if (results.length === 0) {
        // Stage 3: Broad (Keyword + "threads") - Relies on Google's relevance matching
        console.log("⚠️ Stage 2 Empty. Retrying Stage 3: Broad...");
        results = await executeOpportunitySearch(`${keyword} threads`, keyword);
    }

    return results.slice(0, 10);
};
