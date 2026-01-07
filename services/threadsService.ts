
import { ThreadsAccount } from "../types";

const THREADS_API_BASE = 'https://graph.threads.net/v1.0';
const THREADS_GRAPH_BASE = 'https://graph.threads.net';

// Helper to get Env safely
const getThreadsAppId = () => {
    const env = (import.meta as any).env || {};
    return env.VITE_THREADS_APP_ID || env.REACT_APP_THREADS_APP_ID || '';
};

/**
 * Publishes a TEXT post to Threads.
 * Note: Threads API for Image/Video requires a public URL accessible by Meta's servers.
 */
export const publishThreadsPost = async (
  account: ThreadsAccount,
  text: string,
  imageUrl?: string,
  replyToId?: string // New: Optional param for replying
): Promise<{ success: boolean; id?: string; error?: string }> => {
  
  if (!account.userId || !account.token) {
    return { success: false, error: '帳號設定不完整 (缺 ID 或 Token)' };
  }

  try {
    // 1. Create Media Container
    const params = new URLSearchParams();
    params.append('access_token', account.token);
    params.append('text', text);
    
    if (replyToId) {
        params.append('reply_to_id', replyToId);
    }
    
    let endpoint = `${THREADS_API_BASE}/${account.userId}/threads`;

    // Attempt Image if URL is public (http/https)
    if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
        params.append('media_type', 'IMAGE');
        params.append('image_url', imageUrl);
    } else {
        params.append('media_type', 'TEXT');
    }

    const containerRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
    });

    const containerData = await containerRes.json();
    
    if (containerData.error) {
        throw new Error(`建立貼文容器失敗: ${containerData.error.message}`);
    }

    const creationId = containerData.id;

    // 2. Publish Media Container
    const publishParams = new URLSearchParams();
    publishParams.append('access_token', account.token);
    publishParams.append('creation_id', creationId);

    const publishRes = await fetch(`${THREADS_API_BASE}/${account.userId}/threads_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: publishParams
    });

    const publishData = await publishRes.json();

    if (publishData.error) {
        throw new Error(`發佈貼文失敗: ${publishData.error.message}`);
    }

    return { success: true, id: publishData.id };

  } catch (e: any) {
    console.error("Threads API Error:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Fetch User's Recent Threads
 */
export const fetchUserThreads = async (account: ThreadsAccount, limit = 5) => {
    try {
        const fields = 'id,text,permalink,timestamp,media_type,media_url';
        const url = `${THREADS_API_BASE}/${account.userId}/threads?fields=${fields}&limit=${limit}&access_token=${account.token}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.data || [];
    } catch (e: any) {
        console.error("Fetch threads failed", e);
        // Throw error to UI instead of silent fail, so user knows if token is invalid
        throw new Error(e.message || "讀取貼文失敗");
    }
};

/**
 * Fetch Replies for a specific Media Object (Thread)
 */
export const fetchMediaReplies = async (account: ThreadsAccount, mediaId: string) => {
    try {
        const fields = 'id,text,timestamp,username,permalink'; 
        const url = `${THREADS_API_BASE}/${mediaId}/replies?fields=${fields}&access_token=${account.token}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.data || [];
    } catch (e: any) {
        return [];
    }
};

/**
 * Refresh Long-Lived Token
 */
export const refreshThreadsToken = async (token: string): Promise<{ success: boolean; newToken?: string; error?: string }> => {
    try {
        const res = await fetch(`${THREADS_GRAPH_BASE}/refresh_access_token?grant_type=th_refresh_token&access_token=${token}`);
        const data = await res.json();
        
        if (data.access_token) {
            return { success: true, newToken: data.access_token };
        } else if (data.error) {
            throw new Error(data.error.message);
        }
        throw new Error("API 回傳格式未知");
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

/**
 * Validate Threads Token & ID
 */
export const validateThreadsToken = async (userId: string, token: string): Promise<{ valid: boolean; username?: string; error?: string }> => {
    try {
        const url = `${THREADS_API_BASE}/${userId}?fields=id,username&access_token=${token}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.error) {
            return { valid: false, error: data.error.message };
        }
        
        if (data.id) {
            return { valid: true, username: data.username };
        }
        
        return { valid: false, error: "無法識別用戶資訊" };
    } catch (e: any) {
        return { valid: false, error: e.message };
    }
};
