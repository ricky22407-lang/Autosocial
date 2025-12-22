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
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string>('default');
  const [formData, setFormData] = useState<BrandSettings>(initialSettings);
  
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'partial'>('idle');
  const [missingPerms, setMissingPerms] = useState<string[]>([]);
  const [validationError, setValidationError] = useState('');
  const [debugData, setDebugData] = useState<any>(null); // 新增偵錯資料顯示
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzingTone, setIsAnalyzingTone] = useState(false);

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
      setFormData(settings);
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
        const res = await validateFacebookToken(formData.facebookToken);
        
        if (res.valid) {
            setTokenStatus(res.status === 'VALID' ? 'valid' : 'partial');
            setMissingPerms(res.missingPermissions);
            setDebugData(res.debugInfo);
        } else {
            setTokenStatus('invalid');
            setValidationError(res.error || 'Token 無效或連線錯誤');
            setDebugData(res.debugInfo);
        }
    } catch (e) {
        setTokenStatus('invalid');
        setValidationError('發生未知網路錯誤');
    }
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
    <div className="max-w-4xl mx-auto p-6 bg-card rounded-xl border border-gray-700 animate-fade-in pb-20">
      <div className="flex justify-between items-center mb-6 border-b border-gray-600 pb-4">
          <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">切換品牌身分</label>
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
                className="bg-dark border border-primary rounded p-2 text-white font-bold text-lg outline-none focus:ring-1 focus:ring-primary"
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-primary border-l-4 border-primary pl-3">API 連結設定</h3>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Facebook 粉絲專頁 ID</label>
            <input 
              name="facebookPageId" 
              value={formData.facebookPageId || ''} 
              onChange={handleChange} 
              className="w-full bg-dark border border-gray-600 rounded p-2 text-white placeholder-gray-600 outline-none focus:border-primary" 
              placeholder="例如：184153664786..."
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Facebook Access Token</label>
            <div className="flex gap-2">
              <input 
                name="facebookToken" 
                type="password" 
                value={formData.facebookToken || ''} 
                onChange={handleChange} 
                className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white placeholder-gray-600 outline-none focus:border-primary" 
                placeholder="EAA..."
              />
              <button 
                onClick={checkToken} 
                disabled={tokenStatus === 'checking'}
                className={`px-4 rounded text-white text-sm font-bold transition-colors ${
                    tokenStatus === 'valid' || tokenStatus === 'partial' ? 'bg-green-600' : 
                    tokenStatus === 'checking' ? 'bg-gray-600 animate-pulse' : 
                    'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {tokenStatus === 'checking' ? '驗證中' : (tokenStatus === 'valid' || tokenStatus === 'partial' ? '已通過' : '驗證')}
              </button>
            </div>

            {/* 驗證反饋區 */}
            {(tokenStatus === 'valid' || tokenStatus === 'partial') && debugData && (
                <div className="mt-2 p-3 bg-green-900/10 border border-green-900/50 rounded">
                    <p className="text-green-400 text-xs font-bold">✅ 已連結：{debugData.name}</p>
                    <p className="text-[10px] text-gray-500 mt-1">類別：{debugData.category}</p>
                    {tokenStatus === 'partial' && (
                        <div className="mt-2 border-t border-green-900/20 pt-2">
                             <p className="text-yellow-500 text-[10px] font-bold">⚠️ 提醒：缺少部分發文權限</p>
                             <ul className="list-disc list-inside text-[9px] text-gray-400">
                                {missingPerms.map(p => <li key={p}>{p}</li>)}
                             </ul>
                        </div>
                    )}
                </div>
            )}
            
            {tokenStatus === 'invalid' && (
                <div className="mt-2 p-3 bg-red-900/20 border border-red-800 rounded">
                    <p className="text-red-400 text-xs font-bold">❌ 驗證失敗</p>
                    <p className="text-[11px] text-red-300 mt-1">{validationError}</p>
                    {debugData && (
                        <p className="text-[9px] text-gray-500 mt-2 font-mono break-all">技術錯誤: {JSON.stringify(debugData)}</p>
                    )}
                </div>
            )}
          </div>

          <div>
              <label className="block text-sm text-gray-400 mb-1">品牌浮水印 Logo</label>
              <div className="flex items-center gap-4">
                  {formData.logoUrl && <img src={formData.logoUrl} className="w-12 h-12 object-contain bg-black/20 rounded border border-gray-700" alt="Logo Preview" />}
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-xs text-gray-500 file:bg-gray-800 file:border-none file:text-white file:px-3 file:py-1 file:rounded file:mr-2 file:cursor-pointer" />
              </div>
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-primary border-l-4 border-primary pl-3">內容策略設定</h3>
          
          <div>
              <label className="block text-sm text-gray-400 mb-1">經營身分</label>
              <select name="brandType" value={formData.brandType} onChange={handleChange} className="w-full bg-dark border border-gray-600 rounded p-2 text-white outline-none focus:border-primary">
                  <option value="enterprise">🏢 企業/官方帳號</option>
                  <option value="personal">👤 個人/網紅品牌</option>
              </select>
          </div>

          <div>
              <label className="block text-sm text-gray-400 mb-1">產業類別</label>
              <input name="industry" value={formData.industry || ''} onChange={handleChange} placeholder="產業名稱" className="w-full bg-dark border border-gray-600 rounded p-2 text-white outline-none focus:border-primary" />
          </div>

          <div>
              <label className="block text-sm text-gray-400 mb-1">品牌文案語氣</label>
              <div className="flex gap-2">
                  <input 
                    name="brandTone" 
                    value={formData.brandTone || ''} 
                    onChange={handleChange} 
                    placeholder="例如：溫柔感性..." 
                    className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white text-sm outline-none focus:border-primary" 
                  />
                  <button 
                    onClick={() => setIsAnalyzingTone(true)} 
                    className="text-[10px] text-primary border border-primary px-2 rounded hover:bg-primary/10 transition-colors"
                  >
                      自動分析
                  </button>
              </div>
          </div>

          <div>
              <label className="block text-sm text-gray-400 mb-1">核心知識庫 (產品/服務描述)</label>
              <textarea 
                name="productContext" 
                value={formData.productContext || ''} 
                onChange={handleChange} 
                placeholder="產品賣點、公司簡介..." 
                className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm outline-none focus:border-primary min-h-[100px]" 
              />
          </div>
        </div>
      </div>

      <div className="mt-12 flex justify-end border-t border-gray-700 pt-6">
        <button 
            onClick={handleSaveWrapper} 
            disabled={isSaving} 
            className="bg-primary hover:bg-blue-600 text-white px-10 py-3 rounded-lg font-bold shadow-lg transform transition-all active:scale-95 disabled:opacity-50"
        >
          {isSaving ? '儲存中...' : '儲存品牌設定'}
        </button>
      </div>
    </div>
  );
};

export default SettingsForm;
