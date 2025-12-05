import React, { useState } from 'react';
import { UserProfile } from '../types';
import { redeemReferralCode } from '../services/authService';

interface Props {
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const ReferralPanel: React.FC<Props> = ({ user, onQuotaUpdate }) => {
    const [friendCode, setFriendCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState({ text: '', type: '' });

    const handleCopy = () => {
        if (!user?.referralCode) return;
        navigator.clipboard.writeText(user.referralCode);
        alert("邀請碼已複製！");
    };

    const handleRedeem = async () => {
        if (!user || loading) return;
        setLoading(true);
        setMsg({ text: '', type: '' });

        try {
            const res = await redeemReferralCode(user.user_id, friendCode.trim());
            setMsg({ text: `🎉 恭喜！兌換成功，獲得 ${res.reward} 點免費配額！`, type: 'success' });
            onQuotaUpdate();
        } catch (e: any) {
            setMsg({ text: `❌ 失敗: ${e.message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    if (!user) return null;

    return (
        <div className="max-w-4xl mx-auto p-6 animate-fade-in space-y-8">
            <h2 className="text-3xl font-bold text-white text-center">🎁 推薦好友獎勵計畫</h2>
            <p className="text-center text-gray-400">邀請朋友加入 AutoSocial，雙方都能獲得免費配額！</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* My Code Section */}
                <div className="bg-gradient-to-br from-blue-900 to-indigo-900 p-8 rounded-2xl border border-blue-700 shadow-xl text-center">
                    <div className="text-4xl mb-4">📢</div>
                    <h3 className="text-xl font-bold text-white mb-2">您的專屬邀請碼</h3>
                    <p className="text-blue-200 text-sm mb-6">分享給朋友，當他們兌換時，您也將獲得 50 點獎勵！</p>
                    
                    <div className="bg-black/30 p-4 rounded-lg mb-4">
                        <span className="text-2xl font-mono font-bold text-white tracking-wider">
                            {user.referralCode || 'GENERATING...'}
                        </span>
                    </div>
                    
                    <button 
                        onClick={handleCopy}
                        className="w-full bg-white text-blue-900 font-bold py-3 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        複製邀請碼
                    </button>
                    
                    <div className="mt-4 text-sm text-blue-300">
                        已成功邀請: <span className="font-bold text-white">{user.referralCount || 0}</span> 人
                    </div>
                </div>

                {/* Redeem Section */}
                <div className="bg-card p-8 rounded-2xl border border-gray-700 shadow-xl">
                    <div className="text-4xl mb-4 text-center">🤝</div>
                    <h3 className="text-xl font-bold text-white mb-2 text-center">輸入朋友的邀請碼</h3>
                    <p className="text-gray-400 text-sm mb-6 text-center">輸入代碼，立即獲得 50 點新手獎勵 (限領一次)。</p>

                    {user.referredBy ? (
                         <div className="bg-green-900/30 border border-green-600 p-4 rounded-lg text-center">
                             <p className="text-green-400 font-bold">✅ 您已領取過新人獎勵</p>
                             <p className="text-xs text-gray-500 mt-1">推薦人代碼: {user.referredBy}</p>
                         </div>
                    ) : (
                        <div className="space-y-4">
                            <input 
                                value={friendCode}
                                onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
                                placeholder="輸入代碼 (例如 REF-ABC...)"
                                className="w-full bg-dark border border-gray-600 rounded-lg p-4 text-center text-white font-mono uppercase focus:border-primary outline-none"
                            />
                            
                            {msg.text && (
                                <p className={`text-center text-sm font-bold ${msg.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                                    {msg.text}
                                </p>
                            )}

                            <button 
                                onClick={handleRedeem}
                                disabled={loading || !friendCode}
                                className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
                            >
                                {loading ? '驗證中...' : '兌換獎勵'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReferralPanel;