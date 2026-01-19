
import { useState } from 'react';
import { BrandSettings, AutoReplyRule, AutoPilotConfig, ThreadsAutoPilotConfig } from '../../../types';
import { api } from '../../../services/apiClient';
import { getCurrentUser, updateUserSettings } from '../../../services/authService';

export const useAutomation = (settings: BrandSettings, onSave: (settings: BrandSettings) => void) => {
    const [activeTab, setActiveTab] = useState<'autopilot' | 'threads_autopilot' | 'reply'>('autopilot');
    
    // Auto Reply State
    const [replyEnabled, setReplyEnabled] = useState(settings.autoReply?.enabled || false);
    const [defaultResponse, setDefaultResponse] = useState(settings.autoReply?.defaultResponse || '');
    const [rules, setRules] = useState<AutoReplyRule[]>(settings.autoReply?.rules || []);
    const [newKeyword, setNewKeyword] = useState('');
    const [newResponse, setNewResponse] = useState('');

    // FB Auto Pilot State
    const defaultAutoPilot: AutoPilotConfig = {
        enabled: false,
        frequency: 'daily',
        postWeekDays: [1], 
        postTime: '09:00',
        source: 'trending',
        keywords: [],
        mediaTypePreference: 'image'
    };

    const [apConfig, setApConfig] = useState<AutoPilotConfig>(() => {
        const config = settings.autoPilot || defaultAutoPilot;
        if ((config as any).postWeekDay !== undefined && !config.postWeekDays) {
            config.postWeekDays = [(config as any).postWeekDay];
        }
        if (!config.postWeekDays) config.postWeekDays = [1];
        if ((config.source as any) === 'competitor') config.source = 'trending';
        config.mediaTypePreference = 'image';
        return config;
    });

    // Threads Auto Pilot State
    const defaultThreadsAP: ThreadsAutoPilotConfig = {
        enabled: false,
        frequency: 'daily',
        postWeekDays: [1],
        postTime: '10:00',
        imageMode: 'ai_url',
        targetAccountIds: []
    };

    const [threadsApConfig, setThreadsApConfig] = useState<ThreadsAutoPilotConfig>(() => {
        const config = settings.threadsAutoPilot || defaultThreadsAP;
        if (!config.targetAccountIds) {
            config.targetAccountIds = settings.threadsAccounts?.map(a => a.id) || [];
        }
        return config;
    });

    const [newApKeyword, setNewApKeyword] = useState('');
    const [triggering, setTriggering] = useState(false);
    const [triggeringThreads, setTriggeringThreads] = useState(false);

    // Handlers
    const handleSaveSettings = async () => {
        const newSettings = {
          ...settings,
          autoReply: { enabled: replyEnabled, defaultResponse, rules },
          autoPilot: apConfig,
          threadsAutoPilot: threadsApConfig
        };
        
        onSave(newSettings);
        
        const user = getCurrentUser();
        if (user) {
            await updateUserSettings(user.uid, newSettings);
        }
        alert('設定已儲存！(同步至雲端)');
    };

    const addRule = () => {
        if (newKeyword && newResponse) {
          setRules([...rules, { keyword: newKeyword, response: newResponse }]);
          setNewKeyword('');
          setNewResponse('');
        }
    };

    const removeRule = (index: number) => {
        setRules(rules.filter((_, i) => i !== index));
    };

    const handleTriggerAutoPilot = async () => {
        setTriggering(true);
        try {
            const result = await api.automation.trigger(settings);
            alert(`🚀 FB 任務執行成功！\n主題: ${result.topic}\n狀態: ${result.message}`);
        } catch (e: any) {
            console.error(e);
            alert(`啟動失敗: ${e.message}`);
        } finally {
            setTriggering(false);
        }
    };

    const handleTriggerThreadsAP = async () => {
        const tempSettings = { ...settings, threadsAutoPilot: threadsApConfig };
        setTriggeringThreads(true);
        try {
            const result = await api.automation.triggerThreads(tempSettings);
            alert(`🚀 Threads 任務執行成功！\n帳號: ${result.targetAccount}\n主題: ${result.topic}\n狀態: ${result.message}`);
        } catch (e: any) {
            console.error(e);
            alert(`啟動失敗: ${e.message}`);
        } finally {
            setTriggeringThreads(false);
        }
    };

    const addApKeyword = () => {
        if (newApKeyword) {
            setApConfig({...apConfig, keywords: [...apConfig.keywords, newApKeyword]});
            setNewApKeyword('');
        }
    };

    const removeApKeyword = (index: number) => {
        setApConfig(prev => ({
            ...prev,
            keywords: prev.keywords.filter((_, i) => i !== index)
        }));
    };

    const toggleWeekDay = (config: any, setConfig: any, dayIndex: number) => {
        const current = config.postWeekDays || [];
        if (current.includes(dayIndex)) {
            if (current.length === 1) return;
            setConfig({...config, postWeekDays: current.filter((d: number) => d !== dayIndex).sort()});
        } else {
            if (current.length >= 6) return alert("最多只能選擇 6 天！");
            setConfig({...config, postWeekDays: [...current, dayIndex].sort()});
        }
    };

    const toggleThreadAccount = (id: string) => {
        const current = threadsApConfig.targetAccountIds || [];
        if (current.includes(id)) {
            setThreadsApConfig({...threadsApConfig, targetAccountIds: current.filter(aid => aid !== id)});
        } else {
            setThreadsApConfig({...threadsApConfig, targetAccountIds: [...current, id]});
        }
    };

    return {
        activeTab, setActiveTab,
        replyEnabled, setReplyEnabled, defaultResponse, setDefaultResponse, rules, newKeyword, setNewKeyword, newResponse, setNewResponse,
        apConfig, setApConfig, newApKeyword, setNewApKeyword,
        threadsApConfig, setThreadsApConfig,
        triggering, triggeringThreads,
        handleSaveSettings, addRule, removeRule, handleTriggerAutoPilot, handleTriggerThreadsAP,
        addApKeyword, removeApKeyword, toggleWeekDay, toggleThreadAccount
    };
};
