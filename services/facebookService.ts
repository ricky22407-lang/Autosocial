
// REFACTOR ONLY: no functional changes

import { AnalyticsData, TopPostData, DemographicData } from "../types";

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
    const meRes = await graphApi('me?fields=id,name,category', cleanToken);
    
    if (!meRes || !meRes.id) {
        return { valid: false, status: 'INVALID', missingPermissions: [], error: '無法識別身份' };
    }

    const isPageToken = !!meRes.category;
    
    if (isPageToken) {
        return { 
            valid: true, 
            status: 'VALID', 
            missingPermissions: [], 
            debugInfo: { ...meRes, type: 'Page Token' } 
        };
    }
    
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
  syncInstagram?: boolean,
  scheduledTime?: number
): Promise<{ success: boolean; url?: string; error?: string }> => {
  if (!pageId || !token) return { success: false, error: '未設定 Page ID 或 Token' };

  try {
    let postId: string;
    const cleanToken = token.trim();
    
    const schedulingParams: any = {};
    if (scheduledTime) {
        schedulingParams.published = false;
        schedulingParams.scheduled_publish_time = scheduledTime;
    }

    if (mediaUrl) {
      const isBase64 = mediaUrl.startsWith('data:');
      const isVideo = mediaUrl.includes('.mp4') || mediaUrl.startsWith('data:video');
      
      if (isBase64) {
          const blob = await base64ToBlob(mediaUrl);
          const formData = new FormData();
          
          if (scheduledTime) {
              formData.append('published', 'false');
              formData.append('scheduled_publish_time', scheduledTime.toString());
          }

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
          const payload: any = isVideo ? 
            { description: message, file_url: mediaUrl, ...schedulingParams } : 
            { caption: message, url: mediaUrl, ...schedulingParams };
            
          const res = await graphApi(endpoint, cleanToken, 'POST', payload);
          postId = res.id || res.post_id;
      }
    } else {
      const res = await graphApi(`${pageId}/feed`, cleanToken, 'POST', { message, ...schedulingParams });
      postId = res.id;
    }

    if (firstComment && postId && !scheduledTime) {
      try { await graphApi(`${postId}/comments`, cleanToken, 'POST', { message: firstComment }); } catch (e) {}
    }

    return { success: true, url: `https://facebook.com/${postId}` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const reschedulePost = async (
    postId: string, 
    token: string, 
    newTime: number
): Promise<{ success: boolean; error?: string }> => {
    try {
        await graphApi(postId, token, 'POST', {
            published: false,
            scheduled_publish_time: newTime
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const deleteFbPost = async (
    postId: string, 
    token: string
): Promise<{ success: boolean; error?: string }> => {
    try {
        await graphApi(postId, token, 'DELETE');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const fetchPageAnalytics = async (pageId: string, token?: string): Promise<AnalyticsData | null> => {
  if (!pageId || !token) return null; 
  const cleanToken = token.trim();
  try {
    // 1. Basic Info
    const pageInfo = await graphApi(`${pageId}?fields=followers_count,fan_count`, cleanToken);
    
    // 2. Metrics (Insights)
    // - page_impressions_unique: 28 Days Reach
    // - page_impressions: Total Views
    // - page_negative_feedback: Hides/Spam
    // - page_fans_gender_age: Demographics
    const metrics = 'page_impressions_unique,page_impressions,page_negative_feedback,page_fans_gender_age';
    const insights = await graphApi(`${pageId}/insights?metric=${metrics}&period=days_28`, cleanToken);
    
    const dataMap: any = {};
    insights.data?.forEach((item: any) => {
        // Get the most recent value (last in array usually)
        dataMap[item.name] = item.values?.[item.values.length - 1]?.value || 0;
    });

    const reach = dataMap['page_impressions_unique'] || 0;
    const impressions = dataMap['page_impressions'] || 0;
    const negative = dataMap['page_negative_feedback'] || 0;
    const rawDemo = dataMap['page_fans_gender_age'] || {};

    // 3. Process Demographics
    // Format: { "F.18-24": 10, "M.25-34": 5 }
    const demographics: DemographicData[] = [];
    Object.keys(rawDemo).forEach(key => {
        const parts = key.split('.'); // [Gender, AgeRange]
        if (parts.length === 2) {
            demographics.push({
                gender: parts[0] as any,
                ageGroup: parts[1],
                value: rawDemo[key]
            });
        }
    });
    // Sort by value desc
    demographics.sort((a, b) => b.value - a.value);

    // 4. Calculate Engagement (Approximate from top posts, can also query page_post_engagements)
    // Note: Engagement Rate = (Engaged Users / Reach) * 100 or similar
    let engagementRate = 0;
    try {
        const engMetric = await graphApi(`${pageId}/insights?metric=page_post_engagements&period=days_28`, cleanToken);
        const engagements = engMetric.data?.[0]?.values?.[0]?.value || 0;
        if (reach > 0) engagementRate = parseFloat(((engagements / reach) * 100).toFixed(2));
    } catch (e) {}

    return {
      followers: pageInfo.followers_count || pageInfo.fan_count || 0,
      followersGrowth: 0,
      reach: reach,
      impressions: impressions,
      engagementRate: engagementRate,
      negativeFeedback: negative,
      demographics: demographics,
      period: '28天'
    };
  } catch (e) { throw e; }
};

export const fetchInstagramAnalytics = async (pageId: string, token: string): Promise<AnalyticsData | null> => {
    const cleanToken = token.trim();
    try {
        // 1. Get Connected IG Account
        const pageRes = await graphApi(`${pageId}?fields=instagram_business_account`, cleanToken);
        const igId = pageRes.instagram_business_account?.id;
        
        if (!igId) throw new Error("此粉專未連結 Instagram 商業帳號");

        // 2. Get IG Info
        const igRes = await graphApi(`${igId}?fields=followers_count,media_count`, cleanToken);
        
        // 3. Get Media for Engagement Calculation (Last 10 posts)
        let engagementRate = 0;
        try {
            const mediaRes = await graphApi(`${igId}/media?fields=like_count,comments_count&limit=10`, cleanToken);
            const posts = mediaRes.data || [];
            if (posts.length > 0) {
                const totalInteractions = posts.reduce((acc: number, curr: any) => acc + (curr.like_count || 0) + (curr.comments_count || 0), 0);
                // Engagement Rate = (Total Interactions / Posts) / Followers * 100
                const avgInteractions = totalInteractions / posts.length;
                engagementRate = parseFloat(((avgInteractions / igRes.followers_count) * 100).toFixed(2));
            }
        } catch(e) {}

        return {
            followers: igRes.followers_count || 0,
            followersGrowth: 0,
            reach: 0, 
            impressions: 0,
            negativeFeedback: 0,
            engagementRate: engagementRate,
            period: 'Instagram'
        };

    } catch (e: any) {
        console.error("IG Fetch Error", e);
        throw e;
    }
};

export const fetchPageTopPosts = async (pageId: string, token: string): Promise<{ topReach?: TopPostData, topEngagement?: TopPostData }> => {
    const cleanToken = token.trim();
    try {
        const fields = 'id,message,created_time,full_picture,permalink_url';
        // Get posts
        const res = await graphApi(`${pageId}/feed?limit=20&fields=${fields}`, cleanToken);
        const posts = res.data || [];
        if (posts.length === 0) return {};

        // For each post, get insights
        // Note: Batch request would be better but keeping simple for now
        const processed: TopPostData[] = [];
        
        await Promise.all(posts.map(async (p: any) => {
            try {
                // post_impressions_unique, post_engaged_users
                const insightRes = await graphApi(`${p.id}/insights?metric=post_impressions_unique,post_engaged_users`, cleanToken);
                const reach = insightRes.data?.find((m: any) => m.name === 'post_impressions_unique')?.values[0]?.value || 0;
                const engaged = insightRes.data?.find((m: any) => m.name === 'post_engaged_users')?.values[0]?.value || 0;
                
                processed.push({
                    id: p.id,
                    message: p.message || '',
                    imageUrl: p.full_picture,
                    created_time: p.created_time,
                    permalink_url: p.permalink_url,
                    reach,
                    engagedUsers: engaged
                });
            } catch(e) {}
        }));

        const sortedByReach = [...processed].sort((a,b) => b.reach - a.reach);
        const sortedByEng = [...processed].sort((a,b) => b.engagedUsers - a.engagedUsers);

        return { 
            topReach: sortedByReach[0],
            topEngagement: sortedByEng[0] 
        };
    } catch (e) { return {}; }
};

export const fetchRecentPostCaptions = async (pageId: string, token: string, limit = 20): Promise<string[]> => {
    const cleanToken = token.trim();
    const res = await graphApi(`${pageId}/feed?fields=message&limit=${limit}`, cleanToken);
    return (res.data || []).map((p: any) => p.message).filter(Boolean);
};
