
// Vercel Cron Handler
// Runs daily to remove expired batches and calculate remaining totals.

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

async function sendExpiryWarningEmail(email, daysLeft) {
    const RESEND_KEY = process.env.RESEND_API_KEY;
    const subject = `[AutoSocial] 您有一筆點數即將在 ${daysLeft} 天後到期`;
    
    const htmlContent = `
      <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #000;">點數到期提醒</h2>
        <p>親愛的用戶您好，</p>
        <p>系統偵測到您帳戶中有一筆點數即將在 <strong>${daysLeft} 天後</strong> 到期。</p>
        <p>系統將優先扣除即將到期的點數。請盡快登入使用以免失效。</p>
        <br/>
        <p style="font-size: 12px; color: #999;">AutoSocial Team</p>
      </div>
    `;

    if (!RESEND_KEY) {
        console.log(`[EMAIL_MOCK] To: ${email} | Subject: ${subject}`);
        return true;
    }

    try {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_KEY}`
            },
            body: JSON.stringify({
                from: 'AutoSocial <system@autosocial.ai>',
                to: [email],
                subject: subject,
                html: htmlContent
            })
        });
        return true;
    } catch (e) {
        console.error('[Email Failed]', e);
        return false;
    }
}

module.exports = async function (req, res) {
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).end('Unauthorized');
  }

  if (!admin.apps.length) return res.status(500).json({ error: "Firebase not initialized" });

  console.log("[Cron] Starting Batch Expiration Check...");
  const db = admin.firestore();
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  try {
      const usersSnap = await db.collection('users').get();
      let expiredBatchCount = 0;
      let warningCount = 0;

      const batch = db.batch();
      let batchOps = 0;

      for (const doc of usersSnap.docs) {
          const user = doc.data();
          let quotaBatches = user.quota_batches || [];
          let quotaTotal = user.quota_total;
          
          // Migration logic: If total exists but batches don't
          if (quotaBatches.length === 0 && quotaTotal > 0) {
              const expiry = user.quota_reset_date || (now + 365 * ONE_DAY);
              quotaBatches = [{
                  id: 'migrated_batch',
                  amount: quotaTotal,
                  initialAmount: quotaTotal,
                  expiresAt: expiry,
                  source: 'system',
                  addedAt: now
              }];
          }

          if (quotaBatches.length === 0) continue;

          // 1. Remove Expired Batches & Calculate New Total
          const validBatches = [];
          let hasChange = false;

          for (const b of quotaBatches) {
              if (b.expiresAt <= now) {
                  console.log(`[Expire] User ${user.email} batch ${b.id} expired (${b.amount} pts).`);
                  expiredBatchCount++;
                  hasChange = true;
              } else if (b.amount <= 0) {
                  // Clean up empty batches
                  hasChange = true; 
              } else {
                  validBatches.push(b);
              }
          }

          // Sort by expiry (Ascending)
          validBatches.sort((a, b) => a.expiresAt - b.expiresAt);

          // 2. Notifications (Check the soonest expiring batch)
          if (validBatches.length > 0) {
              const soonest = validBatches[0];
              const msLeft = soonest.expiresAt - now;
              const daysLeft = Math.ceil(msLeft / ONE_DAY);
              const currentLevel = user.expiry_warning_level || 0;

              // Warning logic: only warn if a SIGNIFICANT amount is expiring
              if (daysLeft <= 30 && currentLevel < 2 && soonest.amount > 5) {
                  await sendExpiryWarningEmail(user.email, 30);
                  batch.update(doc.ref, { expiry_warning_level: 2 });
                  warningCount++;
                  batchOps++;
              }
          }

          // 3. Update DB if batches changed
          if (hasChange) {
              const newTotal = validBatches.reduce((sum, b) => sum + b.amount, 0);
              const nextExpiry = validBatches.length > 0 ? validBatches[0].expiresAt : 0;
              
              batch.update(doc.ref, {
                  quota_batches: validBatches,
                  quota_total: newTotal,
                  quota_reset_date: nextExpiry,
                  updated_at: now
              });
              batchOps++;
          }

          if (batchOps >= 400) { await batch.commit(); batchOps = 0; }
      }

      if (batchOps > 0) await batch.commit();

      return res.status(200).json({ 
          success: true, 
          stats: { processed: usersSnap.size, expiredBatchesRemoved: expiredBatchCount, warningsSent: warningCount }
      });

  } catch (e) {
      console.error("[Cron Error]", e);
      return res.status(500).json({ error: e.message });
  }
};
