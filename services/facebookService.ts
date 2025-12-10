

import { AnalyticsData, TopPostData } from "../types";

const FB_API_VERSION = 'v17.0'; 

// --- Helper for FB Graph API ---
const graphApi = async (endpoint: string, token: string, method = 'GET', body?: any) => {
  const url = `https://graph.facebook.com/${FB_API_VERSION}/${endpoint}`;
  
  const headers: HeadersInit = {};
  if (method !== 'GET' && method !== 'HEAD') {
      (headers as any)['Content-Type'] = 'application/json';
  }

  const fullUrl = `${url}${url.includes('?') ? '&' : '?'}access_token=${token}`;

  const options: RequestInit = {
    method,
    headers,
  };

  if (method !== 'GET' && method !== 'HEAD' && body) {
    options.body = JSON.stringify(body);
  }

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

export const validateFacebookToken = async (token: string): Promise<boolean> => {
  if (!token) return false;
  try {
    await graphApi('me', token);
    return true;
  } catch (e) {
    return false;
  }
};

// --- NEW: Publish to Instagram (via FB Graph) ---
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

        // 2. Create Media Container
        // IG requires a public URL. If imageUrl is Base64, we might fail unless we upload to a temp host.
        // For this demo, we assume the user provides a public URL (e.g. from stock or previous FB upload).
        // Since FB Graph API for IG doesn't accept direct file upload easily from browser without backend proxy for binary,
        // we will rely on URL. *Limitation*: Generated AI images (Base64) need hosting.
        
        // WORKAROUND: If it's base64, we can't post to IG directly via Client-Side API easily.
        // We return error if not http/https.
        if (!imageUrl.startsWith('http')) {
            return { success: false, error: "IG 同步僅支援公開網址圖片 (Base64 不支援)" };
        }

        const containerRes = await graphApi(`${igUserId}/media`, token, 'POST', {
            image_url: imageUrl,
            caption: caption
        });
        const containerId = containerRes.id;

        // 3. Publish Container
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
    let postId;
    let publishedMediaUrl = mediaUrl; // Store the final URL FB sees

    // 1. Post logic
    if (mediaUrl) {
      const isBase64 = mediaUrl.startsWith('data:');
      const isVideoUrl = mediaUrl.includes('.mp4') || mediaUrl.startsWith('data:video');
      
      const endpoint = isVideoUrl ? `${pageId}/videos` : `${pageId}/photos`;

      if (isBase64) {
        try {
            const blob = await base64ToBlob(mediaUrl);
            const formData = new FormData();
            formData.append('access_token', token);
            formData.append('message', message);
            formData.append('source', blob);
            
            const uploadUrl = `https://graph.facebook.com/${FB_API_VERSION}/${endpoint}`;
            const res = await fetch(uploadUrl, { method: 'POST', body: formData });
            
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            postId = data.id || data.post_id;
            // Note: We don't get a public URL back easily for IG sync here unless we query it back.

        } catch (uploadError: any) {
            console.error("Image upload failed:", uploadError);
            const res = await graphApi(`${pageId}/feed`, token, 'POST', { 
                message: `${message}\n\n(註：圖片上傳失敗 - ${uploadError.message})` 
            });
            postId = res.id;
        }

      } else if (mediaUrl.startsWith('http')) {
        const payload: any = { message };
        if (isVideoUrl) payload.file_url = mediaUrl;
        else payload.url = mediaUrl;

        const res = await graphApi(endpoint, token, 'POST', payload);
        postId = res.id || res.post_id;
      } else {
        const res = await graphApi(`${pageId}/feed`, token, 'POST', { message });
        postId = res.id;
      }

    } else {
      const res = await graphApi(`${pageId}/feed`, token, 'POST', { message });
      postId = res.id;
    }

    // 2. First Comment Logic
    if (firstComment && postId) {
      try {
        await graphApi(`${postId}/comments`, token, 'POST', { message: firstComment });
      } catch (e) { 
          console.warn("Failed to post first comment", e); 
          // If first comment fails, don't fail the whole post, but maybe warn?
      }
    }

    // 3. Instagram Sync Logic
    let igMsg = '';
    if (syncInstagram && mediaUrl && mediaUrl.startsWith('http')) {
        const igRes = await publishToInstagram(pageId, token, mediaUrl, message);
        if (igRes.success) {
            igMsg = ' (IG 同步成功)';
        } else {
            igMsg = ` (IG 同步失敗: ${igRes.error})`;
        }
    } else if (syncInstagram) {
        igMsg = ' (IG 同步略過：需為公開圖片網址)';
    }

    return { 
      success: true, 
      url: `https://facebook.com/${postId}`,
      error: igMsg ? `FB 成功${igMsg}` : undefined // Hack to pass info message
    };

  } catch (e: any) {
    return { success: false, error: e.message || "發布失敗" };
  }
};

// ... existing analytics code ...
export const fetchPageAnalytics = async (pageId: string, token?: string): Promise<AnalyticsData | null> => {
  if (!pageId || !token) return null; 

  try {
    const pageInfo = await graphApi(`${pageId}?fields=followers_count`, token, 'GET');
    const followers = pageInfo.followers_count || 0;
    
    let reach = 0;
    let engagedUsers = 0;

    try {
        const reachData = await graphApi(`${pageId}/insights?metric=page_impressions_unique&period=days_28`, token, 'GET');
        reach = reachData.data?.[0]?.values?.[0]?.value || 0;
    } catch (e) {}

    try {
        const engageData = await graphApi(`${pageId}/insights?metric=page_engaged_users&period=days_28`, token, 'GET');
        engagedUsers = engageData.data?.[0]?.values?.[0]?.value || 0;
    } catch (e) {}
    
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

        const sortedByReach = [...processedPosts].sort((a, b) => b.reach - a.reach);
        const topReachPost = sortedByReach[0];
        if (topReachPost) topReachPost.type = 'reach';

        const sortedByEngagement = [...processedPosts].sort((a, b) => b.engagedUsers - a.engagedUsers);
        const topEngagePost = sortedByEngagement[0];
        if (topEngagePost) topEngagePost.type = 'engagement';

        return { topReach: topReachPost, topEngagement: topEngagePost };

    } catch (e) {
        return {};
    }
};

export const refreshLongLivedToken = async (currentToken: string): Promise<{ success: boolean; newToken?: string; expiry?: number }> => {
    return { success: false };
};

export const fetchRecentPostCaptions = async (pageId: string, token: string, limit: number = 20): Promise<string[]> => {
    try {
        const res = await graphApi(`${pageId}/feed?fields=message&limit=${limit}`, token, 'GET');
        const posts = res.data || [];
        // Filter empty messages
        return posts
            .map((p: any) => p.message)
            .filter((m: any) => m && typeof m === 'string' && m.length > 20);
    } catch (e: any) {
        console.error("Failed to fetch recent captions:", e);
        throw new Error("無法讀取粉專貼文，請檢查權限");
    }
};
