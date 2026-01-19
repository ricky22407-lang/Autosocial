
import { useState, useEffect } from 'react';
import { Campaign, UserProfile } from '../../../types';
import { ConnectService, CONNECT_CATEGORIES } from '../../../services/connectService';

export const useCampaigns = (user: UserProfile | null) => {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(false);
    const [applyingId, setApplyingId] = useState<string | null>(null);
    
    // Create Campaign State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newCamp, setNewCamp] = useState<Partial<Campaign>>({
        title: '', 
        description: '', 
        budget: '', 
        requirements: [], 
        category: CONNECT_CATEGORIES[0],
        targetPlatforms: [],
        acceptedSpecialties: [],
        contactInfo: { email: user?.email || '', lineId: '', phone: '' }
    });
    const [reqInput, setReqInput] = useState('');

    useEffect(() => {
        loadCampaigns();
    }, []);

    const loadCampaigns = async () => {
        setLoading(true);
        const data = await ConnectService.getCampaigns();
        setCampaigns(data);
        setLoading(false);
    };

    const handleApply = async (campaign: Campaign) => {
        if (!user) return alert("請先登入");
        
        // Tier Limits Check
        const limit = user.role === 'starter' ? 3 : (user.role === 'pro' ? 20 : 50);
        if ((user.connect_applications_used || 0) >= limit) {
            alert(`您的 ${user.role} 方案本月報名額度 (${limit}次) 已用完。請升級方案！`);
            return;
        }

        if (campaign.ownerId === user.user_id) return alert("不能報名自己的案件");

        if (!confirm(`確定要報名「${campaign.brandName}」的合作案嗎？\n\n報名成功後，廠商將會收到您的履歷卡片與聯絡方式。`)) return;

        setApplyingId(campaign.id);
        try {
            await ConnectService.applyCampaign(user.user_id, campaign.id);
            alert("✅ 報名成功！請留意 Email 通知。\n\n廠商審核通過後，將會主動聯繫您。");
            if(user) user.connect_applications_used = (user.connect_applications_used || 0) + 1;
        } catch (e: any) {
            alert(`報名失敗: ${e.message}`);
        } finally {
            setApplyingId(null);
        }
    };

    const togglePlatform = (p: string) => {
        const current = newCamp.targetPlatforms || [];
        if (current.includes(p)) setNewCamp({ ...newCamp, targetPlatforms: current.filter(x => x !== p) });
        else setNewCamp({ ...newCamp, targetPlatforms: [...current, p] });
    };

    const toggleSpecialty = (s: string) => {
        const current = newCamp.acceptedSpecialties || [];
        if (current.includes(s)) setNewCamp({ ...newCamp, acceptedSpecialties: current.filter(x => x !== s) });
        else setNewCamp({ ...newCamp, acceptedSpecialties: [...current, s] });
    };

    const handleCreateSubmit = async () => {
        if (!user) return;
        if (!newCamp.title || !newCamp.budget || !newCamp.description) return alert("請填寫完整資訊 (標題、預算、描述)");
        if (!newCamp.targetPlatforms?.length) return alert("請選擇至少一個發布平台");
        if (!newCamp.acceptedSpecialties?.length) return alert("請選擇至少一種需求形式");
        if (!newCamp.contactInfo?.email) return alert("請填寫聯絡 Email");
        
        try {
            await ConnectService.createCampaign({
                ownerId: user.user_id,
                brandName: newCamp.brandName || user.email.split('@')[0], 
                title: newCamp.title!,
                description: newCamp.description!,
                budget: newCamp.budget!,
                requirements: newCamp.requirements || [],
                acceptedSpecialties: newCamp.acceptedSpecialties || [],
                targetPlatforms: newCamp.targetPlatforms || [],
                category: newCamp.category || '其他',
                contactInfo: newCamp.contactInfo,
                deadline: Date.now() + 86400000 * 14, // 14 days default
                quotaRequired: 0,
                applicantsCount: 0,
                createdAt: Date.now(),
                isActive: true
            } as Campaign);
            
            alert("✅ 案件發佈成功！");
            setShowCreateModal(false);
            loadCampaigns();
        } catch (e: any) {
            alert("發佈失敗: " + e.message);
        }
    };

    return {
        campaigns, loading, applyingId,
        showCreateModal, setShowCreateModal,
        newCamp, setNewCamp,
        reqInput, setReqInput,
        handleApply,
        togglePlatform, toggleSpecialty, handleCreateSubmit
    };
};
