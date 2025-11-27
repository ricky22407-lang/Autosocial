
import { Router } from 'express';
import * as admin from 'firebase-admin';
import { verifyToken, requireAdmin } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid'; // Assumption: uuid package installed

const router = Router();
const db = admin.firestore();

// Get All Users
router.get('/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Fetch failed' });
  }
});

// Create Admin Key
router.post('/create-key', verifyToken, requireAdmin, async (req, res) => {
  const { type, targetRole } = req.body; // type: 'RESET_QUOTA' | 'UPGRADE_ROLE'
  
  const keyString = `RESET-${uuidv4().split('-')[0].toUpperCase()}-${uuidv4().split('-')[1].toUpperCase()}`;
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 mins

  const keyDoc = {
    key: keyString,
    type,
    targetRole: targetRole || null,
    createdBy: req.user!.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
    isUsed: false
  };

  try {
    await db.collection('admin_keys').doc(keyString).set(keyDoc);
    res.json({ key: keyString, expiresAt });
  } catch (error) {
    res.status(500).json({ error: 'Key creation failed' });
  }
});

// Use Key (This endpoint might be public or user-protected, depending on flow. Assuming User-protected)
router.post('/use-key', verifyToken, async (req, res) => {
  const { key } = req.body;
  const keyRef = db.collection('admin_keys').doc(key);
  const userRef = db.collection('users').doc(req.user!.uid);

  try {
    await db.runTransaction(async (t) => {
      const kDoc = await t.get(keyRef);
      if (!kDoc.exists) throw new Error("Invalid Key");
      
      const kData = kDoc.data();
      if (kData?.isUsed) throw new Error("Key already used");
      if (Date.now() > kData?.expiresAt) throw new Error("Key expired");

      const uDoc = await t.get(userRef);
      const uData = uDoc.data();
      if (!uDoc.exists) throw new Error("User not found");

      // Apply effects
      if (kData?.type === 'RESET_QUOTA') {
        t.update(userRef, { 'quota.used': 0 });
      } else if (kData?.type === 'UPGRADE_ROLE') {
        const newQuotaTotal = kData.targetRole === 'vip' ? 9999 : 100;
        t.update(userRef, { 
            role: kData.targetRole,
            'quota.total': newQuotaTotal 
        });
      }

      // Mark key used
      t.update(keyRef, { isUsed: true, usedBy: req.user!.uid, usedAt: admin.firestore.FieldValue.serverTimestamp() });
    });

    res.json({ success: true, message: 'Key applied successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
