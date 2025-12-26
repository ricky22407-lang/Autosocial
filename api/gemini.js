
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

  // --- Multi-Key Manager & Load Balancing Logic ---
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

          // RANDOM START INDEX (Load Balancing)
          // Instead of starting at 0, we start at a random index. 
          // This ensures that concurrent users hit different keys, preventing a bottleneck on Key #1.
          this.currentIndex = this.geminiKeys.length > 0 
              ? Math.floor(Math.random() * this.geminiKeys.length) 
              : 0;
      }

      getCurrentKey() {
          if (this.geminiKeys.length === 0) return null;
          return this.geminiKeys[this.currentIndex];
      }
      
      getCurrentKeySlotIndex() {
          return this.currentIndex + 1; // 1-based index for logging
      }
      
      getOpenAIKey() {
          return this.openAIKey;
      }

      // Check specifically which slots are configured (for UI monitoring)
      getKeyConfigStatus() {
          return [
              !!(process.env.API_KEY && process.env.API_KEY !== 'undefined'),
              !!(process.env.API_KEY_2 && process.env.API_KEY_2 !== 'undefined'),
              !!(process.env.API_KEY_3 && process.env.API_KEY_3 !== 'undefined'),
              !!(process.env.API_KEY_4 && process.env.API_KEY_4 !== 'undefined'),
              !!(process.env.API_KEY_5 && process.env.API_KEY_5 !== 'undefined')
          ];
      }

      switchToNextKey() {
          // Circular switching (Round Robin fallback)
          if (this.geminiKeys.length > 1) {
              const oldIndex = this.currentIndex;
              this.currentIndex = (this.currentIndex + 1) % this.geminiKeys.length;
              console.warn(`[KeyManager] ⚠️ Switching Key: Slot ${oldIndex + 1} -> Slot ${this.currentIndex + 1}`);
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

  // Retry Wrapper with Exponential Backoff & Key Rotation
  async function executeWithRetry(operation, retryCount = 0, keysTried = 1) {
      if (!keyManager.getCurrentKey()) {
          throw new Error("Server Configuration Error: API_KEY is missing in environment variables.");
      }

      // Max retries per key = 1 (Fast Failover). 
      // Max total keys tried = Total available keys.
      
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
          console.warn(`[API Error Slot ${keyManager.getCurrentKeySlotIndex()}] ${msg}`);
          
          // Identify Quota/Overload Errors
          // 429: Too Many Requests, 503: Service Unavailable
          const isQuotaError = msg.includes('429') || msg.includes('Quota') || msg.includes('exhausted') || msg.includes('503') || msg.includes('403');
          
          if (isQuotaError) {
              // Strategy: If current key fails, try next key IMMEDIATELY without waiting too long.
              // We only wait if we have exhausted all keys.
              
              if (keysTried < keyManager.geminiKeys.length) {
                  // Switch to next available key
                  keyManager.switchToNextKey();
                  return executeWithRetry(operation, 0, keysTried + 1);
              } else {
                  // All keys exhausted. Now we wait and retry on current (last) key.
                  if (retryCount < 1) {
                      const waitTime = 2000;
                      console.warn(`[API] All keys exhausted. Waiting ${waitTime}ms to retry...`);
                      await delay(waitTime);
                      return executeWithRetry(operation, retryCount + 1, keysTried);
                  } else {
                      throw new Error("ALL_KEYS_EXHAUSTED");
                  }
              }
          } else {
              // Non-quota error (e.g. invalid prompt, filter), throw immediately
              throw error;
          }
      }
  }

  try {
    const { action, payload } = req.body;
    
    if (!action) {
        return res.status(400).json({ error: "Missing 'action' in request body" });
    }

    // --- Action: getServiceStatus (NEW) ---
    if (action === 'getServiceStatus') {
        const status = keyManager.getKeyConfigStatus();
        return res.status(200).json({ 
            keyStatus: status,
            totalConfigured: status.filter(s => s).length,
            hasOpenAI: !!keyManager.getOpenAIKey()
        });
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
          // Gemini Fallback Logic for text
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
      const { prompt, safetySettings } = payload;
      
      // Helper: Generate via generateContent
      const generateViaContent = async (ai, modelName) => {
          console.log(`[Image Gen] Attempting with ${modelName}...`);
          const response = await ai.models.generateContent({
              model: modelName,
              contents: { parts: [{ text: prompt }] },
              config: { 
                  imageConfig: { aspectRatio: "1:1" },
                  safetySettings: safetySettings 
              }
          });
          
          let b64 = null;
          if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    b64 = part.inlineData.data;
                    break;
                }
            }
          }
          if (!b64) throw new Error(`No image data received from ${modelName}`);
          return { base64: b64 };
      };

      // Helper: Generate via generateImages
      const generateViaImagen = async (ai, modelName) => {
          console.log(`[Image Gen] Attempting with ${modelName}...`);
          const response = await ai.models.generateImages({
              model: modelName,
              prompt: prompt,
              config: { 
                  numberOfImages: 1,
                  aspectRatio: "1:1",
                  safetySettings: safetySettings 
              }
          });

          const imgBytes = response.generatedImages?.[0]?.image?.imageBytes;
          if (!imgBytes) throw new Error(`No image bytes received from ${modelName}`);
          return { base64: imgBytes };
      };

      // === WATERFALL STRATEGY ===
      // PRIORITY 1: Imagen 3.0
      try {
          const result = await executeWithRetry(async (ai) => {
              return await generateViaImagen(ai, 'imagen-3.0-generate-002');
          });
          return res.status(200).json(result);
      } catch (errorImagen3) {
          console.warn(`[Image Gen] Imagen 3.0 failed. Trying Gemini 2.5 Flash Image...`);
          
          // PRIORITY 2: Gemini 2.5 Flash Image
          try {
             const result = await executeWithRetry(async (ai) => {
                 return await generateViaContent(ai, 'gemini-2.5-flash-image');
             });
             return res.status(200).json(result);
          } catch (errorFlash) {
             console.warn(`[Image Gen] Gemini Flash failed. Checking OpenAI...`);
             
             // PRIORITY 3: OpenAI DALL-E 3
             if (keyManager.getOpenAIKey()) {
                 try {
                     const openAIBase64 = await generateOpenAIImage(prompt);
                     return res.status(200).json({ base64: openAIBase64 });
                 } catch (openAIError) {
                     return res.status(500).json({ error: "Backend Image Generation Failed (All Models Exhausted)." });
                 }
             } else {
                 return res.status(500).json({ error: "Backend Image Generation Failed (Gemini exhausted, no OpenAI key)." });
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
