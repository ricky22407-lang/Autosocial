
import { GoogleGenAI, Type } from "@google/genai";
import { Config } from '../../config/env';
import { AppError } from '../../core/appError';
import { ErrorCode, BrandSettings, CtaItem } from '../../../types';

export class ContentService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: Config.GEMINI.API_KEY });
  }

  async getTrendingTopic(industry: string): Promise<string> {
      const prompt = `找出目前台灣關於「${industry}」的一個熱門社群話題。只回傳話題標題，不要有其他文字。`;
      try {
          const response = await this.ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: { tools: [{ googleSearch: {} }] }
          });
          return response.text?.trim() || `${industry} 趨勢`;
      } catch (e: any) {
          console.warn("Google Search failed, using fallback:", e.message);
          return `${industry} 熱門話題`;
      }
  }

  // Refactored: Now accepts complex parameters for prompt engineering
  async generateDraft(
      topic: string, 
      brand: BrandSettings, 
      options: { length: string, ctaLinks?: string[], tempHashtags?: string }
  ) {
    // 1. Construct Strategy Prompt
    const ctaInstruction = (options.ctaLinks && options.ctaLinks.length > 0)
      ? `包含以下連結的行動呼籲 (CTA)，請撰寫一段吸引人的文字引導點擊：\n${options.ctaLinks.join('\n')}` 
      : '無';

    const allHashtags = `${brand.fixedHashtags || ''} ${options.tempHashtags || ''}`.trim();

    const context = `
      品牌名稱: AutoSocial (or user brand)
      產業類別: ${brand.industry}
      服務項目: ${brand.services}
      產品資訊: ${brand.productInfo}
      品牌語氣: ${brand.brandTone}
      小編人設: ${brand.persona}
      參考資料: ${brand.referenceFiles.map((f: any) => f.content.substring(0, 500)).join('... ')}
    `;

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
    
    // 2. Call AI
    try {
      // Use Pro model for better reasoning
      const response = await this.ai.models.generateContent({
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
      return JSON.parse(response.text || '{}');
    } catch (error: any) {
      console.warn("Gemini 3 Pro failed, falling back to Flash:", error.message);
      // Fallback
      const fallbackResponse = await this.ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: { responseMimeType: "application/json" }
      });
      return JSON.parse(fallbackResponse.text || '{}');
    }
  }

  async generateImage(prompt: string) {
     try {
        const response = await this.ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts: [{ text: prompt }] },
            config: { imageConfig: { aspectRatio: "1:1" } }
        });
        return this.extractImage(response);
     } catch (error: any) {
        console.warn("Image gen fallback to flash...", error.message);
        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: prompt }] },
            config: { imageConfig: { aspectRatio: "1:1" } }
        });
        return this.extractImage(response);
     }
  }

  private extractImage(response: any): string {
    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) throw new Error("No image data returned from AI");
    return `data:image/png;base64,${base64}`;
  }
}
