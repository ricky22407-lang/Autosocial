
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
    // --- Query Optimization Strategy (Simplified for Maximum Recall) ---
    
    // 1. Minimal Intent Keywords:
    // Broadened to include "sharing" and "discussion", not just "asking".
    // This helps catch "Gift ideas sharing" posts which are also opportunities.
    const intentKeywords = `(討論 OR 推薦 OR 心得 OR 請問 OR 分享)`;
    
    // 2. NO Negative Keywords in Search Query:
    // Google search excludes aggressively. If a post says "No gambling allowed", 
    // a query like "-gambling" might exclude it. We let AI filter spam instead.
    
    const searchQuery = `site:threads.net "${keyword}" ${intentKeywords}`; 
    
    try {
        const response = await callBackend('generateContent', {
            model: 'gemini-2.5-flash', 
            contents: `
                Role: Social Media Scout (Taiwan).
                Task: Find genuine user discussions on Threads about: "${keyword}".
                
                [Tool Instruction]
                Use Google Search to find relevant Threads posts. Query: '${searchQuery}'
                
                [AI FILTERING LOGIC]
                Scan the search results and select the best 10 posts based on these priorities:
                
                1. ✅ **Genuine Human Discussion**: Prioritize real people asking questions, sharing experiences, or discussing the topic.
                2. ✅ **Broad Relevance**: If exact "buying questions" are scarce, include "sharing" or "unboxing" posts (e.g., "This Christmas gift is great").
                3. 🚫 **Spam Filter**: Exclude *obvious* casino/gambling bots or pure copy-paste game ads. (Official brand posts are okay if they have user comments/discussion).
                
                [Output Requirement]
                1. Find up to 10 distinct posts.
                2. **IMPORTANT**: Extract the URL correctly.
                3. **LANGUAGE**: Summary must be in **Traditional Chinese**.
                
                Format each result strictly as a block:
                
                BLOCK_START
                CONTENT: [Summary of the post]
                URL: [The full link]
                SCORE: [1-10 Relevance Score]
                REPLY_COUNT: [Number or N/A]
                LIKE_COUNT: [Number or N/A]
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
            const replyMatch = block.match(/REPLY_COUNT:\s*(.+)/);
            const likeMatch = block.match(/LIKE_COUNT:\s*(.+)/);

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
                    replyCount: replyMatch ? replyMatch[1].trim() : undefined,
                    likeCount: likeMatch ? likeMatch[1].trim() : undefined
                });
            }
        }

        return results.slice(0, 10);

    } catch (e: any) {
        console.error("Opportunity search failed", e);
        return []; 
    }
};
