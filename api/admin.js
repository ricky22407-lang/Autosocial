// 檔案路徑：api/admin.js
const admin = require('firebase-admin');
const crypto = require('crypto');

// 1. 初始化 Firebase Admin (同 cron.js，使用 Vercel 環境變數)
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
        console.warn("[Admin API] Missing Credentials. 伺服器缺少 Firebase 驗證環境變數。");
    }
}

// 輔助函數：對應不同等級的配額
const getQuotaForRole = (role) => {
    switch (role) {
        case 'starter': return 300;
        case 'pro': return 500;
        case 'business': return 3000;
        case 'admin': return 99999;
        default: return 30; // user
    }
};

module.exports = async function (req, res) {
    // 設定 CORS 標頭，允許前端跨域呼叫
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

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin not initialized" });

    const db = admin.firestore();
    const { action, payload } = req.body;

    if (!action || !payload) {
        return res.status(400).json({ error: 'Missing action or payload' });
    }

    try {
        // ==========================================
        // 動作 1：管理員生成金鑰
        // ==========================================
        if (action === 'generateKey') {
            const { adminId, type, targetRole, targetFeature, pointsAmount } = payload;
            
            // 安全性檢查：驗證呼叫者是否真的是管理員
            const callerDoc = await db.collection('users').doc(adminId).get();
            if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
                return res.status(403).json({ error: 'Permission denied: Not an Admin' });
            }

            const featureCode = targetFeature ? `-${targetFeature.substring(0,3)}` : '';
            const pointsCode = pointsAmount ? `-P${pointsAmount}` : '';
            const key = `KEY${featureCode}${pointsCode}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*100)}`;
            
            await db.collection('admin_keys').doc(key).set({
                key, 
                type, 
                targetRole: targetRole || null,
                targetFeature: targetFeature || null, 
                pointsAmount: pointsAmount || null,
                createdBy: adminId, 
                createdAt: Date.now(),
                expiresAt: Date.now() + 3600000 * 24, // 24小時有效
                isUsed: false
            });

            return res.status(200).json({ key });
        }

        // ==========================================
        // 動作 2：使用者兌換金鑰
        // ==========================================
        if (action === 'useKey') {
            const { userId, keyString } = payload;
            if (!userId || !keyString) return res.status(400).json({ error: 'Missing parameters' });

            const keyRef = db.collection('admin_keys').doc(keyString);
            const userRef = db.collection('users').doc(userId);

            // 使用 Transaction 確保兌換過程不被併發(Double spend)攻擊
            const result = await db.runTransaction(async (t) => {
                const doc = await t.get(keyRef);
                if (!doc.exists) throw new Error("無效的金鑰");
                const keyData = doc.data();
                if (keyData.isUsed) throw new Error("此金鑰已被使用");
                if (Date.now() > keyData.expiresAt) throw new Error("此金鑰已過期失效");

                const userDoc = await t.get(userRef);
                if (!userDoc.exists) throw new Error("用戶不存在");
                const userData = userDoc.data();
                
                const now = Date.now();
                const expiry = now + (365 * 24 * 60 * 60 * 1000); // 1年期限

                let updates = {};

                if (keyData.type === 'RESET_QUOTA') {
                    updates = { quota_used: 0, isSuspended: false };
                } 
                else if (keyData.type === 'UPGRADE_ROLE' && keyData.targetRole) {
                    const topUpAmount = getQuotaForRole(keyData.targetRole);
                    const newBatch = {
                        id: crypto.randomUUID(), 
                        amount: topUpAmount, 
                        initialAmount: topUpAmount,
                        expiresAt: expiry, 
                        source: 'topup', 
                        addedAt: now
                    };
                    const currentBatches = userData.quota_batches || [];
                    if (!userData.quota_batches && userData.quota_total > 0) {
                        currentBatches.push({
                            id: 'legacy_mig', amount: userData.quota_total, initialAmount: userData.quota_total,
                            expiresAt: userData.quota_reset_date || expiry, source: 'trial', addedAt: now
                        });
                    }
                    currentBatches.push(newBatch);
                    currentBatches.sort((a,b) => a.expiresAt - b.expiresAt);

                    updates = { 
                        role: keyData.targetRole, 
                        quota_batches: currentBatches,
                        quota_total: currentBatches.reduce((s,b) => s + b.amount, 0),
                        quota_reset_date: currentBatches[0].expiresAt,
                        expiry_warning_level: 0
                    };
                } 
                else if (keyData.type === 'UNLOCK_FEATURE' && keyData.targetFeature) {
                    updates = { unlockedFeatures: admin.firestore.FieldValue.arrayUnion(keyData.targetFeature) };
                }
                else if (keyData.type === 'ADD_POINTS' && keyData.pointsAmount) {
                    const newBatch = {
                        id: crypto.randomUUID(), 
                        amount: keyData.pointsAmount, 
                        initialAmount: keyData.pointsAmount,
                        expiresAt: expiry, 
                        source: 'admin_gift', 
                        addedAt: now
                    };
                    const currentBatches = userData.quota_batches || [];
                    currentBatches.push(newBatch);
                    currentBatches.sort((a,b) => a.expiresAt - b.expiresAt);
                    
                    updates = {
                        quota_batches: currentBatches,
                        quota_total: currentBatches.reduce((s,b) => s + b.amount, 0),
                        quota_reset_date: currentBatches[0].expiresAt,
                    };
                }

                // 執行更新與核銷
                t.update(userRef, updates);
                t.update(keyRef, { isUsed: true, usedBy: userId, usedAt: now });
                
                return { success: true, message: "金鑰兌換成功！" };
            });

            return res.status(200).json(result);
        }

        return res.status(400).json({ error: 'Unknown action' });

    } catch (e) {
        console.error("[Admin API Error]:", e);
        return res.status(500).json({ error: e.message });
    }
};
