
import { BrandSettings, CtaItem, TrendingTopic, ViralType, ViralPlatform, TitleScore, ViralPostDraft, ImageIntent, DNALabAnalysis, UserRole, ThreadLead, CompetitorInsight, UserProfile } from "../../types";
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

/**
 * REFINED: Influencer Matcher Service
 * No longer generates fake people. Takes REAL profiles from DB and matches them to query.
 */
export const searchInfluencers = async (query: string, realProfiles: UserProfile[]): Promise<any[]> => {
    if (realProfiles.length === 0) return [];

    // Prepare data for AI to rank
    const talentPool = realProfiles.map(u => ({
        email: u.email,
        categories: u.influencerProfile?.categories || [],
        contentStyles: u.influencerProfile?.contentStyles || [],
        bio: u.influencerProfile?.bio || '',
        minPrice: u.influencerProfile?.minPrice || 0,
        platforms: u.influencerProfile?.platforms || {},
        aiTags: u.influencerProfile?.aiTags || []
    }));

    const prompt = `你是一個專業的人才媒合顧問。
    甲方（品牌方）的需求是：「${query}」。
    
    以下是我們資料庫中的真實人才清單（乙方）：
    ${JSON.stringify(talentPool)}

    任務：
    1. 根據甲方的需求，從清單中挑選出最適合的 5 位人才。
    2. 如果清單中沒有任何人符合，請回傳空陣列 []。
    3. 對每一位被選中的人才，計算一個 0-100 的 matchScore (匹配分數)。
    
    請務必嚴格遵守：
    - **絕對不可以** 自己捏造清單中不存在的人。
    - 只能從我提供的清單中挑選。
    - 回傳 JSON Array 格式，物件結構必須包含匹配分數 matchScore 欄位。`;

    try {
        const response = await callBackend('generateContent', {
            model: "gemini-3-pro-preview",
            contents: prompt,
            config: { 
                responseMimeType: "application/json"
            }
        });

        const rawText = response.text || '[]';
        const aiResults = JSON.parse(cleanJsonText(rawText));
        
        return Array.isArray(aiResults) ? aiResults : [];
    } catch (e) {
        console.error("AI Matcher Error:", e);
        // Fallback: Simple keyword filter if AI fails
        const lowerQuery = query.toLowerCase();
        return talentPool
            .filter(t => t.bio.toLowerCase().includes(lowerQuery) || t.categories.some(c => c.toLowerCase().includes(lowerQuery)))
            .map(t => ({ ...t, matchScore: 70 }))
            .slice(0, 5);
    }
};

// #endregion

// REFINED: Lead Hunter Service - Strictly searching for CUSTOMER INTENT
export const searchThreadsLeads = async (keyword: string): Promise<ThreadLead[]> => {
    // Strategy: Search for questions and pain points, exclude reviews and influencers
    const searchStrategy = `site:threads.net "${keyword}" ("求推薦" OR "有人買過嗎" OR "想買" OR "哪款好" OR "推薦嗎" OR "怎麼選") -開箱 -試吃 -業配 -合作請洽`;
    
    const prompt = `你是一個精準行銷獵人。請透過搜尋 Threads.net 找出台灣過去一週內，對「${keyword}」有真實購買需求或正在尋求建議的 5 則消費者貼文。
    
    [重要規則]
    1. 必須排除：網紅、素人開箱、業配、行銷活動、品牌官方帳號。
    2. 必須鎖定：正在發問、正在猶豫、抱怨現有產品想換新、或求助推薦的真實網友。
    3. 連結檢查：請從搜尋結果中提取真實的 Threads 貼文連結。
    
    請以 JSON Array 格式回傳：
    [{
      "id": "隨機ID",
      "username": "發文者帳號",
      "content": "貼文原始文字內容摘要(展現意圖的部分)",
      "permalink": "Threads 貼文連結 (請確保網址正確)",
      "engagementScore": 0-100,
      "purchaseIntent": "high" | "medium" | "low",
      "reasoning": "為什麼判斷他是潛在客戶(例如：他提到預算或是特定的困擾)"
    }]`;

    try {
        const response = await callBackend('generateContent', {
            model: "gemini-3-pro-preview", 
            contents: `搜尋指令: ${searchStrategy}\n\n任務: ${prompt}`,
            config: { 
                tools: [{ googleSearch: {} }],
                responseMimeType: "application/json"
            }
        });

        const data = JSON.parse(cleanJsonText(response.text || '[]'));
        
        // Basic validation of links - ensure they are threads.net
        return (data as ThreadLead[]).filter(lead => 
            lead.permalink && lead.permalink.includes('threads.net')
        );
    } catch (e) {
        console.error("Lead Hunting Error:", e);
        return [];
    }
};

// #endregion

export const analyzeCompetitors = async (competitorUrls: string[], industry: string): Promise<CompetitorInsight[]> => {
    if (!competitorUrls || competitorUrls.length === 0) return [];
    
    const prompt = `你是一個資深市場情報分析員。請針對以下粉專連結進行掃描與情報分析：
    連結列表：${competitorUrls.join(', ')}
    產業領域：${industry}
    
    請找出他們本週的「發文主軸」、「受歡迎的內容類型」以及「營銷漏洞」。
    請回傳 JSON Array:
    [{
      "name": "粉專名稱",
      "recentActivity": "本週重點活動描述",
      "vibe": "整體語氣風格",
      "strategySuggestion": "給使用者的反擊或差異化策略建議"
    }]`;

    const response = await callBackend('generateContent', {
        model: "gemini-3-pro-preview",
        contents: prompt,
        config: { 
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json"
        }
    });

    try {
        return JSON.parse(cleanJsonText(response.text || '[]'));
    } catch (e) {
        return [];
    }
};

export const generateDNALabAnalysis = async (inputs: string[]): Promise<DNALabAnalysis> => {
    const prompt = Prompts.buildDNALabAnalysisPrompt(inputs.join('\n\n'));
    const response = await callBackend('generateContent', {
        model: "gemini-3-pro-preview",
        contents: prompt,
        config: { 
            responseMimeType: "application/json"
        }
    });
    return JSON.parse(cleanJsonText(response.text || '{}'));
};

export const generatePostDraft = async (topic: string, settings: BrandSettings, options: { length: string, ctaList: CtaItem[], tempHashtags: string, includeEngagement?: boolean, imageText?: string }, topicContext?: TrendingTopic, userRole: string = 'user') => {
  const isHighTier = ['business', 'admin'].includes(userRole);
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
    const prompt = `Role: Click-Through Rate Predictor. Score these titles. Output JSON Array with scores.`;
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
    let data = JSON.parse(cleanJsonText(response.text || '{}'));
    return { versions: [data.caption || '內容生成異常。'], imagePrompt: '' };
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
        contents: `Act as a senior social media analyst. Report in Traditional Chinese.`
    });
    return response.text || "報告生成失敗";
};

export const generateThreadsBatch = async (topic: string, count: number, settings: BrandSettings, personas: string[] = []): Promise<any[]> => {
    let systemInstruction = Prompts.getThreadsSystemInstruction('personal');
    if (personas.length > 0 && personas[0].includes('[MODE:')) {
        systemInstruction = personas[0];
    }
    const prompt = `${systemInstruction}\nTask: Generate ${count} distinct Threads posts about: "${topic}". Output JSON Array.`;
    const response = await callBackend('generateContent', {
        model: "gemini-2.5-flash", 
        contents: prompt,
        config: { 
            responseMimeType: "application/json",
            responseSchema: {
                // Fix: Added 'Type.' prefix to constant names
                type: Type.ARRAY,
                items: { type: Type.OBJECT, properties: { caption: { type: Type.STRING }, imagePrompt: { type: Type.STRING }, imageQuery: { type: Type.STRING } } }
            }
        }
    });
    return JSON.parse(cleanJsonText(response.text || '[]'));
};

export const generateCommentReply = async (commentText: string, personaPrompt: string): Promise<string[]> => {
    const prompt = `${Prompts.SYSTEM_INSTRUCTION_THREADS}\n[Persona]: ${personaPrompt}\nReply to: "${commentText}". Generate 3 options. JSON Array.`;
    const response = await callBackend('generateContent', {
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { 
            responseMimeType: "application/json", 
            // Fix: Added 'Type.' prefix to constant names
            responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } 
        }
    });
    return JSON.parse(cleanJsonText(response.text || '[]'));
};

export const getAiAssistantReply = async (userMessage: string, context: { currentView: string, industry: string }) => {
    const systemPrompt = `你是 "AutoSocial 小幫手"，一位親切的社群顧問。`;
    try {
        const response = await callBackend('generateContent', {
            model: "gemini-3-flash-preview", 
            contents: userMessage,
            config: { systemInstruction: systemPrompt }
        });
        return response.text || "小幫手休息中...";
    } catch (e) {
        return "連線不穩...";
    }
};
