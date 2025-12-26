
// REFACTOR ONLY: no functional changes

import { AnalyticsData, TopPostData } from "../types";

const FB_API_VERSION = 'v19.0'; 

// ==========================================
// Internal Helpers
// ==========================================

const graphApi = async (endpoint: string, token: string, method = 'GET', body?: any) => {
  const cleanToken = token.trim();
  const url = `https://graph.facebook.com/${FB_API_VERSION}/${endpoint}`;
  const fullUrl = `${url}${url.includes('?') ? '&' : '?'}access_token=${cleanToken}`;

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
      (err as any).fbError = data.error;
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

// ==========================================
// Public Exports
// ==========================================

export const validateFacebookToken = async (token: string): Promise<{ 
    valid: boolean; 
    status: 'VALID' | 'INVALID' | 'PARTIAL'; 
    missingPermissions: string[]; 
    error?: string;
    debugInfo?: any;
}> => {
  if (!token || token.trim() === '') {
    return { valid: false, status: 'INVALID', missingPermissions: [], error: '請輸入 Token' };
  }

  const cleanToken = token.trim();

  try {
    // 步驟 1: 基礎身份與類型檢查
    // 請求 metadata=1 可以知道這個 Token 的類型 (User 或 Page)
    const meRes = await graphApi('me?fields=id,name,category', cleanToken);
    
    if (!meRes || !meRes.id) {
        return { valid: false, status: 'INVALID', missingPermissions: [], error: '無法識別身份' };
    }

    // 如果有 category 欄位，代表這是一個 Page Token
    const isPageToken = !!meRes.category;
    
    if (isPageToken) {
        // Page Token 通常不支援 /me/permissions，但具備發文能力
        return { 
            valid: true, 
            status: 'VALID', 
            missingPermissions: [], 
            debugInfo: { ...meRes, type: 'Page Token' } 
        };
    }
    
    // 步驟 2: 用戶 Token 權限檢查
    let missing: string[] = [];
    try {
        const permRes = await graphApi('me/permissions', cleanToken);
        const perms = permRes.data || [];
        
        const required = ['pages_manage_posts', 'pages_read_engagement'];
        const granted = perms
            .filter((p: any) => p.status === 'granted')
            .map((p: any) => p.permission);
        
        missing = required.filter(p => !granted.includes(p));
    } catch (permErr) {
        return {
            valid: true,
            status: 'PARTIAL',
            missingPermissions: ['無法讀取詳細權限清單'],
            debugInfo: meRes
        };
    }
    
    return { 
        valid: true, 
        status: missing.length === 0 ? 'VALID' : 'PARTIAL', 
        missingPermissions: missing,
        debugInfo: meRes
    };

  } catch (e: any) {
    let errorMsg = e.message || '連線失敗';
    if (e.code === 190) errorMsg = 'Token 已失效或已過期。';
    return { valid: false, status: 'INVALID', missingPermissions: [], error: errorMsg, debugInfo: e.fbError };
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
    const cleanToken = token.trim();

    if (mediaUrl) {
      const isBase64 = mediaUrl.startsWith('data:');
      const isVideo = mediaUrl.includes('.mp4') || mediaUrl.startsWith('data:video');
      
      if (isBase64) {
          const blob = await base64ToBlob(mediaUrl);
          const formData = new FormData();
          if (isVideo) {
              formData.append('description', message);
              formData.append('source', blob, 'video.mp4');
              const res = await graphApi(`${pageId}/videos`, cleanToken, 'POST', formData);
              postId = res.id;
          } else {
              formData.append('caption', message);
              formData.append('source', blob, 'image.png');
              const res = await graphApi(`${pageId}/photos`, cleanToken, 'POST', formData);
              postId = res.id || res.post_id;
          }
      } else {
          const endpoint = isVideo ? `${pageId}/videos` : `${pageId}/photos`;
          const payload: any = isVideo ? { description: message, file_url: mediaUrl } : { caption: message, url: mediaUrl };
          const res = await graphApi(endpoint, cleanToken, 'POST', payload);
          postId = res.id || res.post_id;
      }
    } else {
      const res = await graphApi(`${pageId}/feed`, cleanToken, 'POST', { message });
      postId = res.id;
    }

    if (firstComment && postId) {
      try { await graphApi(`${postId}/comments`, cleanToken, 'POST', { message: firstComment }); } catch (e) {}
    }

    return { success: true, url: `https://facebook.com/${postId}` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const fetchPageAnalytics = async (pageId: string, token?: string): Promise<AnalyticsData | null> => {
  if (!pageId || !token) return null; 
  const cleanToken = token.trim();
  try {
    const pageInfo = await graphApi(`${pageId}?fields=followers_count`, cleanToken);
    // 降級處理：如果 insights 無法讀取，給予 0
    let reach = 0;
    try {
        const reachData = await graphApi(`${pageId}/insights?metric=page_impressions_unique&period=days_28`, cleanToken);
        reach = reachData.data?.[0]?.values?.[0]?.value || 0;
    } catch (e) { console.warn("Analytics reach fetch failed", e); }

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
    const cleanToken = token.trim();
    try {
        // 簡化欄位請求，移除可能報錯的 insights 指標
        const fields = 'id,message,created_time,full_picture,permalink_url';
        const res = await graphApi(`${pageId}/feed?limit=15&fields=${fields}`, cleanToken);
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
    const cleanToken = token.trim();
    const res = await graphApi(`${pageId}/feed?fields=message&limit=${limit}`, cleanToken);
    return (res.data || []).map((p: any) => p.message).filter(Boolean);
};
