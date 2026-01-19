
import { useState } from 'react';
import { UserProfile } from '../../../types';
import { redeemReferralCode } from '../../../services/authService';

export const useReferral = (user: UserProfile | null, onQuotaUpdate: () => void) => {
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

    return {
        friendCode, setFriendCode,
        loading, msg,
        handleCopy, handleRedeem
    };
};
