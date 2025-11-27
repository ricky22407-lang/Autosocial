import { AnalyticsData, CompetitorPost } from "../types";

// --- Helper for FB Graph API ---
const graphApi = async (endpoint: string, token: string, method = 'GET', body?: any) => {
  const url = `https://graph.facebook.com/v19.0/${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };
  const fullUrl = `${url}${url.includes('?') ? '&' : '?'}access_token=${token}`;

  try {
    const res = await fetch(fullUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    return data;
  } catch (error: any) {
    console.error("FB API Error:", error);
    throw error;
  }
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
      // Determines endpoint based on media type (basic detection)
      const isVideo = mediaUrl.startsWith('data:video') || mediaUrl.includes('.mp4');
      const endpoint = isVideo ? `${pageId}/videos` : `${pageId}/photos`;
      
      // Note: Sending Base64 directly to FB API often requires FormData or specific handling usually done server-side.
      // For URL (from Veo), we can pass 'url'. For Base64, we might fail in pure client-side without converting to Blob.
      // We will assume `url` parameter for simplicity if it's a link, or `url` for hosted images.
      
      const payload: any = { message };
      if (mediaUrl.startsWith('http')) {
        payload.url = mediaUrl;
      } else {
        // Fallback for base64: In a real app, upload to a storage bucket first, then pass URL.
        // Direct base64 upload to Graph API is complex via simple fetch JSON.
        // We will try simulating success for base64 to avoid total breakage in this demo env, 
        // but warn user.
        console.warn("Direct Base64 upload to FB from client is unstable. In production, upload to storage first.");
        // Attempting to use 'url' param anyway might fail.
        payload.url = mediaUrl; 
      }

      const res = await graphApi(endpoint, token, 'POST', payload);
      postId = res.id || res.post_id;

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
  if (!pageId || !token) return null; // Enforce real data rule

  try {
    // 1. Get Page Info (Followers)
    const pageInfo = await graphApi(pageId, token, 'GET', '?fields=followers_count');
    
    // 2. Get Insights (Reach, Engagement) - Requires 'read_insights' permission
    // Trying to fetch simplified insights. 
    // metric=page_impressions,page_post_engagements
    // period=days_28
    
    const insights = await graphApi(`${pageId}/insights`, token, 'GET', '?metric=page_impressions,page_post_engagements&period=days_28');
    
    const followers = pageInfo.followers_count || 0;
    const impressions = insights.data?.find((d: any) => d.name === 'page_impressions')?.values[0]?.value || 0;
    const engagements = insights.data?.find((d: any) => d.name === 'page_post_engagements')?.values[0]?.value || 0;
    
    const engagementRate = impressions > 0 ? ((engagements / impressions) * 100).toFixed(2) : 0;

    return {
      followers,
      followersGrowth: 0, // Difficult to calculate without historical DB
      reach: impressions,
      engagementRate: Number(engagementRate),
      period: '過去 28 天 (API 真實數據)'
    };
  } catch (e) {
    console.error("Analytics fetch failed", e);
    throw new Error("無法取得數據，請確認 Token 權限包含 read_insights, pages_read_engagement");
  }
};

export const fetchCompetitorTopPosts = async (competitors: string[]): Promise<CompetitorPost[]> => {
  // Real implementation note: 
  // You CANNOT fetch other pages' posts via Graph API easily without specific permissions (Page Public Content Access) 
  // which requires strict App Review.
  // For this demo to work "for real", we can only fetch PUBLIC pages if the token allows, 
  // but usually this returns empty or error for standard tokens.
  
  // We will return an empty array to signify "No Data" rather than fake data, per instructions.
  return []; 
};

export const refreshLongLivedToken = async (currentToken: string): Promise<{ success: boolean; newToken?: string; expiry?: number }> => {
    // Client-side token exchange is possible but exposing App Secret is DANGEROUS.
    // We should NOT do this in client-side code.
    // Returning error to force user to handle this securely or manually.
    console.error("Token refresh requires backend.");
    return { success: false };
};
