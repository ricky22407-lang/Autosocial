
import React from 'react';
import { InfluencerProfile } from '../../types';

interface Props {
  profile: InfluencerProfile;
  email: string;
  displayMode?: 'LOCKED' | 'PREVIEW' | 'FULL'; 
}

const InfluencerCard: React.FC<Props> = ({ profile, email, displayMode = 'FULL' }) => {
  const isBoosted = (profile.boostExpiresAt || 0) > Date.now();

  const isLocked = displayMode === 'LOCKED';
  const isPreview = displayMode === 'PREVIEW';
  const isFull = displayMode === 'FULL';

  // 輔助邏輯：哪些東西在 PREVIEW 階段就該看到
  const showMetadata = isPreview || isFull;

  return (
    <div className={`bg-gray-900 border rounded-[2.5rem] overflow-hidden shadow-2xl transition-all group w-full max-w-sm mx-auto relative ${
        isBoosted && isFull 
        ? 'border-yellow-400 ring-4 ring-yellow-400/20 shadow-yellow-500/20' 
        : 'border-gray-800 hover:border-secondary/50'
    }`}>
        {/* Boost Badge - 只有解鎖後才看得到金牌，維持神祕感 */}
        {isBoosted && isFull && (
            <div className="absolute top-4 left-4 z-30 bg-gradient-to-r from-yellow-600 to-amber-400 text-black text-[9px] font-black px-3 py-1 rounded-full shadow-lg animate-pulse">
                👑 優先推薦中
            </div>
        )}

        {/* Header Decor */}
        <div className={`h-24 relative ${isBoosted && isFull ? 'bg-gradient-to-br from-yellow-800 to-gray-900' : 'bg-gradient-to-br from-gray-800 to-gray-900'}`}>
            <div className="absolute -bottom-10 left-8">
                <div className={`w-20 h-20 rounded-3xl p-0.5 shadow-xl transition-all ${!isFull ? 'blur-lg grayscale' : (isBoosted ? 'bg-gradient-to-tr from-yellow-400 to-amber-200' : 'bg-gradient-to-tr from-secondary to-pink-400')}`}>
                    <div className="w-full h-full rounded-[1.4rem] bg-dark flex items-center justify-center text-3xl font-black text-white">
                        {!isFull ? '?' : email[0].toUpperCase()}
                    </div>
                </div>
            </div>
            
            {/* 標籤區 - showMetadata (10點後) 模式清晰 */}
            <div className={`absolute top-4 right-6 flex flex-wrap justify-end gap-1 max-w-[150px] transition-all ${!showMetadata ? 'blur-sm grayscale opacity-30' : 'animate-fade-in'}`}>
                {profile.categories?.slice(0, 2).map(c => (
                    <span key={c} className="bg-black/50 backdrop-blur-md text-white text-[10px] px-2.5 py-1 rounded-full border border-white/10 font-bold">
                        #{c}
                    </span>
                ))}
            </div>
        </div>

        {/* Content */}
        <div className="p-8 pt-12 space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    {/* 姓名 - 只有 FULL (30點) 模式才清晰 */}
                    <h3 className={`text-xl font-black text-white transition-all ${!isFull ? 'blur-md select-none bg-gray-700/50 rounded' : ''}`}>
                        {!isFull ? 'Influencer Name' : email.split('@')[0]}
                    </h3>
                    <p className="text-[10px] text-gray-500 font-mono mt-1">ID: {!isFull ? 'AS-XXXXXX' : `AS-${Math.abs(email.length * 1234).toString().slice(0,6)}`}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">起標報價</p>
                    <p className={`text-xl font-black transition-all ${!showMetadata ? 'blur-sm' : (isBoosted && isFull ? 'text-yellow-400' : 'text-secondary')}`}>
                        {!showMetadata ? 'NT$?,???' : `NT$${profile.minPrice}`}
                    </p>
                </div>
            </div>

            {/* 敘述 - 只有 FULL 模式才清晰 */}
            <div className="space-y-4">
                <p className={`text-sm text-gray-400 leading-relaxed min-h-[60px] line-clamp-3 italic transition-all ${!isFull ? 'blur-md select-none opacity-30' : ''}`}>
                    「{profile.bio || '尚未填寫自我介紹...'}」
                </p>
                
                {/* 形式標籤 - showMetadata (10點後) 清晰 */}
                <div className={`flex flex-wrap gap-2 transition-all ${!showMetadata ? 'blur-sm grayscale opacity-30' : ''}`}>
                    {profile.contentStyles?.map(s => (
                        <span key={s} className="text-xs font-black bg-white/5 text-gray-200 px-3 py-1.5 rounded-xl border border-white/10 shadow-sm">
                            {s}
                        </span>
                    ))}
                </div>
            </div>

            {/* 數據區 - showMetadata (10點後) 清晰 */}
            <div className={`grid grid-cols-2 gap-3 transition-all ${!showMetadata ? 'blur-sm grayscale opacity-30' : ''}`}>
                <div className="bg-black/40 p-3 rounded-2xl border border-gray-800">
                    <p className="text-[9px] text-gray-500 font-black uppercase mb-1">社群實力</p>
                    <p className="text-sm font-black text-white">{!showMetadata ? 'XXXX+' : '數據已解鎖'}</p>
                </div>
                <div className="bg-black/40 p-3 rounded-2xl border border-gray-800">
                    <p className="text-[9px] text-gray-500 font-black uppercase mb-1">互動氛圍</p>
                    <p className="text-sm font-black text-white">{!showMetadata ? 'Low' : '真實活躍'}</p>
                </div>
            </div>

            {/* AI Tags - showMetadata (10點後) 清晰 */}
            <div className={`flex flex-wrap gap-2 pt-2 transition-all ${!showMetadata ? 'blur-sm grayscale opacity-30' : ''}`}>
                {(profile.aiTags || []).slice(0, 3).map(tag => (
                    <span key={tag} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${isBoosted && isFull ? 'bg-yellow-900/20 text-yellow-500 border-yellow-500/20' : 'bg-secondary/10 text-secondary border-secondary/20'}`}>
                        {tag}
                    </span>
                ))}
            </div>

            {/* Status Footer */}
            <div className="pt-4 border-t border-gray-800 flex justify-between items-center">
                <div className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${!isFull ? 'bg-gray-700' : (isBoosted && isFull ? 'bg-yellow-400' : 'bg-green-500')}`}></div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                        {!isFull ? 'Identity Locked' : 'Open for Hire'}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-yellow-400 text-xs">★</span>
                    <span className="text-[10px] text-white font-black">
                        {!showMetadata ? '?.?' : (typeof profile.rating === 'number' ? profile.rating.toFixed(1) : '5.0')}
                    </span>
                </div>
            </div>
        </div>
    </div>
  );
};

export default InfluencerCard;
