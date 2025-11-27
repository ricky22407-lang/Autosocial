
import React, { useState } from 'react';
import { login, register } from '../services/authService';

interface Props {
  onLoginSuccess: () => void;
}

const Login: React.FC<Props> = ({ onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isRegister) {
        await register(email.trim(), password.trim());
      } else {
        await login(email.trim(), password.trim());
      }
      onLoginSuccess();
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
          {isRegister ? '註冊會員' : '登入 AutoSocial'}
        </h2>
        <p className="text-gray-400 text-center mb-8 text-sm">
          {isRegister ? '建立您的社群自動化帳戶' : '歡迎回來，請登入繼續使用'}
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

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-primary hover:bg-blue-600 text-white py-3 rounded font-bold transition-all disabled:opacity-50"
          >
            {loading ? '處理中...' : (isRegister ? '立即註冊' : '登入')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => setIsRegister(!isRegister)}
            className="text-sm text-gray-400 hover:text-white underline"
          >
            {isRegister ? '已有帳號？點此登入' : '還沒有帳號？免費註冊'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
