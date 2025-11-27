
import { auth } from './firebase'; // Hybrid Auth (Real or Mock)
import { UserProfile, BrandSettings } from '../types';

// =========================================================================
// 🚀 DEPLOYMENT CONFIGURATION
// =========================================================================
const getEnv = (key: string) => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    return (import.meta as any).env[key] || (import.meta as any).env[`VITE_${key}`];
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return '';
};

const API_BASE_URL = getEnv('NEXT_PUBLIC_API_URL') || getEnv('VITE_API_URL') || 'http://localhost:8080/api';

// Helper to get Token
const getHeaders = async () => {
  // @ts-ignore
  const user = auth.currentUser;
  
  if (!user) {
     if (typeof window !== 'undefined' && localStorage.getItem('autosocial_session_uid')) {
         return { 'Content-Type': 'application/json', 'Authorization': 'Bearer mock-token' };
     }
     throw new Error('User not logged in');
  }

  // Real Firebase User
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

export const api = {
  user: {
    me: async (): Promise<UserProfile> => {
      if (API_BASE_URL.includes('localhost') && !getEnv('NEXT_PUBLIC_API_URL') && !getEnv('VITE_API_URL')) {
          throw new Error("Mock Mode: Use local service");
      }

      const res = await fetch(`${API_BASE_URL}/auth/me`, { headers: await getHeaders() });
      if (!res.ok) throw new Error('Failed to fetch profile');
      return res.json();
    },
    useQuota: async () => {
      if (API_BASE_URL.includes('localhost') && !getEnv('NEXT_PUBLIC_API_URL') && !getEnv('VITE_API_URL')) return { success: true };

      const res = await fetch(`${API_BASE_URL}/user/use-quota`, { 
        method: 'POST', 
        headers: await getHeaders() 
      });
      if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Quota deduction failed');
      }
      return res.json();
    }
  },
  admin: {
    getUsers: async () => {
      if (API_BASE_URL.includes('localhost') && !getEnv('NEXT_PUBLIC_API_URL') && !getEnv('VITE_API_URL')) throw new Error("Mock Mode");
      const res = await fetch(`${API_BASE_URL}/admin/users`, { headers: await getHeaders() });
      return res.json();
    },
    createKey: async (type: string, targetRole?: string) => {
      if (API_BASE_URL.includes('localhost') && !getEnv('NEXT_PUBLIC_API_URL') && !getEnv('VITE_API_URL')) throw new Error("Mock Mode");
      const res = await fetch(`${API_BASE_URL}/admin/create-key`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ type, targetRole })
      });
      return res.json();
    },
    useKey: async (key: string) => {
        if (API_BASE_URL.includes('localhost') && !getEnv('NEXT_PUBLIC_API_URL') && !getEnv('VITE_API_URL')) throw new Error("Mock Mode");
        const res = await fetch(`${API_BASE_URL}/admin/use-key`, {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({ key })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        return data;
    }
  },
  automation: {
    trigger: async (settings: BrandSettings) => {
        if (API_BASE_URL.includes('localhost') && !getEnv('NEXT_PUBLIC_API_URL') && !getEnv('VITE_API_URL')) {
            console.log("Simulating Auto-Pilot Trigger...", settings.autoPilot);
            await new Promise(r => setTimeout(r, 2000));
            return { success: true, message: "自動化任務已在背景啟動 (模擬)" };
        }

        const res = await fetch(`${API_BASE_URL}/automation/trigger`, {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({ settings })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Automation failed');
        return data;
    }
  }
};
