// REFACTOR ONLY: no functional changes

import { AnalyticsData, TopPostData } from "../types";

const FB_API_VERSION = 'v19.0'; // 升級至更穩定的版本

// ==========================================
// Internal Helpers
// ==========================================

const graphApi = async (endpoint: string, token: string, method = 'GET', body?: any) => {
  const url = `https://graph.facebook.com/${FB_API_VERSION}/${endpoint}`;
  const fullUrl = `${url}${url.includes('?') ? '&' : '?'}access_token=${token}`;

  const options: RequestInit = {
    method,
    headers: {},
  };

  // 只有當 body 是純物件（非 FormData）時才設定 JSON Header
  if (body && !(body instanceof FormData)) {
    (options.headers as any)['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    // FormData 不需要手動設 Content-Type，瀏覽器會自動處理 boundary
    options.body = body;
  }

  try {
    const res = await fetch(fullUrl, options);
    const data = await res.json();
    
    if (data.error) {
      throw new Error(`FB API Error: ${data.error.message} (Code: ${data.error.code})`);
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
    // 圖片接口使用 /photos，影片使用 /videos
    const endpoint = isVideo ? `${pageId}/videos` : `${pageId}/photos`;
    
    try {
        const blob = await base64ToBlob(base64Url);
        const formData = new FormData();
        
        // 依照 FB API 文件設定參數
        if (isVideo) {
            formData.append('description', message); // 影片文案參數是 description
            formData.append('source', blob, 'video.mp4');
        } else {
            formData.append('caption', message); // 圖片文案參數是 caption
            formData.append('source', blob, 'image.png');
        }

        const res = await graphApi(endpoint, token, 'POST', formData);
        return res.id || res.post_id;

    } catch (uploadError: any) {
        console.error("Media upload failed, falling back to text post:", uploadError);
        // 如果媒體上傳失敗，回退到純文字發布並加上警示
        const res = await graphApi(`${pageId}/feed`, token, 'POST', { 
            message: `${message}\n\n(註：附件上傳失敗: ${uploadError.message})` 
        });
        return res.id;
    }
};

const uploadUrlMedia = async (pageId: string, token: string, message: string, mediaUrl: string, isVideo: boolean): Promise<string> => {
    const endpoint = isVideo ? `${pageId}/videos` : `${pageId}/photos`;
    const payload: any = {};
    
    if (isVideo) {
        payload.description = message;
        payload.file_url = mediaUrl;
    } else {
        payload.caption = message;
        payload.url = mediaUrl;
    }

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

    // IG 必須有公開 URL 圖片才能同步
    if (mediaUrl && mediaUrl.startsWith('http')) {
        const igRes = await publishToInstagram(pageId, token, mediaUrl, message);
        return igRes.success ? ' (IG 同步成功)' : ` (IG 同步失敗: ${igRes.error})`;
    }
    
    return ' (IG 同步略過：僅支援公開網址圖片)';
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
        const pageData = await graphApi(`${pageId}?fields=instagram_business_account`, token);
        const igUserId = pageData.instagram_business_account?.id;

        if (!igUserId) {
            return { success: false, error: "未連結 IG 商業帳號" };
        }

        const containerRes = await graphApi(`${igUserId}/media`, token, 'POST', {
            image_url: imageUrl,
            caption: caption
        });
        
        const publishRes = await graphApi(`${igUserId}/media_publish`, token, 'POST', {
            creation_id: containerRes.id
        });

        return { success: true, id: publishRes.id };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const publishPostToFacebook = async (
  pageId: string,
  token: string,
  message: string,
  mediaUrl?: string,
  firstComment?: string,
  syncInstagram?: boolean
): Promise<{ success: boolean; url?: string; error?: string }> => {
  
  if (!pageId || !token) {
     return { success: false, error: '未設定 Page ID 或 Token' };
  }

  try {
    let postId: string;

    // 1. 發布主貼文
    if (mediaUrl) {
      const isBase64 = mediaUrl.startsWith('data:');
      const isVideo = mediaUrl.includes('.mp4') || mediaUrl.startsWith('data:video');

      if (isBase64) {
          postId = await uploadBase64Media(pageId, token, message, mediaUrl, isVideo);
      } else if (mediaUrl.startsWith('http')) {
          postId = await uploadUrlMedia(pageId, token, message, mediaUrl, isVideo);
      } else {
          const res = await graphApi(`${pageId}/feed`, token, 'POST', { message });
          postId = res.id;
      }
    } else {
      const res = await graphApi(`${pageId}/feed`, token, 'POST', { message });
      postId = res.id;
    }

    // 2. 發布第一則留言 (可選)
    if (firstComment && postId) {
      try {
        await graphApi(`${postId}/comments`, token, 'POST', { message: firstComment });
      } catch (e) { 
          console.warn("留言發布失敗", e); 
      }
    }

    // 3. 同步至 Instagram
    const igMsg = await performInstagramSync(pageId, token, mediaUrl || '', message, syncInstagram);

    return { 
      success: true, 
      url: `https://facebook.com/${postId}`,
      error: igMsg ? `發布成功${igMsg}` : undefined 
    };

  } catch (e: any) {
    return { success: false, error: e.message || "未知發布錯誤" };
  }
};

export const fetchPageAnalytics = async (pageId: string, token?: string): Promise<AnalyticsData | null> => {
  if (!pageId || !token) return null; 
  try {
    const pageInfo = await graphApi(`${pageId}?fields=followers_count`, token);
    const reachData = await graphApi(`${pageId}/insights?metric=page_impressions_unique&period=days_28`, token);
    const engageData = await graphApi(`${pageId}/insights?metric=page_engaged_users&period=days_28`, token);
    
    const reach = reachData.data?.[0]?.values?.[0]?.value || 0;
    const engaged = engageData.data?.[0]?.values?.[0]?.value || 0;

    return {
      followers: pageInfo.followers_count || 0,
      followersGrowth: 0,
      reach: reach,
      engagementRate: reach > 0 ? Number(((engaged / reach) * 100).toFixed(2)) : 0,
      period: '過去 28 天'
    };
  } catch (e) {
    throw e;
  }
};

export const fetchPageTopPosts = async (pageId: string, token: string): Promise<{ topReach?: TopPostData, topEngagement?: TopPostData }> => {
    try {
        const fields = 'id,message,created_time,full_picture,permalink_url,insights.metric(post_impressions_unique,post_engaged_users)';
        const res = await graphApi(`${pageId}/feed?limit=15&fields=${fields}`, token);
        const posts = res.data || [];

        if (posts.length === 0) return {};

        const processed = posts.map((p: any) => {
            const insights = p.insights?.data || [];
            return {
                id: p.id,
                message: p.message || '',
                imageUrl: p.full_picture,
                created_time: p.created_time,
                permalink_url: p.permalink_url,
                reach: insights.find((m: any) => m.name === 'post_impressions_unique')?.values?.[0]?.value || 0,
                engagedUsers: insights.find((m: any) => m.name === 'post_engaged_users')?.values?.[0]?.value || 0
            };
        });

        return {
            topReach: [...processed].sort((a, b) => b.reach - a.reach)[0],
            topEngagement: [...processed].sort((a, b) => b.engagedUsers - a.engagedUsers)[0]
        };
    } catch (e) {
        return {};
    }
};

export const fetchRecentPostCaptions = async (pageId: string, token: string, limit = 20): Promise<string[]> => {
    const res = await graphApi(`${pageId}/feed?fields=message&limit=${limit}`, token);
    return (res.data || []).map((p: any) => p.message).filter(Boolean);
};

export const refreshLongLivedToken = async (currentToken: string): Promise<{ success: boolean; newToken?: string; expiry?: number }> => {
    return { success: false }; // 需在後端實作 App Secret 交換
};
