
import React, { useState, useEffect } from 'react';
import { BrandSettings, ReferenceFile } from '../types';
import { validateFacebookToken, refreshLongLivedToken } from '../services/facebookService';
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
    <div className="max-w-4xl mx-auto p-6 bg-card rounded-xl shadow-lg border border-gray-700 animate-fade-in">
      <h2 className="text-2xl font-bold mb-6 text-white">品牌與 API 設定</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          <div>
            <label className="block text-sm text-gray-400 mb-1">品牌語氣</label>
            <select 
              name="brandTone" 
              value={formData.brandTone || 'Professional'} 
              onChange={handleChange}
              className="w-full bg-dark border border-gray-600 rounded p-2 text-white focus:border-primary outline-none"
            >
              <option value="Professional">專業穩重</option>
              <option value="Friendly">親切友善</option>
              <option value="Humorous">幽默風趣</option>
              <option value="Luxurious">奢華質感</option>
              <option value="Minimalist">極簡風格</option>
            </select>
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

           <div>
            <label className="block text-sm text-gray-400 mb-1">社群小編人設 (Persona)</label>
            <textarea 
              name="persona" 
              value={formData.persona || ''} 
              onChange={handleChange}
              rows={3}
              className="w-full bg-dark border border-gray-600 rounded p-2 text-white focus:border-primary outline-none"
              placeholder="例如：像鄰家大姊姊一樣..."
            />
          </div>
        </div>

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

          <div>
             <label className="block text-sm text-gray-400 mb-1">參考資料上傳 (純文字/MD)</label>
             <input type="file" onChange={handleFileUpload} className="text-sm text-gray-400"/>
             <ul className="mt-2 space-y-1">
               {(formData.referenceFiles || []).map((file, i) => (
                 <li key={i} className="flex items-center justify-between bg-dark p-2 rounded text-xs">
                   <span className="truncate max-w-[200px]">{file.name}</span>
                   <button onClick={() => removeFile(i)} className="text-red-400 hover:text-red-300">×</button>
                 </li>
               ))}
             </ul>
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
