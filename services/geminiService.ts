

import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { BrandSettings, TrendingTopic, AnalyticsData, TopPostData } from "../types";

// Helper to get Env safely with multiple fallbacks
const getEnv = (key: string): string => {
  let value: string | undefined = '';
  
  // 1. Try Vite import.meta.env
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const env = (import.meta as any).env;
    value = env[key] || env[`VITE_${key}`] || env[`REACT_APP_${key}`] || env[`NEXT_PUBLIC_${key}`];
  }
  
  // 2. Try Node process.env (Fallback)
  if (!value && typeof process !== 'undefined' && process.env) {
    value = process.env[key] || process.env[`VITE_${key}`] || process.env[`REACT_APP_${key}`] || process.env[`NEXT_PUBLIC_${key}`];
  }

  return value ? String(value).trim() : '';
};

// Helper to sanitize JSON string (remove markdown code blocks)
const cleanJsonString = (text: string) => {
  if (!text) return text;
  let clean = text.trim();
  // Remove markdown JSON fences if present
  if (clean.startsWith('```')) {
    const match = clean.match(/```(?:json)?([\s\S]*?)```/);
    if (match) {
      clean = match[1].trim();
    }
  }
  return clean;
};

// Helper to get AI instance dynamically
const getAI = () => {
  const key = getEnv('API_KEY');
  
  if (!key) {
    console.error("[Gemini Service] API Key Status: MISSING");
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
        console.log("ℹ️ Visible Env Vars:", Object.keys((import.meta as any).env));
    }
    throw new Error("缺少 API Key (VITE_API_KEY)。請檢查 Vercel 設定並重新部署 (Redeploy)。");
  } else {
    // console.log(`[Gemini Service] API Key Status: Present (${key.substring(0, 4)}...)`);
  }
  return new GoogleGenAI({ apiKey: key });
};

// --- NEW: Helper to fetch RSS via CORS Proxy ---
// This acts as a reliable middle-layer between Google Search Tool and Internal Knowledge
const fetchRealtimeRss = async (keyword: string): Promise<string> => {
    try {
        // Use Google News RSS Search Query
        // q={keyword}+when:7d (last 7 days)
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}+when:7d&hl=zh-TW&gl=TW&ceid=TW:zh-TW`;
        
        // Use a public CORS proxy to fetch XML from client-side
        // 'api.allorigins.win' is a reliable free proxy for text content
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`RSS Fetch failed: ${res.status}`);
        
        const xmlText = await res.text();
        
        // Robust regex to extract Title, Link, Description
        const items = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];
        
        const parsedItems = items.slice(0, 10).map(item => {
            const titleMatch = item.match(/<title>(.*?)<\/title>/);
            const linkMatch = item.match(/<link>(.*?)<\/link>/);
            const descMatch = item.match(/<description>(.*?)<\/description>/); // Often HTML

            const title = titleMatch ? titleMatch[1].replace('<![CDATA[', '').replace(']]>', '') : '';
            const link = linkMatch ? linkMatch[1] : '';
            // Strip HTML from description if possible
            let desc = descMatch ? descMatch[1].replace('<![CDATA[', '').replace(']]>', '') : '';
            desc = desc.replace(/<[^>]*>/g, '').substring(0, 150); // Simple strip tags

            return { title, link, desc };
        }).filter(t => t.title && !t.title.includes('Google 新聞'));

        if (parsedItems.length === 0) throw new Error("No RSS items found");
        
        // Return structured text for AI
        return parsedItems.map(i => `Title: ${i.title}\nLink: ${i.link}\nSummary: ${i.desc}`).join('\n\n');
    } catch (e) {
        console.warn("RSS Fetch Error:", e);
        return "";
    }
};

export const getTrendingTopics = async (industry: string, seed?: number): Promise<TrendingTopic[]> => {
  const ai = getAI();
  const searchTopic = industry.trim() || "台灣熱門時事"; // Default fallback
  const variationContext = seed ? `(Seed: ${seed})` : '';
  
  const baseInstruction = `
  Format Requirement: 
  - Strictly return a JSON Array of objects.
  - Each object must have keys: "title" (String), "description" (String), and optionally "url" (String, if available).
  - Language: Traditional Chinese (Taiwan).
  - Do NOT wrap in markdown code blocks. Just return the JSON array.`;

  // --- LAYER 1: Google Search Tool (Best Quality) ---
  try {
    const prompt = `List 10 trending news or topics related to "${searchTopic}" in Taiwan within the last 7 days. 
    Include the source URL if possible in the 'url' field.
    ${variationContext} ${baseInstruction}`;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    if (response.text) {
        const parsed = parseTrendingResponse(response.text);
        if (parsed.length > 0) return parsed;
    }
    // If text is empty or parse failed, throw to trigger fallback
    throw new Error("Empty or invalid search response");
  } catch (error) {
    console.warn("Layer 1 (Google Search) failed, trying Layer 2 (RSS)...", error);
    
    // --- LAYER 2: Realtime RSS Feed (Backup Live Data) ---
    try {
        const rssData = await fetchRealtimeRss(searchTopic);
        
        if (rssData) {
            // Feed the RSS titles to Gemini to summarize/format
            const rssPrompt = `
            Here is a list of recent news headlines regarding "${searchTopic}":
            ---
            ${rssData}
            ---
            Based on these headlines, select and summarize 10 distinct trending topics.
            Include the original link in the 'url' field.
            ${baseInstruction}
            `;

            const rssResponse = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: rssPrompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING },
                                description: { type: Type.STRING },
                                url: { type: Type.STRING }
                            }
                        }
                    }
                }
            });
            
            if (rssResponse.text) return JSON.parse(rssResponse.text);
        }
        throw new Error("RSS data empty or processing failed");

    } catch (rssError) {
        console.warn("Layer 2 (RSS) failed, falling back to Layer 3 (Internal Knowledge)...", rssError);

        // --- LAYER 3: Internal Knowledge (Last Resort) ---
        try {
            const fallbackResponse = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: `Generate 10 trending topics for "${searchTopic}" (Taiwan). ${variationContext}`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING },
                                description: { type: Type.STRING }
                            }
                        }
                    }
                }
            });
            if (fallbackResponse.text) return JSON.parse(fallbackResponse.text);
        } catch (fallbackError) {
            console.error("All layers failed:", fallbackError);
            throw fallbackError;
        }
    }
  }
  return [{ title: "系統訊息", description: "目前無法取得熱門話題，請檢查網路連線或稍後再試。" }];
};

// Helper for parsing trending topics with robust regex
const parseTrendingResponse = (text: string): TrendingTopic[] => {
    try {
        // 1. Try direct parse
        return JSON.parse(text);
    } catch {
        // 2. Try cleanJsonString helper
        const cleaned = cleanJsonString(text);
        try { return JSON.parse(cleaned); } catch(e) {}

        // 3. Brute force regex extraction
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
            try { return JSON.parse(match[0]); } catch (e) {
                 console.error("JSON Parse Error (Trending):", text);
            }
        }
    }
    return [];
};

export const generatePostDraft = async (
  topic: string,
  brand: BrandSettings,
  options: {
    length: string;
    ctaLinks: string[];
    tempHashtags: string;
  },
  topicContext?: TrendingTopic // Extra data from trending card
): Promise<{ caption: string; ctaText: string; imagePrompt: string; videoPrompt: string }> => {
  const ai = getAI();

  let contextDataString = '';
  if (topicContext) {
      contextDataString = `
      [Selected Topic Details]
      Title: ${topicContext.title}
      Description/Summary: ${topicContext.description}
      Source URL: ${topicContext.url || 'N/A'}
      
      Instruction: Please utilize the detailed information from the Description and Source URL above to make the post content richer and more specific to the actual news/event.
      `;
  }

  const context = `
    品牌名稱: AutoSocial (User Brand)
    產業類別: ${brand.industry}
    服務項目: ${brand.services}
    產品資訊: ${brand.productInfo}
    品牌語氣: ${brand.brandTone}
    小編人設: ${brand.persona}
  `;

  const allHashtags = `${brand.fixedHashtags || ''} ${options.tempHashtags || ''}`.trim();
  const ctaInstruction = options.ctaLinks.length > 0 
    ? `包含以下連結的行動呼籲 (CTA)，請撰寫一段吸引人的文字引導點擊：\n${options.ctaLinks.join('\n')}` 
    : '無';

  const prompt = `
    你是一位專精於台灣市場的專業社群媒體經理。
    品牌背景資訊: ${context}
    
    ${contextDataString}

    任務: 請針對主題「${topic}」創作一篇 Facebook 貼文。
    貼文要求：
    1. 字數範圍: ${options.length} (請嚴格遵守)。
    2. 行動呼籲 (CTA): ${ctaInstruction}。 (請將 CTA 文字單獨生成，不要直接合併在 caption 中)。
    3. 必備標籤 (Hashtags): ${allHashtags} (請列於文末)。
    
    請依照以下步驟輸出 JSON 格式 (不要使用 Markdown):
    1. caption: 貼文文案 (繁體中文，台灣用語，包含Emoji)。結尾請加上 Hashtags。
    2. ctaText: CTA 文字段落 (包含連結)，若無連結則留空。
    3. imagePrompt: AI 圖片生成提示詞 (請輸出英文 English，針對 Gemini 繪圖優化)。
    4. videoPrompt: AI 影片生成 (Veo) 提示詞 (請輸出英文 English，針對 Veo 優化)。
  `;

  const modelsToTry = ["gemini-3-pro-preview", "gemini-2.5-flash"];
  let lastError;

  for (const model of modelsToTry) {
    try {
      // console.log(`[Gemini Service] Trying model: ${model}...`);
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              caption: { type: Type.STRING },
              ctaText: { type: Type.STRING },
              imagePrompt: { type: Type.STRING },
              videoPrompt: { type: Type.STRING }
            }
          }
        }
      });

      if (response.text) {
        return JSON.parse(response.text);
      }
    } catch (e) {
      console.warn(`[Gemini Service] Model ${model} failed:`, e);
      lastError = e;
    }
  }

  throw new Error(`生成失敗 (所有模型皆嘗試失敗): ${lastError}`);
};

export const generateImage = async (prompt: string): Promise<string> => {
  const ai = getAI();
  const model = 'gemini-2.5-flash-image'; 
  const safePrompt = `Generate a high quality image based on this description (translate to English first if needed): ${prompt}`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: safePrompt }] },
      config: { 
          imageConfig: { aspectRatio: "1:1" },
          safetySettings: [
              { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ]
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    
    throw new Error("No image data returned (Possible Safety Block or Model Error)");

  } catch (e: any) {
    console.error("Image Gen Error:", e);
    throw e;
  }
};

export const generateVideo = async (prompt: string): Promise<string> => {
  const ai = getAI();
  const safePrompt = `Create a video: ${prompt} (translate prompt to English automatically)`;

  const tryModel = async (modelName: string) => {
    let operation = await ai.models.generateVideos({
      model: modelName,
      prompt: safePrompt,
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }
    return operation.response?.generatedVideos?.[0]?.video?.uri;
  };

  try {
    try {
        console.log("Trying Veo Fast model...");
        const videoUri = await tryModel('veo-3.1-fast-generate-preview');
        if (!videoUri) throw new Error("No URI from Fast model");
        return `${videoUri}&key=${getEnv('API_KEY')}`;
    } catch (fastError: any) {
        if (fastError.message?.includes('404') || fastError.status === 404) {
            console.warn("Veo Fast 404, falling back to Standard Veo...");
            const videoUri = await tryModel('veo-3.1-generate-preview');
            if (!videoUri) throw new Error("No URI from Standard model");
            return `${videoUri}&key=${getEnv('API_KEY')}`;
        }
        throw fastError;
    }
  } catch (e: any) {
    console.error("Video Gen Error:", e);
    throw e;
  }
};

export const generateWeeklyReport = async (
    data: AnalyticsData, 
    brand: BrandSettings,
    topPosts?: { topReach?: TopPostData, topEngagement?: TopPostData }
): Promise<string> => {
  const ai = getAI();
  
  let topPostContext = "本週無特別突出的熱門貼文資料。";
  if (topPosts) {
      if (topPosts.topReach) {
          topPostContext += `\n- 最高觸及貼文 (Reach: ${topPosts.topReach.reach}): "${topPosts.topReach.message}"`;
      }
      if (topPosts.topEngagement) {
          topPostContext += `\n- 最高互動貼文 (Engaged: ${topPosts.topEngagement.engagedUsers}): "${topPosts.topEngagement.message}"`;
      }
  }

  const prompt = `
    你是一位資深的社群數據分析師。請根據以下 Facebook 粉專數據，為品牌 (${brand.industry}) 撰寫一份簡短的週報分析 (繁體中文)。
    
    【整體數據】
    - 追蹤數: ${data.followers}
    - 觸及人數 (28天): ${data.reach}
    - 互動率: ${data.engagementRate}%

    【本週表現最佳貼文 (MVP)】
    ${topPostContext}

    請撰寫分析報告，包含：
    1. 整體表現評估：數據是否健康？互動率如何？
    2. 最佳貼文分析：為什麼這兩篇貼文會成功？(針對文案主題、數據表現給予洞察)。
    3. 下週營運建議：根據分析結果，建議下週可以多嘗試什麼類型的內容。
  `;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt
  });
  return response.text || "無法產生報告";
};

/**
 * 產生長篇 SEO 部落格文章 (通用領域)
 */
export const generateSeoArticle = async (
    topic: string, 
    length: string, 
    keywords: string,
    options: { agenda: boolean, meta: boolean, faq: boolean, refLinks: boolean }
): Promise<{ fullText: string, imageKeyword: string }> => {
    const ai = getAI();

    let seoInstructions = "";
    if (options.agenda) seoInstructions += "- **文章開頭必須包含文章目錄 (Table of Contents)**，放在前言之後。標題請用「【本文目錄】」。\n";
    if (options.meta) seoInstructions += "- **必須在文章最開頭提供 Meta Description** (摘要)，約 120 字，包含核心關鍵字。內容請直接吸引讀者點擊，說明文章將解決什麼問題。**請勿**在摘要中出現「本文提供詳盡E-E-A-T指南」或類似的自我指涉語句。標題請用「摘要：」。\n";
    if (options.faq) seoInstructions += "- **文章末尾必須包含 FAQ 區塊**，標題請用「常見問題：」。\n";
    
    // Explicitly ask for visible URLs, prohibiting markdown hidden links
    if (options.refLinks) seoInstructions += "- **權威參考連結 (E-E-A-T)**：文末請列出 3-5 個與內容相關的權威網站參考資料。格式請務必使用「網站名稱: 完整網址(URL)」，**嚴禁**使用 Markdown 連結隱藏網址。例如：\n  - 交通部觀光局: https://www.taiwan.net.tw\n  - 維基百科: https://zh.wikipedia.org\n";

    const systemPrompt = `
        你是一位資深的 SEO 內容行銷專家與【${topic}】領域的專業主編。
        你的目標是撰寫一篇能**在 Google 搜尋結果排名第一**的高品質文章。
        
        **核心規則 (Strict Rules):**
        1.  **純文字輸出：** **嚴禁**使用 Markdown 符號（如 #, ##, ***, **）。標題請直接換行並使用文字標示（如「【標題】」、「一、」）。重點請用自然語氣強調，不要用符號包裹。
        2.  **E-E-A-T 原則：** 內容必須詳實、有深度，展現專家權威與可信度。
        3.  **通用性：** 請根據使用者提供的主題（可能是單一主題如「科技」或混合主題如「美食+旅遊」）調整內容架構與語氣。
        
        **結構化要求:**
        ${seoInstructions}
        
        **內容規範:**
        1.  **標題:** 必須包含核心關鍵字「${topic}」，並具備高點擊率誘因。
        2.  **段落:** 分段清晰，段落之間請空一行。多使用列點 (1. 2. 3. 或 •) 提升可讀性。
        3.  **語氣:** 專業但親切的專家口吻，使用主動語態，避免空泛形容詞。
        4.  **行動呼籲:** 結尾引導讀者留言或分享。
        5.  **避免自我揭露:** 文章中**絕對不要**出現「遵循 E-E-A-T 原則」或「提供權威指南」等關於寫作規範的描述，請直接撰寫專業內容。

        **圖片提示生成:**
        在文章的**絕對最後面**，生成一個**英文的圖片搜尋關鍵字** (例如：Bangkok night market food)，格式如下：
        ---IMAGE_KEYWORD_START---
        (你的英文關鍵字)
        ---IMAGE_KEYWORD_END---
    `;

    const userQuery = `核心關鍵字：${topic}\n預計長度：${length}\nLSI 關鍵字 (請自然融入)：${keywords}`;

    let fullText = "無法生成內容";

    // Try with Google Search first
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: userQuery,
            config: {
                systemInstruction: systemPrompt,
                tools: [{ googleSearch: {} }]
            }
        });
        fullText = response.text || fullText;
    } catch (e: any) {
        console.warn("Google Search failed for SEO Article, retrying without tools...", e);
        // Fallback without tools
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: userQuery,
            config: {
                systemInstruction: systemPrompt
            }
        });
        fullText = response.text || fullText;
    }

    let imageKeyword = topic;

    // 提取圖片 Prompt
    const promptRegex = /---IMAGE_KEYWORD_START---([\s\S]*?)---IMAGE_KEYWORD_END---/;
    const match = fullText.match(promptRegex);
    
    if (match && match[1]) {
        imageKeyword = match[1].trim();
        fullText = fullText.replace(promptRegex, '').trim();
    }

    // 移除殘留的 Markdown
    fullText = fullText.replace(/\*\*/g, '').replace(/##/g, '').replace(/^# /gm, '').trim();

    return { fullText, imageKeyword };
};