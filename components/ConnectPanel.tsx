
import React, { useState } from 'react';
import { UserProfile, BrandSettings } from '../types';
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

    return (
        <div className="max-w-6xl mx-auto p-4 animate-fade-in pb-20">
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
                    <MyCardEditor user={user} onSave={() => setActiveTab('talent')} />
                )}
                {activeTab === 'mycard' && !user && (
                    <div className="text-center py-20 text-gray-500">請先登入以編輯名片。</div>
                )}
            </div>
        </div>
    );
};

export default ConnectPanel;
