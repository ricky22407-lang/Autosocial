
import { auth } from './firebase'; // Real Firebase Auth
import { UserProfile, BrandSettings } from '../types';

// In production, this would be your Cloud Run URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

const getHeaders = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not logged in');
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

export const api = {
  user: {
    me: async (): Promise<UserProfile> => {
      const res = await fetch(`${API_BASE_URL}/user/me`, { headers: await getHeaders() });
      if (!res.ok) throw new Error('Failed to fetch profile');
      return res.json();
    },
    useQuota: async () => {
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
      const res = await fetch(`${API_BASE_URL}/admin/users`, { headers: await getHeaders() });
      return res.json();
    },
    createKey: async (type: string, targetRole?: string) => {
      const res = await fetch(`${API_BASE_URL}/admin/create-key`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ type, targetRole })
      });
      return res.json();
    },
    useKey: async (key: string) => {
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
        // In this demo environment without a real backend, we can simulate the success
        if (!process.env.NEXT_PUBLIC_API_URL) {
            console.log("Simulating Auto-Pilot Trigger...", settings.autoPilot);
            await new Promise(r => setTimeout(r, 2000)); // Simulate delay
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
