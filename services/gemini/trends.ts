
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
const extractThreadsId = (url: string): string | null => {
    if (!url) return null;
    try {
        const decoded = decodeURIComponent(url);
        const match = decoded.match(/\/post\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            return match[1];
        }
    } catch (e) {}
    return null;
};

export const findThreadsOpportunities = async (keyword: string): Promise<OpportunityPost[]> => {
    // --- Query Optimization Strategy (Standard Funnel) ---
    
    // 1. Intent Keywords (Broad Inclusion):
    // 只要包含以下任一詞彙，就視為「潛在商機」收錄，後續交由 AI 判斷是否為廣告。
    const intentKeywords = `(推薦 OR 求救 OR 預算 OR 尋找 OR 真實 OR 口袋名單 OR 清單)`;
    
    // 2. Time & Site Constraint:
    // 限定 Threads 且限定「一個月內 (when:1m)」
    const searchQuery = `site:threads.net "${keyword}" ${intentKeywords} when:1m`; 
    
    try {
        const response = await callBackend('generateContent', {
            model: 'gemini-2.5-flash', 
            contents: `
                Goal: Search for high-intent user discussions on Threads about "${keyword}".
                
                [Tool Instruction]
                Perform a Google Search exactly as: '${searchQuery}'
                
                [AI SEMANTIC FILTERING]
                You will receive search results containing the keywords. You must now act as a strict filter:
                
                1. 🗑️ **DISCARD** (Ignore):
                   - Pure Advertisements / Commercial Promotions by brands.
                   - Game/Casino spam.
                   - Posts that are just "sharing a discount code" without discussion.
                   - Posts older than 1 month (if snippet date is visible).
                
                2. ✅ **KEEP** (High Value):
                   - **Questions/Help**: "請問大家...", "求推薦...", "預算有限...".
                   - **Lists/Sharing**: "我的私藏清單", "真實心得分享" (User generated content).
                   - **Discussions**: Real humans discussing the pros/cons of "${keyword}".
                
                [Output Requirement]
                - Extract up to 10 distinct posts.
                - **Language**: Summaries in Traditional Chinese.
                - **Relevance Score**: 1-10 (10 = User is actively asking to buy/use right now).
                
                Format each result strictly:
                BLOCK_START
                CONTENT: [Summary of the user's specific need or discussion]
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
        console.log("🔍 Threads Search Raw Length:", rawText.length); 

        const results: OpportunityPost[] = [];
        const blocks = rawText.split('BLOCK_START');

        for (const block of blocks) {
            if (!block.includes('BLOCK_END')) continue;
            
            const contentMatch = block.match(/CONTENT:\s*(.+)/);
            const urlMatch = block.match(/URL:\s*(.+)/);
            const scoreMatch = block.match(/SCORE:\s*(\d+)/);

            if (contentMatch) {
                const content = contentMatch[1].trim();
                const rawUrl = urlMatch ? urlMatch[1].trim() : '';
                
                // --- SMART URL RECONSTRUCTION ---
                let finalUrl = '';
                const shortcode = extractThreadsId(rawUrl);

                if (shortcode) {
                    finalUrl = `https://www.threads.net/post/${shortcode}`;
                } else {
                    // Fallback to search link if ID extraction fails
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

        return results.slice(0, 10);

    } catch (e: any) {
        console.error("Opportunity search failed", e);
        return []; 
    }
};
