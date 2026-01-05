
import React, { useState, useEffect } from 'react';
import { BrandSettings, ThreadsAccount, UserProfile } from '../types';
import AccountManager from './threads/AccountManager';
import InteractionManager from './threads/InteractionManager';
import ContentGenerator from './threads/ContentGenerator';
import DigitalDNALab from './threads/DigitalDNALab';
import OpportunityScout from './threads/OpportunityScout'; // New Component

interface Props {
  settings: BrandSettings;
  user: UserProfile | null;
  onSaveSettings: (settings: BrandSettings) => void;
  onQuotaUpdate: () => void;
}

const ThreadsNurturePanel: React.FC<Props> = ({ settings, user, onSaveSettings, onQuotaUpdate }) => {
  const [activeTab, setActiveTab] = useState<'accounts' | 'interaction' | 'generator' | 'dna_lab' | 'scout'>('accounts');
  const [accounts, setAccounts] = useState<ThreadsAccount[]>(settings.threadsAccounts || []);

  // Sync state when external settings change (e.g. from OAuth callback in App.tsx)
  useEffect(() => {
      if (JSON.stringify(settings.threadsAccounts) !== JSON.stringify(accounts)) {
          setAccounts(settings.threadsAccounts || []);
      }
  }, [settings.threadsAccounts]);

  // Update parent settings whenever local accounts change
  const handleAccountsChange = (newAccounts: ThreadsAccount[]) => {
      setAccounts(newAccounts);
      onSaveSettings({ ...settings, threadsAccounts: newAccounts });
  };

  return (
    <div className="max-w-6xl mx-auto p-4 animate-fade-in pb-20">
      <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-white">Threads 進階功能</h2>
          <div className="text-xs text-gray-400">多帳號管理 • 風格學習 • 商機開發</div>
      </div>

      <div className="flex border-b border-gray-700 mb-6 overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab('accounts')} className={`px-6 py-3 font-bold whitespace-nowrap transition-colors ${activeTab === 'accounts' ? 'text-white border-b-2' : 'text-gray-500 hover:text-gray-300'}`}>帳號管理</button>
        <button onClick={() => setActiveTab('scout')} className={`px-6 py-3 font-bold whitespace-nowrap transition-colors ${activeTab === 'scout' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-500 hover:text-gray-300'}`}>💎 商機開發</button>
        <button onClick={() => setActiveTab('interaction')} className={`px-6 py-3 font-bold whitespace-nowrap transition-colors ${activeTab === 'interaction' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-500 hover:text-gray-300'}`}>留言互動</button>
        <button onClick={() => setActiveTab('generator')} className={`px-6 py-3 font-bold whitespace-nowrap transition-colors ${activeTab === 'generator' ? 'text-white border-b-2' : 'text-gray-500 hover:text-gray-300'}`}>內容生成</button>
        <button onClick={() => setActiveTab('dna_lab')} className={`px-6 py-3 font-bold whitespace-nowrap transition-colors ${activeTab === 'dna_lab' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-500 hover:text-gray-300'}`}>🧪 基因實驗室</button>
      </div>

      {activeTab === 'accounts' && (
          <AccountManager 
              accounts={accounts} 
              setAccounts={handleAccountsChange}
              settings={settings}
              onSaveSettings={onSaveSettings}
              user={user} 
              onQuotaUpdate={onQuotaUpdate} 
          />
      )}

      {activeTab === 'scout' && (
          <OpportunityScout 
              accounts={accounts}
              user={user}
              onQuotaUpdate={onQuotaUpdate}
          />
      )}

      {activeTab === 'interaction' && (
          <InteractionManager 
              accounts={accounts} 
              user={user} 
              onQuotaUpdate={onQuotaUpdate} 
          />
      )}

      {activeTab === 'generator' && (
          <ContentGenerator 
              settings={settings} 
              accounts={accounts} 
              user={user} 
              onQuotaUpdate={onQuotaUpdate} 
          />
      )}

      {activeTab === 'dna_lab' && (
          <DigitalDNALab 
              accounts={accounts}
              user={user}
              onQuotaUpdate={onQuotaUpdate}
          />
      )}
    </div>
  );
};

export default ThreadsNurturePanel;
