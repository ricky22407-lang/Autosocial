
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

// --- Smart Link Logic ---
const extractThreadsUrl = (raw: string): string | null => {
    if (!raw) return null;
    
    // Clean Markdown
    const cleanRaw = raw.replace(/[\[\]()]/g, '').trim();

    // 1. Extract Post ID directly
    try {
        const match = cleanRaw.match(/\/post\/([a-zA-Z0-9_-]+)/) || cleanRaw.match(/\/t\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            return `https://www.threads.net/post/${match[1]}`;
        }
    } catch (e) {}

    // 2. Loose check
    if (cleanRaw.includes('threads.net')) {
        return cleanRaw;
    }

    return null;
};

// Internal Helper for AI Execution
const executeOpportunitySearch = async (searchQuery: string, keyword: string): Promise<OpportunityPost[]> => {
    try {
        const response = await callBackend('generateContent', {
            model: 'gemini-2.5-flash', 
            contents: `
                Goal: Find active buying/discussion opportunities on Threads about "${keyword}".
                
                [Tool Instruction]
                Perform a Google Search for: '${searchQuery}'
                
                [AI SEMANTIC FILTERING]
                You have search results. Now filter them.
                A result is a VALID OPPORTUNITY if:
                1. It is from Threads.net (or relevant discussion).
                2. It is relevant to "${keyword}".
                3. It implies a user question, discussion, or buying intent.
                
                [Output Requirement]
                - Extract up to 8 distinct posts.
                - **Language**: Summaries in Traditional Chinese.
                - **Intent Score**: 1-10 (10 = User is begging for a recommendation).
                
                Format each result strictly:
                BLOCK_START
                CONTENT: [Summary of the user's specific need]
                URL: [The full link]
                SCORE: [1-10]
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
        
        // --- 1. Extract Valid URLs from Grounding Metadata (Backend Feature) ---
        // This is the source of truth if AI hallucinates URL syntax
        const groundingUrls: string[] = [];
        if (response.groundingMetadata?.groundingChunks) {
            response.groundingMetadata.groundingChunks.forEach((chunk: any) => {
                if (chunk.web?.uri && chunk.web.uri.includes('threads.net')) {
                    groundingUrls.push(chunk.web.uri);
                }
            });
        }
        console.log("🔗 Found Grounding URLs:", groundingUrls.length);

        const results: OpportunityPost[] = [];
        const blocks = rawText.split(/BLOCK_START/i);
        let groundingIndex = 0;

        for (const block of blocks) {
            if (!block.match(/BLOCK_END/i)) continue;
            
            const contentMatch = block.match(/CONTENT:\s*(.+)/i);
            const urlMatch = block.match(/URL:\s*(.+)/i);
            const scoreMatch = block.match(/SCORE:\s*(\d+)/i);

            if (contentMatch) {
                const content = contentMatch[1].trim();
                const rawUrl = urlMatch ? urlMatch[1].trim() : '';
                
                let finalUrl = '';
                
                // Attempt 1: Parse from text
                const extracted = extractThreadsUrl(rawUrl);
                
                if (extracted) {
                    finalUrl = extracted;
                } 
                // Attempt 2: Use Grounding Metadata Fallback (The Rescue!)
                else if (groundingUrls.length > 0) {
                    // Try to match simple heuristic: pop the next available URL
                    if (groundingIndex < groundingUrls.length) {
                        finalUrl = groundingUrls[groundingIndex];
                        groundingIndex++;
                    }
                }

                // If still empty, use fallback search link
                if (!finalUrl || (!finalUrl.includes('threads.net'))) {
                    const cleanQuery = content.substring(0, 40).replace(/[^\w\s\u4e00-\u9fa5]/g, ' ').trim();
                    finalUrl = `https://www.threads.net/search?q=${encodeURIComponent(cleanQuery)}`;
                }

                results.push({
                    content: content,
                    url: finalUrl,
                    reasoning: '',
                    intentScore: scoreMatch ? parseInt(scoreMatch[1]) : 5,
                    replyCount: '?',
                    likeCount: '?'
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
    // Problem: Strict search (date + site) often returns 0 results due to indexing lag or bad date calculation.
    // Solution: Try strict -> Try moderate -> Try broad.
    
    // 1. Calculate Date (30 Days Ago) using Timestamp Math (Safer than setMonth)
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const afterDate = new Date(Date.now() - thirtyDaysMs).toISOString().split('T')[0];

    // Stage 1: Strict (Site + Date)
    // "site:threads.net {keyword} after:YYYY-MM-DD"
    console.log("🚀 Opportunity Search Stage 1: Strict");
    let results = await executeOpportunitySearch(`site:threads.net ${keyword} after:${afterDate}`, keyword);

    if (results.length === 0) {
        // Stage 2: Moderate (Site only)
        // "site:threads.net {keyword}"
        console.log("⚠️ Stage 1 Empty. Retrying Stage 2: Moderate (No Date)...");
        results = await executeOpportunitySearch(`site:threads.net ${keyword}`, keyword);
    }

    if (results.length === 0) {
        // Stage 3: Broad (Keyword + "threads")
        // "{keyword} threads" -> Relies on Google's relevance matching
        console.log("⚠️ Stage 2 Empty. Retrying Stage 3: Broad (Keyword + Context)...");
        results = await executeOpportunitySearch(`${keyword} threads`, keyword);
    }

    return results.slice(0, 10);
};
