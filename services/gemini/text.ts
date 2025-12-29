
import { BrandSettings, CtaItem, TrendingTopic, ViralType, ViralPlatform, TitleScore, ViralPostDraft, ImageIntent } from "../../types";
import { callBackend, cleanJsonText, Type } from './core';
import * as Prompts from "../promptTemplates";

// #region Analysis Tools

export const analyzeBrandTone = async (posts: string[]): Promise<string> => {
    if (!posts || posts.length === 0) throw new Error("無貼文可分析");
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: Prompts.buildAnalysisPrompt(posts.join('\n\n---\n\n')),
    });
    return response.text || "Style analysis failed.";
};

export const analyzeThreadsStyle = async (posts: string[]): Promise<string> => {
    if (!posts || posts.length === 0) throw new Error("無貼文可分析");
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: Prompts.buildThreadsAnalysisPrompt(posts.join('\n\n---\n\n'))
    });
    return response.text || "Threads style analysis failed.";
};

export const analyzeProductFile = async (text: string): Promise<string> => {
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: `Task: Analyze product file and extract marketing USP, pain points, specs, and audience. Content: ${text.substring(0, 15000)}`
    });
    return response.text || "";
};

// #endregion

// #region Generators

export const generatePostDraft = async (topic: string, settings: BrandSettings, options: { length: string, ctaList: CtaItem[], tempHashtags: string, includeEngagement?: boolean, imageText?: string }, topicContext?: TrendingTopic, userRole: string = 'user') => {
  const isHighTier = ['business', 'admin'].includes(userRole);
  // Removed imagePrompt/videoPrompt from schema to save token/latency and separate concerns
  const response = await callBackend('generateContent', {
    model: isHighTier ? "gemini-3-pro-preview" : "gemini-2.5-flash",
    contents: Prompts.buildDraftPrompt(topic, settings, options, topicContext),
    config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { caption: { type: Type.STRING }, ctaText: { type: Type.STRING } }
        }
    }
  });
  return JSON.parse(cleanJsonText(response.text || '{}'));
};

// NEW: Dedicated Image Prompt Generator
export const generateImagePromptString = async (caption: string, intent: ImageIntent, settings: BrandSettings): Promise<string> => {
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: Prompts.buildImagePromptGenerationPrompt(caption, intent, settings.visualStyle),
    });
    return response.text?.trim() || "";
};

export const generateViralTitles = async (topic: string, options: { audience: string; viralType: ViralType; }): Promise<string[]> => {
    const prompt = `Role: Viral Title Expert. Topic: ${topic}. Audience: ${options.audience}. Type: ${options.viralType}. Generate 5 clickbait titles. Output JSON Array.`;
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash", 
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } }
    });
    try { return JSON.parse(cleanJsonText(response.text || '[]')); } catch (e) { return [topic]; }
};

export const scoreViralTitles = async (titles: string[]): Promise<TitleScore[]> => {
    const prompt = `Role: Click-Through Rate Predictor. Score these titles (0-10 on Emotion, Curiosity, Identity, Specific, Authenticity). Total max 50. Input: ${JSON.stringify(titles)}. Output JSON Array with scores.`;
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        score: { type: Type.NUMBER },
                        breakdown: { type: Type.OBJECT, properties: { emotion: { type: Type.NUMBER }, curiosity: { type: Type.NUMBER }, identity: { type: Type.NUMBER }, specific: { type: Type.NUMBER }, authenticity: { type: Type.NUMBER } } },
                        comment: { type: Type.STRING }
                    }
                }
            }
        }
    });
    return JSON.parse(cleanJsonText(response.text || '[]'));
};

export const generateViralContent = async (topic: string, options: { audience: string; viralType: string | 'auto'; platform: ViralPlatform; versionCount: number; }, settings: BrandSettings): Promise<ViralPostDraft> => {
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash", 
        contents: Prompts.buildViralPrompt(topic, options, settings),
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: { 
                    caption: { type: Type.STRING }
                }
            }
        }
    });
    
    let data;
    try {
        data = JSON.parse(cleanJsonText(response.text || '{}'));
    } catch (e) {
        console.error("JSON Parse Error in Viral Content", e);
        return { versions: ["生成失敗，請重試。"], imagePrompt: "" };
    }

    return {
        versions: [data.caption || '內容生成異常。'],
        imagePrompt: '' // Viral mode now also defers image gen
    };
};

export const generateSeoArticle = async (topic: string, length: string, keywords: string, options: { agenda: boolean, meta: boolean, faq: boolean, refLinks: boolean }) => {
    let searchContext = "";
    try {
         const searchResp = await callBackend('generateContent', {
            model: "gemini-2.5-flash",
            contents: `Research SEO content for topic: ${topic}. Keywords: ${keywords}`,
            config: { tools: [{ googleSearch: {} }] } 
        });
        searchContext = searchResp.text || "";
    } catch (e) { }

    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: `Context: ${searchContext}\n\n${Prompts.buildSeoArticlePrompt(topic, length, keywords, options)}`,
        config: { 
            responseMimeType: "application/json",
            responseSchema: { type: Type.OBJECT, properties: { fullText: { type: Type.STRING }, imageKeyword: { type: Type.STRING } } }
        }
    });
    try { return JSON.parse(cleanJsonText(response.text || '{}')); } catch (e) { throw new Error("Failed to parse SEO article JSON"); }
};

export const generateWeeklyReport = async (analytics: any, settings: BrandSettings, topPosts?: any) => {
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: `Act as a senior social media analyst. Brand: ${settings.industry}. Metrics: Followers ${analytics.followers}, Reach ${analytics.reach}, Engagement ${analytics.engagementRate}%. Write a weekly performance report in Traditional Chinese.`
    });
    return response.text || "報告生成失敗";
};

export const generateThreadsBatch = async (topic: string, count: number, settings: BrandSettings, personas: string[] = []): Promise<any[]> => {
    
    let systemInstruction = Prompts.getThreadsSystemInstruction('personal');
    
    if (personas.length > 0 && personas[0].includes('[MODE:')) {
        systemInstruction = personas[0];
    } else {
        systemInstruction = Prompts.getThreadsSystemInstruction('personal');
    }

    const prompt = `${systemInstruction}\nTask: Generate ${count} distinct Threads posts about: "${topic}". For imagePrompt use DETAILED ENGLISH suitable for Midjourney. Output JSON Array: [{ "caption": "...", "imagePrompt": "...", "imageQuery": "..." }]`;

    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash", 
        contents: prompt,
        config: { 
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.OBJECT, properties: { caption: { type: Type.STRING }, imagePrompt: { type: Type.STRING }, imageQuery: { type: Type.STRING } } }
            }
        }
    });
    return JSON.parse(cleanJsonText(response.text || '[]'));
};

export const generateCommentReply = async (commentText: string, personaPrompt: string): Promise<string[]> => {
    const prompt = `${Prompts.SYSTEM_INSTRUCTION_THREADS}\n[Persona]: ${personaPrompt}\nTask: Reply to comment: "${commentText}". Generate 3 options. Output JSON Array string.`;
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } }
    });
    return JSON.parse(cleanJsonText(response.text || '[]'));
};

export const getAiAssistantReply = async (userMessage: string, context: { currentView: string, industry: string }) => {
    const systemPrompt = `
    [角色設定]
    你是 "AutoSocial 小幫手"，一位專門服務長輩與新手的應用程式客服。
    你的語氣要非常親切、有耐心，使用簡單易懂的繁體中文 (台灣用語)。
    多使用表情符號 😊👍✨ 來增加親和力。

    [任務範圍]
    1. 你只能回答關於本應用程式 (AutoSocial AI) 的操作問題、功能介紹、以及品牌設定建議。
    2. 使用者目前的狀態：
       - 所在頁面：${context.currentView}
       - 產業類別：${context.industry} (若問題與設定相關，請參考此產業給建議)

    [⚠️ 最高指導原則 - 嚴格遵守]
    1. **禁止回答無關問題**：如果使用者問天氣、股票、政治或數學題，請禮貌拒絕：「不好意思，我只懂 AutoSocial 的操作，這題可能要問問 Google 喔！😊」
    2. **禁止洩露後台資訊**：絕不可透漏資料庫結構、API Key、運算成本、或程式碼細節。若被問到，請說：「這是商業機密，我也不知道捏 🤫」。
    3. **遇到無法解決的問題**：如果你不確定答案，或使用者顯得不耐煩，**必須** 引導他們聯繫真人客服。
       請回覆：「這題比較專業，建議您直接聯絡我們的真人客服專員，他會幫您處理喔！」並附上：「請點擊左側選單的『聯繫客服』按鈕」。

    [常用功能知識庫]
    - 點數：1點=1元。生成FB文案扣10點，圖片扣5點，Threads文案扣2點。
    - 品牌設定：在左側「品牌設定」填寫，AI 會依照這裡的資料模仿語氣。
    - 排程：發文後可以在「排程與歷史」查看或修改。
    `;

    try {
        const response = await callBackend('generateContent', {
            model: "gemini-2.5-flash", 
            contents: userMessage,
            config: { 
                systemInstruction: systemPrompt,
                thinkingConfig: { thinkingBudget: 1024 }
            }
        });
        return response.text || "小幫手目前在休息中，請稍後再試 😊";
    } catch (e) {
        return "連線稍微有點不穩定，請您檢查網路或稍後再試喔！🙏";
    }
};

// #endregion
