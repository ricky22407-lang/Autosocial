

import { ThreadsAccount } from "../types";

const THREADS_API_BASE = 'https://graph.threads.net/v1.0';
const THREADS_GRAPH_BASE = 'https://graph.threads.net';

/**
 * Publishes a TEXT post to Threads.
 * Note: Threads API for Image/Video requires a public URL accessible by Meta's servers.
 */
export const publishThreadsPost = async (
  account: ThreadsAccount,
  text: string,
  imageUrl?: string
): Promise<{ success: boolean; id?: string; error?: string }> => {
  
  if (!account.userId || !account.token) {
    return { success: false, error: '帳號設定不完整 (缺 ID 或 Token)' };
  }

  try {
    // 1. Create Media Container
    // POST /{user_id}/threads
    // params: media_type=TEXT (or IMAGE), text, access_token
    const params = new URLSearchParams();
    params.append('access_token', account.token);
    params.append('text', text);
    
    let endpoint = `${THREADS_API_BASE}/${account.userId}/threads`;

    // Attempt Image if URL is public (http/https)
    // Note: DataURI (base64) is NOT supported by Threads API directly via URL param.
    // Threads strictly requires public URLs.
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
    // POST /{user_id}/threads_publish
    // params: creation_id, access_token
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
 * Refresh Long-Lived Token
 * GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=...
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