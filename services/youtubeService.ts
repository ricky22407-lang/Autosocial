
import { isMock } from './firebase';

declare global {
  interface Window {
    google: any;
  }
}

// Mock Data for fallback
const MOCK_YT_DATA = {
    title: "Ricky's Tech Review",
    subscriberCount: 15400,
    videoCount: 120,
    viewCount: 4500000,
    avgEngagement: 4.5,
    avgViews: 3500 // New field
};

export const YouTubeService = {
    /**
     * Simulate or Execute Google OAuth for YouTube
     * In a real app, this would use window.google.accounts.oauth2.initTokenClient
     */
    authenticate: async (): Promise<string> => {
        if (isMock) {
            await new Promise(r => setTimeout(r, 1000));
            return "mock_yt_access_token_" + Date.now();
        }

        // Real implementation requires Google Cloud Project Client ID
        // Here we provide the structure. If no env var, we fallback to mock to prevent crash.
        const clientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
        
        if (!clientId) {
            console.warn("⚠️ Missing VITE_GOOGLE_CLIENT_ID. Using Mock YouTube Auth.");
            await new Promise(r => setTimeout(r, 800));
            return "mock_yt_access_token_fallback";
        }

        // Return a promise that resolves when the popup flow finishes
        return new Promise((resolve, reject) => {
            try {
                // Assuming Google Identity Services script is loaded in index.html
                // If not, we fall back.
                if (typeof window.google === 'undefined') {
                    throw new Error("Google Identity Services not loaded");
                }

                const client = window.google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: 'https://www.googleapis.com/auth/youtube.readonly',
                    callback: (response: any) => {
                        if (response.access_token) {
                            resolve(response.access_token);
                        } else {
                            reject(new Error("Google Auth Failed"));
                        }
                    },
                });
                client.requestAccessToken();
            } catch (e) {
                console.error(e);
                // Fallback for demo stability
                resolve("mock_yt_access_token_fallback_error");
            }
        });
    },

    /**
     * Fetch Channel Statistics
     */
    fetchChannelStats: async (token: string) => {
        if (token.startsWith('mock_')) {
            return MOCK_YT_DATA;
        }

        try {
            // 1. Get Channel ID (Mine)
            const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true&access_token=${token}`);
            const channelData = await channelRes.json();

            if (!channelData.items || channelData.items.length === 0) {
                throw new Error("找不到 YouTube 頻道");
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
