
const admin = require('firebase-admin');
const { GoogleGenAI } = require("@google/genai");

// 初始化 Firebase Admin (使用環境變數)
if (!admin.apps.length) {
    const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
    };
    if (serviceAccount.projectId && serviceAccount.privateKey) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
}

const db = admin.firestore();
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * FB 自動發文邏輯 (Server-side)
 */
async function runAutoPilotForUser(uid, userDoc) {
    const settings = userDoc.brand_settings || {};
    const config = settings.autoPilot || {};
    const now = Date.now();

    console.log(`[AutoPilot] 正在處理用戶: ${userDoc.email}`);

    try {
        // 1. 決定主題 (使用 Google Search Grounding)
        const industry = settings.industry || "數位行銷";
        const searchResp = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `找出目前台灣關於「${industry}」的一個熱門社群話題。只回傳話題標題。`,
            config: { tools: [{ googleSearch: {} }] }
        });
        const topic = searchResp.text || `${industry} 最新趨勢`;

        // 2. 生成文案 (Gemini 3 Pro)
        const draftResp = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: `你是一位資深社群經理。品牌產業：${industry}。請針對「${topic}」寫一篇繁體中文的 FB 貼文，包含 Emoji。請輸出 JSON 格式：{"caption": "內容", "imagePrompt": "英文繪圖提示詞"}`,
            config: { responseMimeType: "application/json" }
        });
        const draft = JSON.parse(draftResp.text || '{}');

        // 3. 生成圖片 (Gemini Flash Image)
        let mediaUrl = "";
        const imgResp = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: draft.imagePrompt || topic }] },
            config: { imageConfig: { aspectRatio: "1:1" } }
        });
        const base64 = imgResp.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        
        // 4. 發佈到 Facebook (使用用戶 Token)
        if (settings.facebookPageId && settings.facebookToken) {
            const fbUrl = `https://graph.facebook.com/v19.0/${settings.facebookPageId}/photos`;
            const fbRes = await fetch(`${fbUrl}?access_token=${settings.facebookToken}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    caption: draft.caption,
                    url: base64 ? `data:image/png;base64,${base64}` : undefined,
                    published: true
                })
            });
            const fbData = await fbRes.json();
            console.log(`[FB Publish] Result:`, fbData);
        }

        // 5. 更新狀態與扣除點數
        await db.collection('users').doc(uid).update({
            quota_used: admin.firestore.FieldValue.increment(15),
            'brand_settings.autoPilot.lastRunAt': now,
            updated_at: now
        });

        return { success: true, topic };
    } catch (e) {
        console.error(`[AutoPilot Error] ${userDoc.email}:`, e);
        return { success: false, error: e.message };
    }
}

module.exports = async function (req, res) {
    const authHeader = req.headers['authorization'];
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).end('Unauthorized');
    }

    console.log("[Cron] 啟動全自動經營檢查...");
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0-6

    try {
        const usersSnap = await db.collection('users').get();
        let totalProcessed = 0;

        for (const doc of usersSnap.docs) {
            const user = doc.data();
            const ap = user.brand_settings?.autoPilot;

            if (ap && ap.enabled) {
                // 檢查是否符合設定的時間 (格式 "HH:mm")
                const [targetHour] = ap.postTime.split(':').map(Number);
                const isCorrectDay = ap.frequency === 'daily' || ap.postWeekDays?.includes(currentDay);
                const hasRunToday = ap.lastRunAt && new Date(ap.lastRunAt).toDateString() === now.toDateString();

                if (isCorrectDay && currentHour === targetHour && !hasRunToday) {
                    if (user.quota_used + 15 <= user.quota_total) {
                        await runAutoPilotForUser(doc.id, user);
                        totalProcessed++;
                    }
                }
            }
        }

        return res.status(200).json({ success: true, processed: totalProcessed });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
