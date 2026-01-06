
import React, { useState, useEffect } from 'react';
import { UserProfile, BrandSettings } from '../types';
import { agreeToConnectTerms } from '../services/authService';
import TalentScout from './connect/TalentScout';
import CampaignPlaza from './connect/CampaignPlaza';
import MyCardEditor from './connect/MyCardEditor';

interface Props {
    settings: BrandSettings;
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const ConnectPanel: React.FC<Props> = ({ settings, user, onQuotaUpdate }) => {
    const [activeTab, setActiveTab] = useState<'talent' | 'campaign' | 'mycard'>('talent');
    const [showDisclaimer, setShowDisclaimer] = useState(false);

    useEffect(() => {
        if (user && user.hasAgreedConnectTerms !== true) {
            setShowDisclaimer(true);
        }
    }, [user]);

    const handleAgree = async () => {
        if (user) {
            await agreeToConnectTerms(user.user_id);
            // Optimistically update local state if needed, but props update handles it usually.
            // Force hide modal immediately
            setShowDisclaimer(false);
            if (user) user.hasAgreedConnectTerms = true; // Local mutation for immediate feedback
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-4 animate-fade-in pb-20 relative">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter flex items-center gap-3">
                        <span className="text-yellow-500 text-4xl">🤝</span> 口碑媒合市集
                    </h2>
                    <p className="text-gray-400 text-sm mt-2 font-medium">
                        AutoSocial Connect • 連結品牌與創作者的橋樑
                    </p>
                </div>
                
                {/* Stats / Role Badge */}
                {user && (
                    <div className="bg-dark border border-gray-700 rounded-lg px-4 py-2 flex items-center gap-4 text-xs">
                        <div>
                            <span className="text-gray-500 block">當前身份</span>
                            <span className={`font-bold uppercase ${user.role === 'business' ? 'text-yellow-400' : 'text-white'}`}>{user.role}</span>
                        </div>
                        <div className="w-px h-6 bg-gray-700"></div>
                        <div>
                            <span className="text-gray-500 block">剩餘點數</span>
                            <span className="text-primary font-mono font-bold">{user.quota_total - user.quota_used}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-700 mb-8 overflow-x-auto">
                <button 
                    onClick={() => setActiveTab('talent')}
                    className={`px-6 py-4 font-bold transition-all relative whitespace-nowrap ${activeTab === 'talent' ? 'text-yellow-400' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    🕵️ 人才星探 (找網紅)
                    {activeTab === 'talent' && <div className="absolute bottom-0 left-0 w-full h-1 bg-yellow-400 shadow-[0_0_10px_#facc15]"></div>}
                </button>
                <button 
                    onClick={() => setActiveTab('campaign')}
                    className={`px-6 py-4 font-bold transition-all relative whitespace-nowrap ${activeTab === 'campaign' ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    📢 接案廣場 (找案子)
                    {activeTab === 'campaign' && <div className="absolute bottom-0 left-0 w-full h-1 bg-purple-400 shadow-[0_0_10px_#a855f7]"></div>}
                </button>
                <button 
                    onClick={() => setActiveTab('mycard')}
                    className={`px-6 py-4 font-bold transition-all relative whitespace-nowrap ${activeTab === 'mycard' ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    💳 我的接案名片
                    {activeTab === 'mycard' && <div className="absolute bottom-0 left-0 w-full h-1 bg-green-400 shadow-[0_0_10px_#4ade80]"></div>}
                </button>
            </div>

            {/* Content Area */}
            <div className="min-h-[500px]">
                {activeTab === 'talent' && (
                    <TalentScout user={user} onQuotaUpdate={onQuotaUpdate} />
                )}
                {activeTab === 'campaign' && (
                    <CampaignPlaza user={user} onQuotaUpdate={onQuotaUpdate} />
                )}
                {activeTab === 'mycard' && user && (
                    <MyCardEditor user={user} settings={settings} onSave={() => setActiveTab('talent')} />
                )}
                {activeTab === 'mycard' && !user && (
                    <div className="text-center py-20 text-gray-500">請先登入以編輯名片。</div>
                )}
            </div>

            {/* Disclaimer Modal (First Time Only) */}
            {showDisclaimer && (
                <div className="fixed inset-0 bg-black/95 z-[999] flex items-center justify-center p-4 backdrop-blur-xl">
                    <div className="bg-gray-900 border border-gray-600 rounded-2xl max-w-2xl w-full p-8 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-500 to-red-500"></div>
                        
                        <h3 className="text-2xl font-black text-white mb-6 flex items-center gap-3">
                            <span className="text-3xl">⚖️</span> 平台免責聲明與使用協議
                        </h3>
                        
                        <div className="overflow-y-auto pr-2 custom-scrollbar text-sm text-gray-300 space-y-6 leading-relaxed mb-6">
                            <section>
                                <h4 className="text-white font-bold mb-2">1. 服務性質定位 (Platform Nature)</h4>
                                <p>AutoSocial Connect (以下簡稱「本平台」) 僅提供資訊媒合之技術中介服務。本平台之角色為協助品牌方（甲方）與創作者（乙方）進行初步資訊曝光與搜尋，<strong>本平台並非任何一方之代理人、合夥人或僱用人</strong>。</p>
                            </section>

                            <section>
                                <h4 className="text-white font-bold mb-2">2. 合作與合約責任 (Contractual Liability)</h4>
                                <p>本平台僅提供聯繫管道。後續所有合作細節（包括但不限於：酬勞支付、工作內容、著作權歸屬、合約簽署、勞務履行等），均屬於甲乙雙方之私下協議範疇。</p>
                                <p className="text-red-300 font-bold border-l-2 border-red-500 pl-3 mt-2">
                                    若發生任何商業糾紛、違約、詐欺或損害賠償情事，本平台不負擔任何法律責任或連帶賠償責任。請用戶在進行交易或合作前，自行評估風險並簽署正式合約。
                                </p>
                            </section>

                            <section>
                                <h4 className="text-white font-bold mb-2">3. 點數費用說明 (Service Fees)</h4>
                                <p>本平台收取之「點數」（如解鎖聯繫資訊），乃作為平台維護、資料處理與技術服務之費用，<strong>並非</strong>對合作結果之保證金或媒合佣金。點數一經扣除，視為服務已完成，不得以合作未談成為由要求退還。</p>
                            </section>

                            <section>
                                <h4 className="text-white font-bold mb-2">4. 個資與隱私授權 (Privacy Consent)</h4>
                                <p>當您啟用接案名片功能，即代表您同意本平台將您主動填寫之資料（包括暱稱、數據、報價區間）公開展示於平台內供其他會員瀏覽。您的聯絡方式（Email/Line）僅會在對方支付點數後揭露。</p>
                            </section>
                        </div>

                        <div className="pt-6 border-t border-gray-700 flex flex-col items-end gap-3">
                            <p className="text-xs text-gray-500">點擊下方按鈕，即表示您已詳細閱讀並同意上述所有條款。</p>
                            <button 
                                onClick={handleAgree}
                                className="w-full sm:w-auto px-8 py-4 bg-yellow-600 hover:bg-yellow-500 text-black font-black rounded-xl shadow-lg transition-all transform active:scale-95"
                            >
                                我已閱讀並同意 (Enter)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConnectPanel;
