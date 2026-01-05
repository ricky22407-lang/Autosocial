
import React, { useState, useEffect } from 'react';
import { 
  getAllUsers, generateAdminKey, 
  getDashboardStats, getSystemLogs, getSystemConfig, updateSystemConfig, 
  getUserReports
} from '../services/authService';
import { getApiServiceStatus } from '../services/geminiService'; // Import new service
import { db, isMock } from '../services/firebase';
import { UserProfile, UserRole, DashboardStats, LogEntry, SystemConfig, UserReport } from '../types';
import { SecurityActionModal } from './admin/SecurityActionModal';
import { ApiMonitor } from './admin/ApiMonitor';
import { UserTable } from './admin/UserTable';

interface Props {
  currentUser: UserProfile;
}

const TAB_NAMES: Record<string, string> = {
    dashboard: '儀表板',
    users: '會員管理',
    keys: '金鑰生成',
    api_monitor: '流量監控',
    reports: '回報單',
    system: '系統設定'
};

const AdminPanel: React.FC<Props> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'api_monitor' | 'reports' | 'system' | 'keys'>('dashboard');
  
  // State
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [apiUsage, setApiUsage] = useState<any>(null);
  const [apiStatus, setApiStatus] = useState<{ 
      keyStatus: boolean[]; 
      providers: { openai: boolean; ideogram: boolean; grok: boolean; };
  }>({ 
      keyStatus: [], 
      providers: { openai: false, ideogram: false, grok: false } 
  }); // New State
  const [securityTarget, setSecurityTarget] = useState<{uid: string, type: 'DOWNLOAD'|'DELETE'} | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [config, setConfig] = useState<SystemConfig>({ maintenanceMode: false, dryRunMode: false });
  const [generatedKey, setGeneratedKey] = useState('');

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
      if (activeTab === 'api_monitor') {
          loadApiUsage();
          const timer = setInterval(loadApiUsage, 5000);
          return () => clearInterval(timer);
      }
  }, [activeTab]);

  const loadAllData = async () => {
    setStats(await getDashboardStats());
    setUsers(await getAllUsers());
    setLogs(getSystemLogs());
    setConfig(getSystemConfig());
    setReports(await getUserReports());
  };

  const loadApiUsage = async () => {
      // Load Key Status
      const statusData = await getApiServiceStatus();
      setApiStatus(statusData);

      if (isMock) {
          setApiUsage({ key_1: 1250, key_2: 890, key_3: 450, key_4: 120, key_5: 5, total_calls: 2715 });
          return;
      }
      try {
          const doc = await db.collection('system_stats').doc('api_usage').get();
          if (doc.exists) setApiUsage(doc.data());
      } catch (e) { console.error("Load API Usage failed", e); }
  };

  const handleGenerateKey = async (type: 'RESET_QUOTA' | 'UPGRADE_ROLE', role?: UserRole) => {
    const key = await generateAdminKey(currentUser.user_id, type, role);
    setGeneratedKey(key);
    loadAllData();
  };

  const handleGenerateFeatureKey = async (feature: 'ANALYTICS' | 'AUTOMATION' | 'SEO' | 'THREADS') => {
    const key = await generateAdminKey(currentUser.user_id, 'UNLOCK_FEATURE', undefined, feature);
    setGeneratedKey(key);
    loadAllData();
  };

  const handleGeneratePointsKey = async (amount: number) => {
    // Generate ADD_POINTS key
    const key = await generateAdminKey(currentUser.user_id, 'ADD_POINTS', undefined, undefined, amount);
    setGeneratedKey(key);
    loadAllData();
  };

  const toggleDryRun = () => { updateSystemConfig({ dryRunMode: !config.dryRunMode }); loadAllData(); };
  const toggleMaintenance = () => { updateSystemConfig({ maintenanceMode: !config.maintenanceMode }); loadAllData(); };

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6 animate-fade-in pb-20">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-white">管理員中控台</h2>
        <div className="flex gap-2">
           {config.dryRunMode && <span className="px-3 py-1 bg-yellow-600 text-white rounded-full text-xs font-bold animate-pulse">模擬模式 (Dry Run) 開啟</span>}
           {config.maintenanceMode && <span className="px-3 py-1 bg-red-600 text-white rounded-full text-xs font-bold animate-pulse">維護模式開啟</span>}
        </div>
      </div>

      <div className="flex border-b border-gray-700 overflow-x-auto">
        {Object.keys(TAB_NAMES).map(tabKey => (
            <button 
                key={tabKey} 
                onClick={() => setActiveTab(tabKey as any)} 
                className={`px-6 py-3 font-bold whitespace-nowrap transition-colors ${activeTab === tabKey ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-white'}`}
            >
                {TAB_NAMES[tabKey]}
            </button>
        ))}
      </div>

      {activeTab === 'dashboard' && stats && (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card p-6 rounded-xl border border-gray-700"><p className="text-gray-400 text-sm">總會員數</p><p className="text-3xl font-bold text-white mt-2">{stats.totalUsers}</p></div>
                <div className="bg-card p-6 rounded-xl border border-gray-700"><p className="text-gray-400 text-sm">今日活躍用戶 (DAU)</p><p className="text-3xl font-bold text-green-400 mt-2">{stats.activeUsersToday}</p></div>
                <div className="bg-card p-6 rounded-xl border border-gray-700"><p className="text-gray-400 text-sm">今日 API 使用量</p><p className="text-3xl font-bold text-blue-400 mt-2">{stats.totalApiCallsToday}</p></div>
                <div className="bg-card p-6 rounded-xl border border-gray-700"><p className="text-gray-400 text-sm">待處理回報</p><p className="text-3xl font-bold text-red-400 mt-2">{reports.filter(r => r.status === 'OPEN').length}</p></div>
            </div>
        </div>
      )}

      {activeTab === 'keys' && (
          <div className="bg-card p-6 rounded-xl border border-gray-700 space-y-6">
              <h3 className="text-xl font-bold text-white border-b border-gray-700 pb-2">🔑 生成管理金鑰 (Admin Key)</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Left Column: Roles & Features */}
                  <div className="space-y-6">
                      <div>
                          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider font-bold">配額與角色升級 (會重置現有方案)</p>
                          <div className="flex flex-wrap gap-2">
                               <button onClick={() => handleGenerateKey('UPGRADE_ROLE', 'starter')} className="bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded font-bold text-xs">Starter Key</button>
                               <button onClick={() => handleGenerateKey('UPGRADE_ROLE', 'pro')} className="bg-purple-700 hover:bg-purple-600 text-white px-3 py-2 rounded font-bold text-xs">Pro Key</button>
                               <button onClick={() => handleGenerateKey('UPGRADE_ROLE', 'business')} className="bg-yellow-700 hover:bg-yellow-600 text-white px-3 py-2 rounded font-bold text-xs">Business Key</button>
                               <button onClick={() => handleGenerateKey('RESET_QUOTA')} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold text-xs">Reset Quota</button>
                          </div>
                      </div>
                      <div>
                          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider font-bold">單項功能解鎖</p>
                          <div className="flex flex-wrap gap-2">
                               {['ANALYTICS', 'AUTOMATION', 'SEO', 'THREADS'].map(f => (
                                   <button key={f} onClick={() => handleGenerateFeatureKey(f as any)} className="bg-blue-900/50 border border-blue-600 hover:bg-blue-900 text-blue-200 px-3 py-2 rounded font-bold text-xs">解鎖: {f}</button>
                               ))}
                          </div>
                      </div>
                  </div>

                  {/* Right Column: Points Top-up */}
                  <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-4 rounded-xl border border-yellow-500/30">
                      <p className="text-xs text-yellow-400 mb-3 uppercase tracking-wider font-bold flex items-center gap-2">
                          💰 點數紅包 (優惠/讓利專用)
                      </p>
                      <p className="text-[10px] text-gray-400 mb-4">
                          產生的金鑰有效期為 24 小時。兌換後，點數將加入用戶的帳戶中 (效期 1 年)。
                      </p>
                      <div className="flex flex-col gap-2">
                           <button onClick={() => handleGeneratePointsKey(30)} className="w-full bg-yellow-600 hover:bg-yellow-500 text-black px-4 py-3 rounded font-black text-sm transition-all flex justify-between items-center shadow-lg hover:shadow-yellow-500/20">
                               <span>🧧 加值 30 點</span>
                               <span className="text-[10px] opacity-70">價值 $30</span>
                           </button>
                           <button onClick={() => handleGeneratePointsKey(50)} className="w-full bg-yellow-600 hover:bg-yellow-500 text-black px-4 py-3 rounded font-black text-sm transition-all flex justify-between items-center shadow-lg hover:shadow-yellow-500/20">
                               <span>🧧 加值 50 點</span>
                               <span className="text-[10px] opacity-70">價值 $50</span>
                           </button>
                           <button onClick={() => handleGeneratePointsKey(100)} className="w-full bg-yellow-600 hover:bg-yellow-500 text-black px-4 py-3 rounded font-black text-sm transition-all flex justify-between items-center shadow-lg hover:shadow-yellow-500/20">
                               <span>🧧 加值 100 點</span>
                               <span className="text-[10px] opacity-70">價值 $100</span>
                           </button>
                      </div>
                  </div>
              </div>

              {generatedKey && <div className="mt-6 p-4 bg-black/50 border border-green-500 rounded text-center animate-pulse-slow"><p className="text-green-400 font-bold mb-2">✅ 金鑰生成成功！請複製 (24小時內有效)：</p><p className="text-3xl font-mono text-white select-all tracking-wider font-black">{generatedKey}</p></div>}
          </div>
      )}

      {/* Pass apiStatus to Monitor */}
      {activeTab === 'api_monitor' && <ApiMonitor apiUsage={apiUsage} apiStatus={apiStatus} />}

      {activeTab === 'users' && <UserTable users={users} onRefresh={loadAllData} onSecurityAction={(uid, type) => setSecurityTarget({uid, type})} />}

      {activeTab === 'reports' && (
          <div className="bg-card p-6 rounded-xl border border-gray-700">
              <div className="flex justify-between items-center mb-4"><h3 className="text-xl font-bold text-white">🚨 用戶問題回報 ({reports.length})</h3><button onClick={loadAllData} className="text-sm text-primary hover:underline">刷新</button></div>
              {reports.length === 0 ? <div className="text-center py-10 text-gray-500 border border-dashed border-gray-700 rounded">目前無待處理的回報單。</div> : (
                  <div className="space-y-4">
                      {reports.map((report) => (
                          <div key={report.id} className="bg-dark p-4 rounded border border-gray-600">
                              <div className="flex justify-between items-start mb-2"><div><span className="font-bold text-white">{report.userEmail}</span><span className="text-xs text-gray-500 ml-2">{new Date(report.timestamp).toLocaleString()}</span></div><span className="text-xs bg-red-900 text-red-200 px-2 py-1 rounded">{report.status}</span></div>
                              <div className="bg-gray-800 p-3 rounded text-sm text-gray-200 mb-2">{report.description}</div>
                              <div className="text-xs text-gray-500 font-mono break-all bg-black/20 p-2 rounded"><div>View: {report.currentView}</div><div>UA: {report.userAgent}</div></div>
                          </div>
                      ))}
                  </div>
              )}
          </div>
      )}

      {activeTab === 'system' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                  <div className="bg-card p-6 rounded-xl border border-gray-700">
                      <h3 className="text-xl font-bold text-white mb-4">🔧 系統全域設定</h3>
                      <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-dark rounded border border-gray-600"><div><div className="font-bold text-white">🧪 模擬模式 (Dry Run)</div><div className="text-xs text-gray-400">開啟後，不扣除真實配額，不連接外部 API。</div></div><button onClick={toggleDryRun} className={`w-12 h-6 rounded-full transition-colors relative ${config.dryRunMode ? 'bg-yellow-500' : 'bg-gray-600'}`}><div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${config.dryRunMode ? 'translate-x-6' : ''}`}></div></button></div>
                          <div className="flex items-center justify-between p-4 bg-dark rounded border border-gray-600"><div><div className="font-bold text-white">🚧 系統維護模式</div><div className="text-xs text-gray-400">開啟後，一般用戶無法登入。</div></div><button onClick={toggleMaintenance} className={`w-12 h-6 rounded-full transition-colors relative ${config.maintenanceMode ? 'bg-red-500' : 'bg-gray-600'}`}><div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${config.maintenanceMode ? 'translate-x-6' : ''}`}></div></button></div>
                      </div>
                  </div>
              </div>
              <div className="bg-card p-6 rounded-xl border border-gray-700 flex flex-col h-[500px]">
                  <div className="flex justify-between items-center mb-4"><h3 className="text-xl font-bold text-white">📜 完整錯誤日誌</h3><button onClick={loadAllData} className="text-sm text-primary hover:underline">刷新</button></div>
                  <div className="flex-1 overflow-y-auto bg-dark p-2 rounded border border-gray-800 font-mono text-xs">
                      {logs.map(log => (<div key={log.id} className="mb-2 pb-2 border-b border-gray-800 last:border-0"><div className="flex gap-2 mb-1"><span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span><span className={`font-bold ${log.status === 'error' ? 'text-red-500' : log.status === 'warning' ? 'text-yellow-500' : 'text-green-500'}`}>[{log.status.toUpperCase()}]</span><span className="text-blue-400">{log.action}</span></div><div className="text-gray-300 pl-4 border-l-2 border-gray-700">User: {log.userEmail} <br/> Details: {log.details}</div></div>))}
                  </div>
              </div>
          </div>
      )}
      
      {securityTarget && <SecurityActionModal targetUserId={securityTarget.uid} actionType={securityTarget.type} onClose={() => setSecurityTarget(null)} />}
    </div>
  );
};

export default AdminPanel;
