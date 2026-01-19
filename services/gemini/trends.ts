
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
            
            // CACHE INVALIDATION LOGIC:
            // 1. Check Time: Refresh if data > 1 hour old
            if (Date.now() - firstDoc.updatedAt > ONE_HOUR) {
                needsUpdate = true;
            } 
            // 2. Check Data Integrity: If we are in 'social' category but data source is 'news'
            // This means we have legacy/fallback data in cache -> Force Refresh!
            else if (category === 'social' && firstDoc.source === 'news') {
                console.log("♻️ Detected legacy News data in Social category. Forcing refresh...");
                needsUpdate = true;
            }
            // 3. Check Quantity: If social category has too few items (old logic), refresh
            else if (category === 'social' && snap.size < 8) {
                console.log("♻️ Detected low quantity in Social category. Forcing refresh...");
                needsUpdate = true;
            }
            else {
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
                // Increased count request to 15
                // Strictly requested exact titles
                try {
                    const prompt = `
                    Task: List the top 15 hottest post titles from Dcard (Trending/Mood/YouTuber) and PTT (Gossiping/Stock) RIGHT NOW (Last 24 Hours).
                    
                    [Requirements]
                    1. Exact Titles: Return the **exact** post title (e.g. "[問卦] 為什麼..." or "#分享 今天的穿搭"). Do NOT summarize (e.g. do NOT write "Political issue").
                    2. Count: Return exactly 15 distinct items.
                    3. Source: Must be specific (Dcard or PTT).
                    4. Url: If you find the direct link, use it. If not, leave empty.
                    
                    Output JSON: [{ "title": "Exact Post Title", "source": "Dcard" | "PTT", "url": "..." }]
                    
                    IMPORTANT: Output ONLY the raw JSON string. Do not use Markdown code blocks.
                    `;
                    
                    const response = await callBackend('generateContent', {
                        model: 'gemini-2.5-flash',
                        contents: prompt,
                        config: { 
                            tools: [{ googleSearch: {} }]
                            // responseMimeType NOT supported with tools
                        }
                    });
                    
                    const jsonStr = cleanJsonText(response.text || '[]');
                    const trends = JSON.parse(jsonStr);
                    
                    if (Array.isArray(trends)) {
                        rawItems = trends.map((t: any) => {
                            // Construct a smart search URL if direct URL is missing
                            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent('site:' + (t.source === 'PTT' ? 'ptt.cc' : 'dcard.tw') + ' ' + t.title)}`;
                            
                            return {
                                id: generateTopicId(t.title),
                                title: t.title,
                                price: 0,
                                change: 0,
                                volume: '0',
                                newsUrl: (t.url && t.url.startsWith('http')) ? t.url : searchUrl,
                                source: (t.source || 'Dcard').toLowerCase().includes('ptt') ? 'ptt' : 'dcard',
                                category: 'social',
                                updatedAt: Date.now()
                            };
                        });
                    }
                } catch (e) {
                    console.error("Social Trend Gen Failed", e);
                    // Fallback to mock if API fails to avoid empty screen
                    rawItems = getMockData('social');
                }
            } else {
                // Google News with Keywords & Date Filter
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
            
            // Delete old docs first to ensure clean state for this category
            snap.docs.forEach((d: any) => {
                existingMap.set(d.data().title, d.data());
                batch.delete(d.ref); // Wipe old cache for this category
            });

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
    // Enhanced Mock Data with more realistic, clickable titles
    const general = [
        '颱風假停班停課最新快訊', '台積電股價創新高分析', '立法院最新法案爭議懶人包', '美國總統大選即時民調',
        '最新地震快訊', '台北大巨蛋演唱會檔期', '國旅住宿補助申請教學', 'iPhone 16 上市規格預測'
    ];
    
    const social = [
        '[問卦] 有沒有這週天氣突然變冷的八卦?', 
        '#分享 好市多必買新品清單', 
        '[爆卦] 某知名網紅翻車了', 
        '#請益 第一份工作薪水這樣算低嗎?',
        '[心情] 另一半好像出軌了怎麼辦', 
        '[閒聊] 大家早餐都吃什麼?', 
        '[新聞] 交通新制上路首日亂象', 
        '#討論 Threads 演算法是不是變了?',
        '[問卦] 雞排一片100元真的有人買?',
        '#分享 推薦台北適合讀書的咖啡廳',
        '[協尋] 遺失 Airpods Pro (信義區)',
        '[討論] 該為了高薪去不喜歡的公司嗎?'
    ];

    let terms = general;
    let source: 'news' | 'dcard' | 'ptt' = 'news';

    if (category === 'social') {
        terms = social;
        source = 'dcard'; // Default, will randomize below
    } else if (category === 'entertainment') {
        terms = ['周杰倫演唱會搶票攻略', 'Netflix 黑白大廚 冠軍是誰', '韓星來台見面會資訊', '金曲獎入圍名單預測'];
    } else if (category === 'life') {
        terms = ['全家霜淇淋買一送一', '星巴克數位體驗抽獎', '麥當勞新品試吃心得', '日本旅遊必買藥妝'];
    }
    
    return terms.map((t, i) => {
        // Randomize source for social mock
        let currentSource: StockTrend['source'] = source;
        if (category === 'social') {
            currentSource = t.includes('[') ? 'ptt' : 'dcard';
        }

        return {
            id: `mock_${category}_${i}`,
            title: t,
            price: 80 + Math.random() * 20,
            change: 5.2,
            volume: '12,500',
            // Create a valid search URL instead of #
            newsUrl: `https://www.google.com/search?q=${encodeURIComponent(t)}`,
            source: currentSource,
            category: category,
            updatedAt: Date.now()
        };
    });
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
        url: s.newsUrl,
        // Optional: Pass an image if available from news logic
        imageUrl: undefined 
    }));
};

// --- Opportunity Scout Implementation (OSINT STRATEGY) ---

// Smart Link Patcher to fix hallucinations and suffix issues
const patchUrl = (item: any, validLinks: string[]): string => {
    // 1. If we have a direct exact match in metadata, it's valid.
    if (item.url && validLinks.includes(item.url)) return item.url;

    // 2. Fallback: Create a clean, clickable Google Search URL
    // Remove " - Dcard", " - 看板...", etc. to avoid messy search results
    // Example: "#分享避雷空姐噴霧- 美妝板 - Dcard" -> "#分享避雷空姐噴霧"
    let cleanTitle = (item.title || item.content || '').trim();
    cleanTitle = cleanTitle.replace(/\s-\s(Dcard|PTT|看板|Threads|美妝|閒聊).*$/i, '');
    
    const siteKeyword = item.url?.includes('threads') ? 'site:threads.net' : 
                       item.url?.includes('dcard') ? 'site:dcard.tw' : 
                       item.url?.includes('ptt') ? 'site:ptt.cc' : '';
                       
    // Encode properly
    const query = `${siteKeyword} ${cleanTitle}`.trim();
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};

const executeSearchQuery = async (query: string, keyword: string, intentContext: string) => {
    // Note: 'intentContext' describes what we are looking for (e.g. "reviews")
    const prompt = `
    Role: Commercial Opportunity Hunter (Taiwan).
    Task: Find recent real user discussions on Threads, Dcard, and PTT matching the query.
    Context: We are looking for "${intentContext}" regarding "${keyword}".
    
    [SEARCH QUERY]
    ${query}

    [FILTERING RULES]
    1. **Timeframe**: Focus on results from the last 1 month.
    2. **Relevance**: Ignore official news, brand ads, or bot posts. We need REAL HUMAN discussions.
    3. **Content Extraction**: 
       - Title: Keep it clean (remove " - Dcard" etc).
       - Content: Extract the sentence showing the buying intent or opinion.

    [Output Schema]
    Return a JSON Array (OpportunityPost[]):
    [{
      "title": "Clean Post Title",
      "content": "Key snippet or summary (max 80 chars)",
      "url": "Direct URL if found, otherwise empty",
      "username": "Author ID if visible, else 'Unknown'",
      "reasoning": "Why fits '${intentContext}'?",
      "intentScore": Integer 1-10 (10 = Ready to buy),
      "replyCount": "Estimate or 'Unknown'",
      "likeCount": "Estimate or 'Unknown'"
    }]

    IMPORTANT: Output ONLY the raw JSON string.
    `;

    try {
        const response = await callBackend('generateContent', {
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }]
            }
        });

        const validLinks = response.groundingMetadata?.groundingChunks
            ?.map((chunk: any) => chunk.web?.uri)
            .filter((uri: string) => uri && (uri.includes('threads.net') || uri.includes('dcard.tw') || uri.includes('ptt.cc'))) || [];

        const jsonStr = cleanJsonText(response.text || '[]');
        const data = JSON.parse(jsonStr);
        
        if (Array.isArray(data)) {
            return data.map((item: any) => ({
                ...item,
                url: patchUrl(item, validLinks)
            }));
        }
        return [];
    } catch (e) {
        console.error("Search execution failed for query:", query, e);
        return [];
    }
};

export const findThreadsOpportunities = async (keyword: string): Promise<OpportunityPost[]> => {
    // Calculate Date for "Last Month"
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // Multi-Pass Strategy: Execute 3 distinct searches sequentially (NOT parallel)
    // This prevents Queue ticket loss due to missing Firestore indexes when concurrency is high
    
    // Pass 1: Quality / Issues (Reviews)
    const q1 = `(site:threads.net OR site:dcard.tw OR site:ptt.cc) "${keyword}" (心得 OR 評價 OR 避雷 OR 缺點 OR 後悔) after:${dateStr}`;
    
    // Pass 2: Decision Making (Questions)
    const q2 = `(site:threads.net OR site:dcard.tw OR site:ptt.cc) "${keyword}" (請益 OR 選手 OR 比較 OR 哪裡買 OR 好用嗎) after:${dateStr}`;
    
    // Pass 3: General / Trending (Broad Fallback)
    const q3 = `(site:threads.net OR site:dcard.tw OR site:ptt.cc) "${keyword}" (推薦 OR 熱門 OR 分享) after:${dateStr}`;

    console.log(`[Opportunity Scout] Launching Sequential Multi-Pass Search for: ${keyword}`);

    // Sequential Execution
    const r1 = await executeSearchQuery(q1, keyword, "Reviews & Issues");
    const r2 = await executeSearchQuery(q2, keyword, "Buying Questions");
    const r3 = await executeSearchQuery(q3, keyword, "General Discussions");

    // Aggregate & Deduplicate
    const allResults = [...r1, ...r2, ...r3];
    const uniqueMap = new Map();
    
    allResults.forEach(item => {
        // Create a unique key based on URL or Title (if URL missing)
        // Normalize URL to avoid duplicates like http vs https or params
        let key = item.url;
        if (key.includes('google.com/search')) {
            // If fallback URL, dedup by title
            key = item.title; 
        }
        
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, item);
        } else {
            // Keep the one with higher intent score if duplicate found
            const existing = uniqueMap.get(key);
            if (item.intentScore > existing.intentScore) {
                uniqueMap.set(key, item);
            }
        }
    });

    // Sort by Intent Score
    return Array.from(uniqueMap.values()).sort((a, b) => b.intentScore - a.intentScore);
};
