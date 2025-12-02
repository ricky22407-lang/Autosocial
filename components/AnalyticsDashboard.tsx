

import React, { useState, useEffect } from 'react';
import { BrandSettings, AnalyticsData, TopPostData } from '../types';
import { fetchPageAnalytics, fetchPageTopPosts } from '../services/facebookService';
import { generateWeeklyReport } from '../services/geminiService';

interface Props {
  settings: BrandSettings;
}

const AnalyticsDashboard: React.FC<Props> = ({ settings }) => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [topPosts, setTopPosts] = useState<{ topReach?: TopPostData, topEngagement?: TopPostData } | null>(null);
  const [report, setReport] = useState<string>('');
  
  const [loadingStats, setLoadingStats] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    if (!settings.facebookPageId || !settings.facebookToken) {
        return;
    }
    loadData();
  }, [settings.facebookPageId, settings.facebookToken]);

  const loadData = async () => {
    setLoadingStats(true);
    setErrorMsg('');
    try {
      const data = await fetchPageAnalytics(settings.facebookPageId, settings.facebookToken);
      setAnalytics(data);
      
      const top = await fetchPageTopPosts(settings.facebookPageId, settings.facebookToken);
      setTopPosts(top);
    } catch (e: any) {
      setErrorMsg(e.message || "無法連線至 Facebook API");
    } finally {
      setLoadingStats(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!analytics) return;
    setGeneratingReport(true);
    try {
      const text = await generateWeeklyReport(analytics, settings, topPosts || undefined);
      setReport(text);
    } catch (e) {
      alert("生成週報失敗");
    } finally {
      setGeneratingReport(false);
    }
  };

  // Block View if no API Config
  if (!settings.facebookPageId || !settings.facebookToken) {
      return (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
              <div className="text-6xl mb-4">⚙️</div>
              <h2 className="text-2xl font-bold text-white mb-2">請先設定品牌資訊與 API</h2>
              <p className="text-gray-400 mb-6">必須連接 Facebook Page ID 與 Token 才能取得真實數據。</p>
          </div>
      );
  }

  if (loadingStats) {
    return <div className="text-center py-20 text-primary animate-pulse">正在從 Facebook API 撈取真實數據...</div>;
  }

  if (errorMsg) {
      return (
          <div className="text-center py-20 animate-fade-in">
              <div className="text-red-500 text-5xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-white mb-2">數據載入失敗</h3>
              <p className="text-gray-400">{errorMsg}</p>
              <p className="text-sm text-gray-500 mt-4">請回到「品牌設定」檢查 Token 是否過期或權限不足。</p>
          </div>
      );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-10">
      
      {/* 1. Overview Cards */}
      <section>
        <h2 className="text-2xl font-bold mb-4 text-white">📊 本週粉專真實概況</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           <div className="bg-card p-6 rounded-xl border border-gray-700">
             <p className="text-gray-400 text-sm">總粉絲數</p>
             <p className="text-3xl font-bold text-white mt-2">{analytics?.followers.toLocaleString()}</p>
           </div>
           <div className="bg-card p-6 rounded-xl border border-gray-700">
             <p className="text-gray-400 text-sm">貼文觸及人數 (28天)</p>
             <p className="text-3xl font-bold text-white mt-2">{analytics?.reach.toLocaleString()}</p>
           </div>
           <div className="bg-card p-6 rounded-xl border border-gray-700">
             <p className="text-gray-400 text-sm">平均互動率</p>
             <p className="text-3xl font-bold text-blue-400 mt-2">{analytics?.engagementRate}%</p>
           </div>
           <div className="bg-card p-6 rounded-xl border border-gray-700 flex flex-col justify-center">
              <button 
                onClick={handleGenerateReport}
                disabled={generatingReport}
                className="w-full bg-primary hover:bg-blue-600 text-white py-3 rounded font-bold transition-all disabled:opacity-50"
              >
                {generatingReport ? 'AI 撰寫中...' : '📝 產生 AI 週報'}
              </button>
           </div>
        </div>

        {report && (
          <div className="mt-6 bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-xl border border-blue-900/50 shadow-lg animate-fade-in">
             <h3 className="text-lg font-bold text-blue-300 mb-4">AI 營運分析週報</h3>
             <div className="text-gray-200 whitespace-pre-wrap leading-relaxed">
               {report}
             </div>
          </div>
        )}
      </section>

      {/* 2. Top Performing Posts */}
      <section className="border-t border-gray-700 pt-8">
        <h2 className="text-2xl font-bold text-white mb-6">🏆 本週 MVP 貼文 (最近15篇)</h2>

        {!topPosts || (!topPosts.topReach && !topPosts.topEngagement) ? (
           <div className="text-gray-500 text-center py-10 bg-card/30 rounded border border-dashed border-gray-700">
             沒有找到近期貼文數據。
           </div>
        ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Best Reach */}
              {topPosts.topReach && (
                  <div className="bg-card rounded-xl border border-yellow-600/50 overflow-hidden shadow-lg hover:border-yellow-500 transition-colors">
                      <div className="bg-yellow-900/20 p-3 border-b border-yellow-600/30 flex justify-between items-center">
                          <span className="font-bold text-yellow-500">🔥 最佳觸及王</span>
                          <span className="text-xs text-yellow-300 font-mono bg-yellow-900/40 px-2 py-1 rounded">Reach: {topPosts.topReach.reach.toLocaleString()}</span>
                      </div>
                      <div className="p-4 flex gap-4">
                          {topPosts.topReach.imageUrl && (
                              <div className="w-24 h-24 flex-shrink-0 bg-gray-800 rounded overflow-hidden">
                                  <img src={topPosts.topReach.imageUrl} className="w-full h-full object-cover" alt="Post" />
                              </div>
                          )}
                          <div className="flex-1 min-w-0">
                              <p className="text-gray-300 text-sm line-clamp-3 mb-2">{topPosts.topReach.message}</p>
                              <div className="flex justify-between items-center">
                                  <span className="text-xs text-gray-500">{new Date(topPosts.topReach.created_time).toLocaleDateString()}</span>
                                  <a href={topPosts.topReach.permalink_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">查看貼文 →</a>
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {/* Best Engagement */}
              {topPosts.topEngagement && (
                  <div className="bg-card rounded-xl border border-pink-600/50 overflow-hidden shadow-lg hover:border-pink-500 transition-colors">
                      <div className="bg-pink-900/20 p-3 border-b border-pink-600/30 flex justify-between items-center">
                          <span className="font-bold text-pink-500">❤️ 最佳互動王</span>
                          <span className="text-xs text-pink-300 font-mono bg-pink-900/40 px-2 py-1 rounded">Engaged: {topPosts.topEngagement.engagedUsers.toLocaleString()}</span>
                      </div>
                      <div className="p-4 flex gap-4">
                          {topPosts.topEngagement.imageUrl && (
                              <div className="w-24 h-24 flex-shrink-0 bg-gray-800 rounded overflow-hidden">
                                  <img src={topPosts.topEngagement.imageUrl} className="w-full h-full object-cover" alt="Post" />
                              </div>
                          )}
                          <div className="flex-1 min-w-0">
                              <p className="text-gray-300 text-sm line-clamp-3 mb-2">{topPosts.topEngagement.message}</p>
                              <div className="flex justify-between items-center">
                                  <span className="text-xs text-gray-500">{new Date(topPosts.topEngagement.created_time).toLocaleDateString()}</span>
                                  <a href={topPosts.topEngagement.permalink_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">查看貼文 →</a>
                              </div>
                          </div>
                      </div>
                  </div>
              )}
           </div>
        )}
      </section>
    </div>
  );
};

export default AnalyticsDashboard;