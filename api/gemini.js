// Vercel Serverless Function for Gemini API
// 這是後端程式碼，運行在 Vercel 的伺服器環境中，使用者無法看到此處的 API Key
import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  // CORS 設定，允許您的前端呼叫
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 從後端環境變數讀取 Key (安全！)
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: API Key missing' });
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  const { action, payload } = req.body;

  try {
    // ---------------------------------------------------------
    // 1. 生成文字 (Generate Content)
    // ---------------------------------------------------------
    if (action === 'generateContent') {
      const { model, contents, config } = payload;
      
      // 建構請求
      const response = await ai.models.generateContent({
        model: model,
        contents: contents,
        config: config
      });
      
      return res.status(200).json({ text: response.text });
    }

    // ---------------------------------------------------------
    // 2. 生成圖片 (Generate Images)
    // ---------------------------------------------------------
    else if (action === 'generateImages') {
      const { model, prompt, config } = payload;
      
      // 區分 Imagen (generateImages) 與 Gemini (generateContent for images)
      if (model.includes('imagen')) {
         const response = await ai.models.generateImages({
            model,
            prompt,
            config
         });
         // Imagen 回傳的是 binary data
         const b64 = response.generatedImages?.[0]?.image?.imageBytes;
         return res.status(200).json({ base64: b64 });

      } else {
         // Gemini 繪圖模型是用 generateContent
         const response = await ai.models.generateContent({
             model,
             contents: { parts: [{ text: prompt }] },
             config
         });
         
         // 尋找圖片部分
         let b64 = null;
         for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                b64 = part.inlineData.data;
                break;
            }
         }
         
         if (!b64) throw new Error("No image generated");
         return res.status(200).json({ base64: b64 });
      }
    }

    // ---------------------------------------------------------
    // 3. 生成影片 (Generate Videos - Veo)
    // ---------------------------------------------------------
    else if (action === 'generateVideos') {
       const { model, prompt, config } = payload;
       
       let operation = await ai.models.generateVideos({
           model,
           prompt,
           config
       });

       // 在後端等待影片生成 (避免前端暴露 Key 去輪詢)
       // 注意：Serverless Function 有執行時間限制 (通常 10秒~60秒)
       // Veo 生成可能較久，若超時建議改用非同步架構，但此處為簡化範例採用輪詢
       let attempts = 0;
       while (!operation.done && attempts < 20) { // 最多等約 40-60 秒
           await new Promise(r => setTimeout(r, 3000));
           operation = await ai.operations.getVideosOperation({ operation: operation });
           attempts++;
       }

       if (!operation.done) {
           return res.status(408).json({ error: "Video generation timeout on server" });
       }

       const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
       if (!videoUri) throw new Error("No video URI returned");

       // 關鍵步驟：後端使用 API Key 去下載影片，再傳給前端
       // 這樣前端永遠不需要知道 API Key
       const downloadUrl = `${videoUri}&key=${apiKey}`;
       const videoRes = await fetch(downloadUrl);
       const videoBuffer = await videoRes.arrayBuffer();
       const base64Video = Buffer.from(videoBuffer).toString('base64');

       return res.status(200).json({ 
           videoBase64: base64Video,
           mimeType: 'video/mp4'
       });
    }

    else {
        return res.status(400).json({ error: 'Unknown action' });
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
        error: error.message || 'Internal Server Error',
        details: error.toString() 
    });
  }
}