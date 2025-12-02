

import { AnalyticsData, TopPostData } from "../types";

const FB_API_VERSION = 'v17.0'; 

// --- Helper for FB Graph API ---
const graphApi = async (endpoint: string, token: string, method = 'GET', body?: any) => {
  const url = `https://graph.facebook.com/${FB_API_VERSION}/${endpoint}`;
  
  // Corrected: Do not set Content-Type for GET requests to avoid browser/CORS issues
  const headers: HeadersInit = {};
  if (method !== 'GET' && method !== 'HEAD') {
      (headers as any)['Content-Type'] = 'application/json';
  }

  const fullUrl = `${url}${url.includes('?') ? '&' : '?'}access_token=${token}`;

  const options: RequestInit = {
    method,
    headers,
  };

  // Only attach body for non-GET/HEAD requests
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

// --- Helper to convert Base64 to Blob for Upload ---
const base64ToBlob = async (base64: string): Promise<Blob> => {
  const res = await fetch(base64);
  return await res.blob();
};

export const validateFacebookToken = async (token: string): Promise<boolean> => {
  if (!token) return false;
  try {
    // Call /me to validate token
    await graphApi('me', token);
    return true;
  } catch (e) {
    return false;
  }
};

export const publishPostToFacebook = async (
  pageId: string,
  token: string,
  message: string,
  mediaUrl?: string,
  firstComment?: string
): Promise<{ success: boolean; url?: string; error?: string }> => {
  
  if (!pageId || !token) {
     return { success: false, error: '未設定 Page ID 或 Token' };
  }

  try {
    let postId;

    // 1. Post logic
    if (mediaUrl) {
      const isBase64 = mediaUrl.startsWith('data:');
      const isVideoUrl = mediaUrl.includes('.mp4') || mediaUrl.startsWith('data:video');
      
      const endpoint = isVideoUrl ? `${pageId}/videos` : `${pageId}/photos`;

      if (isBase64) {
        // --- STRATEGY A: Direct Upload (Multipart) for Base64 ---
        try {
            const blob = await base64ToBlob(mediaUrl);
            const formData = new FormData();
            formData.append('access_token', token);
            formData.append('message', message);
            formData.append('source', blob);
            
            const uploadUrl = `https://graph.facebook.com/${FB_API_VERSION}/${endpoint}`;
            const res = await fetch(uploadUrl, {
                method: 'POST',
                body: formData
            });
            
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            postId = data.id || data.post_id;

        } catch (uploadError: any) {
            console.error("Image upload failed, falling back to text only:", uploadError);
            const res = await graphApi(`${pageId}/feed`, token, 'POST', { 
                message: `${message}\n\n(註：圖片上傳失敗 - ${uploadError.message || '格式錯誤'})` 
            });
            postId = res.id;
        }

      } else if (mediaUrl.startsWith('http')) {
        // --- STRATEGY B: URL Upload for Hosted Media ---
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
      // Text only
      const res = await graphApi(`${pageId}/feed`, token, 'POST', { message });
      postId = res.id;
    }

    // 2. First Comment Logic
    if (firstComment && postId) {
      try {
        await graphApi(`${postId}/comments`, token, 'POST', { message: firstComment });
      } catch (e) {
        console.warn("Failed to post first comment", e);
      }
    }

    return { 
      success: true, 
      url: `https://facebook.com/${postId}` 
    };

  } catch (e: any) {
    return { success: false, error: e.message || "發布失敗" };
  }
};

// --- Real Analytics ---

export const fetchPageAnalytics = async (pageId: string, token?: string): Promise<AnalyticsData | null> => {
  if (!pageId || !token) return null; 

  try {
    // 1. Get Page Info (Followers)
    const pageInfo = await graphApi(`${pageId}?fields=followers_count`, token, 'GET');
    const followers = pageInfo.followers_count || 0;
    
    // 2. Get Insights - Fetched individually to prevent total failure
    let reach = 0;
    let engagedUsers = 0;

    // A. Fetch Reach (Unique Impressions)
    try {
        const reachData = await graphApi(
            `${pageId}/insights?metric=page_impressions_unique&period=days_28`, 
            token, 
            'GET'
        );
        reach = reachData.data?.[0]?.values?.[0]?.value || 0;
    } catch (e) {
        console.warn("FB Analytics: Reach fetch failed (ignoring)", e);
    }

    // B. Fetch Engagement (Engaged Users)
    try {
        const engageData = await graphApi(
            `${pageId}/insights?metric=page_engaged_users&period=days_28`, 
            token, 
            'GET'
        );
        engagedUsers = engageData.data?.[0]?.values?.[0]?.value || 0;
    } catch (e) {
         console.warn("FB Analytics: Engaged Users fetch failed (ignoring)", e);
    }
    
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

/**
 * Fetches recent posts and identifies the ones with highest reach and engagement.
 * Limit to last 15 posts to avoid API timeouts.
 */
export const fetchPageTopPosts = async (pageId: string, token: string): Promise<{ topReach?: TopPostData, topEngagement?: TopPostData }> => {
    try {
        // Fetch last 15 posts with basic fields and INSIGHTS in a nested request
        // metric: post_impressions_unique (Reach), post_engaged_users (Engagement)
        const fields = 'id,message,created_time,full_picture,permalink_url,insights.metric(post_impressions_unique,post_engaged_users)';
        const feedUrl = `${pageId}/feed?limit=15&fields=${fields}`;
        
        const res = await graphApi(feedUrl, token, 'GET');
        const posts = res.data || [];

        if (posts.length === 0) return {};

        const processedPosts: TopPostData[] = posts.map((p: any) => {
            // Safe extraction of metrics from nested data structure
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
                type: 'reach' // placeholder
            };
        });

        // Find Top Reach
        const sortedByReach = [...processedPosts].sort((a, b) => b.reach - a.reach);
        const topReachPost = sortedByReach[0];
        if (topReachPost) topReachPost.type = 'reach';

        // Find Top Engagement
        const sortedByEngagement = [...processedPosts].sort((a, b) => b.engagedUsers - a.engagedUsers);
        const topEngagePost = sortedByEngagement[0];
        if (topEngagePost) topEngagePost.type = 'engagement';

        // If same post is top for both, that's fine.
        return {
            topReach: topReachPost,
            topEngagement: topEngagePost
        };

    } catch (e) {
        console.warn("Failed to fetch top posts details", e);
        return {};
    }
};

export const refreshLongLivedToken = async (currentToken: string): Promise<{ success: boolean; newToken?: string; expiry?: number }> => {
    // This usually requires App ID / App Secret on backend. 
    // Client-side refresh is limited.
    console.error("Token refresh requires backend.");
    return { success: false };
};