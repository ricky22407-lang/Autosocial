
import React from 'react';
import { BrandSettings } from '../../types';
import { useBrandSettings } from './hooks/useBrandSettings';

interface Props {
  initialSettings: BrandSettings;
  onSave: (settings: BrandSettings) => void;
}

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
  const {
      formData, handleChange,
      industrySelectValue, handleIndustrySelectChange, showCustomIndustry, INDUSTRIES,
      competitorHandlers,
      fbState, fbActions,
      logoActions,
      handleSubmit
  } = useBrandSettings(initialSettings, onSave);

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
                                onChange={e => handleIndustrySelectChange(e.target.value)}
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
                                onClick={() => logoActions.fileInputRef.current?.click()}
                                className="bg-gray-800 hover:bg-gray-700 text-white px-6 rounded-2xl font-bold whitespace-nowrap border border-gray-700 transition-colors"
                            >
                                📂 上傳
                            </button>
                            <input 
                                type="file" 
                                ref={logoActions.fileInputRef}
                                className="hidden"
                                accept="image/png,image/jpeg"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if(file) logoActions.handleLogoUpload(file);
                                }}
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Competitor Intelligence */}
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
                                onChange={e => competitorHandlers.handleCompetitorChange(idx, e.target.value)} 
                                className="flex-1 bg-black/40 border border-gray-700 rounded-2xl p-4 text-white text-sm outline-none focus:border-purple-500 transition-colors placeholder-gray-600" 
                                placeholder="例如: https://www.facebook.com/competitor..." 
                            />
                            <button 
                                type="button" 
                                onClick={() => competitorHandlers.removeCompetitorField(idx)} 
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
                            onClick={competitorHandlers.addCompetitorField}
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
                        onClick={fbActions.handleConnectFacebook}
                        disabled={fbState.isFbLoading}
                        className={`w-full sm:w-auto px-8 py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-lg relative z-10 
                            ${!fbState.isFbSdkReady 
                                ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-500/50 hover:bg-yellow-600/30 cursor-pointer' 
                                : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50'
                            }`}
                        title={!fbState.isFbSdkReady ? "點擊查看連線問題" : "連結粉絲專頁"}
                    >
                        {fbState.isFbLoading ? <div className="loader w-3 h-3 border-t-white"></div> : (fbState.isFbSdkReady ? '⚡' : '⚠️')} 
                        {fbState.isFbLoading ? '授權中...' : (fbState.isFbSdkReady ? '一鍵連結 Facebook 帳號' : '檢測連線狀態 (SDK Error)')}
                    </button>
                </div>

                {fbState.fbPages.length > 0 && (
                    <div className="bg-blue-900/20 p-6 rounded-3xl border border-blue-500/30 animate-fade-in space-y-4">
                        <p className="text-sm font-bold text-blue-200">請選擇要管理的粉絲專頁：</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {fbState.fbPages.map(page => (
                                <button key={page.id} type="button" onClick={() => fbActions.selectPage(page)} className="bg-black/40 hover:bg-blue-600 text-left p-4 rounded-2xl border border-gray-700 transition-all flex justify-between items-center group">
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
                            onClick={fbActions.handleAutoAnalyzeStyle}
                            disabled={fbState.isAnalyzingTone}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-[10px] font-bold transition-colors disabled:opacity-50"
                        >
                            {fbState.isAnalyzingTone ? 'AI 分析中...' : '✨ 分析粉專過往貼文 (5點)'}
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
