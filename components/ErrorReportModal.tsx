
import React, { useState } from 'react';
import { submitUserReport } from '../services/authService';
import { UserProfile } from '../types';

interface Props {
  user: UserProfile | null;
  currentView: string;
  onClose: () => void;
}

const ErrorReportModal: React.FC<Props> = ({ user, currentView, onClose }) => {
  const [description, setDescription] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async () => {
    setIsSending(true);
    try {
      // Fix: Add missing required 'id' property for UserReport.
      // The service will overwrite this with a unique ID, but it's required by the type definition.
      await submitUserReport({
        id: '',
        userId: user?.user_id || 'guest',
        userEmail: user?.email || 'guest@example.com',
        description: description || 'User reported an issue without description',
        userAgent: navigator.userAgent,
        currentView: currentView,
        timestamp: Date.now(),
        status: 'OPEN'
      });
      setIsSuccess(true);
      setTimeout(onClose, 2000);
    } catch (e) {
      alert("回報發送失敗，請稍後再試。");
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] animate-fade-in p-4">
      <div className="bg-card p-6 rounded-xl border border-gray-600 max-w-md w-full relative shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>
        
        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            🐞 回報問題
        </h3>

        {isSuccess ? (
             <div className="py-8 text-center text-green-400">
                 <p className="text-4xl mb-2">✅</p>
                 <p className="font-bold">感謝您的回報！</p>
                 <p className="text-sm text-gray-400">工程團隊將盡快檢查您的問題。</p>
             </div>
        ) : (
            <>
                <p className="text-gray-400 text-sm mb-4">
                    若系統運作不正常，請告訴我們發生了什麼事。我們會自動紀錄您的裝置資訊以便除錯。
                </p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">發生頁面</label>
                        <input disabled value={currentView} className="w-full bg-dark/50 border border-gray-700 rounded p-2 text-gray-400 text-xs" />
                    </div>
                    
                    <div>
                        <label className="block text-sm text-gray-300 mb-1">問題描述 (選填)</label>
                        <textarea 
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="例如：點擊生成圖片時沒有反應..."
                            className="w-full h-32 bg-dark border border-gray-600 rounded p-3 text-white placeholder-gray-600 focus:border-primary outline-none resize-none"
                        />
                    </div>
                    
                    <div className="bg-blue-900/20 p-3 rounded text-xs text-blue-300 border border-blue-900/50">
                        🔒 系統將自動傳送錯誤日誌 (Logs) 給管理員，不包含您的密碼或敏感資料。
                    </div>

                    <button 
                        onClick={handleSubmit}
                        disabled={isSending}
                        className="w-full bg-red-600 hover:bg-red-500 text-white py-3 rounded font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isSending ? '發送中...' : '🚀 發送回報單'}
                    </button>
                </div>
            </>
        )}
      </div>
    </div>
  );
};

export default ErrorReportModal;
