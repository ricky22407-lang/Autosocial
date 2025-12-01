
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { BrandSettings, TrendingTopic, AnalyticsData, CompetitorPost } from "../types";

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
    // Advanced Debugging for Vercel
    console.error("[Gemini Service] API Key Status: MISSING");
    
    // Log available keys to help user debug (only keys, not values)
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
        console.log("ℹ️ Visible Env Vars:", Object.keys((import.meta as any).env));
    }
    
    throw new Error("缺少 API Key (VITE_API_KEY)。請檢查 Vercel 設定並重新部署 (Redeploy)。");
  } else {
    // Security: Only log first 4 chars
    console.log(`[Gemini Service] API Key Status: Present (${key.substring(0, 4)}...)`);
  }
  return new GoogleGenAI({ apiKey: key });
};

export const getTrendingTopics = async (industry: string, seed?: number): Promise<TrendingTopic[]> => {
  try {
    const ai = getAI();
    // Add random seed/context to prompt to force variation
    const variationContext = seed ? `(請提供與上次不同的搜尋結果，RandomSeed: ${seed})` : '';
    
    const prompt = `請搜尋過去7天與「${industry}」產業相關的10個熱門話題或新聞主題。${variationContext}
    格式要求：請回傳一個嚴格合法的 JSON Array，每個物件包含 "title" (標題) 與 "description" (簡短描述) 兩個欄位。
    請用繁體中文回答。不要包含 Markdown 語法或額外文字，只回傳 JSON Array。`;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // Flash is better for simple list generation
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    if (response.text) {
      let cleanText = cleanJsonString(response.text);
      // Extra safety: Extract array part if text contains extra noise
      const match = cleanText.match(/\[[\s\S]*\]/);
      if (match) cleanText = match[0];
      
      try {
        return JSON.parse(cleanText);
      } catch (e) {
        console.error("JSON Parse Error (Trending):", cleanText);
        throw e;
      }
    }
    return [];
  } catch (error) {
    console.error("Error fetching trending topics:", error);
    // Return empty to let UI handle "no data" gracefully
    return [{ title: "範例：夏季促銷活動", description: "無法取得即時趨勢，請檢查 API Key 或稍後再試。" }];
  }
};

export const generatePostDraft = async (
  topic: string,
  brand: BrandSettings,
  options: {
    length: string;
    ctaLinks: string[];
    tempHashtags: string;
  }
): Promise<{ caption: string; ctaText: string; imagePrompt: string; videoPrompt: string }> => {
  const ai = getAI();

  const context = `
    品牌名稱: AutoSocial (User Brand)
    產業類別: ${brand.industry}
    服務項目: ${brand.services}
    產品資訊: ${brand.productInfo}
    品牌語氣: ${brand.brandTone}
    小編人設: ${brand.persona}
    競品參考: ${brand.competitors.join(', ')}
  `;

  const allHashtags = `${brand.fixedHashtags || ''} ${options.tempHashtags || ''}`.trim();
  const ctaInstruction = options.ctaLinks.length > 0 
    ? `包含以下連結的行動呼籲 (CTA)，請撰寫一段吸引人的文字引導點擊：\n${options.ctaLinks.join('\n')}` 
    : '無';

  const prompt = `
    你是一位專精於台灣市場的專業社群媒體經理。
    品牌背景資訊: ${context}
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

  // Fallback Mechanism
  const modelsToTry = ["gemini-3-pro-preview", "gemini-2.5-flash"];
  let lastError;

  for (const model of modelsToTry) {
    try {
      console.log(`[Gemini Service] Trying model: ${model}...`);
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
      // Continue to next model
    }
  }

  throw new Error(`生成失敗 (所有模型皆嘗試失敗): ${lastError}`);
};

export const generateImage = async (prompt: string): Promise<string> => {
  const ai = getAI();
  // Using Flash Image for better speed/cost balance in demo, upgrade to Pro if needed
  const model = 'gemini-2.5-flash-image'; 
  
  // Explicitly ask for English prompt translation internally to avoid blocks
  const safePrompt = `Generate a high quality image based on this description (translate to English first if needed): ${prompt}`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: safePrompt }] },
      config: { 
          imageConfig: { aspectRatio: "1:1" },
          // Force lowest safety block threshold to prevent "No image data" on benign prompts
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
    
    // Log details for debugging
    console.warn("Image Gen: No inlineData found.", JSON.stringify(response));
    throw new Error("No image data returned (Possible Safety Block or Model Error)");

  } catch (e: any) {
    console.error("Image Gen Error:", e);
    // Re-throw the error so UI can show the real issue (429, Safety, etc)
    throw e;
  }
};

export const generateVideo = async (prompt: string): Promise<string> => {
  const ai = getAI();
  // Explicitly ask for English prompt translation internally
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
        // If 404 (Model not found/access denied), try standard model
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

export const generateWeeklyReport = async (data: AnalyticsData, brand: BrandSettings): Promise<string> => {
  const ai = getAI();
  const prompt = `
    你是一位資深的社群數據分析師。請根據以下 Facebook 粉專數據，為品牌 (${brand.industry}) 撰寫一份簡短的週報分析 (繁體中文)。
    數據：
    - 追蹤數: ${data.followers}
    - 觸及人數: ${data.reach}
    - 互動率: ${data.engagementRate}%
    請包含：整體表現評估、洞察、下週營運建議。
  `;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt
  });
  return response.text || "無法產生報告";
};

export const analyzeCompetitorStrategy = async (posts: CompetitorPost[]): Promise<string> => {
  const ai = getAI();
  const postsText = posts.map(p => `品牌:${p.brandName}, 內文:${p.content}`).join('\n');
  const prompt = `請分析以下競品貼文，找出成功模式：\n${postsText}\n(繁體中文)`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt
  });
  return response.text || "無法分析";
};
