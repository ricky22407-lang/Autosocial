



module.exports = async function (req, res) {
  // CORS Headers
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

  // Check body existence
  if (!req.body) {
      return res.status(400).json({ error: 'Missing Request Body' });
  }

  // --- Multi-Key Manager & Failover Logic ---
  class KeyManager {
      constructor() {
          // Load Gemini keys from possible env vars
          this.geminiKeys = [
              process.env.API_KEY,
              process.env.API_KEY_2,
              process.env.API_KEY_3,
              process.env.API_KEY_4,
              process.env.API_KEY_5
          ].filter(k => k && k.length > 0 && k !== 'undefined'); 
          
          // Load OpenAI Key for Ultimate Fallback
          this.openAIKey = process.env.OPENAI_API_KEY;

          this.currentIndex = 0;
      }

      getCurrentKey() {
          if (this.geminiKeys.length === 0) return null;
          return this.geminiKeys[this.currentIndex];
      }
      
      getOpenAIKey() {
          return this.openAIKey;
      }

      switchToNextKey() {
          if (this.currentIndex < this.geminiKeys.length - 1) {
              this.currentIndex++;
              console.warn(`[KeyManager] ⚠️ Gemini API Limit Hit. Switching to Backup Key #${this.currentIndex + 1}`);
              return true;
          }
          return false;
      }
  }

  const keyManager = new KeyManager();
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper: OpenAI DALL-E 3 Generation (Fallback)
  async function generateOpenAIImage(prompt) {
      const apiKey = keyManager.getOpenAIKey();
      if (!apiKey) throw new Error("No OpenAI API Key provided for fallback.");

      console.log("[Fallback] Switching to OpenAI DALL-E 3...");
      const response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
              model: "dall-e-3",
              prompt: prompt,
              n: 1,
              size: "1024x1024",
              response_format: "b64_json"
          })
      });

      const data = await response.json();
      if (data.error) throw new Error(`OpenAI Error: ${data.error.message}`);
      return data.data[0].b64_json;
  }

  // Retry Wrapper with Exponential Backoff
  async function executeWithRetry(operation, retryCount = 0) {
      if (!keyManager.getCurrentKey()) {
          throw new Error("Server Configuration Error: API_KEY is missing in environment variables.");
      }

      const maxRetries = 2; // Retries per key

      try {
          const apiKey = keyManager.getCurrentKey();
          
          // Dynamic Import SDK
          let GoogleGenAI;
          try {
              const sdk = await import("@google/genai");
              GoogleGenAI = sdk.GoogleGenAI;
          } catch (e) {
              throw new Error(`Failed to load @google/genai SDK: ${e.message}`);
          }

          const ai = new GoogleGenAI({ apiKey: apiKey });
          return await operation(ai);

      } catch (error) {
          const msg = error.message || '';
          
          // Identify Quota/Overload Errors
          // 429: Too Many Requests, 503: Service Unavailable
          const isQuotaError = msg.includes('429') || msg.includes('Quota') || msg.includes('exhausted') || msg.includes('503');
          
          if (isQuotaError) {
              if (retryCount < maxRetries) {
                  // Exponential Backoff: 1s, 2s
                  const waitTime = Math.pow(2, retryCount) * 1000;
                  console.warn(`[API] Quota Error (Attempt ${retryCount + 1}). Waiting ${waitTime}ms to retry...`);
                  await delay(waitTime);
                  return executeWithRetry(operation, retryCount + 1);
              } else {
                  // If all retries on this key failed, try switching key
                  if (keyManager.switchToNextKey()) {
                      // Reset retries for the new key
                      return executeWithRetry(operation, 0);
                  } else {
                      throw new Error("All Gemini API keys exhausted.");
                  }
              }
          } else {
              throw error;
          }
      }
  }

  try {
    const { action, payload } = req.body;
    
    if (!action) {
        return res.status(400).json({ error: "Missing 'action' in request body" });
    }

    // --- Action: fetchRss ---
    if (action === 'fetchRss') {
        const { url } = payload;
        try {
            const rssRes = await fetch(url);
            const text = await rssRes.text();
            return res.status(200).json({ text });
        } catch (rssError) {
            throw new Error(`Failed to fetch RSS: ${rssError.message}`);
        }
    }

    // --- Action: fetchOgImage ---
    else if (action === 'fetchOgImage') {
        const { url } = payload;
        try {
            const htmlRes = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
            });
            const html = await htmlRes.text();
            const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
            const ogImage = match ? match[1] : null;
            return res.status(200).json({ imageUrl: ogImage });
        } catch (e) {
            console.warn("OG Fetch failed", e);
            return res.status(200).json({ imageUrl: null });
        }
    }

    // --- Action: generateContent ---
    else if (action === 'generateContent') {
      const { model, contents, config } = payload;
      
      const runGeneration = async (currentModel) => {
          return await executeWithRetry(async (ai) => {
              const response = await ai.models.generateContent({ 
                  model: currentModel, 
                  contents, 
                  config 
              });
              return { text: response.text };
          });
      };

      try {
          const result = await runGeneration(model);
          return res.status(200).json(result);
      } catch (e) {
          // Gemini Fallback Logic
          if (model.includes('gemini-3-pro') || model.includes('gemini-1.5-pro')) {
              console.warn(`[API] ${model} failed. Downgrading to gemini-2.5-flash.`);
              try {
                  const fallbackResult = await runGeneration('gemini-2.5-flash');
                  return res.status(200).json(fallbackResult);
              } catch (fallbackError) {
                  throw e;
              }
          }
          throw e;
      }
    }
    
    // --- Action: generateImages ---
    else if (action === 'generateImages') {
      const { prompt, config } = payload;
      // Note: We ignore the 'model' passed from frontend and implement the Waterfall here
      
      // STEP 1: Gemini 3 Pro (Best Quality, High Latency)
      try {
          console.log("[Image Gen] Attempt 1: Gemini 3 Pro (Prioritized)");
          const result = await executeWithRetry(async (ai) => {
             const response = await ai.models.generateImages({
                 model: 'gemini-3-pro-image-preview',
                 prompt: prompt,
                 config: config
             });
             const b64 = response.generatedImages?.[0]?.image?.imageBytes;
             if(!b64) throw new Error("No image bytes returned");
             return { base64: b64 };
          });
          return res.status(200).json(result);
      } catch (errorPro) {
          console.warn(`[Image Gen] Gemini 3 Pro failed (${errorPro.message}). Trying Gemini 2.5 Flash...`);
          
          // STEP 2: Gemini 2.5 Flash (Fastest, Good Quality, Resilient to Timeout)
          try {
             console.log("[Image Gen] Attempt 2: Gemini 2.5 Flash Image");
             const result = await executeWithRetry(async (ai) => {
                 // Note: Flash Image uses generateContent, not generateImages
                 const response = await ai.models.generateContent({
                     model: 'gemini-2.5-flash-image',
                     contents: { parts: [{ text: prompt }] },
                     config: { imageConfig: { aspectRatio: "1:1" } }
                 });
                 let b64 = null;
                 for (const part of response.candidates?.[0]?.content?.parts || []) {
                    if (part.inlineData) {
                        b64 = part.inlineData.data;
                        break;
                    }
                 }
                 if (!b64) throw new Error("No image data in Flash response");
                 return { base64: b64 };
             });
             return res.status(200).json(result);
             
          } catch (errorFlash) {
             console.warn(`[Image Gen] Gemini Flash failed (${errorFlash.message}). Trying DALL-E 3...`);
             
             // STEP 3: OpenAI DALL-E 3 (Expensive but Reliable Fallback)
             try {
                 const openAIBase64 = await generateOpenAIImage(prompt);
                 return res.status(200).json({ base64: openAIBase64 });
             } catch (openAIError) {
                 console.error("[Image Gen] All Backends Failed:", openAIError.message);
                 // Throwing error here will trigger frontend Pollinations fallback
                 throw new Error("Backend Image Generation Failed (Gemini & OpenAI exhausted).");
             }
          }
      }
    }
    
    // --- Action: generateVideos ---
    else if (action === 'generateVideos') {
       const { model, prompt, config } = payload;
       const result = await executeWithRetry(async (ai) => {
           let operation = await ai.models.generateVideos({ model, prompt, config });
           let attempts = 0;
           const maxAttempts = 20;
           while (!operation.done && attempts < maxAttempts) { 
               await delay(3000);
               operation = await ai.operations.getVideosOperation({ operation: operation });
               attempts++;
           }
           if (!operation.done) throw new Error("Video generation timed out.");
           const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
           if (!videoUri) throw new Error("No video URI returned");

           const currentKey = keyManager.getCurrentKey();
           const videoRes = await fetch(`${videoUri}&key=${currentKey}`);
           const arrayBuffer = await videoRes.arrayBuffer();
           const base64Video = Buffer.from(arrayBuffer).toString('base64');
           return { videoBase64: base64Video };
       });
       return res.status(200).json(result);
    }

    else {
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

  } catch (error) {
    console.error('[API Error]:', error);
    return res.status(500).json({ 
        error: error.message || 'Internal Server Error'
    });
  }
};