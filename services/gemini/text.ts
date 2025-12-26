
import { BrandSettings, CtaItem, TrendingTopic, ViralType, ViralPlatform, TitleScore, ViralPostDraft } from "../../types";
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
  const response = await callBackend('generateContent', {
    model: isHighTier ? "gemini-3-pro-preview" : "gemini-2.5-flash",
    contents: Prompts.buildDraftPrompt(topic, settings, options, topicContext),
    config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { caption: { type: Type.STRING }, ctaText: { type: Type.STRING }, imagePrompt: { type: Type.STRING }, videoPrompt: { type: Type.STRING } }
        }
    }
  });
  return JSON.parse(cleanJsonText(response.text || '{}'));
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
                    caption: { type: Type.STRING }, 
                    imagePrompt: { type: Type.STRING } 
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
        imagePrompt: data.imagePrompt || ''
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

// #endregion
