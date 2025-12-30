
import { isMock } from './firebase';

export interface SubscribeParams {
    planId: 'starter' | 'pro' | 'business';
    provider: 'ecpay' | 'bank_api';
}

export const PaymentService = {
    /**
     * Initiate a subscription.
     * This will verify the user's intent and redirect to the payment gateway (ECPay/Bank).
     */
    subscribe: async (uid: string, params: SubscribeParams) => {
        if (isMock) {
            // Simulate Redirect
            const confirm = window.confirm(`[MOCK PAYMENT] 您選擇了 ${params.provider} 的 ${params.planId} 方案。\n\n點擊「確定」模擬跳轉至支付頁面 (成功)，點擊「取消」模擬失敗。`);
            if (confirm) {
                alert("模擬付款成功！後端 Webhook 已觸發。");
                window.location.reload(); // Reload to reflect changes (in real app, webhook updates DB)
            }
            return;
        }

        try {
            const res = await fetch('/api/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'create_subscription', 
                    payload: { uid, ...params } 
                })
            });

            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Payment init failed');

            if (data.htmlForm) {
                // ECPay returns an HTML form that needs to be auto-submitted
                const container = document.createElement('div');
                container.innerHTML = data.htmlForm;
                document.body.appendChild(container);
                const form = container.querySelector('form');
                if (form) form.submit();
                else throw new Error("Invalid payment form received");
            } else if (data.paymentUrl) {
                // Some gateways return a direct URL
                window.location.href = data.paymentUrl;
            }

        } catch (e: any) {
            console.error("Payment Error:", e);
            alert(`訂閱啟動失敗: ${e.message}`);
        }
    },

    /**
     * Cancel Subscription
     */
    cancel: async (uid: string) => {
        if (isMock) {
            alert("[MOCK] 訂閱已取消，下期將不再扣款。");
            return;
        }

        try {
            const res = await fetch('/api/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cancel_subscription', payload: { uid } })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            alert("✅ 訂閱已成功取消。您可繼續使用至本期結束。");
            window.location.reload();
        } catch (e: any) {
            alert(`取消失敗: ${e.message}`);
        }
    }
};
