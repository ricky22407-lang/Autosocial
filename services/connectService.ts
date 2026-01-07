
import { SocialCard, Campaign, UserRole, UserProfile } from '../types';
import { db, isMock, firebase } from './firebase';

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

// --- MOCK DATA (Legacy & Fallback) ---
const NAMES = ['Alice', 'Bob', 'Charlie', 'David', 'Eva', 'Frank', 'Grace', 'Hannah', 'Ivy', 'Jack'];
const TAGS = ['#吃貨', '#探店', '#開箱', '#穿搭', '#日常', '#貓奴', '#新手爸媽', '#健身日記', '#科技新知'];

const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const getRandomSubset = <T>(arr: T[], max: number): T[] => {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, getRandomInt(1, max));
};

export const generateMockTalents = (count: number): SocialCard[] => {
    return Array.from({ length: count }).map((_, i) => {
        const isBoosted = Math.random() > 0.8;
        const role = isBoosted ? 'business' : (Math.random() > 0.5 ? 'pro' : 'starter');
        const category = getRandomItem(CONNECT_CATEGORIES);
        const tags = [category, getRandomItem(TAGS), getRandomItem(TAGS)];
        const platforms = getRandomSubset(CONNECT_PLATFORMS, 3);
        const specialties = getRandomSubset(CONNECT_SPECIALTIES, 3);
        
        return {
            id: `talent_${i}`,
            userId: `u_${i}`,
            displayName: `${getRandomItem(NAMES)} ${isBoosted ? '👑' : ''}`,
            role: role as UserRole,
            tags,
            categories: [category],
            specialties,
            platforms,
            followersCount: getRandomInt(500, 50000),
            engagementRate: parseFloat((Math.random() * 5 + 1).toFixed(2)),
            
            // New Mock Data
            ytAvgViews: platforms.includes('YouTube') ? getRandomInt(1000, 50000) : undefined,
            tiktokAvgViews: platforms.includes('TikTok') ? getRandomInt(5000, 100000) : undefined,
            websiteAvgViews: platforms.includes('Blog/Website') ? getRandomInt(500, 20000) : undefined,

            priceRange: `${getRandomInt(5, 20) * 100} - ${getRandomInt(30, 80) * 100}`,
            bio: `嗨！我是${category.split(' ')[0]}愛好者，喜歡分享真實的體驗。歡迎廠商邀約合作！`,
            isBoosted,
            isVisible: true,
            contactInfo: {
                email: `user${i}@example.com`,
                lineId: `line_${i}`,
                phone: `0912-345-${100+i}`
            },
            avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i}&backgroundColor=b6e3f4`
        };
    });
};

export const generateMockCampaigns = (count: number): Campaign[] => {
    return Array.from({ length: count }).map((_, i) => {
        const cat = getRandomItem(CONNECT_CATEGORIES);
        const platforms = getRandomSubset(CONNECT_PLATFORMS, 2);
        const acceptedSpecialties = getRandomSubset(CONNECT_SPECIALTIES, 2);
        
        return {
            id: `camp_${i}`,
            ownerId: `brand_${i}`,
            brandName: `Brand ${String.fromCharCode(65 + i)}`,
            title: `【${cat.split(' ')[0]}】新品推廣體驗大使募集中`,
            description: `我們是知名${cat.split(' ')[0]}品牌，正在尋找熱愛分享的你！只要拍攝 3 張照片 + 200 字心得，即可獲得正貨一組及稿費。`,
            budget: `$${getRandomInt(1, 5) * 1000} / 篇`,
            requirements: ['IG 追蹤 > 1000', '需公開帳號', '不刪文'],
            acceptedSpecialties,
            targetPlatforms: platforms,
            contactInfo: {
                email: `brand_${i}@brand.com`,
                lineId: `brand_line_${i}`,
                phone: `02-2345-${1000+i}`
            },
            category: cat,
            deadline: Date.now() + getRandomInt(3, 30) * 24 * 60 * 60 * 1000,
            quotaRequired: 0,
            applicantsCount: getRandomInt(0, 50),
            createdAt: Date.now(),
            isActive: true
        };
    });
};

let mockTalents = generateMockTalents(12);
let mockCampaigns = generateMockCampaigns(5);
// Map: talentId -> timestamp (for local mock testing of 3-day rule)
const localUnlockHistory: Map<string, number> = new Map();

// --- SERVICE IMPLEMENTATION ---

export const ConnectService = {
    // 1. TALENTS / SOCIAL CARDS
    getTalents: async (filterCategory?: string, filterPlatform?: string): Promise<SocialCard[]> => {
        if (isMock) {
            await new Promise(r => setTimeout(r, 500)); 
            let data = [...mockTalents];
            // Filter out invisible if mock
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
            
            // Client-side sort for Boosted (Firestore sort limit)
            return profiles.sort((a: SocialCard, b: SocialCard) => {
                if (a.isBoosted && !b.isBoosted) return -1;
                if (!a.isBoosted && b.isBoosted) return 1;
                return b.engagementRate - a.engagementRate;
            });
        } catch (e: any) {
            console.error("Fetch Talents Failed:", e);
            if (e.code === 'permission-denied') {
                console.warn("⚠️ Firestore Permission Error: Please update security rules in Firebase Console.");
            }
            return [];
        }
    },

    getMyProfile: async (userId: string): Promise<SocialCard | null> => {
        if (isMock) {
            return mockTalents.find(t => t.userId === userId) || null;
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
            const idx = mockTalents.findIndex(t => t.userId === card.userId);
            if (idx >= 0) mockTalents[idx] = card;
            else mockTalents.unshift(card);
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
            await new Promise(r => setTimeout(r, 500));
            if (ownerId) return mockCampaigns.filter(c => c.ownerId === ownerId);
            return [...mockCampaigns];
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
            if (e.code === 'permission-denied') {
                console.warn("⚠️ Firestore Permission Error: Please update security rules.");
            }
            return [];
        }
    },

    createCampaign: async (campaign: Omit<Campaign, 'id'>) => {
        if (isMock) {
            const newCamp = { ...campaign, id: `camp_new_${Date.now()}` };
            mockCampaigns.unshift(newCamp);
            return;
        }
        await db.collection('campaigns').add(campaign);
    },

    deleteCampaign: async (id: string) => {
        if(isMock) {
            mockCampaigns = mockCampaigns.filter(c => c.id !== id);
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
            // Firestore Query: SIMPLIFIED to avoid "Requires Index" error
            // We just fetch by userId and filter the rest in memory (client-side)
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
        
        if (isMock) {
            const t = mockTalents.find(t => t.userId === userId);
            if(t) {
                t.isBoosted = true;
                t.boostExpiresAt = Date.now() + DURATION;
            }
            return true;
        }
        
        const expiresAt = Date.now() + DURATION;
        await db.collection('connect_profiles').doc(userId).update({
            isBoosted: true,
            boostExpiresAt: expiresAt
        });
        return true;
    }
};
