
import React, { useState, useEffect } from 'react';
import { 
  getAllUsers, generateAdminKey, 
  getDashboardStats, getSystemLogs, getSystemConfig, updateSystemConfig, 
  getUserReports
} from '../services/authService';
import { getApiServiceStatus } from '../services/geminiService';
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [apiUsage, setApiUsage] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [securityTarget, setSecurityTarget] = useState<{uid: string, type: 'DOWNLOAD'|'DELETE'} | null>(null);
  const [generatedKey, setGeneratedKey] = useState('');

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
        const [statsData, usersData, reportsData] = await Promise.all([
            getDashboardStats(),
            getAllUsers(),
            getUserReports()
        ]);
        setStats(statsData);
        setUsers(usersData);
        setReports(reportsData);
    } catch (e) {
        console.error("Admin Load Error:", e);
    } finally {
        setIsLoading(false);
    }
  };

  const handleGenerateKey = async (type: 'RESET_QUOTA' | 'UPGRADE_ROLE', role?: UserRole) => {
    const key = await generateAdminKey(currentUser.user_id, type, role);
    setGeneratedKey(key);
    loadAllData();
  };

  if (isLoading && users.length === 0) {
      return (
          <div className="h-96 flex flex-col items-center justify-center gap-4 text-gray-500">
              <div className="loader border-t-primary scale-125"></div>
              <p className="font-bold tracking-widest uppercase text-xs">Loading Admin Data...</p>
          </div>
      );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6 animate-fade-in pb-24 pt-4">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-4xl font-black text-white tracking-tighter">系統管理中控台</h2>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Admin Control Center</p>
        </div>
        <button onClick={loadAllData} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-bold transition-all border border-gray-700">↻ 立即刷新</button>
      </div>

      <div className="flex border-b border-gray-800 overflow-x-auto gap-2 py-2">
        {Object.keys(TAB_NAMES).map(tabKey => (
            <button 
                key={tabKey} 
                onClick={() => setActiveTab(tabKey as any)} 
                className={`px-6 py-3 font-black text-xs uppercase tracking-widest transition-all rounded-xl ${activeTab === tabKey ? 'bg-primary/10 text-primary border border-primary/20' : 'text-gray-500 hover:text-white'}`}
            >
                {TAB_NAMES[tabKey]}
            </button>
        ))}
      </div>

      <div className="pt-4">
        {activeTab === 'dashboard' && stats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <DashboardCard label="總會員數" value={stats.totalUsers} icon="👥" color="text-white" />
                <DashboardCard label="今日活躍" value={stats.activeUsersToday} icon="🔥" color="text-green-400" />
                <DashboardCard label="API 總負載" value={stats.totalApiCallsToday} icon="⚡" color="text-blue-400" />
                <DashboardCard label="待處回報" value={reports.filter(r => r.status === 'OPEN').length} icon="🚨" color="text-red-400" />
            </div>
        )}

        {activeTab === 'users' && (
            <UserTable users={users} onRefresh={loadAllData} onSecurityAction={(uid, type) => setSecurityTarget({uid, type})} />
        )}

        {activeTab === 'keys' && (
            <div className="glass-card p-10 rounded-[2.5rem] space-y-6">
                <h3 className="text-2xl font-black text-white">🔑 金鑰生成</h3>
                <div className="flex flex-wrap gap-4">
                    <button onClick={() => handleGenerateKey('UPGRADE_ROLE', 'pro')} className="bg-purple-700 text-white px-6 py-3 rounded-2xl font-bold">生成 PRO 金鑰</button>
                    <button onClick={() => handleGenerateKey('UPGRADE_ROLE', 'business')} className="bg-yellow-700 text-white px-6 py-3 rounded-2xl font-bold">生成 Business 金鑰</button>
                    <button onClick={() => handleGenerateKey('RESET_QUOTA')} className="bg-gray-700 text-white px-6 py-3 rounded-2xl font-bold">生成重置金鑰</button>
                </div>
                {generatedKey && (
                    <div className="mt-6 p-6 bg-black border border-green-500 rounded-2xl text-center">
                        <p className="text-green-400 font-bold mb-2">生成成功！</p>
                        <p className="text-3xl font-mono text-white select-all">{generatedKey}</p>
                    </div>
                )}
            </div>
        )}
      </div>
      
      {securityTarget && <SecurityActionModal targetUserId={securityTarget.uid} actionType={securityTarget.type} onClose={() => setSecurityTarget(null)} />}
    </div>
  );
};

const DashboardCard = ({ label, value, icon, color }: any) => (
    <div className="bg-card p-8 rounded-[2rem] border border-gray-800 shadow-xl flex justify-between items-center">
        <div>
            <p className="text-[10px] text-gray-500 font-black uppercase mb-1">{label}</p>
            <p className={`text-3xl font-black ${color}`}>{value.toLocaleString()}</p>
        </div>
        <div className="text-2xl opacity-40">{icon}</div>
    </div>
);

export default AdminPanel;
