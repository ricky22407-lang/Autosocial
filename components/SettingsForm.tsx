
import React, { useState, useEffect } from 'react';
import { BrandSettings, ReferenceFile } from '../types';
import { validateFacebookToken, fetchRecentPostCaptions } from '../services/facebookService';
import { analyzeBrandTone, analyzeProductFile } from '../services/geminiService';
import { getCurrentUser, updateUserSettings } from '../services/authService';
import TokenTutorialModal from './TokenTutorialModal';

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
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string>('default');
  const [formData, setFormData] = useState<BrandSettings>(initialSettings);
  
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'partial'>('idle');
  const [missingPerms, setMissingPerms] = useState<string[]>([]);
  const [validationError, setValidationError] = useState('');
  const [debugData, setDebugData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzingTone, setIsAnalyzingTone] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
      const savedProfiles = localStorage.getItem('autosocial_brand_profiles');
      if (savedProfiles) {
          const parsed = JSON.parse(savedProfiles);
          setProfiles(parsed);
          const lastId = localStorage.getItem('autosocial_last_profile_id');
          if (lastId && parsed.find((p: any) => p.id === lastId)) {
              setCurrentProfileId(lastId);
              const target = parsed.find((p: any) => p.id === lastId);
              if(target) loadSettingsIntoForm(target.settings);
          } else if (parsed.length > 0) {
              setCurrentProfileId(parsed[0].id);
              loadSettingsIntoForm(parsed[0].settings);
          }
      } else {
          const defaultProfile = { id: 'default', name: initialSettings.industry || '預設品牌', settings: initialSettings };
          setProfiles([defaultProfile]);
          setCurrentProfileId('default');
          loadSettingsIntoForm(initialSettings);
      }
  }, []);

  const loadSettingsIntoForm = (settings: BrandSettings) => {
      setFormData({
          ...initialSettings,
          ...settings,
          // competitors: settings.competitors || [], // Removed
          referenceFiles: settings.referenceFiles || []
      });
      setTokenStatus('idle');
      setValidationError('');
      setMissingPerms([]);
      setDebugData(null);
  };

  useEffect(() => {
      if (profiles.length > 0) localStorage.setItem('autosocial_brand_profiles', JSON.stringify(profiles));
  }, [profiles]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'facebookToken') {
        setTokenStatus('idle');
        setValidationError('');
        setDebugData(null);
    }
  };

  const checkToken = async () => {
    if (!formData.facebookToken) {
        setValidationError('請先填寫 Token');
        setTokenStatus('invalid');
        return;
    }

    setTokenStatus('checking');
    setValidationError('');
    setMissingPerms([]);
    setDebugData(null);

    try {
        // Only Verify Validity & Permissions
        const res = await validateFacebookToken(formData.facebookToken);
        
        if (res.valid) {
            setTokenStatus(res.status === 'VALID' ? 'valid' : 'partial');
            setMissingPerms(res.missingPermissions);
            setDebugData(res.debugInfo);
        } else {
            setTokenStatus('invalid');
            setValidationError(res.error || 'Token 無效');
            setDebugData(res.debugInfo);
        }
    } catch (e: any) {
        setTokenStatus('invalid');
        setValidationError(e.message || '發生錯誤');
    }
  };

  const handleAutoAnalyzeStyle = async () => {
      if (!formData.facebookPageId || !formData.facebookToken) {
          alert("請先填寫並驗證 Facebook Page ID 與 Token");
          return;
      }
      
      setIsAnalyzingTone(true);
      try {
          // 1. Fetch recent posts
          const posts = await fetchRecentPostCaptions(formData.facebookPageId, formData.facebookToken, 15);
          if (posts.length < 3) {
              alert("貼文數量過少，無法有效分析 (至少需要 3 篇)。");
              setIsAnalyzingTone(false);
              return;
          }
          
          // 2. AI Analyze
          const styleGuide = await analyzeBrandTone(posts);
          
          // 3. Update Form
          setFormData(prev => ({ ...prev, brandStyleGuide: styleGuide }));
          alert("✅ 分析完成！已更新「品牌風格指南」。\nAI 將依據此風格撰寫貼文。");
      } catch (e: any) {
          alert(`分析失敗: ${e.message}`);
      } finally {
          setIsAnalyzingTone(false);
      }
  };

  const handleRefFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const newFile: ReferenceFile = { name: file.name, content: text };
      setFormData(prev => ({ ...prev, referenceFiles: [...(prev.referenceFiles || []), newFile] }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.size < 500000) {
          const reader = new FileReader();
          reader.onload = (ev) => setFormData(p => ({ ...p, logoUrl: ev.target?.result as string }));
          reader.readAsDataURL(file);
      } else alert("檔案過大（上限 500KB）");
  };

  const handleSaveWrapper = async () => {
      setIsSaving(true);
      try {
          const updatedProfiles = profiles.map(p => p.id === currentProfileId ? { ...p, settings: formData } : p);
          setProfiles(updatedProfiles);
          onSave(formData);
          const user = getCurrentUser();
          if (user) await updateUserSettings(user.uid, formData);
          alert("設定已儲存");
      } catch (e) {
          alert("儲存失敗");
      } finally {
          setIsSaving(false);
      }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-card rounded-xl border border-gray-700 animate-fade-in pb-24">
      <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
          <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1 font-bold">當前品牌身份</label>
              <select 
                value={currentProfileId} 
                onChange={(e) => {
                    const target = profiles.find(p => p.id === e.target.value);
                    if (target) { 
                        setCurrentProfileId(e.target.value); 
                        loadSettingsIntoForm(target.settings); 
                        localStorage.setItem('autosocial_last_profile_id', e.target.value);
                    }
                }} 
                className="bg-dark border border-primary rounded p-2 text-white font-bold text-xl outline-none"
              >
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
          </div>
          <button onClick={() => {
              const name = prompt("請輸入新品牌名稱:");
              if (name) {
                  const id = 'brand_' + Date.now();
                  const newProfiles = [...profiles, { id, name, settings: initialSettings }];
                  setProfiles(newProfiles);
                  setCurrentProfileId(id); 
                  loadSettingsIntoForm(initialSettings);
              }
          }} className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm transition-colors">+ 新增品牌</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 左側：API & 基礎資訊 */}
        <div className="lg:col-span-1 space-y-6 border-r border-gray-800 pr-4">
          <h3 className="text-lg font-bold text-primary border-l-4 border-primary pl-3">1. API 連結設定</h3>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Facebook 粉絲專頁 ID</label>
            <input name="facebookPageId" value={formData.facebookPageId || ''} onChange={handleChange} className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm" placeholder="Page ID" />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1 flex justify-between">
                <span>Facebook Access Token</span>
                <button onClick={() => setShowTutorial(true)} className="text-primary hover:underline text-xs flex items-center gap-1">
                    ❓ 如何獲取 Token
                </button>
            </label>
            <div className="flex gap-2">
              <input name="facebookToken" type="password" value={formData.facebookToken || ''} onChange={handleChange} className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white text-sm" placeholder="EAA..." />
              <button onClick={checkToken} disabled={tokenStatus === 'checking'} className={`px-3 rounded text-white text-xs font-bold ${tokenStatus === 'valid' || tokenStatus === 'partial' ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                {tokenStatus === 'checking' ? '...' : '驗證'}
              </button>
            </div>
            {tokenStatus === 'valid' && debugData && <p className="text-[10px] text-green-400 mt-1">✅ 已連線: {debugData.name}</p>}
            {tokenStatus === 'partial' && <p className="text-[10px] text-yellow-400 mt-1">⚠️ 部分權限缺失 (Page Token 可略過)</p>}
            {tokenStatus === 'invalid' && <p className="text-[10px] text-red-400 mt-1">❌ {validationError}</p>}
          </div>

          <div className="pt-4 border-t border-gray-800">
            <h3 className="text-lg font-bold text-primary border-l-4 border-primary pl-3 mb-4">2. 品牌基本資料</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">官方網站 (供 AI 參考)</label>
                <input name="website" value={formData.website || ''} onChange={handleChange} className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm" placeholder="https://..." />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">產業類別</label>
                <input name="industry" value={formData.industry || ''} onChange={handleChange} className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm" placeholder="醫美、餐飲..." />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">服務/產品項目</label>
                <textarea name="services" value={formData.services || ''} onChange={handleChange} className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-xs h-20" placeholder="主要販售內容" />
              </div>
            </div>
          </div>
        </div>

        {/* 中間：人設與語氣 */}
        <div className="lg:col-span-1 space-y-6">
          <h3 className="text-lg font-bold text-primary border-l-4 border-primary pl-3">3. 文案風格與知識庫</h3>
          
          {/* Brand Style Analyzer */}
          <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/30 p-4 rounded-xl border border-indigo-500/30">
              <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-bold text-indigo-200">🔮 品牌風格指南 (Style DNA)</label>
                  <button 
                      onClick={handleAutoAnalyzeStyle}
                      disabled={isAnalyzingTone} 
                      className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded shadow-lg transition-colors disabled:opacity-50"
                  >
                      {isAnalyzingTone ? '分析中...' : '一鍵分析過往貼文'}
                  </button>
              </div>
              <textarea 
                  name="brandStyleGuide" 
                  value={formData.brandStyleGuide || ''} 
                  onChange={handleChange} 
                  className="w-full bg-dark/80 border border-indigo-500/30 rounded p-2 text-gray-300 text-xs h-32 leading-relaxed" 
                  placeholder="點擊上方按鈕，AI 將自動分析您的粉專貼文，產生專屬的語氣與格式指導方針..." 
              />
              <p className="text-[10px] text-gray-500 mt-1">* 這是 AI 寫作的最高指導原則，比下方的人設更重要。</p>
          </div>

          <div>
              <label className="block text-sm text-gray-400 mb-1">基礎語氣 (Tone)</label>
              <input name="brandTone" value={formData.brandTone || ''} onChange={handleChange} className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm" placeholder="例如：幽默、專業、溫馨 (作為備用設定)" />
          </div>

          <div>
              <label className="block text-sm text-gray-400 mb-1">核心知識庫 (產品詳情)</label>
              <textarea name="productContext" value={formData.productContext || ''} onChange={handleChange} className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-xs h-32" placeholder="詳細產品資訊，AI 將據此撰寫文案。" />
          </div>

          <div>
              <label className="block text-sm text-gray-400 mb-1">固定 Hashtags</label>
              <input name="fixedHashtags" value={formData.fixedHashtags || ''} onChange={handleChange} className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-xs" placeholder="#品牌名 #產品" />
          </div>
        </div>

        {/* 右側：附件 */}
        <div className="lg:col-span-1 space-y-6 border-l border-gray-800 pl-4">
          <h3 className="text-lg font-bold text-primary border-l-4 border-primary pl-3">4. 進階內容策略</h3>
          
          <div>
              <label className="block text-sm text-gray-400 mb-1">Logo 浮水印</label>
              <div className="flex items-center gap-4">
                  {formData.logoUrl && <img src={formData.logoUrl} className="w-12 h-12 object-contain bg-black/20 rounded border border-gray-700" alt="Logo" />}
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-[10px] text-gray-500" />
              </div>
          </div>

          {/* Competitors Removed per user request */}
          <div className="hidden">
              <label className="block text-sm text-gray-400 mb-1">追蹤競品</label>
              <p className="text-xs text-gray-500">已停用</p>
          </div>

          <div>
              <label className="block text-sm text-gray-400 mb-1">產品手冊/參考文件 (TXT/MD)</label>
              <p className="text-[10px] text-gray-500 mb-2">上傳產品規格或過往文案，讓 AI 寫作更有依據。</p>
              <input type="file" accept=".txt,.md" onChange={handleRefFileUpload} className="text-xs text-gray-500 mb-2" />
              <div className="space-y-1">
                  {(formData.referenceFiles || []).map((f, i) => (
                      <div key={i} className="text-[10px] text-gray-400 flex justify-between bg-dark p-2 rounded border border-gray-800">
                          <span>📄 {f.name}</span>
                          <button onClick={() => setFormData(prev => ({ ...prev, referenceFiles: (prev.referenceFiles || []).filter((_, idx) => idx !== i) }))} className="text-red-500">刪除</button>
                      </div>
                  ))}
              </div>
          </div>
        </div>
      </div>

      <div className="mt-12 flex justify-end border-t border-gray-700 pt-6">
        <button 
            onClick={handleSaveWrapper} 
            disabled={isSaving} 
            className="bg-primary hover:bg-blue-600 text-white px-12 py-3 rounded-lg font-bold shadow-lg transform transition-all active:scale-95 disabled:opacity-50"
        >
          {isSaving ? '儲存中...' : '儲存品牌設定'}
        </button>
      </div>

      {showTutorial && <TokenTutorialModal platform="facebook" onClose={() => setShowTutorial(false)} />}
    </div>
  );
};

export default SettingsForm;
