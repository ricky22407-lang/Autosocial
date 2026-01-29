
import { TrendingTopic, OpportunityPost, StockTrend, StockCategory } from '../../types';
import { callBackend, cleanJsonText, decodeHtml, generateTopicId } from './core';
import { db, isMock } from '../firebase';

// Helper to check if news image is valid (no pixels, ads, etc)
const isValidNewsImage = (url: string): boolean => {
    if (!url) return false;
    const lower = url.toLowerCase();
    const badKeywords = ['pixel', 'tracker', 'analytics', 'facebook.com/tr', 'ads', 'doubleclick', 'button', 'share_icon', 'logo', 'placeholder'];
    if (badKeywords.some(k => lower.includes(k))) return false;
    return true;
};

// Helper: Strict Date Filter (48 Hours for parsing RSS)
const isRecentPost = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    return diffHours <= 48; 
};

const fetchRssContent = async (targetUrl: string): Promise<string> => {
    const data = await callBackend('fetchRss', { url: targetUrl });
    if (!data.text) throw new Error("Backend returned empty RSS content");
    return data.text;
};

// --- RSS PARSERS ---

const parseGoogleNewsRss = (xmlString: string): StockTrend[] => {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, "text/xml");
    const items = xml.querySelectorAll("item");
    const results: StockTrend[] = [];
    
    // UPDATED: Parse up to 50 items to build a large pool
    for (let i = 0; i < Math.min(items.length, 50); i++) {
        const item = items[i];
        
        // 1. Date Check
        const pubDate = item.querySelector("pubDate")?.textContent || "";
        if (!isRecentPost(pubDate)) continue;

        const rawTitle = item.querySelector("title")?.textContent || "";
        const cleanTitle = rawTitle.split(' - ')[0]; 
        const link = item.querySelector("link")?.textContent || "";
        
        // Simple hash for ID
        const id = generateTopicId(cleanTitle);

        if (cleanTitle && link) {
            results.push({
                id: id,
                title: cleanTitle,
                price: 0,
                change: 0,
                volume: '0',
                newsUrl: link,
                source: 'news',
                category: 'general', 
                updatedAt: Date.now()
            });
        }
    }
    return results;
};

export const fetchNewsImageFromUrl = async (url: string): Promise<string | null> => {
    if (!url) return null;
    try {
        const data = await callBackend('fetchOgImage', { url });
        if (data.imageUrl && isValidNewsImage(data.imageUrl)) return data.imageUrl;
    } catch (e) { console.warn("Backend OG fetch failed", e); }
    return null;
};

// --- STOCK MARKET LOGIC ---

/**
 * Fetch Market Data with Categories
 * Caching Rules:
 * - SOFT_TTL (1 Hour): For freshness. If older than 1h, we TRY to refresh.
 * - HARD_TTL (24 Hours): Absolute limit. If older than 24h, we MUST delete and refresh.
 * - forceRefresh: User clicked button, bypass cache.
 */
export const getMarketData = async (
    category: StockCategory = "general", 
    forceRefresh: boolean = false
): Promise<StockTrend[]> => {
    
    const SOFT_TTL = 60 * 60 * 1000; // 1 Hour (Freshness)
    const HARD_TTL = 24 * 60 * 60 * 1000; // 24 Hours (User Hard Limit)
    
    // MOCK DATA
    if (isMock) {
        return getMockData(category);
    }

    try {
        const colRef = db.collection('trending_stocks');
        let query = colRef.where('category', '==', category);
        
        // UPDATED: Fetch more items to support client-side pooling
        const snap = await query.limit(60).get();
        
        let needsUpdate = false;
        let stocks: StockTrend[] = [];

        if (!snap.empty) {
            const firstDoc = snap.docs[0].data();
            const now = Date.now();
            const dataAge = now - (firstDoc.updatedAt || 0);

            // 1. Hard Limit Check (24H)
            if (dataAge > HARD_TTL) {
                console.log(`🗑️ Market Data EXPIRED (>24h). Hard Refresh.`);
                needsUpdate = true;
            }
            // 2. Soft Limit Check (1H)
            else if (dataAge > SOFT_TTL) {
                console.log(`♻️ Market Data STALE (>1h). Refreshing...`);
                needsUpdate = true;
            }
            // 3. User Forced Refresh
            else if (forceRefresh) {
                console.log(`🔥 User Forced Refresh.`);
                needsUpdate = true;
            }
            // 4. Data Consistency Check
            else if (category === 'social' && firstDoc.source === 'news') {
                needsUpdate = true;
            }
            else {
                stocks = snap.docs.map((d: any) => d.data() as StockTrend);
                // Shuffle initially to ensure random start even from cache
                // But generally rely on frontend to slice
                stocks.sort((a,b) => b.price - a.price);
            }
        } else {
            needsUpdate = true; // No data
        }

        if (needsUpdate) {
            console.log(`📈 Fetching New Market Data [${category}]...`);
            
            let rawItems: StockTrend[] = [];
            
            if (category === 'social') {
                try {
                    // Ask Gemini for more items to fill the pool
                    const prompt = `
                    Task: List the top 25 hottest post titles from Dcard and PTT RIGHT NOW (Last 24 Hours).
                    Output JSON: [{ "title": "Exact Title", "source": "Dcard" | "PTT", "url": "..." }]
                    `;
                    const response = await callBackend('generateContent', {
                        model: 'gemini-2.5-flash',
                        contents: prompt,
                        config: { tools: [{ googleSearch: {} }] }
                    });
                    const jsonStr = cleanJsonText(response.text || '[]');
                    const trends = JSON.parse(jsonStr);
                    if (Array.isArray(trends)) {
                        rawItems = trends.map((t: any) => {
                            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent('site:' + (t.source === 'PTT' ? 'ptt.cc' : 'dcard.tw') + ' ' + t.title)}`;
                            const id = generateTopicId(t.title);
                            return {
                                id,
                                title: t.title,
                                price: 0, change: 0, volume: '0',
                                newsUrl: (t.url && t.url.startsWith('http')) ? t.url : searchUrl,
                                source: (t.source || 'Dcard').toLowerCase().includes('ptt') ? 'ptt' : 'dcard',
                                category: 'social',
                                updatedAt: Date.now()
                            };
                        });
                    }
                } catch (e) {
                    rawItems = getMockData('social');
                }
            } else {
                let query = '台灣熱門時事 when:2d';
                if (category === 'entertainment') query = '(演唱會 OR 韓星 OR 藝人 OR 網紅 OR 電影 OR Netflix) when:2d';
                if (category === 'life') query = '(優惠 OR 星巴克 OR 必勝客 OR 超商 OR 手搖飲 OR 旅遊) when:2d';
                const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
                const xml = await fetchRssContent(rssUrl);
                rawItems = parseGoogleNewsRss(xml);
            }

            // Batch Save
            const batch = db.batch();
            const newStocks: StockTrend[] = [];
            
            // Wipe old cache for this category first (Enforce 24h limit by removing old docs)
            snap.docs.forEach((d: any) => batch.delete(d.ref));

            // Save up to 50 items to DB
            for (const item of rawItems.slice(0, 50)) {
                let basePrice = category === 'social' ? 80 : 60;
                let price = Math.floor(Math.random() * 40 + basePrice);
                let change = parseFloat((Math.random() * 10 - 2).toFixed(2));

                const stockData: any = {
                    ...item,
                    category: category, 
                    price: parseFloat(price.toFixed(1)),
                    change: change,
                    volume: Math.floor(Math.random() * 9000 + 1000).toLocaleString(),
                    updatedAt: Date.now()
                };

                const docRef = colRef.doc(item.id);
                batch.set(docRef, stockData);
                newStocks.push(stockData as StockTrend);
            }

            await batch.commit();
            return newStocks.sort((a,b) => b.price - a.price);
        }

        return stocks;

    } catch (e) {
        console.error("Market Data Error", e);
        return [];
    }
};

const getMockData = (category: StockCategory): StockTrend[] => {
    // Generate more mock data for pooling
    const baseTerms = category === 'social' 
        ? ['[問卦] 天氣變冷', '#分享 好市多新品', '[爆卦] 網紅翻車', '#請益 薪水', 'Dcard 熱門', 'PTT 八卦', 'Threads 討論']
        : ['颱風假停班停課', '台積電股價', '立法院最新法案', '美國大選', '金曲獎', '奧運金牌', '物價上漲'];
    
    // Expand to 30 items
    const terms = [];
    for(let i=0; i<30; i++) {
        terms.push(`${baseTerms[i % baseTerms.length]} ${i+1}`);
    }
    
    return terms.map((t, i) => ({
        id: `mock_${category}_${i}`,
        title: t,
        price: 80 + Math.random() * 20,
        change: 5.2,
        volume: '12,500',
        newsUrl: `https://www.google.com/search?q=${encodeURIComponent(t)}`,
        source: category === 'social' ? 'dcard' : 'news',
        category: category,
        updatedAt: Date.now()
    }));
};

export const getMarketSummary = async (stock: StockTrend): Promise<string> => {
    if (stock.aiSummary) return stock.aiSummary;
    try {
        const contextPrompt = `針對主題「${stock.title}」，請生成 3 點懶人包摘要。`;
        const response = await callBackend('generateContent', {
            model: 'gemini-2.5-flash',
            contents: `${contextPrompt} [Requirements] Traditional Chinese (Taiwan), Bullet list with emojis, Professional tone.`,
            config: { tools: [{ googleSearch: {} }] }
        });
        const summary = response.text || "無法生成摘要";
        if (!isMock) {
            await db.collection('trending_stocks').doc(stock.id).update({
                aiSummary: summary,
                summaryUpdatedAt: Date.now()
            });
        }
        return summary;
    } catch (e) { return "摘要生成失敗"; }
};

// Updated: Return full pool (up to 50) instead of slicing small
export const getTrendingTopics = async (
    industry: string = "台灣熱門時事", 
    requestedCount: number = 50, // Default to Max Pool
    forceRefresh: boolean = false
): Promise<TrendingTopic[]> => {
    let category: StockCategory = 'general';
    if (industry.includes('娛樂') || industry.includes('演藝')) category = 'entertainment';
    if (industry.includes('生活') || industry.includes('美食')) category = 'life';
    
    const stocks = await getMarketData(category, forceRefresh);
    
    // Return all stocks mapped to TrendingTopic
    return stocks.map(s => ({
        title: s.title,
        description: `熱度: ${s.price}`,
        url: s.newsUrl,
        imageUrl: undefined 
    }));
};

// Opportunity Scout Logic (Unchanged)...
const patchUrl = (item: any, validLinks: string[]): string => {
    if (item.url && validLinks.includes(item.url)) return item.url;
    let cleanTitle = (item.title || item.content || '').trim();
    cleanTitle = cleanTitle.replace(/\s-\s(Dcard|PTT|看板|Threads|美妝|閒聊).*$/i, '');
    const siteKeyword = item.url?.includes('threads') ? 'site:threads.net' : 
                       item.url?.includes('dcard') ? 'site:dcard.tw' : 
                       item.url?.includes('ptt') ? 'site:ptt.cc' : '';
    const query = `${siteKeyword} ${cleanTitle}`.trim();
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};

const executeSearchQuery = async (query: string, keyword: string, intentContext: string) => {
    const prompt = `
    Role: Commercial Opportunity Hunter (Taiwan).
    Task: Find recent real user discussions on Threads, Dcard, and PTT matching the query.
    Context: We are looking for "${intentContext}" regarding "${keyword}".
    [SEARCH QUERY] ${query}
    [FILTERING RULES] 1. Last 1 month. 2. Ignore ads/news. 3. Real human intent.
    [Output Schema] JSON Array: [{ "title", "content", "url", "username", "reasoning", "intentScore" (1-10), "replyCount" }]
    IMPORTANT: Output ONLY the raw JSON string.
    `;

    try {
        const response = await callBackend('generateContent', {
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        const validLinks = response.groundingMetadata?.groundingChunks?.map((chunk: any) => chunk.web?.uri) || [];
        const jsonStr = cleanJsonText(response.text || '[]');
        const data = JSON.parse(jsonStr);
        if (Array.isArray(data)) {
            return data.map((item: any) => ({ ...item, url: patchUrl(item, validLinks) }));
        }
        return [];
    } catch (e) {
        console.error("Search failed:", e);
        return [];
    }
};

export const findThreadsOpportunities = async (keyword: string): Promise<OpportunityPost[]> => {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    const dateStr = now.toISOString().split('T')[0]; 
    const q1 = `(site:threads.net OR site:dcard.tw OR site:ptt.cc) "${keyword}" (心得 OR 評價 OR 避雷 OR 缺點 OR 後悔) after:${dateStr}`;
    const q2 = `(site:threads.net OR site:dcard.tw OR site:ptt.cc) "${keyword}" (請益 OR 選手 OR 比較 OR 哪裡買 OR 好用嗎) after:${dateStr}`;
    const q3 = `(site:threads.net OR site:dcard.tw OR site:ptt.cc) "${keyword}" (推薦 OR 熱門 OR 分享) after:${dateStr}`;

    const r1 = await executeSearchQuery(q1, keyword, "Reviews & Issues");
    const r2 = await executeSearchQuery(q2, keyword, "Buying Questions");
    const r3 = await executeSearchQuery(q3, keyword, "General Discussions");

    const allResults = [...r1, ...r2, ...r3];
    const uniqueMap = new Map();
    allResults.forEach(item => {
        let key = item.url.includes('google.com/search') ? item.title : item.url;
        if (!uniqueMap.has(key)) uniqueMap.set(key, item);
        else {
            const existing = uniqueMap.get(key);
            if (item.intentScore > existing.intentScore) uniqueMap.set(key, item);
        }
    });
    return Array.from(uniqueMap.values()).sort((a, b) => b.intentScore - a.intentScore);
};
