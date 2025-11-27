import React, { useState, useEffect } from 'react';
import { BrandSettings, AnalyticsData, CompetitorPost } from '../types';
import { fetchPageAnalytics, fetchCompetitorTopPosts } from '../services/facebookService';
import { generateWeeklyReport, analyzeCompetitorStrategy } from '../services/geminiService';

interface Props {
  settings: BrandSettings;
}

const AnalyticsDashboard: React.FC<Props> = ({ settings }) => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [competitorPosts, setCompetitorPosts] = useState<CompetitorPost[]>([]);
  const [report, setReport] = useState<string>('');
  const [competitorAnalysis, setCompetitorAnalysis] = useState<string>('');
  
  const [loadingStats, setLoadingStats] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [analyzingCompetitors, setAnalyzingCompetitors] = useState(false);

  useEffect(() => {
    if (!settings.facebookPageId || !settings.facebookToken) {
        // Do not fetch if not configured
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
      
      if (settings.competitors.length > 0) {
         const posts = await fetchCompetitorTopPosts(settings.competitors);
         setCompetitorPosts(posts);
      }
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
      const text = await generateWeeklyReport(analytics, settings);
      setReport(text);
    } catch (e) {
      alert("生成週報失敗");
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleAnalyzeCompetitors = async () => {
    if (competitorPosts.length === 0) return;
    setAnalyzingCompetitors(true);
    try {
      const text = await analyzeCompetitorStrategy(competitorPosts);
      setCompetitorAnalysis(text);
    } catch (e) {
      alert("分析失敗");
    } finally {
      setAnalyzingCompetitors(false);
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
          <div className="mt-6 bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-xl border border-blue-900/50 shadow-lg">
             <h3 className="text-lg font-bold text-blue-300 mb-4">AI 營運分析週報</h3>
             <div className="text-gray-200 whitespace-pre-wrap leading-relaxed">
               {report}
             </div>
          </div>
        )}
      </section>

      {/* 2. Competitor Analysis */}
      <section className="border-t border-gray-700 pt-8">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">⚔️ 競品動態偵測</h2>
            <button 
              onClick={handleAnalyzeCompetitors}
              disabled={analyzingCompetitors || competitorPosts.length === 0}
              className="bg-secondary hover:bg-indigo-600 text-white px-4 py-2 rounded font-bold text-sm disabled:opacity-50"
            >
              {analyzingCompetitors ? 'AI 分析中...' : '🔍 分析競品策略'}
            </button>
        </div>

        {competitorPosts.length === 0 ? (
           <div className="text-gray-500 text-center py-10 bg-card/30 rounded border border-dashed border-gray-700">
             沒有找到競品貼文資料，可能是 API 權限限制無法讀取公開頁面。
           </div>
        ) : (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                 <h4 className="text-gray-400 text-sm font-bold mb-2">本週競品熱門貼文</h4>
                 {competitorPosts.map((post, i) => (
                    <div key={i} className="bg-dark p-4 rounded border border-gray-700 hover:border-gray-500 transition-colors">
                       <div className="flex justify-between mb-2">
                          <span className="font-bold text-white">{post.brandName}</span>
                          <span className="text-xs text-gray-500">❤️ {post.likes}</span>
                       </div>
                       <p className="text-sm text-gray-400 line-clamp-2">{post.content}</p>
                    </div>
                 ))}
              </div>

              <div className="bg-card p-6 rounded-xl border border-gray-700">
                  <h4 className="text-gray-300 font-bold mb-4">🤖 AI 策略洞察</h4>
                  {competitorAnalysis ? (
                     <div className="text-gray-200 whitespace-pre-wrap text-sm leading-relaxed">
                        {competitorAnalysis}
                     </div>
                  ) : (
                     <div className="text-gray-500 text-sm text-center py-10">
                        點擊右上角按鈕，讓 AI 告訴你為什麼這些貼文會紅。
                     </div>
                  )}
              </div>
           </div>
        )}
      </section>
    </div>
  );
};

export default AnalyticsDashboard;