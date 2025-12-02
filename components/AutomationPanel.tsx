
import React, { useState, useEffect } from 'react';
import { BrandSettings, AutoReplyRule, AutoPilotConfig } from '../types';
import { api } from '../services/apiClient';

interface Props {
  settings: BrandSettings;
  onSave: (settings: BrandSettings) => void;
}

const AutomationPanel: React.FC<Props> = ({ settings, onSave }) => {
  const [activeTab, setActiveTab] = useState<'autopilot' | 'reply'>('autopilot');
  
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
      postWeekDays: [1], // Default Monday
      postTime: '09:00',
      source: 'trending',
      keywords: [],
      mediaTypePreference: 'image'
  };

  const [apConfig, setApConfig] = useState<AutoPilotConfig>(() => {
      const config = settings.autoPilot || defaultAutoPilot;
      // Migration logic: if old config has postWeekDay but no postWeekDays, convert it
      if ((config as any).postWeekDay !== undefined && !config.postWeekDays) {
          config.postWeekDays = [(config as any).postWeekDay];
      }
      if (!config.postWeekDays) config.postWeekDays = [1];
      // Force Media Type to Image only as requested
      config.mediaTypePreference = 'image';
      return config;
  });

  const [newApKeyword, setNewApKeyword] = useState('');
  const [triggering, setTriggering] = useState(false);

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

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

  const handleTriggerAutoPilot = async () => {
      setTriggering(true);
      try {
          const result = await api.automation.trigger(settings);
          alert(`🚀 任務執行成功！\n主題: ${result.topic}\n狀態: ${result.message}`);
      } catch (e: any) {
          console.error(e);
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

  const removeApKeyword = (index: number) => {
      setApConfig(prev => ({
          ...prev,
          keywords: prev.keywords.filter((_, i) => i !== index)
      }));
  };

  const toggleWeekDay = (dayIndex: number) => {
      const current = apConfig.postWeekDays || [];
      if (current.includes(dayIndex)) {
          // Prevent unselecting the last day if enabled (optional UX choice, but good for validity)
          if (current.length === 1) return;
          setApConfig({...apConfig, postWeekDays: current.filter(d => d !== dayIndex).sort()});
      } else {
          // Max 6 days
          if (current.length >= 6) {
              alert("最多只能選擇 6 天！");
              return;
          }
          setApConfig({...apConfig, postWeekDays: [...current, dayIndex].sort()});
      }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20">
      <h2 className="text-2xl font-bold text-white mb-6">🤖 自動化中心</h2>

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
      </div>

      {/* VIEW: AUTO PILOT */}
      {activeTab === 'autopilot' && (
          <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
              <div className="flex items-center justify-between border-b border-gray-700 pb-6">
                  <div>
                      <h3 className="text-xl font-bold text-white">AutoPilot 自動發文</h3>
                      <p className="text-sm text-gray-400">啟用後，系統將根據您的設定自動生成並發佈貼文。</p>
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

              {/* Locked Container when Disabled */}
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
                              <label className="block text-sm text-gray-400 mb-1">每週發文日 (可複選，至多 6 天)</label>
                              <div className="flex flex-wrap gap-2 bg-dark p-3 rounded border border-gray-700">
                                  {weekDays.map((d, i) => {
                                      const isSelected = apConfig.postWeekDays?.includes(i);
                                      return (
                                          <button 
                                              key={i}
                                              onClick={() => toggleWeekDay(i)}
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
                      
                      <div>
                          <label className="block text-sm text-gray-400 mb-1">素材偏好</label>
                          <div className="w-full bg-dark border border-gray-600 rounded p-2 text-gray-400 cursor-not-allowed">
                              🖼️ 僅限圖片 (Image Only)
                          </div>
                      </div>
                  </div>

                  <div>
                      <label className="block text-sm text-gray-400 mb-1">靈感來源</label>
                      <div className="flex gap-4 mb-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                  type="radio" 
                                  checked={apConfig.source === 'trending'} 
                                  onChange={() => setApConfig({...apConfig, source: 'trending'})} 
                              />
                              <span className="text-white">🔥 自動搜尋熱門趨勢</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                  type="radio" 
                                  checked={apConfig.source === 'competitor'} 
                                  onChange={() => setApConfig({...apConfig, source: 'competitor'})} 
                              />
                              <span className="text-white">⚔️ 參考競品話題</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                  type="radio" 
                                  checked={apConfig.source === 'keywords'} 
                                  onChange={() => setApConfig({...apConfig, source: 'keywords'})} 
                              />
                              <span className="text-white">🎯 指定關鍵字輪播</span>
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
                                          {k}
                                          <button onClick={() => removeApKeyword(i)} className="hover:text-white">×</button>
                                      </span>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              </div>
              
              <div className="pt-4 border-t border-gray-700 flex justify-between items-center">
                  <div className={`${apConfig.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
                     <button 
                        onClick={handleTriggerAutoPilot} 
                        disabled={!apConfig.enabled || triggering}
                        className="text-yellow-400 hover:text-yellow-300 border border-yellow-600 px-4 py-2 rounded font-bold text-sm disabled:opacity-50"
                    >
                        {triggering ? '執行中...' : '⚡ 立即手動觸發一次'}
                    </button>
                  </div>

                  {/* Save button is always enabled to allow saving "Disabled" state */}
                  <button onClick={handleSaveSettings} className="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded font-bold">儲存 AutoPilot 設定</button>
              </div>
          </div>
      )}

      {/* VIEW: REPLY */}
      {activeTab === 'reply' && (
          <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
              <div className="flex items-center justify-between border-b border-gray-700 pb-6">
                  <div>
                      <h3 className="text-xl font-bold text-white">Messenger 自動回覆</h3>
                      <p className="text-sm text-gray-400">設定關鍵字自動回覆，提升客服效率。</p>
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
                  <label className="block text-sm text-gray-400 mb-1">預設回覆 (當無匹配關鍵字時)</label>
                  <textarea 
                      value={defaultResponse}
                      onChange={e => setDefaultResponse(e.target.value)}
                      placeholder="例如：小編目前不在線上，稍後會儘快回覆您..."
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
                      <h4 className="text-sm font-bold text-gray-300 mb-2">新增規則</h4>
                      <input 
                          value={newKeyword}
                          onChange={e => setNewKeyword(e.target.value)}
                          placeholder="觸發關鍵字 (例如：價錢)"
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