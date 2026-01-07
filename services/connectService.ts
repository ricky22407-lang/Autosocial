
import { SocialCard, Campaign, UserRole, UserProfile } from '../types';
import { db, isMock, firebase } from './firebase';
import { MockStore } from './mockStore';

// --- SHARED CONSTANTS ---
export const CONNECT_CATEGORIES = [
    '美食 (Food)', 
    '旅遊 (Travel)', 
    '美妝保養 (Beauty)', 
    '3C科技 (Tech)', 
    '攝影 (Photography)', 
    '運動健身 (Fitness)', 
    '親子育兒 (Parenting)', 
    '寵物 (Pets)', 
    '穿搭時尚 (Fashion)', 
    '商業理財 (Finance)', 
    '汽車機車 (Auto)', 
    '遊戲動漫 (Gaming)', 
    '居家裝潢 (Home)', 
    '知識教育 (Education)', 
    '生活日常 (Lifestyle)'
];

export const CONNECT_SPECIALTIES = [
    "短影音 (Reels/TikTok)",
    "深度開箱評測",
    "生活圖文",
    "知識懶人包",
    "爆文",
    "高質感攝影",
    "直播帶貨"
];

export const CONNECT_PLATFORMS = [
    "Facebook",
    "Instagram",
    "Threads",
    "YouTube",
    "TikTok",
    "Blog/Website"
];

// Map: talentId -> timestamp (for local mock testing of 3-day rule)
const localUnlockHistory: Map<string, number> = new Map();

// --- SERVICE IMPLEMENTATION ---

export const ConnectService = {
    // 1. TALENTS / SOCIAL CARDS
    getTalents: async (filterCategory?: string, filterPlatform?: string): Promise<SocialCard[]> => {
        if (isMock) {
            // Read from persistent MockStore instead of random generation
            let data = MockStore.getAllConnectProfiles();
            
            // Filter out invisible
            data = data.filter(t => t.isVisible);
            if (filterCategory && filterCategory !== '全部') {
                data = data.filter(t => t.categories.includes(filterCategory));
            }
            if (filterPlatform && filterPlatform !== '全部') {
                data = data.filter(t => t.platforms?.includes(filterPlatform));
            }
            return data.sort((a, b) => {
                if (a.isBoosted && !b.isBoosted) return -1;
                if (!a.isBoosted && b.isBoosted) return 1;
                return b.engagementRate - a.engagementRate;
            });
        }

        try {
            let query = db.collection('connect_profiles').where('isVisible', '==', true);
            if (filterCategory && filterCategory !== '全部') {
                query = query.where('categories', 'array-contains', filterCategory);
            }
            if (filterPlatform && filterPlatform !== '全部') {
                query = query.where('platforms', 'array-contains', filterPlatform);
            }
            
            const snap = await query.get();
            if (snap.empty) return [];

            const profiles = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as SocialCard));
            
            return profiles.sort((a: SocialCard, b: SocialCard) => {
                if (a.isBoosted && !b.isBoosted) return -1;
                if (!a.isBoosted && b.isBoosted) return 1;
                return b.engagementRate - a.engagementRate;
            });
        } catch (e: any) {
            console.error("Fetch Talents Failed:", e);
            return [];
        }
    },

    getMyProfile: async (userId: string): Promise<SocialCard | null> => {
        if (isMock) {
            return MockStore.getConnectProfile(userId);
        }
        try {
            const doc = await db.collection('connect_profiles').doc(userId).get();
            return doc.exists ? (doc.data() as SocialCard) : null;
        } catch (e: any) { 
            console.error("Get Profile Failed:", e);
            return null; 
        }
    },

    saveMyProfile: async (card: SocialCard) => {
        if (isMock) {
            MockStore.saveConnectProfile({
                ...card,
                updatedAt: Date.now()
            });
            return;
        }
        await db.collection('connect_profiles').doc(card.userId).set({
            ...card,
            updatedAt: Date.now()
        }, { merge: true });
    },

    // 2. CAMPAIGNS / JOBS
    getCampaigns: async (ownerId?: string): Promise<Campaign[]> => {
        if (isMock) {
            let data = MockStore.getAllCampaigns();
            if (ownerId) return data.filter(c => c.ownerId === ownerId);
            return data;
        }

        try {
            let query = db.collection('campaigns').where('isActive', '==', true);
            if (ownerId) {
                query = db.collection('campaigns').where('ownerId', '==', ownerId); 
            } else {
                query = query.orderBy('createdAt', 'desc');
            }
            
            const snap = await query.get();
            return snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Campaign));
        } catch (e: any) {
            console.error("Fetch Campaigns Failed", e);
            return [];
        }
    },

    createCampaign: async (campaign: Omit<Campaign, 'id'>) => {
        if (isMock) {
            const newCamp = { ...campaign, id: `camp_${Date.now()}` };
            MockStore.saveCampaign(newCamp as Campaign);
            return;
        }
        await db.collection('campaigns').add(campaign);
    },

    deleteCampaign: async (id: string) => {
        if(isMock) {
            MockStore.deleteCampaign(id);
            return;
        }
        await db.collection('campaigns').doc(id).delete();
    },

    // 3. ACTIONS & UNLOCKS (New 3-Day Rule)
    unlockTalentContact: async (userId: string, talentId: string): Promise<boolean> => {
        if (isMock) {
            localUnlockHistory.set(talentId, Date.now());
            return true;
        }
        
        await db.collection('connect_unlocks').add({
            userId,
            talentId,
            timestamp: Date.now()
        });
        return true;
    },

    // New: Fetch active unlocks for a user
    getActiveUnlocks: async (userId: string): Promise<{ talentId: string, unlockedAt: number }[]> => {
        const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
        const validThreshold = Date.now() - THREE_DAYS_MS;

        if (isMock) {
            const active: { talentId: string, unlockedAt: number }[] = [];
            localUnlockHistory.forEach((timestamp, tid) => {
                if (timestamp > validThreshold) active.push({ talentId: tid, unlockedAt: timestamp });
            });
            return active;
        }

        try {
            const snap = await db.collection('connect_unlocks')
                .where('userId', '==', userId)
                .get();
                
            return snap.docs
                .map((d: any) => {
                    const data = d.data();
                    return { talentId: data.talentId, unlockedAt: data.timestamp };
                })
                .filter((item: any) => item.unlockedAt > validThreshold)
                .sort((a: any, b: any) => b.unlockedAt - a.unlockedAt);

        } catch (e: any) {
            console.error("Get Active Unlocks Failed", e);
            return [];
        }
    },

    applyCampaign: async (userId: string, campaignId: string): Promise<boolean> => {
        if (isMock) await new Promise(r => setTimeout(r, 800));
        
        if (!isMock) {
            const existing = await db.collection('campaign_applications')
                .where('userId', '==', userId)
                .where('campaignId', '==', campaignId)
                .get();
                
            if (!existing.empty) throw new Error("您已投遞過此案件");

            await db.collection('campaign_applications').add({
                userId,
                campaignId,
                status: 'pending',
                timestamp: Date.now()
            });
            
            await db.collection('campaigns').doc(campaignId).update({
                applicantsCount: firebase.firestore.FieldValue.increment(1)
            });
        }
        
        return true;
    },
    
    boostProfile: async (userId: string): Promise<boolean> => {
        // Boost for 10 days
        const DURATION = 10 * 24 * 60 * 60 * 1000;
        const expiresAt = Date.now() + DURATION;

        if (isMock) {
            const t = MockStore.getConnectProfile(userId);
            if(t) {
                t.isBoosted = true;
                t.boostExpiresAt = expiresAt;
                MockStore.saveConnectProfile(t);
            }
            return true;
        }
        
        await db.collection('connect_profiles').doc(userId).update({
            isBoosted: true,
            boostExpiresAt: expiresAt
        });
        return true;
    }
};
