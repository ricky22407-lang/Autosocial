
import { TrendingTopic, OpportunityPost, StockTrend, StockCategory } from '../../types';
import { callBackend, getSystemCache, setSystemCache, shuffleArray, cleanJsonText, decodeHtml, Type } from './core';
import { db, isMock } from '../firebase';

// Helper to check if news image is valid (no pixels, ads, etc)
const isValidNewsImage = (url: string): boolean => {
    if (!url) return false;
    const lower = url.toLowerCase();
    const badKeywords = ['pixel', 'tracker', 'analytics', 'facebook.com/tr', 'ads', 'doubleclick', 'button', 'share_icon', 'logo', 'placeholder'];
    if (badKeywords.some(k => lower.includes(k))) return false;
    return true;
};

// Helper: Strict Date Filter (48 Hours)
const isRecentPost = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    return diffHours <= 48; // Only allow posts within 48 hours
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

// --- RSS PARSERS ---

const parseGoogleNewsRss = (xmlString: string): StockTrend[] => {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, "text/xml");
    const items = xml.querySelectorAll("item");
    const results: StockTrend[] = [];
    
    for (let i = 0; i < Math.min(items.length, 30); i++) {
        const item = items[i];
        
        // 1. Date Check
        const pubDate = item.querySelector("pubDate")?.textContent || "";
        if (!isRecentPost(pubDate)) continue;

        const rawTitle = item.querySelector("title")?.textContent || "";
        const cleanTitle = rawTitle.split(' - ')[0]; 
        const link = item.querySelector("link")?.textContent || "";
        
        if (cleanTitle && link) {
            results.push({
                id: generateTopicId(cleanTitle),
                title: cleanTitle,
                price: 0, // Calculated later
                change: 0,
                volume: '0',
                newsUrl: link,
                source: 'news',
                category: 'general', // Default, overridden later
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

const generateTopicId = (title: string) => {
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
        const char = title.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return `trend_${Math.abs(hash)}`;
};

/**
 * Fetch Market Data with Categories
 * Uses shared cache in Firestore, partitioned by document content.
 */
export const getMarketData = async (category: StockCategory = "general"): Promise<StockTrend[]> => {
    const ONE_HOUR = 60 * 60 * 1000;
    
    // MOCK DATA
    if (isMock) {
        return getMockData(category);
    }

    try {
        const colRef = db.collection('trending_stocks');
        let query = colRef.where('category', '==', category);
        
        const snap = await query.limit(30).get();
        
        let needsUpdate = false;
        let stocks: StockTrend[] = [];

        if (!snap.empty) {
            const firstDoc = snap.docs[0].data();
            // Refresh if data > 1 hour old
            if (Date.now() - firstDoc.updatedAt > ONE_HOUR) {
                needsUpdate = true;
            } else {
                stocks = snap.docs.map((d: any) => d.data() as StockTrend);
                // Sort by price desc in memory
                stocks.sort((a,b) => b.price - a.price);
            }
        } else {
            needsUpdate = true;
        }

        if (needsUpdate) {
            console.log(`📈 Market Data Stale [${category}]. Refreshing...`);
            
            // 1. Fetch Raw Data
            let rawItems: StockTrend[] = [];
            
            if (category === 'social') {
                // [UPGRADE] Use Gemini + Google Search for Dcard/PTT
                // This replaces the unreliable RSSHub fetch
                try {
                    const prompt = `
                    Task: Find the top 8 trending discussions RIGHT NOW on Dcard (Trending/Mood/YouTuber boards) and PTT (Gossiping).
                    Requirements:
                    1. Must be current topics (last 24 hours).
                    2. Return ONLY a JSON array.
                    3. Schema: [{ "title": "Topic Title", "source": "Dcard" | "PTT", "url": "Link if found or empty" }]
                    `;
                    
                    const response = await callBackend('generateContent', {
                        model: 'gemini-2.5-flash',
                        contents: prompt,
                        config: { 
                            tools: [{ googleSearch: {} }],
                            responseMimeType: "application/json"
                        }
                    });
                    
                    const jsonStr = cleanJsonText(response.text || '[]');
                    const trends = JSON.parse(jsonStr);
                    
                    if (Array.isArray(trends)) {
                        rawItems = trends.map((t: any) => ({
                            id: generateTopicId(t.title),
                            title: t.title,
                            price: 0,
                            change: 0,
                            volume: '0',
                            // Use Google Search URL if exact link is missing
                            newsUrl: t.url || `https://www.google.com/search?q=${encodeURIComponent(t.title + ' ' + t.source)}`,
                            source: (t.source || 'Dcard').toLowerCase().includes('ptt') ? 'ptt' : 'dcard',
                            category: 'social',
                            updatedAt: Date.now()
                        }));
                    }
                } catch (e) {
                    console.error("Social Trend Gen Failed", e);
                    // Fallback to mock if API fails to avoid empty screen
                    rawItems = getMockData('social');
                }
            } else {
                // Google News with Keywords & Date Filter
                // Added "when:2d" to force recent results
                let query = '台灣熱門時事 when:2d';
                if (category === 'entertainment') query = '(演唱會 OR 韓星 OR 藝人 OR 網紅 OR 電影 OR Netflix) when:2d';
                if (category === 'life') query = '(優惠 OR 星巴克 OR 必勝客 OR 超商 OR 手搖飲 OR 旅遊) when:2d';
                
                const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
                const xml = await fetchRssContent(rssUrl);
                rawItems = parseGoogleNewsRss(xml);
            }

            // 2. Process & Save
            const batch = db.batch();
            const newStocks: StockTrend[] = [];
            const existingMap = new Map<string, any>();
            snap.docs.forEach((d: any) => existingMap.set(d.data().title, d.data()));

            // Limit to top 20
            for (const item of rawItems.slice(0, 20)) {
                const existing = existingMap.get(item.title);

                // Price Algorithm
                // Social topics (Dcard/PTT) tend to be more volatile
                let basePrice = category === 'social' ? 80 : 60;
                let volatility = category === 'social' ? 15 : 10;

                let price = existing ? existing.price + (Math.random() * volatility - (volatility/2)) : Math.floor(Math.random() * 40 + basePrice);
                price = Math.max(10, Math.min(100, price));
                
                let change = existing ? ((price - existing.price) / existing.price) * 100 : (Math.random() * 20 - 5);
                change = parseFloat(change.toFixed(2));

                const stockData: any = {
                    ...item,
                    category: category, // Enforce category
                    price: parseFloat(price.toFixed(1)),
                    change: change,
                    volume: Math.floor(Math.random() * 9000 + 1000).toLocaleString(),
                    updatedAt: Date.now()
                };

                // Keep AI summary if exists
                if (existing?.aiSummary) stockData.aiSummary = existing.aiSummary;
                if (existing?.summaryUpdatedAt) stockData.summaryUpdatedAt = existing.summaryUpdatedAt;

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
    const prefixes: Record<string, string[]> = {
        'general': ['政治', '天氣', '交通', '國際'],
        'entertainment': ['Super Junior', 'BLACKPINK', '周杰倫', 'Netflix', '金曲獎'],
        'life': ['星巴克買一送一', '全家霜淇淋', '好市多新品', '機票促銷'],
        'social': ['[閒聊] 公司新人', '[問卦] 雞排漲價', '[心情] 分手了', '[請益] 買房']
    };
    
    const terms = prefixes[category] || prefixes['general'];
    return terms.map((t, i) => ({
        id: `mock_${category}_${i}`,
        title: `${t} - 相關熱門話題測試`,
        price: 80 + Math.random() * 20,
        change: 5.2,
        volume: '12,500',
        newsUrl: '#',
        source: category === 'social' ? (Math.random() > 0.5 ? 'dcard' : 'ptt') : 'news',
        category: category,
        updatedAt: Date.now()
    }));
};

/**
 * Get AI Summary (Lazy Loading)
 */
export const getMarketSummary = async (stock: StockTrend): Promise<string> => {
    if (stock.aiSummary) return stock.aiSummary;
    
    // Generate
    console.log(`🤖 Generating Summary for ${stock.title}...`);
    try {
        // Adjust prompt based on source
        let contextPrompt = `針對主題「${stock.title}」，請生成 3 點懶人包摘要。`;
        if (stock.source === 'dcard' || stock.source === 'ptt') {
            contextPrompt = `針對網路熱議話題「${stock.title}」，請分析網友討論重點與正反意見。`;
        }

        const response = await callBackend('generateContent', {
            model: 'gemini-2.5-flash',
            contents: `${contextPrompt}
            [Requirements]
            1. Use Traditional Chinese (Taiwan).
            2. Format as a bullet list with emojis.
            3. Tone: Professional but engaging (News Anchor).
            4. Keep it under 150 words total.
            `,
            config: { tools: [{ googleSearch: {} }] }
        });
        
        const summary = response.text || "無法生成摘要";

        // Save back to DB
        if (!isMock) {
            await db.collection('trending_stocks').doc(stock.id).update({
                aiSummary: summary,
                summaryUpdatedAt: Date.now()
            });
        }

        return summary;
    } catch (e) {
        console.error("Summary Gen Error", e);
        return "摘要生成失敗 (API Error)";
    }
};

// Legacy support
export const getTrendingTopics = async (industry: string = "台灣熱門時事", requestedCount: number = 10): Promise<TrendingTopic[]> => {
    // Determine category based on industry keyword roughly
    let category: StockCategory = 'general';
    if (industry.includes('娛樂') || industry.includes('演藝')) category = 'entertainment';
    if (industry.includes('生活') || industry.includes('美食')) category = 'life';
    
    const stocks = await getMarketData(category);
    return stocks.slice(0, requestedCount).map(s => ({
        title: s.title,
        description: `熱度: ${s.price}`,
        url: s.newsUrl
    }));
};

// --- Opportunity Scout Implementation ---
export const findThreadsOpportunities = async (keyword: string): Promise<OpportunityPost[]> => {
    const prompt = `
    Role: Commercial Intent Scout.
    Task: Search for public social media posts (Threads, Dcard, PTT) related to "${keyword}" where users are expressing explicit **Commercial Intent**.
    
    [Definition of Commercial Intent]
    - Asking for product recommendations ("求推薦", "好用嗎").
    - Comparing options ("A vs B", "怎麼選").
    - Complaining about current solution (Pain points).
    - Expressing a wish/need ("好想要", "找好久").

    [Constraints]
    - Region: Taiwan (Traditional Chinese).
    - Source: Prioritize site:threads.net.
    - Exclude: News, Official Brand Accounts, Ads.

    [Output Schema]
    Return a JSON Array (OpportunityPost[]):
    [{
      "content": "Snippet of the user's post (max 80 chars)",
      "url": "URL to the post",
      "username": "Author ID (if available, else 'Unknown')",
      "reasoning": "Brief analysis of why this is a lead",
      "intentScore": Integer 1-10 (10 = Ready to buy),
      "replyCount": "Estimate (e.g. '12')",
      "likeCount": "Estimate (e.g. '50')"
    }]
    `;

    try {
        const response = await callBackend('generateContent', {
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }],
                responseMimeType: "application/json"
            }
        });

        const jsonStr = cleanJsonText(response.text || '[]');
        const data = JSON.parse(jsonStr);
        
        if (Array.isArray(data)) return data;
        return [];
    } catch (e) {
        console.error("Opportunity Scout Error:", e);
        return [];
    }
};
