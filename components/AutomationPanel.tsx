

import React, { useState, useEffect } from 'react';
import { BrandSettings, AutoReplyRule, AutoPilotConfig, ThreadsAutoPilotConfig } from '../types';
import { api } from '../services/apiClient';
import { getCurrentUser, updateUserSettings } from '../services/authService';

interface Props {
  settings: BrandSettings;
  onSave: (settings: BrandSettings) => void;
}

const AutomationPanel: React.FC<Props> = ({ settings, onSave }) => {
  const [activeTab, setActiveTab] = useState<'autopilot' | 'threads_autopilot' | 'reply'>('autopilot');
  
  // Auto Reply State
  const [replyEnabled, setReplyEnabled] = useState(settings.autoReply?.enabled || false);
  const [defaultResponse, setDefaultResponse] = useState(settings.autoReply?.defaultResponse || '');
  const [rules, setRules] = useState<AutoReplyRule[]>(settings.autoReply?.rules || []);
  const [newKeyword, setNewKeyword] = useState('');
  const [newResponse, setNewResponse] = useState('');

  // FB Auto Pilot State
  const defaultAutoPilot: AutoPilotConfig = {
      enabled: false,
      frequency: 'daily',
      postWeekDays: [1], 
      postTime: '09:00',
      source: 'trending',
      keywords: [],
      mediaTypePreference: 'image'
  };

  const [apConfig, setApConfig] = useState<AutoPilotConfig>(() => {
      const config = settings.autoPilot || defaultAutoPilot;
      if ((config as any).postWeekDay !== undefined && !config.postWeekDays) {
          config.postWeekDays = [(config as any).postWeekDay];
      }
      if (!config.postWeekDays) config.postWeekDays = [1];
      config.mediaTypePreference = 'image';
      return config;
  });

  // Threads Auto Pilot State
  const defaultThreadsAP: ThreadsAutoPilotConfig = {
      enabled: false,
      frequency: 'daily',
      postWeekDays: [1],
      postTime: '10:00',
      imageMode: 'ai_url',
      targetAccountIds: []
  };

  const [threadsApConfig, setThreadsApConfig] = useState<ThreadsAutoPilotConfig>(() => {
      const config = settings.threadsAutoPilot || defaultThreadsAP;
      // Legacy compatibility: If targetAccountIds is undefined, default to ALL existing accounts initially (or none, let's do all to be safe)
      if (!config.targetAccountIds) {
          config.targetAccountIds = settings.threadsAccounts?.map(a => a.id) || [];
      }
      return config;
  });

  const [newApKeyword, setNewApKeyword] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [triggeringThreads, setTriggeringThreads] = useState(false);

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  const handleSaveSettings = async () => {
    const newSettings = {
      ...settings,
      autoReply: { enabled: replyEnabled, defaultResponse, rules },
      autoPilot: apConfig,
      threadsAutoPilot: threadsApConfig
    };
    
    // 1. Local Update
    onSave(newSettings);
    
    // 2. Cloud Sync (For Backend Cron)
    const user = getCurrentUser();
    if (user) {
        await updateUserSettings(user.uid, newSettings);
    }
    
    alert('設定已儲存！(同步至雲端)');
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

  // FB Trigger
  const handleTriggerAutoPilot = async () => {
      setTriggering(true);
      try {
          const result = await api.automation.trigger(settings);
          alert(`🚀 FB 任務執行成功！\n主題: ${result.topic}\n狀態: ${result.message}`);
      } catch (e: any) {
          console.error(e);
          alert(`啟動失敗: ${e.message}`);
      } finally {
          setTriggering(false);
      }
  };

  // Threads Trigger
  const handleTriggerThreadsAP = async () => {
      // Temporarily save current config to settings object to pass to trigger
      const tempSettings = { ...settings, threadsAutoPilot: threadsApConfig };
      
      setTriggeringThreads(true);
      try {
          // Use centralized API client instead of dynamic import to avoid Vite build warnings
          const result = await api.automation.triggerThreads(tempSettings);
          
          alert(`🚀 Threads 任務執行成功！\n帳號: ${result.targetAccount}\n主題: ${result.topic}\n狀態: ${result.message}`);
      } catch (e: any) {
          console.error(e);
          alert(`啟動失敗: ${e.message}`);
      } finally {
          setTriggeringThreads(false);
      }
  };

  const addApKeyword = () => {
      if (newApKeyword) {
          setApConfig({...apConfig, keywords: [...apConfig.keywords, newApKeyword]});
          setNewApKeyword('');
      }
  };

  const removeApKeyword = (index: number) => {
      setApConfig(prev => ({
          ...prev,
          keywords: prev.keywords.filter((_, i) => i !== index)
      }));
  };

  const toggleWeekDay = (config: any, setConfig: any, dayIndex: number) => {
      const current = config.postWeekDays || [];
      if (current.includes(dayIndex)) {
          if (current.length === 1) return;
          setConfig({...config, postWeekDays: current.filter((d: number) => d !== dayIndex).sort()});
      } else {
          if (current.length >= 6) {
              alert("最多只能選擇 6 天！");
              return;
          }
          setConfig({...config, postWeekDays: [...current, dayIndex].sort()});
      }
  };

  const toggleThreadAccount = (id: string) => {
      const current = threadsApConfig.targetAccountIds || [];
      if (current.includes(id)) {
          setThreadsApConfig({...threadsApConfig, targetAccountIds: current.filter(aid => aid !== id)});
      } else {
          setThreadsApConfig({...threadsApConfig, targetAccountIds: [...current, id]});
      }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20">
      <h2 className="text-2xl font-bold text-white mb-6">🤖 自動化中心</h2>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-6 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('autopilot')}
          className={`px-4 md:px-6 py-3 font-bold transition-colors whitespace-nowrap ${activeTab === 'autopilot' ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-white'}`}
        >
          🚀 FB 自動發文
        </button>
        <button 
          onClick={() => setActiveTab('threads_autopilot')}
          className={`px-4 md:px-6 py-3 font-bold transition-colors whitespace-nowrap ${activeTab === 'threads_autopilot' ? 'text-white border-b-2 border-white' : 'text-gray-400 hover:text-white'}`}
        >
          🧵 Threads 自動養號
        </button>
        <button 
          onClick={() => setActiveTab('reply')}
          className={`px-4 md:px-6 py-3 font-bold transition-colors whitespace-nowrap ${activeTab === 'reply' ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-white'}`}
        >
          💬 FB 自動回覆
        </button>
      </div>

      {/* VIEW: FB AUTO PILOT */}
      {activeTab === 'autopilot' && (
          <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
              <div className="flex items-center justify-between border-b border-gray-700 pb-6">
                  <div>
                      <h3 className="text-xl font-bold text-white">Facebook AutoPilot</h3>
                      <p className="text-sm text-gray-400">系統將根據設定自動生成並發佈貼文至粉絲專頁。</p>
                  </div>
                  <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${apConfig.enabled ? 'text-green-400' : 'text-gray-500'}`}>
                          {apConfig.enabled ? '已啟用' : '已停用'}
                      </span>
                      <button 
                          onClick={() => setApConfig({...apConfig, enabled: !apConfig.enabled})}
                          className={`w-12 h-6 rounded-full transition-colors relative ${apConfig.enabled ? 'bg-green-600' : 'bg-gray-600'}`}
                      >
                          <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${apConfig.enabled ? 'translate-x-6' : ''}`}></div>
                      </button>
                  </div>
              </div>

              <div className={`space-y-6 transition-opacity duration-200 ${apConfig.enabled ? '' : 'opacity-40 pointer-events-none grayscale'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                          <label className="block text-sm text-gray-400 mb-1">發文頻率</label>
                          <select 
                              value={apConfig.frequency} 
                              onChange={(e) => setApConfig({...apConfig, frequency: e.target.value as any})}
                              className="w-full bg-dark border border-gray-600 rounded p-2 text-white"
                          >
                              <option value="daily">每天 (Daily)</option>
                              <option value="weekly">每週 (Weekly)</option>
                          </select>
                      </div>
                      
                      {apConfig.frequency === 'weekly' && (
                          <div className="md:col-span-2">
                              <label className="block text-sm text-gray-400 mb-1">每週發文日</label>
                              <div className="flex flex-wrap gap-2 bg-dark p-3 rounded border border-gray-700">
                                  {weekDays.map((d, i) => {
                                      const isSelected = apConfig.postWeekDays?.includes(i);
                                      return (
                                          <button 
                                              key={i}
                                              onClick={() => toggleWeekDay(apConfig, setApConfig, i)}
                                              className={`w-10 h-10 rounded text-sm font-bold transition-all border ${isSelected ? 'bg-primary border-primary text-white shadow-md transform scale-105' : 'bg-transparent border-gray-600 text-gray-400 hover:border-gray-400'}`}
                                          >
                                              {d}
                                          </button>
                                      );
                                  })}
                              </div>
                          </div>
                      )}

                      <div>
                          <label className="block text-sm text-gray-400 mb-1">發文時間</label>
                          <input 
                              type="time" 
                              value={apConfig.postTime}
                              onChange={(e) => setApConfig({...apConfig, postTime: e.target.value})}
                              className="w-full bg-dark border border-gray-600 rounded p-2 text-white"
                          />
                      </div>
                  </div>

                  <div>
                      <label className="block text-sm text-gray-400 mb-1">靈感來源</label>
                      <div className="flex flex-wrap gap-4 mb-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={apConfig.source === 'trending'} onChange={() => setApConfig({...apConfig, source: 'trending'})} />
                              <span className="text-white">🔥 熱門趨勢</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={apConfig.source === 'competitor'} onChange={() => setApConfig({...apConfig, source: 'competitor'})} />
                              <span className="text-white">⚔️ 競品話題</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={apConfig.source === 'keywords'} onChange={() => setApConfig({...apConfig, source: 'keywords'})} />
                              <span className="text-white">🎯 關鍵字</span>
                          </label>
                      </div>
                      {apConfig.source === 'keywords' && (
                          <div className="bg-dark p-4 rounded border border-gray-600">
                              <div className="flex gap-2 mb-2">
                                  <input 
                                      value={newApKeyword}
                                      onChange={e => setNewApKeyword(e.target.value)}
                                      placeholder="輸入關鍵字..."
                                      className="flex-1 bg-gray-800 border border-gray-600 rounded p-2 text-white text-sm"
                                  />
                                  <button onClick={addApKeyword} className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded">新增</button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                  {apConfig.keywords.map((k, i) => (
                                      <span key={i} className="bg-blue-900 text-blue-200 px-2 py-1 rounded text-xs flex items-center gap-1">
                                          {k} <button onClick={() => removeApKeyword(i)} className="hover:text-white">×</button>
                                      </span>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              </div>
              
              <div className="pt-4 border-t border-gray-700 flex justify-between items-center">
                  <button onClick={handleTriggerAutoPilot} disabled={!apConfig.enabled || triggering} className="text-yellow-400 border border-yellow-600 px-4 py-2 rounded font-bold text-sm disabled:opacity-50 hover:bg-yellow-900/30">
                        {triggering ? '執行中...' : '⚡ 手動觸發一次 (扣 1 點)'}
                  </button>
                  <button onClick={handleSaveSettings} className="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded font-bold">儲存設定</button>
              </div>
          </div>
      )}

      {/* VIEW: THREADS AUTO PILOT */}
      {activeTab === 'threads_autopilot' && (
          <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
              <div className="flex items-center justify-between border-b border-gray-700 pb-6">
                  <div>
                      <h3 className="text-xl font-bold text-white">Threads 自動養號農場</h3>
                      <p className="text-sm text-gray-400">定期從下方「指定名單」中挑選帳號，針對熱門時事發文。</p>
                  </div>
                  <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${threadsApConfig.enabled ? 'text-green-400' : 'text-gray-500'}`}>
                          {threadsApConfig.enabled ? '已啟用' : '已停用'}
                      </span>
                      <button 
                          onClick={() => setThreadsApConfig({...threadsApConfig, enabled: !threadsApConfig.enabled})}
                          className={`w-12 h-6 rounded-full transition-colors relative ${threadsApConfig.enabled ? 'bg-green-600' : 'bg-gray-600'}`}
                      >
                          <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${threadsApConfig.enabled ? 'translate-x-6' : ''}`}></div>
                      </button>
                  </div>
              </div>

              <div className={`space-y-6 transition-opacity duration-200 ${threadsApConfig.enabled ? '' : 'opacity-40 pointer-events-none grayscale'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                          <label className="block text-sm text-gray-400 mb-1">發文頻率</label>
                          <select 
                              value={threadsApConfig.frequency} 
                              onChange={(e) => setThreadsApConfig({...threadsApConfig, frequency: e.target.value as any})}
                              className="w-full bg-dark border border-gray-600 rounded p-2 text-white"
                          >
                              <option value="daily">每天 (Daily)</option>
                              <option value="weekly">每週 (Weekly)</option>
                          </select>
                      </div>

                      {threadsApConfig.frequency === 'weekly' && (
                          <div className="md:col-span-2">
                              <label className="block text-sm text-gray-400 mb-1">每週發文日</label>
                              <div className="flex flex-wrap gap-2 bg-dark p-3 rounded border border-gray-700">
                                  {weekDays.map((d, i) => {
                                      const isSelected = threadsApConfig.postWeekDays.includes(i);
                                      return (
                                          <button 
                                              key={i}
                                              onClick={() => toggleWeekDay(threadsApConfig, setThreadsApConfig, i)}
                                              className={`w-10 h-10 rounded text-sm font-bold transition-all border ${isSelected ? 'bg-white border-white text-black shadow-md' : 'bg-transparent border-gray-600 text-gray-400 hover:border-gray-400'}`}
                                          >
                                              {d}
                                          </button>
                                      );
                                  })}
                              </div>
                          </div>
                      )}

                      <div>
                          <label className="block text-sm text-gray-400 mb-1">發文時間</label>
                          <input 
                              type="time" 
                              value={threadsApConfig.postTime}
                              onChange={(e) => setThreadsApConfig({...threadsApConfig, postTime: e.target.value})}
                              className="w-full bg-dark border border-gray-600 rounded p-2 text-white"
                          />
                      </div>

                      <div>
                          <label className="block text-sm text-gray-400 mb-1">圖片來源模式</label>
                          <select 
                              value={threadsApConfig.imageMode} 
                              onChange={(e) => setThreadsApConfig({...threadsApConfig, imageMode: e.target.value as any})}
                              className="w-full bg-dark border border-gray-600 rounded p-2 text-white"
                          >
                              <option value="ai_url">🎨 AI 生成 (Pollinations) - 推薦</option>
                              <option value="stock_url">📷 圖庫搜尋 (LoremFlickr)</option>
                              <option value="none">❌ 純文字 (無圖片)</option>
                          </select>
                      </div>

                      {/* Targeted Account Selection */}
                      <div className="md:col-span-2">
                          <label className="block text-sm text-gray-400 mb-2">指定養號名單 (多選)</label>
                          <div className="bg-dark p-4 rounded border border-gray-600 max-h-40 overflow-y-auto">
                              {settings.threadsAccounts && settings.threadsAccounts.length > 0 ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {settings.threadsAccounts.map(acc => (
                                          <label key={acc.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-800 cursor-pointer">
                                              <input 
                                                  type="checkbox" 
                                                  checked={threadsApConfig.targetAccountIds?.includes(acc.id)}
                                                  onChange={() => toggleThreadAccount(acc.id)}
                                                  className="w-4 h-4 rounded border-gray-500 text-primary focus:ring-primary bg-gray-900"
                                              />
                                              <span className={`text-sm ${acc.isActive ? 'text-white' : 'text-gray-500'}`}>
                                                  {acc.username}
                                                  {!acc.isActive && <span className="text-[10px] ml-1">(暫停中)</span>}
                                              </span>
                                          </label>
                                      ))}
                                  </div>
                              ) : (
                                  <div className="text-gray-500 text-sm">
                                      目前無帳號。請先至「Threads 養號」頁面新增帳號。
                                  </div>
                              )}
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                             * 系統將從勾選的活躍帳號中，隨機挑選一位進行發文 (每次執行扣 1 點)。若不勾選任何帳號，將無法執行。
                          </p>
                      </div>
                  </div>
              </div>

              <div className="pt-4 border-t border-gray-700 flex justify-between items-center">
                  <button onClick={handleTriggerThreadsAP} disabled={!threadsApConfig.enabled || triggeringThreads} className="text-yellow-400 border border-yellow-600 px-4 py-2 rounded font-bold text-sm disabled:opacity-50 hover:bg-yellow-900/30">
                        {triggeringThreads ? '執行中...' : '⚡ 手動觸發一次 (扣 1 點)'}
                  </button>
                  <button onClick={handleSaveSettings} className="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded font-bold">儲存設定</button>
              </div>
          </div>
      )}

      {/* VIEW: REPLY */}
      {activeTab === 'reply' && (
          <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
              <div className="flex items-center justify-between border-b border-gray-700 pb-6">
                  <div>
                      <h3 className="text-xl font-bold text-white">Messenger 自動回覆</h3>
                  </div>
                  <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${replyEnabled ? 'text-green-400' : 'text-gray-500'}`}>
                          {replyEnabled ? '已啟用' : '已停用'}
                      </span>
                      <button 
                          onClick={() => setReplyEnabled(!replyEnabled)}
                          className={`w-12 h-6 rounded-full transition-colors relative ${replyEnabled ? 'bg-green-600' : 'bg-gray-600'}`}
                      >
                          <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${replyEnabled ? 'translate-x-6' : ''}`}></div>
                      </button>
                  </div>
              </div>

              <div>
                  <label className="block text-sm text-gray-400 mb-1">預設回覆</label>
                  <textarea 
                      value={defaultResponse}
                      onChange={e => setDefaultResponse(e.target.value)}
                      placeholder="小編目前不在線上..."
                      className="w-full h-24 bg-dark border border-gray-600 rounded p-3 text-white"
                  />
              </div>

              <div>
                  <label className="block text-sm text-gray-400 mb-2">關鍵字規則</label>
                  <div className="space-y-2 mb-4">
                      {rules.map((rule, i) => (
                          <div key={i} className="flex gap-2 items-start bg-dark p-3 rounded border border-gray-600">
                              <div className="flex-1">
                                  <div className="text-xs text-blue-400 font-bold mb-1">關鍵字: {rule.keyword}</div>
                                  <div className="text-sm text-gray-300">{rule.response}</div>
                              </div>
                              <button onClick={() => removeRule(i)} className="text-red-400 hover:text-red-300">刪除</button>
                          </div>
                      ))}
                  </div>

                  <div className="bg-dark/50 p-4 rounded border border-gray-600">
                      <input 
                          value={newKeyword}
                          onChange={e => setNewKeyword(e.target.value)}
                          placeholder="觸發關鍵字"
                          className="w-full bg-dark border border-gray-600 rounded p-2 text-white mb-2 text-sm"
                      />
                      <textarea 
                          value={newResponse}
                          onChange={e => setNewResponse(e.target.value)}
                          placeholder="回覆內容"
                          className="w-full h-20 bg-dark border border-gray-600 rounded p-2 text-white mb-2 text-sm"
                      />
                      <button onClick={addRule} className="w-full bg-gray-600 hover:bg-gray-500 text-white py-2 rounded text-sm font-bold">新增規則</button>
                  </div>
              </div>

              <div className="pt-4 border-t border-gray-700 flex justify-end">
                  <button onClick={handleSaveSettings} className="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded font-bold">儲存回覆設定</button>
              </div>
          </div>
      )}
    </div>
  );
};

export default AutomationPanel;