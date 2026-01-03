
import React, { useState, useEffect, useRef } from 'react';
import { BrandSettings } from '../types';
import { fetchRecentPostCaptions } from '../services/facebookService';
import { analyzeBrandTone } from '../services/geminiService';
import { checkAndUseQuota, getCurrentUser } from '../services/authService';
import { loginAndGetPages, initFacebookSdk } from '../services/facebookAuth';

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
  const [fbPages, setFbPages] = useState<any[]>([]);
  const [isFbLoading, setIsFbLoading] = useState(false);
  const [isFbSdkReady, setIsFbSdkReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  }, [initialSettings]);

  const handleChange = (field: keyof BrandSettings, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-card rounded-xl border border-gray-700 space-y-8 animate-fade-in pb-20">
        <div className="flex justify-between items-center">
             <h2 className="text-2xl font-bold text-white">品牌設定</h2>
             <button onClick={handleSubmit} className="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">儲存變更</button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-8">
            <section className="space-y-4">
                <h3 className="text-lg font-bold text-gray-300 border-b border-gray-700 pb-2">基本資訊</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">品牌名稱</label>
                        <input value={formData.brandName} onChange={e => handleChange('brandName', e.target.value)} className="w-full bg-dark border border-gray-600 rounded p-3 text-white" placeholder="例如: AutoSocial" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">產業類別</label>
                        <select value={industrySelectValue} onChange={e => {
                            const val = e.target.value;
                            setIndustrySelectValue(val);
                            if (val === 'other') setShowCustomIndustry(true);
                            else { setShowCustomIndustry(false); handleChange('industry', val); }
                        }} className="w-full bg-dark border border-gray-600 rounded p-3 text-white">
                            <option value="">-- 請選擇產業 --</option>
                            {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                            <option value="other">✎ 其他 (手動輸入)</option>
                        </select>
                        {showCustomIndustry && <input value={formData.industry} onChange={e => handleChange('industry', e.target.value)} className="mt-2 w-full bg-dark border border-blue-500 rounded p-3 text-white" placeholder="請輸入產業..." />}
                    </div>
                </div>
            </section>

            {/* NEW: Competitor Intelligence Settings */}
            <section className="space-y-4">
                <h3 className="text-lg font-bold text-gray-300 border-b border-gray-700 pb-2 flex items-center gap-2">
                    🕵️ 競品監測名單 (Intelligence List)
                </h3>
                <p className="text-xs text-gray-500">輸入對手的 Facebook 或 Threads 公開連結，AI 將在數據分析頁面為您進行戰略比對。</p>
                <div className="space-y-3">
                    {(formData.competitorUrls || []).map((url, idx) => (
                        <div key={idx} className="flex gap-2">
                            <input 
                                value={url} 
                                onChange={e => handleCompetitorChange(idx, e.target.value)} 
                                className="flex-1 bg-dark border border-gray-600 rounded p-3 text-white text-sm" 
                                placeholder="https://facebook.com/competitor.page" 
                            />
                            <button type="button" onClick={() => removeCompetitorField(idx)} className="text-red-500 font-bold px-3 hover:bg-red-900/20 rounded">✕</button>
                        </div>
                    ))}
                    <button 
                        type="button" 
                        onClick={addCompetitorField}
                        className="text-xs text-primary font-bold hover:underline"
                    >
                        + 新增競爭對手連結 (最多 5 個)
                    </button>
                </div>
            </section>

            <section className="bg-dark/40 p-6 rounded-xl border border-gray-600 space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">Facebook 整合</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><label className="block text-sm text-gray-400 mb-1">Page ID</label><input value={formData.facebookPageId} onChange={e => handleChange('facebookPageId', e.target.value)} className="w-full bg-dark border border-gray-600 rounded p-3 text-white" /></div>
                    <div><label className="block text-sm text-gray-400 mb-1">Access Token</label><input type="password" value={formData.facebookToken} onChange={e => handleChange('facebookToken', e.target.value)} className="w-full bg-dark border border-gray-600 rounded p-3 text-white" /></div>
                </div>
            </section>
        </form>
    </div>
  );
};

export default SettingsForm;
