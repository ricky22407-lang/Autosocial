import React, { useState, useEffect } from 'react';
import { getAllUsers, generateAdminKey, updateUserRole, resetUserQuota } from '../services/authService';
import { UserProfile, UserRole } from '../types';

interface Props {
  currentUser: UserProfile;
}

const AdminDashboard: React.FC<Props> = ({ currentUser }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [generatedKey, setGeneratedKey] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const data = await getAllUsers();
    setUsers(data);
  };

  const handleGenerateKey = async (type: 'RESET_QUOTA' | 'UPGRADE_ROLE', role?: UserRole) => {
    setLoading(true);
    const key = await generateAdminKey(currentUser.user_id, type, role);
    setGeneratedKey(key);
    setLoading(false);
  };

  const handleResetQuota = async (uid: string) => {
    if (confirm('確定重置此會員配額？')) {
      await resetUserQuota(uid);
      loadUsers();
    }
  };

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    await updateUserRole(uid, newRole);
    loadUsers();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in p-6">
      <h2 className="text-3xl font-bold text-white">👮 管理員後台</h2>

      {/* Key Generation */}
      <div className="bg-card p-6 rounded-xl border border-gray-700">
        <h3 className="text-xl font-bold text-white mb-4">🔑 生成管理金鑰 (Admin Key)</h3>
        <div className="flex flex-wrap gap-4">
          <button 
            onClick={() => handleGenerateKey('RESET_QUOTA')}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold"
          >
            生成「重置配額」金鑰
          </button>
          <button 
            onClick={() => handleGenerateKey('UPGRADE_ROLE', 'pro')}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded font-bold"
          >
            生成「升級 PRO」金鑰
          </button>
          <button 
            onClick={() => handleGenerateKey('UPGRADE_ROLE', 'business')}
            disabled={loading}
            className="bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded font-bold"
          >
            生成「升級 Business」金鑰
          </button>
        </div>
        
        {generatedKey && (
          <div className="mt-4 p-4 bg-green-900/30 border border-green-500 rounded text-green-300">
            <p className="font-bold">生成成功！請複製金鑰 (10分鐘內有效)：</p>
            <p className="text-2xl font-mono mt-2 select-all">{generatedKey}</p>
          </div>
        )}
      </div>

      {/* User Management */}
      <div className="bg-card p-6 rounded-xl border border-gray-700 overflow-x-auto">
        <h3 className="text-xl font-bold text-white mb-4">👥 會員管理 ({users.length})</h3>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Quota (Used/Total)</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.user_id} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="p-3 text-sm">{u.email}</td>
                <td className="p-3">
                  <select 
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.user_id, e.target.value as UserRole)}
                    className="bg-dark border border-gray-600 rounded px-2 py-1 text-xs text-white"
                  >
                    <option value="user">User</option>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="business">Business</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="p-3">
                  <span className={`${u.quota_used >= u.quota_total ? 'text-red-400' : 'text-green-400'}`}>
                    {u.quota_used}
                  </span> / {u.quota_total}
                </td>
                <td className="p-3 flex gap-2">
                  <button 
                    onClick={() => handleResetQuota(u.user_id)}
                    className="text-xs bg-red-900/50 text-red-200 px-2 py-1 rounded hover:bg-red-900"
                  >
                    重置配額
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDashboard;