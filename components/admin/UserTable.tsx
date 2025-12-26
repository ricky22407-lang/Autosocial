
import React, { useState } from 'react';
import { UserProfile, UserRole } from '../../types';
import { updateUserRole, manualUpdateQuota, toggleUserSuspension } from '../../services/authService';

interface Props {
    users: UserProfile[];
    onRefresh: () => void;
    onSecurityAction: (uid: string, type: 'DOWNLOAD'|'DELETE') => void;
}

export const UserTable: React.FC<Props> = ({ users, onRefresh, onSecurityAction }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [editingQuotaId, setEditingQuotaId] = useState<string | null>(null);
    const [editUsed, setEditUsed] = useState<number>(0);
    const [editTotal, setEditTotal] = useState<number>(0);

    const filteredUsers = users.filter(u => u.email.includes(searchTerm) || u.user_id.includes(searchTerm));

    const handleRoleChange = async (uid: string, newRole: UserRole) => {
        if (confirm(`確定將用戶權限更改為 ${newRole}？(這會重置該用戶的總配額設定)`)) {
            await updateUserRole(uid, newRole);
            onRefresh();
        }
    };

    const handleManualQuotaSave = async (uid: string) => {
        await manualUpdateQuota(uid, editUsed, editTotal);
        setEditingQuotaId(null);
        onRefresh();
    };

    const handleToggleSuspend = async (uid: string, currentStatus: boolean | undefined) => {
        const action = currentStatus ? '啟用' : '停用';
        if (confirm(`⚠️ 警告：您確定要 ${action} 此帳號嗎？\n${currentStatus ? '啟用後用戶可正常登入。' : '停用後用戶將無法登入系統。'}`)) {
            if (!currentStatus) {
                const check = prompt("請輸入 'CONFIRM' 以確認停用帳號：");
                if (check !== 'CONFIRM') return;
            }
            await toggleUserSuspension(uid);
            onRefresh();
        }
    };

    return (
        <div className="bg-card rounded-xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex gap-4">
                <input 
                    placeholder="搜尋 Email 或 User ID..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white"
                />
                <button onClick={onRefresh} className="bg-gray-700 px-4 rounded text-white hover:bg-gray-600">重整</button>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-800 text-gray-400 text-sm">
                        <tr>
                            <th className="p-4">用戶資訊</th>
                            <th className="p-4">角色權限</th>
                            <th className="p-4">配額 (已用 / 總量)</th>
                            <th className="p-4">已解鎖功能</th>
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
                                        <option value="user">User</option>
                                        <option value="starter">Starter</option>
                                        <option value="pro">Pro</option>
                                        <option value="business">Business</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </td>
                                <td className="p-4">
                                    {editingQuotaId === user.user_id ? (
                                        <div className="flex items-center gap-2 text-sm">
                                            <input type="number" value={editUsed} onChange={e => setEditUsed(parseInt(e.target.value))} className="w-16 bg-dark border border-gray-600 rounded px-1 text-white text-center" />
                                            <span className="text-gray-400">/</span>
                                            <input type="number" value={editTotal} onChange={e => setEditTotal(parseInt(e.target.value))} className="w-16 bg-dark border border-gray-600 rounded px-1 text-white text-center" />
                                            <button onClick={() => handleManualQuotaSave(user.user_id)} className="text-green-400 text-xs ml-1">💾</button>
                                            <button onClick={() => setEditingQuotaId(null)} className="text-red-400 text-xs">❌</button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className={`${user.quota_used >= user.quota_total ? 'text-red-400 font-bold' : 'text-white'}`}>{user.quota_used}</span>
                                            <span className="text-gray-500">/</span>
                                            <span className="text-white">{user.quota_total}</span>
                                            <button onClick={() => { setEditingQuotaId(user.user_id); setEditUsed(user.quota_used); setEditTotal(user.quota_total); }} className="text-gray-500 hover:text-blue-400 text-xs ml-2">✎</button>
                                        </div>
                                    )}
                                </td>
                                <td className="p-4">
                                    <div className="flex flex-wrap gap-1">
                                        {user.unlockedFeatures && user.unlockedFeatures.length > 0 ? (
                                            user.unlockedFeatures.map(f => (
                                                <span key={f} className="text-[10px] bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded border border-indigo-700">
                                                    {f}
                                                </span>
                                            ))
                                        ) : <span className="text-xs text-gray-600">-</span>}
                                    </div>
                                </td>
                                <td className="p-4">
                                    {user.isSuspended ? <span className="bg-red-900 text-red-200 px-2 py-1 rounded text-xs font-bold">已停用</span> : <span className="bg-green-900 text-green-200 px-2 py-1 rounded text-xs">正常</span>}
                                </td>
                                <td className="p-4 text-right flex gap-2 justify-end">
                                    <button onClick={() => onSecurityAction(user.user_id, 'DOWNLOAD')} className="text-xs bg-blue-900/50 text-blue-200 px-2 py-1 rounded hover:bg-blue-900 border border-blue-800">📥</button>
                                    <button onClick={() => onSecurityAction(user.user_id, 'DELETE')} className="text-xs bg-red-900/50 text-red-200 px-2 py-1 rounded hover:bg-red-900 border border-red-800">🗑️</button>
                                    <button onClick={() => handleToggleSuspend(user.user_id, user.isSuspended)} className={`px-3 py-1 rounded text-xs border ${user.isSuspended ? 'border-green-600 text-green-400 hover:bg-green-900' : 'border-red-600 text-red-400 hover:bg-red-900'}`}>{user.isSuspended ? '啟用' : '停用'}</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
