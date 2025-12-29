
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

  if (!req.body) {
      return res.status(400).json({ error: 'Missing Request Body' });
  }

  // --- Key Manager & Load Balancing ---
  class KeyManager {
      constructor() {
          this.geminiKeys = [
              process.env.API_KEY,
              process.env.API_KEY_2,
              process.env.API_KEY_3,
              process.env.API_KEY_4,
              process.env.API_KEY_5
          ].filter(k => k && k.length > 10 && k !== 'undefined');
          
          this.openAIKey = process.env.OPENAI_API_KEY;
          
          this.ideogramKeys = [
              process.env.IDEOGRAM_API_KEY,
              process.env.IDEOGRAM_API_KEY_2
          ].filter(k => k && k.length > 0 && k !== 'undefined');

          this.grokKey = process.env.GROK_API_KEY;

          this.currentIndex = this.geminiKeys.length > 0 
              ? Math.floor(Math.random() * this.geminiKeys.length) 
              : 0;
      }

      getCurrentKey() {
          if (this.geminiKeys.length === 0) return null;
          return this.geminiKeys[this.currentIndex];
      }
      
      getCurrentKeySlotIndex() {
          return this.currentIndex + 1;
      }

      getIdeogramKey() {
          if (this.ideogramKeys.length === 0) return null;
          return this.ideogramKeys[Math.floor(Math.random() * this.ideogramKeys.length)];
      }

      getGrokKey() { return this.grokKey; }
      getOpenAIKey() { return this.openAIKey; }

      getKeyConfigStatus() {
          return [
              !!(process.env.API_KEY && process.env.API_KEY.length > 10),
              !!(process.env.API_KEY_2 && process.env.API_KEY_2.length > 10),
              !!(process.env.IDEOGRAM_API_KEY),
              !!(process.env.IDEOGRAM_API_KEY_2),
              !!(process.env.GROK_API_KEY)
          ];
      }

      switchToNextKey() {
          if (this.geminiKeys.length > 1) {
              const oldIndex = this.currentIndex;
              this.currentIndex = (this.currentIndex + 1) % this.geminiKeys.length;
              console.warn(`[KeyManager] ⚠️ Key Slot ${oldIndex + 1} exhausted. Switching to Slot ${this.currentIndex + 1}...`);
              return true;
          }
          return false;
      }
  }

  const keyManager = new KeyManager();
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const isRetryableError = (error) => {
      const msg = (error.message || '').toLowerCase();
      const status = error.status || error.response?.status;
      return (
          msg.includes('429') || status === 429 ||
          msg.includes('quota') || msg.includes('resource exhausted') || 
          msg.includes('limit') || msg.includes('overloaded') ||
          msg.includes('503') || status === 503
      );
  };

  async function executeWithRetry(operation) {
      if (keyManager.geminiKeys.length === 0) throw new Error("Server Error: No Gemini API Keys configured.");

      let lastError = null;
      const attempts = keyManager.geminiKeys.length;

      let GoogleGenAI;
      try {
          const sdk = await import("@google/genai");
          GoogleGenAI = sdk.GoogleGenAI;
      } catch (e) { throw new Error(`SDK Load Failed: ${e.message}`); }

      for (let i = 0; i < attempts; i++) {
          const currentKey = keyManager.getCurrentKey();
          const currentSlot = keyManager.getCurrentKeySlotIndex();

          try {
              const ai = new GoogleGenAI({ apiKey: currentKey });
              // Pass both AI instance AND the raw key string to the callback
              const result = await operation(ai, currentKey);
              return result;

          } catch (error) {
              lastError = error;
              
              if (isRetryableError(error)) {
                  console.warn(`[Gemini] Key Slot ${currentSlot} hit rate limit (429/Quota).`);
                  if (i < attempts - 1) {
                      keyManager.switchToNextKey();
                      await delay(300 + Math.random() * 500); 
                      continue; 
                  }
              }
              
              if (error.status === 400 && !error.message.toLowerCase().includes('key')) {
                  throw error; 
              }
          }
      }
      console.error("[Gemini] All API keys exhausted.");
      throw new Error(`All API keys exhausted. Last error: ${lastError?.message}`);
  }

  // ... (Ideogram/Grok/OpenAI functions remain the same as previous output) ...
  async function generateIdeogramImage(prompt) {
      const apiKey = keyManager.getIdeogramKey();
      if (!apiKey) return null; 
      let ar = "ASPECT_1_1";
      if (prompt.includes("16:9")) ar = "ASPECT_16_9";
      if (prompt.includes("9:16")) ar = "ASPECT_9_16";
      const response = await fetch("https://api.ideogram.ai/generate", {
          method: "POST",
          headers: { "Api-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ image_request: { prompt: prompt, aspect_ratio: ar, model: "V_2", magic_prompt_option: "AUTO" } })
      });
      if (!response.ok) throw new Error(`Ideogram Error: ${response.status}`);
      const data = await response.json();
      const imageUrl = data.data?.[0]?.url;
      if (!imageUrl) throw new Error("Ideogram returned no image URL");
      const imgRes = await fetch(imageUrl);
      const arrayBuffer = await imgRes.arrayBuffer();
      return Buffer.from(arrayBuffer).toString('base64');
  }

  async function generateGrokImage(prompt) {
      const apiKey = keyManager.getGrokKey();
      if (!apiKey) return null;
      const response = await fetch("https://api.x.ai/v1/images/generations", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt, model: "grok-beta", n: 1, size: "1024x1024", response_format: "b64_json" })
      });
      if (!response.ok) throw new Error(`Grok Error`);
      const data = await response.json();
      return data.data?.[0]?.b64_json;
  }

  async function generateOpenAIImage(prompt) {
      const apiKey = keyManager.getOpenAIKey();
      if (!apiKey) return null;
      const response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({ model: "dall-e-3", prompt: prompt, n: 1, size: "1024x1024", response_format: "b64_json" })
      });
      const data = await response.json();
      if (data.error) throw new Error(`OpenAI Error: ${data.error.message}`);
      return data.data[0].b64_json;
  }

  try {
    const { action, payload } = req.body;
    if (!action) return res.status(400).json({ error: "Missing 'action'" });

    if (action === 'getServiceStatus') {
        const status = keyManager.getKeyConfigStatus();
        return res.status(200).json({ 
            keyStatus: status,
            totalConfigured: status.filter(s => s).length,
            hasOpenAI: !!keyManager.getOpenAIKey()
        });
    }

    if (action === 'fetchRss') {
        const { url } = payload;
        const rssRes = await fetch(url);
        return res.status(200).json({ text: await rssRes.text() });
    }

    if (action === 'fetchOgImage') {
        const { url } = payload;
        const htmlRes = await fetch(url, { headers: { 'User-Agent': 'Bot' } });
        const html = await htmlRes.text();
        const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        return res.status(200).json({ imageUrl: match ? match[1] : null });
    }

    if (action === 'generateContent') {
      const { model, contents, config } = payload;
      const result = await executeWithRetry(async (ai) => {
          const response = await ai.models.generateContent({ model, contents, config });
          return { text: response.text };
      });
      return res.status(200).json(result);
    }
    
    if (action === 'generateImages') {
      const { prompt, safetySettings } = payload;
      
      try {
          const ideogramB64 = await generateIdeogramImage(prompt);
          if (ideogramB64) return res.status(200).json({ base64: ideogramB64, provider: 'ideogram' });
      } catch (e) { console.warn("[Waterfall] Ideogram skipped:", e.message); }

      try {
          const geminiResult = await executeWithRetry(async (ai) => {
              console.log("[Waterfall] Attempting Imagen 3...");
              const response = await ai.models.generateImages({
                  model: 'imagen-3.0-generate-002',
                  prompt: prompt,
                  config: { numberOfImages: 1, aspectRatio: "1:1", safetySettings }
              });
              const bytes = response.generatedImages?.[0]?.image?.imageBytes;
              if (!bytes) throw new Error("No bytes from Imagen");
              return { base64: bytes, provider: 'imagen-3' };
          });
          return res.status(200).json(geminiResult);
      } catch (geminiError) {
          console.warn("[Waterfall] Imagen 3 failed:", geminiError.message);
          try {
              const flashResult = await executeWithRetry(async (ai) => {
                  console.log("[Waterfall] Fallback to Gemini Flash Image...");
                  const response = await ai.models.generateContent({
                      model: 'gemini-2.5-flash-image',
                      contents: { parts: [{ text: prompt }] }
                  });
                  const bytes = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                  if (!bytes) throw new Error("No data from Flash Image");
                  return { base64: bytes, provider: 'gemini-flash' };
              });
              return res.status(200).json(flashResult);
          } catch (flashError) {
              console.warn("[Waterfall] Gemini Flash failed:", flashError.message);
          }
      }

      try {
          const grokB64 = await generateGrokImage(prompt);
          if (grokB64) return res.status(200).json({ base64: grokB64, provider: 'grok' });
      } catch (e) { console.warn("[Waterfall] Grok failed:", e.message); }

      try {
          const openAIB64 = await generateOpenAIImage(prompt);
          if (openAIB64) return res.status(200).json({ base64: openAIB64, provider: 'openai' });
      } catch (e) { console.warn("[Waterfall] OpenAI failed:", e.message); }

      return res.status(500).json({ error: "All image providers failed." });
    }
    
    if (action === 'generateVideos') {
       const { model, prompt, config } = payload;
       const result = await executeWithRetry(async (ai, currentKey) => {
           let operation = await ai.models.generateVideos({ model, prompt, config });
           let attempts = 0;
           while (!operation.done && attempts < 20) { 
               await delay(3000);
               operation = await ai.operations.getVideosOperation({ operation: operation });
               attempts++;
           }
           if (!operation.done) throw new Error("Video timeout");
           const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
           if (!uri) throw new Error("No URI");
           
           // Use the explicitly passed 'currentKey' which is valid for this loop iteration
           const vidRes = await fetch(`${uri}&key=${currentKey}`);
           if (!vidRes.ok) throw new Error("Video download failed");
           const buf = await vidRes.arrayBuffer();
           return { videoBase64: Buffer.from(buf).toString('base64') };
       });
       return res.status(200).json(result);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (error) {
    console.error('[API Error]:', error);
    return res.status(500).json({ error: error.message || 'Server Error' });
  }
};
