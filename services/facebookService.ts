// REFACTOR ONLY: no functional changes

import { AnalyticsData, TopPostData } from "../types";

const FB_API_VERSION = 'v17.0'; 

// ==========================================
// Internal Helpers
// ==========================================

const getHeaders = (method: string): HeadersInit => {
  const headers: HeadersInit = {};
  if (method !== 'GET' && method !== 'HEAD') {
      (headers as any)['Content-Type'] = 'application/json';
  }
  return headers;
};

const graphApi = async (endpoint: string, token: string, method = 'GET', body?: any) => {
  const url = `https://graph.facebook.com/${FB_API_VERSION}/${endpoint}`;
  const fullUrl = `${url}${url.includes('?') ? '&' : '?'}access_token=${token}`;

  const options: RequestInit = {
    method,
    headers: getHeaders(method),
    body: (method !== 'GET' && method !== 'HEAD' && body) ? JSON.stringify(body) : undefined
  };

  try {
    const res = await fetch(fullUrl, options);
    const data = await res.json();
    
    if (data.error) {
      throw new Error(`FB API Error: ${data.error.message}`);
    }
    return data;
  } catch (error: any) {
    console.error("FB API Request Failed:", error);
    throw error;
  }
};

const base64ToBlob = async (base64: string): Promise<Blob> => {
  const res = await fetch(base64);
  return await res.blob();
};

// --- Upload Logic Helpers ---

const uploadBase64Media = async (pageId: string, token: string, message: string, base64Url: string, isVideo: boolean): Promise<string> => {
    const endpoint = isVideo ? `${pageId}/videos` : `${pageId}/photos`;
    
    try {
        const blob = await base64ToBlob(base64Url);
        const formData = new FormData();
        formData.append('access_token', token);
        formData.append('message', message);
        // FIX: Append filename to ensure FB API recognizes it
        formData.append('source', blob, isVideo ? 'video.mp4' : 'image.png');
        
        const uploadUrl = `https://graph.facebook.com/${FB_API_VERSION}/${endpoint}`;
        const res = await fetch(uploadUrl, { method: 'POST', body: formData });
        
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        
        return data.id || data.post_id;

    } catch (uploadError: any) {
        console.error("Media upload failed:", uploadError);
        // Fallback: Post as text with error note
        const res = await graphApi(`${pageId}/feed`, token, 'POST', { 
            message: `${message}\n\n(註：圖片上傳失敗 - ${uploadError.message})` 
        });
        return res.id;
    }
};

const uploadUrlMedia = async (pageId: string, token: string, message: string, mediaUrl: string, isVideo: boolean): Promise<string> => {
    const endpoint = isVideo ? `${pageId}/videos` : `${pageId}/photos`;
    const payload: any = { message };
    
    if (isVideo) payload.file_url = mediaUrl;
    else payload.url = mediaUrl;

    const res = await graphApi(endpoint, token, 'POST', payload);
    return res.id || res.post_id;
};

// --- Instagram Sync Helpers ---

const performInstagramSync = async (
    pageId: string, 
    token: string, 
    mediaUrl: string, 
    message: string, 
    syncEnabled?: boolean
): Promise<string> => {
    if (!syncEnabled) return '';

    if (mediaUrl && mediaUrl.startsWith('http')) {
        const igRes = await publishToInstagram(pageId, token, mediaUrl, message);
        return igRes.success ? ' (IG 同步成功)' : ` (IG 同步失敗: ${igRes.error})`;
    }
    
    return ' (IG 同步略過：需為公開圖片網址)';
};

// ==========================================
// Public Exports
// ==========================================

export const validateFacebookToken = async (token: string): Promise<boolean> => {
  if (!token) return false;
  try {
    await graphApi('me', token);
    return true;
  } catch (e) {
    return false;
  }
};

export const publishToInstagram = async (
    pageId: string,
    token: string,
    imageUrl: string,
    caption: string
): Promise<{ success: boolean; id?: string; error?: string }> => {
    try {
        // 1. Get Linked IG Business Account ID
        const pageData = await graphApi(`${pageId}?fields=instagram_business_account`, token);
        const igUserId = pageData.instagram_business_account?.id;

        if (!igUserId) {
            return { success: false, error: "此粉專未連結 Instagram 商業帳號" };
        }

        // 2. Validate URL (IG Graph API restriction)
        if (!imageUrl.startsWith('http')) {
            return { success: false, error: "IG 同步僅支援公開網址圖片 (Base64 不支援)" };
        }

        // 3. Create Media Container
        const containerRes = await graphApi(`${igUserId}/media`, token, 'POST', {
            image_url: imageUrl,
            caption: caption
        });
        const containerId = containerRes.id;

        // 4. Publish Container
        const publishRes = await graphApi(`${igUserId}/media_publish`, token, 'POST', {
            creation_id: containerId
        });

        return { success: true, id: publishRes.id };

    } catch (e: any) {
        console.warn("IG Publish Failed:", e);
        return { success: false, error: e.message || "IG 發佈失敗" };
    }
};

export const publishPostToFacebook = async (
  pageId: string,
  token: string,
  message: string,
  mediaUrl?: string,
  firstComment?: string,
  syncInstagram?: boolean
): Promise<{ success: boolean; url?: string; error?: string; igResult?: string }> => {
  
  if (!pageId || !token) {
     return { success: false, error: '未設定 Page ID 或 Token' };
  }

  try {
    let postId: string;

    // 1. Publish Main Post
    if (mediaUrl) {
      const isBase64 = mediaUrl.startsWith('data:');
      const isVideoUrl = mediaUrl.includes('.mp4') || mediaUrl.startsWith('data:video');

      if (isBase64) {
          postId = await uploadBase64Media(pageId, token, message, mediaUrl, isVideoUrl);
      } else if (mediaUrl.startsWith('http')) {
          postId = await uploadUrlMedia(pageId, token, message, mediaUrl, isVideoUrl);
      } else {
          // Fallback if mediaUrl is malformed but exists
          const res = await graphApi(`${pageId}/feed`, token, 'POST', { message });
          postId = res.id;
      }
    } else {
      // Text Only
      const res = await graphApi(`${pageId}/feed`, token, 'POST', { message });
      postId = res.id;
    }

    // 2. Publish First Comment (Best Effort)
    if (firstComment && postId) {
      try {
        await graphApi(`${postId}/comments`, token, 'POST', { message: firstComment });
      } catch (e) { 
          console.warn("Failed to post first comment", e); 
      }
    }

    // 3. Sync to Instagram
    const igMsg = await performInstagramSync(pageId, token, mediaUrl || '', message, syncInstagram);

    return { 
      success: true, 
      url: `https://facebook.com/${postId}`,
      error: igMsg ? `FB 成功${igMsg}` : undefined 
    };

  } catch (e: any) {
    return { success: false, error: e.message || "發布失敗" };
  }
};

export const fetchPageAnalytics = async (pageId: string, token?: string): Promise<AnalyticsData | null> => {
  if (!pageId || !token) return null; 

  try {
    const pageInfo = await graphApi(`${pageId}?fields=followers_count`, token, 'GET');
    const followers = pageInfo.followers_count || 0;
    
    // Fetch Insights
    let reach = 0;
    let engagedUsers = 0;

    const getMetric = async (metric: string) => {
        try {
            const data = await graphApi(`${pageId}/insights?metric=${metric}&period=days_28`, token, 'GET');
            return data.data?.[0]?.values?.[0]?.value || 0;
        } catch { return 0; }
    };

    reach = await getMetric('page_impressions_unique');
    engagedUsers = await getMetric('page_engaged_users');
    
    const engagementRate = reach > 0 ? ((engagedUsers / reach) * 100).toFixed(2) : 0;

    return {
      followers,
      followersGrowth: 0, 
      reach: reach,
      engagementRate: Number(engagementRate),
      period: '過去 28 天 (API 真實數據)'
    };
  } catch (e: any) {
    console.error("Analytics fetch failed details:", e);
    throw new Error(e.message || "無法取得數據");
  }
};

export const fetchPageTopPosts = async (pageId: string, token: string): Promise<{ topReach?: TopPostData, topEngagement?: TopPostData }> => {
    try {
        const fields = 'id,message,created_time,full_picture,permalink_url,insights.metric(post_impressions_unique,post_engaged_users)';
        const feedUrl = `${pageId}/feed?limit=15&fields=${fields}`;
        
        const res = await graphApi(feedUrl, token, 'GET');
        const posts = res.data || [];

        if (posts.length === 0) return {};

        const processedPosts: TopPostData[] = posts.map((p: any) => {
            const insights = p.insights?.data || [];
            const reachMetric = insights.find((m: any) => m.name === 'post_impressions_unique');
            const engageMetric = insights.find((m: any) => m.name === 'post_engaged_users');

            return {
                id: p.id,
                message: p.message || '(無文字內容)',
                imageUrl: p.full_picture,
                created_time: p.created_time,
                permalink_url: p.permalink_url,
                reach: reachMetric?.values?.[0]?.value || 0,
                engagedUsers: engageMetric?.values?.[0]?.value || 0,
                type: 'reach' 
            };
        });

        // Helper for sorting
        const getSorted = (list: TopPostData[], key: 'reach' | 'engagedUsers') => 
            [...list].sort((a, b) => b[key] - a[key])[0];

        const topReachPost = getSorted(processedPosts, 'reach');
        if (topReachPost) topReachPost.type = 'reach';

        const topEngagePost = getSorted(processedPosts, 'engagedUsers');
        if (topEngagePost) topEngagePost.type = 'engagement';

        return { topReach: topReachPost, topEngagement: topEngagePost };

    } catch (e) {
        return {};
    }
};

export const refreshLongLivedToken = async (currentToken: string): Promise<{ success: boolean; newToken?: string; expiry?: number }> => {
    // Placeholder as implemented in original
    return { success: false };
};

export const fetchRecentPostCaptions = async (pageId: string, token: string, limit: number = 20): Promise<string[]> => {
    try {
        const res = await graphApi(`${pageId}/feed?fields=message&limit=${limit}`, token, 'GET');
        const posts = res.data || [];
        return posts
            .map((p: any) => p.message)
            .filter((m: any) => m && typeof m === 'string' && m.length > 20);
    } catch (e: any) {
        console.error("Failed to fetch recent captions:", e);
        throw new Error("無法讀取粉專貼文，請檢查權限");
    }
};