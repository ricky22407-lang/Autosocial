
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
// This is the "Hunter" function. It scans any text for a Threads ID.
const extractThreadsUrl = (input: string): string | null => {
    if (!input) return null;
    
    // 1. Decode & Clean
    let decoded = input;
    try { decoded = decodeURIComponent(input); } catch (e) {}
    
    // 2. Regex Patterns (From specific to broad)
    // Pattern A: Standard URL: threads.net/post/ID
    const patternA = /(?:threads\.net\/)(?:@[\w.]+\/)?(?:post|t)\/([a-zA-Z0-9_-]{9,})/;
    const matchA = decoded.match(patternA);
    if (matchA && matchA[1]) return `https://www.threads.net/post/${matchA[1]}`;

    // Pattern B: Raw ID Extraction (Riskier, checks for base64-like strings commonly used as IDs)
    // Only used if input looks like a partial URL or ID
    if (input.length < 50 && /^[a-zA-Z0-9_-]{9,}$/.test(input)) {
        return `https://www.threads.net/post/${input}`;
    }

    // 3. Fallback: If input is already a valid URL but we missed the ID, just return it if it's threads
    if (input.includes('threads.net') && (input.startsWith('http') || input.startsWith('www'))) {
        return input;
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
                URL: [The full link found in search]
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
        
        // --- 1. Extract Valid URLs from Grounding Metadata (Backend Feature) ---
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
            const metricsMatch = block.match(/METRICS:\s*(.+)/i);

            if (contentMatch) {
                const content = contentMatch[1].trim();
                const rawUrlString = urlMatch ? urlMatch[1].trim() : '';
                
                let finalUrl = '';
                
                // Strategy 1: Hunt for ID in the AI provided text URL
                const extractedFromText = extractThreadsUrl(rawUrlString);
                if (extractedFromText) {
                    finalUrl = extractedFromText;
                }
                
                // Strategy 2: Hunt for ID in Grounding Metadata (The Rescue!)
                // If text failed, grab the next available grounding URL
                else if (groundingUrls.length > 0) {
                    if (groundingIndex < groundingUrls.length) {
                        const groundingUrl = groundingUrls[groundingIndex];
                        // Double check: does this grounding URL have an ID?
                        const extractedFromGrounding = extractThreadsUrl(groundingUrl);
                        if (extractedFromGrounding) {
                            finalUrl = extractedFromGrounding;
                        } else {
                            finalUrl = groundingUrl; // Better than nothing
                        }
                        groundingIndex++;
                    }
                }

                // Strategy 3: Fallback Search
                if (!finalUrl || (!finalUrl.includes('threads.net'))) {
                    const cleanQuery = content.substring(0, 40).replace(/[^\w\s\u4e00-\u9fa5]/g, ' ').trim();
                    finalUrl = `https://www.threads.net/search?q=${encodeURIComponent(cleanQuery)}`;
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
    console.log("🚀 Opportunity Search Stage 1: Strict");
    let results = await executeOpportunitySearch(`site:threads.net "${keyword}" after:${afterDate}`, keyword);

    if (results.length === 0) {
        // Stage 2: Moderate (Site only)
        console.log("⚠️ Stage 1 Empty. Retrying Stage 2: Moderate (No Date)...");
        results = await executeOpportunitySearch(`site:threads.net "${keyword}"`, keyword);
    }

    if (results.length === 0) {
        // Stage 3: Broad (Keyword + "threads")
        console.log("⚠️ Stage 2 Empty. Retrying Stage 3: Broad (Keyword + Context)...");
        results = await executeOpportunitySearch(`${keyword} threads`, keyword);
    }

    return results.slice(0, 10);
};
