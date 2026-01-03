
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
            setShowCustomIndustry(false);
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
          if (pages.length === 1) {
              selectPage(pages[0]);
          } else if (pages.length === 0) {
              alert("找不到任何您管理的粉絲專頁，請確認權限已勾選。");
          }
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

  const handleCompetitorChange = (index: number, val: string) => {
      const newList = [...(formData.competitorUrls || [])];
      newList[index] = val;
      handleChange('competitorUrls', newList);
  };

  const addCompetitorField = () => {
      handleChange('competitorUrls', [...(formData.competitorUrls || []), '']);
  };

  const removeCompetitorField = (index: number) => {
      const newList = (formData.competitorUrls || []).filter((_, i) => i !== index);
      handleChange('competitorUrls', newList);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    alert("設定已儲存！");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-24 pt-4">
        <div className="flex justify-between items-center bg-gray-900/50 p-6 rounded-3xl border border-white/5 backdrop-blur-sm">
             <div>
                <h2 className="text-3xl font-black text-white tracking-tighter">品牌核心設定</h2>
                <p className="text-gray-500 text-xs mt-1 uppercase tracking-widest font-bold">Identity & FB Integration</p>
             </div>
             <button onClick={handleSubmit} className="bg-primary hover:bg-cyan-400 text-black px-8 py-3 rounded-2xl font-black transition-all shadow-[0_0_20px_rgba(0,242,234,0.3)] hover:scale-105 active:scale-95">儲存變更</button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Info */}
            <section className="glass-card p-8 rounded-[2.5rem] space-y-6">
                <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-wider">
                    <span className="w-2 h-2 bg-primary rounded-full shadow-[0_0_10px_#00f2ea]"></span> 基本品牌資訊
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">品牌名稱</label>
                        <input value={formData.brandName} onChange={e => handleChange('brandName', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-medium outline-none focus:border-primary" placeholder="例如: AutoSocial AI" />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">產業類別</label>
                        <select value={industrySelectValue} onChange={e => {
                            const val = e.target.value;
                            setIndustrySelectValue(val);
                            if (val === 'other') setShowCustomIndustry(true);
                            else { setShowCustomIndustry(false); handleChange('industry', val); }
                        }} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-medium outline-none focus:border-primary">
                            <option value="">-- 請選擇產業 --</option>
                            {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                            <option value="other">✎ 其他 (手動輸入)</option>
                        </select>
                        {showCustomIndustry && <input value={formData.industry} onChange={e => handleChange('industry', e.target.value)} className="mt-2 w-full bg-black/40 border border-primary/50 rounded-2xl p-4 text-white font-medium" placeholder="請輸入產業名稱..." />}
                    </div>
                </div>
            </section>

            {/* FB Connection - RESTORED */}
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
                        className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                    >
                        {isFbLoading ? <div className="loader w-3 h-3 border-t-white"></div> : '⚡'} 
                        {isFbLoading ? '連結中...' : '一鍵連結 Facebook 帳號'}
                    </button>
                </div>

                {fbPages.length > 0 && (
                    <div className="bg-blue-900/20 p-6 rounded-3xl border border-blue-500/30 animate-fade-in space-y-4">
                        <p className="text-sm font-bold text-blue-200">請選擇要管理的粉絲專頁：</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {fbPages.map(page => (
                                <button key={page.id} type="button" onClick={() => selectPage(page)} className="bg-black/40 hover:bg-blue-600 text-left p-4 rounded-2xl border border-gray-700 transition-all flex justify-between items-center group">
                                    <span className="text-white font-bold group-hover:text-white">{page.name}</span>
                                    <span className="text-[9px] text-gray-500 group-hover:text-blue-100">Select →</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Page ID</label>
                        <input value={formData.facebookPageId} onChange={e => handleChange('facebookPageId', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-mono text-sm outline-none focus:border-blue-500" placeholder="由系統自動帶入" />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Page Access Token</label>
                        <input type="password" value={formData.facebookToken} onChange={e => handleChange('facebookToken', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-mono text-sm outline-none focus:border-blue-500" placeholder="••••••••••••••••" />
                    </div>
                </div>
            </section>

            {/* Competitor List */}
            <section className="glass-card p-8 rounded-[2.5rem] space-y-6">
                <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-wider">
                    <span className="w-2 h-2 bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7]"></span> 競品監測名單
                </h3>
                <div className="space-y-3">
                    {(formData.competitorUrls || []).map((url, idx) => (
                        <div key={idx} className="flex gap-2">
                            <input 
                                value={url} 
                                onChange={e => handleCompetitorChange(idx, e.target.value)} 
                                className="flex-1 bg-black/40 border border-gray-700 rounded-2xl p-4 text-white text-sm outline-none focus:border-purple-500" 
                                placeholder="https://facebook.com/..." 
                            />
                            <button type="button" onClick={() => removeCompetitorField(idx)} className="text-red-500 font-bold px-4 hover:bg-red-900/20 rounded-2xl">✕</button>
                        </div>
                    ))}
                    <button type="button" onClick={addCompetitorField} className="text-xs text-primary font-black uppercase tracking-widest hover:underline px-2 py-1">+ 新增對手連結</button>
                </div>
            </section>
        </form>
    </div>
  );
};

export default SettingsForm;
