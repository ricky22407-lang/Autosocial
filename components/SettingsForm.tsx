import React, { useState, useEffect } from 'react';
import { BrandSettings, ReferenceFile } from '../types';
import { validateFacebookToken } from '../services/facebookService';

interface Props {
  onSave: (settings: BrandSettings) => void;
  initialSettings: BrandSettings;
}

const SettingsForm: React.FC<Props> = ({ onSave, initialSettings }) => {
  const [formData, setFormData] = useState<BrandSettings>(initialSettings);
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');

  // Auto-save logic to localStorage to prevent data loss on refresh
  useEffect(() => {
    localStorage.setItem('autosocial_settings', JSON.stringify(formData));
  }, [formData]);

  // Check token on initial load if present
  useEffect(() => {
    if (initialSettings.facebookToken) {
      checkToken(initialSettings.facebookToken);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'facebookToken') {
        setTokenStatus('idle');
    }
  };

  const handleCompetitorChange = (value: string) => {
    const list = value.split(',').map(s => s.trim());
    setFormData(prev => ({ ...prev, competitors: list }));
  };

  const checkToken = async (tokenToCheck?: string) => {
    const token = tokenToCheck ?? formData.facebookToken;
    if (!token) return;
    
    setTokenStatus('checking');
    const isValid = await validateFacebookToken(token);
    setTokenStatus(isValid ? 'valid' : 'invalid');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const text = await file.text();
      const newFile: ReferenceFile = { name: file.name, content: text };
      setFormData(prev => ({
        ...prev,
        referenceFiles: [...prev.referenceFiles, newFile]
      }));
    }
  };

  const removeFile = (index: number) => {
    setFormData(prev => ({
      ...prev,
      referenceFiles: prev.referenceFiles.filter((_, i) => i !== index)
    }));
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
              value={formData.industry} 
              onChange={handleChange}
              className="w-full bg-dark border border-gray-600 rounded p-2 text-white focus:border-primary outline-none"
              placeholder="例如：科技業、零售業"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">服務項目</label>
            <input 
              name="services" 
              value={formData.services} 
              onChange={handleChange}
              className="w-full bg-dark border border-gray-600 rounded p-2 text-white focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">品牌語氣</label>
            <select 
              name="brandTone" 
              value={formData.brandTone} 
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
           <div>
            <label className="block text-sm text-gray-400 mb-1">社群小編人設 (Persona)</label>
            <textarea 
              name="persona" 
              value={formData.persona} 
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
              value={formData.facebookPageId} 
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
                value={formData.facebookToken} 
                onChange={handleChange}
                placeholder="請輸入長期 Token"
                className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white focus:border-primary outline-none"
              />
              <button 
                onClick={() => checkToken()}
                className={`px-4 py-2 rounded font-bold transition-colors ${
                  tokenStatus === 'valid' ? 'bg-green-600 text-white' : 
                  tokenStatus === 'invalid' ? 'bg-red-600 text-white' : 
                  'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                {tokenStatus === 'checking' ? '檢查中...' : tokenStatus === 'valid' ? '驗證成功' : tokenStatus === 'invalid' ? '驗證失敗' : '檢查權限'}
              </button>
            </div>
            {tokenStatus === 'valid' && <p className="text-xs text-green-400 mt-1">Token 有效，可以正常連接 Graph API。</p>}
            {tokenStatus === 'invalid' && <p className="text-xs text-red-400 mt-1">Token 無效或過期，請重新生成。</p>}
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
                name="competitorsRaw" 
                defaultValue={formData.competitors.join(', ')}
                onBlur={(e) => handleCompetitorChange(e.target.value)}
                className="w-full bg-dark border border-gray-600 rounded p-2 text-white focus:border-primary outline-none"
              />
          </div>

          <div>
             <label className="block text-sm text-gray-400 mb-1">參考資料上傳 (純文字/MD)</label>
             <input type="file" onChange={handleFileUpload} className="text-sm text-gray-400"/>
             <ul className="mt-2 space-y-1">
               {formData.referenceFiles.map((file, i) => (
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
          onClick={() => onSave(formData)}
          className="bg-primary hover:bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-all"
        >
          儲存設定
        </button>
      </div>
    </div>
  );
};

export default SettingsForm;