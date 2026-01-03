
import React, { useState, useEffect } from 'react';
import { UserProfile, InfluencerProfile, BrandSettings } from '../../types';
import { updateUserProfile } from '../../services/features/user';
import InfluencerCard from './InfluencerCard';

interface Props {
  user: UserProfile;
  onComplete: () => void;
  onCancel: () => void;
}

// Expanded and refined for commercial use
const CATEGORIES = [
    "美妝保養", "3C科技", "親子育兒", "美食評論", "旅遊冒險", 
    "健身運動", "理財投資", "時尚穿搭", "遊戲動漫", "職場教育",
    "寵物毛孩", "居家裝潢", "身心靈健康", "永續環保", "情侶生活"
];

const CONTENT_STYLES = [
    "短影音 (Reels/TikTok)", "深度開箱評測", "日常 Vlog", "知識懶人包", 
    "幽默反串", "高質感攝影", "直播帶貨", "心情散文"
];

const InfluencerOnboarding: React.FC<Props> = ({ user, onComplete, onCancel }) => {
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [profile, setProfile] = useState<InfluencerProfile>(user.influencerProfile || {
    isPublic: true,
    categories: [],
    contentStyles: [],
    bio: '',
    minPrice: 500,
    platforms: {},
    aiTags: ['待生成'],
    rating: 5,
    completedJobs: 0
  });

  // Local Brand Settings (to pull FB/Threads info)
  const [localSettings, setLocalSettings] = useState<BrandSettings | null>(null);

  useEffect(() => {
      const saved = localStorage.getItem('autosocial_settings');
      if (saved) setLocalSettings(JSON.parse(saved));
  }, []);

  const handleToggleCategory = (cat: string) => {
    setProfile(prev => ({
        ...prev,
        categories: prev.categories.includes(cat) 
            ? prev.categories.filter(c => c !== cat) 
            : [...prev.categories, cat].slice(0, 3) 
    }));
  };

  const handleToggleStyle = (style: string) => {
    setProfile(prev => ({
        ...prev,
        contentStyles: prev.contentStyles.includes(style) 
            ? prev.contentStyles.filter(s => s !== style) 
            : [...prev.contentStyles, style].slice(0, 2) 
    }));
  };

  const handleImportPlatforms = () => {
      if (!localSettings) return;
      const platforms: any = {};
      if (localSettings.facebookPageId) {
          platforms.facebook = { id: localSettings.facebookPageId, name: localSettings.brandName || '我的粉專', followers: 1200 };
      }
      if (localSettings.threadsAccounts && localSettings.threadsAccounts.length > 0) {
          const acc = localSettings.threadsAccounts[0];
          platforms.threads = { id: acc.userId, username: acc.username, followers: 450 };
      }
      setProfile(prev => ({ ...prev, platforms }));
      alert("已同步社群帳號資訊！");
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
        await updateUserProfile(user.user_id, {
            isInfluencer: true,
            influencerProfile: {
                ...profile,
                aiTags: profile.categories.concat(profile.contentStyles).concat(['精選人才'])
            }
        });
        onComplete();
    } catch (e) {
        alert("儲存失敗");
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20">
        <div className="flex justify-between items-center">
            <h2 className="text-2xl font-black text-white flex items-center gap-3">
                <button onClick={onCancel} className="text-gray-500 hover:text-white transition-colors">✕</button>
                設定接案檔案
            </h2>
            <div className="flex gap-2">
                {[1, 2].map(i => (
                    <div key={i} className={`w-8 h-1 rounded-full ${step >= i ? 'bg-secondary' : 'bg-gray-800'}`}></div>
                ))}
            </div>
        </div>

        {step === 1 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-card p-8 rounded-3xl border border-gray-700 space-y-8">
                    {/* Categories */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">1. 擅長領域 (最多 3 項)</label>
                        <div className="flex flex-wrap gap-2">
                            {CATEGORIES.map(cat => (
                                <button 
                                    key={cat}
                                    onClick={() => handleToggleCategory(cat)}
                                    className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${profile.categories.includes(cat) ? 'bg-secondary border-secondary text-white' : 'bg-dark border-gray-700 text-gray-500 hover:border-gray-500'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content Styles */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">2. 擅長形式 (最多 2 項)</label>
                        <div className="flex flex-wrap gap-2">
                            {CONTENT_STYLES.map(style => (
                                <button 
                                    key={style}
                                    onClick={() => handleToggleStyle(style)}
                                    className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${profile.contentStyles.includes(style) ? 'bg-white border-white text-black' : 'bg-dark border-gray-700 text-gray-500 hover:border-gray-500'}`}
                                >
                                    {style}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">3. 個人簡介</label>
                        <textarea 
                            value={profile.bio}
                            onChange={e => setProfile({...profile, bio: e.target.value})}
                            placeholder="介紹一下您的接案風格..."
                            className="w-full h-28 bg-dark border border-gray-700 rounded-2xl p-4 text-white text-sm focus:border-secondary outline-none transition-all resize-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">4. 基礎報價 (NT$)</label>
                        <div className="flex items-center gap-4">
                            <input 
                                type="range" min="0" max="10000" step="100"
                                value={profile.minPrice}
                                onChange={e => setProfile({...profile, minPrice: parseInt(e.target.value)})}
                                className="flex-1 accent-secondary"
                            />
                            <span className="text-xl font-black text-secondary w-24 text-right">${profile.minPrice}</span>
                        </div>
                        <p className="text-[10px] text-gray-600 mt-1">設定為 0 代表「私訊報價」或「互惠合作」</p>
                    </div>

                    <button 
                        onClick={() => setStep(2)}
                        disabled={profile.categories.length === 0 || !profile.bio}
                        className="w-full bg-white text-black py-4 rounded-2xl font-black text-lg hover:bg-gray-200 transition-all disabled:opacity-30"
                    >
                        下一步：串接數據
                    </button>
                </div>

                <div className="hidden md:block">
                    <div className="sticky top-10 space-y-4">
                        <p className="text-xs font-bold text-gray-500 uppercase text-center">我的名片預覽</p>
                        <InfluencerCard profile={profile} email={user.email} />
                    </div>
                </div>
            </div>
        ) : (
            <div className="bg-card p-8 rounded-3xl border border-gray-700 space-y-8 max-w-2xl mx-auto">
                <div className="text-center">
                    <h3 className="text-xl font-bold text-white mb-2">連結您的影響力</h3>
                    <p className="text-sm text-gray-400">品牌方會根據追蹤數與 AI 分析的互動率來決定是否合作。</p>
                </div>

                <div className="space-y-4">
                    <div className={`p-6 rounded-2xl border transition-all flex items-center justify-between ${profile.platforms.facebook ? 'bg-blue-900/10 border-blue-500' : 'bg-dark border-gray-800 opacity-60'}`}>
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">f</div>
                            <div>
                                <p className="text-white font-bold">{profile.platforms.facebook?.name || 'Facebook 粉專'}</p>
                                <p className="text-[10px] text-gray-500">{profile.platforms.facebook ? `${profile.platforms.facebook.followers} 追蹤者` : '未連結'}</p>
                            </div>
                        </div>
                    </div>

                    <div className={`p-6 rounded-2xl border transition-all flex items-center justify-between ${profile.platforms.threads ? 'bg-pink-900/10 border-pink-500' : 'bg-dark border-gray-800 opacity-60'}`}>
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-tr from-pink-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl">@</div>
                            <div>
                                <p className="text-white font-bold">{profile.platforms.threads?.username || 'Threads 帳號'}</p>
                                <p className="text-[10px] text-gray-500">{profile.platforms.threads ? `${profile.platforms.threads.followers} 追蹤者` : '未連結'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-dark p-4 rounded-xl border border-gray-800 text-center">
                    <button onClick={handleImportPlatforms} className="text-primary text-sm font-bold hover:underline">
                        🔄 同步系統已綁定帳號
                    </button>
                </div>

                <div className="pt-6 border-t border-gray-800 flex gap-4">
                    <button onClick={() => setStep(1)} className="flex-1 py-4 rounded-2xl border border-gray-700 text-gray-400 font-bold hover:bg-gray-800 transition-all">上一步</button>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving}
                        className="flex-[2] bg-secondary text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-secondary/20 hover:brightness-110 transition-all disabled:opacity-50"
                    >
                        {isSaving ? '儲存中...' : '確認並發佈'}
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};

export default InfluencerOnboarding;
