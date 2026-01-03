
import React, { useState, useEffect } from 'react';
import { BrandSettings, AnalyticsData, TopPostData, CompetitorInsight } from '../types';
import { fetchPageAnalytics, fetchPageTopPosts } from '../services/facebookService';
import { analyzeCompetitors } from '../services/gemini/text';
import { checkAndUseQuota, getCurrentUser } from '../services/authService';

interface Props {
  settings: BrandSettings;
}

const AnalyticsDashboard: React.FC<Props> = ({ settings }) => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [topPosts, setTopPosts] = useState<{ topReach?: TopPostData, topEngagement?: TopPostData } | null>(null);
  
  // Competitor Intelligence State
  const [competitorInsights, setCompetitorInsights] = useState<CompetitorInsight[]>([]);
  const [isLoadingIntel, setIsLoadingIntel] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);

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
    } catch (e) {} finally {
      setLoadingStats(false);
    }
  };

  const handleRunCompetitorIntel = async () => {
      const urls = settings.competitorUrls?.filter(u => u.trim());
      if (!urls || urls.length === 0) return alert("請先在品牌設定中填入競品連結。");

      const user = getCurrentUser();
      if (!user) return;

      const COST = 15;
      if (!confirm(`啟動 AI 深度情報分析將消耗 ${COST} 點。\n系統將同步掃描競品粉專並生成戰略建議。`)) return;

      const allowed = await checkAndUseQuota(user.uid, COST, 'COMPETITOR_INTEL');
      if (!allowed) return;

      setIsLoadingIntel(true);
      try {
          const insights = await analyzeCompetitors(urls, settings.industry);
          setCompetitorInsights(insights);
      } catch (e: any) {
          alert(`情報分析失敗: ${e.message}`);
      } finally {
          setIsLoadingIntel(false);
      }
  };

  if (!settings.facebookPageId) return <div className="p-10 text-center text-white">請先在設定頁面連結 Facebook 粉專 API</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
      
      <div className="flex justify-between items-center border-b border-gray-800 pb-4">
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">數據分析中心</h2>
          <div className="text-xs text-gray-500 font-mono">Real-time Dashboard</div>
      </div>

      {analytics && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="bg-card p-6 rounded-2xl border border-gray-700 shadow-xl">
                 <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">總粉絲數</p>
                 <p className="text-4xl font-black text-white mt-2">{analytics.followers.toLocaleString()}</p>
               </div>
               <div className="bg-card p-6 rounded-2xl border border-gray-700 shadow-xl">
                 <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">28天觸及</p>
                 <p className="text-4xl font-black text-primary mt-2">{analytics.reach.toLocaleString()}</p>
               </div>
               <div className="bg-card p-6 rounded-2xl border border-gray-700 shadow-xl">
                 <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">互動率預估</p>
                 <p className="text-4xl font-black text-secondary mt-2">-- %</p>
               </div>
          </section>
      )}

      {/* NEW: Competitor Intelligence Section */}
      <section className="bg-dark/60 rounded-3xl border border-gray-700 overflow-hidden shadow-2xl">
          <div className="p-6 bg-gradient-to-r from-gray-800 to-gray-900 border-b border-gray-700 flex justify-between items-center">
              <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      🕵️ 競品監測與商戰情報
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">針對您設定的競品名單進行 AI 自動掃描與戰略分析</p>
              </div>
              <button 
                onClick={handleRunCompetitorIntel}
                disabled={isLoadingIntel}
                className="bg-primary hover:bg-blue-600 text-black px-6 py-2 rounded-full font-black text-sm transition-all shadow-lg hover:shadow-primary/20 disabled:opacity-50"
              >
                  {isLoadingIntel ? '情報官掃描中...' : '⚡ 立即分析商情 (15 點)'}
              </button>
          </div>

          <div className="p-6">
              {competitorInsights.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {competitorInsights.map((intel, idx) => (
                          <div key={idx} className="bg-gray-800/40 p-6 rounded-2xl border border-white/5 space-y-4 hover:border-primary/30 transition-colors">
                              <div className="flex justify-between items-start">
                                  <h4 className="text-lg font-black text-white">{intel.name}</h4>
                                  <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-bold uppercase tracking-tighter">Live Monitor</span>
                              </div>
                              <div>
                                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">本週動態</p>
                                  <p className="text-sm text-gray-300 leading-relaxed">{intel.recentActivity}</p>
                              </div>
                              <div className="bg-black/30 p-4 rounded-xl border border-white/5">
                                  <p className="text-[10px] text-yellow-500 font-black uppercase tracking-widest mb-2">💡 戰略官建議</p>
                                  <p className="text-xs text-yellow-100/80 italic leading-relaxed">{intel.strategySuggestion}</p>
                              </div>
                          </div>
                      ))}
                  </div>
              ) : (
                  <div className="py-20 text-center flex flex-col items-center">
                      <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center text-3xl mb-4 opacity-50">🔭</div>
                      <p className="text-gray-500 font-bold">目前尚無情報紀錄</p>
                      <p className="text-xs text-gray-600 mt-2">點擊上方按鈕，讓 AI 為您掃描競爭對手最近發了什麼好康內容。</p>
                  </div>
              )}
          </div>
      </section>
    </div>
  );
};

export default AnalyticsDashboard;
