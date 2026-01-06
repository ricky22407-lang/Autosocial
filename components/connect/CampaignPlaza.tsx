
import React, { useState, useEffect } from 'react';
import { Campaign, UserProfile } from '../../types';
import { ConnectService, CONNECT_CATEGORIES, CONNECT_SPECIALTIES, CONNECT_PLATFORMS } from '../../services/connectService';
import { checkAndUseQuota } from '../../services/authService';

interface Props {
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const CampaignPlaza: React.FC<Props> = ({ user, onQuotaUpdate }) => {
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
        acceptedSpecialties: []
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

        if (!confirm(`確定要報名「${campaign.brandName}」的合作案嗎？\n\n報名成功後，廠商將會收到您的履歷卡片。`)) return;

        setApplyingId(campaign.id);
        try {
            await ConnectService.applyCampaign(user.user_id, campaign.id);
            alert("✅ 報名成功！請留意 Email 通知。");
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

    const canCreate = user && ['starter', 'pro', 'business', 'admin'].includes(user.role);

    return (
        <div className="space-y-6 animate-fade-in relative">
            <div className="flex justify-between items-center mb-4">
                <p className="text-gray-400 text-sm">瀏覽所有發案，尋找合作機會。</p>
                {canCreate && (
                    <button onClick={() => setShowCreateModal(true)} className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg hover:scale-105 transition-transform text-sm">
                        + 發佈新案件
                    </button>
                )}
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-500">
                    <div className="loader border-t-purple-500 mb-4 mx-auto"></div>
                    搜尋合作機會中...
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {campaigns.length === 0 && <div className="text-center text-gray-500 py-10">目前沒有公開的合作案。</div>}
                    {campaigns.map(camp => (
                        <div key={camp.id} className="bg-card rounded-xl p-6 border border-gray-700 hover:border-purple-500/50 transition-all flex flex-col md:flex-row gap-6 items-start">
                            {/* Left: Brand Info */}
                            <div className="md:w-48 flex-shrink-0">
                                <div className="w-12 h-12 bg-purple-900/50 rounded-lg flex items-center justify-center text-xl font-bold text-purple-300 mb-3 border border-purple-500/30">
                                    {camp.brandName[0]}
                                </div>
                                <h3 className="font-bold text-white text-lg">{camp.brandName}</h3>
                                <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded mt-2 inline-block">
                                    {camp.category}
                                </span>
                            </div>

                            {/* Middle: Details */}
                            <div className="flex-1">
                                <h4 className="text-xl font-black text-white mb-2">{camp.title}</h4>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {camp.targetPlatforms?.map(p => (
                                        <span key={p} className={`text-[10px] px-2 py-0.5 rounded border font-bold ${p==='Threads' ? 'bg-black text-white border-white' : 'bg-blue-900/50 text-blue-200 border-blue-500/30'}`}>{p}</span>
                                    ))}
                                </div>
                                <p className="text-sm text-gray-400 mb-4 line-clamp-2">{camp.description}</p>
                                
                                {/* Specialties Tags */}
                                <div className="flex flex-wrap gap-1 mb-2">
                                    {camp.acceptedSpecialties?.map((spec, i) => (
                                        <span key={i} className="text-[10px] bg-purple-900/30 text-purple-200 border border-purple-500/30 px-2 py-0.5 rounded">
                                            {spec}
                                        </span>
                                    ))}
                                </div>

                                {/* Custom Requirements */}
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {camp.requirements.map((req, i) => (
                                        <span key={i} className="text-xs bg-black/30 border border-gray-700 text-gray-300 px-2 py-1 rounded">
                                            {req}
                                        </span>
                                    ))}
                                </div>

                                <div className="flex gap-6 text-xs text-gray-500">
                                    <span>截止: {new Date(camp.deadline).toLocaleDateString()}</span>
                                    <span>已應徵: {camp.applicantsCount} 人</span>
                                </div>
                            </div>

                            {/* Right: Action */}
                            <div className="md:w-40 flex-shrink-0 flex flex-col items-end justify-between h-full gap-4">
                                <div className="text-right">
                                    <p className="text-xs text-gray-500 uppercase tracking-widest">預算酬勞</p>
                                    <p className="text-2xl font-black text-purple-400">{camp.budget}</p>
                                </div>
                                <button 
                                    onClick={() => handleApply(camp)}
                                    disabled={!!applyingId || (!!user && camp.ownerId === user.user_id)}
                                    className={`w-full font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center ${user && camp.ownerId === user.user_id ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-white text-black hover:bg-gray-200'}`}
                                >
                                    {applyingId === camp.id ? '提交中...' : (user && camp.ownerId === user.user_id ? '我的案件' : '我要報名')}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Campaign Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] p-4 backdrop-blur-sm">
                    <div className="bg-card p-8 rounded-2xl border border-gray-600 max-w-2xl w-full relative shadow-2xl overflow-y-auto max-h-[90vh]">
                        <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>
                        <h3 className="text-xl font-bold text-white mb-6">發佈合作需求</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                            <div className="md:col-span-2">
                                <label className="text-xs text-gray-400 block mb-1">案件標題 *</label>
                                <input value={newCamp.title} onChange={e => setNewCamp({...newCamp, title: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" placeholder="例如：新品試吃體驗" />
                            </div>
                            
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">預算/酬勞 *</label>
                                <input value={newCamp.budget} onChange={e => setNewCamp({...newCamp, budget: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" placeholder="例如：$1,000 / 篇" />
                            </div>
                            
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">品牌名稱</label>
                                <input value={newCamp.brandName} onChange={e => setNewCamp({...newCamp, brandName: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white" />
                            </div>

                            <div>
                                <label className="text-xs text-gray-400 block mb-1">類別</label>
                                <select value={newCamp.category} onChange={e => setNewCamp({...newCamp, category: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white">
                                    {CONNECT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="text-xs text-gray-400 block mb-2">指定發布平台 (可複選) *</label>
                            <div className="flex flex-wrap gap-2">
                                {CONNECT_PLATFORMS.map(p => (
                                    <button 
                                        key={p} 
                                        onClick={() => togglePlatform(p)}
                                        className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${newCamp.targetPlatforms?.includes(p) ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-400 border-gray-600'}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="text-xs text-gray-400 block mb-2">需求形式 (可複選) *</label>
                            <div className="flex flex-wrap gap-2">
                                {CONNECT_SPECIALTIES.map(s => (
                                    <button 
                                        key={s} 
                                        onClick={() => toggleSpecialty(s)}
                                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${newCamp.acceptedSpecialties?.includes(s) ? 'bg-purple-600 text-white border-purple-600' : 'bg-transparent text-gray-400 border-gray-600'}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="text-xs text-gray-400 block mb-1">案件詳情 *</label>
                            <textarea value={newCamp.description} onChange={e => setNewCamp({...newCamp, description: e.target.value})} className="w-full bg-dark border border-gray-600 rounded p-2 text-white h-20 text-sm" placeholder="詳細說明合作內容、產品特色、交稿時間..." />
                        </div>

                        <div>
                            <label className="text-xs text-gray-400 block mb-1">其他條件 (按 Enter 新增)</label>
                            <div className="flex gap-2 mb-2">
                                <input value={reqInput} onChange={e => setReqInput(e.target.value)} onKeyDown={e => {if(e.key==='Enter'){setNewCamp({...newCamp, requirements: [...(newCamp.requirements||[]), reqInput]}); setReqInput('');}}} className="flex-1 bg-dark border border-gray-600 rounded p-2 text-white text-xs" placeholder="例如：粉絲數 > 2000" />
                                <button onClick={() => {setNewCamp({...newCamp, requirements: [...(newCamp.requirements||[]), reqInput]}); setReqInput('');}} className="bg-gray-700 px-3 rounded text-xs text-white">Add</button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {newCamp.requirements?.map((r, i) => (
                                    <span key={i} className="bg-black/30 text-gray-300 text-[10px] px-2 py-1 rounded flex items-center gap-1">
                                        {r}
                                        <button onClick={() => setNewCamp({...newCamp, requirements: newCamp.requirements?.filter((_, idx) => idx !== i)})} className="hover:text-white">×</button>
                                    </span>
                                ))}
                            </div>
                        </div>

                        <button onClick={handleCreateSubmit} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl mt-6 shadow-lg">確認發佈</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CampaignPlaza;
