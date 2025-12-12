





import React, { useState, useEffect } from 'react';
import { 
  getAllUsers, generateAdminKey, updateUserRole, 
  getDashboardStats, getSystemLogs, getSystemConfig, updateSystemConfig, 
  toggleUserSuspension, manualUpdateQuota, getUserReports, getUserUsageLogs
} from '../services/authService';
import { UserProfile, UserRole, DashboardStats, LogEntry, SystemConfig, UserReport } from '../types';

interface Props {
  currentUser: UserProfile;
}

// --- Secure Download Modal ---
const DownloadSecurityModal = ({ targetUserId, onClose }: { targetUserId: string, onClose: () => void }) => {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleConfirm = async () => {
        if (password !== 'elrmp4m4RICKY!') {
            setError('密碼錯誤 (Access Denied)');
            return;
        }
        
        setLoading(true);
        setError('');
        
        try {
            const logs = await getUserUsageLogs(targetUserId);
            
            if (logs.length === 0) {
                alert("該用戶尚無使用紀錄可供下載。");
                setLoading(false);
                return;
            }

            // Convert to CSV
            // BOM for Excel Chinese support
            let csvContent = "\uFEFFTimeStamp,Action,Topic,Prompt,Result(Truncated),Params\n";
            
            logs.forEach(log => {
                const ts = new Date(log.ts).toLocaleString().replace(/,/g, ' ');
                const act = log.act;
                const topic = (log.topic || '').replace(/"/g, '""');
                const prompt = (log.prmt || '').replace(/"/g, '""').replace(/\n/g, ' ');
                const res = (log.res || '').replace(/"/g, '""').replace(/\n/g, ' ');
                const params = (log.params || '').replace(/"/g, '""');
                
                csvContent += `${ts},"${act}","${topic}","${prompt}","${res}","${params}"\n`;
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `user_logs_${targetUserId}_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            onClose(); // Close on success
        } catch (e: any) {
            setError(`下載失敗: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] animate-fade-in">
            <div className="bg-red-950/30 p-6 rounded-xl border border-red-500/50 max-w-sm w-full shadow-2xl backdrop-blur-sm">
                <h3 className="text-xl font-bold text-red-400 mb-2 flex items-center gap-2">
                    🔒 資料管制區
                </h3>
                <p className="text-gray-300 text-sm mb-4">
                    您正在嘗試下載會員 <span className="font-mono text-xs bg-black px-1 rounded">{targetUserId}</span> 的完整使用紀錄。
                    <br/>
                    <br/>
                    依據隱私與資安規範，請輸入<b>管制密碼</b>以解鎖下載權限。
                </p>
                
                <input 
                    type="password" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="輸入管制密碼..."
                    className="w-full bg-black border border-red-900 rounded p-3 text-white focus:border-red-500 outline-none mb-2 text-center"
                />
                
                {error && <p className="text-red-400 text-sm font-bold text-center mb-2">{error}</p>}

                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded">
                        取消
                    </button>
                    <button 
                        onClick={handleConfirm} 
                        disabled={!password || loading}
                        className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded font-bold disabled:opacity-50"
                    >
                        {loading ? '處理中...' : '確認下載'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const AdminPanel: React.FC<Props> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'reports' | 'system'>('dashboard');
  
  // Dashboard State
  const [stats, setStats] = useState<DashboardStats | null>(null);
  
  // Users State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Reports State
  const [reports, setReports] = useState<UserReport[]>([]);

  // Quota Edit State
  const [editingQuotaId, setEditingQuotaId] = useState<string | null>(null);
  const [editUsed, setEditUsed] = useState<number>(0);
  const [editTotal, setEditTotal] = useState<number>(0);

  // Secure Download State
  const [downloadTargetId, setDownloadTargetId] = useState<string | null>(null);

  // System State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [config, setConfig] = useState<SystemConfig>({ maintenanceMode: false, dryRunMode: false });
  const [generatedKey, setGeneratedKey] = useState('');

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setStats(await getDashboardStats());
    setUsers(await getAllUsers());
    setLogs(getSystemLogs());
    setConfig(getSystemConfig());
    setReports(await getUserReports());
  };

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    if (confirm(`確定將用戶權限更改為 ${newRole}？(這會重置該用戶的總配額設定)`)) {
        await updateUserRole(uid, newRole);
        loadAllData();
    }
  };

  const handleToggleSuspend = async (uid: string, currentStatus: boolean | undefined) => {
      const action = currentStatus ? '啟用' : '停用';
      if (confirm(`⚠️ 警告：您確定要 ${action} 此帳號嗎？\n${currentStatus ? '啟用後用戶可正常登入。' : '停用後用戶將無法登入系統。'}`)) {
          // Double confirm for suspend
          if (!currentStatus) {
              const check = prompt("請輸入 'CONFIRM' 以確認停用帳號：");
              if (check !== 'CONFIRM') return;
          }
          await toggleUserSuspension(uid);
          loadAllData();
      }
  };

  const handleManualQuotaSave = async (uid: string) => {
      await manualUpdateQuota(uid, editUsed, editTotal);
      setEditingQuotaId(null);
      loadAllData();
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

  const toggleDryRun = () => {
      updateSystemConfig({ dryRunMode: !config.dryRunMode });
      loadAllData();
  };

  const toggleMaintenance = () => {
      updateSystemConfig({ maintenanceMode: !config.maintenanceMode });
      loadAllData();
  };

  // Filter Users
  const filteredUsers = users.filter(u => u.email.includes(searchTerm) || u.user_id.includes(searchTerm));

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6 animate-fade-in pb-20">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-white">👮 管理員中控台</h2>
        <div className="flex gap-2">
           {config.dryRunMode && <span className="px-3 py-1 bg-yellow-600 text-white rounded-full text-xs font-bold animate-pulse">DRY RUN MODE ON</span>}
           {config.maintenanceMode && <span className="px-3 py-1 bg-red-600 text-white rounded-full text-xs font-bold animate-pulse">維護模式開啟</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 overflow-x-auto">
        <button onClick={() => setActiveTab('dashboard')} className={`px-6 py-3 font-bold whitespace-nowrap ${activeTab === 'dashboard' ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}>📊 儀表板</button>
        <button onClick={() => setActiveTab('users')} className={`px-6 py-3 font-bold whitespace-nowrap ${activeTab === 'users' ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}>👥 會員管理</button>
        <button onClick={() => setActiveTab('reports')} className={`px-6 py-3 font-bold whitespace-nowrap ${activeTab === 'reports' ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}>🚨 問題回報</button>
        <button onClick={() => setActiveTab('system')} className={`px-6 py-3 font-bold whitespace-nowrap ${activeTab === 'system' ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}>🛠 系統設定</button>
      </div>

      {/* VIEW: DASHBOARD */}
      {activeTab === 'dashboard' && stats && (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card p-6 rounded-xl border border-gray-700">
                    <p className="text-gray-400 text-sm">總會員數</p>
                    <p className="text-3xl font-bold text-white mt-2">{stats.totalUsers}</p>
                </div>
                <div className="bg-card p-6 rounded-xl border border-gray-700">
                    <p className="text-gray-400 text-sm">今日活躍用戶 (DAU)</p>
                    <p className="text-3xl font-bold text-green-400 mt-2">{stats.activeUsersToday}</p>
                </div>
                <div className="bg-card p-6 rounded-xl border border-gray-700">
                    <p className="text-gray-400 text-sm">今日 API 使用量</p>
                    <p className="text-3xl font-bold text-blue-400 mt-2">{stats.totalApiCallsToday}</p>
                </div>
                <div className="bg-card p-6 rounded-xl border border-gray-700">
                    <p className="text-gray-400 text-sm">待處理回報</p>
                    <p className="text-3xl font-bold text-red-400 mt-2">{reports.filter(r => r.status === 'OPEN').length}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card p-6 rounded-xl border border-gray-700">
                    <h3 className="text-xl font-bold text-white mb-4">🔑 方案升級金鑰 (Upgrade Key)</h3>
                    <div className="flex flex-wrap gap-2 mb-4">
                         <button 
                            onClick={() => handleGenerateKey('UPGRADE_ROLE', 'starter')}
                            className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded font-bold"
                          >
                            Starter (創作者)
                          </button>
                          <button 
                            onClick={() => handleGenerateKey('UPGRADE_ROLE', 'pro')}
                            className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 rounded font-bold"
                          >
                            Pro (專業版)
                          </button>
                          <button 
                            onClick={() => handleGenerateKey('UPGRADE_ROLE', 'business')}
                            className="bg-yellow-700 hover:bg-yellow-600 text-white px-4 py-2 rounded font-bold"
                          >
                            Business (企業版)
                          </button>
                          <button 
                            onClick={() => handleGenerateKey('RESET_QUOTA')}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-bold"
                          >
                            重置配額
                          </button>
                    </div>

                    <h3 className="text-xl font-bold text-white mb-4">🔑 單項功能解鎖</h3>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleGenerateFeatureKey('ANALYTICS')} className="bg-purple-900 text-purple-200 px-4 py-2 rounded text-sm hover:bg-purple-800 border border-purple-700">📊 數據分析</button>
                        <button onClick={() => handleGenerateFeatureKey('AUTOMATION')} className="bg-indigo-900 text-indigo-200 px-4 py-2 rounded text-sm hover:bg-indigo-800 border border-indigo-700">🤖 自動化</button>
                        <button onClick={() => handleGenerateFeatureKey('SEO')} className="bg-teal-900 text-teal-200 px-4 py-2 rounded text-sm hover:bg-teal-800 border border-teal-700">📝 SEO 文章</button>
                        <button onClick={() => handleGenerateFeatureKey('THREADS')} className="bg-pink-900 text-pink-200 px-4 py-2 rounded text-sm hover:bg-pink-800 border border-pink-700">🧵 Threads 養號</button>
                    </div>
                    {generatedKey && (
                        <div className="mt-4 p-3 bg-black/30 border border-green-500 rounded text-green-400 font-mono text-center select-all">
                            {generatedKey}
                        </div>
                    )}
                </div>
                
                <div className="bg-card p-6 rounded-xl border border-gray-700 overflow-y-auto max-h-[300px]">
                    <h3 className="text-xl font-bold text-white mb-4">📝 最近系統日誌</h3>
                    <ul className="space-y-2 text-xs">
                        {logs.slice(0, 10).map(log => (
                            <li key={log.id} className="border-b border-gray-800 pb-1">
                                <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                <span className={`mx-2 font-bold ${log.status === 'error' ? 'text-red-400' : log.status === 'warning' ? 'text-yellow-400' : 'text-green-400'}`}>[{log.status.toUpperCase()}]</span>
                                <span className="text-gray-300">{log.action}: {log.details}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
      )}

      {/* VIEW: REPORTS */}
      {activeTab === 'reports' && (
          <div className="bg-card p-6 rounded-xl border border-gray-700">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-white">🚨 用戶問題回報 ({reports.length})</h3>
                  <button onClick={loadAllData} className="text-sm text-primary hover:underline">刷新</button>
              </div>

              {reports.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 border border-dashed border-gray-700 rounded">
                      目前無待處理的回報單。
                  </div>
              ) : (
                  <div className="space-y-4">
                      {reports.map((report) => (
                          <div key={report.id} className="bg-dark p-4 rounded border border-gray-600">
                              <div className="flex justify-between items-start mb-2">
                                  <div>
                                      <span className="font-bold text-white">{report.userEmail}</span>
                                      <span className="text-xs text-gray-500 ml-2">{new Date(report.timestamp).toLocaleString()}</span>
                                  </div>
                                  <span className="text-xs bg-red-900 text-red-200 px-2 py-1 rounded">
                                      {report.status}
                                  </span>
                              </div>
                              <div className="bg-gray-800 p-3 rounded text-sm text-gray-200 mb-2">
                                  {report.description}
                              </div>
                              <div className="text-xs text-gray-500 font-mono break-all bg-black/20 p-2 rounded">
                                  <div>View: {report.currentView}</div>
                                  <div>UA: {report.userAgent}</div>
                              </div>
                          </div>
                      ))}
                  </div>
              )}
          </div>
      )}

      {/* VIEW: USERS */}
      {activeTab === 'users' && (
        <div className="bg-card rounded-xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex gap-4">
                <input 
                    placeholder="搜尋 Email 或 User ID..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white"
                />
                <button onClick={loadAllData} className="bg-gray-700 px-4 rounded text-white hover:bg-gray-600">重整</button>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-800 text-gray-400 text-sm">
                        <tr>
                            <th className="p-4">用戶資訊</th>
                            <th className="p-4">角色權限</th>
                            <th className="p-4">配額 (已用 / 總量)</th>
                            <th className="p-4">解鎖功能</th>
                            <th className="p-4">狀態</th>
                            <th className="p-4 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {filteredUsers.map(user => (
                            <tr key={user.user_id} className="hover:bg-gray-800/50 transition-colors">
                                <td className="p-4">
                                    <div className="font-bold text-white">{user.email}</div>
                                    <div className="text-xs text-gray-500 font-mono">{user.user_id}</div>
                                </td>
                                <td className="p-4">
                                    <select 
                                        value={user.role} 
                                        onChange={(e) => handleRoleChange(user.user_id, e.target.value as UserRole)}
                                        className={`bg-dark border border-gray-600 rounded px-2 py-1 text-xs text-white ${user.role === 'admin' ? 'text-red-400 font-bold' : user.role === 'business' ? 'text-yellow-400 font-bold' : ''}`}
                                    >
                                        <option value="user">User (Free)</option>
                                        <option value="starter">Starter</option>
                                        <option value="pro">Pro</option>
                                        <option value="business">Business</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </td>
                                <td className="p-4">
                                    {editingQuotaId === user.user_id ? (
                                        <div className="flex items-center gap-2 text-sm">
                                            <input 
                                                type="number" 
                                                value={editUsed} 
                                                onChange={e => setEditUsed(parseInt(e.target.value))}
                                                className="w-16 bg-dark border border-gray-600 rounded px-1 text-white text-center"
                                                title="已用配額"
                                            />
                                            <span className="text-gray-400">/</span>
                                            <input 
                                                type="number" 
                                                value={editTotal} 
                                                onChange={e => setEditTotal(parseInt(e.target.value))}
                                                className="w-16 bg-dark border border-gray-600 rounded px-1 text-white text-center"
                                                title="總配額"
                                            />
                                            <button onClick={() => handleManualQuotaSave(user.user_id)} className="text-green-400 text-xs ml-1">💾</button>
                                            <button onClick={() => setEditingQuotaId(null)} className="text-red-400 text-xs">❌</button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className={`${user.quota_used >= user.quota_total ? 'text-red-400 font-bold' : 'text-white'}`}>
                                                {user.quota_used}
                                            </span>
                                            <span className="text-gray-500">/</span>
                                            <span className="text-white">{user.quota_total}</span>
                                            <button 
                                                onClick={() => { 
                                                    setEditingQuotaId(user.user_id); 
                                                    setEditUsed(user.quota_used);
                                                    setEditTotal(user.quota_total);
                                                }}
                                                className="text-gray-500 hover:text-blue-400 text-xs ml-2"
                                                title="手動修改"
                                            >
                                                ✎
                                            </button>
                                        </div>
                                    )}
                                </td>
                                <td className="p-4 text-xs text-gray-400">
                                   {user.unlockedFeatures && user.unlockedFeatures.length > 0 
                                      ? user.unlockedFeatures.join(', ') 
                                      : '-'}
                                </td>
                                <td className="p-4">
                                    {user.isSuspended ? (
                                        <span className="bg-red-900 text-red-200 px-2 py-1 rounded text-xs font-bold">已停用</span>
                                    ) : (
                                        <span className="bg-green-900 text-green-200 px-2 py-1 rounded text-xs">正常</span>
                                    )}
                                </td>
                                <td className="p-4 text-right flex gap-2 justify-end">
                                    <button 
                                        onClick={() => setDownloadTargetId(user.user_id)}
                                        className="text-xs bg-blue-900/50 text-blue-200 px-2 py-1 rounded hover:bg-blue-900 border border-blue-800"
                                        title="下載用戶優化紀錄"
                                    >
                                        📥 紀錄
                                    </button>
                                    <button 
                                        onClick={() => handleToggleSuspend(user.user_id, user.isSuspended)}
                                        className={`px-3 py-1 rounded text-xs border ${user.isSuspended ? 'border-green-600 text-green-400 hover:bg-green-900' : 'border-red-600 text-red-400 hover:bg-red-900'}`}
                                    >
                                        {user.isSuspended ? '啟用' : '停用'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* VIEW: SYSTEM */}
      {activeTab === 'system' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                  <div className="bg-card p-6 rounded-xl border border-gray-700">
                      <h3 className="text-xl font-bold text-white mb-4">🔧 系統全域設定</h3>
                      
                      <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-dark rounded border border-gray-600">
                              <div>
                                  <div className="font-bold text-white">🧪 Dry Run 模擬模式</div>
                                  <div className="text-xs text-gray-400">開啟後，所有 AI 生成與發文皆為模擬，不扣除真實配額，不連接外部 API。</div>
                              </div>
                              <button 
                                onClick={toggleDryRun}
                                className={`w-12 h-6 rounded-full transition-colors relative ${config.dryRunMode ? 'bg-yellow-500' : 'bg-gray-600'}`}
                              >
                                  <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${config.dryRunMode ? 'translate-x-6' : ''}`}></div>
                              </button>
                          </div>

                          <div className="flex items-center justify-between p-4 bg-dark rounded border border-gray-600">
                              <div>
                                  <div className="font-bold text-white">🚧 系統維護模式</div>
                                  <div className="text-xs text-gray-400">開啟後，除管理員外，一般用戶將無法登入系統。</div>
                              </div>
                              <button 
                                onClick={toggleMaintenance}
                                className={`w-12 h-6 rounded-full transition-colors relative ${config.maintenanceMode ? 'bg-red-500' : 'bg-gray-600'}`}
                              >
                                  <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${config.maintenanceMode ? 'translate-x-6' : ''}`}></div>
                              </button>
                          </div>
                      </div>
                  </div>
              </div>

              <div className="bg-card p-6 rounded-xl border border-gray-700 flex flex-col h-[500px]">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-white">📜 完整錯誤日誌</h3>
                      <button onClick={loadAllData} className="text-sm text-primary hover:underline">刷新</button>
                  </div>
                  <div className="flex-1 overflow-y-auto bg-dark p-2 rounded border border-gray-800 font-mono text-xs">
                      {logs.map(log => (
                          <div key={log.id} className="mb-2 pb-2 border-b border-gray-800 last:border-0">
                              <div className="flex gap-2 mb-1">
                                  <span className="text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
                                  <span className={`font-bold ${log.status === 'error' ? 'text-red-500' : log.status === 'warning' ? 'text-yellow-500' : 'text-green-500'}`}>
                                      {log.status.toUpperCase()}]
                                  </span>
                                  <span className="text-blue-400">{log.action}</span>
                              </div>
                              <div className="text-gray-300 pl-4 border-l-2 border-gray-700">
                                  User: {log.userEmail} <br/>
                                  Details: {log.details}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}
      
      {/* Secure Download Modal */}
      {downloadTargetId && (
          <DownloadSecurityModal 
              targetUserId={downloadTargetId} 
              onClose={() => setDownloadTargetId(null)} 
          />
      )}
    </div>
  );
};

export default AdminPanel;