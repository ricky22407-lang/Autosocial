
import { UserProfile, BrandSettings } from '../types';
import { getUserProfile, checkAndUseQuota, getAllUsers, generateAdminKey, useAdminKey, getCurrentUser } from './authService';
import { AutomationClient } from './automationClient';

// =========================================================================
// 🚀 SERVERLESS API CLIENT
// =========================================================================
// 因為部署在 Vercel (Frontend Only)，我們不使用 fetch('http://localhost:8080')
// 而是直接呼叫前端的 Service (Firebase SDK & Gemini SDK)
// =========================================================================

export const api = {
  user: {
    me: async (): Promise<UserProfile | null> => {
      const user = getCurrentUser();
      if (!user) throw new Error('User not logged in');
      return getUserProfile(user.uid);
    },
    useQuota: async () => {
      const user = getCurrentUser();
      if (!user) throw new Error('User not logged in');
      const success = await checkAndUseQuota(user.uid);
      if (!success) throw new Error('Quota exceeded');
      return { success: true };
    }
  },
  admin: {
    getUsers: async () => {
      // Direct Firestore call
      return getAllUsers();
    },
    createKey: async (type: string, targetRole?: string) => {
      // Using client-side admin key generation (simplified)
      // In a strict security model, this should be a Cloud Function, 
      // but for this "Manual Admin" requirement, direct DB write is acceptable if rules allow.
      const user = getCurrentUser();
      if (!user) throw new Error("No Admin User");
      // Mapping simplified params to service
      const key = await generateAdminKey(user.uid, type as any, targetRole as any);
      return { key };
    },
    useKey: async (key: string) => {
        const user = getCurrentUser();
        if (!user) throw new Error("Not logged in");
        return useAdminKey(user.uid, key);
    }
  },
  automation: {
    trigger: async (settings: BrandSettings) => {
        // Run logic in browser instead of calling backend
        return AutomationClient.trigger(settings);
    }
  }
};
