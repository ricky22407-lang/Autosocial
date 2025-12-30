
const admin = require('firebase-admin');

// Initialize Firebase (Shared with other functions)
if (!admin.apps.length) {
    const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
    };
    if (serviceAccount.projectId) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// --- CONFIG ---
const ECPAY_CONFIG = {
    MerchantID: process.env.ECPAY_MERCHANT_ID || '2000132', // Test ID
    HashKey: process.env.ECPAY_HASH_KEY || '5294y06JbISpM5x9', // Test Key
    HashIV: process.env.ECPAY_HASH_IV || 'v77hoKGq4kWxNNIS',   // Test IV
    BaseUrl: process.env.NODE_ENV === 'production' 
        ? 'https://payment.ecpay.com.tw' 
        : 'https://payment-stage.ecpay.com.tw'
};

const BANK_API_CONFIG = {
    // Placeholder for Bank API credentials
    ApiKey: process.env.BANK_API_KEY,
    Endpoint: process.env.BANK_API_ENDPOINT
};

const PLANS = {
    'starter': { amount: 399, name: 'AutoSocial Starter Plan', points: 300 },
    'pro': { amount: 599, name: 'AutoSocial Pro Plan', points: 500 },
    'business': { amount: 0, name: 'Enterprise', points: 0 } // Contact sales
};

// --- HELPERS ---
// Simple HTML Form Generator for ECPay
function generateEcpayHtml(orderId, amount, itemName, returnUrl, clientBackUrl) {
    const tradeDate = new Date().toLocaleString('zh-TW', { hour12: false }).replace(/\//g, '/');
    
    const params = {
        MerchantID: ECPAY_CONFIG.MerchantID,
        MerchantTradeNo: orderId,
        MerchantTradeDate: tradeDate,
        PaymentType: 'aio',
        TotalAmount: amount,
        TradeDesc: 'AutoSocial Service',
        ItemName: itemName,
        ReturnURL: returnUrl, // Webhook
        ClientBackURL: clientBackUrl, // User Redirect
        ChoosePayment: 'Credit',
        EncryptType: '1',
    };

    // Calculate CheckMacValue (Simplified placeholder - Use SDK in real app)
    const checkMacValue = "MOCK_CHECK_MAC_VALUE_USE_SDK_PLEASE"; 

    // Build Form
    let html = `<form id="_form_ecpay" action="${ECPAY_CONFIG.BaseUrl}/Cashier/AioCheckOut/V5" method="post">`;
    for (const [key, value] of Object.entries(params)) {
        html += `<input type="hidden" name="${key}" value="${value}" />`;
    }
    html += `</form><script>document.getElementById("_form_ecpay").submit();</script>`;
    
    return html;
}

// --- CONTROLLER ---
module.exports = async function (req, res) {
    const db = admin.firestore();

    // 1. Handle Webhook (POST from Payment Gateway)
    // This is public, validated by CheckMacValue/Signature
    if (req.method === 'POST' && req.body.RtnCode) {
        console.log("[Payment Callback]", req.body);
        
        const { MerchantTradeNo, RtnCode, RtnMsg, TradeAmt } = req.body;
        
        if (RtnCode === '1') { // Success
            try {
                // Format: "PREFIX_{UID}_{TIMESTAMP}"
                const parts = MerchantTradeNo.split('_');
                const type = parts[0]; // 'SUB' or 'TOPUP' or 'AS'(legacy)
                const uid = parts[1];
                const userRef = db.collection('users').doc(uid);
                const now = Date.now();

                // === CASE A: SUBSCRIPTION ===
                if (type === 'SUB' || type === 'AS') {
                    // Assume default Pro renewal for now, or fetch pending order details
                    const expiry = now + 30 * 24 * 60 * 60 * 1000; // +30 Days
                    await userRef.update({
                        'role': 'pro', // Or determine from trade amount
                        'subscription.status': 'active',
                        'subscription.lastPaymentDate': now,
                        'subscription.nextBillingDate': expiry,
                        // Reset quota logic can be complex, for now we set to plan max
                        'quota_total': 500, 
                        'updated_at': now
                    });
                } 
                // === CASE B: TOP-UP ===
                else if (type === 'TOPUP') {
                    // TradeAmt is string, e.g. "100"
                    const pointsToAdd = parseInt(TradeAmt); // 1 TWD = 1 Point logic
                    const batchId = `paid_${MerchantTradeNo}`;
                    const expiry = now + 365 * 24 * 60 * 60 * 1000; // 1 Year validity for paid points

                    await db.runTransaction(async (t) => {
                        const doc = await t.get(userRef);
                        const data = doc.data();
                        
                        const newBatch = {
                            id: batchId,
                            amount: pointsToAdd,
                            initialAmount: pointsToAdd,
                            expiresAt: expiry,
                            source: 'topup',
                            addedAt: now
                        };

                        const currentBatches = data.quota_batches || [];
                        // Migration if needed
                        if (!data.quota_batches && data.quota_total > 0) {
                            currentBatches.push({
                                id: 'legacy_mig_pay', amount: data.quota_total, initialAmount: data.quota_total,
                                expiresAt: data.quota_reset_date || expiry, source: 'trial', addedAt: now
                            });
                        }
                        
                        currentBatches.push(newBatch);
                        // Sort by expiry
                        currentBatches.sort((a,b) => a.expiresAt - b.expiresAt);

                        const newTotal = currentBatches.reduce((sum, b) => sum + b.amount, 0);

                        t.update(userRef, {
                            quota_batches: currentBatches,
                            quota_total: newTotal,
                            quota_reset_date: currentBatches[0].expiresAt,
                            updated_at: now
                        });
                    });
                }
                
                return res.send('1|OK'); // ECPay expects strictly '1|OK'
            } catch (e) {
                console.error("Callback Error", e);
                return res.status(500).send('0|Error');
            }
        }
        return res.send('1|OK'); // Acknowledge even if failed logic
    }

    // 2. Handle API Actions (Authenticated)
    if (req.method === 'POST') {
        const { action, payload } = req.body;
        const host = req.headers.host; 
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const baseUrl = `${protocol}://${host}`;
        const returnUrl = `${baseUrl}/api/payment`; // Webhook
        const clientBackUrl = `${baseUrl}`; // Redirect user back to home

        // --- Create Subscription ---
        if (action === 'create_subscription') {
            const { uid, planId, provider } = payload;
            const plan = PLANS[planId];
            if (!plan) return res.status(400).json({ error: "Invalid Plan" });

            const orderId = `SUB_${uid}_${Date.now()}`;

            if (provider === 'ecpay') {
                const html = generateEcpayHtml(orderId, plan.amount, plan.name, returnUrl, clientBackUrl);
                return res.json({ success: true, htmlForm: html });
            } 
            else if (provider === 'bank_api') {
                return res.json({ success: true, paymentUrl: `${baseUrl}/?mock_bank_success=true` });
            }
        }

        // --- Create Top-Up ---
        if (action === 'create_topup') {
            const { uid, quantity, provider } = payload; // quantity: units of 100
            if (!quantity || quantity < 1) return res.status(400).json({ error: "Invalid Quantity" });
            
            const amount = quantity * 100; // 1 unit = $100 TWD = 100 Pts
            const orderId = `TOPUP_${uid}_${Date.now()}`;
            const itemName = `AutoSocial Points (${amount} pts)`;

            if (provider === 'ecpay') {
                const html = generateEcpayHtml(orderId, amount, itemName, returnUrl, clientBackUrl);
                return res.json({ success: true, htmlForm: html });
            }
            else if (provider === 'bank_api') {
                return res.json({ success: true, paymentUrl: `${baseUrl}/?mock_bank_success=true` });
            }
        }

        if (action === 'cancel_subscription') {
            const { uid } = payload;
            await db.collection('users').doc(uid).update({
                'subscription.cancelAtPeriodEnd': true,
                'subscription.status': 'canceled' 
            });
            return res.json({ success: true });
        }
    }

    return res.status(404).json({ error: "Not Found" });
};
