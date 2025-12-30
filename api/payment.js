
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
// Simple HTML Form Generator for ECPay (In production, consider using 'ecpay_aio_nodejs' SDK)
function generateEcpayHtml(orderId, plan, returnUrl, clientBackUrl) {
    const tradeDate = new Date().toLocaleString('zh-TW', { hour12: false }).replace(/\//g, '/');
    
    // Minimal parameters for "Periodical" (Periodic) or "General" (One-time)
    // Here we simulate a "General" payment that *acts* as a subscription start.
    // Real recurring integration requires specific ECPay Period parameters.
    // For this snippet, we use a standard form post structure.
    
    const params = {
        MerchantID: ECPAY_CONFIG.MerchantID,
        MerchantTradeNo: orderId,
        MerchantTradeDate: tradeDate,
        PaymentType: 'aio',
        TotalAmount: plan.amount,
        TradeDesc: 'AutoSocial Subscription',
        ItemName: plan.name,
        ReturnURL: returnUrl, // Webhook
        ClientBackURL: clientBackUrl, // User Redirect
        ChoosePayment: 'Credit',
        EncryptType: '1',
    };

    // Calculate CheckMacValue (Simplified placeholder - Use SDK in real app)
    // NOTE: This Mock CheckMacValue will NOT work on real ECPay. 
    // You MUST install `ecpay_aio_nodejs` or implement the SHA256 sort/hash logic.
    const checkMacValue = "MOCK_CHECK_MAC_VALUE_USE_SDK_PLEASE"; 

    // Build Form
    let html = `<form id="_form_ecpay" action="${ECPAY_CONFIG.BaseUrl}/Cashier/AioCheckOut/V5" method="post">`;
    for (const [key, value] of Object.entries(params)) {
        html += `<input type="hidden" name="${key}" value="${value}" />`;
    }
    // html += `<input type="hidden" name="CheckMacValue" value="${checkMacValue}" />`; // Commented out to prevent error in dev without SDK
    html += `</form><script>document.getElementById("_form_ecpay").submit();</script>`;
    
    // In a real implementation with SDK:
    // const ecpay_payment = require('ecpay_aio_nodejs');
    // const create = new ecpay_payment(options);
    // const html = create.payment_client.aio_check_out_credit_period(...) 
    
    return html;
}

// --- CONTROLLER ---
module.exports = async function (req, res) {
    const db = admin.firestore();

    // 1. Handle Webhook (POST from Payment Gateway)
    // This is public, validated by CheckMacValue/Signature
    if (req.method === 'POST' && req.body.RtnCode) {
        console.log("[Payment Callback]", req.body);
        
        // TODO: Validate CheckMacValue (Signature) here!
        const { MerchantTradeNo, RtnCode, RtnMsg } = req.body;
        
        if (RtnCode === '1') { // Success
            try {
                // MerchantTradeNo format: "AS_{UID}_{TIMESTAMP}"
                const parts = MerchantTradeNo.split('_');
                const uid = parts[1];
                
                // Fetch user to determine plan (stored in pending order or metadata)
                // Simplified: Assume we upgrade to PRO for now, or fetch from a 'orders' collection
                const userRef = db.collection('users').doc(uid);
                
                const now = Date.now();
                const expiry = now + 30 * 24 * 60 * 60 * 1000; // +30 Days

                await userRef.update({
                    'role': 'pro', // or dynamic based on order
                    'subscription.status': 'active',
                    'subscription.lastPaymentDate': now,
                    'subscription.nextBillingDate': expiry,
                    'quota_total': 500, // Reset/Add quota
                    'quota_used': 0     // Optional: Reset used
                });
                
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

        if (action === 'create_subscription') {
            const { uid, planId, provider } = payload;
            const plan = PLANS[planId];
            if (!plan) return res.status(400).json({ error: "Invalid Plan" });

            const orderId = `AS_${uid}_${Date.now()}`;
            const host = req.headers.host; 
            const protocol = req.headers['x-forwarded-proto'] || 'http';
            const baseUrl = `${protocol}://${host}`;
            
            // URLs
            const returnUrl = `${baseUrl}/api/payment`; // Webhook
            const clientBackUrl = `${baseUrl}`; // Redirect user back to home

            if (provider === 'ecpay') {
                // Generate ECPay Form
                // NOTE: In production, install `ecpay_aio_nodejs` to generate valid CheckMacValue
                const html = generateEcpayHtml(orderId, plan, returnUrl, clientBackUrl);
                
                // Save Pending Order State
                await db.collection('orders').doc(orderId).set({
                    uid, planId, provider, status: 'pending', createdAt: Date.now()
                });

                return res.json({ success: true, htmlForm: html });
            } 
            else if (provider === 'bank_api') {
                // Mock Bank API Call
                // const bankRes = await fetch(BANK_API_CONFIG.Endpoint, { ... });
                return res.json({ 
                    success: true, 
                    paymentUrl: `${baseUrl}/?mock_bank_success=true` // Simulate redirect
                });
            }
        }

        if (action === 'cancel_subscription') {
            const { uid } = payload;
            await db.collection('users').doc(uid).update({
                'subscription.cancelAtPeriodEnd': true,
                'subscription.status': 'canceled' // or keep active until end
            });
            return res.json({ success: true });
        }
    }

    return res.status(404).json({ error: "Not Found" });
};
