
import React, { useState, useEffect } from 'react';
import { BrandSettings, AnalyticsData, TopPostData } from '../types';
import { fetchPageAnalytics, fetchPageTopPosts } from '../services/facebookService';
import { callBackend } from '../services/gemini/core'; // Direct call for flexibility
import { checkAndUseQuota } from '../services/authService';

interface Props {
  settings: BrandSettings;
}

const AnalyticsDashboard: React.FC<Props> = ({ settings }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'strategy' | 'competitor'>('overview');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [topPosts, setTopPosts] = useState<{ topReach?: TopPostData, topEngagement?: TopPostData } | null>(null);
  
  // Strategy Analysis State
  const [aiInsight, setAiInsight] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Competitor State (New)
  const [competitorUrl, setCompetitorUrl] = useState('');
  const [competitorName, setCompetitorName] = useState('');
  const [compAnalysis, setCompAnalysis] = useState<string>('');
  const [isCompAnalyzing, setIsCompAnalyzing] = useState(false);

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

  const generateAiInsight = async () => {
      if (!analytics) return;
      setIsAnalyzing(true);
      
      const context = `
        Industry: ${settings.industry}
        Followers: ${analytics.followers}
        Reach(28d): ${analytics.reach}
        Impressions(28d): ${analytics.impressions}
        Engagement Rate: ${analytics.engagementRate}%
        Negative Feedback: ${analytics.negativeFeedback}
        Demographics Top 3: ${analytics.demographics?.slice(0,3).map(d => `${d.gender}${d.ageGroup}`).join(', ')}
      `;

      try {
          const res = await callBackend('generateContent', {
              model: 'gemini-2.5-flash',
              contents: `Role: Senior Social Media Strategist. Analyze this Facebook page data for a ${settings.industry} brand in Taiwan.\n${context}\n\nProvide 3 specific, actionable growth strategies in Traditional Chinese. Focus on fixing weaknesses and leveraging top demographics.`
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
      setIsCompAnalyzing(true);
      
      try {
          const res = await callBackend('generateContent', {
              model: 'gemini-3-flash-preview', // Use smarter model
              contents: `
                Role: Business Consultant. 
                Task: Analyze the social media strategy of competitor "${competitorName}" in the ${settings.industry} industry (Taiwan market).
                
                Search for their recent public activities or general brand reputation.
                Compare it with my brand (${settings.brandName || 'My Brand'}).
                
                Output structure:
                1. **對手優勢 (Strengths)**: What are they doing well?
                2. **內容策略 (Content)**: What type of posts do they use?
                3. **破局建議 (How to Win)**: How can I differentiate?
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

  if (!settings.facebookPageId) return <div className="p-10 text-center text-gray-500">請先至「品牌設定」連結 Facebook 粉絲專頁。</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
              <h2 className="text-2xl font-black text-white flex items-center gap-2">
                  <span className="text-neon-cyan">📊</span> 數據戰情室
              </h2>
              <p className="text-xs text-gray-400 mt-1">即時監控粉專健康度與市場動態</p>
          </div>
          <div className="bg-dark p-1 rounded-xl border border-gray-700 flex">
              <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab==='overview'?'bg-primary text-black shadow-lg':'text-gray-400 hover:text-white'}`}>營運總覽</button>
              <button onClick={() => setActiveTab('strategy')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab==='strategy'?'bg-purple-500 text-white shadow-lg':'text-gray-400 hover:text-white'}`}>AI 策略顧問</button>
              <button onClick={() => setActiveTab('competitor')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab==='competitor'?'bg-yellow-500 text-black shadow-lg':'text-gray-400 hover:text-white'}`}>市場戰略</button>
          </div>
      </div>

      {loadingStats ? (
          <div className="text-center py-20">
              <div className="loader border-t-primary mb-4 mx-auto"></div>
              <p className="text-gray-400 text-sm">正在從 Facebook 下載最新數據...</p>
          </div>
      ) : errorMsg ? (
          <div className="bg-red-900/20 border border-red-500 p-6 rounded-xl text-center">
              <p className="text-red-400 font-bold mb-2">無法讀取數據</p>
              <p className="text-xs text-gray-400">{errorMsg}</p>
              <p className="text-xs mt-4 text-gray-500">建議：請嘗試重新在「品牌設定」連結 FB 帳號 (Token 可能已過期)。</p>
          </div>
      ) : (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && analytics && (
                <div className="space-y-6">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MetricCard label="總粉絲數 (Followers)" value={analytics.followers.toLocaleString()} sub="累積資產" color="text-white" />
                        <MetricCard label="觸及人數 (28天)" value={analytics.reach.toLocaleString()} sub="不重複訪客" color="text-green-400" />
                        <MetricCard label="互動率 (Engagement)" value={`${analytics.engagementRate}%`} sub="內容黏著度" color="text-blue-400" />
                        <MetricCard label="負面回饋" value={analytics.negativeFeedback} sub="隱藏/檢舉" color="text-red-400" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Demographics Chart */}
                        <div className="lg:col-span-2 bg-card p-6 rounded-2xl border border-gray-700">
                            <h3 className="text-sm font-bold text-gray-300 mb-6 uppercase tracking-wider">受眾人口統計 (Top 5)</h3>
                            {analytics.demographics && analytics.demographics.length > 0 ? (
                                <div className="space-y-3">
                                    {analytics.demographics.slice(0, 5).map((d, i) => (
                                        <div key={i} className="flex items-center gap-4">
                                            <div className="w-16 text-xs font-bold text-gray-400 text-right">
                                                {d.gender === 'F' ? '👩' : d.gender === 'M' ? '👨' : '👤'} {d.ageGroup}
                                            </div>
                                            <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full ${d.gender === 'F' ? 'bg-pink-500' : 'bg-blue-500'}`} 
                                                    style={{ width: `${(d.value / analytics.demographics![0].value) * 100}%` }}
                                                ></div>
                                            </div>
                                            <div className="w-10 text-xs text-white font-mono text-right">{d.value}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-gray-500 text-xs py-10">資料不足 (需 >100 粉絲才能顯示人口統計)</div>
                            )}
                        </div>

                        {/* Top Post Highlight */}
                        <div className="bg-gradient-to-b from-gray-800 to-black p-6 rounded-2xl border border-gray-700">
                            <h3 className="text-sm font-bold text-yellow-400 mb-4 uppercase tracking-wider">🏆 最佳表現貼文</h3>
                            {topPosts?.topReach ? (
                                <div>
                                    {topPosts.topReach.imageUrl && (
                                        <img src={topPosts.topReach.imageUrl} className="w-full h-32 object-cover rounded-lg mb-3 opacity-80" alt="Top post" />
                                    )}
                                    <p className="text-xs text-gray-300 line-clamp-3 mb-3">{topPosts.topReach.message}</p>
                                    <div className="flex justify-between text-xs font-mono">
                                        <span className="text-green-400">觸及: {topPosts.topReach.reach.toLocaleString()}</span>
                                        <a href={topPosts.topReach.permalink_url} target="_blank" className="text-blue-400 hover:underline">查看 ↗</a>
                                    </div>
                                </div>
                            ) : <p className="text-gray-500 text-xs">尚無足夠數據</p>}
                        </div>
                    </div>
                </div>
            )}

            {/* STRATEGY TAB */}
            {activeTab === 'strategy' && (
                <div className="bg-card p-8 rounded-2xl border border-gray-700 min-h-[400px]">
                    <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            🤖 AI 戰略顧問 <span className="text-xs bg-purple-900 text-purple-200 px-2 py-1 rounded">Beta</span>
                        </h3>
                        <button 
                            onClick={generateAiInsight}
                            disabled={isAnalyzing}
                            className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-lg disabled:opacity-50"
                        >
                            {isAnalyzing ? 'AI 思考中...' : '生成診斷報告'}
                        </button>
                    </div>
                    
                    {aiInsight ? (
                        <div className="prose prose-invert max-w-none text-sm leading-relaxed text-gray-300 whitespace-pre-wrap animate-fade-in">
                            {aiInsight}
                        </div>
                    ) : (
                        <div className="text-center py-20 text-gray-500">
                            <p>點擊按鈕，讓 AI 分析您的粉專數據並提供具體建議。</p>
                            <p className="text-xs mt-2">將分析：互動率瓶頸、受眾偏好、內容優化方向。</p>
                        </div>
                    )}
                </div>
            )}

            {/* COMPETITOR TAB */}
            {activeTab === 'competitor' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Input Area */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-card p-6 rounded-2xl border border-gray-700">
                            <h3 className="text-lg font-bold text-white mb-4">設定競爭對手</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">品牌名稱</label>
                                    <input 
                                        value={competitorName}
                                        onChange={e => setCompetitorName(e.target.value)}
                                        className="w-full bg-dark border border-gray-600 rounded-lg p-3 text-white focus:border-yellow-500 outline-none"
                                        placeholder="例如：Nike Taiwan"
                                    />
                                </div>
                                <button 
                                    onClick={analyzeCompetitor}
                                    disabled={isCompAnalyzing || !competitorName}
                                    className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-black py-3 rounded-lg shadow-lg disabled:opacity-50"
                                >
                                    {isCompAnalyzing ? 'AI 偵查中...' : '開始分析 (Search)'}
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-4 leading-relaxed">
                                * 由於隱私權政策，我們無法直接抓取對手的後台數據。
                                <br/>* 此功能使用 Google Search 搜尋公開資訊，並由 AI 進行戰略拆解。
                            </p>
                        </div>
                    </div>

                    {/* Result Area */}
                    <div className="lg:col-span-2 bg-gradient-to-br from-gray-900 to-black p-8 rounded-2xl border border-yellow-600/30 min-h-[400px]">
                        <h3 className="text-xl font-bold text-white mb-6 border-b border-gray-800 pb-4 flex items-center gap-2">
                            ⚔️ 競品戰情分析
                        </h3>
                        {compAnalysis ? (
                            <div className="prose prose-invert max-w-none text-sm text-gray-300 whitespace-pre-wrap animate-fade-in leading-loose">
                                {compAnalysis}
                            </div>
                        ) : (
                            <div className="text-center py-20 text-gray-600">
                                <span className="text-4xl opacity-30">🛡️ vs ⚔️</span>
                                <p className="mt-4">輸入對手名稱，知己知彼。</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
          </>
      )}
    </div>
  );
};

const MetricCard = ({ label, value, sub, color }: { label: string, value: string | number, sub: string, color: string }) => (
    <div className="bg-card p-5 rounded-2xl border border-gray-700 hover:border-gray-500 transition-colors group">
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">{label}</p>
        <p className={`text-3xl font-black ${color} tracking-tight group-hover:scale-105 transition-transform origin-left`}>{value}</p>
        <p className="text-[10px] text-gray-600 mt-2">{sub}</p>
    </div>
);

export default AnalyticsDashboard;
