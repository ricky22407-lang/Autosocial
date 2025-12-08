import React, { useState } from 'react';
import { login, register, sendPasswordReset } from '../services/authService';

interface Props {
  onLoginSuccess: () => void;
}

const Login: React.FC<Props> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      if (mode === 'REGISTER') {
        await register(email.trim(), password.trim());
        onLoginSuccess();
      } else if (mode === 'LOGIN') {
        await login(email.trim(), password.trim());
        onLoginSuccess();
      } else if (mode === 'FORGOT') {
        await sendPasswordReset(email.trim());
        setSuccessMsg(`密碼重設信已發送至 ${email}，請檢查信箱。`);
        // Don't switch view automatically, let user read message
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || '發生錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-dark">
      <div className="bg-card p-8 rounded-xl shadow-2xl border border-gray-700 w-full max-w-md animate-fade-in">
        <h2 className="text-3xl font-bold text-center text-white mb-2">
          {mode === 'REGISTER' ? '註冊會員' : mode === 'FORGOT' ? '重設密碼' : '登入 AutoSocial'}
        </h2>
        
        {/* 新增中文副標題 */}
        {mode === 'LOGIN' && (
            <p className="text-lg text-center text-blue-400 font-bold mb-2 tracking-wider">
                首創全自動經營社群平台
            </p>
        )}

        <p className="text-gray-400 text-center mb-8 text-sm">
          {mode === 'REGISTER' ? '建立您的社群自動化帳戶' : mode === 'FORGOT' ? '輸入 Email 以接收重設連結' : '歡迎回來，請登入繼續使用'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none"
              placeholder="name@example.com"
            />
          </div>
          
          {mode !== 'FORGOT' && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Password</label>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-dark border border-gray-600 rounded p-3 text-white focus:border-primary outline-none"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-sm text-center bg-red-900/20 p-2 rounded">{error}</p>}
          {successMsg && <p className="text-green-400 text-sm text-center bg-green-900/20 p-2 rounded">{successMsg}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-primary hover:bg-blue-600 text-white py-3 rounded font-bold transition-all disabled:opacity-50"
          >
            {loading ? '處理中...' : (mode === 'REGISTER' ? '立即註冊' : mode === 'FORGOT' ? '發送重設信' : '登入')}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-2 text-center text-sm">
          {mode === 'LOGIN' && (
             <>
                <button onClick={() => setMode('REGISTER')} className="text-gray-400 hover:text-white underline">還沒有帳號？免費註冊</button>
                <button onClick={() => setMode('FORGOT')} className="text-gray-500 hover:text-gray-400">忘記密碼？</button>
             </>
          )}
          {mode === 'REGISTER' && (
             <button onClick={() => setMode('LOGIN')} className="text-gray-400 hover:text-white underline">已有帳號？點此登入</button>
          )}
          {mode === 'FORGOT' && (
             <button onClick={() => setMode('LOGIN')} className="text-gray-400 hover:text-white underline">想起密碼了？返回登入</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;