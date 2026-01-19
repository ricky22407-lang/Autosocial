
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile } from '../types';
import { subscribeAuth, getUserProfile, logout as authLogout } from '../services/authService';

interface AuthContextType {
  user: { uid: string; email: string } | null;
  userProfile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isPro: boolean;
  isBusiness: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ uid: string; email: string } | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // 初始化監聽 Firebase Auth
  useEffect(() => {
    const unsubscribe = subscribeAuth(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadProfile(currentUser.uid);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadProfile = async (uid: string) => {
    try {
      const profile = await getUserProfile(uid);
      setUserProfile(profile);
    } catch (e) {
      console.error("Failed to load profile", e);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await loadProfile(user.uid);
    }
  };

  const logout = async () => {
    await authLogout();
    setUser(null);
    setUserProfile(null);
  };

  const role = userProfile?.role || 'user';
  const isAdmin = role === 'admin';
  // Check if role is pro, business or admin
  const isPro = ['pro', 'business', 'admin'].includes(role);
  const isBusiness = ['business', 'admin'].includes(role);

  return (
    <AuthContext.Provider value={{ 
      user, 
      userProfile, 
      loading, 
      refreshProfile, 
      logout,
      isAdmin,
      isPro,
      isBusiness
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom Hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
