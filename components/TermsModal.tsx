
import React from 'react';

interface Props {
  onClose: () => void;
}

const TermsModal: React.FC<Props> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] animate-fade-in p-4 backdrop-blur-sm">
      <div className="bg-card p-8 rounded-2xl border border-gray-600 max-w-3xl w-full relative shadow-2xl overflow-y-auto max-h-[90vh]">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold transition-colors">✕</button>
        
        <h3 className="text-2xl font-black text-white mb-6 flex items-center gap-2 border-b border-gray-700 pb-4">
            ⚖️ 服務條款與使用者協議
        </h3>

        <div className="space-y-8 text-gray-300 text-sm leading-relaxed pr-2">
            
            <section>
                <h4 className="text-base font-bold text-white mb-2 uppercase tracking-wider">1. 服務性質說明 (Service Nature)</h4>
                <p>AutoSocial AI (以下簡稱「本服務」) 提供之點數、會員資格與 AI 生成內容，均屬於<strong>「非以有形媒介提供之數位內容或一經提供即為完成之線上服務」</strong>。本服務之使用權與點數係以數位形式交付，無實體商品。</p>
            </section>

            <section className="bg-blue-900/10 p-5 rounded-xl border border-blue-800/50">
                <h4 className="text-base font-bold text-blue-300 mb-3 uppercase tracking-wider">2. 訂閱與自動扣款規範 (Subscription & Auto-Renewal)</h4>
                <ol className="list-decimal pl-5 space-y-2 text-blue-100/80 text-xs">
                    <li><strong>自動續約授權：</strong>當您訂閱本服務之月費或年費方案（如 Starter/Pro Plan），即代表您同意並授權本服務於每個計費週期結束前（通常為到期日前 24-48 小時內），自動從您綁定的支付方式（如信用卡）扣除下期費用。</li>
                    <li><strong>計費週期：</strong>訂閱採「預付制」，週期自付款成功日起算。例如：於 1 月 15 日訂閱月費方案，下次扣款日約為 2 月 15 日。</li>
                    <li><strong>扣款失敗處理：</strong>若系統無法成功扣款（如餘額不足、卡片過期），我們有權暫停您的付費會員權限，直到款項付清為止。系統可能會在數日內嘗試重新扣款。</li>
                    <li><strong>取消訂閱：</strong>您可隨時於「費率說明」頁面取消訂閱。<strong>取消操作必須於當期到期日前至少 24 小時完成</strong>，以避免產生下期費用。取消後，您仍可使用付費權益至當期結束，下期將不再自動扣款。</li>
                    <li><strong>價格變更：</strong>本服務保留調整訂閱價格的權利。任何價格調整將於實施前至少 30 天以 Email 或網站公告通知您。若您不同意新價格，請於變更生效前取消訂閱。</li>
                </ol>
            </section>

            <section className="bg-red-900/10 p-5 rounded-xl border border-red-800/50">
                <h4 className="text-base font-bold text-red-400 mb-3 uppercase tracking-wider">3. 退款政策 (Refund Policy)</h4>
                <ol className="list-decimal pl-5 space-y-2 text-red-200/80 text-xs">
                    <li><strong>無七天鑑賞期：</strong>依據消費者保護法第 19 條及行政院公布之「通訊交易解除權合理例外情事適用準則」第 2 條第 5 款，本服務屬於例外商品，<strong>一經付款、訂閱生效或點數一經發放，即視為已履行完畢，不適用七日鑑賞期，不得要求全額或部分退費</strong>。</li>
                    <li><strong>點數不可退還：</strong>所有購買、訂閱贈送或活動獲得之點數，一經存入帳戶即視為交付完成。即便您未使用完畢，亦不得要求兌換現金、轉讓予他人或退費。</li>
                    <li><strong>無比例退費：</strong>若您於訂閱期間中途取消，已支付之當期費用不予依比例退還，您的權益將維持至該週期結束。</li>
                </ol>
            </section>

            <section>
                <h4 className="text-base font-bold text-white mb-2 uppercase tracking-wider">4. 使用者責任與規範</h4>
                <p className="mb-2">當您開始使用本服務，即代表您同意：</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-400 text-xs">
                    <li>不利用 AI 生成違法、色情、暴力、仇恨言論、詐欺或侵犯他人智慧財產權之內容。</li>
                    <li>自行承擔 AI 生成內容之準確性風險 (AI 可能會產生幻覺或不正確資訊)，發佈前請務必人工審核。</li>
                    <li>您保證您擁有綁定之社群帳號 (Facebook/Threads) 的合法管理權限。</li>
                    <li>嚴禁使用自動化程式 (Bot) 惡意攻擊本服務 API 或試圖繞過配額限制。</li>
                </ul>
            </section>

            <section>
                <h4 className="text-base font-bold text-white mb-2 uppercase tracking-wider">5. 免責聲明與服務中斷</h4>
                <ul className="list-disc pl-5 space-y-1 text-gray-400 text-xs">
                    <li>本服務依「現狀 (As-Is)」提供，不保證服務絕對無中斷、無錯誤或完全安全。</li>
                    <li>若因第三方 API (如 Google Gemini, OpenAI, Meta Graph API) 故障、維修、政策變更或不可抗力因素導致服務中斷或功能受限，本服務將盡力修復，但不對因此產生之商業損失（如利潤損失、商譽受損）負責。</li>
                    <li>本服務有權隨時修改、暫停或終止部分功能，恕不另行個別通知。</li>
                </ul>
            </section>

            <section>
                <h4 className="text-base font-bold text-white mb-2 uppercase tracking-wider">6. 帳戶終止</h4>
                <p className="text-xs text-gray-400">
                    若我們發現您違反本條款、濫用 API 資源或進行異常交易，我們有權在不事先通知的情況下暫停或永久終止您的帳戶，且不退還任何費用或剩餘點數。
                </p>
            </section>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-700 flex flex-col md:flex-row justify-end gap-4 items-center">
            <p className="text-[10px] text-gray-500">
                點擊按鈕即表示您已閱讀並同意上述所有條款。
            </p>
            <button onClick={onClose} className="bg-primary hover:bg-cyan-400 text-black px-8 py-3 rounded-xl font-black transition-all shadow-lg hover:shadow-cyan-500/20 w-full md:w-auto">
                我同意並了解
            </button>
        </div>
      </div>
    </div>
  );
};

export default TermsModal;
