
import { useState, useEffect } from 'react';
import { BrandSettings, AnalyticsData, TopPostData } from '../../../types';
import { fetchPageAnalytics, fetchPageTopPosts } from '../../../services/facebookService';
import { callBackend } from '../../../services/gemini/core';
import { checkAndUseQuota, getCurrentUser } from '../../../services/authService';

export const useAnalytics = (settings: BrandSettings) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'strategy' | 'competitor'>('overview');
    
    // Data State
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [topPosts, setTopPosts] = useState<{ topReach?: TopPostData, topEngagement?: TopPostData } | null>(null);
    const [loadingStats, setLoadingStats] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    // Strategy AI State
    const [aiInsight, setAiInsight] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Competitor AI State
    const [competitorName, setCompetitorName] = useState('');
    const [compAnalysis, setCompAnalysis] = useState<string>('');
    const [isCompAnalyzing, setIsCompAnalyzing] = useState(false);

    useEffect(() => {
        if (settings.facebookPageId && settings.facebookToken) {
            loadData();
        }
    }, [settings.facebookPageId, settings.facebookToken]);

    const loadData = async () => {
        setLoadingStats(true);
        try {
            const data = await fetchPageAnalytics(settings.facebookPageId, settings.facebookToken);
            setAnalytics(data);
            const top = await fetchPageTopPosts(settings.facebookPageId, settings.facebookToken);
            setTopPosts(top);
        } catch (e: any) {
            setErrorMsg(e.message);
        } finally {
            setLoadingStats(false);
        }
    };

    const generateAiInsight = async () => {
        if (!analytics) return;
        
        const user = getCurrentUser();
        // Quota check logic is usually handled in UI or here. 
        // Assuming free for analysis or minimal cost logic if needed.
        // For simplicity, we just check generic quota if user exists.
        if (user) {
             // Optional: Add quota cost here if business requirement changes
        }

        setIsAnalyzing(true);
        
        const context = `
          Brand Industry: ${settings.industry}
          Total Followers: ${analytics.followers}
          Reach (28 Days): ${analytics.reach}
          Total Impressions: ${analytics.impressions}
          Engagement Rate: ${analytics.engagementRate}%
          Negative Feedback: ${analytics.negativeFeedback}
          Demographics Top 3: ${analytics.demographics?.slice(0,3).map(d => `${d.gender}${d.ageGroup}`).join(', ')}
        `;
  
        try {
            const res = await callBackend('generateContent', {
                model: 'gemini-2.5-flash',
                contents: `
                  Role: Senior Social Media Growth Hacker & Data Analyst.
                  Task: Analyze the Facebook page data for a "${settings.industry}" brand in Taiwan.
                  
                  [Data Context]
                  ${context}
  
                  [Output Format]
                  Please output the report in strict **Markdown** format with the following structure (Use Traditional Chinese):
  
                  ### 🩺 營運健康度診斷 (Executive Summary)
                  (Give a score out of 100 and a 2-sentence summary of the page's current health.)
  
                  ### 👥 受眾與流量洞察 (Audience & Reach)
                  (Analyze the reach vs. followers ratio and demographics. What does this mean for content direction?)
  
                  ### 🔥 互動優化策略 (Engagement Strategy)
                  (Based on the ${analytics.engagementRate}% engagement rate, suggest specific content types to improve stickiness.)
  
                  ### 🚀 本週行動清單 (Action Plan)
                  (Provide 3 bullet points of specific, actionable tasks to do this week.)
  
                  *Style: Professional, encouraging, data-driven. Use bolding for key metrics.*
                `
            });
            setAiInsight(res.text || '無法生成建議');
        } catch (e) {
            setAiInsight('分析失敗，請稍後再試。');
        } finally {
            setIsAnalyzing(false);
        }
    };
  
    const analyzeCompetitor = async () => {
        if (!competitorName.trim()) return alert("請輸入競爭對手品牌名稱");
        
        const user = getCurrentUser();
        if (user) {
             const allowed = await checkAndUseQuota(user.uid, 5, 'COMPETITOR_ANALYSIS');
             if (!allowed) return;
        }

        setIsCompAnalyzing(true);
        
        try {
            const res = await callBackend('generateContent', {
                model: 'gemini-3-flash-preview', // Use smarter model
                contents: `
                  Role: Business Strategy Consultant. 
                  Task: Analyze the social media strategy of competitor "${competitorName}" in the ${settings.industry} industry (Taiwan market).
                  
                  Search for their recent public activities, tone of voice, or general brand reputation.
                  Compare it with my brand (${settings.brandName || 'My Brand'}).
                  
                  [Output Format]
                  Please output in **Markdown**:
  
                  ### ⚔️ 對手戰力分析 (Competitor Profile)
                  (Brief summary of their brand positioning and recent moves.)
  
                  ### 💎 核心優勢 (Their Strengths)
                  (What are they doing better? Content types? visuals?)
  
                  ### 💡 我方破局策略 (Winning Strategy)
                  (3 specific ways to differentiate and win market share.)
                `,
                config: { tools: [{ googleSearch: {} }] }
            });
            setCompAnalysis(res.text || '無法分析');
        } catch (e: any) {
            alert(`分析失敗: ${e.message}`);
        } finally {
            setIsCompAnalyzing(false);
        }
    };

    return {
        activeTab, setActiveTab,
        analytics, topPosts,
        loadingStats, errorMsg, loadData,
        aiInsight, isAnalyzing, generateAiInsight,
        competitorName, setCompetitorName, compAnalysis, isCompAnalyzing, analyzeCompetitor
    };
};
