
module.exports = async function (req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action, code, redirectUri } = req.body;

  // Configuration from Environment Variables
  const CLIENT_ID = process.env.VITE_THREADS_APP_ID || process.env.THREADS_APP_ID;
  const CLIENT_SECRET = process.env.THREADS_APP_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Missing Threads App Credentials in Server Environment");
    return res.status(500).json({ error: 'Server Configuration Error: Missing App Credentials' });
  }

  try {
    // === Action: Exchange Code for Long-Lived Token ===
    if (action === 'exchange') {
        if (!code || !redirectUri) {
            return res.status(400).json({ error: 'Missing code or redirectUri' });
        }

        console.log(`[Threads Auth] Exchanging code... RedirectURI: ${redirectUri}`);

        // Step 1: Exchange Code for Short-Lived Token
        const params = new URLSearchParams();
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);
        params.append('grant_type', 'authorization_code');
        params.append('redirect_uri', redirectUri);
        params.append('code', code);

        const shortRes = await fetch('https://graph.threads.net/oauth/access_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        const shortData = await shortRes.json();
        
        if (shortData.error) {
            console.error('[Threads Auth] Step 1 Error:', shortData.error);
            throw new Error(`Meta API Error (Step 1): ${shortData.error.message}`);
        }

        const shortToken = shortData.access_token;
        const userId = shortData.user_id;

        // Step 2: Exchange Short Token for Long-Lived Token (60 days)
        const longUrl = `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${CLIENT_SECRET}&access_token=${shortToken}`;
        const longRes = await fetch(longUrl);
        const longData = await longRes.json();

        if (longData.error) {
            console.error('[Threads Auth] Step 2 Error:', longData.error);
            throw new Error(`Meta API Error (Step 2): ${longData.error.message}`);
        }

        const longToken = longData.access_token;

        // Step 3: Fetch Username (Optional but useful)
        let username = `User_${userId.slice(-4)}`;
        try {
            const userRes = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url&access_token=${longToken}`);
            const userData = await userRes.json();
            if (userData.username) username = userData.username;
        } catch (e) {
            console.warn('[Threads Auth] Failed to fetch username:', e);
        }

        return res.status(200).json({
            success: true,
            data: {
                userId,
                token: longToken,
                username
            }
        });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('[Threads API Error]:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};
