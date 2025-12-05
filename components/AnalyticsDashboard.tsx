
import React, { useState, useEffect } from 'react';
import { BrandSettings, AnalyticsData, TopPostData } from '../types';
import { fetchPageAnalytics, fetchPageTopPosts } from '../services/facebookService';
import { generateWeeklyReport } from '../services/geminiService';
import { generatePostDraft } from '../services/geminiService'; // Reusing for generic call, better to have specific service

interface Props {
  settings: BrandSettings;
}

const AnalyticsDashboard: React.FC<Props> = ({ settings }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'competitor'>('overview');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [topPosts, setTopPosts] = useState<{ topReach?: TopPostData, topEngagement?: TopPostData } | null>(null);
  const [report, setReport] = useState<string>('');
  
  // Competitor State
  const [competitorAnalysis, setCompetitorAnalysis] = useState<string>('');
  const [analyzingComp, setAnalyzingComp] = useState(false);

  const [loadingStats, setLoadingStats] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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

  const handleDownloadCSV = () => {
      if (!analytics) return;
      const headers = "Followers,Reach(28d),EngagementRate,Date\n";
      const row = `${analytics.followers},${analytics.reach},${analytics.engagementRate}%,${new Date().toLocaleDateString()}\n`;
      const blob = new Blob([headers + row], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report_${settings.facebookPageId}_${new Date().toISOString().slice(0,10)}.csv`;
      link.click();
  };

  const handleAnalyzeCompetitors = async () => {
      if (analyzingComp) return;
      setAnalyzingComp(true);
      try {
          // Use Generic Gemini call via a service wrapper in real app.
          // Here we mock the call flow:
          // const res = await gemini.analyzeCompetitors(settings.competitors);
          // Simulating response for UI update
          await new Promise(r => setTimeout(r, 2000));
          setCompetitorAnalysis(`
**競品分析報告 (AI 生成)**
- 競品 A：最近主打環保議題，互動率高。
- 競品 B：影片內容佔比增加，但粉絲成長趨緩。
建議策略：可嘗試模仿 A 的環保hashtag，但結合 B 的短影音形式。
          `);
      } catch(e) { alert("分析失敗"); } finally { setAnalyzingComp(false); }
  };

  if (!settings.facebookPageId) return <div className="p-10 text-center text-white">請先設定 API</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-10">
      
      <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">數據分析中心</h2>
          <div className="flex gap-2">
              <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded ${activeTab==='overview'?'bg-primary text-white':'bg-dark text-gray-400'}`}>本站數據</button>
              <button onClick={() => setActiveTab('competitor')} className={`px-4 py-2 rounded ${activeTab==='competitor'?'bg-primary text-white':'bg-dark text-gray-400'}`}>競品偵測</button>
          </div>
      </div>

      {activeTab === 'overview' && analytics && (
          <section className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
               <div className="bg-card p-6 rounded-xl border border-gray-700">
                 <p className="text-gray-400 text-sm">總粉絲數</p>
                 <p className="text-3xl font-bold text-white mt-2">{analytics.followers.toLocaleString()}</p>
               </div>
               <div className="bg-card p-6 rounded-xl border border-gray-700">
                 <p className="text-gray-400 text-sm">貼文觸及 (28天)</p>
                 <p className="text-3xl font-bold text-white mt-2">{analytics.reach.toLocaleString()}</p>
               </div>
               <div className="bg-card p-6 rounded-xl border border-gray-700">
                 <p className="text-gray-400 text-sm">互動率</p>
                 <p className="text-3xl font-bold text-blue-400 mt-2">{analytics.engagementRate}%</p>
               </div>
               <div className="flex flex-col gap-2">
                  <button onClick={handleDownloadCSV} className="bg-green-700 text-white py-3 rounded font-bold hover:bg-green-600">📥 下載 CSV</button>
                  {/* Report Gen Button */}
               </div>
            </div>
            {/* Top Posts Section ... */}
          </section>
      )}

      {activeTab === 'competitor' && (
          <section className="bg-card p-6 rounded-xl border border-gray-700">
              <h3 className="text-xl font-bold text-white mb-4">🕵️ 競品情報站</h3>
              <p className="text-gray-400 mb-4">監測對象: {settings.competitors.length > 0 ? settings.competitors.join(', ') : '未設定 (請至品牌設定新增)'}</p>
              
              <button 
                onClick={handleAnalyzeCompetitors} 
                disabled={analyzingComp || settings.competitors.length === 0}
                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded font-bold disabled:opacity-50"
              >
                  {analyzingComp ? 'AI 正在網路上搜尋並分析中...' : '🔍 開始 AI 分析 (消耗 3 配額)'}
              </button>

              {competitorAnalysis && (
                  <div className="mt-6 p-4 bg-dark rounded border border-gray-600 text-gray-200 whitespace-pre-wrap">
                      {competitorAnalysis}
                  </div>
              )}
          </section>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
