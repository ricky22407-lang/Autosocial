// 新增檔案：api/admin.js
const admin = require('firebase-admin');

if (!admin.apps.length) {
    // 這裡請參考您 api/cron.js 的 firebase-admin 初始化方式
    admin.initializeApp({ /* ... */ });
}

module.exports = async function (req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const db = admin.firestore();
    const { action, targetRole, userId } = req.body; // 實務上 userId 應該從驗證 token 取得

    try {
        // 1. 驗證呼叫者是否真的是管理員
        const callerDoc = await db.collection('users').doc(userId).get();
        if (callerDoc.data().role !== 'admin') {
            return res.status(403).json({ error: 'Permission denied' });
        }

        // 2. 伺服器端生成 Key
        if (action === 'generateKey') {
            const key = `KEY_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            await db.collection('admin_keys').doc(key).set({
                type: targetRole,
                createdBy: userId,
                createdAt: Date.now(),
                isUsed: false
            });
            return res.status(200).json({ key });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
