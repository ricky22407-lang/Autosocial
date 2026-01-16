
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
    
    for (let i = 0; i < Math.min(items.length, 25); i++) {
        const item = items[i];
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

const parseRssHubFeed = (xmlString: string, source: 'dcard' | 'ptt'): StockTrend[] => {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, "text/xml");
    const items = xml.querySelectorAll("item");
    const results: StockTrend[] = [];

    for (let i = 0; i < Math.min(items.length, 20); i++) {
        const item = items[i];
        const title = item.querySelector("title")?.textContent || "";
        const link = item.querySelector("link")?.textContent || "";
        
        if (title && link) {
            // Dcard/PTT titles might contain "[Board]" prefix, optional cleaning
            results.push({
                id: generateTopicId(title),
                title: title,
                price: 0,
                change: 0,
                volume: '0',
                newsUrl: link,
                source: source,
                category: 'social',
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
        // We filter by category in Firestore
        // Note: Requires composite index if we sort by price.
        // For simplicity in this demo without indexes: fetch all simple query, filter in memory.
        // Or better: store them with category field.
        
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
                // Fetch Dcard & PTT in parallel
                try {
                    const [dcardXml, pttXml] = await Promise.all([
                        fetchRssContent('https://rsshub.app/dcard/posts/popular'),
                        fetchRssContent('https://rsshub.app/ptt/hot')
                    ]);
                    rawItems = [
                        ...parseRssHubFeed(dcardXml, 'dcard'),
                        ...parseRssHubFeed(pttXml, 'ptt')
                    ];
                    // Shuffle to mix Dcard/PTT
                    rawItems = shuffleArray(rawItems);
                } catch(e) {
                    console.error("RSSHub Fetch Error", e);
                    // Fallback to General News if RSSHub fails
                    const xml = await fetchRssContent(`https://news.google.com/rss/search?q=熱門&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`);
                    rawItems = parseGoogleNewsRss(xml);
                }
            } else {
                // Google News with Keywords
                let query = '台灣熱門時事';
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

// --- Other Helpers (Unchanged) ---
export const findThreadsOpportunities = async (keyword: string): Promise<OpportunityPost[]> => {
    // Placeholder - real implementation uses Google Search grounding
    return []; 
};
