
import { GoogleGenAI, Type } from "@google/genai";
import { BrandSettings, TrendingTopic, AnalyticsData, CompetitorPost } from "../types";

// Helper to get Env safely
const getEnv = (key: string) => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    return (import.meta as any).env[key] || (import.meta as any).env[`VITE_${key}`];
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return '';
};

// Helper to get AI instance dynamically
const getAI = () => {
  const key = getEnv('API_KEY');
  if (!key) throw new Error("缺少 API Key");
  return new GoogleGenAI({ apiKey: key });
};

export const getTrendingTopics = async (industry: string): Promise<TrendingTopic[]> => {
  try {
    const ai = getAI();
    const prompt = `請搜尋過去7天與「${industry}」產業相關的10個熱門話題或新聞主題。
    格式要求：請回傳一個嚴格合法的 JSON Array，每個物件包含 "title" (標題) 與 "description" (簡短描述) 兩個欄位。
    請用繁體中文回答。不要包含 Markdown 語法或額外文字，只回傳 JSON Array。`;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    if (response.text) {
      let cleanText = response.text.trim();
      const match = cleanText.match(/\[[\s\S]*\]/);
      if (match) cleanText = match[0];
      return JSON.parse(cleanText);
    }
    return [];
  } catch (error) {
    console.error("Error fetching trending topics:", error);
    return [{ title: "手動輸入主題", description: "無法取得趨勢 (請確認後端配置)" }];
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
    參考資料內容: ${brand.referenceFiles.map(f => f.content.substring(0, 500)).join('... ')}
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
    
    請依照以下步驟輸出 JSON 格式：
    1. caption: 貼文文案 (繁體中文，台灣用語，包含Emoji)。結尾請加上 Hashtags。
    2. ctaText: CTA 文字段落 (包含連結)，若無連結則留空。
    3. imagePrompt: AI 圖片生成提示詞 (繁體中文)。
    4. videoPrompt: AI 影片生成 (Veo) 提示詞 (繁體中文)。
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
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
  throw new Error("Failed to generate draft");
};

export const generateImage = async (prompt: string): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts: [{ text: prompt }] },
    config: { imageConfig: { aspectRatio: "1:1" } }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image data returned");
};

export const generateVideo = async (prompt: string): Promise<string> => {
  const ai = getAI();
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-generate-preview',
    prompt: prompt,
    config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Video generation failed");
  const key = getEnv('API_KEY');
  return `${videoUri}&key=${key}`; 
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
