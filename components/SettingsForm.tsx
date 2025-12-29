import React, { useState, useEffect } from 'react';
import { BrandSettings } from '../types';
import { fetchRecentPostCaptions } from '../services/facebookService';
import { analyzeBrandTone } from '../services/geminiService';
import { checkAndUseQuota, getCurrentUser } from '../services/authService';

interface Props {
  initialSettings: BrandSettings;
  onSave: (settings: BrandSettings) => void;
}

const SettingsForm: React.FC<Props> = ({ initialSettings, onSave }) => {
  const [formData, setFormData] = useState<BrandSettings>(initialSettings);
  const [isAnalyzingTone, setIsAnalyzingTone] = useState(false);

  useEffect(() => {
    setFormData(initialSettings);
  }, [initialSettings]);

  const handleChange = (field: keyof BrandSettings, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAutoAnalyzeStyle = async () => {
      if (!formData.facebookPageId || !formData.facebookToken) {
          alert("請先填寫並驗證 Facebook Page ID 與 Token");
          return;
      }

      // Add Quota Check
      const user = getCurrentUser();
      if (!user) return alert("請先登入");
      
      const COST = 5;
      const allowed = await checkAndUseQuota(user.uid, COST, 'ANALYZE_TONE');
      if (!allowed) return; 
      
      setIsAnalyzingTone(true);
      try {
          const posts = await fetchRecentPostCaptions(formData.facebookPageId, formData.facebookToken, 15);
          if (posts.length < 3) throw new Error("貼文數量過少，無法有效分析 (至少需要 3 篇)。");
          const styleGuide = await analyzeBrandTone(posts);
          setFormData(prev => ({ ...prev, brandStyleGuide: styleGuide }));
          alert(`✅ 分析完成！已更新「品牌風格指南」。(扣除 ${COST} 點)`);
      } catch (e: any) {
          alert(`分析失敗: ${e.message}`);
      } finally {
          setIsAnalyzingTone(false);
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-card rounded-xl border border-gray-700 space-y-8 animate-fade-in">
        <div className="flex justify-between items-center">
             <h2 className="text-2xl font-bold text-white">品牌設定</h2>
             <button onClick={handleSubmit} className="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">儲存變更</button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Info */}
            <section className="space-y-4">
                <h3 className="text-lg font-bold text-gray-300 border-b border-gray-700 pb-2">基本資訊</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">品牌名稱</label>
                        <input 
                            value={formData.brandName} 
                            onChange={e => handleChange('brandName', e.target.value)}
                            className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none"
                            placeholder="例如: AutoSocial"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">產業類別</label>
                        <input 
                            value={formData.industry} 
                            onChange={e => handleChange('industry', e.target.value)}
                            className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none"
                            placeholder="例如: 數位行銷、餐飲、美妝"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm text-gray-400 mb-1">產品/服務描述</label>
                        <textarea 
                            value={formData.productInfo} 
                            onChange={e => handleChange('productInfo', e.target.value)}
                            className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none h-24 resize-none"
                            placeholder="描述您的主要產品、服務特色與核心價值..."
                        />
                    </div>
                     <div>
                        <label className="block text-sm text-gray-400 mb-1">目標受眾 (Target Audience)</label>
                        <input 
                            value={formData.targetAudience} 
                            onChange={e => handleChange('targetAudience', e.target.value)}
                            className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none"
                            placeholder="例如: 25-35歲上班族、熱愛旅遊的人"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">品牌官網/連結</label>
                        <input 
                            value={formData.website} 
                            onChange={e => handleChange('website', e.target.value)}
                            className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none"
                            placeholder="https://..."
                        />
                    </div>
                </div>
            </section>

            {/* Visual Identity */}
            <section className="space-y-4">
                <h3 className="text-lg font-bold text-gray-300 border-b border-gray-700 pb-2">視覺識別 (Visual Identity)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">視覺風格</label>
                        <select 
                            value={formData.visualStyle} 
                            onChange={e => handleChange('visualStyle', e.target.value)}
                            className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none"
                        >
                            <option value="minimalist">極簡主義 (Minimalist)</option>
                            <option value="vibrant">鮮豔流行 (Vibrant/Pop)</option>
                            <option value="luxury">奢華質感 (Luxury)</option>
                            <option value="retro">復古懷舊 (Retro)</option>
                            <option value="warm_family">溫馨居家 (Warm/Family)</option>
                            <option value="tech_futuristic">科技未來 (Tech/Futuristic)</option>
                            <option value="nature_organic">自然有機 (Nature/Organic)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">品牌色系 (Hex Codes)</label>
                        <div className="flex gap-2">
                            {formData.brandColors.map((color, index) => (
                                <div key={index} className="flex-1 flex items-center gap-1">
                                    <input 
                                        type="color" 
                                        value={color}
                                        onChange={e => {
                                            const newColors = [...formData.brandColors];
                                            newColors[index] = e.target.value;
                                            handleChange('brandColors', newColors);
                                        }}
                                        className="w-8 h-8 rounded cursor-pointer border-none p-0"
                                    />
                                    <input 
                                        value={color}
                                        onChange={e => {
                                            const newColors = [...formData.brandColors];
                                            newColors[index] = e.target.value;
                                            handleChange('brandColors', newColors);
                                        }}
                                        className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-xs"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm text-gray-400 mb-1">Logo 浮水印連結 (選填)</label>
                        <input 
                            value={formData.logoUrl || ''} 
                            onChange={e => handleChange('logoUrl', e.target.value)}
                            className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none"
                            placeholder="https://... (PNG with transparency recommended)"
                        />
                    </div>
                </div>
            </section>

            {/* Facebook Integration */}
            <section className="bg-dark/40 p-6 rounded-xl border border-gray-600 space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="text-blue-500 text-2xl">f</span> Facebook 整合
                </h3>
                <p className="text-xs text-gray-400">連接粉絲專頁以啟用「自動發文」與「品牌語氣分析」功能。</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Page ID</label>
                        <input 
                            value={formData.facebookPageId} 
                            onChange={e => handleChange('facebookPageId', e.target.value)}
                            className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none"
                            placeholder="例如: 10001234567890"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Page Access Token</label>
                        <input 
                            type="password"
                            value={formData.facebookToken} 
                            onChange={e => handleChange('facebookToken', e.target.value)}
                            className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none"
                            placeholder="長期權杖 (Long-lived Token)"
                        />
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                        <label className="block text-sm text-gray-300 font-bold">品牌語氣指南 (AI Analyzed Tone)</label>
                        <button 
                            type="button"
                            onClick={handleAutoAnalyzeStyle}
                            disabled={isAnalyzingTone}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-xs font-bold transition-colors disabled:opacity-50"
                        >
                            {isAnalyzingTone ? 'AI 分析中...' : '✨ 分析粉專過往貼文 (5點)'}
                        </button>
                    </div>
                    <textarea 
                        value={formData.brandStyleGuide || ''} 
                        onChange={e => handleChange('brandStyleGuide', e.target.value)}
                        className="w-full bg-black/30 border border-gray-600 rounded p-3 text-gray-300 text-sm h-32 focus:border-primary outline-none font-mono"
                        placeholder="點擊上方按鈕自動分析，或在此手動輸入品牌語氣規範..."
                    />
                </div>
            </section>
        </form>
    </div>
  );
};

export default SettingsForm;