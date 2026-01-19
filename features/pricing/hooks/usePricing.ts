
import { useState } from 'react';
import { UserProfile } from '../../../types';
import { PaymentService } from '../../../services/paymentService';

export const usePricing = (user: UserProfile | null) => {
    const [showTerms, setShowTerms] = useState(false);
    const [loadingSub, setLoadingSub] = useState(false);
    const [topUpUnits, setTopUpUnits] = useState(1);
    const [loadingTopUp, setLoadingTopUp] = useState(false);

    const handleSubscribe = async (planId: 'starter' | 'pro') => {
        if (!user) return alert("請先登入");
        if (loadingSub) return;
        
        const provider = confirm("選擇支付方式：\n\n按「確定」使用 信用卡 (綠界 ECPay)\n按「取消」使用 銀行轉帳 (Bank API)") 
            ? 'ecpay' 
            : 'bank_api';

        setLoadingSub(true);
        try {
            await PaymentService.subscribe(user.user_id, { planId, provider });
        } finally {
            setLoadingSub(false);
        }
    };

    const handleTopUp = async () => {
        if (!user) return alert("請先登入");
        if (loadingTopUp) return;

        const amount = topUpUnits * 100;
        const provider = confirm(`確認購買 ${amount} 點 (NT$${amount})？\n\n按「確定」使用 信用卡 (綠界)\n按「取消」使用 銀行轉帳`) 
            ? 'ecpay' 
            : 'bank_api';

        setLoadingTopUp(true);
        try {
            await PaymentService.topUp(user.user_id, { quantity: topUpUnits, provider });
        } finally {
            setLoadingTopUp(false);
        }
    };

    const handleCancel = async () => {
        if (confirm("確定要取消訂閱嗎？\n\n取消後，您仍可使用至本期結束，下個月將不再扣款。")) {
            if (user) await PaymentService.cancel(user.user_id);
        }
    };

    return {
        showTerms, setShowTerms,
        loadingSub,
        topUpUnits, setTopUpUnits,
        loadingTopUp,
        handleSubscribe, handleTopUp, handleCancel
    };
};
