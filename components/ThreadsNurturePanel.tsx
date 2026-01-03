
import React, { useState, useEffect } from 'react';
import { BrandSettings, ThreadsAccount, UserProfile } from '../types';
import AccountManager from './threads/AccountManager';
import InteractionManager from './threads/InteractionManager';
import ContentGenerator from './threads/ContentGenerator';
import LeadHunter from './threads/LeadHunter'; // NEW IMPORT

interface Props {
  settings: BrandSettings;
  user: UserProfile | null;
  onSaveSettings: (settings: BrandSettings) => void;
  onQuotaUpdate: () => void;
}

const ThreadsNurturePanel: React.FC<Props> = ({ settings, user, onSaveSettings, onQuotaUpdate }) => {
  const [activeTab, setActiveTab] = useState<'accounts' | 'interaction' | 'generator' | 'hunter'>('accounts');
  const [accounts, setAccounts] = useState<ThreadsAccount[]>(settings.threadsAccounts || []);

  useEffect(() => {
      if (JSON.stringify(settings.threadsAccounts) !== JSON.stringify(accounts)) {
          setAccounts(settings.threadsAccounts || []);
      }
  }, [settings.threadsAccounts]);

  const handleAccountsChange = (newAccounts: ThreadsAccount[]) => {
      setAccounts(newAccounts);
      onSaveSettings({ ...settings, threadsAccounts: newAccounts });
  };

  return (
    <div className="max-w-6xl mx-auto p-4 animate-fade-in pb-20">
      <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-white">Threads 營運中控台</h2>
          <div className="text-xs text-gray-400">多帳號管理 • 獲客搜尋 • 風格學習</div>
      </div>

      <div className="flex border-b border-gray-800 mb-8 overflow-x-auto custom-scrollbar gap-2">
        <button onClick={() => setActiveTab('accounts')} className={`px-6 py-4 font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'accounts' ? 'text-white border-b-2 border-primary' : 'text-gray-600 hover:text-gray-400'}`}>帳號管理</button>
        <button onClick={() => setActiveTab('hunter')} className={`px-6 py-4 font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'hunter' ? 'text-pink-500 border-b-2 border-pink-500' : 'text-gray-600 hover:text-gray-400'}`}>商機搜尋</button>
        <button onClick={() => setActiveTab('interaction')} className={`px-6 py-4 font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'interaction' ? 'text-white border-b-2 border-primary' : 'text-gray-600 hover:text-gray-400'}`}>留言互動</button>
        <button onClick={() => setActiveTab('generator')} className={`px-6 py-4 font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'generator' ? 'text-white border-b-2 border-primary' : 'text-gray-600 hover:text-gray-400'}`}>內容批量生成</button>
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

      {activeTab === 'hunter' && (
          <LeadHunter 
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
    </div>
  );
};

export default ThreadsNurturePanel;
