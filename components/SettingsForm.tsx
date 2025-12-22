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
  const [refreshMsg, setRefreshMsg] = useState('');
  const [competitorsRaw, setCompetitorsRaw] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzingTone, setIsAnalyzingTone] = useState(false);
  const [isAnalyzingProduct, setIsAnalyzingProduct] = useState(false);
  const [styleImages, setStyleImages] = useState<string[]>([]);
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);

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
          } else {
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
      setCompetitorsRaw((settings.competitors || []).join(', '));
      setTokenStatus('idle');
      setRefreshMsg('');
  };

  useEffect(() => {
      if (profiles.length > 0) localStorage.setItem('autosocial_brand_profiles', JSON.stringify(profiles));
  }, [profiles]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'facebookToken') setTokenStatus('idle');
  };

  const checkToken = async () => {
    if (!formData.facebookToken) return;
    setTokenStatus('checking');
    setRefreshMsg('');
    setMissingPerms([]);

    const res = await validateFacebookToken(formData.facebookToken);
    
    if (res.valid) {
        setTokenStatus('valid');
        setRefreshMsg('✅ Token 有效且權限完整');
    } else if (res.missingPermissions.length > 0) {
        setTokenStatus('partial');
        setMissingPerms(res.missingPermissions);
    } else {
        setTokenStatus('invalid');
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
          alert("分析完成");
      } catch (e: any) { alert("分析失敗"); }
      finally { setIsAnalyzingProduct(false); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.size < 500000) {
          const reader = new FileReader();
          reader.onload = (ev) => setFormData(p => ({ ...p, logoUrl: ev.target?.result as string }));
          reader.readAsDataURL(file);
      } else alert("檔案過大");
  };

  const handleSaveWrapper = async () => {
      setIsSaving(true);
      try {
          setProfiles(profiles.map(p => p.id === currentProfileId ? { ...p, settings: formData } : p));
          onSave(formData);
          const user = getCurrentUser();
          if (user) await updateUserSettings(user.uid, formData);
          alert("設定已儲存");
      } finally { setIsSaving(false); }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-card rounded-xl border border-gray-700 animate-fade-in pb-20">
      <div className="flex justify-between items-center mb-6 border-b border-gray-600 pb-4">
          <select value={currentProfileId} onChange={(e) => {
              const target = profiles.find(p => p.id === e.target.value);
              if (target) { setCurrentProfileId(e.target.value); loadSettingsIntoForm(target.settings); }
          }} className="bg-dark border border-primary rounded p-2 text-white font-bold text-lg">
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => {
              const name = prompt("名稱:");
              if (name) {
                  const id = 'brand_' + Date.now();
                  setProfiles([...profiles, { id, name, settings: initialSettings }]);
                  setCurrentProfileId(id); loadSettingsIntoForm(initialSettings);
              }
          }} className="bg-green-700 text-white px-4 py-2 rounded text-sm">+ 新增品牌</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-primary">系統設定</h3>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Facebook 專頁 ID</label>
            <input name="facebookPageId" value={formData.facebookPageId || ''} onChange={handleChange} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Facebook Token</label>
            <div className="flex gap-2">
              <input name="facebookToken" type="password" value={formData.facebookToken || ''} onChange={handleChange} className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white" />
              <button onClick={checkToken} className="bg-gray-700 px-4 rounded text-white text-sm">驗證</button>
            </div>
            {tokenStatus === 'partial' && (
                <div className="mt-2 p-3 bg-red-900/20 border border-red-800 rounded">
                    <p className="text-red-400 text-xs font-bold">⚠️ 缺少必要權限：</p>
                    <ul className="list-disc list-inside text-[10px] text-red-300 mt-1">
                        {missingPerms.map(p => <li key={p}>{p}</li>)}
                    </ul>
                    <p className="text-[9px] text-gray-400 mt-2">請前往 FB 開發者後台重新取得包含上述權限的 Token。</p>
                </div>
            )}
            {refreshMsg && <p className="text-xs mt-1 text-green-400">{refreshMsg}</p>}
          </div>
          <div>
              <label className="block text-sm text-gray-400 mb-1">品牌 Logo</label>
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-xs text-gray-500" />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-primary">經營策略</h3>
          <select name="brandType" value={formData.brandType} onChange={handleChange} className="w-full bg-dark border border-gray-600 rounded p-2 text-white">
              <option value="enterprise">🏢 企業品牌 (專業)</option>
              <option value="personal">👤 個人品牌 (真誠)</option>
          </select>
          <input name="industry" value={formData.industry || ''} onChange={handleChange} placeholder="產業" className="w-full bg-dark border border-gray-600 rounded p-2 text-white" />
          <textarea name="brandTone" value={formData.brandTone || ''} onChange={handleChange} placeholder="品牌語氣" className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm" />
          <textarea name="productContext" value={formData.productContext || ''} onChange={handleChange} placeholder="核心知識庫" className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-sm" rows={4} />
          <button onClick={() => setIsAnalyzingTone(true)} className="text-xs text-primary underline">自動分析語氣 (需貼文)</button>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button onClick={handleSaveWrapper} disabled={isSaving} className="bg-primary text-white px-8 py-3 rounded-lg font-bold shadow-lg">
          {isSaving ? '儲存中...' : '儲存設定'}
        </button>
      </div>
    </div>
  );
};

export default SettingsForm;
