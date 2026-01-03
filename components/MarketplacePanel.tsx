
import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../types';
import LegalConsentModal from './marketplace/LegalConsentModal';
import InfluencerOnboarding from './marketplace/InfluencerOnboarding';
import InfluencerRadar from './marketplace/InfluencerRadar';
import ProjectBoard from './marketplace/ProjectBoard';
import BrandProjectManager from './marketplace/BrandProjectManager';
import MarketplaceInbox from './marketplace/MarketplaceInbox';
import { updateUserProfile } from '../services/features/user';

interface Props {
  user: UserProfile | null;
  onRefreshProfile: () => void;
}

// 三種主視圖：雷達(找人)、案子廣場(找案子/發案)、我的收件匣
type MarketplaceMainTab = 'RADAR' | 'PROJECTS' | 'INBOX';

const MarketplacePanel: React.FC<Props> = ({ user, onRefreshProfile }) => {
  const [identity, setIdentity] = useState<'brand' | 'influencer'>('brand');
  const [activeTab, setActiveTab] = useState<MarketplaceMainTab>('RADAR');
  const [subView, setSubView] = useState<'LANDING' | 'ONBOARDING'>('LANDING');

  if (!user) return <div className="text-center py-20 text-gray-500">請先登入以訪問媒合中心。</div>;

  if (!user.marketplaceConsent) {
      return <div className="h-full flex items-center justify-center"><LegalConsentModal userId={user.user_id} onConsented={onRefreshProfile} /></div>;
  }

  if (identity === 'influencer' && subView === 'ONBOARDING') {
      return <InfluencerOnboarding user={user} onComplete={() => { onRefreshProfile(); setSubView('LANDING'); }} onCancel={() => setSubView('LANDING')} />;
  }

  const pendingInvites = (user.receivedInvitations || []).filter(i => i.status === 'pending').length;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
      {/* Identity Selector */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
              <h2 className="text-3xl font-black text-white tracking-tighter">口碑媒合中心</h2>
              <div className="bg-dark p-1 rounded-xl border border-gray-700 flex gap-1 shadow-inner">
                  <button onClick={() => setIdentity('brand')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${identity === 'brand' ? 'bg-primary text-black' : 'text-gray-500'}`}>品牌方 (甲方)</button>
                  <button onClick={() => setIdentity('influencer')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${identity === 'influencer' ? 'bg-secondary text-white' : 'text-gray-500'}`}>人才方 (乙方)</button>
              </div>
          </div>
          
          <div className="flex bg-dark/40 p-1 rounded-xl border border-gray-800">
              <button onClick={() => setActiveTab('RADAR')} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'RADAR' ? 'bg-gray-700 text-white shadow-lg' : 'text-gray-500'}`}>精準雷達</button>
              <button onClick={() => setActiveTab('PROJECTS')} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'PROJECTS' ? 'bg-gray-700 text-white shadow-lg' : 'text-gray-500'}`}>合作廣場</button>
              <button onClick={() => setActiveTab('INBOX')} className={`px-6 py-2 rounded-lg text-xs font-black transition-all relative ${activeTab === 'INBOX' ? 'bg-gray-700 text-white shadow-lg' : 'text-gray-500'}`}>
                  收件匣
                  {pendingInvites > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center animate-bounce shadow-lg">{pendingInvites}</span>}
              </button>
          </div>
      </div>

      <div className="w-full h-px bg-gray-800"></div>

      {/* Main Content Areas */}
      {activeTab === 'RADAR' && (
          identity === 'brand' 
          ? <InfluencerRadar user={user} onQuotaUpdate={onRefreshProfile} /> 
          : <div className="bg-card p-12 rounded-[3rem] border border-gray-700 text-center">
                <div className="text-6xl mb-4">🤳</div>
                <h3 className="text-2xl font-black text-white mb-2">讓品牌主動找到您</h3>
                <p className="text-gray-400 mb-8">完善您的商務名片並開啟「公開狀態」，您將出現在甲方的搜尋雷達中。</p>
                <button onClick={() => setSubView('ONBOARDING')} className="bg-secondary text-white px-10 py-4 rounded-2xl font-black shadow-xl hover:scale-105 active:scale-95 transition-all">
                    {user.influencerProfile ? '編輯我的商務名片' : '立即建立名片加入人才庫'}
                </button>
            </div>
      )}

      {activeTab === 'PROJECTS' && (
          identity === 'brand'
          ? <BrandProjectManager user={user} onRefresh={onRefreshProfile} />
          : <ProjectBoard user={user} onRefresh={onRefreshProfile} />
      )}

      {activeTab === 'INBOX' && (
          <MarketplaceInbox user={user} identity={identity} onRefresh={onRefreshProfile} />
      )}
    </div>
  );
};

export default MarketplacePanel;
