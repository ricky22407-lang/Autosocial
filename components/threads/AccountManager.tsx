
import React, { useState } from 'react';
import { ThreadsAccount, UserProfile, BrandSettings } from '../../types';
import { validateThreadsToken, fetchUserThreads } from '../../services/threadsService';
import { analyzeThreadsStyle } from '../../services/geminiService';
import { checkAndUseQuota } from '../../services/authService';
import { STYLE_PRESETS } from './ThreadsCommon';
import TokenTutorialModal from '../TokenTutorialModal';
import ThreadsConnectionFAQModal from './ThreadsConnectionFAQModal';

interface Props {
    accounts: ThreadsAccount[];
    setAccounts: (accs: ThreadsAccount[]) => void;
    settings: BrandSettings;
    onSaveSettings: (settings: BrandSettings) => void;
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const AccountManager: React.FC<Props> = ({ accounts, setAccounts, settings, onSaveSettings, user, onQuotaUpdate }) => {
    const [newAccountInput, setNewAccountInput] = useState<{
        userIdInput: string;
        token: string;
        username: string;
        personaPrompt: string;
        accountType: 'personal' | 'brand';
        safetyFilter: boolean;
    }>({ 
        userIdInput: '', 
        token: '', 
        username: '', 
        personaPrompt: '',
        accountType: 'personal',
        safetyFilter: true
    });
    const [verifyStatus, setVerifyStatus] = useState<{valid: boolean, msg: string} | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isAnalyzingStyle, setIsAnalyzingStyle] = useState<string | null>(null);
    const [showTutorial, setShowTutorial] = useState(false);
    const [showFaq, setShowFaq] = useState(false);

    // --- OAuth Handler ---
    const handleConnectThreads = () => {
        const THREADS_APP_ID = (import.meta as any).env.VITE_THREADS_APP_ID;
        
        if (!THREADS_APP_ID) {
            alert("系統錯誤：未設定 Threads App ID。請聯繫管理員檢查環境變數 (VITE_THREADS_APP_ID)。");
            return;
        }
        
        // Save current form state to localStorage (without secrets)
        // We just need to know we are in a pending state to handle the callback
        localStorage.setItem('autosocial_pending_oauth', 'true');

        const redirectUri = window.location.origin; 
        const scope = 'threads_basic,threads_content_publish';
        const authUrl = `https://threads.net/oauth/authorize?client_id=${THREADS_APP_ID}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;
        
        window.location.href = authUrl;
    };

    const handleVerifyAccount = async () => {
        const { userIdInput, token } = newAccountInput;
        if (!userIdInput || !token) return alert("請先輸入 ID 與 Token");
        
        setIsVerifying(true);
        setVerifyStatus(null);
        try {
            const res = await validateThreadsToken(userIdInput.trim(), token.trim());
            if (res.valid) {
                setVerifyStatus({ valid: true, msg: `驗證成功: ${res.username}` });
                if (!newAccountInput.username && res.username) {
                    setNewAccountInput(prev => ({ ...prev, username: res.username || '' }));
                }
            } else {
                setVerifyStatus({ valid: false, msg: `驗證失敗: ${res.error}` });
            }
        } catch (e: any) {
            setVerifyStatus({ valid: false, msg: `錯誤: ${e.message}` });
        } finally {
            setIsVerifying(false);
        }
    };

    const handleAddAccount = () => {
        const { userIdInput, token, username, personaPrompt, accountType, safetyFilter } = newAccountInput;
        if (!userIdInput || !token) { alert("請輸入 Threads User ID 與 Access Token"); return; }

        const limit = user?.role === 'business' || user?.role === 'admin' ? 20 : (user?.role === 'pro' ? 5 : 0);
        if (accounts.length >= limit) { alert(`您的方案最多只能新增 ${limit} 個帳號。`); return; }

        const newAccount: ThreadsAccount = {
            id: Date.now().toString(), 
            userId: userIdInput.trim(), 
            token: token.trim(),
            username: username.trim() || `User_${userIdInput.slice(-4)}`,
            isActive: true,
            personaPrompt: '',
            accountType,
            safetyFilter,
            styleGuide: personaPrompt.trim()
        };

        setAccounts([...accounts, newAccount]);
        setNewAccountInput({ userIdInput: '', token: '', username: '', personaPrompt: '', accountType: 'personal', safetyFilter: true });
        setVerifyStatus(null);
    };

    const handleRemoveAccount = (id: string) => {
        if (confirm("確定移除此帳號嗎？")) setAccounts(accounts.filter(a => a.id !== id));
    };

    const handleUpdateAccount = (id: string, field: keyof ThreadsAccount, val: any) => {
        setAccounts(accounts.map(a => a.id === id ? { ...a, [field]: val } : a));
    };

    const handleAnalyzeStyle = async (account: ThreadsAccount) => {
        if (!user) return;
        if (!account.token) return alert("無 Token，無法讀取貼文");
        
        const COST = 5; 
        const allowed = await checkAndUseQuota(user.user_id, COST, 'THREADS_STYLE_ANALYSIS');
        if (!allowed) return; 
        onQuotaUpdate();

        setIsAnalyzingStyle(account.id);
        try {
            const posts = await fetchUserThreads(account, 10);
            if (!posts || posts.length < 3) {
                const useTemplate = confirm("⚠️ 此帳號貼文數量不足 (少於 3 篇)，無法進行分析。\n\n是否直接使用「預設風格模板」來填寫設定？");
                if (useTemplate) throw new Error("貼文數量不足 (新帳號請直接使用下方的『風格模板』)");
            }
            const postTexts = posts.map((p: any) => p.text).filter(Boolean);
            const styleDNA = await analyzeThreadsStyle(postTexts);
            handleUpdateAccount(account.id, 'styleGuide', styleDNA);
            alert(`風格分析完成！已更新 Style DNA。(扣除 ${COST} 點)`);
        } catch (e: any) {
            alert(`分析失敗: ${e.message}`);
        } finally {
            setIsAnalyzingStyle(null);
        }
    };

    return (
        <div className="space-y-6">
            
            {/* OAuth Connection Section */}
            <div className="bg-pink-900/10 p-6 rounded-xl border border-pink-900/30 flex flex-col md:flex-row gap-6 items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        🔗 快速連接 (OAuth)
                    </h3>
                    <p className="text-xs text-pink-300 mt-2 max-w-lg">
                        無需手動複製 Token，登入 Instagram 即可完成授權。
                        <br/>
                        <span className="opacity-70">* 注意：Threads 目前僅支援「測試者 (Tester)」帳號進行 API 連接。請確保您的帳號已加入 App 的測試名單。</span>
                    </p>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <button 
                        onClick={() => setShowFaq(true)}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-4 rounded-lg font-bold border border-gray-600 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                        title="連接問題排解"
                    >
                        <span>❓</span> FAQ
                    </button>
                    <button 
                        onClick={handleConnectThreads}
                        className="flex-1 bg-pink-600 hover:bg-pink-500 text-white px-8 py-4 rounded-lg font-bold shadow-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                        <span className="text-xl">@</span> 一鍵連接新帳號
                    </button>
                </div>
            </div>

            {/* Manual Add Account Form */}
            <div className="bg-card p-6 rounded-xl border border-gray-700">
                <h3 className="font-bold text-gray-400 mb-4 text-xs uppercase tracking-widest border-b border-gray-700 pb-2">
                    進階選項：手動新增帳號 (Developer Mode)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-xs text-gray-400 mb-1">Threads User ID *</label><input value={newAccountInput.userIdInput} onChange={e => setNewAccountInput({...newAccountInput, userIdInput: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" placeholder="數值 ID" /></div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1 flex justify-between"><span>Access Token *</span><button onClick={() => setShowTutorial(true)} className="text-primary hover:underline text-xs flex items-center gap-1">如何獲取 Token</button></label>
                        <input value={newAccountInput.token} onChange={e => setNewAccountInput({...newAccountInput, token: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" type="password" placeholder="長期 Token" />
                    </div>
                    <div><label className="block text-xs text-gray-400 mb-1">顯示名稱</label><input value={newAccountInput.username} onChange={e => setNewAccountInput({...newAccountInput, username: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" placeholder="自訂識別名稱" /></div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">帳號類型</label>
                        <div className="flex gap-4 items-center h-[38px]">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" checked={newAccountInput.accountType === 'personal'} onChange={() => setNewAccountInput({...newAccountInput, accountType: 'personal'})} />
                                <span className="text-sm text-gray-300">個人/創作者</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" checked={newAccountInput.accountType === 'brand'} onChange={() => setNewAccountInput({...newAccountInput, accountType: 'brand'})} />
                                <span className="text-sm text-gray-300">品牌/企業</span>
                            </label>
                        </div>
                    </div>
                    {newAccountInput.accountType === 'brand' && (
                        <div className="md:col-span-2 bg-blue-900/20 p-2 rounded border border-blue-800 flex items-center gap-2">
                            <input type="checkbox" checked={newAccountInput.safetyFilter} onChange={e => setNewAccountInput({...newAccountInput, safetyFilter: e.target.checked})} className="w-4 h-4 text-blue-600" />
                            <span className="text-xs text-blue-200">啟用品牌安全護欄 (自動過濾政治、腥羶色、爭議話題)</span>
                        </div>
                    )}
                    <div className="md:col-span-2">
                        <label className="block text-xs text-gray-400 mb-1">自訂人設與語氣 (選填)</label>
                        <textarea
                            value={newAccountInput.personaPrompt}
                            onChange={e => setNewAccountInput({...newAccountInput, personaPrompt: e.target.value})}
                            className="w-full bg-dark border border-gray-600 rounded p-2 text-white text-xs h-20 resize-none placeholder-gray-600 focus:border-primary outline-none"
                            placeholder="例如：你是一個熱愛咖啡的文青，喜歡用底片相機，文字風格慵懶..."
                        />
                    </div>
                </div>
                {verifyStatus && <p className={`mt-3 text-xs font-bold ${verifyStatus.valid ? 'text-green-400' : 'text-red-400'}`}>{verifyStatus.msg}</p>}
                <div className="mt-4 flex gap-2 justify-end">
                    <button onClick={handleVerifyAccount} disabled={isVerifying} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm font-bold transition-colors">{isVerifying ? '檢查中...' : '驗證 Token'}</button>
                    <button onClick={handleAddAccount} className="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded font-bold transition-colors">新增帳號</button>
                </div>
            </div>

            {/* List Accounts */}
            <h3 className="font-bold text-white mt-8 mb-4 border-l-4 border-pink-500 pl-3">已連結的帳號 ({accounts.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {accounts.map((acc) => (
                    <div key={acc.id} className="bg-dark p-4 rounded border border-gray-600 relative group">
                        <div className="flex items-center gap-3 mb-2">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white ${acc.accountType === 'brand' ? 'bg-blue-700' : 'bg-pink-700'}`}>
                                {acc.accountType === 'brand' ? 'B' : 'P'}
                            </div>
                            <div className="overflow-hidden">
                                <div className="font-bold text-white text-sm truncate">{acc.username}</div>
                                <div className="text-xs text-gray-500 truncate">Type: {acc.accountType === 'brand' ? 'Brand' : 'Personal'}</div>
                            </div>
                        </div>
                        <div className="mt-3 text-xs space-y-2">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-gray-400">Style DNA:</label>
                                    <button onClick={() => handleAnalyzeStyle(acc)} disabled={!!isAnalyzingStyle} className="text-primary hover:underline flex items-center gap-1">
                                        {isAnalyzingStyle === acc.id ? '分析中...' : '讀取過往貼文'}
                                    </button>
                                </div>
                                <select 
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 mb-2 text-white text-[10px] outline-none"
                                    onChange={(e) => { if (e.target.value) handleUpdateAccount(acc.id, 'styleGuide', e.target.value); }}
                                    value=""
                                >
                                    <option value="" disabled>快速套用風格模板 (台灣特有種)</option>
                                    {STYLE_PRESETS.map((style, idx) => (
                                        <option key={idx} value={style.dna}>{style.name}</option>
                                    ))}
                                </select>
                                <textarea 
                                    className="w-full bg-gray-900 border-none rounded px-2 py-1 mt-1 text-gray-300 focus:ring-1 focus:ring-primary h-20 text-[10px] resize-none" 
                                    value={acc.styleGuide || ''} 
                                    onChange={e => handleUpdateAccount(acc.id, 'styleGuide', e.target.value)} 
                                    placeholder="AI 分析出的風格指令將顯示於此。" 
                                />
                            </div>
                            {acc.accountType === 'brand' && (
                                <label className="flex items-center gap-2 cursor-pointer bg-black/20 p-1 rounded">
                                    <input type="checkbox" checked={acc.safetyFilter} onChange={e => handleUpdateAccount(acc.id, 'safetyFilter', e.target.checked)} />
                                    <span className="text-gray-400">安全護欄</span>
                                </label>
                            )}
                        </div>
                        <button onClick={() => handleRemoveAccount(acc.id)} className="text-red-400 text-xs absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">移除</button>
                    </div>
                ))}
            </div>
            {showTutorial && <TokenTutorialModal platform="threads" onClose={() => setShowTutorial(false)} />}
            {showFaq && <ThreadsConnectionFAQModal onClose={() => setShowFaq(false)} />}
        </div>
    );
};

export default AccountManager;
