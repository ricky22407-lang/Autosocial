
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { BrandSettings } from '../../types';
import { useAnalytics } from './hooks/useAnalytics';

interface Props {
  settings: BrandSettings;
}

const AnalyticsDashboard: React.FC<Props> = ({ settings }) => {
  const {
      activeTab, setActiveTab,
      analytics, topPosts,
      loadingStats, errorMsg, loadData,
      aiInsight, isAnalyzing, generateAiInsight,
      competitorName, setCompetitorName, compAnalysis, isCompAnalyzing, analyzeCompetitor
  } = useAnalytics(settings);

  if (!settings.facebookPageId) return <div className="p-10 text-center text-gray-500">請先至「品牌設定」連結 Facebook 粉絲專頁。</div>;

  // Custom Markdown Components for Styling
  const MarkdownRender = ({ content }: { content: string }) => (
      <ReactMarkdown
          components={{
              h3: ({node, ...props}) => <h3 className="text-lg font-bold text-purple-300 mt-6 mb-3 border-l-4 border-purple-500 pl-3 uppercase tracking-wider" {...props} />,
              h4: ({node, ...props}) => <h4 className="text-base font-bold text-white mt-4 mb-2" {...props} />,
              p: ({node, ...props}) => <p className="text-sm text-gray-300 leading-relaxed mb-3" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc list-inside space-y-2 mb-4 text-sm text-gray-300 bg-black/20 p-4 rounded-xl border border-gray-700" {...props} />,
              li: ({node, ...props}) => <li className="marker:text-purple-500" {...props} />,
              strong: ({node, ...props}) => <strong className="text-yellow-400 font-bold bg-yellow-900/20 px-1 rounded" {...props} />,
              blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-600 pl-4 italic text-gray-500 my-4" {...props} />,
          }}
      >
          {content}
      </ReactMarkdown>
  );

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
              <div className="text-4xl mb-3">⚠️</div>
              <p className="text-red-400 font-bold mb-2">
                  {(errorMsg.includes("Session has expired") || errorMsg.includes("400") || errorMsg.includes("validating access token")) 
                    ? "Facebook 授權已過期" 
                    : "無法讀取數據"
                  }
              </p>
              
              <div className="text-xs text-gray-400 max-w-lg mx-auto bg-black/30 p-3 rounded mb-4 font-mono">
                  Error Details: {errorMsg}
              </div>

              {(errorMsg.includes("Session has expired") || errorMsg.includes("validating access token")) && (
                  <div className="mb-4 text-sm text-yellow-400 font-bold">
                      為了安全起見，Facebook 定期會讓 Access Token 失效。<br/>
                      請重新點擊下方按鈕進行連結。
                  </div>
              )}

              <p className="text-xs mt-4 text-gray-500 mb-4">建議：請至「品牌設定」重新授權 FB 帳號。</p>
              
              {/* Note: We don't have direct access to handleConnectFacebook here, so we guide user to Settings */}
              <div className="flex justify-center gap-3">
                  <button onClick={loadData} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-xs font-bold">
                      重試連線
                  </button>
              </div>
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
                                <div className="text-center text-gray-500 text-xs py-10">資料不足 (需 &gt;100 粉絲才能顯示人口統計)</div>
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
                                        <a href={topPosts.topReach.permalink_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">查看 ↗</a>
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
                        <div>
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                🤖 AI 營運診斷報告
                            </h3>
                            <p className="text-xs text-gray-400 mt-1">基於您的粉專數據 (過去 28 天) 進行深度分析</p>
                        </div>
                        <button 
                            onClick={generateAiInsight}
                            disabled={isAnalyzing}
                            className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-lg disabled:opacity-50 flex items-center gap-2"
                        >
                            {isAnalyzing ? <div className="loader w-4 h-4 border-t-white"></div> : '⚡'} 
                            {isAnalyzing ? 'AI 撰寫報告中...' : '生成最新報告'}
                        </button>
                    </div>
                    
                    {aiInsight ? (
                        <div className="animate-fade-in bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                            <MarkdownRender content={aiInsight} />
                        </div>
                    ) : (
                        <div className="text-center py-20 text-gray-500 border-2 border-dashed border-gray-700 rounded-xl">
                            <div className="text-4xl mb-4 opacity-50">📋</div>
                            <p>點擊上方按鈕，讓 AI 分析您的粉專數據並產出策略報告。</p>
                            <p className="text-xs mt-2 text-gray-600">報告包含：營運健康度評分、受眾洞察、具體行動建議。</p>
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
                                    className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-black py-3 rounded-lg shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isCompAnalyzing ? <div className="loader w-4 h-4 border-t-black"></div> : '🔍'}
                                    {isCompAnalyzing ? 'AI 偵查中 (扣 5 點)...' : '開始分析 (扣 5 點)'}
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-4 leading-relaxed bg-black/20 p-3 rounded">
                                ℹ️ 說明：AI 將透過 Google 搜尋公開資訊，分析對手的社群策略、近期活動與網友評價，並提供我方應對建議。
                            </p>
                        </div>
                    </div>

                    {/* Result Area */}
                    <div className="lg:col-span-2 bg-gradient-to-br from-gray-900 to-black p-8 rounded-2xl border border-yellow-600/30 min-h-[400px]">
                        <h3 className="text-xl font-bold text-white mb-6 border-b border-gray-800 pb-4 flex items-center gap-2">
                            ⚔️ 競品戰情分析
                        </h3>
                        {compAnalysis ? (
                            <div className="animate-fade-in">
                                <MarkdownRender content={compAnalysis} />
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
