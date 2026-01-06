
import { SocialCard, Campaign, UserRole, UserProfile } from '../types';
import { db, isMock } from './firebase';

// --- MOCK DATA (Legacy & Fallback) ---
const NAMES = ['Alice', 'Bob', 'Charlie', 'David', 'Eva', 'Frank', 'Grace', 'Hannah', 'Ivy', 'Jack'];
const CATEGORIES = ['美食', '旅遊', '美妝', '3C', '攝影', '健身', '親子', '寵物'];
const TAGS = ['#吃貨', '#探店', '#開箱', '#穿搭', '#日常', '#貓奴', '#新手爸媽', '#健身日記', '#科技新知'];

const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const generateMockTalents = (count: number): SocialCard[] => {
    return Array.from({ length: count }).map((_, i) => {
        const isBoosted = Math.random() > 0.8;
        const role = isBoosted ? 'business' : (Math.random() > 0.5 ? 'pro' : 'starter');
        const category = getRandomItem(CATEGORIES);
        const tags = [category, getRandomItem(TAGS), getRandomItem(TAGS)];
        
        return {
            id: `talent_${i}`,
            userId: `u_${i}`,
            displayName: `${getRandomItem(NAMES)} ${isBoosted ? '👑' : ''}`,
            role: role as UserRole,
            tags,
            categories: [category],
            followersCount: getRandomInt(500, 50000),
            engagementRate: parseFloat((Math.random() * 5 + 1).toFixed(2)),
            priceRange: `$${getRandomInt(5, 20) * 100} - $${getRandomInt(30, 80) * 100}`,
            bio: `嗨！我是${category}愛好者，喜歡分享真實的體驗。歡迎廠商邀約合作！`,
            isBoosted,
            isVisible: true,
            contactInfo: {
                email: `user${i}@example.com`,
                lineId: `line_${i}`
            },
            avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i}&backgroundColor=b6e3f4`
        };
    });
};

export const generateMockCampaigns = (count: number): Campaign[] => {
    return Array.from({ length: count }).map((_, i) => ({
        id: `camp_${i}`,
        ownerId: `brand_${i}`,
        brandName: `Brand ${String.fromCharCode(65 + i)}`,
        title: `【${getRandomItem(CATEGORIES)}】新品推廣體驗大使募集中`,
        description: `我們是知名${getRandomItem(CATEGORIES)}品牌，正在尋找熱愛分享的你！只要拍攝 3 張照片 + 200 字心得，即可獲得正貨一組及稿費。`,
        budget: `$${getRandomInt(1, 5) * 1000} / 篇`,
        requirements: ['IG 追蹤 > 1000', '需公開帳號', '不刪文'],
        category: getRandomItem(CATEGORIES),
        deadline: Date.now() + getRandomInt(3, 30) * 24 * 60 * 60 * 1000,
        quotaRequired: 0,
        applicantsCount: getRandomInt(0, 50),
        createdAt: Date.now(),
        isActive: true
    }));
};

let mockTalents = generateMockTalents(12);
let mockCampaigns = generateMockCampaigns(5);
const unlockedTalents: Set<string> = new Set(); 

// --- SERVICE IMPLEMENTATION ---

export const ConnectService = {
    // 1. TALENTS / SOCIAL CARDS
    getTalents: async (filterCategory?: string): Promise<SocialCard[]> => {
        if (isMock) {
            await new Promise(r => setTimeout(r, 500)); 
            let data = [...mockTalents];
            // Filter out invisible if mock
            data = data.filter(t => t.isVisible);
            if (filterCategory) {
                data = data.filter(t => t.categories.includes(filterCategory));
            }
            return data.sort((a, b) => {
                if (a.isBoosted && !b.isBoosted) return -1;
                if (!a.isBoosted && b.isBoosted) return 1;
                return b.engagementRate - a.engagementRate;
            });
        }

        try {
            let query = db.collection('connect_profiles').where('isVisible', '==', true);
            if (filterCategory) {
                query = query.where('categories', 'array-contains', filterCategory);
            }
            
            const snap = await query.get();
            const profiles = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as SocialCard));
            
            // Client-side sort for Boosted (Firestore sort limit)
            return profiles.sort((a: SocialCard, b: SocialCard) => {
                if (a.isBoosted && !b.isBoosted) return -1;
                if (!a.isBoosted && b.isBoosted) return 1;
                return b.engagementRate - a.engagementRate;
            });
        } catch (e) {
            console.error("Fetch Talents Failed:", e);
            return [];
        }
    },

    getMyProfile: async (userId: string): Promise<SocialCard | null> => {
        if (isMock) {
            // Return dummy profile if mock
            return mockTalents.find(t => t.userId === userId) || null;
        }
        try {
            const doc = await db.collection('connect_profiles').doc(userId).get();
            return doc.exists ? (doc.data() as SocialCard) : null;
        } catch (e) { return null; }
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
                query = db.collection('campaigns').where('ownerId', '==', ownerId); // Show all including inactive for owner
            } else {
                query = query.orderBy('createdAt', 'desc'); // Only active for public
            }
            
            const snap = await query.get();
            return snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Campaign));
        } catch (e) {
            console.error("Fetch Campaigns Failed", e);
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

    // 3. ACTIONS
    unlockTalentContact: async (userId: string, talentId: string): Promise<boolean> => {
        // In real app: create a record in 'connect_unlocks' collection
        unlockedTalents.add(talentId); // Local state for immediate UI
        
        if (!isMock) {
            await db.collection('connect_unlocks').add({
                userId,
                talentId,
                timestamp: Date.now()
            });
        }
        return true;
    },

    isUnlocked: (talentId: string): boolean => {
        // In real app, we'd load user's unlock list on init. 
        // For now, simple set check (client-session only).
        return unlockedTalents.has(talentId);
    },

    applyCampaign: async (userId: string, campaignId: string): Promise<boolean> => {
        if (isMock) await new Promise(r => setTimeout(r, 800));
        
        if (!isMock) {
            // Check dup
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
            
            // Increment count
            await db.collection('campaigns').doc(campaignId).update({
                applicantsCount: (require('firebase/firestore').FieldValue || db.app.firebase_.firestore.FieldValue).increment(1)
            });
        }
        
        return true;
    },
    
    boostProfile: async (userId: string): Promise<boolean> => {
        if (isMock) {
            const t = mockTalents.find(t => t.userId === userId);
            if(t) t.isBoosted = true;
            return true;
        }
        
        const expiresAt = Date.now() + 5 * 24 * 60 * 60 * 1000; // 5 days
        await db.collection('connect_profiles').doc(userId).update({
            isBoosted: true,
            boostExpiresAt: expiresAt
        });
        return true;
    }
};
