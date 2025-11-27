
import { Router } from 'express';
import * as admin from 'firebase-admin';
import { verifyToken, checkQuota } from '../middleware/auth';

const router = Router();
const db = admin.firestore();

// Get User Profile
router.get('/me', verifyToken, async (req, res) => {
  try {
    const doc = await db.collection('users').doc(req.user!.uid).get();
    if (!doc.exists) {
        return res.status(404).json({ error: 'User profile not found' });
    }
    res.json(doc.data());
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Use Quota (Called after AI generation)
router.post('/use-quota', verifyToken, checkQuota, async (req, res) => {
  try {
    const userRef = db.collection('users').doc(req.user!.uid);
    
    await db.runTransaction(async (t) => {
      const doc = await t.get(userRef);
      const data = doc.data();
      if (!data) throw new Error("User does not exist!");

      const newUsed = (data.quota?.used || 0) + 1;
      t.update(userRef, { 
        'quota.used': newUsed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    res.json({ success: true, message: 'Quota deducted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update quota' });
  }
});

export default router;
