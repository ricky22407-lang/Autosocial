
import React, { useState, useEffect } from 'react';
import { BrandSettings, ReferenceFile } from '../types';
import { validateFacebookToken, refreshLongLivedToken, fetchRecentPostCaptions } from '../services/facebookService';
import { analyzeBrandTone, analyzeProductFile, analyzeVisualStyle } from '../services/geminiService';
import { getCurrentUser, updateUserSettings } from '../services/authService';

interface Props {
  onSave: (settings: BrandSettings) => void;
  initialSettings: BrandSettings;
}

interface BrandProfile {
    id: string;
    name: string;
    settings: BrandSettings;
}

const SettingsForm: React.FC<Props> = ({ onSave, initialSettings }) => {
  // --- Multi-Brand State ---
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string>('default');
  const [isManagingProfiles, setIsManagingProfiles] = useState(false);

  const [formData, setFormData] = useState<BrandSettings>(initialSettings);
  
  // --- Existing State ---
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [refreshMsg, setRefreshMsg] = useState('');
  const [competitorsRaw, setCompetitorsRaw] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzingTone, setIsAnalyzingTone] = useState(false);
  const [isAnalyzingProduct, setIsAnalyzingProduct] = useState(false);
  const [styleImages, setStyleImages] = useState<string[]>([]);
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);

  // Initialize Profiles
  useEffect(() => {
      const savedProfiles = localStorage.getItem('autosocial_brand_profiles');
      if (savedProfiles) {
          const parsed = JSON.parse(savedProfiles);
          setProfiles(parsed);
          // Load last used profile ID
          const lastId = localStorage.getItem('autosocial_last_profile_id');
          if (lastId && parsed.find((p: any) => p.id === lastId)) {
              setCurrentProfileId(lastId);
              const target = parsed.find((p: any) => p.id === lastId);
              if(target) loadSettingsIntoForm(target.settings);
          } else {
              // Default to first
              setCurrentProfileId(parsed[0].id);
              loadSettingsIntoForm(parsed[0].settings);
          }
      } else {
          // Init with current props as default profile
          const defaultProfile: BrandProfile = {
              id: 'default',
              name: initialSettings.industry || '預設品牌',
              settings: initialSettings
          };
          setProfiles([defaultProfile]);
          setCurrentProfileId('default');
          loadSettingsIntoForm(initialSettings);
      }
  }, []); // Run once on mount

  const loadSettingsIntoForm = (settings: BrandSettings) => {
      setFormData(settings);
      setCompetitorsRaw((settings.competitors || []).join(', '));
      // Reset validation states
      setTokenStatus('idle');
      setRefreshMsg('');
  };

  // Save profiles to LS whenever they change
  useEffect(() => {
      if (profiles.length > 0) {
          localStorage.setItem('autosocial_brand_profiles', JSON.stringify(profiles));
      }
  }, [profiles]);

  useEffect(() => {
      localStorage.setItem('autosocial_last_profile_id', currentProfileId);
  }, [currentProfileId]);

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
    const list = competitorsRaw.split(/[,，]/).map(s => s.trim()).filter(s => s !== '');
    setFormData(prev => ({ ...prev, competitors: list }));
    setCompetitorsRaw(list.join(', '));
  };

  // --- Profile Management Handlers ---
  const handleProfileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newId = e.target.value;
      // 1. Save current changes to the old profile before switching? 
      // Optional, but safer to let user explicit save. 
      // For UX, let's just switch and confirm if dirty? Skipping complexity: just switch.
      const target = profiles.find(p => p.id === newId);
      if (target) {
          setCurrentProfileId(newId);
          loadSettingsIntoForm(target.settings);
      }
  };

  const handleCreateProfile = () => {
      const name = prompt("請輸入新品牌名稱：");
      if (!name) return;
      
      const newId = 'brand_' + Date.now();
      const newProfile: BrandProfile = {
          id: newId,
          name: name,
          settings: { ...initialSettings, industry: name } // Reset to blank/default
      };
      
      setProfiles([...profiles, newProfile]);
      setCurrentProfileId(newId);
      loadSettingsIntoForm(newProfile.settings);
      alert(`已建立新品牌「${name}」`);
  };

  const handleDeleteProfile = () => {
      if (profiles.length <= 1) return alert("至少需保留一個品牌設定");
      if (!confirm("確定刪除目前品牌設定檔？此操作無法復原。")) return;
      
      const newProfiles = profiles.filter(p => p.id !== currentProfileId);
      setProfiles(newProfiles);
      
      // Switch to first available
      setCurrentProfileId(newProfiles[0].id);
      loadSettingsIntoForm(newProfiles[0].settings);
  };

  const handleRenameProfile = () => {
      const current = profiles.find(p => p.id === currentProfileId);
      if(!current) return;
      const newName = prompt("重新命名品牌：", current.name);
      if(newName && newName !== current.name) {
          setProfiles(prev => prev.map(p => p.id === currentProfileId ? { ...p, name: newName } : p));
      }
  };

  // --- Existing Logic ---
  const checkToken = async (tokenToCheck?: string, autoRefresh = true) => {
    const token = tokenToCheck ?? formData.facebookToken;
    if (!token) return;
    
    setTokenStatus('checking');
    setRefreshMsg('');

    const isValid = await validateFacebookToken(token);
    
    if (isValid) {
        setTokenStatus('valid');
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
      
      if (file.size > 500 * 1024) { 
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
                  setStyleImages(prev => [...prev, ...newImages].slice(0, 5)); 
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

  const handleSaveWrapper = async () => {
      setIsSaving(true);
      try {
          // 1. Update Profile in Array
          const updatedProfiles = profiles.map(p => 
              p.id === currentProfileId ? { ...p, settings: formData } : p
          );
          setProfiles(updatedProfiles);
          
          // 2. Local Save
          onSave(formData);
          
          // 3. Cloud Sync
          const user = getCurrentUser();
          if (user) {
              await updateUserSettings(user.uid, formData);
          }
          alert("設定已儲存！");
      } catch (e) {
          console.error("Save failed", e);
      } finally {
          setIsSaving(false);
      }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-card rounded-xl shadow-lg border border-gray-700 animate-fade-in pb-20">
      
      {/* --- Multi-Brand Switcher Header --- */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 border-b border-gray-600 pb-4 gap-4">
          <div className="flex-1 w-full">
              <label className="block text-xs text-gray-400 mb-1">目前管理的品牌</label>
              <div className="flex gap-2">
                  <select 
                      value={currentProfileId} 
                      onChange={handleProfileChange}
                      className="flex-1 bg-dark border border-primary rounded p-2 text-white font-bold text-lg focus:outline-none"
                  >
                      {profiles.map(p => (
                          <option key={p.id} value={p.id}>
                              {p.name}
                          </option>
                      ))}
                  </select>
                  <button onClick={handleRenameProfile} className="bg-gray-700 hover:bg-gray-600 px-3 rounded text-white" title="重新命名">✎</button>
              </div>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
              <button 
                  onClick={handleCreateProfile}
                  className="flex-1 md:flex-none bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center justify-center gap-1"
              >
                  + 新增品牌
              </button>
              {profiles.length > 1 && (
                  <button 
                      onClick={handleDeleteProfile}
                      className="flex-1 md:flex-none bg-red-900/50 hover:bg-red-900 text-red-200 px-4 py-2 rounded text-sm font-bold border border-red-800"
                  >
                      刪除此品牌
                  </button>
              )}
          </div>
      </div>

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
          <h3 className="text-lg font-semibold text-primary">品牌識別與經營策略</h3>
          
          {/* Brand Type Strategy Selector */}
          <div className="bg-gray-800 p-3 rounded border border-gray-600">
              <label className="block text-sm text-white font-bold mb-2">經營模式 (影響 AI 文案風格)</label>
              <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer bg-dark px-3 py-2 rounded border border-gray-600 hover:border-primary flex-1">
                      <input 
                          type="radio" 
                          name="brandType" 
                          value="enterprise" 
                          checked={!formData.brandType || formData.brandType === 'enterprise'} 
                          onChange={() => setFormData(prev => ({...prev, brandType: 'enterprise'}))}
                      />
                      <div className="text-sm">
                          <span className="text-blue-300 font-bold block">🏢 企業品牌</span>
                          <span className="text-xs text-gray-400">使用 PAS/AIDA 經典行銷框架，強調專業、結構化與產品價值。</span>
                      </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer bg-dark px-3 py-2 rounded border border-gray-600 hover:border-primary flex-1">
                      <input 
                          type="radio" 
                          name="brandType" 
                          value="personal" 
                          checked={formData.brandType === 'personal'} 
                          onChange={() => setFormData(prev => ({...prev, brandType: 'personal'}))}
                      />
                      <div className="text-sm">
                          <span className="text-pink-300 font-bold block">👤 個人品牌</span>
                          <span className="text-xs text-gray-400">強調「真人感」、情緒化、口語短句，減少商業詞彙。</span>
                      </div>
                  </label>
              </div>
          </div>

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
          {isSaving ? '儲存同步中...' : '儲存全部設定'}
        </button>
      </div>
    </div>
  );
};

export default SettingsForm;
