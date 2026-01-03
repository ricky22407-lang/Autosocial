
import React, { useState, useEffect } from 'react';
import { UserProfile, ProjectApplication, MarketplaceInvitation } from '../../types';
import { fetchMyApplications, respondToInvitation } from '../../services/authService';

interface Props {
    user: UserProfile;
    identity: 'brand' | 'influencer';
    onRefresh: () => void;
}

const MarketplaceInbox: React.FC<Props> = ({ user, identity, onRefresh }) => {
    const [myApps, setMyApps] = useState<ProjectApplication[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeSubTab, setActiveSubTab] = useState<'INVITES' | 'APPLICATIONS'>(identity === 'influencer' ? 'INVITES' : 'APPLICATIONS');
    const [processingId, setProcessingId] = useState<string | null>(null);

    useEffect(() => {
        if (identity === 'influencer') {
            loadMyApplications();
        }
    }, [identity, user.quota_used]);

    const loadMyApplications = async () => {
        setLoading(true);
        try {
            const data = await fetchMyApplications(user.user_id);
            setMyApps(data);
        } finally { setLoading(false); }
    };

    const handleInviteResponse = async (invId: string, status: 'accepted' | 'declined') => {
        if (!confirm(`確認要${status === 'accepted' ? '接受' : '婉拒'}此邀約嗎？`)) return;
        
        setProcessingId(invId);
        try {
            await respondToInvitation(user.user_id, invId, status);
            onRefresh(); // Refresh user profile to update invitations list
            alert("回覆已成功傳送！");
        } catch (e) {
            alert("操作失敗，請稍後再試。");
        } finally {
            setProcessingId(null);
        }
    };

    const invites = user.receivedInvitations || [];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Sub Tabs */}
            <div className="flex gap-4 border-b border-gray-800 pb-2">
                {identity === 'influencer' && (
                    <button onClick={() => setActiveSubTab('INVITES')} className={`px-4 py-2 font-bold text-sm transition-all ${activeSubTab === 'INVITES' ? 'text-primary border-b-2 border-primary' : 'text-gray-500'}`}>品牌邀約 ({invites.length})</button>
                )}
                <button onClick={() => setActiveSubTab('APPLICATIONS')} className={`px-4 py-2 font-bold text-sm transition-all ${activeSubTab === 'APPLICATIONS' ? 'text-primary border-b-2 border-primary' : 'text-gray-500'}`}>報名進度 ({identity === 'influencer' ? myApps.length : '請至發案中心查看'})</button>
            </div>

            <div className="mt-8">
                {activeSubTab === 'INVITES' && (
                    invites.length === 0 ? (
                        <div className="py-20 text-center text-gray-600 bg-dark/20 rounded-[2rem] border border-dashed border-gray-800">目前尚無品牌主動發起邀約。</div>
                    ) : (
                        <div className="space-y-4">
                            {invites.map((inv) => (
                                <div key={inv.id} className="bg-card p-6 rounded-2xl border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 group">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-primary font-black text-sm">{inv.brandName}</span>
                                            <span className="text-[10px] text-gray-500">{new Date(inv.timestamp).toLocaleString()}</span>
                                        </div>
                                        <p className="text-gray-300 text-sm italic">「{inv.message}」</p>
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        {inv.status === 'pending' ? (
                                            <>
                                                <button 
                                                    disabled={processingId === inv.id}
                                                    onClick={() => handleInviteResponse(inv.id, 'accepted')}
                                                    className="bg-primary text-black px-6 py-2 rounded-xl font-bold text-xs shadow-lg hover:scale-105 transition-all disabled:opacity-50"
                                                >
                                                    {processingId === inv.id ? '處理中...' : '接受邀約'}
                                                </button>
                                                <button 
                                                    disabled={processingId === inv.id}
                                                    onClick={() => handleInviteResponse(inv.id, 'declined')}
                                                    className="bg-gray-800 text-gray-400 px-4 py-2 rounded-xl font-bold text-xs border border-gray-700 hover:bg-gray-700"
                                                >
                                                    婉拒
                                                </button>
                                            </>
                                        ) : (
                                            <span className={`px-4 py-2 rounded-xl font-bold text-xs border ${inv.status === 'accepted' ? 'bg-green-900/20 text-green-400 border-green-500/30' : 'bg-red-900/20 text-red-400 border-red-500/30'}`}>
                                                {inv.status === 'accepted' ? '✅ 已接受' : '❌ 已婉拒'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}

                {activeSubTab === 'APPLICATIONS' && (
                    identity === 'brand' ? (
                        <div className="py-20 text-center text-gray-500 italic bg-dark/20 rounded-[2rem] border border-dashed border-gray-800">
                            品牌方請點擊上方「合作廣場」&gt;「檢視報名清單」來管理您的案子報名者並給予回覆。
                        </div>
                    ) : (
                        loading ? <div className="text-center py-20 animate-pulse text-gray-500">讀取進度中...</div> : (
                            myApps.length === 0 ? (
                                <div className="py-20 text-center text-gray-600">您尚未報名任何案件。</div>
                            ) : (
                                <div className="space-y-4">
                                    {myApps.map(app => (
                                        <div key={app.id} className="bg-card p-6 rounded-2xl border border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">專案報名</p>
                                                    <span className="text-[10px] text-gray-600 font-mono">ID: {app.id.slice(0,8)}</span>
                                                </div>
                                                <h4 className="text-white font-bold">案件編號：{app.projectId.slice(0,8)}...</h4>
                                                <p className="text-xs text-gray-400">您的報價: <span className="text-secondary font-bold">NT${app.price}</span></p>
                                            </div>
                                            <div className="text-right w-full md:w-auto">
                                                <div className={`px-4 py-2 rounded-xl text-xs font-black border inline-block ${
                                                    app.status === 'accepted' ? 'bg-green-600 text-white border-green-500 shadow-lg shadow-green-500/20' :
                                                    app.status === 'rejected' ? 'bg-red-900/30 text-red-400 border-red-500/30' :
                                                    'bg-blue-900/30 text-blue-400 border-blue-500/30'
                                                }`}>
                                                    {app.status === 'pending' ? '⌛ 品牌審核中' : app.status === 'accepted' ? '🎉 已錄取！品牌方將與您聯繫' : '❌ 很遺憾，本次未錄取'}
                                                </div>
                                                <p className="text-[9px] text-gray-600 mt-2">報名時間: {new Date(app.timestamp).toLocaleString()}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )
                    )
                )}
            </div>
        </div>
    );
};

export default MarketplaceInbox;
