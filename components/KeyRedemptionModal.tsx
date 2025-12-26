
import React, { useState } from 'react';
import { useAdminKey } from '../services/authService';
import { UserProfile } from '../types';

interface Props {
    user: UserProfile;
    onClose: () => void;
    onSuccess: () => void;
}

const KeyRedemptionModal: React.FC<Props> = ({ user, onClose, onSuccess }) => {
    const [keyInput, setKeyInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const handleSubmit = async () => {
        if (!keyInput.trim()) return;
        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            const res = await useAdminKey(user.user_id, keyInput.trim());
            if (res.success) {
                setSuccessMsg(res.message || '兌換成功！');
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 2000);
            } else {
                setError(res.message || '兌換失敗');
            }
        } catch (e: any) {
            setError(e.message || '發生未知錯誤');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] animate-fade-in p-4">
            <div className="bg-card p-8 rounded-xl border border-gray-600 max-w-md w-full relative shadow-2xl">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>
                
                <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                    🔑 兌換金鑰
                </h3>
                <p className="text-gray-400 text-sm mb-6">
                    請輸入管理員提供的升級或解鎖代碼。
                </p>

                {successMsg ? (
                    <div className="py-6 text-center text-green-400 font-bold bg-green-900/20 rounded-lg">
                        ✅ {successMsg}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <input 
                            value={keyInput}
                            onChange={e => setKeyInput(e.target.value.toUpperCase())}
                            placeholder="KEY-..."
                            className="w-full bg-dark border border-gray-500 rounded-lg p-4 text-white font-mono text-center text-lg uppercase focus:border-primary outline-none"
                        />
                        
                        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                        <button 
                            onClick={handleSubmit}
                            disabled={loading || !keyInput}
                            className="w-full bg-primary hover:bg-blue-600 text-white py-3 rounded-lg font-bold transition-all disabled:opacity-50"
                        >
                            {loading ? '驗證中...' : '確認兌換'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default KeyRedemptionModal;
