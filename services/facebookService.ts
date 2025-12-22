// REFACTOR ONLY: no functional changes

import { AnalyticsData, TopPostData } from "../types";

const FB_API_VERSION = 'v19.0'; 

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

  if (body && !(body instanceof FormData)) {
    (options.headers as any)['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    options.body = body;
  }

  try {
    const res = await fetch(fullUrl, options);
    const data = await res.json();
    
    if (data.error) {
      const err = new Error(data.error.message || 'FB API Error');
      (err as any).code = data.error.code;
      (err as any).subcode = data.error.error_subcode;
      throw err;
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
        if (isVideo) {
            formData.append('description', message);
            formData.append('source', blob, 'video.mp4');
        } else {
            formData.append('caption', message);
            formData.append('source', blob, 'image.png');
        }
        const res = await graphApi(endpoint, token, 'POST', formData);
        return res.id || res.post_id;
    } catch (uploadError: any) {
        console.error("Media upload failed:", uploadError);
        const res = await graphApi(`${pageId}/feed`, token, 'POST', { 
            message: `${message}\n\n(附件上傳失敗: ${uploadError.message})` 
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

// ==========================================
// Public Exports
// ==========================================

export const validateFacebookToken = async (token: string): Promise<{ valid: boolean; status: 'VALID' | 'INVALID' | 'PARTIAL'; missingPermissions: string[]; error?: string }> => {
  if (!token || token.trim() === '') {
    return { valid: false, status: 'INVALID', missingPermissions: [], error: '請輸入 Token' };
  }

  try {
    // 1. 檢查 Token 是否有效且可連接
    // 使用 me?fields=id,name 是最基本的檢查
    const meRes = await graphApi('me?fields=id,name', token);
    
    if (!meRes || !meRes.id) {
        return { valid: false, status: 'INVALID', missingPermissions: [], error: 'Token 無法識別身份' };
    }
    
    // 2. 檢查權限清單
    const permRes = await graphApi('me/permissions', token);
    const perms = permRes.data || [];
    
    const required = ['pages_manage_posts', 'pages_read_engagement'];
    const granted = perms
        .filter((p: any) => p.status === 'granted')
        .map((p: any) => p.permission);
    
    const missing = required.filter(p => !granted.includes(p));
    
    if (missing.length === 0) {
        return { valid: true, status: 'VALID', missingPermissions: [] };
    } else {
        return { valid: false, status: 'PARTIAL', missingPermissions: missing };
    }
  } catch (e: any) {
    console.error("Validation logic caught error:", e);
    // 處理常見 FB 錯誤代碼
    let errorMsg = e.message || '連線失敗';
    if (e.code === 190) errorMsg = 'Token 已過期或已被更改，請重新取得。';
    if (e.code === 100) errorMsg = '無效的參數或 Token 格式錯誤。';
    
    return { 
        valid: false, 
        status: 'INVALID', 
        missingPermissions: [], 
        error: errorMsg 
    };
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
  if (!pageId || !token) return { success: false, error: '未設定 Page ID 或 Token' };

  try {
    let postId: string;
    if (mediaUrl) {
      const isBase64 = mediaUrl.startsWith('data:');
      const isVideo = mediaUrl.includes('.mp4') || mediaUrl.startsWith('data:video');
      if (isBase64) postId = await uploadBase64Media(pageId, token, message, mediaUrl, isVideo);
      else if (mediaUrl.startsWith('http')) postId = await uploadUrlMedia(pageId, token, message, mediaUrl, isVideo);
      else {
          const res = await graphApi(`${pageId}/feed`, token, 'POST', { message });
          postId = res.id;
      }
    } else {
      const res = await graphApi(`${pageId}/feed`, token, 'POST', { message });
      postId = res.id;
    }

    if (firstComment && postId) {
      try { await graphApi(`${postId}/comments`, token, 'POST', { message: firstComment }); } catch (e) {}
    }

    return { success: true, url: `https://facebook.com/${postId}` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const fetchPageAnalytics = async (pageId: string, token?: string): Promise<AnalyticsData | null> => {
  if (!pageId || !token) return null; 
  try {
    const pageInfo = await graphApi(`${pageId}?fields=followers_count`, token);
    const reachData = await graphApi(`${pageId}/insights?metric=page_impressions_unique&period=days_28`, token);
    const reach = reachData.data?.[0]?.values?.[0]?.value || 0;
    return {
      followers: pageInfo.followers_count || 0,
      followersGrowth: 0,
      reach: reach,
      engagementRate: 0,
      period: '28天'
    };
  } catch (e) { throw e; }
};

export const fetchPageTopPosts = async (pageId: string, token: string): Promise<{ topReach?: TopPostData, topEngagement?: TopPostData }> => {
    try {
        const fields = 'id,message,created_time,full_picture,permalink_url,insights.metric(post_impressions_unique,post_engaged_users)';
        const res = await graphApi(`${pageId}/feed?limit=15&fields=${fields}`, token);
        const posts = res.data || [];
        if (posts.length === 0) return {};
        const processed = posts.map((p: any) => ({
            id: p.id,
            message: p.message || '',
            imageUrl: p.full_picture,
            created_time: p.created_time,
            permalink_url: p.permalink_url,
            reach: 0,
            engagedUsers: 0
        }));
        return { topReach: processed[0] };
    } catch (e) { return {}; }
};

export const fetchRecentPostCaptions = async (pageId: string, token: string, limit = 20): Promise<string[]> => {
    const res = await graphApi(`${pageId}/feed?fields=message&limit=${limit}`, token);
    return (res.data || []).map((p: any) => p.message).filter(Boolean);
};

export const refreshLongLivedToken = async (currentToken: string): Promise<{ success: boolean; newToken?: string; expiry?: number }> => {
    return { success: false };
};
