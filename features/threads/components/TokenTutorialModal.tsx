
import React from 'react';

interface Props {
  platform: 'facebook' | 'threads';
  onClose: () => void;
}

const TokenTutorialModal: React.FC<Props> = ({ platform, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] animate-fade-in p-4">
      <div className="bg-card p-8 rounded-xl border border-gray-600 max-w-2xl w-full relative shadow-2xl overflow-y-auto max-h-[90vh]">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold">✕</button>
        
        <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            📚 {platform === 'facebook' ? 'Facebook Page Token' : 'Threads User Token'} 獲取教學
        </h3>

        <div className="space-y-6 text-gray-300 text-sm leading-relaxed">
            {platform === 'facebook' ? (
                <>
                    <div className="bg-blue-900/20 p-4 rounded border border-blue-800">
                        <p className="font-bold text-blue-300 mb-2">🎯 目標：取得具有發文權限的 User Token 或 Page Token。</p>
                        <p>我們推薦使用 Meta 官方的 Graph API Explorer 來快速生成。</p>
                    </div>

                    <ol className="list-decimal pl-5 space-y-4">
                        <li>
                            <p className="font-bold text-white">前往 Graph API Explorer</p>
                            <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
                                https://developers.facebook.com/tools/explorer/
                            </a>
                        </li>
                        <li>
                            <p className="font-bold text-white">選擇應用程式 (Meta App)</p>
                            <p>在右側 "Meta App" 下拉選單中，選擇您建立的應用程式 (若無，請先去 My Apps 建立一個類型為 Business 的 App)。</p>
                        </li>
                        <li>
                            <p className="font-bold text-white">設定權限 (Permissions)</p>
                            <p>在 "Add Permissions" 下拉選單中，搜尋並加入以下權限：</p>
                            <ul className="list-disc pl-5 mt-1 text-green-400 font-mono text-xs">
                                <li>pages_manage_posts (發佈貼文)</li>
                                <li>pages_read_engagement (讀取數據)</li>
                                <li>public_profile (基本資料)</li>
                            </ul>
                        </li>
                        <li>
                            <p className="font-bold text-white">生成 Token</p>
                            <p>點擊藍色的 <b>"Generate Access Token"</b> 按鈕。會跳出 Facebook 登入視窗，請同意授權。</p>
                        </li>
                        <li>
                            <p className="font-bold text-white">複製 Token 與 Page ID</p>
                            <p>授權成功後，"Access Token" 欄位會出現一串亂碼，這就是您的 Token。</p>
                            <p>若要獲取 Page ID，請將上方的請求網址改為 <code>me/accounts</code> 然後點擊 Submit，回應中會包含您管理的粉專 ID。</p>
                        </li>
                    </ol>
                </>
            ) : (
                <>
                    <div className="bg-pink-900/20 p-4 rounded border border-pink-800">
                        <p className="font-bold text-pink-300 mb-2">🎯 目標：取得 Threads Tester User Token。</p>
                        <p>Threads 目前僅開放開發者模式 (Threads Tester) 進行發文。</p>
                    </div>

                    <ol className="list-decimal pl-5 space-y-4">
                        <li>
                            <p className="font-bold text-white">設定 Threads Tester</p>
                            <p>前往 <a href="https://developers.facebook.com/apps/" target="_blank" className="text-primary hover:underline">Meta App Dashboard</a>，選擇您的 App。</p>
                            <p>在左側選單找到 <b>"Threads"</b> (若無請點擊 "Add Product" 新增)。</p>
                            <p>進入 <b>"User Token"</b> 或 <b>"Tester"</b> 設定頁面。</p>
                        </li>
                        <li>
                            <p className="font-bold text-white">加入測試帳號</p>
                            <p>點擊 "Add Threads Tester"，輸入您想要自動發文的 Threads 帳號 (Instagram 帳號)。</p>
                        </li>
                        <li>
                            <p className="font-bold text-white">在手機上接受邀請</p>
                            <p>打開該帳號的 Instagram App &gt; 設定 &gt; 網站與應用程式 &gt; <b>邀請 (Invites)</b>。</p>
                            <p>接受 "Threads Tester" 的邀請。</p>
                        </li>
                        <li>
                            <p className="font-bold text-white">生成 Token</p>
                            <p>回到 Meta App Dashboard 的 Threads User Token 頁面。</p>
                            <p>您應該會看到該帳號已變為 "Installed" 或可用狀態，點擊旁邊的 <b>"Generate Token"</b>。</p>
                        </li>
                        <li>
                            <p className="font-bold text-white">複製 User ID 與 Token</p>
                            <p>複製產生的長字串 Token。User ID 通常也會顯示在該頁面，或可透過 Token 查詢 API 獲得。</p>
                        </li>
                    </ol>
                </>
            )}
        </div>

        <div className="mt-8 flex justify-end">
            <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded font-bold">
                我知道了
            </button>
        </div>
      </div>
    </div>
  );
};

export default TokenTutorialModal;
