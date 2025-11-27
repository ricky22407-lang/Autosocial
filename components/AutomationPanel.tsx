
import React, { useState } from 'react';
import { BrandSettings, AutoReplyRule, AutoPilotConfig } from '../types';
import { refreshLongLivedToken } from '../services/facebookService';
import { api } from '../services/apiClient';

interface Props {
  settings: BrandSettings;
  onSave: (settings: BrandSettings) => void;
}

const AutomationPanel: React.FC<Props> = ({ settings, onSave }) => {
  const [activeTab, setActiveTab] = useState<'autopilot' | 'reply' | 'maintenance'>('autopilot');
  
  // Auto Reply State
  const [replyEnabled, setReplyEnabled] = useState(settings.autoReply?.enabled || false);
  const [defaultResponse, setDefaultResponse] = useState(settings.autoReply?.defaultResponse || '');
  const [rules, setRules] = useState<AutoReplyRule[]>(settings.autoReply?.rules || []);
  const [newKeyword, setNewKeyword] = useState('');
  const [newResponse, setNewResponse] = useState('');

  // Auto Pilot State
  const defaultAutoPilot: AutoPilotConfig = {
      enabled: false,
      frequency: 'daily',
      postTime: '09:00',
      source: 'trending',
      keywords: [],
      mediaTypePreference: 'image'
  };
  const [apConfig, setApConfig] = useState<AutoPilotConfig>(settings.autoPilot || defaultAutoPilot);
  const [newApKeyword, setNewApKeyword] = useState('');
  const [triggering, setTriggering] = useState(false);

  // Token State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tokenMsg, setTokenMsg] = useState('');

  const handleSaveSettings = () => {
    onSave({
      ...settings,
      autoReply: {
        enabled: replyEnabled,
        defaultResponse,
        rules
      },
      autoPilot: apConfig
    });
    alert('設定已儲存！');
  };

  const addRule = () => {
    if (newKeyword && newResponse) {
      setRules([...rules, { keyword: newKeyword, response: newResponse }]);
      setNewKeyword('');
      setNewResponse('');
    }
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleRefreshToken = async () => {
    setIsRefreshing(true);
    setTokenMsg('');
    try {
      const result = await refreshLongLivedToken(settings.facebookToken);
      if (result.success && result.newToken) {
        onSave({
          ...settings,
          facebookToken: result.newToken,
          tokenExpiry: result.expiry
        });
        setTokenMsg(`✅ Token 刷新成功！有效期已延長至 ${new Date(result.expiry!).toLocaleDateString()}`);
      } else {
        setTokenMsg('❌ Token 刷新失敗，請重新手動連接。');
      }
    } catch (e) {
      setTokenMsg('❌ 發生錯誤');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTriggerAutoPilot = async () => {
      setTriggering(true);
      try {
          await api.automation.trigger(settings);
          alert("🚀 全自動發文任務已啟動！\n系統將在背景執行選題、創作與發佈。\n(模擬模式下不會真實發文)");
      } catch (e: any) {
          alert(`啟動失敗: ${e.message}`);
      } finally {
          setTriggering(false);
      }
  };

  const addApKeyword = () => {
      if (newApKeyword) {
          setApConfig({...apConfig, keywords: [...apConfig.keywords, newApKeyword]});
          setNewApKeyword('');
      }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-white mb-6">🤖 自動化與系統維護</h2>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-6">
        <button 
          onClick={() => setActiveTab('autopilot')}
          className={`px-6 py-3 font-bold transition-colors ${activeTab === 'autopilot' ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-white'}`}
        >
          🚀 全自動養號
        </button>
        <button 
          onClick={() => setActiveTab('reply')}
          className={`px-6 py-3 font-bold transition-colors ${activeTab === 'reply' ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-white'}`}
        >
          💬 自動回覆 (Messenger)
        </button>
        <button 
          onClick={() => setActiveTab('maintenance')}
          className={`px-6 py-3 font-bold transition-colors ${activeTab === 'maintenance' ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-white'}`}
        >
          🔧 Token 維護
        </button>
      </div>

      {/* VIEW: AUTO PILOT */}
      {activeTab === 'autopilot' && (
          <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
              <div className="flex items-center justify-between border-b border-gray-700 pb-6">
                  <div>
                      <h3 className="text-lg font-bold text-white">Auto-Pilot 全自動養號模式</h3>
                      <p className="text-sm text-gray-400">開啟後，系統將根據設定自動抓取議題、生成內容並發文，無需人工介入。</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={apConfig.enabled} 
                        onChange={(e) => setApConfig({...apConfig, enabled: e.target.checked})} 
                        className="sr-only peer" 
                      />
                      <div className="w-14 h-7 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-600"></div>
                  </label>
              </div>

              <div className={`space-y-6 ${!apConfig.enabled && 'opacity-50 pointer-events-none'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                          <label className="block text-sm text-gray-400 mb-2">發文頻率</label>
                          <select 
                             value={apConfig.frequency}
                             onChange={(e) => setApConfig({...apConfig, frequency: e.target.value as any})}
                             className="w-full bg-dark border border-gray-600 rounded p-3 text-white"
                          >
                              <option value="daily">每天 (Daily)</option>
                              <option value="weekly">每週 (Weekly)</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm text-gray-400 mb-2">發佈時間</label>
                          <input 
                              type="time"
                              value={apConfig.postTime}
                              onChange={(e) => setApConfig({...apConfig, postTime: e.target.value})}
                              className="w-full bg-dark border border-gray-600 rounded p-3 text-white"
                          />
                      </div>
                  </div>

                  <div>
                      <label className="block text-sm text-gray-400 mb-2">內容來源 (選題策略)</label>
                      <div className="flex gap-4 mb-4">
                          <label className="flex items-center gap-2 cursor-pointer text-white">
                              <input 
                                type="radio" 
                                name="source" 
                                checked={apConfig.source === 'trending'} 
                                onChange={() => setApConfig({...apConfig, source: 'trending'})} 
                              /> 
                              🔥 熱門趨勢 (Google Search)
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-white">
                              <input 
                                type="radio" 
                                name="source" 
                                checked={apConfig.source === 'competitor'} 
                                onChange={() => setApConfig({...apConfig, source: 'competitor'})} 
                              /> 
                              ⚔️ 競品話題分析
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-white">
                              <input 
                                type="radio" 
                                name="source" 
                                checked={apConfig.source === 'keywords'} 
                                onChange={() => setApConfig({...apConfig, source: 'keywords'})} 
                              /> 
                              🔑 指定關鍵字
                          </label>
                      </div>
                      
                      {apConfig.source === 'keywords' && (
                          <div className="bg-dark p-4 rounded border border-gray-600">
                              <label className="block text-xs text-gray-400 mb-2">輸入關鍵字 (系統將隨機挑選生成)</label>
                              <div className="flex gap-2 mb-2">
                                  <input 
                                    value={newApKeyword}
                                    onChange={e => setNewApKeyword(e.target.value)}
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                                    placeholder="例如：AI 工具, 行銷教學"
                                  />
                                  <button onClick={addApKeyword} className="bg-gray-700 px-3 rounded text-white text-sm">新增</button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                  {apConfig.keywords.map((k, i) => (
                                      <span key={i} className="bg-primary/20 text-primary px-2 py-1 rounded text-xs flex items-center gap-1">
                                          {k} <button onClick={() => setApConfig({...apConfig, keywords: apConfig.keywords.filter((_, idx) => idx !== i)})} className="hover:text-white">×</button>
                                      </span>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>

                  <div>
                      <label className="block text-sm text-gray-400 mb-2">素材偏好</label>
                      <div className="flex gap-2">
                          {['image', 'video', 'mixed'].map(type => (
                              <button 
                                key={type}
                                onClick={() => setApConfig({...apConfig, mediaTypePreference: type as any})}
                                className={`flex-1 py-2 rounded text-sm font-bold border ${apConfig.mediaTypePreference === type ? 'bg-primary border-primary text-white' : 'border-gray-600 text-gray-400 hover:bg-gray-700'}`}
                              >
                                  {type === 'image' ? '🖼 圖片優先' : type === 'video' ? '🎥 影片優先' : '🔀 混合模式'}
                              </button>
                          ))}
                      </div>
                  </div>
              </div>

              <div className="flex justify-between pt-6 border-t border-gray-700">
                  <button 
                    onClick={handleTriggerAutoPilot}
                    disabled={triggering}
                    className="border border-secondary text-secondary hover:bg-secondary/10 px-6 py-2 rounded font-bold transition-all disabled:opacity-50"
                  >
                      {triggering ? '正在背景執行中...' : '⚡️ 立即手動觸發 (測試用)'}
                  </button>
                  <button onClick={handleSaveSettings} className="bg-primary hover:bg-blue-600 text-white px-8 py-2 rounded font-bold shadow-lg">
                      儲存設定
                  </button>
              </div>
          </div>
      )}

      {/* VIEW: REPLY (Existing) */}
      {activeTab === 'reply' && (
        <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Messenger 自動回覆</h3>
              <p className="text-sm text-gray-400">當粉絲傳送私訊時，系統將根據關鍵字自動回應。</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={replyEnabled} onChange={(e) => setReplyEnabled(e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
            </label>
          </div>

          <div className={`space-y-6 ${!replyEnabled && 'opacity-50 pointer-events-none'}`}>
             <div>
               <label className="block text-sm text-gray-300 mb-2">預設回覆 (當未匹配任何關鍵字時)</label>
               <textarea 
                  value={defaultResponse}
                  onChange={(e) => setDefaultResponse(e.target.value)}
                  className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none h-24"
                  placeholder="例如：您好！小編目前不在線上，我們會盡快回覆您。"
               />
             </div>

             <div className="border-t border-gray-700 pt-6">
               <h4 className="font-bold text-white mb-4">關鍵字規則</h4>
               <div className="flex gap-4 mb-4">
                 <input 
                    placeholder="關鍵字 (例如: 價錢)"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white"
                 />
                 <input 
                    placeholder="自動回應內容"
                    value={newResponse}
                    onChange={(e) => setNewResponse(e.target.value)}
                    className="flex-[2] bg-dark border border-gray-600 rounded p-2 text-white"
                 />
                 <button onClick={addRule} className="bg-secondary hover:bg-indigo-600 px-4 rounded text-white font-bold">+</button>
               </div>

               <ul className="space-y-2">
                 {rules.map((rule, idx) => (
                   <li key={idx} className="flex justify-between items-center bg-dark p-3 rounded border border-gray-800">
                     <div className="flex gap-4">
                       <span className="text-primary font-bold">[{rule.keyword}]</span>
                       <span className="text-gray-300">{rule.response}</span>
                     </div>
                     <button onClick={() => removeRule(idx)} className="text-red-400 hover:text-red-300">刪除</button>
                   </li>
                 ))}
                 {rules.length === 0 && <p className="text-gray-500 text-sm italic">尚無規則。</p>}
               </ul>
             </div>
          </div>
          
          <div className="flex justify-end pt-4">
             <button onClick={handleSaveSettings} className="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded font-bold">
               儲存設定
             </button>
          </div>
        </div>
      )}

      {/* VIEW: MAINTENANCE (Existing) */}
      {activeTab === 'maintenance' && (
        <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
           <h3 className="text-lg font-bold text-white">API Token 狀態</h3>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-dark p-4 rounded border border-gray-600">
                <p className="text-gray-400 text-sm">目前 Token 狀態</p>
                <p className="text-green-400 font-bold text-lg">{settings.facebookToken ? '已連接 (Active)' : '未連接'}</p>
              </div>
              <div className="bg-dark p-4 rounded border border-gray-600">
                <p className="text-gray-400 text-sm">有效期限</p>
                <p className="text-white font-bold text-lg">
                  {settings.tokenExpiry ? new Date(settings.tokenExpiry).toLocaleDateString() : '未知 / 永久'}
                </p>
              </div>
           </div>

           <div className="pt-4">
             <button 
               onClick={handleRefreshToken}
               disabled={isRefreshing || !settings.facebookToken}
               className="bg-green-700 hover:bg-green-600 text-white px-6 py-3 rounded font-bold flex items-center gap-2 disabled:opacity-50"
             >
               {isRefreshing ? '重新整理中...' : '🔄 立即刷新 Token (延長效期)'}
             </button>
             {tokenMsg && <p className="mt-4 text-sm font-bold animate-pulse">{tokenMsg}</p>}
           </div>
           
           <div className="mt-6 p-4 bg-blue-900/20 border border-blue-900 rounded text-sm text-blue-200">
              💡 系統會嘗試自動使用 Refresh Token 延長權限。若 Token 已失效 (例如密碼變更)，您可能需要重新至品牌設定輸入新的 Token。
           </div>
        </div>
      )}

    </div>
  );
};

export default AutomationPanel;
