
import React from 'react';

interface Props {
  onClose: () => void;
}

const TermsModal: React.FC<Props> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] animate-fade-in p-4 backdrop-blur-sm">
      <div className="bg-card p-8 rounded-2xl border border-gray-600 max-w-2xl w-full relative shadow-2xl overflow-y-auto max-h-[90vh]">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold transition-colors">✕</button>
        
        <h3 className="text-2xl font-black text-white mb-6 flex items-center gap-2 border-b border-gray-700 pb-4">
            ⚖️ 服務條款與退款政策
        </h3>

        <div className="space-y-6 text-gray-300 text-sm leading-relaxed">
            
            <section>
                <h4 className="text-lg font-bold text-white mb-2">1. 服務性質說明</h4>
                <p>AutoSocial AI (以下簡稱本服務) 提供之點數、會員資格與 AI 生成內容，均屬於<strong>「非以有形媒介提供之數位內容或一經提供即為完成之線上服務」</strong>。</p>
            </section>

            <section className="bg-red-900/20 p-4 rounded-xl border border-red-800/50">
                <h4 className="text-lg font-bold text-red-400 mb-2">2. 退款政策 (Refund Policy)</h4>
                <ul className="list-disc pl-5 space-y-2 text-red-200/80">
                    <li><strong>無七天鑑賞期：</strong>依據消費者保護法第 19 條及行政院公布之「通訊交易解除權合理例外情事適用準則」，本服務屬於例外商品，<strong>一經付款或點數一經發放，即不適用七日鑑賞期，不得要求退費</strong>。</li>
                    <li><strong>點數不可退還：</strong>所有購買或贈送之點數，一經存入帳戶即視為交付完成。即便您未使用完畢，亦不得要求兌換現金或轉讓。</li>
                    <li><strong>訂閱取消：</strong>您可以隨時取消會員訂閱，取消將於當期計費週期結束後生效。已支付之當期費用不予退還，您可繼續使用服務至該週期結束。</li>
                </ul>
            </section>

            <section>
                <h4 className="text-lg font-bold text-white mb-2">3. 使用者責任與規範</h4>
                <p>當您開始使用本服務，即代表您同意：</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-400">
                    <li>不利用 AI 生成違法、色情、暴力或仇恨言論之內容。</li>
                    <li>自行承擔 AI 生成內容之準確性風險 (AI 可能會產生幻覺)。</li>
                    <li>您擁有綁定之社群帳號 (Facebook/Threads) 的合法管理權限。</li>
                </ul>
            </section>

            <section>
                <h4 className="text-lg font-bold text-white mb-2">4. 服務中斷與免責</h4>
                <p>若因第三方 API (如 Google Gemini, Meta Graph API) 故障或維修導致服務暫時中斷，本服務將盡力修復，但不對因此產生之商業損失負責。</p>
            </section>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-700 flex justify-end gap-4">
            <button onClick={onClose} className="bg-primary hover:bg-cyan-400 text-black px-8 py-3 rounded-xl font-black transition-all shadow-lg hover:shadow-cyan-500/20">
                我同意並了解
            </button>
        </div>
      </div>
    </div>
  );
};

export default TermsModal;
