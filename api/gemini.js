
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
          // Load keys from possible env vars. You can set API_KEY, API_KEY_2, API_KEY_3 in Vercel.
          this.geminiKeys = [
              process.env.API_KEY,
              process.env.API_KEY_2,
              process.env.API_KEY_3
          ].filter(Boolean);
          
          this.currentIndex = 0;
      }

      getCurrentKey() {
          if (this.geminiKeys.length === 0) return null;
          return this.geminiKeys[this.currentIndex];
      }

      switchToNextKey() {
          if (this.currentIndex < this.geminiKeys.length - 1) {
              this.currentIndex++;
              console.warn(`[KeyManager] ⚠️ Switching to Backup Key #${this.currentIndex + 1}`);
              return true;
          }
          return false;
      }
  }

  const keyManager = new KeyManager();

  // Retry Wrapper
  async function executeWithRetry(operation) {
      let attempts = 0;
      let lastError = null;

      // Try current key, if fail, switch and retry
      // Max attempts = number of keys available
      const maxAttempts = keyManager.geminiKeys.length || 1; 

      while (attempts < maxAttempts) {
          try {
              const apiKey = keyManager.getCurrentKey();
              
              // Fallback for missing keys - throw detailed error instead of crashing
              if (!apiKey) throw new Error("Server Misconfiguration: No API_KEY found in environment variables.");

              // Dynamic Import SDK with specific Key
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
              lastError = error;
              const msg = error.message || '';
              
              // Check for Quota or Permission errors to trigger failover
              const isQuotaError = msg.includes('429') || msg.includes('403') || msg.includes('Quota') || msg.includes('Resource has been exhausted');
              
              if (isQuotaError) {
                  console.warn(`[API] Key #${keyManager.currentIndex + 1} failed: ${msg}`);
                  if (keyManager.switchToNextKey()) {
                      attempts++;
                      continue; // Retry loop with new key
                  } else {
                      throw new Error("All API keys exhausted. Please check billing or add more keys.");
                  }
              } else {
                  // If it's not a quota error (e.g. Bad Request, Invalid Argument), throw immediately
                  throw error;
              }
          }
      }
      throw lastError;
  }


  try {
    const { action, payload } = req.body;
    
    if (!action) {
        return res.status(400).json({ error: "Missing 'action' in request body" });
    }

    // console.log(`[API] Processing action: ${action}`);

    // --- Action Handler: fetchRss (Server-Side Proxy) ---
    if (action === 'fetchRss') {
        const { url } = payload;
        if (!url) throw new Error("Missing URL for RSS fetch");

        try {
            // Using Node's native fetch (Node 18+) or polyfill provided by Vercel environment
            const rssRes = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            if (!rssRes.ok) {
                throw new Error(`RSS Source returned status ${rssRes.status}: ${rssRes.statusText}`);
            }

            const text = await rssRes.text();
            return res.status(200).json({ text });
        } catch (rssError) {
            console.error("RSS Proxy Failed:", rssError);
            throw new Error(`Failed to fetch RSS content: ${rssError.message}`);
        }
    }

    // --- Action Handler: generateContent ---
    else if (action === 'generateContent') {
      const { model, contents, config } = payload;
      
      const result = await executeWithRetry(async (ai) => {
          const response = await ai.models.generateContent({ 
            model, 
            contents, 
            config 
          });
          return { text: response.text };
      });
      
      return res.status(200).json(result);
    }
    
    // --- Action Handler: generateImages ---
    else if (action === 'generateImages') {
      const { model, prompt, config } = payload;
      
      const result = await executeWithRetry(async (ai) => {
          if (model.includes('flash-image') || model.includes('nano')) {
              const response = await ai.models.generateContent({
                 model,
                 contents: { parts: [{ text: prompt }] },
                 config
             });
             
             let b64 = null;
             for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    b64 = part.inlineData.data;
                    break;
                }
             }
             if (!b64) throw new Error("No image generated by Flash model");
             return { base64: b64 };

          } else {
             // Imagen Models
             const response = await ai.models.generateImages({ model, prompt, config });
             const b64 = response.generatedImages?.[0]?.image?.imageBytes;
             return { base64: b64 };
          }
      });

      return res.status(200).json(result);
    }
    
    // --- Action Handler: generateVideos ---
    else if (action === 'generateVideos') {
       const { model, prompt, config } = payload;
       
       const result = await executeWithRetry(async (ai) => {
           let operation = await ai.models.generateVideos({ model, prompt, config });

           let attempts = 0;
           const maxAttempts = 18; // Extended to ~54s
           
           while (!operation.done && attempts < maxAttempts) { 
               await new Promise(r => setTimeout(r, 3000));
               operation = await ai.operations.getVideosOperation({ operation: operation });
               attempts++;
           }

           if (!operation.done) {
               throw new Error("Video generation timed out.");
           }

           const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
           if (!videoUri) throw new Error("No video URI returned");

           // Use current valid key for download
           const currentKey = keyManager.getCurrentKey();
           const downloadUrl = `${videoUri}&key=${currentKey}`;
           
           // Fetch the video content server-side to return base64 to client
           const videoRes = await fetch(downloadUrl);
           
           if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.statusText}`);
           
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
    console.error('[API Critical Error]:', error);
    // Ensure we always return JSON, even for critical crashes
    return res.status(500).json({ 
        error: error.message || 'Internal Server Error',
        details: error.toString()
    });
  }
};
