import React, { useState, useEffect } from 'react';
import { BrandSettings, ReferenceFile } from '../types';
import { validateFacebookToken, refreshLongLivedToken, fetchRecentPostCaptions } from '../services/facebookService';
import { analyzeBrandTone, analyzeProductFile, analyzeVisualStyle } from '../services/geminiService';
import { getCurrentUser, updateUserSettings } from '../services/authService';

interface Props {
  onSave: (settings: BrandSettings) => void;
  initialSettings: BrandSettings;
}

const SettingsForm: React.FC<Props> = ({ onSave, initialSettings }) => {
  const [formData, setFormData] = useState<BrandSettings>(initialSettings);
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [refreshMsg, setRefreshMsg] = useState('');
  
  // Separate state for raw string input to avoid cursor jumping issues
  // Fix: Add safety check (|| []) to prevent crash if competitors is null/undefined
  const [competitorsRaw, setCompetitorsRaw] = useState((initialSettings.competitors || []).join(', '));
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzingTone, setIsAnalyzingTone] = useState(false);
  const [isAnalyzingProduct, setIsAnalyzingProduct] = useState(false);
  
  // Style Tuner State
  const [styleImages, setStyleImages] = useState<string[]>([]);
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);

  // Auto-save logic to localStorage to prevent data loss on refresh
  useEffect(() => {
    localStorage.setItem('autosocial_settings', JSON.stringify(formData));
  }, [formData]);

  // Check token on initial load if present
  useEffect(() => {
    if (initialSettings.facebookToken) {
      checkToken(initialSettings.facebookToken, false); // Don't auto-refresh on simple load check
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'facebookToken') {
        setTokenStatus('idle');
        setRefreshMsg('');
    }
  };

  const handleCompetitorRawChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCompetitorsRaw(e.target.value);
  };

  const handleCompetitorBlur = () => {
    // Process only on blur to allow smooth typing
    const list = competitorsRaw.split(/[,，]/).map(s => s.trim()).filter(s => s !== '');
    setFormData(prev => ({ ...prev, competitors: list }));
    // Optional: Re-format raw string for tidiness
    setCompetitorsRaw(list.join(', '));
  };

  const checkToken = async (tokenToCheck?: string, autoRefresh = true) => {
    const token = tokenToCheck ?? formData.facebookToken;
    if (!token) return;
    
    setTokenStatus('checking');
    setRefreshMsg('');

    // 1. Validate
    const isValid = await validateFacebookToken(token);
    
    if (isValid) {
        setTokenStatus('valid');
        
        // 2. Auto Extend/Refresh if valid and requested (User clicked button)
        if (autoRefresh) {
            setRefreshMsg('正在嘗試延長效期...');
            try {
                const refreshRes = await refreshLongLivedToken(token);
                if (refreshRes.success && refreshRes.newToken) {
                    setFormData(prev => ({
                        ...prev, 
                        facebookToken: refreshRes.newToken!,
                        tokenExpiry: refreshRes.expiry
                    }));
                    setRefreshMsg(`✅ 驗證成功且已自動延長效期！(Expires: ${new Date(refreshRes.expiry!).toLocaleDateString()})`);
                } else {
                    // Valid but refresh failed (maybe already long-lived or API restriction)
                    setRefreshMsg('✅ Token 有效 (無法自動延長，請確認是否已為長期 Token)');
                }
            } catch (e) {
                setRefreshMsg('✅ Token 有效');
            }
        }
    } else {
        setTokenStatus('invalid');
        setRefreshMsg('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const text = await file.text();
      const newFile: ReferenceFile = { name: file.name, content: text };
      setFormData(prev => ({
        ...prev,
        // Ensure referenceFiles is an array
        referenceFiles: [...(prev.referenceFiles || []), newFile]
      }));
    }
  };

  const handleProductDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setIsAnalyzingProduct(true);
      try {
          const text = await file.text();
          const analysis = await analyzeProductFile(text);
          setFormData(prev => ({ ...prev, productContext: analysis }));
          alert("產品文件分析完成！已將精華存入「核心知識庫」。");
      } catch (e: any) {
          alert(`分析失敗: ${e.message}`);
      } finally {
          setIsAnalyzingProduct(false);
      }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      if (file.size > 500 * 1024) { // 500KB limit for Firestore safety
          alert("Logo 檔案過大，請使用小於 500KB 的圖片");
          return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
          const base64 = ev.target?.result as string;
          setFormData(prev => ({ ...prev, logoUrl: base64 }));
      };
      reader.readAsDataURL(file);
  };

  // --- Brand Style Tuner Handlers ---
  const handleStyleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      
      const newImages: string[] = [];
      let processed = 0;

      Array.from(files).forEach((file: File) => {
          if (file.size > 2 * 1024 * 1024) {
              alert(`檔案 ${file.name} 過大 (限制 2MB)，已略過。`);
              processed++;
              return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
              newImages.push(ev.target?.result as string);
              processed++;
              if (processed === files.length) {
                  setStyleImages(prev => [...prev, ...newImages].slice(0, 5)); // Limit to 5 max
              }
          };
          reader.readAsDataURL(file);
      });
  };

  const handleAnalyzeStyle = async () => {
      if (styleImages.length === 0) return alert("請先上傳至少 1 張圖片");
      
      setIsAnalyzingStyle(true);
      try {
          const prompt = await analyzeVisualStyle(styleImages);
          setFormData(prev => ({ ...prev, brandStylePrompt: prompt }));
          alert("視覺風格分析完成！已自動填入「AI 繪圖風格設定」。");
      } catch (e: any) {
          alert(`分析失敗: ${e.message}`);
      } finally {
          setIsAnalyzingStyle(false);
      }
  };

  const handleAnalyzeTone = async () => {
      if (!formData.facebookPageId || !formData.facebookToken) {
          alert("請先設定 Facebook Page ID 與 Token");
          return;
      }
      setIsAnalyzingTone(true);
      try {
          const posts = await fetchRecentPostCaptions(formData.facebookPageId, formData.facebookToken);
          if (posts.length === 0) {
              alert("讀取不到貼文，無法分析");
              return;
          }
          const result = await analyzeBrandTone(posts);
          setFormData(prev => ({
              ...prev,
              brandTone: result.tone,
              persona: result.persona
          }));
          alert("分析完成！已自動更新「品牌語氣」與「人設」。");
      } catch (e: any) {
          alert(`分析失敗: ${e.message}`);
      } finally {
          setIsAnalyzingTone(false);
      }
  };

  const removeFile = (index: number) => {
    setFormData(prev => ({
      ...prev,
      referenceFiles: (prev.referenceFiles || []).filter((_, i) => i !== index)
    }));
  };

  const handleSaveWrapper = async () => {
      setIsSaving(true);
      try {
          // Local Save
          onSave(formData);
          
          // Cloud Sync
          const user = getCurrentUser();
          if (user) {
              await updateUserSettings(user.uid, formData);
          }
      } catch (e) {
          console.error("Save failed", e);
      } finally {
          setIsSaving(false);
      }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-card rounded-xl shadow-lg border border-gray-700 animate-fade-in pb-20">
      <h2 className="text-2xl font-bold mb-6 text-white">品牌與 API 設定</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Configuration */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-primary">系統與 API 設定</h3>
          
          <div className="p-4 border border-blue-900 bg-blue-900/10 rounded-lg">
             <p className="text-sm text-blue-300 font-bold mb-1">🔒 安全性設定</p>
             <p className="text-xs text-gray-400">Gemini API Key 現在由後端系統統一管理，無需在此輸入，確保您的金鑰安全。</p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Facebook 粉絲專頁 ID</label>
            <input 
              name="facebookPageId" 
              value={formData.facebookPageId || ''} 
              onChange={handleChange}
              className="w-full bg-dark border border-gray-600 rounded p-2 text-white focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Facebook Graph API Token</label>
            <div className="flex gap-2">
              <input 
                name="facebookToken" 
                type="password"
                value={formData.facebookToken || ''} 
                onChange={handleChange}
                placeholder="請輸入長期 Token"
                className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white focus:border-primary outline-none"
              />
              <button 
                onClick={() => checkToken(undefined, true)}
                className={`px-4 py-2 rounded font-bold transition-colors ${
                  tokenStatus === 'valid' ? 'bg-green-600 text-white' : 
                  tokenStatus === 'invalid' ? 'bg-red-600 text-white' : 
                  'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                {tokenStatus === 'checking' ? '檢查中...' : tokenStatus === 'valid' ? '驗證成功' : tokenStatus === 'invalid' ? '驗證失敗' : '驗證並延長'}
              </button>
            </div>
            {refreshMsg && <p className={`text-xs mt-1 ${refreshMsg.includes('❌') || tokenStatus === 'invalid' ? 'text-red-400' : 'text-green-400'}`}>{refreshMsg}</p>}
          </div>
          
           {/* Logo Upload */}
           <div>
               <label className="block text-sm text-gray-400 mb-1">品牌 Logo (浮水印用)</label>
               <div className="flex items-center gap-4">
                   {formData.logoUrl && (
                       <img src={formData.logoUrl} alt="Logo" className="w-12 h-12 object-contain bg-white rounded" />
                   )}
                   <label className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded cursor-pointer text-sm">
                       上傳圖片 (Max 500KB)
                       <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                   </label>
                   {formData.logoUrl && (
                       <button onClick={() => setFormData(p => ({...p, logoUrl: undefined}))} className="text-red-400 text-xs">移除</button>
                   )}
               </div>
           </div>
        </div>

        {/* Brand Identity */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-primary">品牌識別</h3>
          <div>
            <label className="block text-sm text-gray-400 mb-1">產業類別</label>
            <input 
              name="industry" 
              value={formData.industry || ''} 
              onChange={handleChange}
              className="w-full bg-dark border border-gray-600 rounded p-2 text-white focus:border-primary outline-none"
              placeholder="例如：科技業、零售業"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">服務項目</label>
            <input 
              name="services" 
              value={formData.services || ''} 
              onChange={handleChange}
              className="w-full bg-dark border border-gray-600 rounded p-2 text-white focus:border-primary outline-none"
            />
          </div>

          {/* AI Tone Analysis Section */}
          <div className="p-4 bg-purple-900/10 border border-purple-500/30 rounded-lg space-y-3">
             <div className="flex justify-between items-center">
                 <label className="block text-sm text-purple-300 font-bold">品牌語氣 & 小編人設 (AI)</label>
                 <button 
                    onClick={handleAnalyzeTone}
                    disabled={isAnalyzingTone}
                    className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded disabled:opacity-50"
                 >
                     {isAnalyzingTone ? 'AI 分析中...' : '🧠 從粉專貼文自動分析'}
                 </button>
             </div>
             <input 
                name="brandTone" 
                value={formData.brandTone || ''} 
                onChange={handleChange}
                placeholder="品牌語氣 (可手動或由 AI 分析)"
                className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm"
             />
             <textarea 
                name="persona" 
                value={formData.persona || ''} 
                onChange={handleChange}
                rows={3}
                className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm"
                placeholder="小編人設 (可手動或由 AI 分析)"
             />
          </div>

          {/* Product Knowledge Base */}
          <div className="p-4 bg-green-900/10 border border-green-500/30 rounded-lg space-y-3">
             <div className="flex justify-between items-center">
                 <label className="block text-sm text-green-300 font-bold">產品核心知識庫 (AI)</label>
                 <label className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded cursor-pointer">
                     {isAnalyzingProduct ? '正在解析...' : '📄 上傳文件並解析'}
                     <input type="file" onChange={handleProductDocUpload} className="hidden" accept=".txt,.md,.csv" disabled={isAnalyzingProduct} />
                 </label>
             </div>
             <p className="text-xs text-gray-400">AI 將分析上傳的文件，提取產品核心價值與規格，作為未來寫文案的最高指導原則。</p>
             <textarea 
                name="productContext" 
                value={formData.productContext || ''} 
                onChange={handleChange}
                rows={5}
                className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm"
                placeholder="此處將顯示 AI 分析後的產品精華摘要..."
             />
          </div>

          {/* Brand Style Tuner */}
          <div className="p-4 bg-pink-900/10 border border-pink-500/30 rounded-lg space-y-3">
             <div className="flex justify-between items-center">
                 <label className="block text-sm text-pink-300 font-bold">🎨 品牌視覺風格記憶庫 (Style Tuner)</label>
             </div>
             <p className="text-xs text-gray-400">上傳 3-5 張代表貴品牌風格的圖片，AI 將自動分析色調、光影與構圖，確保未來生成圖片風格一致。</p>
             
             {/* Image Upload Area */}
             <div className="flex flex-wrap gap-2 mb-2">
                 {styleImages.map((src, i) => (
                     <div key={i} className="relative w-12 h-12">
                         <img src={src} className="w-full h-full object-cover rounded border border-gray-600" />
                         <button onClick={() => setStyleImages(p => p.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">×</button>
                     </div>
                 ))}
                 {styleImages.length < 5 && (
                     <label className="w-12 h-12 border-2 border-dashed border-gray-600 rounded flex items-center justify-center cursor-pointer hover:border-pink-500 text-gray-500 hover:text-pink-500 text-xl font-bold">
                         +
                         <input type="file" accept="image/*" multiple className="hidden" onChange={handleStyleImageUpload} />
                     </label>
                 )}
             </div>

             <button 
                onClick={handleAnalyzeStyle}
                disabled={isAnalyzingStyle || styleImages.length === 0}
                className="w-full text-xs bg-pink-700 hover:bg-pink-600 text-white py-2 rounded disabled:opacity-50 flex items-center justify-center gap-2"
             >
                 {isAnalyzingStyle ? 'AI 正在分析圖片風格...' : '🧠 分析並建立風格 Prompt'}
             </button>

             <textarea 
                name="brandStylePrompt" 
                value={formData.brandStylePrompt || ''} 
                onChange={handleChange}
                rows={3}
                className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm"
                placeholder="分析結果將顯示於此 (例如：Minimalist, pastel colors, soft lighting...)"
             />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">固定 Hashtags</label>
            <input 
              name="fixedHashtags" 
              value={formData.fixedHashtags || ''} 
              onChange={handleChange}
              className="w-full bg-dark border border-gray-600 rounded p-2 text-white focus:border-primary outline-none"
              placeholder="#AutoSocial"
            />
          </div>

          <div>
             <label className="block text-sm text-gray-400 mb-1">競品網站連結 (逗號分隔)</label>
             <input 
                value={competitorsRaw}
                onChange={handleCompetitorRawChange}
                onBlur={handleCompetitorBlur}
                className="w-full bg-dark border border-gray-600 rounded p-2 text-white focus:border-primary outline-none"
                placeholder="例如：apple.com, google.com (支援全形逗號)"
              />
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button 
          onClick={handleSaveWrapper}
          disabled={isSaving}
          className="bg-primary hover:bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-all disabled:opacity-50"
        >
          {isSaving ? '儲存同步中...' : '儲存設定 (同步至雲端)'}
        </button>
      </div>
    </div>
  );
};

export default SettingsForm;