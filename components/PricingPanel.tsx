
import React from 'react';
import { UserProfile } from '../types';

interface Props {
    user: UserProfile | null;
}

const PricingPanel: React.FC<Props> = ({ user }) => {
    // Helper for role display
    const getRoleBadge = (role?: string) => {
        switch (role) {
            case 'admin': return { label: 'ADMINISTRATOR', color: 'text-red-400 bg-red-900/20 border-red-500/50' };
            case 'business': return { label: 'BUSINESS', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/50' };
            case 'pro': return { label: 'PRO PLAN', color: 'text-purple-400 bg-purple-900/20 border-purple-500/50' };
            case 'starter': return { label: 'STARTER', color: 'text-green-400 bg-green-900/20 border-green-500/50' };
            default: return { label: 'FREE USER', color: 'text-gray-400 bg-gray-800 border-gray-600' };
        }
    };

    const roleInfo = getRoleBadge(user?.role);

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 animate-fade-in pb-24">
            
            {/* Header */}
            <div className="text-center mb-10">
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tighter mb-3">
                    點數與費率說明
                </h2>
                <p className="text-gray-400 font-medium text-sm md:text-base">
                    簡單透明，用多少扣多少。 <span className="text-primary font-bold">1 點數 = 1 元新台幣 (TWD)</span>。
                </p>
            </div>

            {/* Top Metrics Cards (Responsive Grid) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                
                {/* Card 1: Role */}
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl border border-gray-700 shadow-lg relative overflow-hidden group hover:border-gray-600 transition-all">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl group-hover:scale-110 transition-transform">👑</div>
                    <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">當前會員等級</h3>
                    <div className={`inline-block px-3 py-1 rounded text-sm font-black border ${roleInfo.color}`}>
                        {roleInfo.label}
                    </div>
                    <p className="text-xs text-gray-500 mt-4">
                        {user?.role === 'user' ? '升級解鎖更多高級模型' : '享有優先生成權限'}
                    </p>
                </div>

                {/* Card 2: Balance (Highlight) */}
                <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 p-6 rounded-2xl border border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.1)] relative overflow-hidden group">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-500/30 transition-all"></div>
                    <h3 className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-1">剩餘點數餘額</h3>
                    <div className="flex items-baseline gap-1">
                        <span className={`text-4xl font-black ${user && user.quota_used >= user.quota_total ? 'text-red-400' : 'text-white'}`}>
                            {(user ? user.quota_total - user.quota_used : 0).toLocaleString()}
                        </span>
                        <span className="text-sm font-bold text-blue-400">PTS</span>
                    </div>
                    <div className="w-full bg-gray-800 h-1.5 rounded-full mt-4 overflow-hidden">
                        <div 
                            className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" 
                            style={{ width: `${user ? Math.min(100, ((user.quota_total - user.quota_used) / user.quota_total) * 100) : 0}%` }}
                        ></div>
                    </div>
                    <p className="text-[10px] text-blue-200/60 mt-2 text-right">
                        總額度: {user?.quota_total.toLocaleString()}
                    </p>
                </div>

                {/* Card 3: Account Status */}
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl border border-gray-700 shadow-lg relative overflow-hidden group hover:border-gray-600 transition-all">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl group-hover:scale-110 transition-transform">🛡️</div>
                    <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">帳號狀態</h3>
                    <div className="flex items-center gap-2 mb-4">
                        <div className={`w-3 h-3 rounded-full ${user?.isSuspended ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></div>
                        <span className="text-white font-bold text-lg">{user?.isSuspended ? '已停用' : '正常運作中'}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                        下次重置日: {user?.quota_reset_date ? new Date(user.quota_reset_date).toLocaleDateString() : '無期限'}
                    </p>
                </div>
            </div>

            {/* Pricing Table (Full Width) */}
            <div className="bg-card rounded-3xl border border-gray-700 shadow-xl overflow-hidden mb-10">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        💰 功能價目表 (Cost per Action)
                    </h3>
                    <span className="text-xs text-gray-400 bg-black/30 px-3 py-1 rounded-full border border-gray-600">
                        費率更新於: 2024/05
                    </span>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-900 text-gray-400 uppercase text-xs tracking-wider">
                            <tr>
                                <th className="p-5 font-bold border-b border-gray-700 w-1/4">功能項目</th>
                                <th className="p-5 font-bold text-right border-b border-gray-700 w-1/6">消耗點數</th>
                                <th className="p-5 font-bold border-b border-gray-700 hidden sm:table-cell">詳細說明與價值</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50 bg-gray-800/20">
                            <tr className="hover:bg-white/5 transition-colors group">
                                <td className="p-5 font-bold text-white group-hover:text-primary transition-colors">FB 企業貼文生成</td>
                                <td className="p-5 text-right text-yellow-400 font-black text-lg">10 點</td>
                                <td className="p-5 text-gray-400 text-xs leading-relaxed hidden sm:table-cell">
                                    使用 <span className="text-white">Gemini Pro 1.5/3.0</span> 高智商模型。針對品牌語氣進行深度仿寫，包含 Emoji、Hashtag 策略與多段落排版。
                                </td>
                            </tr>
                            <tr className="hover:bg-white/5 transition-colors group">
                                <td className="p-5 font-bold text-white group-hover:text-primary transition-colors">SEO 部落格長文</td>
                                <td className="p-5 text-right text-yellow-400 font-black text-lg">20 點</td>
                                <td className="p-5 text-gray-400 text-xs leading-relaxed hidden sm:table-cell">
                                    生成 1500+ 字結構化文章。包含 H2/H3 標題、Meta Description、FAQ 與關鍵字佈局，適合官網 SEO 經營。
                                </td>
                            </tr>
                            <tr className="hover:bg-white/5 transition-colors group">
                                <td className="p-5 font-bold text-white group-hover:text-primary transition-colors">熱門趨勢搜尋</td>
                                <td className="p-5 text-right text-primary font-black text-lg">3 點</td>
                                <td className="p-5 text-gray-400 text-xs leading-relaxed hidden sm:table-cell">
                                    即時連網 (Google Search Grounding) 分析新聞與社群熱點。
                                    <span className="text-green-400 block mt-1">*若搜尋結果已在系統快取中 (24hr內)，則完全免費 (0 點)。</span>
                                </td>
                            </tr>
                            <tr className="hover:bg-white/5 transition-colors group">
                                <td className="p-5 font-bold text-white group-hover:text-primary transition-colors">AI 圖片生成 (標準)</td>
                                <td className="p-5 text-right text-primary font-black text-lg">3 點</td>
                                <td className="p-5 text-gray-400 text-xs leading-relaxed hidden sm:table-cell">
                                    使用 Pollinations/Flux 模型快速生成。支援相片寫實風格、插畫風格。
                                </td>
                            </tr>
                            <tr className="hover:bg-white/5 transition-colors group">
                                <td className="p-5 font-bold text-white group-hover:text-primary transition-colors">Threads 快速發文</td>
                                <td className="p-5 text-right text-blue-400 font-black text-lg">1 點</td>
                                <td className="p-5 text-gray-400 text-xs leading-relaxed hidden sm:table-cell">
                                    使用 Flash 模型，適合口語化、生活感短文。包含風格模仿與廢文模式。
                                </td>
                            </tr>
                            <tr className="hover:bg-white/5 transition-colors group">
                                <td className="p-5 font-bold text-white group-hover:text-primary transition-colors">自動化排程 (每次)</td>
                                <td className="p-5 text-right text-blue-400 font-black text-lg">1 點 + 內容費</td>
                                <td className="p-5 text-gray-400 text-xs leading-relaxed hidden sm:table-cell">
                                    觸發自動化任務的基礎費用。實際生成的貼文與圖片會另行計費。
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Disclaimer */}
            <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 text-center">
                <h4 className="text-gray-300 font-bold mb-2 text-sm">⚠️ 法律與退款聲明</h4>
                <p className="text-xs text-gray-500 max-w-3xl mx-auto leading-relaxed">
                    本服務採用預付點數制 (Pre-paid Credits)。使用者了解 AI 生成內容具有隨機性，扣點後不保證生成結果完全符合您的審美預期，但我們會盡力提供最佳模型。
                    點數一經購買或使用，除非系統發生重大故障（如：扣點後未產出任何內容），否則不予退款。
                    詳細條款請參閱 <a href="/terms.html" className="text-primary hover:underline">服務條款</a>。
                </p>
            </div>
        </div>
    );
};

export default PricingPanel;
