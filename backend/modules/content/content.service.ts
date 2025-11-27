
import { GoogleGenAI, Type } from "@google/genai";
import { Config } from '../../config/env';
import { AppError } from '../../core/appError';
import { ErrorCode, BrandSettings } from '../../../types';

export class ContentService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: Config.GEMINI.API_KEY });
  }

  async getTrendingTopic(industry: string): Promise<string> {
      const prompt = `找出目前台灣關於「${industry}」的一個熱門社群話題。只回傳話題標題，不要有其他文字。`;
      
      try {
          // Attempt 1: Use Google Search Grounding
          const response = await this.ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: { tools: [{ googleSearch: {} }] }
          });
          return response.text?.trim() || `${industry} 趨勢`;
      } catch (e: any) {
          console.warn("Google Search failed (likely 403), falling back to internal knowledge:", e.message);
          // Attempt 2: Fallback to internal knowledge without tools
          try {
              const response = await this.ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: prompt
              });
              return response.text?.trim() || `${industry} 熱門話題`;
          } catch (e2) {
              return `${industry} 相關話題`;
          }
      }
  }

  async generateDraft(topic: string, brand: BrandSettings, length: string) {
    const context = `Role: Social Media Manager. Topic: ${topic}. Brand: ${brand.industry}. 
                    Tone: ${brand.brandTone}. Length: ${length}.
                    Output JSON: { caption, ctaText, imagePrompt, videoPrompt }`;
    
    // Attempt 1: Gemini 3 Pro
    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: context,
        config: { responseMimeType: "application/json" }
      });
      return JSON.parse(response.text || '{}');
    } catch (error: any) {
      console.warn("Gemini 3 Pro failed, falling back to Flash:", error.message);
      
      // Attempt 2: Gemini 2.5 Flash (Fallback)
      try {
        const response = await this.ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: context,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(response.text || '{}');
      } catch (fallbackError: any) {
        throw new AppError(`AI Generation Failed: ${fallbackError.message}`, 500, ErrorCode.AI_API_ERROR);
      }
    }
  }

  async generateImage(prompt: string) {
     // Attempt 1: Gemini 3 Pro Image
     try {
        const response = await this.ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts: [{ text: prompt }] },
            config: { imageConfig: { aspectRatio: "1:1" } }
        });
        return this.extractImage(response);
     } catch (error: any) {
        console.warn("Gemini 3 Pro Image failed, falling back to Flash Image:", error.message);
        
        // Attempt 2: Gemini 2.5 Flash Image (Fallback)
        try {
            const response = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [{ text: prompt }] },
                config: { imageConfig: { aspectRatio: "1:1" } }
            });
            return this.extractImage(response);
        } catch (fallbackError: any) {
             throw new AppError(fallbackError.message, 500, ErrorCode.AI_API_ERROR);
        }
     }
  }

  private extractImage(response: any): string {
    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) throw new Error("No image data returned from AI");
    return `data:image/png;base64,${base64}`;
  }
}
