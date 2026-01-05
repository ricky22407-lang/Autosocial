
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

// Predefined Industries list
const INDUSTRIES = [
    "數位行銷", 
    "餐飲美食", 
    "美妝保養", 
    "旅遊住宿", 
    "3C電子", 
    "服飾穿搭", 
    "教育培訓", 
    "房地產", 
    "金融理財", 
    "醫療保健", 
    "寵物用品",
    "居家生活",
    "運動健身"
];

const VISUAL_STYLES = [
    { id: 'minimalist', label: '極簡現代 (Minimalist)' },
    { id: 'vibrant', label: '鮮豔流行 (Vibrant)' },
    { id: 'luxury', label: '高奢質感 (Luxury)' },
    { id: 'retro', label: '復古底片 (Retro)' },
    { id: 'warm_family', label: '溫馨居家 (Warm)' },
    { id: 'tech_futuristic', label: '科技未來 (Tech)' },
    { id: 'nature_organic', label: '自然有機 (Nature)' }
];

const SettingsForm: React.FC<Props> = ({ initialSettings, onSave }) => {
  const [formData, setFormData] = useState<BrandSettings>(initialSettings);
  const [isAnalyzingTone, setIsAnalyzingTone] = useState(false);
  
  // Industry Selection State
  const [industrySelectValue, setIndustrySelectValue] = useState<string>('');
  const [showCustomIndustry, setShowCustomIndustry] = useState(false);
  
  // Facebook OAuth State
  const [fbPages, setFbPages] = useState<FacebookPage[]>([]);
  const [isFbLoading, setIsFbLoading] = useState(false);
  const [isFbSdkReady, setIsFbSdkReady] = useState(false);

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFormData(initialSettings);
    
    // Initialize Industry Dropdown Logic
    if (initialSettings.industry) {
        if (INDUSTRIES.includes(initialSettings.industry)) {
            setIndustrySelectValue(initialSettings.industry);
            setShowCustomIndustry(false);
        } else {
            setIndustrySelectValue('other');
            setShowCustomIndustry(true);
        }
    } else {
        setIndustrySelectValue('');
        setShowCustomIndustry(false);
    }

    // Initialize FB SDK
    // Fix: Safely access env and DO NOT use a fallback ID.
    // If VITE_FB_APP_ID is missing, we simply log a warning but do not init with a fake ID.
    const env = (import.meta as any)?.env || {};
    const FB_APP_ID = env.VITE_FB_APP_ID || env.REACT_APP_FB_APP_ID;
    
    if (FB_APP_ID) {
        initFacebookSdk(FB_APP_ID).then(() => setIsFbSdkReady(true));
    } else {
        console.error("❌ Critical: Facebook App ID not found in environment variables (VITE_FB_APP_ID).");
    }
  }, [initialSettings]);

  const handleChange = (field: keyof BrandSettings, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleIndustrySelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      setIndustrySelectValue(val);
      
      if (val === 'other') {
          setShowCustomIndustry(true);
          handleChange('industry', ''); // Clear value, wait for user input
      } else {
          setShowCustomIndustry(false);
          handleChange('industry', val);
      }
  };

  // --- Competitor List Handlers ---
  const handleCompetitorChange = (index: number, val: string) => {
      const newList = [...(formData.competitorUrls || [])];
      newList[index] = val;
      handleChange('competitorUrls', newList);
  };

  const addCompetitorField = () => {
      const current = formData.competitorUrls || [];
      if (current.length >= 5) return;
      handleChange('competitorUrls', [...current, '']);
  };

  const removeCompetitorField = (index: number) => {
      const newList = (formData.competitorUrls || []).filter((_, i) => i !== index);
      handleChange('competitorUrls', newList);
  };

  // --- AI Tone Analysis ---
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

  // --- Facebook OAuth Handlers ---
  const handleConnectFacebook = async () => {
      if (!isFbSdkReady) {
          alert("Facebook SDK 初始化失敗或未設定 App ID。請檢查 Vercel 環境變數 (VITE_FB_APP_ID)。");
          return;
      }
      
      setIsFbLoading(true);
      try {
          const pages = await loginAndGetPages();
          setFbPages(pages);
          if (pages.length === 1) selectPage(pages[0]);
          else if (pages.length === 0) alert("您的帳號下沒有發現任何粉絲專頁，或您未授權管理權限。");
      } catch (e: any) {
          console.error(e);
          alert(`FB 登入失敗: ${e.message}`);
      } finally {
          setIsFbLoading(false);
      }
  };

  const selectPage = (page: FacebookPage) => {
      setFormData(prev => ({
          ...prev,
          facebookPageId: page.id,
          facebookToken: page.access_token,
          brandName: prev.brandName || page.name // Auto-fill brand name if empty
      }));
      setFbPages([]); // Close dropdown
      alert(`已成功連結：${page.name}`);
  };

  // --- Logo Upload Handler ---
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const base64 = event.target?.result as string;
          // Simple client-side resize using Canvas
          const img = new Image();
          img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX_WIDTH = 300; // Limit logo size
              const scale = MAX_WIDTH / img.width;
              canvas.width = MAX_WIDTH;
              canvas.height = img.height * scale;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
              const resizedBase64 = canvas.toDataURL('image/png', 0.8);
              
              setFormData(prev => ({ ...prev, logoUrl: resizedBase64 }));
          };
          img.src = base64;
      };
      reader.readAsDataURL(file);
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
            {/* Basic Info */}
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
                        <div className="flex flex-col gap-2">
                            <select 
                                value={industrySelectValue}
                                onChange={handleIndustrySelectChange}
                                className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-medium outline-none focus:border-primary"
                            >
                                <option value="" disabled>-- 請選擇產業 --</option>
                                {INDUSTRIES.map(ind => (
                                    <option key={ind} value={ind}>{ind}</option>
                                ))}
                                <option value="other">✎ 其他 (手動輸入)</option>
                            </select>
                            
                            {showCustomIndustry && (
                                <input 
                                    value={formData.industry} 
                                    onChange={e => handleChange('industry', e.target.value)}
                                    className="w-full bg-black/40 border border-blue-500 rounded-2xl p-4 text-white font-medium animate-fade-in"
                                    placeholder="請輸入您的產業類別..."
                                    autoFocus
                                />
                            )}
                        </div>
                    </div>

                    <div className="md:col-span-2 space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">產品/服務描述</label>
                        <textarea 
                            value={formData.productInfo} 
                            onChange={e => handleChange('productInfo', e.target.value)}
                            className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-medium outline-none h-24 resize-none focus:border-primary"
                            placeholder="描述您的主要產品、服務特色與核心價值..."
                        />
                    </div>
                     <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">目標受眾 (Target Audience)</label>
                        <input 
                            value={formData.targetAudience} 
                            onChange={e => handleChange('targetAudience', e.target.value)}
                            className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-medium outline-none focus:border-primary"
                            placeholder="例如: 25-35歲上班族、熱愛旅遊的人"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">品牌官網/連結</label>
                        <input 
                            value={formData.website} 
                            onChange={e => handleChange('website', e.target.value)}
                            className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-medium outline-none focus:border-primary"
                            placeholder="https://..."
                        />
                    </div>
                </div>
            </section>

            {/* Visual Identity */}
            <section className="glass-card p-8 rounded-[2.5rem] space-y-6">
                <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-wider">
                    <span className="w-2 h-2 bg-accent rounded-full shadow-[0_0_10px_#7000ff]"></span> 視覺與人設 (Visual & Persona)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">預設視覺風格</label>
                        <select 
                            value={formData.visualStyle} 
                            onChange={e => handleChange('visualStyle', e.target.value)}
                            className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-medium outline-none focus:border-primary"
                        >
                            {VISUAL_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">小編人設 (Persona)</label>
                        <input value={formData.persona} onChange={e => handleChange('persona', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-medium" placeholder="例如：一個熱愛分享美食的 25 歲職場女性..." />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">品牌色系 (Hex Codes)</label>
                        <div className="flex gap-2">
                            {formData.brandColors.map((color, index) => (
                                <div key={index} className="flex-1 flex items-center gap-2 bg-black/40 border border-gray-700 rounded-xl p-2">
                                    <input 
                                        type="color" 
                                        value={color}
                                        onChange={e => {
                                            const newColors = [...formData.brandColors];
                                            newColors[index] = e.target.value;
                                            handleChange('brandColors', newColors);
                                        }}
                                        className="w-8 h-8 rounded-lg cursor-pointer border-none bg-transparent"
                                    />
                                    <input 
                                        value={color}
                                        onChange={e => {
                                            const newColors = [...formData.brandColors];
                                            newColors[index] = e.target.value;
                                            handleChange('brandColors', newColors);
                                        }}
                                        className="w-full bg-transparent border-none text-white text-xs font-mono outline-none"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">固定標籤 (Hashtags)</label>
                        <input value={formData.fixedHashtags} onChange={e => handleChange('fixedHashtags', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-medium" placeholder="#品牌名 #AutoSocial" />
                    </div>
                    <div className="md:col-span-2 space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Logo 浮水印 (支援 PNG 透明圖檔)</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1 group">
                                <input 
                                    value={formData.logoUrl || ''} 
                                    onChange={e => handleChange('logoUrl', e.target.value)}
                                    className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-medium pl-12 focus:border-primary outline-none"
                                    placeholder="可直接貼上圖片連結，或點擊右側上傳..."
                                />
                                {formData.logoUrl && (
                                    <div className="absolute left-3 top-3 w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center overflow-hidden">
                                        <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                                    </div>
                                )}
                            </div>
                            <button 
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-gray-800 hover:bg-gray-700 text-white px-6 rounded-2xl font-bold whitespace-nowrap border border-gray-700 transition-colors"
                            >
                                📂 上傳
                            </button>
                            <input 
                                type="file" 
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/png,image/jpeg"
                                onChange={handleLogoUpload}
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Competitor Intelligence - NEW SECTION */}
            <section className="glass-card p-8 rounded-[2.5rem] space-y-6">
                <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-wider">
                    <span className="w-2 h-2 bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7]"></span> 競品監測名單 (Intelligence List)
                </h3>
                <p className="text-xs text-gray-400">輸入競爭對手的 Facebook 或 Threads 公開連結，AI 將在數據分析頁面進行戰略比對與靈感分析。</p>
                
                <div className="space-y-3">
                    {(formData.competitorUrls || []).map((url, idx) => (
                        <div key={idx} className="flex gap-2 items-center animate-fade-in">
                            <span className="text-gray-500 font-mono text-xs w-6 text-center">{idx + 1}.</span>
                            <input 
                                value={url} 
                                onChange={e => handleCompetitorChange(idx, e.target.value)} 
                                className="flex-1 bg-black/40 border border-gray-700 rounded-2xl p-4 text-white text-sm outline-none focus:border-purple-500 transition-colors placeholder-gray-600" 
                                placeholder="例如: https://www.facebook.com/competitor..." 
                            />
                            <button 
                                type="button" 
                                onClick={() => removeCompetitorField(idx)} 
                                className="w-10 h-10 flex items-center justify-center text-red-400 hover:text-red-200 hover:bg-red-900/20 rounded-full transition-all"
                                title="移除此連結"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                    
                    {(formData.competitorUrls || []).length < 5 && (
                        <button 
                            type="button" 
                            onClick={addCompetitorField}
                            className="text-xs text-purple-400 font-black uppercase tracking-widest hover:text-purple-300 hover:underline px-2 py-2 flex items-center gap-2"
                        >
                            <span className="text-lg">+</span> 新增競爭對手連結 (還有 {5 - (formData.competitorUrls?.length || 0)} 個名額)
                        </button>
                    )}
                </div>
            </section>

            {/* Facebook Integration */}
            <section className="glass-card p-8 rounded-[2.5rem] space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 blur-[60px] pointer-events-none"></div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-800 pb-4 gap-4">
                    <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-wider">
                        <span className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></span> Facebook 平台串接
                    </h3>
                    <button 
                        type="button"
                        onClick={handleConnectFacebook}
                        disabled={isFbLoading || !isFbSdkReady}
                        className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                    >
                        {isFbLoading ? <div className="loader w-3 h-3 border-t-white"></div> : '⚡'} 
                        {isFbLoading ? '授權中...' : '一鍵連結 Facebook 帳號'}
                    </button>
                </div>

                {fbPages.length > 0 && (
                    <div className="bg-blue-900/20 p-6 rounded-3xl border border-blue-500/30 animate-fade-in space-y-4">
                        <p className="text-sm font-bold text-blue-200">請選擇要管理的粉絲專頁：</p>
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
                        <input value={formData.facebookPageId} onChange={e => handleChange('facebookPageId', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-mono text-sm outline-none focus:border-blue-500" placeholder="由系統自動帶入或手動輸入" />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Page Access Token</label>
                        <input type="password" value={formData.facebookToken} onChange={e => handleChange('facebookToken', e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-2xl p-4 text-white font-mono text-sm outline-none focus:border-blue-500" placeholder="••••••••••••••••" />
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                        <label className="block text-[10px] text-gray-300 font-bold uppercase tracking-[0.2em]">品牌語氣指南 (AI Analyzed Tone)</label>
                        <button 
                            type="button"
                            onClick={handleAutoAnalyzeStyle}
                            disabled={isAnalyzingTone}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-[10px] font-bold transition-colors disabled:opacity-50"
                        >
                            {isAnalyzingTone ? 'AI 分析中...' : '✨ 分析粉專過往貼文 (5點)'}
                        </button>
                    </div>
                    <textarea 
                        value={formData.brandStyleGuide || ''} 
                        onChange={e => handleChange('brandStyleGuide', e.target.value)}
                        className="w-full bg-black/30 border border-gray-600 rounded-2xl p-4 text-gray-300 text-sm h-32 focus:border-primary outline-none font-mono resize-none"
                        placeholder="點擊上方按鈕自動分析，或在此手動輸入品牌語氣規範..."
                    />
                </div>
            </section>
        </form>
    </div>
  );
};

export default SettingsForm;
