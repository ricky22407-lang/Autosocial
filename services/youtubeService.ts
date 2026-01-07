
import { isMock } from './firebase';

declare global {
  interface Window {
    google: any;
  }
}

export const YouTubeService = {
    /**
     * Execute Google OAuth for YouTube
     */
    authenticate: async (): Promise<string> => {
        // Helper to get Env safely
        const getGoogleClientId = () => {
            const env = (import.meta as any).env || {};
            return env.VITE_GOOGLE_CLIENT_ID || env.REACT_APP_GOOGLE_CLIENT_ID || '';
        };

        const clientId = getGoogleClientId();
        
        // STRICT MODE: If client ID is missing, throw error instead of mocking
        if (!clientId) {
            throw new Error("環境變數未設定 VITE_GOOGLE_CLIENT_ID。\n\n請至 Google Cloud Console 建立 OAuth Client ID 並設定於 .env 檔案中。");
        }

        // Return a promise that resolves when the popup flow finishes
        return new Promise((resolve, reject) => {
            try {
                // Ensure Google Identity Services script is loaded
                if (typeof window.google === 'undefined' || !window.google.accounts) {
                    throw new Error("Google Identity Services script not loaded. (請確認 index.html 包含 accounts.google.com/gsi/client)");
                }

                const client = window.google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: 'https://www.googleapis.com/auth/youtube.readonly',
                    callback: (response: any) => {
                        if (response.access_token) {
                            resolve(response.access_token);
                        } else {
                            reject(new Error("Google Auth Failed or Cancelled"));
                        }
                    },
                });
                
                // Trigger Popup
                client.requestAccessToken();
                
            } catch (e: any) {
                console.error("[YouTube Auth Error]", e);
                reject(e);
            }
        });
    },

    /**
     * Fetch Channel Statistics
     */
    fetchChannelStats: async (token: string) => {
        // If user managed to pass a mock token manually (shouldn't happen with strict mode), fail or handle gracefully.
        if (token.startsWith('mock_')) {
            throw new Error("Invalid Token: Mock token detected in strict mode.");
        }

        try {
            // 1. Get Channel ID (Mine)
            const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true&access_token=${token}`);
            
            if (!channelRes.ok) {
                const errData = await channelRes.json();
                throw new Error(errData.error?.message || "YouTube API Request Failed");
            }

            const channelData = await channelRes.json();

            if (!channelData.items || channelData.items.length === 0) {
                throw new Error("找不到 YouTube 頻道 (請確認您登入的 Google 帳號已建立頻道)");
            }

            const item = channelData.items[0];
            const stats = item.statistics;
            const title = item.snippet.title;

            // 2. Fetch Recent Videos for Engagement Calculation (Last 10 videos)
            const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads;
            let avgEngagement = 0;
            let avgViews = 0;

            if (uploadsPlaylistId) {
                const videosRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=10&access_token=${token}`);
                const videosData = await videosRes.json();
                
                if (videosData.items && videosData.items.length > 0) {
                    const videoIds = videosData.items.map((v: any) => v.contentDetails.videoId).join(',');
                    const statsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&access_token=${token}`);
                    const statsData = await statsRes.json();
                    
                    const totalStats = (statsData.items || []).reduce((acc: any, curr: any) => {
                        return {
                            views: acc.views + parseInt(curr.statistics.viewCount || 0),
                            likes: acc.likes + parseInt(curr.statistics.likeCount || 0),
                            comments: acc.comments + parseInt(curr.statistics.commentCount || 0)
                        };
                    }, { views: 0, likes: 0, comments: 0 });

                    const count = statsData.items.length;
                    if (count > 0) {
                        avgViews = Math.round(totalStats.views / count);
                        // Engagement: (Likes+Comments)/Views * 100
                        if (totalStats.views > 0) {
                            avgEngagement = parseFloat((((totalStats.likes + totalStats.comments) / totalStats.views) * 100).toFixed(2));
                        }
                    }
                }
            }

            return {
                title: title,
                subscriberCount: parseInt(stats.subscriberCount),
                videoCount: parseInt(stats.videoCount),
                viewCount: parseInt(stats.viewCount),
                avgEngagement: avgEngagement,
                avgViews: avgViews
            };

        } catch (e: any) {
            console.error("YouTube API Error", e);
            throw new Error(e.message || "YouTube 資料讀取失敗");
        }
    }
};
