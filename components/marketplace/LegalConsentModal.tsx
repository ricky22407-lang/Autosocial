
import React, { useState } from 'react';
import { updateUserProfile } from '../../services/features/user';

interface Props {
  userId: string;
  onConsented: () => void;
}

const LegalConsentModal: React.FC<Props> = ({ userId, onConsented }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const handleAgree = async () => {
      if (!agreed || isSubmitting) return;
      setIsSubmitting(true);
      
      try {
          // Use the unified service which handles Mock vs Firebase automatically
          await updateUserProfile(userId, {
              marketplaceConsent: true,
              invitesTotalThisMonth: 3, 
              invitesUsedThisMonth: 0
          });
          
          // Small delay for UI feel and storage sync
          setTimeout(() => {
              onConsented();
          }, 500);
          
      } catch (e: any) {
          console.error("Consent Update Failed:", e);
          alert(`啟動失敗: ${e.message || "請檢查連線"}`);
          setIsSubmitting(false);
      }
  };

  return (
    <div className="fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 backdrop-blur-xl animate-fade-in">
      <div className="bg-gray-900 border border-gray-700 w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-gray-800 to-gray-900 border-b border-gray-800 flex justify-between items-center">
            <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                   ⚖️ 媒合服務條款與個人資料蒐集告知函
                </h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">SaaS Marketplace Agreement & Privacy Policy</p>
            </div>
            <div className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded border border-primary/30 font-bold uppercase">SaaS Compliance v1.0</div>
        </div>

        {/* Scrollable Content */}
        <div className="p-8 overflow-y-auto custom-scrollbar space-y-8 text-sm text-gray-400 leading-relaxed">
            <p className="text-xs italic bg-blue-900/10 p-4 rounded-xl border border-blue-900/30 text-blue-200">
                歡迎使用 AutoSocial 口碑媒合中心（以下簡稱「本平台」）。在您開始使用媒合服務前，請詳閱本告知函。當您勾選「我同意」並點擊開啟功能時，即視為您已充分了解並同意本服務之所有規範。
            </p>

            {/* Section 1: PIPA (個資法) */}
            <section>
                <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 bg-primary text-black rounded-full flex items-center justify-center text-[10px]">1</span>
                    個人資料蒐集、處理及利用告知 (個資法第8條)
                </h4>
                <div className="pl-8 space-y-3">
                    <p><strong>(1) 蒐集目的：</strong>包含但不限於「行銷」、「契約、類似契約或其他法律關係事務」、「消費者、客戶管理與服務」、「廣告或商業行為管理」及「其他經營合於營業登記項目之業務」。</p>
                    <p><strong>(2) 蒐集類別：</strong>姓名、聯繫方式、社群帳號（Facebook/Threads）之公開數據、AI 分析之性格標籤、歷史合作紀錄與評價。</p>
                    <p><strong>(3) 利用期間：</strong>自您同意本條款之日起，至您請求刪除帳號或本平台終止服務之日止。</p>
                    <p><strong>(4) 利用對象：</strong>【乙方/素人】之數據將開放予本平台之【甲方/品牌方】進行篩選與發案。在甲方支付點數解鎖前，您的特定識別資訊（如 ID 連結）將進行遮罩處理。</p>
                    <p><strong>(5) 用戶權利：</strong>您可以隨時透過設定頁面關閉「公開狀態」以終止資料之揭露，或聯繫客服行使查詢、閱覽、補充、更正、停止蒐集或刪除之權利。</p>
                </div>
            </section>

            {/* Section 2: Service Rules (甲方/乙方共同規則) */}
            <section>
                <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 bg-primary text-black rounded-full flex items-center justify-center text-[10px]">2</span>
                    媒合中心服務規範與免責聲明
                </h4>
                <div className="pl-8 space-y-4">
                    <div className="bg-black/40 p-4 rounded-xl border border-gray-800">
                        <p className="text-white font-bold mb-1">【點數解鎖與不可退還性】</p>
                        <p className="text-xs">
                            依據《通訊交易解除權合理例外情事適用準則》，本平台提供之點數解鎖服務屬於「一經提供即為完成之線上服務」。甲方消耗 30 點解鎖乙方資訊後，資訊即刻交付，**本服務不適用 7 天鑑賞期，且不論後續雙方是否達成合作、或乙方回覆意願如何，點數一經扣除恕不退還。**
                        </p>
                    </div>
                    <div>
                        <p className="text-white font-bold mb-1">【中立平台定位】</p>
                        <p className="text-xs">
                            AutoSocial 僅提供技術工具協助媒合，並非雙方之受僱人、代理人或經紀人。雙方之「合作內容」、「勞務契約」、「薪酬給付」、「產出品質」及「稅務申報」等法律義務，均屬雙方個人行為。本平台對雙方之誠信、執行能力或最終成效不負法律連帶責任。
                        </p>
                    </div>
                    <div>
                        <p className="text-white font-bold mb-1">【數據準確性聲明】</p>
                        <p className="text-xs">
                            平台內展示之互動率、AI 性格 DNA 等數據係根據公開資料經演算法估算而成，僅供參考。乙方應保證所授權之帳號為本人所有，嚴禁提供虛假數據吸引發案。
                        </p>
                    </div>
                </div>
            </section>

            {/* Section 3: Anti-Bypass */}
            <section>
                <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 bg-primary text-black rounded-full flex items-center justify-center text-[10px]">3</span>
                    誠信與禁止規避條款
                </h4>
                <div className="pl-8 space-y-3">
                    <p>為維護媒合生態體系之公平性，使用者同意：</p>
                    <ul className="list-disc pl-5 space-y-2 text-xs">
                        <li><strong>嚴禁惡意肉搜：</strong>甲方嚴禁在未支付點數前，利用平台提供之部分資訊透過外部搜尋工具（如搜尋引擎、社群內部搜索）規避點數機制與乙方聯繫。</li>
                        <li><strong>商業信用評分：</strong>本平台將記錄雙方之合作歷史與舉報紀錄，若發生嚴重惡意違約、騷擾或詐欺行為，本平台有權永久封鎖帳號且不予補償點數餘額。</li>
                    </ul>
                </div>
            </section>

            <div className="h-4"></div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-gray-900 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-6">
            <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${agreed ? 'bg-primary border-primary' : 'bg-transparent border-gray-600 group-hover:border-primary'}`}>
                    <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={agreed}
                        onChange={() => setAgreed(!agreed)}
                    />
                    {agreed && <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className={`text-sm font-bold transition-colors ${agreed ? 'text-white' : 'text-gray-500'}`}>我已詳細閱讀並同意上述條款與告知內容</span>
            </label>
            
            <button 
                onClick={handleAgree}
                disabled={!agreed || isSubmitting}
                className={`px-12 py-3 rounded-xl font-black transition-all shadow-lg min-w-[200px] ${
                    agreed 
                    ? 'bg-primary text-black hover:scale-105 active:scale-95 shadow-primary/20' 
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-50'
                }`}
            >
                {isSubmitting ? (
                    <div className="flex items-center justify-center gap-2">
                        <div className="loader w-4 h-4 border-t-black"></div>
                        處理中...
                    </div>
                ) : '確認並開啟媒合中心'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default LegalConsentModal;
