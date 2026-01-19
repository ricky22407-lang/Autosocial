
import React from 'react';
import { UserProfile, SubscriptionStatus } from '../../types';
import TermsModal from './components/TermsModal';
import { usePricing } from './hooks/usePricing';

interface Props {
    user: UserProfile | null;
    onContactClick: () => void;
}

const PricingPanel: React.FC<Props> = ({ user, onContactClick }) => {
    const {
        showTerms, setShowTerms,
        loadingSub,
        topUpUnits, setTopUpUnits,
        loadingTopUp,
        handleSubscribe, handleTopUp, handleCancel
    } = usePricing(user);

    // Subscription Status
    const subStatus: SubscriptionStatus = user?.subscription?.status || 'none';
    const isSubscribed = subStatus === 'active';
    const currentPlan = user?.subscription?.planId;
    const nextBill = user?.subscription?.nextBillingDate;

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 animate-fade-in pb-24">
            
            {/* Header */}
            <div className="text-center mb-10">
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tighter mb-3">
                    會員訂閱與點數說明
                </h2>
                
                {isSubscribed ? (
                    <div className="bg-green-900/30 border border-green-500/50 p-4 rounded-xl inline-block mt-4 max-w-lg">
                        <p className="text-green-400 font-bold text-lg mb-1">✅ 目前訂閱中：{currentPlan === 'pro' ? 'Pro 專業版' : 'Starter 方案'}</p>
                        <p className="text-sm text-green-200/70">
                            下期扣款日：{nextBill ? new Date(nextBill).toLocaleDateString() : '計算中'}
                        </p>
                        <button onClick={handleCancel} className="mt-3 text-xs text-red-400 hover:text-white underline">取消訂閱 (停止自動扣款)</button>
                    </div>
                ) : (
                    <p className="text-gray-400 font-medium text-sm md:text-base max-w-2xl mx-auto">
                        升級會員，解鎖完整自動化功能與每月點數回饋。<br/>
                        <span className="text-primary font-bold">支援信用卡定期定額 (ECPay) 與 銀行轉帳</span>
                    </p>
                )}
            </div>

            {/* Subscription Tiers Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                
                {/* Starter Plan */}
                <div className={`bg-card p-8 rounded-3xl border flex flex-col relative overflow-hidden group transition-all ${currentPlan === 'starter' && isSubscribed ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 'border-gray-700 hover:border-primary/50'}`}>
                    <h3 className="text-xl font-bold text-white mb-2">Starter 方案</h3>
                    <div className="flex items-baseline gap-1 mb-4">
                        <span className="text-4xl font-black text-primary">NT$399</span>
                        <span className="text-gray-500 text-sm">/ 月</span>
                    </div>
                    <div className="bg-primary/10 text-primary px-3 py-1 rounded-lg text-xs font-bold inline-block w-fit mb-6 border border-primary/20">
                        🎁 每月贈送 300 點 (價值 $300)
                    </div>
                    <ul className="space-y-3 text-sm text-gray-400 mb-8 flex-1">
                        <li className="flex items-center gap-2">✅ 解鎖 數據分析儀表板</li>
                        <li className="flex items-center gap-2">✅ 基礎 FB 圖文生成</li>
                        <li className="flex items-center gap-2">✅ 基礎 Threads 發文</li>
                        <li className="flex items-center gap-2">❌ SEO 文章生成 (鎖定)</li>
                        <li className="flex items-center gap-2">❌ 自動化排程 (鎖定)</li>
                    </ul>
                    
                    {currentPlan === 'starter' && isSubscribed ? (
                        <button disabled className="w-full py-3 rounded-xl bg-green-600/20 text-green-400 font-bold text-sm cursor-default border border-green-500/50">
                            當前方案
                        </button>
                    ) : (
                        <button 
                            onClick={() => handleSubscribe('starter')} 
                            disabled={loadingSub}
                            className="w-full py-3 rounded-xl border border-gray-600 text-gray-300 hover:text-white hover:border-white font-bold transition-all text-sm mb-2 disabled:opacity-50"
                        >
                            {loadingSub ? '處理中...' : '立即訂閱'}
                        </button>
                    )}
                </div>

                {/* Pro Plan */}
                <div className={`bg-gradient-to-b from-purple-900/40 to-card p-8 rounded-3xl border flex flex-col relative overflow-hidden shadow-[0_0_30px_rgba(168,85,247,0.15)] transform md:-translate-y-4 ${currentPlan === 'pro' && isSubscribed ? 'border-green-500 ring-2 ring-green-500/30' : 'border-purple-500/50'}`}>
                    <div className="absolute top-0 right-0 bg-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">主力推薦</div>
                    <h3 className="text-xl font-bold text-white mb-2">Pro 專業版</h3>
                    <div className="flex items-baseline gap-1 mb-4">
                        <span className="text-4xl font-black text-purple-400">NT$599</span>
                        <span className="text-gray-500 text-sm">/ 月</span>
                    </div>
                    <div className="bg-purple-500/20 text-purple-300 px-3 py-1 rounded-lg text-xs font-bold inline-block w-fit mb-6 border border-purple-500/30">
                        🎁 每月贈送 500 點 (價值 $500)
                    </div>
                    <ul className="space-y-3 text-sm text-gray-300 mb-8 flex-1 font-medium">
                        <li className="flex items-center gap-2">✅ <span className="text-white">包含 Starter 所有功能</span></li>
                        <li className="flex items-center gap-2">✅ <span className="text-yellow-400 font-bold">解鎖 自動化排程 (AutoPilot)</span></li>
                        <li className="flex items-center gap-2">✅ 解鎖 SEO 長文章生成</li>
                        <li className="flex items-center gap-2">✅ 解鎖 Threads 養號農場</li>
                        <li className="flex items-center gap-2">✅ 優先使用高級繪圖模型</li>
                    </ul>
                    
                    {currentPlan === 'pro' && isSubscribed ? (
                        <button disabled className="w-full py-3 rounded-xl bg-green-600 text-white font-bold cursor-default shadow-lg">
                            ✅ 您目前是 Pro 會員
                        </button>
                    ) : (
                        <button 
                            onClick={() => handleSubscribe('pro')} 
                            disabled={loadingSub}
                            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors shadow-lg hover:shadow-purple-500/50 disabled:opacity-50"
                        >
                            {loadingSub ? '處理中...' : '立即升級 Pro'}
                        </button>
                    )}
                </div>

                {/* Business Plan */}
                <div className="bg-card p-8 rounded-3xl border border-gray-700 flex flex-col relative overflow-hidden group hover:border-yellow-500/50 transition-all">
                    <h3 className="text-xl font-bold text-white mb-2">Business 企業版</h3>
                    <div className="flex items-baseline gap-1 mb-4">
                        <span className="text-2xl font-black text-yellow-400">聯繫報價</span>
                    </div>
                    <div className="bg-yellow-500/10 text-yellow-400 px-3 py-1 rounded-lg text-xs font-bold inline-block w-fit mb-6 border border-yellow-500/20">
                        🎁 客製化點數方案
                    </div>
                    <ul className="space-y-3 text-sm text-gray-400 mb-8 flex-1">
                        <li className="flex items-center gap-2">✅ <span className="text-white">全功能解鎖 (Full Access)</span></li>
                        <li className="flex items-center gap-2">✅ 多帳號與團隊管理</li>
                        <li className="flex items-center gap-2">✅ 專屬客服經理 (Line 群組)</li>
                        <li className="flex items-center gap-2">✅ API 優先通道與客製開發</li>
                    </ul>
                    <button onClick={onContactClick} className="w-full py-3 rounded-xl border border-yellow-600/50 text-yellow-500 hover:bg-yellow-900/20 font-bold transition-all text-sm mb-2">
                        企業諮詢 (專人服務)
                    </button>
                    <p className="text-xs text-gray-500 text-center">
                        適合代操公司與大型團隊
                    </p>
                </div>
            </div>

            {/* Top Up Section */}
            <div className="bg-gray-900/80 rounded-3xl border border-gray-700 p-8 mb-12 relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[80px] rounded-full pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div>
                        <h3 className="text-2xl font-black text-white flex items-center gap-2">
                            <span className="text-primary text-3xl">💎</span> 點數加購 (Top-up)
                        </h3>
                        <p className="text-gray-400 text-sm mt-2">
                            不需訂閱，隨買隨用。點數效期 365 天。<br/>
                            <span className="text-primary font-bold">1 單位 = 100 點 = NT$100</span>
                        </p>
                    </div>

                    <div className="bg-black/40 p-6 rounded-2xl border border-gray-600 flex flex-col items-center gap-4 w-full md:w-auto min-w-[300px]">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => setTopUpUnits(Math.max(1, topUpUnits - 1))}
                                className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 text-white font-bold text-xl transition-colors"
                            >-</button>
                            
                            <div className="text-center">
                                <span className="text-4xl font-black text-white">{topUpUnits}</span>
                                <span className="text-xs text-gray-500 block uppercase tracking-wider">單位 ({topUpUnits * 100} 點)</span>
                            </div>

                            <button 
                                onClick={() => setTopUpUnits(topUpUnits + 1)}
                                className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 text-white font-bold text-xl transition-colors"
                            >+</button>
                        </div>

                        <div className="w-full h-px bg-gray-700"></div>

                        <div className="flex justify-between w-full items-end">
                            <span className="text-gray-400 text-sm font-bold">總金額</span>
                            <span className="text-2xl font-black text-primary">NT${topUpUnits * 100}</span>
                        </div>

                        <button 
                            onClick={handleTopUp}
                            disabled={loadingTopUp}
                            className="w-full py-3 bg-gradient-to-r from-primary to-cyan-600 hover:to-cyan-500 text-black font-black rounded-xl shadow-lg transition-all transform active:scale-95 disabled:opacity-50 disabled:transform-none"
                        >
                            {loadingTopUp ? '處理中...' : '立即購買 (線上支付)'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Cost Table */}
            <div className="bg-card rounded-3xl border border-gray-700 shadow-xl overflow-hidden mb-10">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        💰 扣點價目表 (1點 = $1 TWD)
                    </h3>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-900 text-gray-400 uppercase text-xs tracking-wider">
                            <tr>
                                <th className="p-5 font-bold border-b border-gray-700 w-1/4">功能項目</th>
                                <th className="p-5 font-bold text-right border-b border-gray-700 w-1/6">消耗點數</th>
                                <th className="p-5 font-bold border-b border-gray-700 hidden sm:table-cell">說明</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50 bg-gray-800/20">
                            <tr><td className="p-5 font-bold text-white">FB 貼文生成</td><td className="p-5 text-right text-yellow-400 font-bold">5 點</td><td className="p-5 text-gray-400 text-xs hidden sm:table-cell">Gemini Pro 高品質文案</td></tr>
                            <tr><td className="p-5 font-bold text-white">AI 圖片 (首次/重繪)</td><td className="p-5 text-right text-primary font-bold">8 / 5 點</td><td className="p-5 text-gray-400 text-xs hidden sm:table-cell">DALL-E 3 / Ideogram 商業授權圖</td></tr>
                            <tr><td className="p-5 font-bold text-white">Threads 發文</td><td className="p-5 text-right text-blue-400 font-bold">3 - 8 點</td><td className="p-5 text-gray-400 text-xs hidden sm:table-cell">純文字3點 / 圖庫6點 / AI繪圖8點</td></tr>
                            <tr><td className="p-5 font-bold text-white">SEO 長文章</td><td className="p-5 text-right text-yellow-400 font-bold">15 點</td><td className="p-5 text-gray-400 text-xs hidden sm:table-cell">1500字以上結構化文章</td></tr>
                            <tr><td className="p-5 font-bold text-white">自動化全套 (AutoPilot)</td><td className="p-5 text-right text-blue-400 font-bold">15 點</td><td className="p-5 text-gray-400 text-xs hidden sm:table-cell">包含趨勢搜尋、文案、製圖與排程 (含服務費)</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Disclaimer & Terms Footer */}
            <div className="bg-gray-900/50 p-8 rounded-2xl border border-gray-800 text-center">
                <h4 className="text-gray-300 font-bold mb-4 text-sm uppercase tracking-widest">⚠️ 重要聲明與服務條款</h4>
                <p className="text-xs text-gray-500 max-w-4xl mx-auto leading-relaxed mb-6">
                    本服務採預付儲值或定期扣款制，<strong>點數一經購買或發放即無法退還</strong>。<br/>
                    <span className="text-yellow-500/80">會員訂閱將於每月到期日以前自動進行扣款。</span><br/>
                    若您使用本程式，即代表您同意本服務之使用條款。
                    取消訂閱僅停止下期扣款，已支付之費用與點數恕不退費。
                </p>
                
                <button 
                    onClick={() => setShowTerms(true)}
                    className="text-primary hover:text-white border-b border-primary hover:border-white text-xs font-bold transition-colors pb-0.5"
                >
                    閱讀完整服務條款與退款政策 ↗
                </button>
            </div>

            {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
        </div>
    );
};

export default PricingPanel;
