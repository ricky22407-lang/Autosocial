
import { useState, useEffect } from 'react';
import { ThreadsAccount, BrandSettings, UserProfile } from '../../../types';
import { validateThreadsToken, fetchUserThreads } from '../../../services/threadsService'; 
import { analyzeThreadsStyle } from '../../../services/geminiService';
import { checkAndUseQuota, exchangeThreadsAuth } from '../../../services/authService'; 

export const useAccountManager = (
    accounts: ThreadsAccount[],
    setAccounts: (accs: ThreadsAccount[]) => void,
    settings: BrandSettings,
    onSaveSettings: (settings: BrandSettings) => void,
    user: UserProfile | null,
    onQuotaUpdate: () => void
) => {
    // Input State
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

    // Process State
    const [verifyStatus, setVerifyStatus] = useState<{valid: boolean, msg: string} | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isAnalyzingStyle, setIsAnalyzingStyle] = useState<string | null>(null);

    // --- Actions ---

    const processAuthCode = async (code: string) => {
        try {
            const result = await exchangeThreadsAuth(code, window.location.origin);
            
            const newAccount: ThreadsAccount = {
                id: Date.now().toString(),
                userId: result.userId,
                token: result.token,
                username: result.username || `User_${result.userId.slice(-4)}`,
                isActive: true,
                accountType: 'personal',
                styleGuide: ''
            };

            const exists = accounts.find(a => a.userId === newAccount.userId);
            if (exists) {
                alert(`帳號 ${newAccount.username} 已經存在，將更新 Token。`);
                const updated = accounts.map(a => a.userId === newAccount.userId ? newAccount : a);
                setAccounts(updated);
                onSaveSettings({ ...settings, threadsAccounts: updated });
            } else {
                const updated = [...accounts, newAccount];
                setAccounts(updated);
                onSaveSettings({ ...settings, threadsAccounts: updated });
                alert(`🎉 連接成功！已新增帳號：${newAccount.username}`);
            }
            localStorage.removeItem('autosocial_pending_oauth');
        } catch (e: any) {
            console.error(e);
            alert(`連接失敗: ${e.message}`);
        } finally {
            setIsConnecting(false);
        }
    };

    const handleConnectThreads = () => {
        const env = (import.meta as any)?.env || {};
        const THREADS_APP_ID = env.VITE_THREADS_APP_ID || env.REACT_APP_THREADS_APP_ID;
        
        if (!THREADS_APP_ID) {
            alert("系統錯誤：未設定 Threads App ID (VITE_THREADS_APP_ID)。\n請聯繫管理員檢查環境變數。");
            return;
        }
        
        setIsConnecting(true);
        localStorage.setItem('autosocial_pending_oauth', 'true');

        const redirectUri = window.location.origin; 
        const scope = 'threads_basic,threads_content_publish';
        const authUrl = `https://threads.net/oauth/authorize?client_id=${THREADS_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;
        
        const width = 500;
        const height = 750;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        const popup = window.open(
            authUrl, 
            'ThreadsAuth', 
            `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`
        );

        const messageHandler = async (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type === 'THREADS_OAUTH_CODE') {
                const code = event.data.code;
                window.removeEventListener('message', messageHandler);
                await processAuthCode(code);
            }
        };

        window.addEventListener('message', messageHandler);

        const timer = setInterval(() => {
            if (popup?.closed) {
                clearInterval(timer);
                window.removeEventListener('message', messageHandler);
                setIsConnecting(prev => false);
            }
        }, 1000);
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

        const updated = [...accounts, newAccount];
        setAccounts(updated);
        onSaveSettings({ ...settings, threadsAccounts: updated });
        setNewAccountInput({ userIdInput: '', token: '', username: '', personaPrompt: '', accountType: 'personal', safetyFilter: true });
        setVerifyStatus(null);
    };

    const handleRemoveAccount = (id: string) => {
        if (confirm("確定移除此帳號嗎？")) {
            const updated = accounts.filter(a => a.id !== id);
            setAccounts(updated);
            onSaveSettings({ ...settings, threadsAccounts: updated });
        }
    };

    const handleUpdateAccount = (id: string, field: keyof ThreadsAccount, val: any) => {
        const updated = accounts.map(a => a.id === id ? { ...a, [field]: val } : a);
        setAccounts(updated);
        onSaveSettings({ ...settings, threadsAccounts: updated });
    };

    const handleAnalyzeStyle = async (account: ThreadsAccount) => {
        if (!user) return;
        if (!account.token) return alert("無 Token，無法讀取貼文");
        
        const COST = 8; 
        const allowed = await checkAndUseQuota(user.user_id, COST, 'THREADS_STYLE_ANALYSIS');
        if (!allowed) return; 
        onQuotaUpdate();

        setIsAnalyzingStyle(account.id);
        try {
            const posts = await fetchUserThreads(account, 15);
            if (!posts || posts.length < 3) {
                const useTemplate = confirm("⚠️ 此帳號貼文數量不足 (少於 3 篇)，無法進行精準分析。\n\n是否直接使用「預設風格模板」來填寫設定？");
                if (useTemplate) throw new Error("貼文數量不足 (建議直接使用下方模板)");
                else throw new Error("分析取消 (貼文不足)");
            }
            
            const postTexts = posts.map((p: any) => p.text).filter(Boolean);
            const styleDNA = await analyzeThreadsStyle(postTexts);
            
            handleUpdateAccount(account.id, 'styleGuide', styleDNA);
            alert(`✅ 風格分析完成！\n已扣除 ${COST} 點。\n\nAI 已學習您的：\n- 常用語助詞\n- 斷句習慣\n- 發文情緒`);
        } catch (e: any) {
            alert(`分析失敗: ${e.message}`);
        } finally {
            setIsAnalyzingStyle(null);
        }
    };

    return {
        newAccountInput, setNewAccountInput,
        verifyStatus, isVerifying, handleVerifyAccount,
        isConnecting, handleConnectThreads,
        handleAddAccount, handleRemoveAccount, handleUpdateAccount,
        isAnalyzingStyle, handleAnalyzeStyle
    };
};
