
import { UserProfile, AdminKey, SystemConfig, UsageLog, SocialCard, Campaign } from '../types';

const DB_USERS = 'autosocial_db_users';
const DB_KEYS = 'autosocial_keys';
const DB_CONFIG = 'sys_config';
const DB_LOGS = 'autosocial_logs';
const DB_CONNECT_PROFILES = 'autosocial_connect_profiles'; // New
const DB_CAMPAIGNS = 'autosocial_campaigns'; // New

// Helper to get raw DB object
const getDb = (key: string) => {
    try {
        return JSON.parse(localStorage.getItem(key) || '{}');
    } catch (e) {
        return {};
    }
};

const getList = <T>(key: string): T[] => {
    try {
        return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
        return [];
    }
}

const saveDb = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

export const MockStore = {
    // Users
    getUser: (uid: string): UserProfile | null => getDb(DB_USERS)[uid] || null,
    saveUser: (user: UserProfile) => {
        const users = getDb(DB_USERS);
        users[user.user_id] = user;
        saveDb(DB_USERS, users);
    },
    getAllUsers: (): UserProfile[] => Object.values(getDb(DB_USERS)),
    findUserByEmail: (email: string): UserProfile | undefined => Object.values(getDb(DB_USERS)).find((u: any) => u.email === email) as UserProfile,
    findUserByReferral: (code: string): UserProfile | undefined => Object.values(getDb(DB_USERS)).find((u: any) => u.referralCode === code) as UserProfile,

    // Keys
    getKey: (key: string): AdminKey | null => getDb(DB_KEYS)[key] || null,
    saveKey: (keyData: AdminKey) => {
        const keys = getDb(DB_KEYS);
        keys[keyData.key] = keyData;
        saveDb(DB_KEYS, keys);
    },

    // Config
    getConfig: (): SystemConfig => JSON.parse(localStorage.getItem(DB_CONFIG) || '{"maintenanceMode": false, "dryRunMode": false}'),
    saveConfig: (config: SystemConfig) => localStorage.setItem(DB_CONFIG, JSON.stringify(config)),

    // Logs
    saveLog: (log: UsageLog) => {
       const logs = JSON.parse(localStorage.getItem(DB_LOGS) || '[]');
       logs.push(log);
       localStorage.setItem(DB_LOGS, JSON.stringify(logs));
    },

    // Connect Profiles (Social Cards)
    getConnectProfile: (userId: string): SocialCard | null => getDb(DB_CONNECT_PROFILES)[userId] || null,
    saveConnectProfile: (card: SocialCard) => {
        const profiles = getDb(DB_CONNECT_PROFILES);
        profiles[card.userId] = card;
        saveDb(DB_CONNECT_PROFILES, profiles);
    },
    getAllConnectProfiles: (): SocialCard[] => Object.values(getDb(DB_CONNECT_PROFILES)),

    // Campaigns
    getAllCampaigns: (): Campaign[] => getList(DB_CAMPAIGNS),
    saveCampaign: (campaign: Campaign) => {
        const list = getList<Campaign>(DB_CAMPAIGNS);
        const idx = list.findIndex(c => c.id === campaign.id);
        if (idx >= 0) list[idx] = campaign;
        else list.unshift(campaign);
        saveDb(DB_CAMPAIGNS, list);
    },
    deleteCampaign: (id: string) => {
        const list = getList<Campaign>(DB_CAMPAIGNS).filter(c => c.id !== id);
        saveDb(DB_CAMPAIGNS, list);
    }
};
