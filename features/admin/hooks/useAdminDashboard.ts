
import { useState, useEffect } from 'react';
import { 
  getAllUsers, generateAdminKey, 
  getDashboardStats, getSystemLogs, getSystemConfig, updateSystemConfig, 
  getUserReports
} from '../../../services/authService';
import { getApiServiceStatus } from '../../../services/geminiService';
import { db, isMock } from '../../../services/firebase';
import { UserProfile, UserRole, DashboardStats, LogEntry, SystemConfig, UserReport } from '../../../types';

export const useAdminDashboard = (currentUser: UserProfile) => {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'api_monitor' | 'reports' | 'system' | 'keys'>('dashboard');
    
    // Data State
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [reports, setReports] = useState<UserReport[]>([]);
    const [apiUsage, setApiUsage] = useState<any>(null);
    const [apiStatus, setApiStatus] = useState<{ 
        keyStatus: boolean[]; 
        providers: { openai: boolean; ideogram: boolean; grok: boolean; };
    }>({ 
        keyStatus: [], 
        providers: { openai: false, ideogram: false, grok: false } 
    }); 
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [config, setConfig] = useState<SystemConfig>({ maintenanceMode: false, dryRunMode: false });
    const [generatedKey, setGeneratedKey] = useState('');
    
    // Modal State
    const [securityTarget, setSecurityTarget] = useState<{uid: string, type: 'DOWNLOAD'|'DELETE'} | null>(null);

    // UI Status
    const [loadingAction, setLoadingAction] = useState(false); 
    const [dataLoading, setDataLoading] = useState(true);
    const [dataError, setDataError] = useState('');

    useEffect(() => {
        loadAllData();
    }, []);

    useEffect(() => {
        let timer: any;
        if (activeTab === 'api_monitor') {
            loadApiUsage();
            timer = setInterval(loadApiUsage, 5000);
        }
        return () => { if(timer) clearInterval(timer); };
    }, [activeTab]);

    const loadAllData = async () => {
        setDataLoading(true);
        setDataError('');
        try {
            const statsData = await getDashboardStats();
            setStats(statsData);
            setUsers(await getAllUsers());
            setLogs(await getSystemLogs());
            setConfig(getSystemConfig());
            setReports(await getUserReports());
        } catch (e: any) {
            console.error("Dashboard Load Error:", e);
            setDataError(e.message || "資料讀取失敗");
        } finally {
            setDataLoading(false);
        }
    };

    const loadApiUsage = async () => {
        try {
            const statusData = await getApiServiceStatus();
            setApiStatus(statusData);

            if (isMock) {
                setApiUsage({ key_1: 1250, key_2: 890, key_3: 450, key_4: 120, key_5: 5, total_calls: 2715 });
                return;
            }
            const doc = await db.collection('system_stats').doc('api_usage').get();
            if (doc.exists) setApiUsage(doc.data());
        } catch (e) { console.error("Load API Usage failed", e); }
    };

    const handleGenerateKey = async (type: 'RESET_QUOTA' | 'UPGRADE_ROLE', role?: UserRole) => {
        setLoadingAction(true);
        try {
            const key = await generateAdminKey(currentUser.user_id, type, role);
            setGeneratedKey(key);
            loadAllData(); // Refresh logs/stats
        } catch (e: any) {
            alert(`生成失敗: ${e.message}`);
        } finally {
            setLoadingAction(false);
        }
    };

    const handleGenerateFeatureKey = async (feature: 'ANALYTICS' | 'AUTOMATION' | 'SEO' | 'THREADS') => {
        setLoadingAction(true);
        try {
            const key = await generateAdminKey(currentUser.user_id, 'UNLOCK_FEATURE', undefined, feature);
            setGeneratedKey(key);
            loadAllData();
        } catch (e: any) {
            alert(`生成失敗: ${e.message}`);
        } finally {
            setLoadingAction(false);
        }
    };

    const handleGeneratePointsKey = async (amount: number) => {
        setLoadingAction(true);
        try {
            const key = await generateAdminKey(currentUser.user_id, 'ADD_POINTS', undefined, undefined, amount);
            setGeneratedKey(key);
            loadAllData();
        } catch (e: any) {
            alert(`生成失敗: ${e.message}`);
        } finally {
            setLoadingAction(false);
        }
    };

    const toggleDryRun = () => { 
        updateSystemConfig({ dryRunMode: !config.dryRunMode }); 
        loadAllData(); 
    };
    
    const toggleMaintenance = () => { 
        updateSystemConfig({ maintenanceMode: !config.maintenanceMode }); 
        loadAllData(); 
    };

    return {
        activeTab, setActiveTab,
        stats, users, reports, logs, config,
        apiUsage, apiStatus,
        generatedKey,
        securityTarget, setSecurityTarget,
        loadingAction, dataLoading, dataError,
        loadAllData,
        handleGenerateKey, handleGenerateFeatureKey, handleGeneratePointsKey,
        toggleDryRun, toggleMaintenance
    };
};
