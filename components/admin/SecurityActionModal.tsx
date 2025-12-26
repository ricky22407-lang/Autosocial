
import React, { useState } from 'react';
import { getUserUsageLogs, deleteUserUsageLogs } from '../../services/authService';

interface Props {
    targetUserId: string;
    actionType: 'DOWNLOAD' | 'DELETE';
    onClose: () => void;
}

export const SecurityActionModal: React.FC<Props> = ({ targetUserId, actionType, onClose }) => {
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
            if (actionType === 'DOWNLOAD') {
                const logs = await getUserUsageLogs(targetUserId);
                
                if (logs.length === 0) {
                    alert("該用戶尚無使用紀錄可供下載。");
                    setLoading(false);
                    return;
                }

                // Convert to CSV
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
            } else if (actionType === 'DELETE') {
                if (confirm(`⚠️ 嚴重警告：您即將永久刪除會員 ${targetUserId} 的所有使用紀錄 (Log)。此操作無法復原！\n\n確定執行？`)) {
                    await deleteUserUsageLogs(targetUserId);
                    alert("✅ 紀錄刪除成功！");
                }
            }
            
            onClose(); // Close on success
        } catch (e: any) {
            setError(`操作失敗: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const isDelete = actionType === 'DELETE';

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] animate-fade-in">
            <div className={`bg-opacity-90 p-6 rounded-xl border max-w-sm w-full shadow-2xl backdrop-blur-sm ${isDelete ? 'bg-red-950 border-red-500' : 'bg-gray-900 border-gray-600'}`}>
                <h3 className={`text-xl font-bold mb-2 flex items-center gap-2 ${isDelete ? 'text-red-400' : 'text-blue-400'}`}>
                    {isDelete ? '⚠️ 危險：刪除紀錄' : '🔒 資料管制區'}
                </h3>
                <p className="text-gray-300 text-sm mb-4">
                    您正在嘗試 <b>{isDelete ? '永久刪除' : '下載'}</b> 會員 <span className="font-mono text-xs bg-black px-1 rounded">{targetUserId}</span> 的使用紀錄。
                    <br/>
                    <br/>
                    依據隱私與資安規範，請輸入<b>管制密碼</b>以驗證權限。
                </p>
                
                <input 
                    type="password" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="輸入管制密碼..."
                    className="w-full bg-black border border-gray-700 rounded p-3 text-white focus:border-primary outline-none mb-2 text-center"
                />
                
                {error && <p className="text-red-400 text-sm font-bold text-center mb-2">{error}</p>}

                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded">
                        取消
                    </button>
                    <button 
                        onClick={handleConfirm} 
                        disabled={!password || loading}
                        className={`flex-1 text-white py-2 rounded font-bold disabled:opacity-50 ${isDelete ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}
                    >
                        {loading ? '處理中...' : (isDelete ? '確認刪除' : '確認下載')}
                    </button>
                </div>
            </div>
        </div>
    );
};
