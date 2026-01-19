
import React from 'react';

const ContactSupportPanel: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto p-6 animate-fade-in space-y-8">
            <div className="text-center mb-10">
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tighter mb-4">
                    🛠️ 聯繫客服中心
                </h2>
                <p className="text-gray-400 font-medium">
                    操作上有任何問題？或需要儲值點數？<br/>
                    我們的真人客服團隊隨時準備為您服務！
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Contact Card */}
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-8 rounded-2xl border border-gray-700 shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-5 text-8xl group-hover:scale-110 transition-transform">☎️</div>
                    
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <span className="bg-primary/20 text-primary p-2 rounded-lg">💬</span> 聯絡資訊
                    </h3>

                    <div className="space-y-6">
                        <div className="flex items-start gap-4 p-4 rounded-xl bg-black/20 border border-gray-700 hover:border-primary/50 transition-colors">
                            <div className="text-2xl">📧</div>
                            <div>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Email 信箱</p>
                                <a href="mailto:thisismypokemon1106@gmail.com" className="text-white font-mono hover:text-primary transition-colors break-all">
                                    thisismypokemon1106@gmail.com
                                </a>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 p-4 rounded-xl bg-black/20 border border-gray-700 hover:border-primary/50 transition-colors">
                            <div className="text-2xl">📱</div>
                            <div>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">客服專線</p>
                                <a href="tel:0983949997" className="text-white font-mono hover:text-primary transition-colors text-lg font-bold">
                                    0983-949-997
                                </a>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 p-4 rounded-xl bg-black/20 border border-gray-700 hover:border-green-500/50 transition-colors">
                            <div className="text-2xl text-green-500">LINE</div>
                            <div>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">LINE ID</p>
                                <p className="text-white font-mono text-lg font-bold">
                                    ricky50517
                                </p>
                                <p className="text-xs text-green-400 mt-1">加好友請告知是 AutoSocial 用戶</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Info Card */}
                <div className="bg-card p-8 rounded-2xl border border-gray-700 flex flex-col justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-4">服務時間與說明</h3>
                        <ul className="space-y-4 text-gray-400 text-sm leading-relaxed">
                            <li className="flex gap-2">
                                <span className="text-primary">●</span>
                                <span>服務時間：週一至週五 10:00 - 18:00 (國定假日除外)。</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="text-primary">●</span>
                                <span>若您遇到系統錯誤 (Bug)，請先嘗試截圖畫面，這能幫助我們更快解決問題。</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="text-primary">●</span>
                                <span>關於點數儲值：確認匯款後，請透過 Line 或 Email 通知我們，將於 1 小時內為您開通額度。</span>
                            </li>
                        </ul>
                    </div>

                    <div className="mt-8 bg-blue-900/20 p-4 rounded-xl border border-blue-800 text-center">
                        <p className="text-blue-200 font-bold mb-2">💡 小撇步</p>
                        <p className="text-xs text-blue-300">
                            如果在非服務時間遇到操作問題，您可以先點擊畫面右下角的
                            <span className="inline-block mx-1 bg-white text-black px-2 rounded-full font-bold">🤖 AI 小幫手</span>
                            詢問，它能回答大部分的功能設定問題喔！
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContactSupportPanel;
