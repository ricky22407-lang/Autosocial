
import React, { useState, useEffect, useRef } from 'react';
import { BrandSettings } from '../types';
import { fetchRecentPostCaptions } from '../services/facebookService';
import { analyzeBrandTone } from '../services/geminiService';
import { checkAndUseQuota, getCurrentUser } from '../services/authService';
import { loginAndGetPages, initFacebookSdk, FacebookPage } from '../services/facebookAuth';

interface Props {
  initialSettings: BrandSettings;
  onSave: (settings: BrandSettings) => void;
}

const INDUSTRIES = ["數位行銷", "餐飲美食", "美妝保養", "旅遊住宿", "3C電子", "服飾穿搭", "教育培訓", "房地產", "金融理財", "醫療保健", "寵物用品", "居家生活", "運動健身"];

const VISUAL_STYLES = [
    { id: 'minimalist', label: '極簡現代 (Minimalist)' },
    { id: 'vibrant', label: '鮮豔流行 (Vibrant)' },
    { id: 'luxury', label: '高奢質感 (Luxury)' },
    { id: 'retro', label: '復古底片 (Retro)' },
    { id: 'warm_family', label: '溫馨居家 (Warm)' },
    { id: 'tech_futuristic', label: '科技未來 (Tech)' }
];

const SettingsForm: React.FC<Props> = ({ initialSettings, onSave }) => {
  const [formData, setFormData] = useState<BrandSettings>(initialSettings);
  const [isAnalyzingTone, setIsAnalyzingTone] = useState(false);
  const [industrySelectValue, setIndustrySelectValue] = useState<string>('');
  const [showCustomIndustry, setShowCustomIndustry] = useState(false);
  const [fbPages, setFbPages] = useState<FacebookPage[]>([]);
  const [isFbLoading, setIsFbLoading] = useState(false);
  const [isFbSdkReady, setIsFbSdkReady] = useState(false);

  useEffect(() => {
    setFormData(initialSettings);
    if (initialSettings.industry) {
        if (INDUSTRIES.includes(initialSettings.industry)) {
            setIndustrySelectValue(initialSettings.industry);
        } else {
            setIndustrySelectValue('other');
            setShowCustomIndustry(true);
        }
    }

    // Initialize FB SDK
    const FB_APP_ID = (import.meta as any).env.VITE_FB_APP_ID || '787541243265741'; 
    initFacebookSdk(FB_APP_ID).then(() => setIsFbSdkReady(true));
  }, [initialSettings]);

  const handleChange = (field: keyof BrandSettings, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFbConnect = async () => {
      setIsFbLoading(true);
      try {
          const pages = await loginAndGetPages();
          setFbPages(pages);
          if (pages.length === 1) selectPage(pages[0]);
          else if (pages.length === 0) alert("找不到您管理的粉絲專頁，請確認已授予權限。");
      } catch (e: any) {
          alert(`FB 連結失敗: ${e.message}`);
      } finally {
          setIsFbLoading(false);
      }
  };

  const selectPage = (page: FacebookPage) => {
      setFormData(prev => ({
          ...prev,
          facebookPageId: page.id,
          facebookToken: page.access_token,
          brandName: prev.brandName || page.name
      }));
      setFbPages([]);
      alert(`已成功連結：${page.name}`);
  };

  const handleToneAnalysis = async () => {
      if (!formData.facebookPageId || !formData.facebookToken) return alert("請先連結 FB 粉專");
      const user = getCurrentUser();
      if (!user) return;

      const COST = 10;
      if (!confirm(`分析品牌語氣將消耗 ${COST} 點配額。AI 會掃描近 20 篇貼文來建立您的風格 DNA。`)) return;

      const allowed = await checkAndUseQuota(user.uid, COST, 'TONE_ANALYSIS');
      if (!allowed) return;

      setIsAnalyzingTone(true);
      try {
          const captions = await fetchRecentPostCaptions(formData.facebookPageId, formData.facebookToken, 20);
          if (captions.length < 5) throw new Error("貼文數量不足 (至少需 5 篇)");
          const tone = await analyzeBrandTone(captions);
          handleChange('brandTone', tone);
          alert("分析完成！已更新品牌語氣。");
      } catch (e: any) {
          alert(`分析失敗: ${e.message}`);
      } finally {
          setIsAnalyzingTone(false);
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    alert("品牌設定已同步至雲端！");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-24 pt-4">
        <div className="flex justify-between items-center bg-gray-900/50 p-6 rounded-3xl border border-white/5 backdrop-blur-sm">
             <div>
                <h2 className="text-3xl font-black text-white tracking-tighter">品牌大腦設定</h2>
                <p className="text-gray-500 text-[10px] mt-1 uppercase tracking-widest font-bold">Brand Intelligence Core</p>
             </div>
             <button onClick={handleSubmit} className="bg-primary hover:bg-cyan-400 text-black px-10 py-3 rounded-2xl font-black transition-all shadow-lg hover:scale-105 active:scale-95">儲存並同步</button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Config */}
            <section className="glass-card p-8 rounded-[2.5rem] space-y-6">
                <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-wider">
                    <span className="w-2 h-2 bg-primary rounded-full shadow-[0_0_10px_#00f2ea]"></span> 基礎識別 (Identity)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">品牌/公司名稱</label>
                        <input value={formData.brandName} onChange={e => handleChange('brandName', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-medium outline-none focus:border-primary" placeholder="例如: AutoSocial AI" />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">主攻產業</label>
                        <select value={industrySelectValue} onChange={e => {
                            const val = e.target.value;
                            setIndustrySelectValue(val);
                            if (val === 'other') setShowCustomIndustry(true);
                            else { setShowCustomIndustry(false); handleChange('industry', val); }
                        }} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-medium outline-none focus:border-primary">
                            <option value="">-- 請選擇產業 --</option>
                            {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                            <option value="other">✎ 其他 (自定義)</option>
                        </select>
                        {showCustomIndustry && <input value={formData.industry} onChange={e => handleChange('industry', e.target.value)} className="mt-2 w-full bg-black/40 border border-primary/50 rounded-2xl p-4 text-white font-medium" placeholder="請輸入產業名稱..." />}
                    </div>
                </div>
            </section>

            {/* AI Settings - RESTORED */}
            <section className="glass-card p-8 rounded-[2.5rem] space-y-6">
                <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-wider">
                    <span className="w-2 h-2 bg-accent rounded-full shadow-[0_0_10px_#7000ff]"></span> AI 生成偏好 (AI Brain)
                </h3>
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] flex justify-between">
                            品牌語氣 (Brand Tone)
                            <button type="button" onClick={handleToneAnalysis} className="text-primary hover:underline text-[9px]">⚡ AI 自動分析粉專語氣</button>
                        </label>
                        <textarea value={formData.brandTone} onChange={e => handleChange('brandTone', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white text-sm h-24 resize-none" placeholder="例如：專業、幽默、充滿活力、溫馨..." />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">小編人設 (Persona)</label>
                        <input value={formData.persona} onChange={e => handleChange('persona', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white text-sm" placeholder="例如：一個熱愛分享美食的 25 歲職場女性..." />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">預設視覺風格</label>
                            <select value={formData.visualStyle} onChange={e => handleChange('visualStyle', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white text-sm">
                                {VISUAL_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">固定標籤 (Hashtags)</label>
                            <input value={formData.fixedHashtags} onChange={e => handleChange('fixedHashtags', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white text-sm" placeholder="#品牌名 #AutoSocial" />
                        </div>
                    </div>
                </div>
            </section>

            {/* FB Connection - ENHANCED */}
            <section className="glass-card p-8 rounded-[2.5rem] space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 blur-[60px] pointer-events-none"></div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-800 pb-4 gap-4">
                    <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-wider">
                        <span className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></span> Facebook 平台串接
                    </h3>
                    <button 
                        type="button"
                        onClick={handleFbConnect}
                        disabled={isFbLoading || !isFbSdkReady}
                        className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                    >
                        {isFbLoading ? <div className="loader w-3 h-3 border-t-white"></div> : '⚡'} 
                        {isFbLoading ? '授權中...' : '一鍵連結 Facebook 帳號'}
                    </button>
                </div>

                {fbPages.length > 0 && (
                    <div className="bg-blue-900/20 p-6 rounded-3xl border border-blue-500/30 animate-fade-in space-y-4">
                        <p className="text-sm font-bold text-blue-200">請選取您要自動經營的粉絲專頁：</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {fbPages.map(page => (
                                <button key={page.id} type="button" onClick={() => selectPage(page)} className="bg-black/40 hover:bg-blue-600 text-left p-4 rounded-2xl border border-gray-700 transition-all flex justify-between items-center group">
                                    <span className="text-white font-bold group-hover:text-white">{page.name}</span>
                                    <span className="text-[9px] text-gray-500 group-hover:text-blue-100">連結此頁面 →</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Page ID</label>
                        <input value={formData.facebookPageId} onChange={e => handleChange('facebookPageId', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-mono text-sm outline-none focus:border-blue-500" placeholder="點擊上方按鈕自動獲取" />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Page Token</label>
                        <input type="password" value={formData.facebookToken} onChange={e => handleChange('facebookToken', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-mono text-sm outline-none focus:border-blue-500" placeholder="••••••••••••••••" />
                    </div>
                </div>
            </section>
        </form>
    </div>
  );
};

export default SettingsForm;
