
import React from 'react';

interface Props {
  onClose: () => void;
}

const ThreadsConnectionFAQModal: React.FC<Props> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] animate-fade-in p-4 backdrop-blur-sm">
      <div className="bg-card p-8 rounded-2xl border border-gray-600 max-w-2xl w-full relative shadow-2xl overflow-y-auto max-h-[90vh]">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold transition-colors">✕</button>
        
        <h3 className="text-2xl font-black text-white mb-6 flex items-center gap-2 border-b border-gray-700 pb-4">
            ❓ Threads 連接問題排解 (FAQ)
        </h3>

        <div className="space-y-6 text-gray-300 text-sm leading-relaxed">
            
            <section className="bg-red-900/20 p-4 rounded-xl border border-red-800/50">
                <h4 className="text-lg font-bold text-red-300 mb-2">Q: 為什麼我在 App 上接受了邀請，但狀態卻沒有變成 Active？</h4>
                <p className="text-red-200/80">
                    這通常是因為您的 Threads 帳號尚未在 <strong>Meta 開發者後台</strong> 確認「測試人員 (Tester)」的角色邀請。
                    <br/><br/>
                    單純在手機 App 上按接受是不夠的，因為 Threads 目前處於開發模式，Meta 要求嚴格的雙重驗證。
                </p>
            </section>

            <section>
                <h4 className="text-lg font-bold text-white mb-4">🔧 解決步驟 (請按順序操作)</h4>
                
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold border border-primary/50">1</div>
                        <div>
                            <p className="font-bold text-white mb-1">確認開發者角色邀請 (最關鍵！)</p>
                            <p className="mb-2">請使用您的 Threads (Instagram) 帳號，登入 Meta 開發者網站：</p>
                            <a href="https://developers.facebook.com/requests/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono bg-black/30 px-2 py-1 rounded">
                                https://developers.facebook.com/requests/
                            </a>
                            <p className="mt-2 text-xs text-gray-400">
                                * 如果這是您第一次登入該網站，請先依指示註冊為開發者。<br/>
                                * 進入後，您會看到來自 "AutoSocial" 的邀請，請點擊 <strong>Confirm (確認)</strong>。
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 text-white flex items-center justify-center font-bold">2</div>
                        <div>
                            <p className="font-bold text-white mb-1">移除手機上的卡住狀態</p>
                            <p>回到手機 Instagram App &gt; 設定 &gt; 網站與應用程式 &gt; <strong>邀請 (Invites)</strong>。</p>
                            <p>找到卡住的 AutoSocial 邀請，點擊 <strong>移除 (Remove)</strong>。</p>
                            <p className="text-xs text-gray-500 mt-1">(不用擔心，這只是為了重置連結狀態)</p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 text-white flex items-center justify-center font-bold">3</div>
                        <div>
                            <p className="font-bold text-white mb-1">重新進行連接</p>
                            <p>回到本網站，再次點擊 <strong>「一鍵連接新帳號」</strong> 按鈕。</p>
                            <p>這次授權後，您的帳號就會正確出現在 Active 列表，並能正常發文了！</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-700 flex justify-end gap-4">
            <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-bold transition-all">
                我了解了
            </button>
        </div>
      </div>
    </div>
  );
};

export default ThreadsConnectionFAQModal;
