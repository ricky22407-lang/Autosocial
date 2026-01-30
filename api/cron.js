
// Vercel Cron Handler
// Runs daily/hourly to handle:
// 1. Quota Batch Expiration
// 2. AutoPilot Social Posting (FB & Threads)

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
    };

    if (serviceAccount.projectId && serviceAccount.privateKey) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        console.warn("[Cron] Missing Credentials.");
    }
}

// --- HELPERS ---

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getGeminiClient() {
    const { GoogleGenAI } = await import("@google/genai");
    return new GoogleGenAI({ apiKey: process.env.API_KEY }); 
}

// FB Graph API Helper
async function publishToFb(pageId, token, message, imageUrl) {
    try {
        let endpoint = `${pageId}/feed`;
        const payload = { message };
        
        if (imageUrl) {
            // Check if video
            if (imageUrl.includes('.mp4') || imageUrl.includes('data:video')) {
                 endpoint = `${pageId}/videos`;
                 payload.description = message;
                 payload.file_url = imageUrl; // Only works with public URLs
            } else {
                 endpoint = `${pageId}/photos`;
                 payload.url = imageUrl;
                 payload.caption = message;
            }
        }

        const res = await fetch(`https://graph.facebook.com/v19.0/${endpoint}?access_token=${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.id || data.post_id;
    } catch (e) {
        console.error("[AutoPilot] FB Publish Error:", e.message);
        return null;
    }
}

// Threads Graph API Helper
async function publishToThreads(userId, token, text, imageUrl) {
    try {
        // 1. Create Container
        const params = new URLSearchParams();
        params.append('access_token', token);
        params.append('text', text);
        params.append('media_type', imageUrl ? 'IMAGE' : 'TEXT');
        if (imageUrl) params.append('image_url', imageUrl);

        const containerRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });
        const containerData = await containerRes.json();
        if (containerData.error) throw new Error(containerData.error.message);

        // 2. Publish
        const pubParams = new URLSearchParams();
        pubParams.append('access_token', token);
        pubParams.append('creation_id', containerData.id);

        const pubRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: pubParams
        });
        const pubData = await pubRes.json();
        if (pubData.error) throw new Error(pubData.error.message);
        
        return pubData.id;
    } catch (e) {
        console.error("[AutoPilot] Threads Publish Error:", e.message);
        return null;
    }
}

// --- CORE LOGIC: AUTO PILOT ---

async function runAutoPilotEngine(db) {
    console.log("[AutoPilot] Engine Starting...");
    const ai = await getGeminiClient();
    
    // 1. Time Calculation (Taipei Time UTC+8)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const taipeiTime = new Date(utc + (3600000 * 8));
    
    const currentHour = taipeiTime.getHours();
    const currentDay = taipeiTime.getDay(); // 0 (Sun) - 6 (Sat)
    
    // Timestamp for "Start of Today" in Taipei to check duplication
    const startOfToday = new Date(taipeiTime);
    startOfToday.setHours(0,0,0,0);
    const startOfTodayTs = startOfToday.getTime();

    console.log(`[AutoPilot] Time Check: Day ${currentDay}, Hour ${currentHour} (Taipei)`);

    // 2. Fetch All Brand Settings
    const settingsSnap = await db.collection('brand_settings').get();
    let processedCount = 0;

    for (const doc of settingsSnap.docs) {
        const userId = doc.id;
        const settings = doc.data();
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const userData = userDoc.data();

        if (!userData) continue;

        // ==========================================
        // JOB A: FACEBOOK AUTO PILOT
        // ==========================================
        const fbConfig = settings.autoPilot;
        if (fbConfig && fbConfig.enabled) {
            const configHour = parseInt((fbConfig.postTime || "09:00").split(':')[0]);
            const targetDays = fbConfig.postWeekDays || [0,1,2,3,4,5,6];
            const hasRanToday = fbConfig.lastRunAt && fbConfig.lastRunAt > startOfTodayTs;

            if (targetDays.includes(currentDay) && currentHour === configHour && !hasRanToday) {
                // Quota Check (15 pts)
                if (userData.quota_used + 15 <= userData.quota_total) {
                    try {
                        console.log(`[AutoPilot-FB] Executing for ${userId}...`);
                        
                        // 1. Topic
                        let topic = '';
                        if (fbConfig.source === 'keywords' && fbConfig.keywords?.length > 0) {
                            topic = fbConfig.keywords[Math.floor(Math.random() * fbConfig.keywords.length)];
                        } else {
                            const searchResp = await ai.models.generateContent({
                                model: 'gemini-2.5-flash',
                                contents: `找出目前台灣關於「${settings.industry}」的一個熱門社群話題。只回傳話題標題。`,
                                config: { tools: [{ googleSearch: {} }] }
                            });
                            topic = searchResp.text?.trim() || `${settings.industry} 熱門趨勢`;
                        }

                        // 2. Draft
                        const draftResp = await ai.models.generateContent({
                            model: "gemini-2.5-flash",
                            contents: `角色: 專業社群小編。品牌: ${settings.brandName} (${settings.industry})。任務: 針對主題「${topic}」寫一篇FB貼文。Output JSON: { "caption": "...", "imagePrompt": "English prompt..." }`,
                            config: { responseMimeType: "application/json" }
                        });
                        const draft = JSON.parse(draftResp.text || '{}');

                        // 3. Image
                        let imageUrl = null;
                        if (fbConfig.mediaTypePreference !== 'text_only' && draft.imagePrompt) {
                            const encoded = encodeURIComponent(draft.imagePrompt + ", high quality");
                            imageUrl = `https://image.pollinations.ai/prompt/${encoded}?n=${userId}&model=flux`;
                        }

                        // 4. Publish
                        if (settings.facebookPageId && settings.facebookToken) {
                            const fbId = await publishToFb(settings.facebookPageId, settings.facebookToken, draft.caption, imageUrl);
                            if (fbId) {
                                await userRef.update({ quota_used: admin.firestore.FieldValue.increment(15), updated_at: Date.now() });
                                await db.collection('brand_settings').doc(userId).update({ 'autoPilot.lastRunAt': Date.now() });
                                processedCount++;
                            }
                        }
                    } catch (e) { console.error(`FB Job Failed for ${userId}`, e); }
                }
            }
        }

        // ==========================================
        // JOB B: THREADS AUTO PILOT
        // ==========================================
        const thConfig = settings.threadsAutoPilot;
        if (thConfig && thConfig.enabled) {
            const configHour = parseInt((thConfig.postTime || "10:00").split(':')[0]);
            const targetDays = thConfig.postWeekDays || [0,1,2,3,4,5,6];
            const hasRanToday = thConfig.lastRunAt && thConfig.lastRunAt > startOfTodayTs; // Needs to be added to types/schema

            if (targetDays.includes(currentDay) && currentHour === configHour && !hasRanToday) {
                // Quota Check (8 pts)
                if (userData.quota_used + 8 <= userData.quota_total) {
                    try {
                        console.log(`[AutoPilot-Threads] Executing for ${userId}...`);
                        
                        // 1. Account Selection
                        const targetIds = thConfig.targetAccountIds || [];
                        const activeAccounts = settings.threadsAccounts?.filter(a => a.isActive && targetIds.includes(a.id)) || [];
                        
                        if (activeAccounts.length > 0) {
                            const account = activeAccounts[Math.floor(Math.random() * activeAccounts.length)];
                            
                            // 2. Topic
                            const searchResp = await ai.models.generateContent({
                                model: 'gemini-2.5-flash',
                                contents: `找出目前台灣關於「${settings.industry}」的一個適合 Threads 討論的熱門話題。只回傳標題。`,
                                config: { tools: [{ googleSearch: {} }] }
                            });
                            const topic = searchResp.text?.trim() || "生活觀察";

                            // 3. Draft (Persona based)
                            const prompt = `
                                模擬 Threads 真人發文。風格: ${account.styleGuide || '隨性、真實、簡短'}。
                                主題: ${topic}。
                                規則: 不要使用標題，直接開始碎碎念。適量使用 Emoji。
                                Output JSON: { "text": "...", "imagePrompt": "..." }
                            `;
                            const draftResp = await ai.models.generateContent({
                                model: "gemini-2.5-flash",
                                contents: prompt,
                                config: { responseMimeType: "application/json" }
                            });
                            const draft = JSON.parse(draftResp.text || '{}');

                            // 4. Image
                            let imageUrl = null;
                            if (thConfig.imageMode !== 'none' && draft.imagePrompt) {
                                const encoded = encodeURIComponent(draft.imagePrompt + ", candid photography, phone shot");
                                imageUrl = `https://image.pollinations.ai/prompt/${encoded}?n=${userId}_th&model=flux`;
                            }

                            // 5. Publish
                            const thId = await publishToThreads(account.userId, account.token, draft.text, imageUrl);
                            if (thId) {
                                await userRef.update({ quota_used: admin.firestore.FieldValue.increment(8), updated_at: Date.now() });
                                // We update lastRunAt in the specific threads config section
                                await db.collection('brand_settings').doc(userId).update({ 'threadsAutoPilot.lastRunAt': Date.now() });
                                processedCount++;
                            }
                        }
                    } catch (e) { console.error(`Threads Job Failed for ${userId}`, e); }
                }
            }
        }
        
        await delay(500); // Rate limit protection
    }

    return processedCount;
}

// --- CORE LOGIC: EXPIRY CHECK ---
async function runExpiryCheck(db) {
    const now = Date.now();
    const usersSnap = await db.collection('users').get();
    let expiredCount = 0;
    const batch = db.batch();
    let hasUpdates = false;

    usersSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.quota_batches) {
            const valid = data.quota_batches.filter(b => b.expiresAt > now && b.amount > 0);
            if (valid.length !== data.quota_batches.length) {
                const newTotal = valid.reduce((s,b) => s + b.amount, 0);
                batch.update(doc.ref, { 
                    quota_batches: valid, 
                    quota_total: newTotal,
                    updated_at: now
                });
                expiredCount++;
                hasUpdates = true;
            }
        }
    });

    if (hasUpdates) await batch.commit();
    return expiredCount;
}

module.exports = async function (req, res) {
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).end('Unauthorized');
  }

  if (!admin.apps.length) return res.status(500).json({ error: "Firebase not initialized" });

  const db = admin.firestore();

  try {
      const expiredStats = await runExpiryCheck(db);
      const autoPilotStats = await runAutoPilotEngine(db);

      return res.status(200).json({ 
          success: true, 
          timestamp: new Date().toISOString(),
          expiryCheck: { removed: expiredStats },
          autoPilot: { posted: autoPilotStats }
      });

  } catch (e) {
      console.error("[Cron Error]", e);
      return res.status(500).json({ error: e.message });
  }
};
