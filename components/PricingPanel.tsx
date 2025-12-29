
import React, { useState } from 'react';
import { UserProfile } from '../types';
import TermsModal from './TermsModal';

interface Props {
    user: UserProfile | null;
    onContactClick: () => void; // New prop to handle navigation
}

const PricingPanel: React.FC<Props> = ({ user, onContactClick }) => {
    const [showTerms, setShowTerms] = useState(false);

    // Determine earliest expiry
    let earliestExpiry: number | null = null;
    if (user?.quota_batches && user.quota_batches.length > 0) {
        // Assume sorted, or sort locally
        const sorted = [...user.quota_batches].sort((a,b) => a.expiresAt - b.expiresAt);
        earliestExpiry = sorted[0].expiresAt;
    } else if (user?.quota_reset_date) {
        earliestExpiry = user.quota_reset_date;
    }

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 animate-fade-in pb-24">
            
            {/* Header */}
            <div className="text-center mb-10">
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tighter mb-3">
                    會員訂閱與點數說明
                </h2>
                <p className="text-gray-400 font-medium text-sm md:text-base max-w-2xl mx-auto">
                    我們的訂閱模式：<span className="text-primary font-bold">支付月費取得「功能權限」與「贈送點數」</span>。
                    <br/>
                    {earliestExpiry && (user?.quota_total ?? 0) > 0 && (
                        <span className="text-yellow-400 font-bold block mt-2">
                            ⚠️ 您最近的一批點數將於 {new Date(earliestExpiry).toLocaleDateString()} 到期。
                        </span>
                    )}
                </p>
            </div>

            {/* Subscription Tiers Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                
                {/* Starter Plan */}
                <div className="bg-card p-8 rounded-3xl border border-gray-700 flex flex-col relative overflow-hidden group hover:border-primary/50 transition-all">
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
                    
                    <button onClick={onContactClick} className="w-full py-3 rounded-xl border border-gray-600 text-gray-300 hover:text-white hover:border-white font-bold transition-all text-sm mb-2">
                        聯繫客服開通
                    </button>
                    <p className="text-xs text-gray-500 text-center">
                        實質軟體費用僅 $99/月
                    </p>
                </div>

                {/* Pro Plan - UPDATED */}
                <div className="bg-gradient-to-b from-purple-900/40 to-card p-8 rounded-3xl border border-purple-500/50 flex flex-col relative overflow-hidden shadow-[0_0_30px_rgba(168,85,247,0.15)] transform md:-translate-y-4">
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
                    <button onClick={onContactClick} className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors shadow-lg hover:shadow-purple-500/50">
                        聯繫客服升級 Pro
                    </button>
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
                        企業諮詢
                    </button>
                    <p className="text-xs text-gray-500 text-center">
                        適合代操公司與大型團隊
                    </p>
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
                            <tr><td className="p-5 font-bold text-white">Threads 發文</td><td className="p-5 text-right text-blue-400 font-bold">2 點</td><td className="p-5 text-gray-400 text-xs hidden sm:table-cell">Flash 模型快速生成</td></tr>
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
                    本服務採預付儲值制，<strong>點數一經購買或發放即無法退還</strong>。
                    若您使用本程式，即代表您同意本服務之使用條款。
                    我們會優先扣除即將到期的點數 (先進先出原則)。
                    請注意：取消訂閱僅停止下期扣款，已支付之費用與點數恕不退費。
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
