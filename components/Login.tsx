
import React, { useState, useEffect } from 'react';
import { login, register, sendPasswordReset } from '../services/authService';

interface Props {
  onLoginSuccess: () => void;
}

const Login: React.FC<Props> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem('autosocial_remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

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
        
        // Handle Remember Me
        if (rememberMe) {
          localStorage.setItem('autosocial_remembered_email', email.trim());
        } else {
          localStorage.removeItem('autosocial_remembered_email');
        }
        
        onLoginSuccess();
      } else if (mode === 'FORGOT') {
        await sendPasswordReset(email.trim());
        setSuccessMsg(`密碼重設信已發送至 ${email}，請檢查信箱。`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || '發生錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen relative overflow-hidden">
      {/* Login Card */}
      <div className="glass-card p-10 rounded-3xl w-full max-w-md animate-fade-in relative z-10 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-white tracking-tighter mb-2">
                AUTO<span className="text-neon-cyan">SOCIAL</span>
            </h1>
            <p className="text-sm font-bold text-gray-400 tracking-[0.2em] uppercase">
                AI 社群自動化中控台
            </p>
        </div>

        <h2 className="text-2xl font-bold text-center text-white mb-2">
          {mode === 'REGISTER' ? '建立帳戶' : mode === 'FORGOT' ? '重設密碼' : '歡迎回來'}
        </h2>

        <div className="text-gray-400 text-center mb-8 text-sm">
          {mode === 'REGISTER' ? '開始您的自動化之旅' : mode === 'FORGOT' ? '我們會發送重設連結給您' : (
             <div className="space-y-1">
                <p>一篇貼文最低 <span className="text-primary font-bold">NT$3</span></p>
                <p className="text-[10px] text-yellow-500/80 font-bold uppercase tracking-wider">
                   測試預覽中：請使用 admin@gmail.com / admin 登入
                </p>
             </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Email</label>
            <input 
              type="text" 
              name="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 rounded-xl outline-none text-white font-medium"
              placeholder="name@example.com"
            />
          </div>
          
          {mode !== 'FORGOT' && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Password</label>
              <input 
                type="password"
                name="password" 
                required
                autoComplete={mode === 'REGISTER' ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 rounded-xl outline-none text-white font-medium"
              />
            </div>
          )}

          {mode === 'LOGIN' && (
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-black/30 text-primary focus:ring-primary cursor-pointer"
              />
              <label htmlFor="rememberMe" className="text-sm text-gray-400 cursor-pointer select-none">
                記住帳號 (Remember Me)
              </label>
            </div>
          )}

          {error && <div className="text-red-400 text-xs font-bold text-center bg-red-900/20 p-3 rounded border border-red-900/50">{error}</div>}
          {successMsg && <div className="text-green-400 text-xs font-bold text-center bg-green-900/20 p-3 rounded border border-green-900/50">{successMsg}</div>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-gradient-to-r from-primary to-blue-600 hover:to-blue-500 text-black py-4 rounded-xl font-black transition-all transform active:scale-95 disabled:opacity-50 disabled:scale-100 shadow-[0_0_20px_rgba(0,242,234,0.3)] hover:shadow-[0_0_30px_rgba(0,242,234,0.5)] uppercase tracking-wider"
          >
            {loading ? <div className="loader mx-auto border-t-black"></div> : (mode === 'REGISTER' ? '註冊' : mode === 'FORGOT' ? '發送' : '登入')}
          </button>
        </form>

        <div className="mt-8 flex flex-col gap-3 text-center text-xs font-medium">
          {mode === 'LOGIN' && (
             <>
                <button type="button" onClick={() => setMode('REGISTER')} className="text-gray-400 hover:text-white transition-colors">還沒有帳號？ <span className="text-primary underline decoration-primary/50 underline-offset-4">免費註冊</span></button>
                <button type="button" onClick={() => setMode('FORGOT')} className="text-gray-500 hover:text-gray-400">忘記密碼？</button>
             </>
          )}
          {mode === 'REGISTER' && (
             <button type="button" onClick={() => setMode('LOGIN')} className="text-gray-400 hover:text-white transition-colors">已有帳號？ <span className="text-primary underline decoration-primary/50 underline-offset-4">點此登入</span></button>
          )}
          {mode === 'FORGOT' && (
             <button type="button" onClick={() => setMode('LOGIN')} className="text-gray-400 hover:text-white transition-colors">想起密碼了？ <span className="text-primary underline decoration-primary/50 underline-offset-4">返回登入</span></button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
